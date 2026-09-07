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
    #landlord-version-controls { position:fixed; bottom:12px; left:12px; z-index:100002;
      box-sizing:border-box; max-width:min(340px,calc(100vw - 24px)); padding:10px 12px;
      border:1px solid #77677e; border-radius:12px; background:#272331; color:#fff;
      font:14px/1.5 sans-serif; box-shadow:0 3px 18px #0005; overflow-wrap:anywhere;
      max-height:calc(100dvh - 24px); overflow-y:auto; }
    #landlord-version-controls summary { cursor:pointer; }
    #landlord-version-controls .landlord-version-body { width:310px; max-width:100%; }
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
    @media(max-width:640px) { #landlord-version-controls { bottom:70px; max-height:calc(100dvh - 82px); } }
  `;
  const summary = doc.createElement('summary');
  const body = doc.createElement('div'); body.className = 'landlord-version-body';
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
  body.append(description, label, select, warning, actions, status, error);
  panel.append(style, summary, body);
  doc.body.append(panel);

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
    summary.textContent = `版本与更新 · ${state.currentTag || '正在启动'}`;
    observedBusy = Boolean(state.busy);
    const busy = Boolean(pending || observedBusy);
    panel.setAttribute('aria-busy', String(busy));
    select.disabled = refreshButton.disabled = applyButton.disabled = busy;
    status.textContent = pending || state.status || '';
    status.hidden = !status.textContent;
    error.textContent = localError || state.error || '';
    error.hidden = !error.textContent;
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
      panel.remove();
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
