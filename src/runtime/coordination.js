export class SerialQueue {
  constructor() { this.tail = Promise.resolve(); this.closed = false; }
  run(work) {
    const result = this.tail.then(() => { if (this.closed) throw new DOMException('操作已取消', 'AbortError'); return work(); });
    this.tail = result.catch(() => {});
    return result;
  }
  close() { this.closed = true; }
}

/** Serializes redraws, ignores duplicate events, and keeps form state for an unchanged source. */
export class RenderCoordinator {
  constructor() { this.queues = new Map(); this.states = new Map(); }
  async run(key, source, target, render) {
    if (!this.queues.has(key)) this.queues.set(key, new SerialQueue());
    return this.queues.get(key).run(async () => {
      const old = this.states.get(key);
      const signature = typeof source === 'string' ? source : JSON.stringify(source);
      const content = typeof source === 'string' ? source : source.raw;
      if (old?.source === signature && target.dataset.landlordRendered === old.token && target.querySelector('[data-landlord-render-marker]')) return;
      if (old?.target.querySelector('[data-landlord-render-marker]')) old.snapshot = snapshotForm(old.target);
      old?.dispose?.();
      const token = String(Date.now()) + Math.random().toString(36).slice(2);
      await render();
      if (old?.content === content && old.snapshot) restoreForm(target,old.snapshot);
      const marker = target.ownerDocument.createElement('span');
      marker.hidden = true; marker.dataset.landlordRenderMarker = token; target.append(marker);
      target.dataset.landlordRendered = token;
      const state = { source:signature,content,token,target,snapshot:snapshotForm(target) };
      const capture = () => queueMicrotask(()=>{ state.snapshot=snapshotForm(target); });
      for (const event of ['input','change','click']) target.addEventListener(event,capture);
      state.dispose=()=>{for(const event of ['input','change','click'])target.removeEventListener(event,capture)};
      this.states.set(key,state);
    });
  }
  clear() { for (const q of this.queues.values()) q.close(); for(const s of this.states.values())s.dispose?.();this.queues.clear(); this.states.clear(); }
}

function snapshotForm(target) {
  const jq=target.ownerDocument.defaultView.jQuery;
  return {
    fields:[...target.querySelectorAll('input,textarea,select,[contenteditable="true"]')].map(el=>({value:el.value,checked:el.checked,html:el.isContentEditable?el.innerHTML:null})),
    selected:[...target.querySelectorAll('.beautify-candidate-card')].map(el=>!!jq?.(el).data('selected')),
    buttons:[...target.querySelectorAll('button')].map(el=>({text:el.innerHTML,disabled:el.disabled,classes:el.className,style:el.getAttribute('style')})),
  };
}
function restoreForm(target,snapshot) {
  [...target.querySelectorAll('.beautify-candidate-card')].forEach((el,i)=>{if(snapshot.selected[i])el.click()});
  [...target.querySelectorAll('input,textarea,select,[contenteditable="true"]')].forEach((el,i)=>{
    const old=snapshot.fields[i];if(!old)return;
    if(old.value!==undefined)el.value=old.value;if(old.checked!==undefined)el.checked=old.checked;if(old.html!==null)el.innerHTML=old.html;
  });
  [...target.querySelectorAll('button')].forEach((el,i)=>{
    const old=snapshot.buttons[i];if(!old)return;
    el.innerHTML=old.text;el.disabled=old.disabled;el.className=old.classes;
    if(old.style===null)el.removeAttribute('style');else el.setAttribute('style',old.style);
  });
}

export function readWorld(helper) {
  let id = helper.getLastMessageId?.() ?? 'latest';
  if (Number.isInteger(id) && helper.getChatMessages) {
    while (id >= 0 && helper.getChatMessages(id)?.[0]?.role === 'user') id--;
  }
  return (helper.Mvu || helper.parent?.Mvu)?.getMvuData({ type: 'message', message_id: id < 0 ? 'latest' : id })?.stat_data || {};
}

export function bedroomsFrom(data) {
  return Object.entries(data?.公寓?.房间列表 || {}).filter(([, r]) => r.类型 === '卧室').map(([key, r]) => ({
    key, name: r.名称 || key, floor: r.楼层 || '', position: r.位置 || '', occupant: r.住户 || '无', isEmpty: r.住户 === '无',
  }));
}

export async function waitUntil(get, { signal, timeout = 20000, interval = 25 } = {}) {
  const start = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError');
    const result = get(); if (result) return result;
    if (Date.now() - start >= timeout) throw new Error('等待组件就绪超时');
    await new Promise((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(done, interval);
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('操作已取消', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
