import { modules } from '../../.local/build/modules.js';
import { ModuleScope } from './scope.js';
import { SerialQueue, RenderCoordinator, readWorld, bedroomsFrom, waitUntil } from './coordination.js';

export const VERSION = __APP_VERSION__;
export const ORDERS = {
  original: ['S02','S04','S07','S08','S06','S09','S10','S11','S12','S13','S14','S15','S16','S17','S18','S19','S20','S21','S22','S23'],
  remix: ['S02','S25','S26','S27','S28','S29','S23'],
};
const MVU_URL = 'https://cdn.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@61010dab47bc3a08a1b626320bf7fc8c9573eca4/artifact/bundle.js';

export class LandlordRuntime {
  constructor({ helper = window, host = helper.parent, moduleMap = modules, store, content } = {}) {
    Object.assign(this, { helper, host, moduleMap, store, content });
    this.bookQueues = new Map(); this.scopes = []; this.transitions = new SerialQueue(); this.sync = new SerialQueue();
    this.render = new RenderCoordinator(); this.errors = []; this.stops = [];
    this.epoch = 0; this.running = false; this.closed = false;
    this.mode = 'original'; this.version = VERSION;
  }
  characterKey() {
    const ctx=this.host.SillyTavern?.getContext?.() || {};
    return ctx.characters?.[ctx.characterId]?.avatar || this.helper.getCurrentCharacterId?.() || 'current';
  }
  async updateBook(scope,book,updater,options) {
    if (!this.bookQueues.has(book)) this.bookQueues.set(book,new SerialQueue());
    return this.bookQueues.get(book).run(async()=>{
      scope.assertActive();
      return this.helper.updateWorldbookWith(book,async current=>{
        scope.assertActive();const next=await updater(current);scope.assertActive();return next;
      },options);
    });
  }
  identity() {
    const ctx = this.host.SillyTavern?.getContext?.() || {};
    return `${this.characterKey()}:${ctx.chatId || this.host.SillyTavern?.getCurrentChatId?.() || ''}`;
  }
  key() { return `${this.identity()}:${this.epoch}`; }
  busy() {
    const ctx = this.host.SillyTavern?.getContext?.() || {};
    const processing = (this.helper.Mvu || this.host.Mvu)?.isProcessing;
    return Boolean(this.openingBusy || ctx.isGenerating || ctx.is_send_press || (typeof processing === 'function' && processing()) || this.host.document.querySelector('#mes_stop:not([style*="display: none"])')?.offsetParent);
  }
  report(module, error) {
    if (error?.name === 'AbortError') return;
    this.errors.push({ module, message: String(error?.message || error), time: Date.now() });
    this.errors = this.errors.slice(-50);
    this.host.console.error(`[房东模拟器 ${module}]`, error);
  }
  readState() { return readWorld(this.helper); }
  getBedrooms() { return bedroomsFrom(this.readState()); }
  forScope(scope) {
    return {
      assertCurrent: () => scope.assertActive(),
      registerSchema: (register,schema) => {
        const original=this.helper.eventOn;
        this.helper.eventOn=scope.eventOn.bind(scope);
        try { return register(schema); } finally { this.helper.eventOn=original; }
      },
      getBedrooms: () => { scope.assertActive(); return this.getBedrooms(); },
      readState: () => { scope.assertActive(); return this.readState(); },
      getChatWorldbook: () => { scope.assertActive(); return this.chatWorldbook; },
      enqueueSync: job => this.sync.run(async () => { scope.assertActive(); return job(); }),
      renderMessage: (id, source, target, render) => this.render.run(`${scope.contextKey}:${id}`, source, target, async () => { scope.assertActive(); await render(); scope.assertActive(); }),
      rebuildOpening: greeting => this.rebuildOpening(scope, greeting),
    };
  }
  async initialize({ skipMvu = false } = {}) {
    const stop = () => void this.dispose();
    this.helper.addEventListener('pagehide', stop, { once:true });
    this.stops.push(() => this.helper.removeEventListener('pagehide', stop));
    await waitUntil(() => this.host.document?.body && this.host.jQuery && this.host.SillyTavern?.getContext);
    if (!skipMvu) {
      this.schemaScope = new ModuleScope({ id:'schema', host:this.host, helper:this.helper, runtime:this });
      await this.moduleMap.S01(this.schemaScope);
      await import(/* @vite-ignore */ MVU_URL);
      await waitUntil(() => this.helper.Mvu || this.host.Mvu);
      if (this.closed) throw new DOMException('启动已取消','AbortError');
    }
    const saved = this.host.localStorage.getItem(`landlord:mode:${this.characterKey()}`);
    this.mode = saved === 'remix' ? 'remix' : 'original';
    this.host.getApartmentBedrooms = () => this.getBedrooms();
    this.host.LandlordRuntime = this;
    for (const event of ['chat_id_changed', 'message_swiped', 'message_deleted']) {
      const callback = () => {
        const identity = this.identity();
        if (event === 'chat_id_changed' && identity === this.mountedIdentity) return;
        this.epoch++;
        for (const scope of this.scopes) scope.controller.abort();
        void this.restart().catch(error => this.report('切换聊天', error));
      };
      const handle = this.helper.eventOn(event, callback);
      this.stops.push(() => handle?.stop ? handle.stop() : this.helper.eventRemoveListener?.(event, callback));
    }
    await this.restart();
    return this;
  }
  async restart() {
    return this.transitions.run(async () => {
      if (this.closed) return;
      await this.stopModules();
      const ctx = this.host.SillyTavern.getContext();
      if (ctx.characterId == null && !this.helper.getCurrentCharacterId?.()) return;
      const key = this.key();
      this.mountedIdentity = this.identity();
      this.chatWorldbook = this.helper.getOrCreateChatWorldbook('current');
      await this.chatWorldbook;
      if (key !== this.key()) return;
      this.sync = new SerialQueue();
      await this.recoverOpening();
      if (key !== this.key()) return;
      try {
        for (const id of ORDERS[this.mode]) {
          if (key !== this.key()) break;
          const scope = new ModuleScope({ id, helper:this.helper, host:this.host, contextKey:key, currentContextKey:()=>this.key(), runtime:this });
          this.scopes.push(scope);
          await scope.wait(this.moduleMap[id](scope));
          if (id === 'S07' || id === 'S27') {
            const database = this.host[id === 'S07' ? 'ChatDB' : 'AptChatDB'];
            scope.own(() => database?.db?.close());
            const ready = database.init(ctx.chatId);
            ready.then(() => { if (!scope.active) database.db?.close(); }, () => {});
            await scope.wait(ready);
          }
        }
        if (key !== this.key()) { await this.stopModules(); return; }
        this.running = true;
        this.addControls();
      } catch (error) {
        this.report('启动', error);
        await this.stopModules();
        this.addControls();
        throw error;
      }
    });
  }
  async stopModules() {
    this.running = false;
    this.sync.close(); this.render.clear();
    for(const queue of this.bookQueues.values())queue.close();
    this.bookQueues.clear();
    for (const scope of this.scopes) scope.controller.abort();
    for (const scope of [...this.scopes].reverse()) await scope.dispose();
    this.scopes.length = 0;
    this.host.document.getElementById('landlord-controls')?.remove();
    this.host.getApartmentBedrooms = () => this.getBedrooms();
  }
  async setMode(mode) {
    if (!Object.hasOwn(ORDERS, mode)) throw new Error('未知版本');
    if (mode === this.mode && this.running) return;
    if (this.busy()) throw new Error('请等当前回复完成，再切换版本');
    this.mode = mode;
    this.host.localStorage.setItem(`landlord:mode:${this.characterKey()}`, mode);
    this.epoch++;
    await this.restart();
  }
  addControls() {
    const doc = this.host.document;
    doc.getElementById('landlord-controls')?.remove();
    const box = doc.createElement('details'); box.id = 'landlord-controls';
    box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:100001;background:#272331;color:#fff;padding:10px;border-radius:12px;max-width:320px;font:14px sans-serif;box-shadow:0 3px 18px #0005';
    const summary = doc.createElement('summary'); summary.textContent = `房东模拟器 · ${this.mode === 'original' ? '原版' : '二改版'} · ${VERSION}`; box.append(summary);
    const desc = doc.createElement('p'); desc.textContent = '原版与二改版各自保留手机记录。切换会关闭当前应用窗口。'; box.append(desc);
    for (const [mode,label] of [['original','使用原版'],['remix','使用二改版']]) {
      const button = doc.createElement('button'); button.textContent = label; button.disabled = mode === this.mode;
      button.onclick = async () => { button.disabled = true; try { await this.setMode(mode); } catch(e) { this.helper.toastr?.warning(e.message); button.disabled = false; } };
      box.append(button);
    }
    if (this.errors.length) { const p = doc.createElement('p'); p.textContent = `最近错误：${this.errors.at(-1).message}`; box.append(p); }
    const note = doc.createElement('p'); note.textContent = '发布版本在左下角“版本与更新”中选择；游玩过程中保持当前版本。'; box.append(note);
    doc.body.append(box);
  }
  async recoverOpening() {
    if (!this.store) return;
    const identity=this.identity();
    const key=`opening-pending:${identity}`;
    const pending=await this.store.get(key);
    if(!pending || identity!==this.identity()) return;
    const current=this.helper.getChatMessages(0)?.[0];
    if(current?.message===pending.greeting || current?.message===pending.message.message) {
      await (this.helper.Mvu || this.host.Mvu).replaceMvuData(pending.variables,{type:'message',message_id:0});
      if(identity!==this.identity()) return;
      await this.helper.setChatMessages([{message_id:0,message:pending.message.message}],{refresh:'affected'});
    } else {
      this.helper.toastr?.warning('上次更换开场未完成；当前开场已有新修改，备份已保留。');
    }
    await this.store.set(key,null);
  }
  async rebuildOpening(scope, greeting) {
    scope.assertActive();
    if (this.busy()) throw new Error('请等当前操作完成再更换开场');
    this.openingBusy=true;
    const key=`opening-pending:${this.identity()}`;
    let backup;
    try {
      const old = this.helper.getChatMessages(0)?.[0];
      if (!old) throw new Error('找不到开场消息');
      const mvu=this.helper.Mvu || this.host.Mvu;
      const oldData = structuredClone(mvu.getMvuData({ type:'message', message_id:0 }));
      const initial = (this.helper.YAML || this.host.YAML).parse(this.content.worldbook.entries.find(e => /\[initvar\]/i.test(e.comment)).content);
      const next = await mvu.parseMessage(greeting, { ...oldData, stat_data:initial });
      scope.assertActive();
      backup={message:old,variables:oldData,greeting};
      await this.store.set(`opening-backup:${this.identity()}:${Date.now()}`,backup);
      await this.store.set(key,backup);
      scope.assertActive();
      await this.helper.setChatMessages([{ message_id:0, message:greeting }], { refresh:'none' });
      scope.assertActive();
      await mvu.replaceMvuData(next || {...oldData,stat_data:initial}, { type:'message',message_id:0 });
      scope.assertActive();
      await this.helper.setChatMessages([{ message_id:0, message:greeting }], { refresh:'affected' });
      scope.assertActive();
      await this.store.set(key,null);
      this.host.refreshApartmentData?.();
      return true;
    } catch(error) {
      if(backup && scope.active && scope.contextKey===this.key()) await this.recoverOpening();
      throw error;
    } finally { this.openingBusy=false; }
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true; this.epoch++;
    this.transitions.close();
    for (const stop of this.stops.splice(0)) stop();
    await this.stopModules();
    await this.schemaScope?.dispose();
    if (this.host.LandlordRuntime === this) { delete this.host.LandlordRuntime; delete this.host.getApartmentBedrooms; }
  }
}

export async function start(options = {}) {
  const helper = options.helper || window;
  const host = options.host || helper.parent;
  await host.LandlordRuntime?.dispose?.();
  const runtime=new LandlordRuntime({ ...options, helper, host });
  try { return await runtime.initialize(options); }
  catch(error) { await runtime.dispose(); throw error; }
}
