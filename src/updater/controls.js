import { mountViewportPanel } from '../runtime/viewport-panel.js';
import { makeVersionFloating } from './floating.js';

const INSTANCE = Symbol.for('landlord.version-controls');

/** The owner supplies storage, release discovery and the guarded page refresh. */
export function mountVersionControls({ host, getState, refresh, apply }) {
  host[INSTANCE]?.dispose();
  const doc = host.document;
  doc.getElementById('landlord-version-controls')?.remove();
  const panel = doc.createElement('details');
  panel.id = 'landlord-version-controls';
  const style = doc.createElement('style');
  style.textContent = `
    #landlord-version-controls { position:absolute; z-index:100002; width:56px; height:56px;
      box-sizing:border-box; margin:0; padding:0; border:0; background:none; overflow:visible;
      color:#fff; font:14px/1.5 sans-serif; overflow-wrap:anywhere; }
    #landlord-version-controls > summary { display:flex; position:relative; flex-direction:column;
      align-items:center; justify-content:center; gap:1px; box-sizing:border-box;
      width:56px; height:56px; padding:0; margin:0; list-style:none; border:1px solid #cbb1ec;
      border-radius:50%; background:linear-gradient(145deg,#8968b1,#544169); color:#fff;
      box-shadow:0 4px 16px #0006; cursor:grab; touch-action:none; user-select:none; }
    #landlord-version-controls > summary::-webkit-details-marker { display:none; }
    #landlord-version-controls > summary::before { content:''; width:23px; height:23px;
      background:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9'/%3E%3C/svg%3E"); }
    #landlord-version-controls > summary::after { content:'版本'; font:10px/1.2 sans-serif; }
    #landlord-version-controls[open] > summary::after { content:'收起'; }
    #landlord-version-controls > summary:focus-visible { outline:3px solid #e6c8ff; outline-offset:3px; }
    #landlord-version-controls.is-dragging > summary { cursor:grabbing; }
    #landlord-version-controls .landlord-version-label { position:absolute; width:1px; height:1px;
      padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    #landlord-version-controls .landlord-version-body { position:absolute; box-sizing:border-box;
      width:340px; padding:12px 14px; overflow-y:auto; overscroll-behavior:contain;
      border:1px solid #897294; border-radius:14px; background:#272331;
      box-shadow:0 4px 20px #0006; }
    #landlord-version-controls .landlord-version-heading { font-weight:600; }
    #landlord-version-controls p { margin:10px 0; }
    #landlord-version-controls label { display:block; margin-bottom:5px; }
    #landlord-version-controls select { display:block; box-sizing:border-box; width:100%;
      min-height:38px; border:1px solid #a999b0; border-radius:6px; padding:6px;
      background:#fff; color:#201c27; font:inherit; }
    #landlord-version-controls .landlord-version-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    #landlord-version-controls button { min-height:38px; flex:1 1 125px; padding:6px 8px;
      border:1px solid #a999b0; border-radius:6px; background:#e9d8ef; color:#201c27;
      font:inherit; cursor:pointer; }
    #landlord-version-controls button:disabled, #landlord-version-controls select:disabled { opacity:.6; cursor:wait; }
    #landlord-version-controls [role=alert] { color:#ffb8b8; }
    #landlord-version-controls [hidden] { display:none; }
  `;
  const summary = doc.createElement('summary');
  summary.setAttribute('aria-label', '版本与更新');
  const summaryText = doc.createElement('span'); summaryText.className = 'landlord-version-label';
  summary.append(summaryText);
  const body = doc.createElement('div'); body.className = 'landlord-version-body';
  const heading = doc.createElement('div'); heading.className = 'landlord-version-heading';
  const description = doc.createElement('p');
  description.textContent = '这里选择功能发布版本。原版与二改版仍在游戏模式中另行选择。';
  const label = doc.createElement('label');
  label.htmlFor = 'landlord-version-choice'; label.textContent = '更新方式与版本';
  const select = doc.createElement('select'); select.id = label.htmlFor;
  const warning = doc.createElement('p'); warning.id = 'landlord-version-warning';
  warning.textContent = '保存后会重新加载本卡功能并关闭当前功能窗口，请先保存未完成的编辑。切换版本不会回退聊天记录或存档。跟随最新正式版会在下次启动时检查更新。';
  select.setAttribute('aria-describedby', warning.id);
  const actions = doc.createElement('div'); actions.className = 'landlord-version-actions';
  const refreshButton = doc.createElement('button');
  refreshButton.type = 'button'; refreshButton.textContent = '刷新版本列表';
  const applyButton = doc.createElement('button');
  applyButton.type = 'button'; applyButton.textContent = '保存选择并刷新';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const error = doc.createElement('p'); error.setAttribute('role', 'alert');
  actions.append(refreshButton, applyButton);
  body.append(heading, description, label, select, warning, actions, status, error);
  panel.append(style, summary, body);
  const removePanel = mountViewportPanel(host, panel, 100002);
  const floating = makeVersionFloating({host, panel, handle:summary, body});

  let disposed = false, pending = '', localError = '', lastPreference = null, draft = 'latest', autoRefreshStarted = false;
  let observedBusy = false, busyTimer;
  function render() {
    if (disposed) return;
    const state = getState();
    const preference = state.preference?.mode === 'pinned' ? state.preference.tag : 'latest';
    if (lastPreference !== preference) { draft = preference; lastPreference = preference; }
    const option = (value, text) => {
      const node = doc.createElement('option'); node.value = value; node.textContent = text;
      select.append(node);
    };
    select.replaceChildren();
    option('latest', '跟随最新正式版');
    const tags = new Set();
    for (const release of state.releases || []) {
      if (typeof release.tag !== 'string' || !release.tag || tags.has(release.tag)) continue;
      tags.add(release.tag);
      const name = release.name && release.name !== release.tag ? `${release.name}（${release.tag}）` : release.tag;
      option(release.tag, `${name}${release.prerelease ? ' · 候选版' : ''}`);
    }
    for (const tag of new Set([preference, draft])) {
      if (tag && tag !== 'latest' && !tags.has(tag)) {
        option(tag, `已选版本：${tag}（列表暂未提供）`); tags.add(tag);
      }
    }
    select.value = draft;
    summaryText.textContent = `版本与更新 · ${state.currentTag || '正在启动'}`;
    summary.title = `${summaryText.textContent}（拖动调整位置，点击展开）`;
    heading.textContent = summaryText.textContent;
    observedBusy = Boolean(state.busy);
    const busy = Boolean(pending || observedBusy);
    panel.setAttribute('aria-busy', String(busy));
    select.disabled = refreshButton.disabled = applyButton.disabled = busy;
    status.textContent = pending || state.status || '';
    status.hidden = !status.textContent;
    error.textContent = localError || state.error || '';
    error.hidden = !error.textContent;
    floating.layout();
    if (panel.open && !autoRefreshStarted && !busy) {
      autoRefreshStarted = true;
      void request('正在刷新版本列表…', refresh);
    }
  }
  async function request(message, callback) {
    if (disposed || pending || getState().busy) return;
    pending = message; localError = ''; render();
    try { await callback(); }
    catch (failure) {
      if (!disposed) localError = failure?.message || String(failure || '操作失败，请稍后重试。');
    } finally {
      if (!disposed) { pending = ''; render(); }
    }
  }
  const onChange = () => { draft = select.value; localError = ''; };
  const onRefresh = () => { void request('正在刷新版本列表…', refresh); };
  const onApply = () => {
    const preference = draft === 'latest' ? { mode: 'latest' } : { mode: 'pinned', tag: draft };
    void request('正在保存选择并准备刷新…', () => apply(preference));
  };
  select.addEventListener('change', onChange);
  panel.addEventListener('toggle', render);
  refreshButton.addEventListener('click', onRefresh);
  applyButton.addEventListener('click', onApply);
  const controls = {
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (busyTimer !== undefined) host.clearInterval(busyTimer);
      select.removeEventListener('change', onChange);
      panel.removeEventListener('toggle', render);
      refreshButton.removeEventListener('click', onRefresh);
      applyButton.removeEventListener('click', onApply);
      floating.dispose();
      removePanel();
      if (host[INSTANCE] === controls) delete host[INSTANCE];
    },
  };
  host[INSTANCE] = controls;
  render();
  // Generation may finish without an updater event. Poll only the flag; avoid
  // rebuilding a focused select while the surrounding game state is unchanged.
  busyTimer = host.setInterval(() => {
    if (!disposed && Boolean(getState().busy) !== observedBusy) render();
  }, 500);
  return controls;
}
