/** Owned resources for one module. Disposing a module never clears another module's listeners. */
export class StaleScopeError extends Error {
  constructor() { super('本次操作所属的聊天或模块已经结束'); this.name = 'AbortError'; }
}

export class ModuleScope {
  constructor({ id, host, helper, contextKey, currentContextKey, runtime }) {
    Object.assign(this, { id, host, helper, contextKey, currentContextKey, runtime });
    this.active = true;
    this.helperEventOn = helper.eventOn;
    this.controller = new AbortController();
    this.cleanups = [];
    this.readyJobs = [];
    this.locals = Object.create(null);
    this.pagehide = new Set();
    this.nodes = new Set();
    this.proxies = new WeakMap();
    this.rawNodes = new WeakMap();
    this.namespace = `.landlord_${id.replace(/\W/g, '_')}`;
    this.parent = this.wrapHost(host);
    this.document = this.wrapDocument(host.document);
    this.$ = this.jquery(host.jQuery || host.$ || helper.$);
    this.window = new Proxy(Object.create(null), {
      get: (_, key) => {
        if (key === 'window' || key === 'self' || key === 'globalThis') return this.window;
        if (key === 'parent' || key === 'top') return this.parent;
        if (key === 'document') return this.document;
        if (key === 'addEventListener') return (event, fn, opts) => this.listen(helper, event, fn, opts);
        if (key === 'removeEventListener') return (event, fn, opts) => {
          if (event === 'pagehide') this.pagehide.delete(fn);
          else helper.removeEventListener(event, fn, opts);
        };
        if (Object.hasOwn(this.locals, key)) return this.locals[key];
        return this.value(key);
      },
      set: (_, key, value) => { this.locals[key] = value; return true; },
      has: (_, key) => key in this.locals || key in helper || key in host,
    });
  }

  assertActive() {
    if (!this.active || (!this.closing && this.currentContextKey && this.contextKey !== this.currentContextKey())) throw new StaleScopeError();
  }

  wait(promise) {
    this.assertActive();
    const signal=this.controller.signal;
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(new StaleScopeError());
      if(signal.aborted) { reject(new StaleScopeError()); return; }
      signal.addEventListener('abort',abort,{once:true});
      Promise.resolve(promise).then(value=>{this.assertActive();resolve(value)},reject)
        .catch(reject).finally(()=>signal.removeEventListener('abort',abort));
    });
  }

  guard(fn) {
    return (...args) => {
      if (!this.active || (this.currentContextKey && this.contextKey !== this.currentContextKey())) return;
      try {
        const result = fn(...args);
        if (result?.catch) result.catch(error => this.report(error));
        return result;
      } catch (error) { this.report(error); }
    };
  }

  report(error) {
    if (error?.name !== 'AbortError') this.runtime?.report?.(this.id, error);
  }

  own(dispose) { this.cleanups.push(dispose); return dispose; }

  listen(target, event, fn, opts) {
    if (event === 'pagehide' && (target === this.helper || target === this.window)) {
      this.pagehide.add(fn);
      return () => this.pagehide.delete(fn);
    }
    const guarded = this.guard(fn);
    target.addEventListener(event, guarded, opts);
    return this.own(() => target.removeEventListener(event, guarded, opts));
  }

  eventOn(event, callback) {
    this.assertActive();
    const guarded = this.guard(callback);
    const api = this.helperEventOn;
    if (!api) throw new Error('需要酒馆助手事件接口');
    const handle = api(event, guarded);
    const stop = () => {
      if (typeof handle?.stop === 'function') handle.stop();
      else this.helper.eventRemoveListener?.(event, guarded);
    };
    this.own(stop);
    return { stop };
  }

  timer(fn, delay, repeat, args) {
    this.assertActive();
    const schedule = repeat ? this.helper.setInterval.bind(this.helper) : this.helper.setTimeout.bind(this.helper);
    const clear = repeat ? this.helper.clearInterval.bind(this.helper) : this.helper.clearTimeout.bind(this.helper);
    const id = schedule(this.guard(() => fn(...args)), delay);
    this.own(() => clear(id));
    return id;
  }

  async fetch(input, options = {}) {
    this.assertActive();
    const ctrl = new AbortController();
    const signals = [this.controller.signal, options.signal].filter(Boolean);
    const abort = () => ctrl.abort();
    for (const signal of signals) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    const timeout = this.helper.setTimeout(() => ctrl.abort(), 90000);
    const release = () => { this.helper.clearTimeout(timeout); signals.forEach(s => s.removeEventListener('abort', abort)); };
    this.own(release);
    try {
      const response = await this.helper.fetch(input, { ...options, signal: ctrl.signal });
      this.assertActive();
      // Keep cancellation active until a body is consumed, not only until headers arrive.
      const scope = this;
      return new Proxy(response, {
        get(target, key) {
          if (['json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(key)) return async () => {
            try { const body = await target[key](); scope.assertActive(); return body; }
            catch(error) { if (ctrl.signal.aborted) throw new DOMException('请求已取消','AbortError'); throw error; }
            finally { release(); }
          };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    } catch(error) { release(); throw error; }
  }

  wrapDocument(doc) {
    const scope = this;
    return new Proxy(doc, {
      get(target, key) {
        if (['body','head','documentElement'].includes(key)) return scope.wrapEventNode(target[key]);
        if (key === 'createElement' || key === 'createElementNS') return (...args) => {
          scope.assertActive(); const node = target[key](...args); scope.nodes.add(node); return node;
        };
        if (key === 'addEventListener') return (...args) => scope.listen(target, ...args);
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? (...args) => {
          const result = v.apply(target,args.map(a=>scope.rawNodes.get(a)||a));
          return [doc.body,doc.head,doc.documentElement].includes(result) ? scope.wrapEventNode(result) : result;
        } : v;
      },
    });
  }

  wrapEventNode(node) {
    if (!node) return node;
    if (this.proxies.has(node)) return this.proxies.get(node);
    const scope=this;
    const proxy=new Proxy(node,{get(target,key){
      if(key==='addEventListener')return (...args)=>scope.listen(target,...args);
      const value=Reflect.get(target,key,target);
      return typeof value==='function' ? (...args)=>value.apply(target,args.map(a=>scope.rawNodes.get(a)||a)) : value;
    },set(target,key,value){return Reflect.set(target,key,value,target)}});
    this.proxies.set(node,proxy);this.rawNodes.set(proxy,node);return proxy;
  }

  wrapHost(target) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return target;
    if (this.proxies.has(target)) return this.proxies.get(target);
    const scope = this;
    const proxy = new Proxy(target, {
      get(object, key) {
        if (object === scope.host && (key === 'parent' || key === 'top' || key === 'window')) return scope.parent;
        if (object === scope.host && key === 'document') return scope.document;
        if (object === scope.host && (key === '$' || key === 'jQuery')) return scope.$;
        if (object === scope.host && ['fetch','setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','XMLHttpRequest','MutationObserver','ResizeObserver'].includes(key)) return scope.value(key);
        if (key === 'updateWorldbookWith' && object === scope.host) return scope.value(key);
        if (key === 'eventOn' && object === scope.host) return scope.eventOn.bind(scope);
        if (key === 'addEventListener' && object === scope.host) return (...args) => scope.listen(object, ...args);
        const value = Reflect.get(object, key, object);
        if (key === 'eventSource' && value?.on) return scope.eventSource(value);
        if (value && typeof value === 'object' && (Object.prototype.toString.call(value) === '[object Object]' || key === 'console' || key === 'SillyTavern')) return scope.wrapHost(value);
        if (typeof value === 'function' && !/^[A-Z]/.test(String(key))) return (...args) => { scope.assertActive(); const result=value.apply(object,args); return result?.then ? result.then(data=>{scope.assertActive();return data}) : result; };
        return value;
      },
      set(object, key, value) {
        scope.assertActive();
        const old = Object.getOwnPropertyDescriptor(object, key);
        Reflect.set(object, key, value, object);
        scope.own(() => {
          if (object[key] !== value) return;
          if (old) Object.defineProperty(object, key, old); else delete object[key];
        });
        return true;
      },
      deleteProperty(object, key) {
        const old = Object.getOwnPropertyDescriptor(object, key);
        Reflect.deleteProperty(object, key);
        scope.own(() => { if (old && !Object.hasOwn(object, key)) Object.defineProperty(object, key, old); });
        return true;
      },
    });
    this.proxies.set(target, proxy);
    return proxy;
  }

  eventSource(source) {
    const scope = this;
    return new Proxy(source, { get(object, key) {
      if (['on', 'makeLast', 'makeFirst', 'once'].includes(key)) return (event, fn) => {
        const guarded = scope.guard(fn);
        object[key](event, guarded);
        scope.own(() => (object.removeListener || object.off).call(object, event, guarded));
      };
      const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
    } });
  }

  jquery(base) {
    if (!base) throw new Error('需要酒馆的 jQuery');
    const scope = this;
    function wrap(collection) {
      return new Proxy(collection, {
        get(object, key) {
          if (key === 'ready') return fn => { scope.readyJobs.push(fn); return wrap(object); };
          if (['on', 'one'].includes(key)) return (events, ...args) => {
            if (typeof events === 'object') { for (const [event, fn] of Object.entries(events)) wrap(object)[key](event, ...args, fn); return wrap(object); }
            if (String(events).split(/\s+/).some(e => e.split('.')[0] === 'pagehide') && object[0] === scope.helper) {
              const fn = args.findLast(a => typeof a === 'function'); if (fn) scope.pagehide.add(fn); return wrap(object);
            }
            const names = String(events).split(/\s+/).filter(Boolean).map(e => e + scope.namespace).join(' ');
            const boundArgs = args.map(a => typeof a === 'function' ? function(...values) {
              if (!scope.active) return;
              scope.assertActive(); return a.apply(this, values);
            } : a);
            object[key](names, ...boundArgs);
            scope.own(() => object.off(scope.namespace));
            return wrap(object);
          };
          if (key === 'off') return (events = '', ...args) => {
            const names = events ? String(events).split(/\s+/).map(e => e + scope.namespace).join(' ') : scope.namespace;
            object.off(names, ...args); return wrap(object);
          };
          const value = object[key];
          if (typeof value !== 'function') return value;
          return (...args) => {
            scope.assertActive();
            const parents = ['append', 'prepend', 'before', 'after', 'html'].includes(key) ? [...object].filter(n => n === scope.host.document.body || n === scope.host.document.head) : [];
            const before = new Set(parents.flatMap(n => [...n.childNodes]));
            const result = value.apply(object, args);
            for (const parent of parents) for (const node of parent.childNodes) if (!before.has(node)) scope.nodes.add(node);
            return result?.jquery ? wrap(result) : result;
          };
        },
      });
    }
    return new Proxy(function(selector, context) {
      if (typeof selector === 'function') { scope.readyJobs.push(selector); return; }
      if (selector === scope.window) selector = scope.helper;
      if (selector === scope.document) selector = scope.host.document;
      if (selector === scope.parent) selector = scope.host;
      selector=scope.rawNodes.get(selector)||selector;
      context=scope.rawNodes.get(context)||context;
      return wrap(base(selector, context));
    }, { get(_, key) { return base[key]; } });
  }

  value(key) {
    if (Object.hasOwn(this.locals, key)) return this.locals[key];
    const scope = this;
    const bindings = {
      window: this.window, self: this.window, globalThis: this.window,
      parent: this.parent, top: this.parent, document: this.document,
      $: this.$, jQuery: this.$, landlord: this.runtime?.forScope?.(this) || this.runtime,
      SillyTavern: this.wrapHost(this.helper.SillyTavern || this.host.SillyTavern),
      console: this.wrapHost(this.host.console),
      eventOn: this.eventOn.bind(this),
      updateWorldbookWith: (book,updater,options) => this.runtime.updateBook(this,book,updater,options),
      eventOnce: (event, fn) => { let stop; const h = scope.eventOn(event, (...args) => { stop(); return fn(...args); }); stop = h.stop; return h; },
      fetch: this.fetch.bind(this),
      setTimeout: (fn, ms, ...args) => this.timer(fn, ms, false, args),
      setInterval: (fn, ms, ...args) => this.timer(fn, ms, true, args),
      clearTimeout: this.helper.clearTimeout.bind(this.helper),
      clearInterval: this.helper.clearInterval.bind(this.helper),
      requestAnimationFrame: fn => { const id = scope.helper.requestAnimationFrame(scope.guard(fn)); scope.own(() => scope.helper.cancelAnimationFrame(id)); return id; },
      getContext: () => { this.assertActive(); return this.host.SillyTavern.getContext(); },
    };
    if (Object.hasOwn(bindings, key)) return bindings[key];
    if (key === 'MutationObserver' || key === 'ResizeObserver') {
      const Base = this.helper[key];
      if (!Base) return undefined;
      return class extends Base {
        constructor(fn) { super(scope.guard(fn)); scope.own(() => this.disconnect()); }
        observe(target,...args) { return super.observe(scope.rawNodes.get(target)||target,...args); }
      };
    }
    if (key === 'XMLHttpRequest') {
      return class extends scope.helper.XMLHttpRequest { constructor() { super(); scope.own(() => this.abort()); } };
    }
    const owner = key in this.helper ? this.helper : this.host;
    const value = owner[key];
    if (typeof value !== 'function' || /^[A-Z]/.test(String(key)) || ['_', 'z'].includes(key)) return value;
    return (...args) => {
      this.assertActive();
      if (/^(update|replace|create|delete)/.test(key)) args = args.map(arg => typeof arg === 'function' ? (...values) => { this.assertActive(); return arg(...values); } : arg);
      const result = value.apply(owner, args);
      if (result?.then) return result.then(data => { this.assertActive(); return data; });
      return result;
    };
  }

  env(names) { return Object.fromEntries(names.map(name => [name, this.value(name)])); }

  async flushReady() {
    while (this.readyJobs.length) {
      const job = this.readyJobs.shift(); this.assertActive(); await job(this.$);
    }
  }

  async dispose() {
    if (!this.active) return;
    this.closing = true;
    this.controller.abort();
    // Existing pagehide hooks need their globals while doing their own cleanup.
    for (const fn of this.pagehide) { try { await fn(); } catch (error) { this.report(error); } }
    this.active = false;
    this.controller.abort();
    for (const dispose of this.cleanups.reverse()) { try { await dispose(); } catch (error) { this.report(error); } }
    for (const node of this.nodes) { try { node.remove(); } catch {} }
    this.cleanups.length = 0; this.nodes.clear(); this.pagehide.clear();
  }
}
