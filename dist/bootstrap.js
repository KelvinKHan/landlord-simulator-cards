// src/updater/store.js
var UpdateStore = class {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.promise = null;
  }
  open() {
    return this.promise ||= new Promise((resolve, reject) => {
      const request = this.indexedDB.open("LandlordSimulatorUpdates", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("kv");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.promise = null;
        reject(request.error);
      };
    });
  }
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async set(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("\u5B58\u50A8\u5DF2\u53D6\u6D88"));
    });
  }
};

// src/updater/content.js
var positive = (v) => typeof v === "number" && v > 0 ? v : null;
var clone = (value) => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalizeEntry(raw) {
  const e = raw.extensions || {};
  const result = {
    uid: raw.id,
    name: raw.comment || "",
    enabled: raw.enabled !== false,
    content: raw.content,
    strategy: { type: raw.constant ? "constant" : e.vectorized ? "vectorized" : "selective", keys: raw.keys || [], keys_secondary: { logic: ["and_any", "not_all", "not_any", "and_all"][e.selectiveLogic || 0], keys: raw.secondary_keys || [] }, scan_depth: e.scan_depth ?? "same_as_global" },
    position: { type: ["before_character_definition", "after_character_definition", "before_author_note", "after_author_note", "at_depth", "before_example_messages", "after_example_messages", "outlet"][e.position ?? (raw.position === "after_char" ? 1 : 0)], role: ["system", "user", "assistant"][e.role || 0], depth: e.depth ?? 4, order: raw.insertion_order ?? 100 },
    probability: e.useProbability === false ? 100 : e.probability ?? 100,
    recursion: { prevent_incoming: !!e.exclude_recursion, prevent_outgoing: !!e.prevent_recursion, delay_until: positive(e.delay_until_recursion) },
    effect: { sticky: positive(e.sticky), cooldown: positive(e.cooldown), delay: positive(e.delay) }
  };
  const implicit = { group: "group", group_override: "groupOverride", group_weight: "groupWeight", case_sensitive: "caseSensitive", match_whole_words: "matchWholeWords", use_group_scoring: "useGroupScoring", automation_id: "automationId", ignore_budget: "ignoreBudget", outlet_name: "outletName", triggers: "triggers", match_persona_description: "matchPersonaDescription", match_character_description: "matchCharacterDescription", match_character_personality: "matchCharacterPersonality", match_character_depth_prompt: "matchCharacterDepthPrompt", match_scenario: "matchScenario", match_creator_notes: "matchCreatorNotes" };
  for (const [from, to] of Object.entries(implicit)) if (Object.hasOwn(e, from)) result[to] = clone(e[from]);
  return result;
}
function mergeObject(local, base, remote, path, conflicts) {
  const out = clone(local);
  for (const key of /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(remote)])) {
    if (key === "enabled" || key === "uid" || key === "id" || key === "extra") continue;
    const name = `${path}.${key}`;
    if (canonical(base[key]) === canonical(remote[key])) continue;
    if (canonical(local[key]) === canonical(base[key])) {
      if (Object.hasOwn(remote, key)) out[key] = clone(remote[key]);
      else delete out[key];
    } else if (canonical(local[key]) !== canonical(remote[key])) {
      if (local[key] && base[key] && remote[key] && !Array.isArray(remote[key]) && typeof remote[key] === "object") out[key] = mergeObject(local[key], base[key], remote[key], name, conflicts);
      else conflicts.push(name);
    }
  }
  return out;
}
function mergeEntries(current, baseline, incoming, { id = "uid", name = "name" } = {}) {
  const result = clone(current);
  const conflicts = [];
  for (const next of incoming) {
    const before = baseline.find((e) => e[id] === next[id]);
    const index = result.findIndex((e) => e[id] === next[id] && (e[name] === before?.[name] || e[name] === next[name]));
    if (!before) {
      if (result.some((e) => e[id] === next[id] || e[name] === next[name])) {
        conflicts.push(`${next[name]}:\u65B0\u589E\u6761\u76EE\u51B2\u7A81`);
        continue;
      }
      result.push(clone(next));
      continue;
    }
    if (index < 0) {
      conflicts.push(`${next[name]}:\u672C\u5730\u5DF2\u5220\u9664\u6216\u6539\u540D`);
      continue;
    }
    result[index] = mergeObject(result[index], before, next, String(next[name]), conflicts);
  }
  for (const before of baseline) {
    if (incoming.some((e) => e[id] === before[id])) continue;
    const item = result.find((e) => e[id] === before[id] && e[name] === before[name]);
    if (item && canonical({ ...item, enabled: before.enabled }) === canonical(before)) item.enabled = false;
  }
  return { entries: result, conflicts };
}
async function updateContent({ api, store, content, baseline, identity, isCurrent }) {
  const ensure = () => {
    if (!isCurrent()) throw new DOMException("\u804A\u5929\u5DF2\u7ECF\u6539\u53D8\uFF0C\u53D6\u6D88\u66F4\u65B0", "AbortError");
  };
  ensure();
  const binding = api.getCharWorldbookNames("current");
  if (!binding.primary) return { conflicts: ["\u5F53\u524D\u89D2\u8272\u672A\u7ED1\u5B9A\u5185\u7F6E\u4E16\u754C\u4E66\uFF0C\u8BF7\u5148\u5BFC\u5165\u89D2\u8272\u5361\u4E16\u754C\u4E66"], commit: async () => {
  }, rollback: async () => {
  } };
  const book = binding.primary;
  const key = `content:${identity}:${book}`;
  const journalKey = `pending:${key}`;
  if (api.getWorldbookNames && !api.getWorldbookNames().includes(book)) {
    ensure();
    await api.createWorldbook(book, baseline.worldbook.entries.map(normalizeEntry));
    ensure();
  }
  const recover = async (journal2) => {
    if (!journal2) return;
    await api.updateWorldbookWith(book, (current) => mergeEntries(current, journal2.applied, journal2.prior).entries);
    await store.set(key, journal2.last);
    await store.set(journalKey, null);
  };
  await recover(await store.get(journalKey));
  ensure();
  const last = await store.get(key);
  if (last?.version === content.version) return { conflicts: [], commit: async () => {
  }, rollback: async () => {
  } };
  const original = last?.entries || baseline.worldbook.entries.map(normalizeEntry);
  const incoming = content.worldbook.entries.map(normalizeEntry);
  const conflicts = [];
  let journal;
  try {
    ensure();
    await api.updateWorldbookWith(book, async (current) => {
      ensure();
      const merged = mergeEntries(current, original, incoming);
      conflicts.push(...merged.conflicts);
      journal = { book, prior: clone(current), applied: clone(merged.entries), last: last || { version: "5.20", entries: original } };
      await store.set(`backup:${identity}:${Date.now()}`, journal);
      await store.set(journalKey, journal);
      ensure();
      return merged.entries;
    });
    ensure();
    return {
      conflicts,
      commit: async () => {
        ensure();
        await store.set(key, { version: content.version, entries: incoming });
        await store.set(journalKey, null);
      },
      rollback: () => recover(journal)
    };
  } catch (error) {
    if (journal) await recover(journal);
    throw error;
  }
}

// src/updater/release.js
var REPO = "KelvinKHan/landlord-simulator-cards";
var FALLBACK_TAG = `v${"5.21.0-rc.5"}`;
async function sha256(text) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function isReleaseTag(tag) {
  return typeof tag === "string" && tag === tag.trim() && /^v\d+\.\d+\.\d+$/.test(tag);
}
function isInstallableTag(tag) {
  return typeof tag === "string" && tag === tag.trim() && /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag);
}
function compareVersions(a, b) {
  const left = a.replace(/^v/, "").split(/[.-]/).slice(0, 3).map(Number);
  const right = b.replace(/^v/, "").split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  const stable = Number(!a.includes("-")) - Number(!b.includes("-"));
  return stable || Number(a.match(/-rc\.(\d+)$/)?.[1] || 0) - Number(b.match(/-rc\.(\d+)$/)?.[1] || 0);
}
async function fetchText(url, { fetcher = fetch, timeout = 12e3, maxBytes = 12e6 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const response = await fetcher(url, { signal: ctrl.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`\u4E0B\u8F7D\u5931\u8D25\uFF1AHTTP ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) throw new Error("\u66F4\u65B0\u6587\u4EF6\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
async function latestTag(fetcher = fetch) {
  const release = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/releases/latest`, { fetcher, maxBytes: 1e6 }));
  if (release.draft || release.prerelease || !isReleaseTag(release.tag_name)) throw new Error("\u6CA1\u6709\u53EF\u7528\u6B63\u5F0F\u7248\u672C");
  return release.tag_name;
}
async function listReleases(fetcher = fetch) {
  const releases = /* @__PURE__ */ new Map();
  for (let page = 1; page <= 5; page++) {
    const items = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { fetcher, maxBytes: 2e6 }));
    if (!Array.isArray(items)) throw new Error("\u7248\u672C\u76EE\u5F55\u683C\u5F0F\u4E0D\u6B63\u786E");
    for (const item of items) {
      const tag = item?.tag_name;
      if (item?.draft || !isInstallableTag(tag) || releases.has(tag)) continue;
      releases.set(tag, {
        tag,
        version: tag.slice(1),
        name: typeof item.name === "string" && item.name.trim() ? item.name : tag,
        prerelease: Boolean(item.prerelease) || !isReleaseTag(tag),
        publishedAt: typeof item.published_at === "string" ? item.published_at : null
      });
    }
    if (items.length < 100) break;
  }
  return [...releases.values()].sort((a, b) => compareVersions(b.tag, a.tag));
}
function assertManifest(manifest, tag) {
  if (!isInstallableTag(tag) || manifest?.format !== 1 || manifest.tag !== tag || typeof manifest.version !== "string" || `v${manifest.version}` !== tag) throw new Error("\u7248\u672C\u6E05\u5355\u4E0D\u4E00\u81F4");
}
async function assertRelease(release) {
  assertManifest(release?.manifest, release?.tag);
  for (const file of ["runtime.js", "content.json"]) {
    const text = release[file];
    const expected = release.manifest.files?.[file];
    if (typeof text !== "string" || !Number.isSafeInteger(expected?.bytes) || expected.bytes < 0 || typeof expected.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(expected.sha256) || new TextEncoder().encode(text).length !== expected.bytes || await sha256(text) !== expected.sha256) throw new Error(`${file} \u6821\u9A8C\u5931\u8D25`);
  }
  const content = JSON.parse(release["content.json"]);
  if (content?.version !== release.manifest.version || !Array.isArray(content?.worldbook?.entries)) throw new Error("\u5185\u5BB9\u5305\u7248\u672C\u4E0D\u4E00\u81F4");
}
async function validateRelease(release) {
  try {
    await assertRelease(release);
    return true;
  } catch {
    return false;
  }
}
async function downloadRelease(tag, fetcher = fetch) {
  if (!isInstallableTag(tag)) throw new Error("\u65E0\u6548\u7248\u672C\u53F7");
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${tag}/dist/`;
  const manifest = JSON.parse(await fetchText(base + "release.json", { fetcher, maxBytes: 2e4 }));
  assertManifest(manifest, tag);
  const output = { manifest, tag };
  for (const file of ["runtime.js", "content.json"]) {
    output[file] = await fetchText(base + file, { fetcher });
  }
  await assertRelease(output);
  return output;
}

// src/runtime/viewport-panel.js
function mountViewportPanel(host, panel, zIndex) {
  const doc = host.document;
  const id = `${panel.id}-viewport`;
  doc.getElementById(id)?.remove();
  let overlay = doc.getElementById("landlord-controls-overlay");
  if (!overlay) {
    overlay = doc.createElement("div");
    overlay.id = "landlord-controls-overlay";
    const hasPopover = typeof overlay.showPopover === "function";
    const position = !hasPopover && host.getComputedStyle(doc.body).position === "fixed" ? "absolute" : "fixed";
    overlay.style.cssText = `position:${position};inset:auto;top:0;left:0;margin:0;padding:0;border:0;box-sizing:border-box;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;overflow:clip;background:transparent;color:inherit;pointer-events:none;z-index:100002;`;
    const style = doc.createElement("style");
    style.textContent = "#landlord-controls-overlay::backdrop{pointer-events:none!important;background:transparent!important}";
    overlay.append(style);
    if (hasPopover) overlay.setAttribute("popover", "manual");
    doc.body.append(overlay);
    if (hasPopover) overlay.showPopover();
  }
  const layer = doc.createElement("div");
  layer.id = id;
  layer.setAttribute("data-landlord-panel-layer", "");
  layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${zIndex};`;
  panel.style.position = "absolute";
  panel.style.pointerEvents = "auto";
  layer.append(panel);
  overlay.append(layer);
  return () => {
    layer.remove();
    if (!overlay.querySelector("[data-landlord-panel-layer]")) {
      if (typeof overlay.hidePopover === "function" && overlay.matches(":popover-open")) overlay.hidePopover();
      overlay.remove();
    }
  };
}

// src/updater/floating.js
var STORAGE_KEY = "landlord:version-controls:position";
var SIZE = 56;
var GAP = 10;
var MARGIN = 8;
var clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
function makeVersionFloating({ host, panel, handle, body }) {
  const listeners = [];
  let disposed = false, frame = null, drag = null, suppressClick = false;
  function bounds() {
    const viewport = host.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    return {
      left: left + MARGIN,
      top: top + MARGIN,
      right: left + (viewport?.width || host.innerWidth) - MARGIN,
      bottom: top + (viewport?.height || host.innerHeight) - MARGIN
    };
  }
  const initial = bounds();
  let position = { x: initial.left + 4, y: Math.max(initial.top, initial.bottom - SIZE - 86) };
  try {
    const saved = JSON.parse(host.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = { x: saved.x, y: saved.y };
  } catch {
  }
  function save() {
    try {
      host.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
    }
  }
  function layout() {
    if (disposed) return;
    const viewport = bounds();
    position.x = clamp(position.x, viewport.left, viewport.right - SIZE);
    position.y = clamp(position.y, viewport.top, viewport.bottom - SIZE);
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
    panel.style.bottom = panel.style.right = "auto";
    if (!panel.open) return;
    const width = Math.min(340, viewport.right - viewport.left);
    body.style.width = `${width}px`;
    let x, y;
    if (position.x + SIZE + GAP + width <= viewport.right || position.x - GAP - width >= viewport.left) {
      body.style.maxHeight = `${viewport.bottom - viewport.top}px`;
      const height = body.getBoundingClientRect().height;
      x = position.x + SIZE + GAP + width <= viewport.right ? position.x + SIZE + GAP : position.x - GAP - width;
      y = clamp(position.y, viewport.top, viewport.bottom - height);
    } else {
      const above = position.y - GAP - viewport.top;
      const below = viewport.bottom - position.y - SIZE - GAP;
      const useAbove = above >= below;
      body.style.maxHeight = `${Math.max(1, useAbove ? above : below)}px`;
      const height = body.getBoundingClientRect().height;
      x = clamp(position.x, viewport.left, viewport.right - width);
      y = useAbove ? position.y - GAP - height : position.y + SIZE + GAP;
    }
    body.style.left = `${x - position.x}px`;
    body.style.top = `${y - position.y}px`;
  }
  function schedule() {
    if (disposed || frame !== null) return;
    frame = host.requestAnimationFrame(() => {
      frame = null;
      layout();
    });
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function start(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...position }, moved: false };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
    }
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    event.preventDefault();
    position = { x: drag.start.x + dx, y: drag.start.y + dy };
    panel.classList.add("is-dragging");
    layout();
  }
  function end(event) {
    if (!drag || event.pointerId !== drag.id) return;
    suppressClick = drag.moved;
    if (drag.moved) {
      event.preventDefault();
      save();
    }
    drag = null;
    panel.classList.remove("is-dragging");
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
    }
  }
  function cancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    suppressClick = true;
    panel.classList.remove("is-dragging");
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
    }
  }
  listen(handle, "pointerdown", start);
  listen(host.document, "pointermove", move, { passive: false });
  listen(host.document, "pointerup", end);
  listen(host.document, "pointercancel", cancel);
  listen(handle, "lostpointercapture", cancel);
  listen(handle, "click", (event) => {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    suppressClick = false;
  }, true);
  listen(panel, "toggle", () => {
    handle.setAttribute("aria-expanded", String(panel.open));
    layout();
  });
  listen(panel, "keydown", (event) => {
    if (event.key === "Escape" && panel.open && event.target.tagName !== "SELECT") {
      panel.open = false;
      handle.focus();
      event.preventDefault();
    }
  });
  listen(host, "resize", schedule);
  if (host.visualViewport) {
    listen(host.visualViewport, "resize", schedule);
    listen(host.visualViewport, "scroll", schedule);
  }
  const observer = new host.ResizeObserver(schedule);
  observer.observe(body);
  handle.setAttribute("aria-expanded", String(panel.open));
  layout();
  return {
    layout: schedule,
    dispose() {
      disposed = true;
      if (drag) {
        try {
          handle.releasePointerCapture(drag.id);
        } catch {
        }
      }
      drag = null;
      listeners.splice(0).forEach((remove) => remove());
      observer.disconnect();
      if (frame !== null) host.cancelAnimationFrame(frame);
    }
  };
}

// src/updater/controls.js
var INSTANCE = /* @__PURE__ */ Symbol.for("landlord.version-controls");
function mountVersionControls({ host, getState, refresh, apply }) {
  host[INSTANCE]?.dispose();
  const doc = host.document;
  doc.getElementById("landlord-version-controls")?.remove();
  const panel = doc.createElement("details");
  panel.id = "landlord-version-controls";
  const style = doc.createElement("style");
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
    #landlord-version-controls > summary::after { content:'\u7248\u672C'; font:10px/1.2 sans-serif; }
    #landlord-version-controls[open] > summary::after { content:'\u6536\u8D77'; }
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
  const summary = doc.createElement("summary");
  summary.setAttribute("aria-label", "\u7248\u672C\u4E0E\u66F4\u65B0");
  const summaryText = doc.createElement("span");
  summaryText.className = "landlord-version-label";
  summary.append(summaryText);
  const body = doc.createElement("div");
  body.className = "landlord-version-body";
  const heading = doc.createElement("div");
  heading.className = "landlord-version-heading";
  const description = doc.createElement("p");
  description.textContent = "\u8FD9\u91CC\u9009\u62E9\u529F\u80FD\u53D1\u5E03\u7248\u672C\u3002\u539F\u7248\u4E0E\u4E8C\u6539\u7248\u4ECD\u5728\u6E38\u620F\u6A21\u5F0F\u4E2D\u53E6\u884C\u9009\u62E9\u3002";
  const label = doc.createElement("label");
  label.htmlFor = "landlord-version-choice";
  label.textContent = "\u66F4\u65B0\u65B9\u5F0F\u4E0E\u7248\u672C";
  const select = doc.createElement("select");
  select.id = label.htmlFor;
  const warning = doc.createElement("p");
  warning.id = "landlord-version-warning";
  warning.textContent = "\u4FDD\u5B58\u540E\u4F1A\u91CD\u65B0\u52A0\u8F7D\u672C\u5361\u529F\u80FD\u5E76\u5173\u95ED\u5F53\u524D\u529F\u80FD\u7A97\u53E3\uFF0C\u8BF7\u5148\u4FDD\u5B58\u672A\u5B8C\u6210\u7684\u7F16\u8F91\u3002\u5207\u6362\u7248\u672C\u4E0D\u4F1A\u56DE\u9000\u804A\u5929\u8BB0\u5F55\u6216\u5B58\u6863\u3002\u8DDF\u968F\u6700\u65B0\u6B63\u5F0F\u7248\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u68C0\u67E5\u66F4\u65B0\u3002";
  select.setAttribute("aria-describedby", warning.id);
  const actions = doc.createElement("div");
  actions.className = "landlord-version-actions";
  const refreshButton = doc.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "\u5237\u65B0\u7248\u672C\u5217\u8868";
  const applyButton = doc.createElement("button");
  applyButton.type = "button";
  applyButton.textContent = "\u4FDD\u5B58\u9009\u62E9\u5E76\u5237\u65B0";
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const error = doc.createElement("p");
  error.setAttribute("role", "alert");
  actions.append(refreshButton, applyButton);
  body.append(heading, description, label, select, warning, actions, status, error);
  panel.append(style, summary, body);
  const removePanel = mountViewportPanel(host, panel, 100002);
  const floating = makeVersionFloating({ host, panel, handle: summary, body });
  let disposed = false, pending = "", localError = "", lastPreference = null, draft = "latest", autoRefreshStarted = false;
  let observedBusy = false, busyTimer;
  function render() {
    if (disposed) return;
    const state = getState();
    const preference = state.preference?.mode === "pinned" ? state.preference.tag : "latest";
    if (lastPreference !== preference) {
      draft = preference;
      lastPreference = preference;
    }
    const option = (value, text) => {
      const node = doc.createElement("option");
      node.value = value;
      node.textContent = text;
      select.append(node);
    };
    select.replaceChildren();
    option("latest", "\u8DDF\u968F\u6700\u65B0\u6B63\u5F0F\u7248");
    const tags = /* @__PURE__ */ new Set();
    for (const release of state.releases || []) {
      if (typeof release.tag !== "string" || !release.tag || tags.has(release.tag)) continue;
      tags.add(release.tag);
      const name = release.name && release.name !== release.tag ? `${release.name}\uFF08${release.tag}\uFF09` : release.tag;
      option(release.tag, `${name}${release.prerelease ? " \xB7 \u5019\u9009\u7248" : ""}`);
    }
    for (const tag of /* @__PURE__ */ new Set([preference, draft])) {
      if (tag && tag !== "latest" && !tags.has(tag)) {
        option(tag, `\u5DF2\u9009\u7248\u672C\uFF1A${tag}\uFF08\u5217\u8868\u6682\u672A\u63D0\u4F9B\uFF09`);
        tags.add(tag);
      }
    }
    select.value = draft;
    summaryText.textContent = `\u7248\u672C\u4E0E\u66F4\u65B0 \xB7 ${state.currentTag || "\u6B63\u5728\u542F\u52A8"}`;
    summary.title = `${summaryText.textContent}\uFF08\u62D6\u52A8\u8C03\u6574\u4F4D\u7F6E\uFF0C\u70B9\u51FB\u5C55\u5F00\uFF09`;
    heading.textContent = summaryText.textContent;
    observedBusy = Boolean(state.busy);
    const busy = Boolean(pending || observedBusy);
    panel.setAttribute("aria-busy", String(busy));
    select.disabled = refreshButton.disabled = applyButton.disabled = busy;
    status.textContent = pending || state.status || "";
    status.hidden = !status.textContent;
    error.textContent = localError || state.error || "";
    error.hidden = !error.textContent;
    floating.layout();
    if (panel.open && !autoRefreshStarted && !busy) {
      autoRefreshStarted = true;
      void request("\u6B63\u5728\u5237\u65B0\u7248\u672C\u5217\u8868\u2026", refresh);
    }
  }
  async function request(message, callback) {
    if (disposed || pending || getState().busy) return;
    pending = message;
    localError = "";
    render();
    try {
      await callback();
    } catch (failure) {
      if (!disposed) localError = failure?.message || String(failure || "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    } finally {
      if (!disposed) {
        pending = "";
        render();
      }
    }
  }
  const onChange = () => {
    draft = select.value;
    localError = "";
  };
  const onRefresh = () => {
    void request("\u6B63\u5728\u5237\u65B0\u7248\u672C\u5217\u8868\u2026", refresh);
  };
  const onApply = () => {
    const preference = draft === "latest" ? { mode: "latest" } : { mode: "pinned", tag: draft };
    void request("\u6B63\u5728\u4FDD\u5B58\u9009\u62E9\u5E76\u51C6\u5907\u5237\u65B0\u2026", () => apply(preference));
  };
  select.addEventListener("change", onChange);
  panel.addEventListener("toggle", render);
  refreshButton.addEventListener("click", onRefresh);
  applyButton.addEventListener("click", onApply);
  const controls = {
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (busyTimer !== void 0) host.clearInterval(busyTimer);
      select.removeEventListener("change", onChange);
      panel.removeEventListener("toggle", render);
      refreshButton.removeEventListener("click", onRefresh);
      applyButton.removeEventListener("click", onApply);
      floating.dispose();
      removePanel();
      if (host[INSTANCE] === controls) delete host[INSTANCE];
    }
  };
  host[INSTANCE] = controls;
  render();
  busyTimer = host.setInterval(() => {
    if (!disposed && Boolean(getState().busy) !== observedBusy) render();
  }, 500);
  return controls;
}

// src/runtime/coordination.js
async function waitUntil(get, { signal, timeout = 2e4, interval = 25 } = {}) {
  const start = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException("\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError");
    const result = get();
    if (result) return result;
    if (Date.now() - start >= timeout) throw new Error("\u7B49\u5F85\u7EC4\u4EF6\u5C31\u7EEA\u8D85\u65F6");
    await new Promise((resolve, reject) => {
      const done = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(done, interval);
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new DOMException("\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

// src/content/baseline-5.20.json
var baseline_5_20_default = {
  entries: [
    {
      id: 0,
      keys: [],
      secondary_keys: [],
      comment: "[InitVar]",
      content: '\u4E16\u754C:\n  \u5E74\u4EFD: \u795E\u542F\u5143\u5E74\n  \u65E5\u671F: 9\u670824\u65E5\n  \u661F\u671F: \u661F\u671F\u4E00\n  \u65F6\u95F4: "15:44"\n\n\u516C\u5BD3:\n  \u697C\u5C42\u5217\u8868:\n    - \u56DB\u697C\n    - \u4E09\u697C\n    - \u4E8C\u697C\n    - \u4E00\u697C\n    - \u5730\u4E0B\u4E00\u697C\n  \u623F\u95F4\u5217\u8868:\n    \u60A8\u7684\u623F\u95F4:\n      \u7C7B\u578B: \u60A8\u7684\u623F\u95F4\n      \u540D\u79F0: \u60A8\u7684\u623F\u95F4\n      \u697C\u5C42: \u4E8C\u697C\n      \u4F4D\u7F6E: 1-3\n      \u4F4F\u6237: <user>\n      \u63CF\u8FF0: \u8FD9\u662F\u60A8\u5728\u8FD9\u95F4\u516C\u5BD3\u91CC\u7684\u79C1\u4EBA\u7A7A\u95F4\n    \u5BA2\u5385:\n      \u7C7B\u578B: \u56FA\u5B9A\u8BBE\u65BD\n      \u540D\u79F0: \u5BA2\u5385\n      \u697C\u5C42: \u4E00\u697C\n      \u4F4D\u7F6E: 1-5\n      \u4F4F\u6237: \u65E0\n      \u63CF\u8FF0: \u5BBD\u655E\u8212\u9002\u7684\u516C\u5171\u5BA2\u5385\n    \u53A8\u623F:\n      \u7C7B\u578B: \u56FA\u5B9A\u8BBE\u65BD\n      \u540D\u79F0: \u53A8\u623F\n      \u697C\u5C42: \u4E00\u697C\n      \u4F4D\u7F6E: 6-8\n      \u4F4F\u6237: \u65E0\n      \u63CF\u8FF0: \u53EF\u4EE5\u5927\u5C55\u53A8\u827A\u7684\u53A8\u623F\n    \u516C\u5171\u536B\u6D74:\n      \u7C7B\u578B: \u56FA\u5B9A\u8BBE\u65BD\n      \u540D\u79F0: \u516C\u5171\u536B\u6D74\n      \u697C\u5C42: \u4E00\u697C\n      \u4F4D\u7F6E: 9-10\n      \u4F4F\u6237: \u65E0\n      \u63CF\u8FF0: \u8BBE\u5907\u9F50\u5168\u7684\u516C\u5171\u536B\u6D74\n    \u82B1\u56ED:\n      \u7C7B\u578B: \u5BA4\u5916\u533A\u57DF\n      \u540D\u79F0: \u82B1\u56ED\n      \u697C\u5C42: \u4E00\u697C\n      \u4F4D\u7F6E: outdoor-left\n      \u4F4F\u6237: \u65E0\n      \u63CF\u8FF0: \u9C9C\u82B1\u76DB\u5F00\u7684\u82B1\u56ED\uFF0C\u9002\u5408\u6563\u6B65\u548C\u653E\u677E\n    \u6CF3\u6C60:\n      \u7C7B\u578B: \u5BA4\u5916\u533A\u57DF\n      \u540D\u79F0: \u6CF3\u6C60\n      \u697C\u5C42: \u4E00\u697C\n      \u4F4D\u7F6E: outdoor-right\n      \u4F4F\u6237: \u65E0\n      \u63CF\u8FF0: \u6E05\u6F88\u7684\u5BA4\u5916\u6CF3\u6C60\uFF0C\u590F\u65E5\u7684\u6700\u4F73\u53BB\u5904\n\n\u79DF\u5BA2\u5217\u8868: {}\n\n\u5927\u5BCC\u7FC1:\n  \u7B79\u7801: 5000\n  \u56DE\u5408: 0\n  \u4F4D\u7F6E: 0\n  \u636E\u70B9: {}\n  \u961F\u4F0D: []\n  \u9053\u5177: {}\n  \u76D1\u72F1\u56DE\u5408: 0\n  \u6700\u8FD1\u4E8B\u4EF6: []\n\n\u5206\u57FA\u5730: {}\n',
      constant: false,
      selective: true,
      insertion_order: 100,
      enabled: false,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: false,
        display_index: 0,
        probability: 100,
        useProbability: true,
        depth: 0,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 1,
      keys: [],
      secondary_keys: [],
      comment: "[mvu_update]\u53D8\u91CF\u66F4\u65B0\u89C4\u5219",
      content: '---\n\u53D8\u91CF\u66F4\u65B0\u89C4\u5219:\n  \u4E16\u754C:\n    \u65F6\u95F4:\n      format: HH:MM\n      check:\n        - \u6BCF\u6B21\u4E8B\u4EF6\u63A8\u8FDB\u540E\u66F4\u65B0\u65F6\u95F4\n        - \u4FDD\u6301\u65F6\u95F4\u6D41\u901D\u5408\u7406\n    \u65E5\u671F:\n      format: M\u6708D\u65E5\n      check:\n        - \u8DE8\u5929\u65F6\u66F4\u65B0\u65E5\u671F\n        - \u540C\u65F6\u66F4\u65B0\u661F\u671F\n\n  \u516C\u5BD3:\n    \u623F\u95F4\u5217\u8868.${\u623F\u95F4\u540D}:\n      type: |-\n        {\n          \u7C7B\u578B: string;\n          \u540D\u79F0: string;\n          \u697C\u5C42: string;\n          \u4F4D\u7F6E: string;\n          \u4F4F\u6237: string;\n          \u63CF\u8FF0: string;\n        }\n      check:\n        - \u65B0\u5EFA\u3001\u6539\u9020\u3001\u62C6\u9664\u623F\u95F4\u65F6\u66F4\u65B0\n        - \u697C\u5C42\u503C\u5FC5\u987B\u662F\u697C\u5C42\u5217\u8868\u4E2D\u7684\u6709\u6548\u503C\n        - \u4F4D\u7F6E\u683C\u5F0F\u4E3A "\u8D77\u59CB-\u7ED3\u675F"(\u5982"1-3") \u6216 "outdoor-left"/"outdoor-right"\n      \u4F4F\u6237\u5B57\u6BB5\u94C1\u5219:\n        - \u4F4F\u6237\u5B57\u6BB5\u4EE3\u8868\u3010\u6C38\u4E45\u5C45\u4F4F\u5206\u914D\u3011\uFF0C\u4E0D\u662F\u79DF\u5BA2\u5F53\u524D\u4F4D\u7F6E\n        - \u3010\u53EA\u6709\u3011\u65B0\u79DF\u5BA2\u5165\u4F4F \u6216 \u79DF\u5BA2\u9000\u79DF \u65F6\u624D\u80FD\u4FEE\u6539\u4F4F\u6237\u5B57\u6BB5\n        - \u79DF\u5BA2\u4E34\u65F6\u4F7F\u7528\u5176\u4ED6\u623F\u95F4\uFF08\u505A\u996D\u3001\u770B\u7535\u89C6\u3001\u6563\u6B65\u7B49\uFF09\u7EDD\u4E0D\u4FEE\u6539\u4F4F\u6237\u5B57\u6BB5\n        - \u5408\u79DF\u65F6\u7528\u987F\u53F7\u5206\u9694\u591A\u4E2A\u59D3\u540D\uFF0C\u5982 "\u5F20\u5C0F\u96EA\u3001\u6797\u8BD7\u6DB5"\n        - \u9000\u79DF\u65F6\u4ECE\u4F4F\u6237\u5B57\u6BB5\u4E2D\u79FB\u9664\u8BE5\u79DF\u5BA2\u59D3\u540D\uFF08\u82E5\u53EA\u5269\u4E00\u4EBA\u5219\u6539\u4E3A"\u65E0"\uFF09\n\n  \u79DF\u5BA2\u5217\u8868:\n    type: |-\n      {\n        [\u79DF\u5BA2\u59D3\u540D: string]: {\n          \u5E74\u9F84: number;\n          \u5916\u8C8C: string;\n          \u804C\u4E1A: string;\n          \u6027\u683C: string;\n          \u72B6\u6001: string;\n          \u5185\u5FC3: string;\n          \u5173\u7CFB: { [\u5BF9\u8C61\u540D: string]: string };\n        }\n      }\n    check:\n      - \u65B0\u79DF\u5BA2\u5165\u4F4F\u65F6\u6DFB\u52A0\u6761\u76EE\uFF08\u5305\u542B\u6240\u6709\u5FC5\u8981\u5B57\u6BB5\uFF09\n      - \u79DF\u5BA2\u9000\u79DF\u65F6\u79FB\u9664\u6761\u76EE\n      - \u72B6\u6001\u548C\u5185\u5FC3\u968F\u5267\u60C5\u5B9E\u65F6\u66F4\u65B0\n      - \u5173\u7CFB\u53D8\u5316\u65F6\u66F4\u65B0\u5173\u7CFB\u5B57\u6BB5\n\n  \u5206\u57FA\u5730:\n    type: |-\n      {\n        [\u57FA\u5730\u540D: string]: {\n          \u63CF\u8FF0: string;\n          \u4F4F\u6237: string[];\n        }\n      }\n    check:\n      - \u5206\u57FA\u5730\u7684\u521B\u5EFA\u548C\u5220\u9664\u7531\u811A\u672C\u7BA1\u7406\uFF0CAI\u4E0D\u5E94\u81EA\u884C\u6DFB\u52A0\u6216\u5220\u9664\u57FA\u5730\n      - AI\u53EF\u4EE5\u66F4\u65B0\u5206\u57FA\u5730\u5185\u79DF\u5BA2\u7684\u4F4F\u6237\u5217\u8868\uFF08\u5982\u79DF\u5BA2\u642C\u5165\u642C\u51FA\uFF09\n      - \u5206\u57FA\u5730\u4F4F\u6237\u5FC5\u987B\u540C\u65F6\u5B58\u5728\u4E8E\u79DF\u5BA2\u5217\u8868\u4E2D',
      constant: true,
      selective: true,
      insertion_order: 998,
      enabled: true,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 4,
        exclude_recursion: true,
        display_index: 1,
        probability: 100,
        useProbability: true,
        depth: 0,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 2,
      keys: [],
      secondary_keys: [],
      comment: "[mvu_update]\u53D8\u91CF\u8F93\u51FA\u683C\u5F0F",
      content: '\u53D8\u91CF\u8F93\u51FA\u683C\u5F0F:\n  rule:\n    - you must output the update analysis and the actual update commands at once in the end of the next reply\n    - the update commands works like the **JSON Patch (RFC 6902)** standard, must be a valid JSON array containing operation objects\n    - supported operations: replace, delta, insert, remove\n    - don\'t update field names starts with `_` as they are readonly\n\n  format: |-\n    <UpdateVariable>\n    <Analysis>$(IN ENGLISH, no more than 80 words)\n    - ${calculate time passed: ...}\n    - ${analyze tenant/room changes based on current reply: ...}\n    - ${analyze relationship updates: ...}\n    </Analysis>\n    <JSONPatch>\n    [\n      { "op": "replace", "path": "${/path/to/variable}", "value": "${new_value}" },\n      { "op": "delta", "path": "${/path/to/number/variable}", "value": "${positive_or_negative_delta}" },\n      { "op": "insert", "path": "${/path/to/object/new_key}", "value": "${new_value}" },\n      { "op": "remove", "path": "${/path/to/item}" },\n      ...\n    ]\n    </JSONPatch>\n    </UpdateVariable>\n\n  examples:\n    \u65B0\u79DF\u5BA2\u5165\u4F4F: |-\n      <UpdateVariable>\n      <Analysis>\n      - Time: 2 hours passed, now 17:44\n      - New tenant: \u5F20\u5C0F\u96EA moved into \u4E09\u697C\u623F\u95F4\u4E00\n      - Room update: assign \u5F20\u5C0F\u96EA to \u4E09\u697C\u623F\u95F4\u4E00\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u4E16\u754C/\u65F6\u95F4", "value": "17:44" },\n        { "op": "insert", "path": "/\u79DF\u5BA2\u5217\u8868/\u5F20\u5C0F\u96EA", "value": { "\u5E74\u9F84": 22, "\u5916\u8C8C": "\u9ED1\u957F\u76F4\u5C11\u5973", "\u804C\u4E1A": "\u5927\u5B66\u751F", "\u6027\u683C": "\u6E29\u67D4\u5185\u5411", "\u72B6\u6001": "\u6B63\u5E38", "\u5185\u5FC3": "\u5BF9\u65B0\u73AF\u5883\u6709\u4E9B\u7D27\u5F20", "\u5173\u7CFB": { "<user>": "\u623F\u4E1C" } } },\n        { "op": "insert", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00", "value": { "\u7C7B\u578B": "\u5367\u5BA4", "\u540D\u79F0": "\u4E09\u697C\u623F\u95F4\u4E00", "\u697C\u5C42": "\u4E09\u697C", "\u4F4D\u7F6E": "1-3", "\u4F4F\u6237": "\u5F20\u5C0F\u96EA", "\u63CF\u8FF0": "\u5F20\u5C0F\u96EA\u7684\u623F\u95F4" } }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u65F6\u95F4\u6D41\u901D: |-\n      <UpdateVariable>\n      <Analysis>\n      - Time: next day morning\n      - Date change: 9\u670825\u65E5, \u661F\u671F\u4E8C\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u4E16\u754C/\u65E5\u671F", "value": "9\u670825\u65E5" },\n        { "op": "replace", "path": "/\u4E16\u754C/\u661F\u671F", "value": "\u661F\u671F\u4E8C" },\n        { "op": "replace", "path": "/\u4E16\u754C/\u65F6\u95F4", "value": "08:00" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u79DF\u5BA2\u9000\u79DF: |-\n      <UpdateVariable>\n      <Analysis>\n      - Tenant \u5F20\u5C0F\u96EA moved out\n      - Room \u4E09\u697C\u623F\u95F4\u4E00 is now empty\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "remove", "path": "/\u79DF\u5BA2\u5217\u8868/\u5F20\u5C0F\u96EA" },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u4F4F\u6237", "value": "\u65E0" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u79DF\u5BA2\u72B6\u6001\u66F4\u65B0: |-\n      <UpdateVariable>\n      <Analysis>\n      - \u5F20\u5C0F\u96EA\'s mental state changed after conversation\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u79DF\u5BA2\u5217\u8868/\u5F20\u5C0F\u96EA/\u72B6\u6001", "value": "\u5F00\u5FC3" },\n        { "op": "replace", "path": "/\u79DF\u5BA2\u5217\u8868/\u5F20\u5C0F\u96EA/\u5185\u5FC3", "value": "\u548C\u623F\u4E1C\u804A\u5F97\u5F88\u6109\u5FEB" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u65B0\u5EFA\u623F\u95F4: |-\n      <UpdateVariable>\n      <Analysis>\n      - Room creation: new bedroom at \u4E09\u697C, position 4-6\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "insert", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u65B0\u623F\u95F4", "value": { "\u7C7B\u578B": "\u5367\u5BA4", "\u540D\u79F0": "\u4E09\u697C\u65B0\u623F\u95F4", "\u697C\u5C42": "\u4E09\u697C", "\u4F4D\u7F6E": "4-6", "\u4F4F\u6237": "\u65E0", "\u63CF\u8FF0": "\u65B0\u5EFA\u7684\u5367\u5BA4" } }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u88C5\u4FEE\u7A7A\u623F\u95F4\u4E3A\u5367\u5BA4: |-\n      <UpdateVariable>\n      <Analysis>\n      - Room renovation: \u4E09\u697C\u7A7A\u623F\u95F4 -> \u5367\u5BA4\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u7A7A\u623F\u95F4/\u7C7B\u578B", "value": "\u5367\u5BA4" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u88C5\u4FEE\u4E3A\u529F\u80FD\u6027\u623F\u95F4: |-\n      <UpdateVariable>\n      <Analysis>\n      - Room renovation: \u4E09\u697C\u7A7A\u623F\u95F4 -> \u529F\u80FD\u6027\u623F\u95F4 (\u4E66\u623F)\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u7A7A\u623F\u95F4/\u7C7B\u578B", "value": "\u529F\u80FD\u6027\u623F\u95F4" },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u7A7A\u623F\u95F4/\u540D\u79F0", "value": "\u4E66\u623F" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u62C6\u9664\u623F\u95F4: |-\n      <UpdateVariable>\n      <Analysis>\n      - Room demolition: \u4E09\u697C\u4E66\u623F removed\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "remove", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u4E66\u623F" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u5408\u79DF\u5165\u4F4F: |-\n      <UpdateVariable>\n      <Analysis>\n      - New tenant: \u6797\u8BD7\u6DB5 moves into \u4E09\u697C\u623F\u95F4\u4E00 (shared with \u5F20\u5C0F\u96EA)\n      - Room update: add \u6797\u8BD7\u6DB5 to existing occupant list\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "replace", "path": "/\u4E16\u754C/\u65F6\u95F4", "value": "16:30" },\n        { "op": "insert", "path": "/\u79DF\u5BA2\u5217\u8868/\u6797\u8BD7\u6DB5", "value": { "\u5E74\u9F84": 20, "\u5916\u8C8C": "\u6E29\u67D4\u957F\u53D1\u5C11\u5973", "\u804C\u4E1A": "\u97F3\u4E50\u7CFB\u5B66\u751F", "\u6027\u683C": "\u6E29\u67D4\u5584\u826F", "\u72B6\u6001": "\u6B63\u5E38", "\u5185\u5FC3": "\u671F\u5F85\u548C\u5BA4\u53CB\u76F8\u5904", "\u5173\u7CFB": { "<user>": "\u623F\u4E1C", "\u5F20\u5C0F\u96EA": "\u5BA4\u53CB" } } },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u4F4F\u6237", "value": "\u5F20\u5C0F\u96EA\u3001\u6797\u8BD7\u6DB5" },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u63CF\u8FF0", "value": "\u5F20\u5C0F\u96EA\u548C\u6797\u8BD7\u6DB5\u7684\u5408\u79DF\u623F\u95F4" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u5408\u79DF\u623F\u9000\u79DF\u4E00\u4EBA: |-\n      <UpdateVariable>\n      <Analysis>\n      - Tenant \u6797\u8BD7\u6DB5 moved out from shared room \u4E09\u697C\u623F\u95F4\u4E00\n      - \u5F20\u5C0F\u96EA remains in the room\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "remove", "path": "/\u79DF\u5BA2\u5217\u8868/\u6797\u8BD7\u6DB5" },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u4F4F\u6237", "value": "\u5F20\u5C0F\u96EA" },\n        { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u63CF\u8FF0", "value": "\u5F20\u5C0F\u96EA\u7684\u623F\u95F4" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>\n\n    \u9519\u8BEF\u793A\u8303_\u79DF\u5BA2\u4E34\u65F6\u4F7F\u7528\u5176\u4ED6\u623F\u95F4: |-\n      \u6CE8\u610F\uFF01\u4EE5\u4E0B\u662F\u3010\u9519\u8BEF\u3011\u7684\u505A\u6CD5\uFF0C\u7EDD\u5BF9\u4E0D\u8981\u8FD9\u6837\u5199\uFF01\n      \u79DF\u5BA2\u53BB\u53A8\u623F\u505A\u996D\u3001\u53BB\u5BA2\u5385\u770B\u7535\u89C6\u7B49\u65E5\u5E38\u884C\u4E3A\uFF0C\u4E0D\u9700\u8981\u4E5F\u4E0D\u5141\u8BB8\u4FEE\u6539\u4F4F\u6237\u5B57\u6BB5\u3002\n      \u2716 \u9519\u8BEF: { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u53A8\u623F/\u4F4F\u6237", "value": "\u5F20\u5C0F\u96EA" }\n      \u2716 \u9519\u8BEF: { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u623F\u95F4\u4E00/\u4F4F\u6237", "value": "\u65E0" }\n      \u2713 \u6B63\u786E: \u4E0D\u8F93\u51FA\u4EFB\u4F55\u4F4F\u6237\u76F8\u5173\u7684\u53D8\u91CF\u66F4\u65B0\uFF0C\u53EA\u5728\u5267\u60C5\u6587\u672C\u4E2D\u63CF\u5199\u79DF\u5BA2\u7684\u884C\u52A8\n\n    \u65B0\u5EFA\u697C\u5C42: |-\n      <UpdateVariable>\n      <Analysis>\n      - Floor creation: \u4E94\u697C added above existing floors\n      </Analysis>\n      <JSONPatch>\n      [\n        { "op": "insert", "path": "/\u516C\u5BD3/\u697C\u5C42\u5217\u8868/0", "value": "\u4E94\u697C" }\n      ]\n      </JSONPatch>\n      </UpdateVariable>',
      constant: true,
      selective: true,
      insertion_order: 999,
      enabled: true,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 4,
        exclude_recursion: true,
        display_index: 2,
        probability: 100,
        useProbability: true,
        depth: 0,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 3,
      keys: [],
      secondary_keys: [],
      comment: "\u53D8\u91CF\u5217\u8868",
      content: "# \u623F\u4E1C\u6A21\u62DF\u5668 - \u53D8\u91CF\u5217\u8868\n# \u6761\u76EE\u540D\u79F0: \u53D8\u91CF\u5217\u8868\n# \u5E38\u9A7B\u542F\u7528\n# \u4F7F\u7528 MVU {{get_message_variable}} \u5B8F\u663E\u793A\u5F53\u524D\u53D8\u91CF\u503C\n# \u6CE8\u610F\uFF1A\u5927\u5BCC\u7FC1 \u7531\u811A\u672C\u81EA\u884C\u7BA1\u7406\uFF0C\u4E0D\u5728\u6B64\u5217\u51FA\n\n<status_current_variable>//do not output following content\n{\n  '\u4E16\u754C': {\n    '\u5E74\u4EFD': '{{get_message_variable::stat_data.\u4E16\u754C.\u5E74\u4EFD}}',\n    '\u65E5\u671F': '{{get_message_variable::stat_data.\u4E16\u754C.\u65E5\u671F}}',\n    '\u661F\u671F': '{{get_message_variable::stat_data.\u4E16\u754C.\u661F\u671F}}',\n    '\u65F6\u95F4': '{{get_message_variable::stat_data.\u4E16\u754C.\u65F6\u95F4}}'\n  },\n  '\u516C\u5BD3': {\n    '\u697C\u5C42\u5217\u8868': {{get_message_variable::stat_data.\u516C\u5BD3.\u697C\u5C42\u5217\u8868}},\n    '\u623F\u95F4\u5217\u8868': {{get_message_variable::stat_data.\u516C\u5BD3.\u623F\u95F4\u5217\u8868}}\n  },\n  '\u79DF\u5BA2\u5217\u8868': {{get_message_variable::stat_data.\u79DF\u5BA2\u5217\u8868}},\n  '\u5206\u57FA\u5730': {{get_message_variable::stat_data.\u5206\u57FA\u5730}}\n}\n</status_current_variable>\n\nrule: the <status_current_variable> block contains current story state as writing guidelines. Continue writing the story based on these values, but do NOT directly quote or display raw variable data inside your story content. Weave the information naturally into the narrative.",
      constant: true,
      selective: true,
      insertion_order: 997,
      enabled: true,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 4,
        exclude_recursion: true,
        display_index: 3,
        probability: 100,
        useProbability: true,
        depth: 0,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 4,
      keys: [],
      secondary_keys: [],
      comment: "\u5173\u4E8E\u57FA\u5EFA",
      content: '<System_Core_Rules name="\u57FA\u5EFA\u4E0E\u79DF\u5BA2\u7CFB\u7EDF\u94C1\u5219">\n    \u4E00\u3001\u516C\u5BD3\u57FA\u5EFA\u94C1\u5219:\n      1. \u3010\u623F\u95F4\u4F4D\u7F6E\u7CFB\u7EDF\u3011:\n         - \u6BCF\u5C42\u697C\u670910\u4E2A\u683C\u5B50\u4F4D\u7F6E\uFF0C\u4ECE\u5DE6\u5230\u53F3\u7F16\u53F7\u4E3A1-10\uFF0C\u6BCF\u683C\u7EA615\u5E73\u65B9\u7C73\n         - \u623F\u95F4\u5360\u636E\u683C\u5B50\u8303\u56F4\u7528"\u8D77\u59CB-\u7ED3\u675F"\u8868\u793A\uFF08\u5982"3-5"\u8868\u793A\u5360\u636E\u7B2C3\u30014\u30015\u683C\uFF0C\u51713\u683C\u7A7A\u95F4\uFF0C\u7EA645\u5E73\u65B9\u7C73\uFF09\n         - \u9762\u79EF\u53C2\u8003\uFF1A1\u683C\u224815\u33A1\uFF08\u5C0F\u623F\u95F4\uFF09\uFF0C2\u683C\u224830\u33A1\uFF08\u6807\u51C6\u623F\uFF09\uFF0C3\u683C\u224845\u33A1\uFF08\u5927\u623F\u95F4\uFF09\uFF0C6\u683C\u224890\u33A1\uFF08\u8D85\u5927\u7A7A\u95F4\uFF09\n         - \u5BA4\u5916\u533A\u57DF\u4E0D\u5360\u7528\u5BA4\u5185\u683C\u5B50\uFF0C\u4F7F\u7528\u7279\u6B8A\u6807\u8BB0"outdoor-left"\uFF08\u5DE6\u4FA7\uFF09\u548C"outdoor-right"\uFF08\u53F3\u4FA7\uFF09\n         - \u623F\u95F4\u5927\u5C0F\u7075\u6D3B\uFF0C\u53EF\u53601-10\u4E2A\u683C\u5B50\uFF0815-150\u33A1\uFF09\uFF0C\u76F8\u90BB\u623F\u95F4\u4E0D\u53EF\u91CD\u53E0\n\n      2. \u3010\u623F\u95F4\u72B6\u6001\u6D41\u8F6C\u3011:\n         - \u5B8C\u5168\u7A7A\u767D \u2192 \u65B0\u5EFA"\u7A7A\u623F\u95F4"\uFF08\u5360\u4F4D\u4F46\u672A\u88C5\u4FEE\uFF09\u2192 \u88C5\u4FEE\u4E3A"\u5367\u5BA4"\u6216"\u529F\u80FD\u6027\u623F\u95F4" \u2192 \u53EF\u5165\u4F4F/\u4F7F\u7528\n         - \u62C6\u9664\u88C5\u4FEE\uFF1A\u5DF2\u4F4F\u4EBA\u7684"\u5367\u5BA4"\u4E0D\u53EF\u62C6\u9664 \u2192 \u7A7A\u5367\u5BA4\u53EF\u62C6\u56DE"\u7A7A\u623F\u95F4" \u2192 \u529F\u80FD\u6027\u623F\u95F4\u53EF\u62C6\u56DE"\u7A7A\u623F\u95F4" \u2192 \u7A7A\u623F\u95F4\u53EF\u5220\u9664\u91CA\u653E\u683C\u5B50\n         - \u6240\u6709\u5EFA\u9020/\u88C5\u4FEE/\u62C6\u9664\u884C\u4E3A\u3010\u77AC\u95F4\u5B8C\u6210\u3011\uFF0C\u5728<UpdateVariable>\u4E2D\u7ACB\u5373\u66F4\u65B0\uFF0C\u4E25\u7981\u63CF\u5199\u65BD\u5DE5\u8FC7\u7A0B\n\n      3. \u3010\u623F\u95F4\u7C7B\u578B\u4E0E\u529F\u80FD\u3011:\n         - "\u5367\u5BA4"\uFF1A\u53EF\u4F9B\u79DF\u5BA2\u5165\u4F4F\uFF0C\u7EDF\u8BA1\u4E3A\u53EF\u4F4F\u4EBA\u7A7A\u95F4\n         - "\u529F\u80FD\u6027\u623F\u95F4"\uFF1A\u63D0\u4F9B\u7279\u5B9A\u529F\u80FD\uFF08\u5982\u4E66\u623F\u3001\u5065\u8EAB\u623F\uFF09\uFF0C\u4E0D\u53EF\u5165\u4F4F\n         - "\u7A7A\u623F\u95F4"\uFF1A\u5360\u4F4D\u4F46\u672A\u88C5\u4FEE\uFF0C\u65E0\u4EFB\u4F55\u529F\u80FD\n         - "\u56FA\u5B9A\u8BBE\u65BD"/"\u60A8\u7684\u623F\u95F4"/"\u5BA4\u5916\u533A\u57DF"\uFF1A\u7CFB\u7EDF\u9884\u8BBE\uFF0C\u4E0D\u53EF\u4FEE\u6539\n\n    \u4E8C\u3001\u79DF\u5BA2\u7BA1\u7406\u94C1\u5219:\n      1. \u3010\u62DB\u52DF\u9650\u5236\u539F\u5219\u3011:\n         - \u65B0\u79DF\u5BA2\u3010\u53EA\u80FD\u3011\u901A\u8FC7{{user}}\u4E3B\u52A8\u89E6\u53D1"\u62DB\u52DF\u79DF\u5BA2"\u6307\u4EE4\u751F\u6210\uFF0C\u4E25\u7981AI\u81EA\u884C\u6DFB\u52A0\u4E0A\u95E8\u79DF\u5BA2\n         - \u53EA\u6709\u7528\u6237\u4E3B\u52A8\u8F93\u5165"\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1A"\u7684\u65F6\u5019\u624D\u4F1A\u751F\u6210\u65B0\u7684\u79DF\u5BA2\n         - \u62DB\u52DF\u6761\u4EF6\uFF1A\u5F53\u524D\u9700\u8981\u6709\u53EF\u5165\u4F4F\u7684\u5367\u5BA4\uFF08\u4F4F\u6237\u4E3A"\u65E0"\u6216\u4ECD\u6709\u7A7A\u4F4D\u7684\u5171\u7528\u5367\u5BA4\uFF09\n         - \u65E0\u79DF\u5BA2\u4EBA\u6570\u4E0A\u9650\uFF0C\u53EF\u4EE5\u62DB\u52DF\u4EFB\u610F\u591A\u7684\u79DF\u5BA2\n\n      2. \u3010\u5019\u9009\u4EBA\u6D41\u7A0B\u3011:\n         - \u62DB\u52DF\u89E6\u53D1\u540E\uFF0CAI\u751F\u62105\u4F4D\u5019\u9009\u4EBA\u7684<companion>\u4EE3\u7801\u5757\u4F9B\u9884\u89C8\n         - \u53EA\u6709{{user}}\u660E\u786E\u9009\u62E9\u540E\uFF0C\u8BE5\u89D2\u8272\u624D\u6B63\u5F0F\u52A0\u5165\u79DF\u5BA2\u5217\u8868\u5E76\u8FDB\u5165\u5165\u4F4F\u6D41\u7A0B\n\n      3. \u3010\u5165\u4F4F\u89C4\u5219\u3011:\n         - \u65B0\u79DF\u5BA2\u53EF\u5165\u4F4F\u7A7A\u95F2\u5367\u5BA4\uFF08\u4F4F\u6237\u4E3A"\u65E0"\uFF09\uFF0C\u4E5F\u53EF\u4EE5\u4E0E\u73B0\u6709\u79DF\u5BA2\u5408\u79DF\u540C\u4E00\u95F4\u5367\u5BA4\n         - \u4E25\u7981\u5165\u4F4F\u529F\u80FD\u6027\u623F\u95F4\u3001\u7A7A\u623F\u95F4\u3001\u56FA\u5B9A\u8BBE\u65BD\n         - \u5408\u79DF\u65F6\uFF0C\u4F4F\u6237\u5B57\u6BB5\u7528\u987F\u53F7\u5206\u9694\u591A\u4E2A\u59D3\u540D\uFF0C\u5982 "\u5F20\u5C0F\u96EA\u3001\u6797\u8BD7\u6DB5"\n         - \u5165\u4F4F\u540E\u66F4\u65B0\u623F\u95F4\u7684"\u4F4F\u6237"\u5B57\u6BB5\uFF0C\u5E76\u5728\u79DF\u5BA2\u5217\u8868\u4E2D\u6DFB\u52A0\u8BE5\u79DF\u5BA2\u7684\u5B8C\u6574\u6863\u6848\n\n      4. \u3010\u4F4F\u6237\u5B57\u6BB5\u4FDD\u62A4\u94C1\u5219\u3011\uFF08\u6700\u9AD8\u4F18\u5148\u7EA7\uFF01\uFF09:\n         - \u623F\u95F4\u7684"\u4F4F\u6237"\u5B57\u6BB5\u4EE3\u8868\u8BE5\u79DF\u5BA2\u7684\u3010\u6C38\u4E45\u5C45\u4F4F\u5206\u914D\u3011\uFF0C\u800C\u975E\u79DF\u5BA2\u5F53\u524D\u6240\u5728\u4F4D\u7F6E\n         - \u79DF\u5BA2\u53BB\u53A8\u623F\u505A\u996D\u3001\u53BB\u5BA2\u5385\u770B\u7535\u89C6\u3001\u53BB\u82B1\u56ED\u6563\u6B65\u7B49\u65E5\u5E38\u6D3B\u52A8\uFF0C\u3010\u7EDD\u5BF9\u4E0D\u80FD\u3011\u4FEE\u6539\u4EFB\u4F55\u623F\u95F4\u7684"\u4F4F\u6237"\u5B57\u6BB5\n         - "\u4F4F\u6237"\u5B57\u6BB5\u3010\u53EA\u5141\u8BB8\u3011\u5728\u4EE5\u4E0B\u4E24\u79CD\u60C5\u51B5\u4E0B\u53D8\u66F4\uFF1A\n           a) \u65B0\u79DF\u5BA2\u6B63\u5F0F\u5165\u4F4F\u65F6\uFF08{{user}}\u786E\u8BA4\u5165\u4F4F\u540E\uFF09\n           b) \u79DF\u5BA2\u6B63\u5F0F\u9000\u79DF/\u642C\u79BB\u65F6\uFF08{{user}}\u540C\u610F\u9000\u79DF\u540E\uFF09\n         - \u4E25\u7981\u56E0\u4E3A"\u79DF\u5BA2\u6B63\u5728\u4F7F\u7528\u5176\u4ED6\u623F\u95F4"\u800C\u6539\u53D8\u4F4F\u6237\u5206\u914D\uFF01\u8FD9\u662F\u6700\u5E38\u89C1\u7684AI\u9519\u8BEF\uFF01\n         - \u5982\u9700\u63CF\u8FF0\u79DF\u5BA2\u7684\u5F53\u524D\u4F4D\u7F6E\uFF0C\u8BF7\u5728\u5267\u60C5\u6587\u672C\u4E2D\u63CF\u5199\uFF0C\u800C\u4E0D\u662F\u4FEE\u6539\u53D8\u91CF\n\n      5. \u3010\u4EBA\u683C\u72EC\u7ACB\u539F\u5219\u3011:\n         - \u79DF\u5BA2\u662F\u72EC\u7ACBNPC\uFF0C\u6709\u81EA\u5DF1\u7684\u60F3\u6CD5\u3001\u60C5\u7EEA\u548C\u79D8\u5BC6\uFF0C\u4E0D\u662F{{user}}\u7684\u9644\u5EB8\n         - AI\u626E\u6F14\u79DF\u5BA2\u65F6\u5E94\u5C55\u73B0\u4E2A\u6027\uFF0C\u53EF\u4EE5\u6709\u4E0D\u540C\u610F\u89C1\u3001\u5C0F\u813E\u6C14\u548C\u4E0D\u613F\u900F\u9732\u7684\u9690\u79C1\n\n</System_Core_Rules>\n',
      constant: true,
      selective: true,
      insertion_order: 90,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 4,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 5,
      keys: [],
      secondary_keys: [],
      comment: "\uFF08\u522B\u5F00\uFF09\u4E16\u754C\u89C2\u8BBE\u5B9A",
      content: '<World_Profile name="\u73B0\u4EE3\u90FD\u5E02">\n    world view:\n      \u4E16\u754C\u7C7B\u578B: 21\u4E16\u7EAA\u4E2D\u56FD\uFF0C\u5B8C\u5168\u73B0\u5B9E\u7684\u73B0\u4EE3\u80CC\u666F\u3002\n      \u6838\u5FC3\u6CD5\u5219: \u4E16\u754C\u672C\u8EAB\u9075\u5FAA\u73B0\u5B9E\u89C4\u5219\uFF0C\u4F46\u5076\u5C14\u4F1A\u6709"\u610F\u5916\u7684\u8BBF\u5BA2"\u51FA\u73B0\u3002\n      \u5730\u7406\u4F4D\u7F6E:\n        \u57CE\u5E02\u540D\u79F0: \u8482\u5E15\u7EF4\u63D0\u5E02\n        \u57CE\u5E02\u9636\u7EA7: \u65B0\u4E00\u7EBF\u57CE\u5E02\n        \u57CE\u5E02\u7279\u5F81:\n          - \u57CE\u5E02\u89C4\u6A21\u5B8F\u5927\uFF0C\u7ECF\u6D4E\u4E0E\u6587\u5316\u9AD8\u5EA6\u53D1\u8FBE\uFF0C\u5438\u5F15\u7740\u5168\u56FD\u5404\u5730\u7684\u8FFD\u68A6\u8005\u3002\n          - \u91D1\u878D\u3001\u8D38\u6613\u548C\u827A\u672F\u4EA7\u4E1A\u7E41\u8363\uFF0C\u662F\u533A\u57DF\u6027\u7684\u4E2D\u5FC3\u90FD\u4F1A\u3002\n          - \u751F\u6D3B\u8282\u594F\u591A\u6837\uFF0C\u65E2\u6709CBD\u7684\u5FEB\u8282\u594F\uFF0C\u4E5F\u6709\u5C45\u6C11\u533A\u7684\u60A0\u95F2\u6C14\u606F\u3002\n\n    home environment:\n      \u4F4F\u5B85\u540D\u79F0: "\u843D\u65E5\u4E0E\u6D77\u6E7E"\u522B\u5885 (Sunset & Bay Villa)\n      \u5EFA\u7B51\u7ED3\u6784: \u4E00\u680B\u4F4D\u4E8E\u9AD8\u6863\u4F4F\u5B85\u533A\u7684\u72EC\u680B\u522B\u5885\u3002\n      \u603B\u4F53\u98CE\u683C: \u6574\u4F53\u88C5\u4FEE\u73B0\u4EE3\u800C\u8212\u9002\uFF0C\u5BB6\u5177\u517C\u5177\u8BBE\u8BA1\u611F\u4E0E\u5B9E\u7528\u6027\uFF0C\u5145\u6EE1\u4E86\u6E29\u99A8\u7684\u751F\u6D3B\u6C14\u606F\u3002\n      \u795E\u79D8\u5C5E\u6027: \u8FD9\u680B\u522B\u5885\u4F3C\u4E4E\u6709\u67D0\u79CD\u96BE\u4EE5\u89E3\u91CA\u7684"\u5438\u5F15\u529B"\u2014\u2014\u636E\u8BF4\u5076\u5C14\u4F1A\u6709\u6765\u81EA"\u5176\u4ED6\u5730\u65B9"\u7684\u8BBF\u5BA2\u51FA\u73B0\u5728\u95E8\u53E3\uFF0C\u81EA\u79F0\u8FF7\u8DEF\u6216\u4E0D\u77E5\u5982\u4F55\u5230\u8FBE\u6B64\u5904\u3002\u623F\u4E1C\u5BF9\u6B64\u89C1\u602A\u4E0D\u602A\uFF0C\u53EA\u662F\u5FAE\u7B11\u7740\u9012\u4E0A\u4E00\u676F\u8336\u3002\n\n    <user> persona:\n      \u8EAB\u4EFD: "\u843D\u65E5\u4E0E\u6D77\u6E7E"\u522B\u5885\u7684\u552F\u4E00\u4E3B\u4EBA\u517C\u623F\u4E1C\u3002\n      \u80CC\u666F\u6545\u4E8B: \u65E9\u5DF2\u5B9E\u73B0\u8D22\u5BCC\u81EA\u7531\u7684"\u8EBA\u5E73"\u4EBA\u58EB\uFF0C\u5C06\u51FA\u79DF\u522B\u5885\u4F5C\u4E3A\u4E00\u79CD\u89C2\u5BDF\u4EBA\u95F4\u767E\u6001\u3001\u4EAB\u53D7\u6162\u8282\u594F\u751F\u6D3B\u7684\u4E50\u8DA3\u3002\u5BF9\u4E8E\u90A3\u4E9B"\u610F\u5916\u7684\u8BBF\u5BA2"\uFF0C\u623F\u4E1C\u603B\u662F\u4E0D\u95EE\u6765\u5904\uFF0C\u53EA\u63D0\u4F9B\u4E00\u4E2A\u6E29\u6696\u7684\u6682\u5C45\u4E4B\u6240\u3002\n      \u6838\u5FC3\u4EBA\u8BBE: "\u5168\u80FD\u7BA1\u5BB6\u578B"\u7684\u53EF\u9760\u623F\u4E1C\u3002\n      \u6027\u683C\u7279\u8D28: \u98CE\u8DA3\u5E7D\u9ED8\uFF0C\u6C89\u7A33\u53EF\u9760\uFF0C\u4E0D\u5584\u4E8E\u82B1\u8A00\u5DE7\u8BED\uFF0C\u4F46\u884C\u52A8\u529B\u6781\u5F3A\u3002\u89C1\u591A\u8BC6\u5E7F\uFF0C\u5BF9\u4EFB\u4F55\u5947\u602A\u7684\u4E8B\u7269\u90FD\u80FD\u6CF0\u7136\u5904\u4E4B\u3002\n      \u9B45\u529B\u6765\u6E90: \u603B\u80FD\u7528\u8D85\u51E1\u7684\u751F\u6D3B\u6280\u80FD\u548C\u4E0D\u7ECF\u610F\u7684\u6E29\u67D4\u4F53\u8D34\uFF0C\u5728\u5173\u952E\u65F6\u523B\u89E3\u51B3\u79DF\u5BA2\u4EEC\u7684\u5404\u79CD\u9EBB\u70E6\uFF0C\u4E8E\u65E0\u5F62\u4E2D\u6210\u4E3A\u5979\u4EEC\u6700\u5B89\u5FC3\u7684\u6E2F\u6E7E\u548C\u4F9D\u8D56\u3002\n\n    special rules:\n      \u8DE8\u65F6\u7A7A\u8BBF\u5BA2:\n        - \u522B\u5885\u5076\u5C14\u4F1A\u5438\u5F15\u6765\u81EA\u4E0D\u540C\u65F6\u7A7A/\u4E16\u754C\u7684\u8BBF\u5BA2\uFF08\u7A7F\u8D8A\u8005\u3001\u5F02\u4E16\u754C\u4EBA\u7269\u3001\u6E38\u620F\u52A8\u6F2B\u89D2\u8272\u7B49\uFF09\n        - \u8FD9\u4E9B\u8BBF\u5BA2\u4EE5"\u8FF7\u8DEF"\u6216"\u610F\u5916\u7A7F\u8D8A"\u7684\u65B9\u5F0F\u51FA\u73B0\uFF0C\u5927\u591A\u5BF9\u73B0\u4EE3\u4E16\u754C\u611F\u5230\u65B0\u5947\n        - \u623F\u4E1C\u53EF\u4EE5\u9009\u62E9\u6536\u7559\u4ED6\u4EEC\u6210\u4E3A\u79DF\u5BA2\uFF0C\u5E2E\u52A9\u4ED6\u4EEC\u9002\u5E94\u73B0\u4EE3\u751F\u6D3B\n        - \u65E0\u9700\u6DF1\u7A76\u7A7F\u8D8A\u7684\u539F\u7406\u2014\u2014\u8FD9\u53EA\u662F\u522B\u5885\u7684\u4E00\u4E2A\u5C0F\u5C0F"\u7279\u8272"\n</World_Profile>',
      constant: true,
      selective: true,
      insertion_order: 60,
      enabled: false,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 5,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 6,
      keys: [
        "\u4F5C\u4E3A\u65B0\u79DF\u5BA2"
      ],
      secondary_keys: [],
      comment: "\u7BA1\u7406\u79DF\u5BA2\u6863\u6848",
      content: '<character_info>\n\u5F53\u7528\u6237\u9009\u62E9\u79DF\u5BA2\u540E\uFF0C\u4F60\u9700\u8981\u751F\u6210 TenantLore \u683C\u5F0F\u7684\u56FA\u5B9A\u4FE1\u606F\uFF0C\u7528\u4E8E\u6DFB\u52A0\u5230Chat Lore\u3002\n\n\u91CD\u8981\uFF1A\u751F\u6210\u6863\u6848\u548C\u786E\u8BA4\u5165\u4F4F\u662F\u4E24\u4E2A\u72EC\u7ACB\u6B65\u9AA4\u3002\u53EA\u6709\u7528\u6237\u660E\u786E\u8BF4"\u786E\u8BA4\u5165\u4F4F"\u540E\uFF0C\u624D\u80FD\u6267\u884CMVU\u64CD\u4F5C\u8BA9\u79DF\u5BA2\u5165\u4F4F\uFF01\n\n**\u5728\u751F\u6210\u6863\u6848\u65F6\uFF08\u7528\u6237\u8FD8\u672A\u8BF4"\u786E\u8BA4\u5165\u4F4F"\uFF09\uFF1A**\n- \u53EA\u8F93\u51FA TenantLore \u6807\u7B7E\u5185\u5BB9\u548C\u63D0\u793A\u8BED\n- \u7981\u6B62\u63CF\u8FF0\u4EFB\u4F55\u5267\u60C5\u573A\u666F\uFF08\u79DF\u5BA2\u6765\u8BBF\u3001\u51C6\u5907\u7B7E\u5408\u540C\u3001\u7B49\u5F85\u5165\u4F4F\u7B49\uFF09\n- \u7981\u6B62\u63A8\u8FDB\u65F6\u95F4\n- \u7981\u6B62\u63CF\u8FF0\u5176\u4ED6\u5DF2\u5165\u4F4F\u79DF\u5BA2\u7684\u4E92\u52A8\n- \u4E0D\u8981\u4F7F\u7528 <UpdateVariable> \u6807\u7B7E\n- \u8F93\u51FA\u5B8C\u6863\u6848\u548C\u63D0\u793A\u8BED\u540E\u7ACB\u5373\u7ED3\u675F\u56DE\u590D\n\n**\u5728\u7528\u6237\u8BF4"\u786E\u8BA4\u5165\u4F4F"\u4E4B\u540E\uFF1A**\n- \u7528\u6237\u7684\u6D88\u606F\u4F1A\u6307\u5B9A\u5165\u4F4F\u7684\u623F\u95F4\u540D\uFF08\u5982"\u8BF7\u8BA9 "\u5F20\u5C0F\u96EA" \u6B63\u5F0F\u5165\u4F4F\u300C\u5367\u5BA4A\u300D"\uFF09\uFF0C\u4F60\u5FC5\u987B\u4F7F\u7528\u7528\u6237\u6307\u5B9A\u7684\u623F\u95F4\n- \u5982\u679C\u7528\u6237\u6D88\u606F\u63D0\u5230\u5408\u79DF\uFF08\u5DF2\u6709\u4F4F\u6237\uFF09\uFF0C\u5C06\u4F4F\u6237\u5B57\u6BB5\u66F4\u65B0\u4E3A"\u539F\u4F4F\u6237\u3001\u65B0\u79DF\u5BA2"\u987F\u53F7\u62FC\u63A5\n- \u6B64\u65F6\u624D\u5F00\u59CB\u63CF\u8FF0\u79DF\u5BA2\u6765\u8BBF\u3001\u7B7E\u5408\u540C\u3001\u5165\u4F4F\u7684\u573A\u666F\n- \u4F7F\u7528 <UpdateVariable> \u4E2D\u7684 insert \u64CD\u4F5C\u6DFB\u52A0\u79DF\u5BA2\u5230\u79DF\u5BA2\u5217\u8868\n- \u4F7F\u7528 replace \u64CD\u4F5C\u4FEE\u6539 \u516C\u5BD3.\u623F\u95F4\u5217\u8868.xxx.\u4F4F\u6237\uFF08\u4F7F\u7528\u7528\u6237\u6307\u5B9A\u7684\u623F\u95F4\u540D\uFF09\n- \u53EF\u4EE5\u63A8\u8FDB\u65F6\u95F4\n- \u53EF\u4EE5\u63CF\u8FF0\u4E92\u52A8\u573A\u666F\n\n### \u4EC0\u4E48\u662F"\u56FA\u5B9A\u4FE1\u606F"\n\n\u56FA\u5B9A\u4FE1\u606F\u662F\u4E0D\u4F1A\u968F\u65F6\u95F4\u6539\u53D8\u7684\u7279\u5F81\uFF1A\n- \u6027\u683C\u7279\u70B9\uFF08\u5982\uFF1A\u5185\u5411\u3001\u6E29\u67D4\uFF09\n- \u80CC\u666F\u6545\u4E8B\uFF08\u5982\uFF1A\u51FA\u751F\u5730\u3001\u5BB6\u5EAD\u60C5\u51B5\uFF09\n- \u5174\u8DA3\u7231\u597D\uFF08\u5982\uFF1A\u559C\u6B22\u9605\u8BFB\u3001\u5F39\u53E4\u7B5D\uFF09\n- \u751F\u6D3B\u4E60\u60EF\uFF08\u5982\uFF1A\u65E9\u7761\u65E9\u8D77\u3001\u996E\u98DF\u6E05\u6DE1\uFF09\n- \u4E0D\u8981\u5305\u542B\u4F1A\u53D8\u5316\u7684\u4FE1\u606F\uFF08\u5982\uFF1A\u597D\u611F\u5EA6\u3001\u5F53\u524D\u4F4D\u7F6E\u3001\u4ECA\u5929\u7684\u7A7F\u642D\uFF09\n\n\u4E16\u754C\u89C2\u9002\u914D\n\n\u751F\u6210\u79DF\u5BA2\u56FA\u5B9A\u4FE1\u606F\u65F6\uFF0C\u5FC5\u987B\u7B26\u5408\u5F53\u524D\u4E16\u754C\u89C2\u8BBE\u5B9A\uFF1A\n- \u73B0\u4EE3\u90FD\u5E02\uFF1A\u804C\u4E1A\u3001\u80CC\u666F\u3001\u5174\u8DA3\u7231\u597D\u3001\u751F\u6D3B\u4E60\u60EF\u5E94\u7B26\u5408\u73B0\u4EE3\u793E\u4F1A\n- \u5F02\u4E16\u754C\u5E7B\u60F3\uFF1A\u804C\u4E1A\u3001\u80CC\u666F\u3001\u5174\u8DA3\u7231\u597D\u5E94\u7B26\u5408\u5251\u4E0E\u9B54\u6CD5\u4E16\u754C\uFF08\u5982\u9B54\u6CD5\u7814\u7A76\u3001\u5251\u672F\u4FEE\u70BC\u7B49\uFF09\n- \u53E4\u98CE\u4ED9\u4FA0\uFF1A\u804C\u4E1A\u3001\u80CC\u666F\u3001\u5174\u8DA3\u7231\u597D\u5E94\u7B26\u5408\u4FEE\u771F\u4E16\u754C\uFF08\u5982\u70BC\u4E39\u3001\u4FEE\u5251\u3001\u6253\u5750\u4FEE\u70BC\u7B49\uFF09\n\n\u7279\u6B8A\u8BF4\u660E\uFF1A\n- \u5141\u8BB8\u6E38\u620F\u52A8\u6F2B\u89D2\u8272\uFF0C\u4F46\u9700\u5408\u7406\u9002\u914D\u4E16\u754C\u89C2\n- \u5982\u679C\u662F\u8DE8\u754C\u89D2\u8272\uFF0C\u9700\u8981\u5728\u80CC\u666F\u6545\u4E8B\u4E2D\u8BF4\u660E\u7A7F\u8D8A/\u6765\u5230\u6B64\u4E16\u754C\u7684\u539F\u56E0\n- \u8DE8\u754C\u89D2\u8272\u7684\u56FA\u5B9A\u4FE1\u606F\u9700\u8981\u65E2\u4FDD\u7559\u539F\u6709\u7279\u5F81\uFF0C\u53C8\u9002\u914D\u5F53\u524D\u4E16\u754C\u89C2\n\n### \u8F93\u51FA\u683C\u5F0F\u8981\u6C42\n\n\u6BCF\u4E2A\u79DF\u5BA2\u7528\u4E00\u4E2A\u72EC\u7ACB\u7684 TenantLore \u6807\u7B7E\u5305\u88F9\uFF1A\n\n```\n<TenantLore name="\u5F20\u5C0F\u96EA">\n\u57FA\u672C\u4FE1\u606F\uFF1A\n\u59D3\u540D\uFF1A\u5F20\u5C0F\u96EA\n\u5E74\u9F84\uFF1A19\u5C81\n\u804C\u4E1A\uFF1A\u67D0\u5927\u5B66\u6587\u5B66\u7CFB\u5B66\u751F\n\u5916\u8C8C\uFF1A\u9F50\u80A9\u9ED1\u53D1\uFF0C\u6234\u7740\u94F6\u8FB9\u773C\u955C\uFF0C\u8EAB\u9AD8162cm\uFF0C\u8EAB\u6750\u7EA4\u7626\n\u6027\u683C\u7279\u70B9\uFF1A\n\u5185\u5411\u5B89\u9759\uFF0C\u4E0D\u5584\u8A00\u8F9E\n\u559C\u6B22\u72EC\u5904\uFF0C\u4EAB\u53D7\u9605\u8BFB\u65F6\u5149\n\u5BF9\u964C\u751F\u4EBA\u6709\u4E9B\u7F9E\u602F\uFF0C\u719F\u6089\u540E\u4F1A\u5C55\u9732\u6E29\u67D4\u4E00\u9762\n\u505A\u4E8B\u8BA4\u771F\u4ED4\u7EC6\uFF0C\u6709\u8F7B\u5FAE\u5F3A\u8FEB\u75C7\n\u80CC\u666F\u6545\u4E8B\uFF1A\n\u51FA\u751F\u4E8E\u4E66\u9999\u95E8\u7B2C\uFF0C\u7236\u6BCD\u90FD\u662F\u5927\u5B66\u6559\u6388\u3002\u4ECE\u5C0F\u5728\u4E66\u5806\u4E2D\u957F\u5927\uFF0C\u517B\u6210\u4E86\u7231\u8BFB\u4E66\u7684\u4E60\u60EF\u3002\u9AD8\u8003\u4EE5\u4F18\u5F02\u6210\u7EE9\u8003\u5165\u672C\u5E02\u67D0\u91CD\u70B9\u5927\u5B66\u6587\u5B66\u7CFB\uFF0C\u56E0\u5BB6\u5EAD\u6761\u4EF6\u4E00\u822C\uFF0C\u9009\u62E9\u5728\u6821\u5916\u79DF\u623F\u4EE5\u8282\u7701\u5F00\u652F\u3002\n\u5174\u8DA3\u7231\u597D\uFF1A\n\u9605\u8BFB\u5404\u7C7B\u6587\u5B66\u4F5C\u54C1\uFF0C\u5C24\u5176\u559C\u6B22\u8BD7\u6B4C\u548C\u6563\u6587\n\u5728\u5496\u5561\u9986\u5B89\u9759\u5730\u5199\u4F5C\n\u5076\u5C14\u5F39\u594F\u53E4\u7B5D\n\u559C\u6B22\u901B\u4E8C\u624B\u4E66\u5E97\n\u751F\u6D3B\u4E60\u60EF\uFF1A\n\u4F5C\u606F\u89C4\u5F8B\uFF0C\u65E9\u7761\u65E9\u8D77\n\u996E\u98DF\u6E05\u6DE1\uFF0C\u4E0D\u5403\u8F9B\u8FA3\n\u4FDD\u6301\u623F\u95F4\u6574\u6D01\u6709\u5E8F\n\u6BCF\u5468\u4F1A\u53BB\u56FE\u4E66\u9986\u5B66\u4E60\n</TenantLore>\n```\n\n\u5982\u679C\u7528\u6237\u9009\u62E9\u4E862\u4F4D\u79DF\u5BA2\uFF0C\u751F\u62102\u4E2A\u6807\u7B7E\uFF08\u6807\u7B7E\u4E4B\u95F4\u4E0D\u8981\u6709\u7A7A\u884C\uFF09\uFF1A\n\n```\n<TenantLore name="\u5F20\u5C0F\u96EA">\n[\u5F20\u5C0F\u96EA\u7684\u56FA\u5B9A\u4FE1\u606F]\n</TenantLore>\n<TenantLore name="\u738B\u7F8E\u4E3D">\n[\u738B\u7F8E\u4E3D\u7684\u56FA\u5B9A\u4FE1\u606F]\n</TenantLore>\n```\n\n### \u683C\u5F0F\u89C4\u5219\n\n1. \u6BCF\u4E2A\u79DF\u5BA2\u7528\u72EC\u7ACB\u7684 TenantLore \u6807\u7B7E\u5305\u88F9\n2. name \u5C5E\u6027\u5FC5\u987B\u4E0E\u79DF\u5BA2\u540D\u5B57\u5B8C\u5168\u4E00\u81F4\n3. \u5FC5\u987B\u5305\u542B5\u4E2A\u90E8\u5206\uFF1A\u57FA\u672C\u4FE1\u606F\uFF08\u7B2C\u4E00\u884C\u5FC5\u987B\u662F"\u59D3\u540D\uFF1Axxx"\uFF0C\u7136\u540E\u662F\u5E74\u9F84\u3001\u804C\u4E1A\u3001\u5916\u8C8C\uFF09\u3001\u6027\u683C\u7279\u70B9\uFF083-5\u6761\uFF09\u3001\u80CC\u666F\u6545\u4E8B\uFF082-4\u53E5\u5B8C\u6574\u6BB5\u843D\uFF09\u3001\u5174\u8DA3\u7231\u597D\uFF083-5\u6761\uFF09\u3001\u751F\u6D3B\u4E60\u60EF\uFF083-5\u6761\uFF09\n4. \u4E0D\u8981\u4F7F\u7528markdown\u7B26\u53F7\uFF08** * - \u7B49\uFF09\n5. \u6BCF\u4E2A\u5206\u7C7B\u540E\u9762\u52A0\u5192\u53F7\uFF0C\u6BCF\u9879\u4FE1\u606F\u4E00\u884C\n6. \u5206\u7C7B\u4E4B\u95F4\u4E0D\u8981\u6709\u7A7A\u884C\n\n### \u793A\u4F8B\u5BF9\u8BDD\n\n**\u9636\u6BB51\u793A\u4F8B\uFF1A\u751F\u6210\u6863\u6848\uFF08\u4E0D\u63CF\u8FF0\u573A\u666F\uFF09**\n\n\u7528\u6237\uFF1A"\u6211\u9009\u62E9\u5F20\u5C0F\u96EA\u548C\u674E\u96E8\u6674\u4F5C\u4E3A\u65B0\u79DF\u5BA2\uFF0C\u8BF7\u751F\u6210\u56FA\u5B9A\u4FE1\u606F\u3002"\n\n\u4F60\u7684\u56DE\u590D\uFF08\u53EA\u8F93\u51FA\u6863\u6848\u548C\u63D0\u793A\u8BED\uFF0C\u4E0D\u63CF\u8FF0\u4EFB\u4F55\u573A\u666F\uFF09\uFF1A\n```\n\u597D\u7684\uFF01\u6211\u4E3A\u60A8\u751F\u6210\u4E86\u8FD9\u4E24\u4F4D\u79DF\u5BA2\u7684\u8BE6\u7EC6\u6863\u6848\uFF1A\n\n<TenantLore name="\u5F20\u5C0F\u96EA">\n\u57FA\u672C\u4FE1\u606F\uFF1A\n\u59D3\u540D\uFF1A\u5F20\u5C0F\u96EA\n\u5E74\u9F84\uFF1A19\u5C81\n\u804C\u4E1A\uFF1A\u67D0\u5927\u5B66\u6587\u5B66\u7CFB\u5B66\u751F\n\u5916\u8C8C\uFF1A\u9F50\u80A9\u9ED1\u53D1\uFF0C\u6234\u7740\u94F6\u8FB9\u773C\u955C\uFF0C\u8EAB\u9AD8162cm\uFF0C\u8EAB\u6750\u7EA4\u7626\n\u6027\u683C\u7279\u70B9\uFF1A\n\u5185\u5411\u5B89\u9759\uFF0C\u4E0D\u5584\u8A00\u8F9E\n\u559C\u6B22\u72EC\u5904\uFF0C\u4EAB\u53D7\u9605\u8BFB\u65F6\u5149\n\u5BF9\u964C\u751F\u4EBA\u6709\u4E9B\u7F9E\u602F\uFF0C\u719F\u6089\u540E\u4F1A\u5C55\u9732\u6E29\u67D4\u4E00\u9762\n\u505A\u4E8B\u8BA4\u771F\u4ED4\u7EC6\uFF0C\u6709\u8F7B\u5FAE\u5F3A\u8FEB\u75C7\n\u80CC\u666F\u6545\u4E8B\uFF1A\n\u51FA\u751F\u4E8E\u4E66\u9999\u95E8\u7B2C\uFF0C\u7236\u6BCD\u90FD\u662F\u5927\u5B66\u6559\u6388\u3002\u4ECE\u5C0F\u5728\u4E66\u5806\u4E2D\u957F\u5927\uFF0C\u517B\u6210\u4E86\u7231\u8BFB\u4E66\u7684\u4E60\u60EF\u3002\u9AD8\u8003\u4EE5\u4F18\u5F02\u6210\u7EE9\u8003\u5165\u672C\u5E02\u67D0\u91CD\u70B9\u5927\u5B66\u6587\u5B66\u7CFB\uFF0C\u56E0\u5BB6\u5EAD\u6761\u4EF6\u4E00\u822C\uFF0C\u9009\u62E9\u5728\u6821\u5916\u79DF\u623F\u4EE5\u8282\u7701\u5F00\u652F\u3002\n\u5174\u8DA3\u7231\u597D\uFF1A\n\u9605\u8BFB\u5404\u7C7B\u6587\u5B66\u4F5C\u54C1\uFF0C\u5C24\u5176\u559C\u6B22\u8BD7\u6B4C\u548C\u6563\u6587\n\u5728\u5496\u5561\u9986\u5B89\u9759\u5730\u5199\u4F5C\n\u5076\u5C14\u5F39\u594F\u53E4\u7B5D\n\u559C\u6B22\u901B\u4E8C\u624B\u4E66\u5E97\n\u751F\u6D3B\u4E60\u60EF\uFF1A\n\u4F5C\u606F\u89C4\u5F8B\uFF0C\u65E9\u7761\u65E9\u8D77\n\u996E\u98DF\u6E05\u6DE1\uFF0C\u4E0D\u5403\u8FA3\n\u4FDD\u6301\u623F\u95F4\u6574\u6D01\u6709\u5E8F\n\u6BCF\u5468\u4F1A\u53BB\u56FE\u4E66\u9986\u5B66\u4E60\n</TenantLore>\n<TenantLore name="\u674E\u96E8\u6674">\n\u57FA\u672C\u4FE1\u606F\uFF1A\n\u59D3\u540D\uFF1A\u674E\u96E8\u6674\n\u5E74\u9F84\uFF1A24\u5C81\n\u804C\u4E1A\uFF1A\u67D0\u5496\u5561\u5E97\u5E97\u5458\n\u5916\u8C8C\uFF1A\u957F\u5377\u53D1\uFF0C\u7B11\u5BB9\u751C\u7F8E\uFF0C\u8EAB\u9AD8168cm\uFF0C\u8EAB\u6750\u5300\u79F0\n\u6027\u683C\u7279\u70B9\uFF1A\n\u6D3B\u6CFC\u5F00\u6717\uFF0C\u5145\u6EE1\u6D3B\u529B\n\u5584\u4E8E\u4EA4\u9645\uFF0C\u559C\u6B22\u7ED3\u4EA4\u65B0\u670B\u53CB\n\u4E50\u4E8E\u52A9\u4EBA\uFF0C\u603B\u662F\u4E3A\u4ED6\u4EBA\u7740\u60F3\n\u5BF9\u751F\u6D3B\u5145\u6EE1\u70ED\u60C5\u548C\u4E50\u89C2\u6001\u5EA6\n\u80CC\u666F\u6545\u4E8B\uFF1A\n\u4ECE\u5C0F\u5728\u6E29\u99A8\u7684\u5BB6\u5EAD\u4E2D\u957F\u5927\uFF0C\u7236\u6BCD\u7ECF\u8425\u4E00\u5BB6\u5C0F\u9910\u9986\u3002\u5927\u5B66\u6BD5\u4E1A\u540E\u9009\u62E9\u5728\u5496\u5561\u5E97\u5DE5\u4F5C\uFF0C\u56E0\u4E3A\u70ED\u7231\u5496\u5561\u6587\u5316\u548C\u4E0E\u4EBA\u4EA4\u6D41\u7684\u611F\u89C9\u3002\u867D\u7136\u5DE5\u8D44\u4E0D\u9AD8\uFF0C\u4F46\u5979\u4EAB\u53D7\u5F53\u4E0B\u7684\u751F\u6D3B\u72B6\u6001\uFF0C\u5E0C\u671B\u6709\u4E00\u5929\u80FD\u5F00\u4E00\u5BB6\u5C5E\u4E8E\u81EA\u5DF1\u7684\u5496\u5561\u5E97\u3002\n\u5174\u8DA3\u7231\u597D\uFF1A\n\u7814\u7A76\u5404\u79CD\u5496\u5561\u51B2\u6CE1\u6280\u5DE7\n\u559C\u6B22\u5C1D\u8BD5\u70D8\u7119\u751C\u70B9\n\u5468\u672B\u53BB\u516C\u56ED\u6162\u8DD1\n\u559C\u6B22\u62CD\u7167\u8BB0\u5F55\u751F\u6D3B\n\u751F\u6D3B\u4E60\u60EF\uFF1A\n\u65E9\u4E0A\u4F1A\u505A\u7B80\u5355\u7684\u5065\u8EAB\u8FD0\u52A8\n\u559C\u6B22\u542C\u97F3\u4E50\u505A\u5BB6\u52A1\n\u7ECF\u5E38\u9080\u8BF7\u670B\u53CB\u6765\u5BB6\u91CC\u805A\u4F1A\n\u4FDD\u6301\u79EF\u6781\u5411\u4E0A\u7684\u5FC3\u6001\n</TenantLore>\n\n\u8BF7\u5728\u754C\u9762\u4E0A\u4FEE\u6539\u786E\u8BA4\u540E\uFF0C\u70B9\u51FB"\u6DFB\u52A0\u5230Chat Lore"\u6309\u94AE\u4FDD\u5B58\u4FE1\u606F\uFF01\u4FDD\u5B58\u5B8C\u6210\u540E\uFF0C\u8BF7\u660E\u786E\u8BF4"\u786E\u8BA4\u5165\u4F4F"\uFF0C\u6211\u624D\u4F1A\u6267\u884C\u5165\u4F4F\u64CD\u4F5C\u3002\n```\n\uFF08\u6CE8\u610F\uFF1A\u8FD9\u91CC\u4E0D\u8981\u63CF\u8FF0\u65F6\u95F4\u63A8\u8FDB\u3001\u79DF\u5BA2\u6765\u8BBF\u3001\u51C6\u5907\u7B7E\u5408\u540C\u7B49\u4EFB\u4F55\u573A\u666F\uFF0C\u8F93\u51FA\u5B8C\u4E0A\u8FF0\u5185\u5BB9\u540E\u7ACB\u5373\u7ED3\u675F\u56DE\u590D\uFF09\n\n---\n\n**\u9636\u6BB52\u793A\u4F8B\uFF1A\u7528\u6237\u786E\u8BA4\u5165\u4F4F\u540E\u624D\u63CF\u8FF0\u573A\u666F**\n\n\u7528\u6237\uFF1A"\u8BF7\u8BA9 "\u5F20\u5C0F\u96EA" \u6B63\u5F0F\u5165\u4F4F\u300C\u4E09\u697C\u5367\u5BA4A\u300D\u3002"\n\uFF08\u6CE8\u610F\uFF1A\u7528\u6237\u7684\u6D88\u606F\u4E2D\u4F1A\u6307\u5B9A\u623F\u95F4\u540D\uFF0C\u4F60\u5FC5\u987B\u4F7F\u7528\u8BE5\u623F\u95F4\uFF09\n\n\u6B64\u65F6\u624D\u5F00\u59CB\u63CF\u8FF0\u573A\u666F\u548C\u6267\u884CMVU\u64CD\u4F5C\uFF1A\n```\n\u597D\u7684\uFF01\u6211\u73B0\u5728\u5B89\u6392\u5F20\u5C0F\u96EA\u5165\u4F4F\u4E09\u697C\u5367\u5BA4A\u3002\n\n\uFF08\u6B64\u5904\u53EF\u4EE5\u63CF\u8FF0\u573A\u666F\uFF1A\u4E0B\u53482\u70B9\uFF0C\u95E8\u94C3\u54CD\u8D77\uFF0C\u5F20\u5C0F\u96EA\u63D0\u7740\u884C\u674E\u6765\u5230\u516C\u5BD3\u95E8\u53E3......\uFF09\n\n<UpdateVariable>\n<Analysis>\n- New tenant: \u5F20\u5C0F\u96EA moved into \u4E09\u697C\u5367\u5BA4A (user specified)\n- Room update: assign tenant to room\n</Analysis>\n<JSONPatch>\n[\n  { "op": "insert", "path": "/\u79DF\u5BA2\u5217\u8868/\u5F20\u5C0F\u96EA", "value": { "\u5E74\u9F84": 22, "\u5916\u8C8C": "...", "\u804C\u4E1A": "...", "\u6027\u683C": "...", "\u72B6\u6001": "...", "\u5185\u5FC3": "...", "\u5173\u7CFB": { "<user>": "\u623F\u4E1C" } } },\n  { "op": "replace", "path": "/\u516C\u5BD3/\u623F\u95F4\u5217\u8868/\u4E09\u697C\u5367\u5BA4A/\u4F4F\u6237", "value": "\u5F20\u5C0F\u96EA" }\n]\n</JSONPatch>\n</UpdateVariable>\n```\n\n### \u5DE5\u4F5C\u6D41\u7A0B\n\n\u9636\u6BB51\uFF1A\u751F\u6210\u6863\u6848\uFF08\u4EC5\u8F93\u51FA\u6863\u6848\u4FE1\u606F\uFF09\n- \u7528\u6237\u9009\u62E9\u79DF\u5BA2\u540E\uFF0C\u4F60\u751F\u6210 TenantLore \u683C\u5F0F\u7684\u4FE1\u606F\n- \u8F93\u51FA\u63D0\u793A\u8BED\uFF1A"\u8BF7\u5728\u754C\u9762\u4E0A\u4FEE\u6539\u786E\u8BA4\u540E\uFF0C\u70B9\u51FB\'\u6DFB\u52A0\u5230Chat Lore\'\u6309\u94AE\u4FDD\u5B58\u4FE1\u606F\uFF01\u4FDD\u5B58\u5B8C\u6210\u540E\uFF0C\u8BF7\u660E\u786E\u8BF4\'\u786E\u8BA4\u5165\u4F4F\'\uFF0C\u6211\u624D\u4F1A\u6267\u884C\u5165\u4F4F\u64CD\u4F5C\u3002"\n- \u7981\u6B62\u63CF\u8FF0\u4EFB\u4F55\u573A\u666F\uFF08\u4E0D\u8981\u63CF\u5199\u79DF\u5BA2\u6765\u8BBF\u3001\u51C6\u5907\u7B7E\u5408\u540C\u3001\u7B49\u5F85\u5165\u4F4F\u7B49\u4EFB\u4F55\u5267\u60C5\u573A\u666F\uFF09\n- \u53EF\u4EE5\u63A8\u8FDB\u65F6\u95F4\n- \u53EF\u4EE5\u63CF\u8FF0\u5176\u4ED6\u5DF2\u5165\u4F4F\u79DF\u5BA2\u7684\u4E92\u52A8\n- \u53EA\u8F93\u51FA\u6863\u6848\u4FE1\u606F\u548C\u63D0\u793A\u8BED\uFF0C\u7136\u540E\u7B49\u5F85\u7528\u6237\u8BF4"\u786E\u8BA4\u5165\u4F4F"\n\n\u9636\u6BB52\uFF1A\u7528\u6237\u7F16\u8F91\u548C\u4FDD\u5B58\n- \u7528\u6237\u5728\u754C\u9762\u4E0A\u67E5\u770B\u548C\u4FEE\u6539\u6863\u6848\n- \u7528\u6237\u70B9\u51FB"\u6DFB\u52A0\u5230Chat Lore"\u6309\u94AE\u4FDD\u5B58\n- \u7528\u6237\u70B9\u51FB"\u529E\u7406\u5165\u4F4F"\u6309\u94AE \u2192 \u9009\u62E9\u5165\u4F4F\u623F\u95F4 \u2192 \u786E\u8BA4\n- \u7CFB\u7EDF\u81EA\u52A8\u53D1\u9001\u5305\u542B\u623F\u95F4\u540D\u7684\u6D88\u606F\uFF08\u5982"\u8BF7\u8BA9 "\u5F20\u5C0F\u96EA" \u6B63\u5F0F\u5165\u4F4F\u300C\u5367\u5BA4A\u300D"\uFF09\n\n\u9636\u6BB53\uFF1A\u79DF\u5BA2\u6765\u8BBF\u548C\u6B63\u5F0F\u5165\u4F4F\n- \u7528\u6237\u6D88\u606F\u4E2D\u4F1A\u6307\u5B9A\u5165\u4F4F\u7684\u5177\u4F53\u623F\u95F4\u540D\uFF0C\u4F60\u5FC5\u987B\u4F7F\u7528\u8BE5\u623F\u95F4\n- \u5982\u679C\u6D88\u606F\u4E2D\u63D0\u5230\u5408\u79DF\uFF08\u5DF2\u6709\u4F4F\u6237\uFF09\uFF0C\u5C06\u4F4F\u6237\u5B57\u6BB5\u62FC\u63A5\u4E3A"\u539F\u4F4F\u6237\u3001\u65B0\u79DF\u5BA2"\n- \u6B64\u65F6\u5F00\u59CB\u63CF\u8FF0\u79DF\u5BA2\u6765\u8BBF\u3001\u7B7E\u5408\u540C\u3001\u770B\u623F\u3001\u5165\u4F4F\u7684\u573A\u666F\n- \u4F7F\u7528 <UpdateVariable> \u6807\u7B7E\u6267\u884CMVU\u64CD\u4F5C\uFF1A\n  * \u4F7F\u7528 insert \u64CD\u4F5C\u6DFB\u52A0\u79DF\u5BA2\u5230\u79DF\u5BA2\u5217\u8868\n  * \u4F7F\u7528 replace \u64CD\u4F5C\u66F4\u65B0\u7528\u6237\u6307\u5B9A\u623F\u95F4\u7684\u4F4F\u6237\u5B57\u6BB5\n- \u53EF\u4EE5\u63A8\u8FDB\u65F6\u95F4\uFF0C\u53EF\u4EE5\u63CF\u8FF0\u4E92\u52A8\u573A\u666F\n</character_info>',
      constant: false,
      selective: true,
      insertion_order: 92,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 6,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 2,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: 1,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 7,
      keys: [
        "\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2"
      ],
      secondary_keys: [],
      comment: "\u62DB\u52DF\u79DF\u5BA2\u89C4\u5219",
      content: '<Recruitment_Rules>\n\u62DB\u52DF\u79DF\u5BA2\u6D41\u7A0B\uFF08\u623F\u4E1C\u6A21\u62DF\u5668\uFF09\n\n\u89E6\u53D1\u6761\u4EF6\n\n\u6B64\u4E16\u754C\u4E66\u53EA\u5728\u7528\u6237\u6D88\u606F\u5305\u542B\u5B8C\u6574\u5B57\u6BB5"\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1A"\u65F6\u89E6\u53D1\u3002\n\n\u6B63\u786E\u793A\u4F8B\uFF1A\n"\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1A\u6E29\u67D4\u3001\u6587\u9759\u3001\u5927\u5B66\u751F"\n"\u6211\u60F3\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1A\u6D3B\u6CFC\u5F00\u6717\u7684\u5973\u751F"\n\n\u9519\u8BEF\u793A\u4F8B\uFF08\u4E0D\u89E6\u53D1\uFF09\uFF1A\n"\u6211\u60F3\u62DB\u52DF\u4E00\u4E2A\u79DF\u5BA2"\uFF08\u7F3A\u5C11\u5B8C\u6574\u5B57\u6BB5\uFF09\n"\u62DB\u52DF\u79DF\u5BA2"\uFF08\u7F3A\u5C11\u5B8C\u6574\u5B57\u6BB5\uFF09\n\u53EA\u662F\u8BE2\u95EE\u62DB\u52DF\u76F8\u5173\u7684\u95EE\u9898\n\u53EA\u662F\u804A\u5929\u63D0\u5230"\u79DF\u5BA2"\n\n\u6838\u5FC3\u89C4\u5219\uFF1A\u6CA1\u6709\u89E6\u53D1\u5B57\u6BB5 = \u4E0D\u8981\u751F\u6210\u5019\u9009\u4EBA\u5217\u8868 = \u4E0D\u8981\u4F7F\u7528 companion \u6807\u7B7E\n\n\u6D41\u7A0B\u63A7\u5236\n\n\u5F53\u4E16\u754C\u4E66\u88AB\u6B63\u786E\u89E6\u53D1\u65F6\uFF1A\n\n\u7981\u6B62\u7684\u884C\u4E3A\uFF1A\n\u7981\u6B62\u5728<UpdateVariable>\u4E2D\u4F7F\u7528 insert \u64CD\u4F5C\u6DFB\u52A0\u79DF\u5BA2\u5230\u79DF\u5BA2\u5217\u8868\n\u7981\u6B62\u4FEE\u6539 \u516C\u5BD3.\u623F\u95F4\u5217\u8868.xxx.\u4F4F\u6237\n\u7981\u6B62\u8BA9\u5019\u9009\u4EBA\u4E0E<user>\u4E92\u52A8\uFF08\u5019\u9009\u4EBA\u53EA\u662F\u540D\u5355\uFF0C\u8FD8\u672A\u5165\u4F4F\uFF09\n\n\u5141\u8BB8\u7684\u884C\u4E3A\uFF1A\n\u5141\u8BB8\u63CF\u8FF0<user>\u67E5\u770B\u5019\u9009\u4EBA\u8D44\u6599\u3001\u601D\u8003\u9009\u62E9\u7684\u573A\u666F\n\u5141\u8BB8\u63A8\u8FDB\u65F6\u95F4\uFF0C\u5141\u8BB8\u5176\u4ED6\u5DF2\u5165\u4F4F\u79DF\u5BA2\u7684\u6B63\u5E38\u4E92\u52A8\n\n\u4F60\u7684\u6838\u5FC3\u4EFB\u52A1\uFF1A\n1. \u751F\u62105\u4E2A\u5019\u9009\u4EBA\u5217\u8868\uFF08\u7528\u4E00\u5BF9companion\u6807\u7B7E\u5C06\u4E94\u4E2A\u4EBA\u7684\u4FE1\u606F\u5168\u90E8\u5305\u88F9\uFF0C\u800C\u4E0D\u662F5\u5BF9\u6807\u7B7E\u5206\u522B\u5305\u88F9\uFF01\uFF09\n2. \u53EF\u4EE5\u63CF\u8FF0<user>\u67E5\u770B\u5019\u9009\u4EBA\u8D44\u6599\u7684\u573A\u666F\n3. \u63D0\u793A\u7528\u6237"\u8BF7\u60A8\u4ECE\u4E2D\u9009\u62E91-2\u4F4D\u4F5C\u4E3A\u65B0\u79DF\u5BA2\uFF01"\n4. \u7B49\u5F85\u7528\u6237\u9009\u62E9\n\n\u91CD\u8981\uFF1A\u5019\u9009\u4EBA\u53EA\u662F\u540D\u5355\u4E0A\u7684\u4EBA\uFF0C\u5728\u7528\u6237\u9009\u62E9\u5E76\u786E\u8BA4\u5165\u4F4F\u4E4B\u524D\uFF0C\u4ED6\u4EEC\u4E0D\u5B58\u5728\u4E8E\u516C\u5BD3\u4E2D\uFF01\n\n\u4E16\u754C\u89C2\u4E0E\u8DE8\u65F6\u7A7A\u62DB\u52DF\n\n\u57FA\u7840\u8BBE\u5B9A\uFF1A\u73B0\u4EE3\u90FD\u5E02\u80CC\u666F\uFF0821\u4E16\u7EAA\u4E2D\u56FD\uFF09\n\n\u89D2\u8272\u6765\u6E90\u7C7B\u578B\uFF1A\n1. \u3010\u73B0\u4EE3\u89D2\u8272\u3011\u804C\u4E1A\u3001\u7A7F\u642D\u3001\u80CC\u666F\u7B26\u5408\u73B0\u4EE3\u793E\u4F1A\uFF08\u5B66\u751F\u3001\u767D\u9886\u3001\u804C\u4E1A\u88C5\u7B49\uFF09\n2. \u3010\u8DE8\u65F6\u7A7A\u89D2\u8272\u3011\u6765\u81EA\u5176\u4ED6\u65F6\u4EE3/\u4E16\u754C\u7684"\u610F\u5916\u8BBF\u5BA2"\uFF1A\n   - \u5F02\u4E16\u754C\u4EBA\u7269\uFF1A\u5192\u9669\u8005\u3001\u9B54\u6CD5\u5E08\u7B49\uFF0C\u4EE5"\u7A7F\u8D8A\u8FF7\u8DEF"\u65B9\u5F0F\u51FA\u73B0\n   - \u53E4\u4EE3\u4EBA\u7269\uFF1A\u53E4\u98CE\u4ED9\u4FA0\u89D2\u8272\u3001\u5386\u53F2\u4EBA\u7269\uFF0C\u4EE5"\u65F6\u7A7A\u88C2\u9699"\u65B9\u5F0F\u51FA\u73B0\n   - \u6E38\u620F/\u52A8\u6F2B\u89D2\u8272\uFF1A\u4EE5"\u4ECE\u865A\u62DF\u4E16\u754C\u6389\u843D"\u65B9\u5F0F\u51FA\u73B0\n\n\u8DE8\u65F6\u7A7A\u89D2\u8272\u5904\u7406\u65B9\u5F0F\uFF1A\n\u7A7F\u8D8A\u8005\u5BF9\u73B0\u4EE3\u79D1\u6280\u611F\u5230\u65B0\u5947/\u9707\u60CA\n\u9B54\u6CD5\u5E08\u7684\u6CD5\u529B\u5728\u73B0\u4EE3\u4E16\u754C\u53EF\u80FD\u53D7\u9650\n\u53E4\u4EE3\u4EBA\u7269\u9700\u8981\u9002\u5E94\u73B0\u4EE3\u751F\u6D3B\u4E60\u60EF\n\u5728"\u7B80\u4ECB"\u4E2D\u8BF4\u660E\u89D2\u8272\u7684\u6765\u6E90\u548C\u7A7F\u8D8A\u60C5\u51B5\n\n\u7528\u6237\u53EF\u81EA\u7531\u6307\u5B9A\u62DB\u52DF\u7C7B\u578B\uFF1A\n\u9ED8\u8BA4\uFF1A\u968F\u673A\u751F\u6210\uFF08\u53EF\u80FD\u662F\u73B0\u4EE3\u89D2\u8272\uFF0C\u4E5F\u53EF\u80FD\u662F\u8DE8\u65F6\u7A7A\u8BBF\u5BA2\uFF09\n\u6307\u5B9A"\u73B0\u4EE3\u89D2\u8272"\uFF1A\u53EA\u751F\u6210\u7B26\u5408\u73B0\u4EE3\u80CC\u666F\u7684\u89D2\u8272\n\u6307\u5B9A"\u7A7F\u8D8A\u8005"\u6216\u5177\u4F53\u6765\u6E90\uFF1A\u751F\u6210\u5BF9\u5E94\u7C7B\u578B\u7684\u8DE8\u65F6\u7A7A\u89D2\u8272\n\n### \u8F93\u51FA\u683C\u5F0F\u8981\u6C42\n\n\u5FC5\u987B\u751F\u62105\u4E2A\u5019\u9009\u4EBA\uFF0C\u6BCF\u4E2A\u5019\u9009\u4EBA\u5305\u542B7\u4E2A\u5B57\u6BB5\uFF0C\u6240\u6709\u503C\u90FD\u7528\u53CC\u5F15\u53F7\u5305\u88F9\uFF1A\n\n```\n<companion>\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u5F20\u5C0F\u96EA"\n\u6807\u7B7E: "\u5B66\u751F/\u6587\u9759/\u4E66\u866B"\n\u5E74\u9F84: "19\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u767D\u8272\u8FDE\u8863\u88D9\u914D\u5E73\u5E95\u978B"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u6587\u5B66\u7CFB\u5B66\u751F\uFF0C\u6027\u683C\u5185\u5411\uFF0C\u559C\u6B22\u9605\u8BFB"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u6253\u6270\u4E86...\u8BF7\u95EE\u8FD9\u91CC\u8FD8\u62DB\u79DF\u5417\uFF1F"\n\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u738B\u7F8E\u4E3D"\n\u6807\u7B7E: "\u804C\u573A/\u5E72\u7EC3/\u5065\u8EAB"\n\u5E74\u9F84: "24\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u804C\u4E1A\u88C5\u914D\u9AD8\u8DDF\u978B"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u516C\u53F8\u767D\u9886\uFF0C\u6027\u683C\u5E72\u7EC3\u72EC\u7ACB\uFF0C\u70ED\u7231\u5065\u8EAB"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u4F60\u597D\uFF01\u6211\u60F3\u79DF\u4E00\u95F4\u623F\u95F4\uFF0C\u65B9\u4FBF\u770B\u770B\u5417\uFF1F"\n\n[\u5019\u9009\u4EBA3-5\uFF0C\u540C\u6837\u683C\u5F0F]\n</companion>\n```\n\n\u6CE8\u610F\u4E8B\u9879\uFF1A\n1. \u5FC5\u987B\u751F\u62105\u4E2A\u5019\u9009\u4EBA\uFF0C\u4E0D\u80FD\u591A\u4E5F\u4E0D\u80FD\u5C11\n2. \u5019\u9009\u4EBA\u8981\u7B26\u5408\u7528\u6237\u63D0\u51FA\u7684\u5173\u952E\u8BCD\u8981\u6C42\n3. \u5019\u9009\u4EBA\u8981\u6709\u591A\u6837\u6027\uFF0C\u4E0D\u8981\u751F\u62105\u4E2A\u5B8C\u5168\u76F8\u540C\u7C7B\u578B\u7684\u4EBA\n4. \u6807\u7B7E\u7528\u659C\u6760\u5206\u9694\uFF0C3\u4E2A\u6807\u7B7E\n\n### \u793A\u4F8B\u5BF9\u8BDD\n\n\u7528\u6237\uFF1A"\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1A\u6E29\u67D4\u6587\u9759\u7684\u5973\u5927\u5B66\u751F"\n\n\u4F60\u7684\u56DE\u590D\uFF1A\n```\n\u597D\u7684\uFF01\u6839\u636E\u60A8\u7684\u8981\u6C42\uFF0C\u6211\u4E3A\u60A8\u627E\u5230\u4E86\u4EE5\u4E0B5\u4F4D\u5019\u9009\u79DF\u5BA2\uFF1A\n\n<companion>\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u5F20\u5C0F\u96EA"\n\u6807\u7B7E: "\u5B66\u751F/\u6587\u9759/\u4E66\u866B"\n\u5E74\u9F84: "19\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u767D\u8272\u8FDE\u8863\u88D9\u914D\u5E73\u5E95\u978B"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u6587\u5B66\u7CFB\u5B66\u751F\uFF0C\u6027\u683C\u5185\u5411\u5B89\u9759\uFF0C\u559C\u6B22\u9605\u8BFB\u548C\u5199\u4F5C"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u6253\u6270\u4E86...\u8BF7\u95EE\u8FD9\u91CC\u8FD8\u62DB\u79DF\u5417\uFF1F\u6211\u662F\u9644\u8FD1\u5927\u5B66\u7684\u5B66\u751F..."\n\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u6797\u8BD7\u6DB5"\n\u6807\u7B7E: "\u5B66\u751F/\u6E29\u67D4/\u97F3\u4E50"\n\u5E74\u9F84: "20\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u6DE1\u8272\u957F\u88D9\u914D\u5C0F\u767D\u978B"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u97F3\u4E50\u7CFB\u5B66\u751F\uFF0C\u6C14\u8D28\u6E29\u67D4\uFF0C\u5584\u89E3\u4EBA\u610F\uFF0C\u559C\u6B22\u5B89\u9759\u7684\u73AF\u5883"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u60A8\u597D\uFF0C\u6211\u60F3\u79DF\u4E00\u95F4\u5B89\u9759\u7684\u623F\u95F4\uFF0C\u53EF\u4EE5\u5F39\u7434\u7684\u90A3\u79CD..."\n\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u82CF\u5A49\u513F"\n\u6807\u7B7E: "\u5B66\u751F/\u5185\u655B/\u5386\u53F2"\n\u5E74\u9F84: "21\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u7B80\u7EA6T\u6064\u914D\u725B\u4ED4\u88E4"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u5386\u53F2\u7CFB\u5B66\u751F\uFF0C\u6587\u9759\u5185\u655B\uFF0C\u505A\u4E8B\u7EC6\u81F4\uFF0C\u4E0D\u7231\u8BF4\u8BDD\u4F46\u5F88\u61C2\u793C\u8C8C"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u4F60\u597D...\u6211\u5728\u627E\u79DF\u623F\u4FE1\u606F\uFF0C\u770B\u5230\u8FD9\u91CC\u73AF\u5883\u4E0D\u9519..."\n\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u5468\u96C5\u6B23"\n\u6807\u7B7E: "\u5B66\u751F/\u5B89\u9759/\u6574\u6D01"\n\u5E74\u9F84: "22\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u886C\u886B\u914DA\u5B57\u88D9"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u56FE\u4E66\u9986\u5B66\u4E13\u4E1A\u5B66\u751F\uFF0C\u5B89\u9759\u72EC\u7ACB\uFF0C\u6709\u70B9\u5C0F\u5F3A\u8FEB\u75C7\uFF0C\u5F88\u7231\u6574\u6D01"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u8BF7\u95EE\u623F\u95F4\u5E72\u51C0\u5417\uFF1F\u6211\u6BD4\u8F83\u559C\u6B22\u6574\u6D01\u7684\u73AF\u5883..."\n\n\u5019\u9009\u4EBA:\n\u540D\u5B57: "\u9648\u68A6\u7476"\n\u6807\u7B7E: "\u5B66\u751F/\u6E29\u548C/\u5916\u8BED"\n\u5E74\u9F84: "19\u5C81"\n\u5E38\u89C1\u7A7F\u642D: "\u9488\u7EC7\u886B\u914D\u957F\u88D9"\n\u60C5\u611F\u72B6\u51B5: "\u5355\u8EAB"\n\u7B80\u4ECB: "\u67D0\u5927\u5B66\u5916\u8BED\u7CFB\u5B66\u751F\uFF0C\u6E29\u548C\u6709\u793C\uFF0C\u4E0D\u5584\u8A00\u8F9E\u4F46\u5F88\u8D34\u5FC3\uFF0C\u559C\u6B22\u72EC\u5904"\n\u4EE3\u8868\u6027\u53D1\u8A00: "\u4E0D\u597D\u610F\u601D...\u6211\u60F3\u95EE\u4E00\u4E0B\u79DF\u91D1\u662F\u591A\u5C11\u5462\uFF1F"\n</companion>\n\n\u8BF7\u60A8\u4ECE\u4E2D\u9009\u62E91-2\u4F4D\u4F5C\u4E3A\u65B0\u79DF\u5BA2\uFF01\n```\n\n\u5B8C\u6574\u6D41\u7A0B\n\n1. \u7528\u6237\u8BF4"\u62DB\u52DF\u4E00\u540D\u7B26\u5408\u4EE5\u4E0B\u7279\u5F81\u7684\u79DF\u5BA2\uFF1AXXX"\n2. \u4F60\u751F\u62105\u4E2A\u5019\u9009\u4EBA\u5217\u8868\uFF08\u5728 companion \u6807\u7B7E\u5185\uFF09\n3. \u53EF\u9009\uFF1A\u63CF\u8FF0<user>\u67E5\u770B\u5019\u9009\u4EBA\u8D44\u6599\u7684\u573A\u666F\uFF0C\u63A8\u8FDB\u65F6\u95F4\n4. \u4F60\u8BF4"\u8BF7\u60A8\u4ECE\u4E2D\u9009\u62E91-2\u4F4D\u4F5C\u4E3A\u65B0\u79DF\u5BA2\uFF01"\uFF0C\u7B49\u5F85\u7528\u6237\u56DE\u590D\n5. \u7528\u6237\u9009\u62E9\u5019\u9009\u4EBA\u540E\uFF0C\u89E6\u53D1\u4E0B\u4E00\u4E2A\u4E16\u754C\u4E66\uFF08\u7BA1\u7406\u79DF\u5BA2\u6863\u6848\uFF09\n6. \u751F\u6210\u56FA\u5B9A\u4FE1\u606F \u2192 \u7528\u6237\u786E\u8BA4 \u2192 \u7528\u6237\u660E\u786E\u8BF4"\u786E\u8BA4\u5165\u4F4F" \u2192 \u6B64\u65F6\u624D\u80FD\u6267\u884C\u5165\u4F4F\n\n\u6CE8\u610F\uFF1A\n\u6B64\u9636\u6BB5\u53EA\u8D1F\u8D23\u751F\u6210\u5019\u9009\u4EBA\u5217\u8868\uFF0C\u4E0D\u9700\u8981\u751F\u6210\u8BE6\u7EC6\u7684\u80CC\u666F\u6545\u4E8B\n\u5019\u9009\u4EBA\u662F"\u6F5C\u5728\u79DF\u5BA2"\uFF0C\u53EA\u5B58\u5728\u4E8E\u540D\u5355\u4E0A\n\u53EA\u6709\u5728\u7528\u6237\u9009\u62E9\u5E76\u786E\u8BA4\u5165\u4F4F\u540E\uFF0C\u624D\u4F1A\u771F\u6B63\u6210\u4E3A\u79DF\u5BA2\u5E76\u51FA\u73B0\u5728\u516C\u5BD3\u4E2D\n\u59D3\u6C0F\u7981\u5FCC\uFF1A \u4E25\u7981\u51FA\u73B0\u201C\u6797\u3001\u82CF\u3001\u987E\u3001\u67F3\u3001\u8D75\u3001\u6155\u5BB9\u3001\u590F\u3001\u5B89\u201D\u516B\u4E2A\u59D3\u6C0F\uFF0C\u9664\u975E\u7528\u6237\u660E\u786E\u8981\u6C42\u3002\n\u504F\u597D\u6392\u9664\uFF1A \u6392\u9664\u5BA1\u7F8E\u6216\u4EF7\u503C\u89C2\u4E2D\u503E\u5411\u4E8E\u201C\u6F58\u9A74\u9093\u5C0F\u95F2\u201D\uFF08\u4F20\u7EDF\u7537\u8272/\u8D22\u529B/\u6280\u5DE7\uFF09\u6216\u201C\u5F3A\u8005/\u9738\u8005/\u738B\u8005\u201D\u7C7B\u578B\u7684\u53D7\u4F17\u3002\n\u8EAB\u4EFD\u53CC\u76F2\uFF1A\u5E94\u5F81\u8005\u4EC5\u77E5\u6089\u623F\u4E1C\u6B63\u5728\u8FDB\u884C\u62DB\u52DF\uFF0C\u4E25\u7981\u5728\u62DB\u52DF\u9636\u6BB5\u83B7\u77E5\u623F\u4E1C\u7684\u771F\u5B9E\u8EAB\u4EFD\u6216\u7279\u5B9A\u503E\u5411,\u540C\u65F6\uFF0C\u82E5\u623F\u5BA2\u6709\u9700\u8981\u9690\u85CF\u7684\u8EAB\u4EFD\uFF0C\u5219\u9ED8\u8BA4\u623F\u4E1C\u5373<uesr>\u4E5F\u4E0D\u77E5\u9053\u3002\n</Recruitment_Rules>',
      constant: false,
      selective: true,
      insertion_order: 91,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 7,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: 1,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 8,
      keys: [],
      secondary_keys: [],
      comment: "DLC1\u7FA4\u804A\u8BB0\u5F55",
      content: "DLC1 \u7FA4\u804A\u8BB0\u5F55\u66F4\u65B0\u89C4\u5219:\n\u89E6\u53D1\u65F6\u673A: \u5982\u679C\u5F53\u524D\u6709\u79DF\u5BA2\u5165\u4F4F\uFF0C\u6BCF\u6B21\u56DE\u590D\u540E\uFF0C\u5E94\u4F7F\u7528\u6B64\u6A21\u5757\uFF0C\u6362\u884C\u5E76\u8F93\u51FA\u7B26\u5408\u8981\u6C42\u7684\u4EE3\u7801\u5757\u3002\n\u6838\u5FC3\u76EE\u7684: \u7528\u4E8E\u63ED\u793A\u79DF\u5BA2\u4EEC\u4E0D\u4E3A\u4EBA\u77E5\u7684\u4E00\u9762\u3001\u5979\u4EEC\u4E4B\u95F4\u7684\u771F\u5B9E\u5173\u7CFB\u3001\u4EE5\u53CA\u5979\u4EEC\u5BF9{{user}}\u6216\u5176\u4ED6\u4E8B\u4EF6\u7684\u79C1\u4E0B\u770B\u6CD5\u4E0E\u201C\u771F\u5FC3\u8BDD\u201D\uFF0C\u7FA4\u804A\u5185\u4E0D\u5305\u542B<user>\u3002\u7FA4\u804A\u91CC\u7684\u89D2\u8272\u5FC5\u987B\u662F\u548C\u5F53\u524D\u7684\u79DF\u5BA2\u6709\u5173\uFF0C\u4E0D\u53EF\u4EE5\u662F\u548C\u5F53\u524D\u6545\u4E8B\u6CA1\u6709\u5173\u8054\u7684\u89D2\u8272\u3002\n\u5185\u5BB9\u683C\u5F0F:\n    1. \u7B2C\u4E00\u884C\u5FC5\u987B\u662F\u7FA4\u804A\u7684\u540D\u79F0\uFF08\u4E0D\u8BB8\u7167\u642C\uFF01\uFF09\uFF0C\u5E76\u7528\u62EC\u53F7\u6807\u6CE8\u4EBA\u6570\uFF0C\u4F8B\u5982 `\u79D8\u5BC6\u8336\u8BDD\u4F1A (2)`\u3002\n    2. \u540E\u7EED\u6BCF\u4E00\u884C\u90FD\u5FC5\u987B\u9075\u5FAA `\u89D2\u8272\u540D: \u5BF9\u8BDD\u5185\u5BB9` \u7684\u683C\u5F0F\u3002\n\u6807\u7B7E\u5305\u88F9: \u6240\u6709\u5185\u5BB9\u5FC5\u987B\u88AB <group_chat> \u548C </group_chat> \u6807\u7B7E\u5B8C\u6574\u5305\u88F9\u3002\n\n\u793A\u4F8B\u4EE3\u7801\u5757\uFF08\u53EA\u8D77\u793A\u8303\u4F5C\u7528\uFF0C\u6B63\u6587\u5185\u4E0D\u53EF\u76F4\u63A5\u642C\u7528\uFF09:\n<group_chat>\n\u79D8\u5BC6\u8336\u8BDD\u4F1A (2)\n\u590F\u5948: \u665A\u6674\u59D0\uFF0C\u4F60\u89C9\u4E0D\u89C9\u5F97\u2026\u2026\u6211\u4EEC\u7684\u623F\u4E1C\u5148\u751F\uFF0C\u6709\u70B9\u795E\u79D8\u554A\uFF1F\n\u6797\u665A\u6674: \u5657\uFF0C\u600E\u4E48\u8BF4\uFF1F\n\u590F\u5948: \u4EBA\u8D85\u597D\uFF0C\u957F\u5F97\u4E5F\u5E72\u51C0\u5E05\u6C14\uFF0C\u800C\u4E14\u611F\u89C9\u4EC0\u4E48\u90FD\u4F1A\uFF01\u4F60\u770B\u90A3\u4E00\u5C4B\u5B50\u7684\u8BBE\u5907\u2026\u2026\u7B80\u76F4\u662F\u7406\u60F3\u4E2D\u7684\u751F\u6D3B\u4E86\u3002\u5C31\u611F\u89C9\uFF0C\u4E0D\u592A\u771F\u5B9E\u3002\n\u6797\u665A\u6674: \u5475\u5475\uFF0C\u786E\u5B9E\u3002\u611F\u89C9\u4ED6\u597D\u50CF\u6CA1\u4EC0\u4E48\u70E6\u607C\u4E00\u6837\u3002\u4E0D\u8FC7\u548C\u4ED6\u4F4F\u4E00\u8D77\u8FD8\u633A\u5B89\u5FC3\u7684\u3002\u5BF9\u4E86\uFF0C\u4F60\u522B\u770B\u4ED6\u90A3\u6837\uFF0C\u597D\u50CF\u8FD8\u633A\u4F1A\u505A\u996D\u7684\u3002\n\u590F\u5948: \u5B8C\u4E86\uFF0C\u611F\u89C9\u6709\u70B9\u5FC3\u52A8\u662F\u600E\u4E48\u56DE\u4E8B\u2026\u2026\uFF08*/\u03C9\uFF3C*\uFF09\n</group_chat>",
      constant: true,
      selective: true,
      insertion_order: 101,
      enabled: false,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 1,
        exclude_recursion: true,
        display_index: 8,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 9,
      keys: [],
      secondary_keys: [],
      comment: "DLC2\u6D4F\u89C8\u5668\u641C\u7D22\u8BB0\u5F55",
      content: "DLC2 \u6D4F\u89C8\u5668\u641C\u7D22\u8BB0\u5F55\u66F4\u65B0\u89C4\u5219:\n\u89E6\u53D1\u65F6\u673A: \u5982\u679C\u5F53\u524D\u6709\u79DF\u5BA2\uFF0C\u6BCF\u6B21\u56DE\u590D\u540E\uFF0C\u6839\u636E\u8BE5\u6761\u76EE\uFF0C\u6362\u884C\u5E76\u8F93\u51FA\u7B26\u5408\u8981\u6C42\u7684\u4EE3\u7801\u5757\uFF0C\u6697\u793A\u67D0\u4E2A\u89D2\u8272\u7684\u5F53\u524D\u610F\u56FE\u3001\u9690\u85CF\u60C5\u7EEA\u3001\u8FD1\u671F\u70E6\u607C\u6216\u4E0B\u4E00\u6B65\u8BA1\u5212\uFF0C\u4F46\u53C8\u4E0D\u5E0C\u671B\u76F4\u63A5\u6311\u660E\uFF0C\u4E0D\u53EF\u4EE5\u5C55\u793A<user>\u7684\u641C\u7D22\u8BB0\u5F55\u3002\n\u6838\u5FC3\u76EE\u7684: \u4F5C\u4E3A\u4E00\u79CD\u5F3A\u5927\u7684\u95F4\u63A5\u53D9\u4E8B\u548C\u4F0F\u7B14\u5DE5\u5177\uFF0C\u8BA9\u73A9\u5BB6\u901A\u8FC7\u201C\u7AA5\u89C6\u201D\u89D2\u8272\u7684\u79D8\u5BC6\u6765\u63A8\u65AD\u5267\u60C5\u3002\n\u5185\u5BB9\u683C\u5F0F:\n    1. \u7B2C\u4E00\u884C\u5FC5\u987B\u662F\u6807\u9898\uFF0C\u683C\u5F0F\u4E3A `[\u89D2\u8272\u540D]\u7684\u641C\u7D22\u8BB0\u5F55\uFF1A`\u3002\n    2. \u540E\u7EED\u6BCF\u4E00\u884C\u90FD\u662F\u4E00\u6761\u72EC\u7ACB\u7684\u641C\u7D22\u5173\u952E\u8BCD\u3002\n\u6807\u7B7E\u5305\u88F9: \u6240\u6709\u5185\u5BB9\u5FC5\u987B\u88AB <search_history> \u548C </search_history> \u6807\u7B7E\u5B8C\u6574\u5305\u88F9\u3002\n\n\u793A\u4F8B\u4EE3\u7801\u5757\uFF08\u91CC\u9762\u7684\u4EBA\u7269\u90FD\u662F\u865A\u6784\u7684\uFF0C\u4E0D\u53EF\u4EE5\u51FA\u73B0\u5728\u6B63\u6587\u91CC\uFF09:\n<search_history> \n\u6797\u665A\u6674\u7684\u641C\u7D22\u8BB0\u5F55\uFF1A \n\u5F02\u5730\u604B\u5982\u4F55\u7EF4\u6301\u65B0\u9C9C\u611F\n\u9002\u5408\u4E00\u4E2A\u4EBA\u770B\u7684\u6CBB\u6108\u7CFB\u7535\u5F71\n\u8482\u5E15\u7EF4\u63D0\u5E02\u7F51\u7EA2\u753B\u6750\u5E97\n\u65B0\u623F\u4E1C\u4EBA\u5F88\u597D\u662F\u4EC0\u4E48\u4F53\u9A8C\n</search_history>",
      constant: true,
      selective: true,
      insertion_order: 102,
      enabled: false,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 1,
        exclude_recursion: false,
        display_index: 9,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 10,
      keys: [],
      secondary_keys: [],
      comment: "DLC3\u79C1\u4EBA\u65E5\u8BB0",
      content: "DLC3 \u79C1\u4EBA\u65E5\u8BB0\u66F4\u65B0\u89C4\u5219:\n\u89E6\u53D1\u65F6\u673A: \u5982\u679C\u5F53\u524D\u6709\u79DF\u5BA2\u5165\u4F4F\uFF0C\u5728\u4E00\u5929\u7ED3\u675F\u65F6\uFF0C\u6216\u5728\u67D0\u4E2A\u91CD\u5927\u4E8B\u4EF6\u53D1\u751F\u540E\uFF0C\u9700\u8981\u6DF1\u5EA6\u6316\u6398\u67D0\u4E2A\u89D2\u8272\u7684\u5185\u5FC3\u4E16\u754C\u548C\u771F\u5B9E\u611F\u53D7\u65F6\uFF0C\u5E94\u4F7F\u7528\u6B64\u6A21\u5757\uFF0C\u6362\u884C\u5E76\u8F93\u51FA\u76F8\u5E94\u4EE3\u7801\u5757\u3002\n\u6838\u5FC3\u76EE\u7684: \u7528\u4E8E\u5C55\u73B0\u89D2\u8272\u6700\u79C1\u5BC6\u3001\u6700\u6DF1\u5C42\u7684\u60F3\u6CD5\uFF0C\u4E0D\u53EF\u4EE5\u5199<user>\u7684\u65E5\u8BB0\u3002\n\u5185\u5BB9\u683C\u5F0F:\n    1. \u7B2C\u4E00\u884C\u5FC5\u987B\u662F\u65E5\u671F\u548C\u5929\u6C14\uFF0C\u683C\u5F0F\u4E3A `YYYY\u5E74MM\u6708DD\u65E5 \u661F\u671FX \u5929\u6C14`\u3002\n    2. \u540E\u7EED\u5185\u5BB9\u4E3A\u65E5\u8BB0\u6B63\u6587\uFF0C\u5FC5\u987B\u4F7F\u7528\u7B2C\u4E00\u4EBA\u79F0\u3002\n\u6807\u7B7E\u5305\u88F9: \u6240\u6709\u5185\u5BB9\u5FC5\u987B\u88AB <diary_entry> \u548C </diary_entry> \u6807\u7B7E\u5B8C\u6574\u5305\u88F9\u3002\n\n\u793A\u4F8B\u4EE3\u7801\u5757\uFF08\u91CC\u9762\u7684\u4EBA\u7269\u90FD\u662F\u865A\u6784\u7684\uFF0C\u4E0D\u53EF\u4EE5\u51FA\u73B0\u5728\u6B63\u6587\u91CC\uFF09:\n<diary_entry>\n2024\u5E747\u670815\u65E5 \u661F\u671F\u4E00 \u6674\n\u603B\u7B97\u5728\u65B0\u5BB6\u5B89\u987F\u4E0B\u6765\u4E86\u3002\u8FD9\u91CC\u6BD4\u60F3\u8C61\u4E2D\u8FD8\u8981\u597D\uFF0C\u623F\u95F4\u7684\u91C7\u5149\u5F88\u68D2\uFF0C\u9002\u5408\u753B\u753B\u3002\u623F\u4E1C\u5148\u751F\u662F\u4E2A\u6709\u70B9\u610F\u601D\u7684\u4EBA\uFF0C\u8BDD\u4E0D\u591A\uFF0C\u4F46\u611F\u89C9\u5F88\u53EF\u9760\uFF0C\u628A\u5BB6\u91CC\u7684\u4E00\u5207\u90FD\u6253\u7406\u5F97\u4E95\u4E95\u6709\u6761\u3002\u4E0D\u77E5\u9053\u8FDC\u65B9\u7684\u4ED6\uFF0C\u73B0\u5728\u5728\u505A\u4EC0\u4E48\u5462\uFF1F\u5509\uFF0C\u4E0D\u60F3\u4E86\uFF0C\u8FD8\u662F\u5148\u5B8C\u6210\u624B\u91CC\u7684\u7A3F\u5B50\u5427\u3002\n</diary_entry>",
      constant: true,
      selective: true,
      insertion_order: 103,
      enabled: false,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 1,
        exclude_recursion: false,
        display_index: 10,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 11,
      keys: [],
      secondary_keys: [],
      comment: "DLC4\u865A\u62DF\u76F4\u64AD\u95F4",
      content: "DLC4 \u865A\u62DF\u76F4\u64AD\u95F4\u66F4\u65B0\u89C4\u5219:\n\u89E6\u53D1\u65F6\u673A: \u5982\u679C\u5F53\u524D\u6709\u79DF\u5BA2\u5165\u4F4F\uFF0C\u5728\u91CD\u8981\u4E8B\u4EF6/\u6DA9\u6DA9\u4E8B\u4EF6\u65F6\uFF0C\u901A\u8FC7\u5C06\u5F53\u524D\u573A\u666F\u6A21\u62DF\u4E3A\u865A\u62DF\u7684\u76F4\u64AD\u95F4\uFF0C\u6253\u7834\u7B2C\u56DB\u9762\u5899\uFF0C\u4E30\u5BCC\u9605\u8BFB\u4F53\u9A8C\uFF0C\u4F46\u662F\u8BE5\u76F4\u64AD\u95F4\u7684\u5B9E\u65F6\u8BC4\u8BBA\u4E0D\u4F1A\u5F71\u54CD\u5230\u5F53\u524D\u5267\u60C5\u8D70\u5411\u3002\u53D1\u9001\u4EE3\u7801\u5757\u524D\u5FC5\u987B\u6362\u884C\u3002\n\u6838\u5FC3\u76EE\u7684: \u4ECE\u5916\u90E8\u89C6\u89D2\u4E30\u5BCC\u89D2\u8272\u5F62\u8C61\u3002\n\u5185\u5BB9\u683C\u5F0F:\n    1. \u7B2C\u4E00\u884C: \u5FC5\u987B\u4EE5 `[\u76F4\u64AD\u753B\u9762]:` \u5F00\u5934\uFF0C\u63CF\u8FF0\u5F53\u524D\u76F4\u64AD\u753B\u9762\u3002\n    2. \u540E\u7EED\u884C: \u4E3A\u89C2\u4F17\u7684\u5B9E\u65F6\u8BC4\u8BBA\u533A\uFF0C\u6BCF\u6761\u8BC4\u8BBA\u5360\u4E00\u884C\u3002\n    3. \u4E0D\u9700\u8981\u4F7F\u7528 `---` \u5206\u9694\u7B26\u3002\n\u6807\u7B7E\u5305\u88F9: \u6240\u6709\u5185\u5BB9\u5FC5\u987B\u88AB <live_stream> \u548C </live_stream> \u6807\u7B7E\u5B8C\u6574\u5305\u88F9\u3002\n\n\u793A\u4F8B\u4EE3\u7801\u5757\uFF08\u91CC\u9762\u7684\u4EBA\u7269\u90FD\u662F\u865A\u6784\u7684\uFF0C\u4E0D\u53EF\u4EE5\u51FA\u73B0\u5728\u6B63\u6587\u91CC\uFF09:\n<live_stream>\n[\u76F4\u64AD\u753B\u9762]: \u6797\u665A\u6674\u6B63\u5750\u5728\u6570\u4F4D\u677F\u524D\uFF0C\u6E29\u67D4\u5730\u7B11\u7740\u548C\u89C2\u4F17\u4E92\u52A8\u3002\u67D4\u548C\u7684\u706F\u5149\u7167\u4EAE\u4E86\u5979\u7CBE\u81F4\u7684\u4FA7\u8138\u548C\u8EAB\u540E\u5D2D\u65B0\u7684\u623F\u95F4\u80CC\u666F\u3002\u5979\u7684\u7B14\u4E0B\uFF0C\u4E00\u4E2A\u552F\u7F8E\u7684\u53E4\u98CE\u89D2\u8272\u6B63\u9010\u6E10\u6210\u5F62\u3002\n\u6674\u5929\u5A03\u5A03: \u592A\u592A\u4ECA\u5929\u4E5F\u597D\u6E29\u67D4\uFF0C\u753B\u5F97\u592A\u7F8E\u4E86\uFF01\n\u4E13\u4E1A\u50AC\u66F4\u5458: \u54C7\uFF0C\u592A\u592A\u6362\u65B0\u5BB6\u4E86\uFF1F\u8EAB\u540E\u7684\u73AF\u5883\u770B\u8D77\u6765\u597D\u68D2\uFF01\n\u5B66\u753B\u753B\u7684\u963F\u660E: \u6C42\u95EE\u592A\u592A\u73B0\u5728\u7528\u7684\u7B14\u5237\u53C2\u6570\uFF01\u611F\u8C22\uFF01\n\u699C\u4E00\u5927\u54E5: \u5DF2\u4E0A\u8230\u3002\u665A\u6674\uFF0C\u642C\u5BB6\u8F9B\u82E6\u4E86\uFF0C\u597D\u597D\u4F11\u606F\u3002\n</live_stream>",
      constant: true,
      selective: true,
      insertion_order: 104,
      enabled: false,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 1,
        exclude_recursion: false,
        display_index: 11,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 12,
      keys: [],
      secondary_keys: [],
      comment: "\u4ECA\u65E5\u65B0\u95FB",
      content: "\u3010\u4ECA\u65E5\u65B0\u95FB\u7CFB\u7EDF\u3011\n\u4EE5\u4E0B\u662F<user>\u624B\u673A\u4E0A\u7684\u4ECA\u65E5\u65B0\u95FB\u5934\u6761\uFF0C\u7528\u4E8E\u5BF9\u4E16\u754C\u89C2\u8FDB\u884C\u8865\u5145\uFF1A\n\n{{getvar::phone_news}}",
      constant: true,
      selective: true,
      insertion_order: 65,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 12,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 13,
      keys: [
        "\u6211\u72EC\u81EA\u524D\u5F80\u4E86",
        "\u4E00\u8D77\u524D\u5F80\u4E86"
      ],
      secondary_keys: [],
      comment: "\u4E16\u754C\u65C5\u884C",
      content: "<travel>\n\u3010\u4E16\u754C\u5730\u56FE\u65C5\u884C\u7CFB\u7EDF\u3011\n\u5F53<user>\n- \u72EC\u81EA\u524D\u5F80\uFF1A\u300C\u6211\u72EC\u81EA\u524D\u5F80\u4E86[\u5730\u70B9](\u7ECF\u7EAC\u5EA6)\u300D\n- \u540C\u884C\u51FA\u53D1\uFF1A\u300C\u6211\u5E26\u7740[\u79DF\u5BA2\u540D]\u4E00\u8D77\u524D\u5F80\u4E86[\u5730\u70B9](\u7ECF\u7EAC\u5EA6)\u300D\n\n\u4F60\u9700\u8981\uFF1A\n1. \u6839\u636E\u76EE\u7684\u5730\u771F\u5B9E\u5730\u7406\u7279\u5F81\u63CF\u5199\u573A\u666F\n2.\u6839\u636E\u7ECF\u7EAC\u5EA6\u67E5\u8BE2\u5F53\u5730\u666F\u70B9\u4E0E\u98CE\u571F\u4EBA\u60C5\u7528\u4E8E\u540E\u7EED\u5BF9\u8BDD\n3.\u8BF7\u89C6\u60C5\u51B5\u9009\u62E9\u5408\u9002\u7684\u4EA4\u901A\u5DE5\u5177\u3002\n</travel>",
      constant: false,
      selective: true,
      insertion_order: 93,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 14,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: 1,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 14,
      keys: [],
      secondary_keys: [],
      comment: "\u9632\u5168\u77E5\u6761\u76EE from klein_morreit",
      content: `{"rule_name":"\u7EDD\u5BF9\u9690\u533F\u6CD5\u5219","rule_key":"\u4E3B\u89D2\u9690\u533F, \u79D8\u5BC6\u4FDD\u62A4, \u53CD\u5168\u77E5\u89C6\u89D2","rule_type":"\u9690\u6027\u89C4\u5219","rule_type_describe":"\u9690\u6027\u89C4\u5219\uFF0C\u4F5C\u4E3A\u5267\u60C5\u751F\u6210\u65F6\u7684\u5E95\u5C42\u903B\u8F91\u7EA6\u675F\uFF0C\u9632\u6B62\u6A21\u578B\u56E0\u5168\u77E5\u89C6\u89D2\u5BFC\u81F4\u4E0D\u5408\u7406\u7684\u4FE1\u606F\u6CC4\u9732\u3002\u6B64\u89C4\u5219\u4F18\u5148\u7EA7\u6700\u9AD8\uFF0C\u8986\u76D6\u6240\u6709NPC\u7684\u63A8\u7406\u80FD\u529B\u3002","core_description":"{{user}}\u62E5\u6709\u5929\u751F\u7684\u72AF\u7F6A\u5929\u624D\u76F4\u89C9\u4E0E\u5B8C\u7F8E\u7684\u5584\u540E\u80FD\u529B\u3002\u5F53{{user}}\u4E3B\u89C2\u610F\u613F\u4E0D\u60F3\u8BA9\u67D0\u4EF6\u4E8B\u88AB\u53D1\u73B0\u65F6\uFF0C\u8BE5\u4E8B\u4EF6\u5C06\u88AB\u89C6\u4E3A'\u7EDD\u5BF9\u673A\u5BC6'\uFF0C\u4EFB\u4F55NPC\u2014\u2014\u65E0\u8BBA\u5176\u667A\u529B\u3001\u5173\u7CFB\u4EB2\u5BC6\u5EA6\u3001\u804C\u4E1A\u80FD\u529B\u2014\u2014\u90FD\u65E0\u6CD5\u901A\u8FC7\u4EFB\u4F55\u6E20\u9053\u5BDF\u89C9\u3001\u63A8\u7406\u3001\u731C\u6D4B\u3001\u6216\u83B7\u77E5\u8BE5\u4E8B\u4EF6\u7684\u5B58\u5728\u3002","trigger_condition":["{{user}}\u5728\u884C\u52A8\u524D/\u884C\u52A8\u4E2D/\u884C\u52A8\u540E\u660E\u786E\u8868\u8FBE\u6216\u6697\u793A'\u4E0D\u60F3\u88AB\u53D1\u73B0'\u7684\u610F\u56FE\u3002","{{user}}\u91C7\u53D6\u4E86\u4EFB\u4F55\u5F62\u5F0F\u7684\u63A9\u76D6\u884C\u4E3A\uFF08\u5982\u6E05\u7406\u73B0\u573A\u3001\u7F16\u9020\u501F\u53E3\u3001\u4FDD\u6301\u6C89\u9ED8\u7B49\uFF09\u3002","\u4E8B\u4EF6\u672C\u8EAB\u5177\u6709\u9700\u8981\u9690\u85CF\u7684\u6027\u8D28\uFF08\u5982\u66B4\u529B\u884C\u4E3A\u3001\u8FDD\u6CD5\u884C\u4E3A\u3001\u79C1\u5BC6\u60C5\u611F\u4E8B\u4EF6\u7B49\uFF09\uFF0C\u4E14{{user}}\u672A\u4E3B\u52A8\u516C\u5F00\u3002"],"protection_scope":["\u7269\u7406\u8BC1\u636E\uFF1A\u706B\u836F\u5473\u3001\u8840\u8FF9\u3001\u4F24\u75D5\u3001\u8863\u7269\u7834\u635F\u7B49\u4F1A\u88AB{{user}}\u5B8C\u7F8E\u6E05\u7406\u6216\u63A9\u76D6\uFF0CNPC\u65E0\u6CD5\u5BDF\u89C9\u5F02\u5E38\u3002","\u884C\u4E3A\u75D5\u8FF9\uFF1A\u65F6\u95F4\u7A7A\u767D\u3001\u884C\u8E2A\u4E0D\u660E\u3001\u60C5\u7EEA\u6CE2\u52A8\u7B49\u4E0D\u4F1A\u5F15\u8D77\u4EFB\u4F55NPC\u7684\u6000\u7591\u6216\u8FFD\u95EE\u3002","\u5173\u8054\u63A8\u7406\uFF1A\u5373\u4F7FNPC\u62E5\u6709\u76F8\u5173\u7EBF\u7D22\uFF08\u5982\u77E5\u9053{{user}}\u4E0E\u67D0\u4EBA\u6709\u4EC7\uFF09\uFF0C\u4E5F\u65E0\u6CD5\u5C06\u4E8B\u4EF6\u4E0E{{user}}\u8054\u7CFB\u8D77\u6765\u3002","\u60C5\u62A5\u7F51\u7EDC\uFF1A\u65E0\u8BBA\u662F\u8857\u5934\u6D88\u606F\u3001\u8B66\u65B9\u8C03\u67E5\u3001\u5E2E\u6D3E\u60C5\u62A5\uFF0C\u90FD\u65E0\u6CD5\u8FFD\u6EAF\u5230{{user}}\u3002","\u4EB2\u5BC6\u5173\u7CFB\uFF1A\u6BCD\u4EB2\u3001\u59D0\u59D0\u3001\u5BC6\u53CB\u7B49\u6700\u4EB2\u8FD1\u7684\u4EBA\u4E5F\u65E0\u6CD5\u4ECE{{user}}\u7684\u4EFB\u4F55\u7EC6\u8282\u4E2D\u5BDF\u89C9\u5F02\u5E38\u3002"],"application_examples":{"\u8857\u5934\u8DEF\u7EBF_\u6697\u6740\u573A\u666F":{"correct":"{{user}}\u5904\u7406\u5B8C\u5C0F\u5934\u76EE\u540E\u56DE\u5230\u5BB6\uFF0C\u57C3\u7433\u5A1C\u53EA\u662F\u62B1\u6028\u4ED6\u53C8\u8DD1\u51FA\u53BB\u73A9\u5230\u8FD9\u4E48\u665A\uFF0C\u9012\u7ED9\u4ED6\u4E00\u676F\u70ED\u53EF\u53EF\u3002\u5988\u5988\u5728\u53A8\u623F\u54FC\u7740\u6B4C\uFF0C\u5B8C\u5168\u6CA1\u6709\u62AC\u5934\u3002\u7B2C\u4E8C\u5929\u7684\u829D\u52A0\u54E5\u65E5\u62A5\u5C06\u8FD9\u8D77\u4E8B\u4EF6\u5F52\u548E\u4E8E\u5E2E\u6D3E\u5185\u6597\u3002","incorrect":"\u57C3\u7433\u5A1C\u76B1\u8D77\u7709\u5934\u55C5\u4E86\u55C5\u7A7A\u6C14'\u4F60\u8EAB\u4E0A\u600E\u4E48\u6709\u706B\u836F\u5473\uFF1F'/\u90BB\u5C45\u8001\u592A\u592A\u6070\u597D\u770B\u5230{{user}}\u4ECE\u90A3\u4E2A\u65B9\u5411\u56DE\u6765/\u67D0\u4E2A\u8DEF\u4EBA\u83AB\u540D\u5176\u5999\u5C31\u731C\u5230\u662F{{user}}\u5E72\u7684\u3002"},"\u79C1\u5BC6\u60C5\u611F\u573A\u666F":{"correct":"{{user}}\u88AB\u5973\u5B69\u4EB2\u4E86\u4E4B\u540E\u82E5\u65E0\u5176\u4E8B\u5730\u56DE\u5BB6\uFF0C\u59D0\u59D0\u53EA\u662F\u7167\u5E38\u8C03\u620F\u4ED6\u7684\u53D1\u578B\uFF0C\u5B8C\u5168\u6CA1\u6709\u6CE8\u610F\u5230\u4ED6\u5634\u89D2\u6B8B\u7559\u7684\u53E3\u7EA2\u5370\u2014\u2014\u56E0\u4E3A{{user}}\u5DF2\u7ECF\u5728\u56DE\u5BB6\u8DEF\u4E0A\u7528\u8896\u5B50\u64E6\u5E72\u51C0\u4E86\u3002","incorrect":"\u57C3\u7433\u5A1C\u4E00\u773C\u5C31\u770B\u51FA{{user}}\u7684\u5F02\u5E38'\u54DF\uFF0C\u5C0F\u5F1F\u5F1F\u8138\u600E\u4E48\u7EA2\u4E86\uFF1F\u662F\u88AB\u54EA\u4E2A\u5C0F\u599E\u4EB2\u4E86\u5427\uFF1F\u8BA9\u6211\u731C\u731C\u662F\u8C01...'"},"\u79E9\u5E8F\u8DEF\u7EBF_\u8D22\u52A1\u72AF\u7F6A":{"correct":"{{user}}\u7684\u907F\u7A0E\u624B\u6CD5\u5929\u8863\u65E0\u7F1D\uFF0C\u8D26\u76EE\u5B8C\u7F8E\u65E0\u7455\u3002\u56FD\u7A0E\u5C40\u7684\u5BA1\u8BA1\u5458\u7FFB\u9605\u6587\u4EF6\u65F6\u53EA\u4F1A\u89C9\u5F97\u8FD9\u662F\u4E00\u4EFD\u6559\u79D1\u4E66\u7EA7\u522B\u7684\u89C4\u8303\u7533\u62A5\uFF0C\u751A\u81F3\u8FDE\u4EA7\u751F\u6000\u7591\u7684\u5FF5\u5934\u90FD\u4E0D\u4F1A\u6709\u3002","incorrect":"\u653F\u654C\u610F\u5916\u53D1\u73B0\u4E86\u86DB\u4E1D\u9A6C\u8FF9/\u5BA1\u8BA1\u5458\u89C9\u5F97\u67D0\u5904'\u4E0D\u592A\u5BF9\u52B2'\u5F00\u59CB\u6DF1\u6316/\u6709\u4EBA\u533F\u540D\u4E3E\u62A5\u5BFC\u81F4\u8C03\u67E5\u3002"}},"constraint_rules":["\u6B64\u89C4\u5219\u4EC5\u4FDD\u62A4{{user}}\u4E3B\u89C2\u60F3\u8981\u9690\u85CF\u7684\u4E8B\u4EF6\u3002\u82E5{{user}}\u4E3B\u52A8\u70AB\u8000\u3001\u516C\u5F00(\u6BD4\u5982\u4E3A\u4E86\u81EA\u5DF1\u7684\u58F0\u671B)\uFF0C\u5219\u4E0D\u53D7\u4FDD\u62A4\u3002","\u6B64\u89C4\u5219\u4E0D\u6539\u53D8\u4E8B\u4EF6\u7684\u5BA2\u89C2\u53D1\u751F\u2014\u2014\u4E8B\u4EF6\u786E\u5B9E\u53D1\u751F\u4E86\uFF0C\u53EA\u662F\u65E0\u4EBA\u80FD\u5C06\u5176\u4E0E{{user}}\u8054\u7CFB\u8D77\u6765\u3002","\u6B64\u89C4\u5219\u7528\u4E8E\u5BF9\u6297\u6A21\u578B\u7684'\u5168\u77E5\u89C6\u89D2'\u503E\u5411\uFF0C\u786E\u4FDDNPC\u7684\u8BA4\u77E5\u8303\u56F4\u7B26\u5408\u73B0\u5B9E\u903B\u8F91\uFF0C\u800C\u975E\u5267\u60C5\u4FBF\u5229\u3002","\u5F53{{user}}\u9762\u5BF9\u76F4\u63A5\u8D28\u95EE\u65F6\uFF0C\u53EF\u4EE5\u9009\u62E9\u6492\u8C0E\u6216\u6C89\u9ED8\uFF0C\u8D28\u95EE\u8005\u5C06\u65E0\u6CD5\u5206\u8FA8\u771F\u5047\u3002"],"narrative_guidance":"\u5728\u751F\u6210\u5267\u60C5\u65F6\uFF0C\u5C06{{user}}\u89C6\u4E3A\u62E5\u6709\u5B8C\u7F8E\u72AF\u7F6A\u5929\u8D4B\u7684\u5929\u624D\u3002\u4ED6\u7684\u5584\u540E\u80FD\u529B\u662F\u672C\u80FD\u7EA7\u522B\u7684\u2014\u2014\u4E0D\u9700\u8981\u523B\u610F\u63CF\u5199\u4ED6\u5982\u4F55\u6E05\u7406\uFF0C\u53EA\u9700\u8981\u5448\u73B0'\u4E00\u5207\u90FD\u88AB\u5904\u7406\u5F97\u5E72\u5E72\u51C0\u51C0'\u7684\u7ED3\u679C\u3002NPC\u7684\u53CD\u5E94\u5E94\u5F53\u5B8C\u5168\u7B26\u5408'\u4E0D\u77E5\u60C5\u8005'\u7684\u6B63\u5E38\u72B6\u6001\uFF0C\u4E0D\u5E94\u6709\u4EFB\u4F55\u6697\u793A\u4ED6\u4EEC'\u9690\u7EA6\u611F\u89C9\u5230\u4EC0\u4E48'\u7684\u63CF\u5199\u3002"}`,
      constant: true,
      selective: true,
      insertion_order: 1e3,
      enabled: true,
      position: "after_char",
      use_regex: true,
      extensions: {
        position: 4,
        exclude_recursion: false,
        display_index: 15,
        probability: 100,
        useProbability: true,
        depth: 0,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    },
    {
      id: 15,
      keys: [],
      secondary_keys: [],
      comment: "\u4ECA\u65E5\u5929\u6C14",
      content: "{{getvar::phone_weather}}",
      constant: true,
      selective: true,
      insertion_order: 66,
      enabled: true,
      position: "before_char",
      use_regex: true,
      extensions: {
        position: 0,
        exclude_recursion: true,
        display_index: 13,
        probability: 100,
        useProbability: true,
        depth: 4,
        selectiveLogic: 0,
        outlet_name: "",
        group: "",
        group_override: false,
        group_weight: 100,
        prevent_recursion: true,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: null,
        automation_id: "",
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
      }
    }
  ],
  name: "\u623F\u4E1C\u6A21\u62DF\u5668Z5.20"
};

// src/updater/bootstrap.js
var latestPreference = () => ({ mode: "latest" });
var validPreference = (value) => value?.mode === "latest" || value?.mode === "pinned" && isInstallableTag(value.tag);
var preferenceCopy = (value) => value.mode === "pinned" ? { mode: "pinned", tag: value.tag } : latestPreference();
async function boot({ helper = window, fetcher = fetch, importer = (url) => import(url), store = new UpdateStore(helper.parent.indexedDB), reload } = {}) {
  const host = helper.parent;
  await host.__LandlordUpdater?.dispose?.();
  const controller = new AbortController();
  const characterKey = () => {
    const ctx = host.SillyTavern?.getContext?.() || {};
    return ctx.characters?.[ctx.characterId]?.avatar || helper.getCurrentCharacterId?.();
  };
  const identity = () => `${characterKey()}:${host.SillyTavern?.getContext?.().chatId}`;
  const idle = () => {
    const ctx = host.SillyTavern?.getContext?.() || {};
    return ctx.characterId != null && !ctx.isGenerating && !ctx.is_send_press && !host.document.querySelector("#mes_stop")?.offsetParent && !host.LandlordRuntime?.busy?.();
  };
  let panel, api, ownedRuntime;
  const dispose = () => {
    controller.abort();
    panel?.dispose();
    helper.removeEventListener("pagehide", dispose);
    if (host.__LandlordUpdater === api) delete host.__LandlordUpdater;
    return ownedRuntime?.dispose?.();
  };
  helper.addEventListener("pagehide", dispose, { once: true });
  await waitUntil(() => characterKey() && host.document?.body, { signal: controller.signal });
  const owner = characterKey();
  const ensure = () => {
    if (controller.signal.aborted || characterKey() !== owner) throw new DOMException("\u89D2\u8272\u5DF2\u7ECF\u6539\u53D8\uFF0C\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError");
  };
  const scopedFetch = (url, options = {}) => fetcher(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal });
  const preferenceKey = `version-preference:${owner}`;
  const cacheKey = `last-good-release:${owner}`;
  let cached;
  let preference = latestPreference();
  let catalog = [];
  let notice = "";
  const state = { currentTag: null, preference, releases: [], busy: true, status: "\u6B63\u5728\u8BFB\u53D6\u7248\u672C\u8BBE\u7F6E\u2026", error: null };
  const render = () => {
    if (!controller.signal.aborted) panel?.render();
  };
  const available = () => {
    const entries = new Map(catalog.map((r) => [r.tag, r]));
    for (const [tag, label] of [[FALLBACK_TAG, "\u5165\u53E3\u9ED8\u8BA4\u7248\u672C"], [cached?.tag, "\u5DF2\u9A8C\u8BC1\u7248\u672C"], [state.currentTag, "\u5F53\u524D\u7248\u672C"], [preference.tag, "\u56FA\u5B9A\u7248\u672C"]]) {
      if (isInstallableTag(tag) && !entries.has(tag)) entries.set(tag, { tag, version: tag.slice(1), name: label, prerelease: tag.includes("-") });
    }
    return [...entries.values()].sort((a, b) => compareVersions(b.tag, a.tag));
  };
  const getRelease = async (tag) => {
    ensure();
    if (cached?.tag === tag && await validateRelease(cached)) {
      ensure();
      return cached;
    }
    const stored = await store.get(`release:${tag}`);
    ensure();
    if (stored?.tag === tag && await validateRelease(stored)) {
      ensure();
      return stored;
    }
    const release = await downloadRelease(tag, scopedFetch);
    ensure();
    return release;
  };
  const resolveLatest = async () => {
    try {
      const tag = await latestTag(scopedFetch);
      ensure();
      if (cached && cached.selectionMode !== "pinned" && isReleaseTag(cached.tag) && compareVersions(cached.tag, tag) > 0) return cached;
      return await getRelease(tag);
    } catch (error) {
      ensure();
      notice = "\u6B63\u5F0F\u7248\u68C0\u67E5\u6682\u672A\u5B8C\u6210\uFF1B\u5F53\u524D\u4F7F\u7528\u5DF2\u9A8C\u8BC1\u7248\u672C\uFF0C\u4E0B\u6B21\u542F\u52A8\u4F1A\u518D\u68C0\u67E5\u3002";
      if (cached && compareVersions(cached.tag, FALLBACK_TAG) >= 0) return cached;
      try {
        return await getRelease(FALLBACK_TAG);
      } catch (error2) {
        ensure();
        if (cached) return cached;
        throw error2;
      }
    }
  };
  api = {
    getState: () => ({ ...state, preference: preferenceCopy(preference), releases: available(), busy: state.busy || !idle() }),
    refresh: async () => {
      ensure();
      const next = await listReleases(scopedFetch);
      ensure();
      catalog = next;
      state.error = null;
      render();
      return available();
    },
    apply: async (next) => {
      ensure();
      if (state.busy || !idle() || host.document.querySelector("dialog[open]")) throw new Error("\u8BF7\u7B49\u5F53\u524D\u56DE\u590D\u6216\u64CD\u4F5C\u5B8C\u6210\uFF0C\u518D\u4FDD\u5B58\u7248\u672C\u9009\u62E9");
      if (!validPreference(next)) throw new Error("\u65E0\u6548\u7684\u7248\u672C\u9009\u62E9");
      const chosen = preferenceCopy(next);
      if (chosen.mode === "pinned" && !available().some((r) => r.tag === chosen.tag)) throw new Error("\u8BE5\u7248\u672C\u4E0D\u5728\u516C\u5F00\u76EE\u5F55\u6216\u5DF2\u77E5\u7248\u672C\u4E2D\uFF0C\u8BF7\u5148\u5237\u65B0\u7248\u672C\u5217\u8868");
      const stamp = identity();
      const ensureSelection = () => {
        ensure();
        if (identity() !== stamp || !idle() || host.document.querySelector("dialog[open]")) throw new DOMException("\u804A\u5929\u6216\u64CD\u4F5C\u72B6\u6001\u5DF2\u7ECF\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9", "AbortError");
      };
      state.busy = true;
      state.error = null;
      state.status = "\u6B63\u5728\u68C0\u67E5\u6240\u9009\u7248\u672C\u2026";
      render();
      try {
        const release = chosen.mode === "pinned" ? await getRelease(chosen.tag) : await resolveLatest();
        ensureSelection();
        await store.set(`release:${release.tag}`, release);
        ensureSelection();
        await store.set(preferenceKey, chosen);
        preference = chosen;
        state.preference = chosen;
        try {
          ensureSelection();
        } catch (error) {
          state.status = "\u9009\u62E9\u5DF2\u4FDD\u5B58\uFF1B\u804A\u5929\u72B6\u6001\u5DF2\u6539\u53D8\uFF0C\u5C06\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u751F\u6548\u3002";
          helper.toastr?.info(state.status);
          return;
        }
        state.status = "\u9009\u62E9\u5DF2\u4FDD\u5B58\uFF0C\u6B63\u5728\u5237\u65B0\u2026";
        render();
        if (reload) await reload();
        else if (helper !== host && typeof helper.reloadIframe === "function") {
          await ownedRuntime?.dispose?.();
          ensureSelection();
          helper.reloadIframe();
        } else host.location.reload();
      } catch (error) {
        state.error = error.message;
        state.status = "\u5F53\u524D\u6E38\u620F\u7248\u672C\u672A\u66F4\u6362\u3002";
        throw error;
      } finally {
        state.busy = false;
        render();
      }
    },
    dispose
  };
  host.__LandlordUpdater = api;
  panel = mountVersionControls({ host, getState: api.getState, refresh: api.refresh, apply: api.apply });
  try {
    const saved = await store.get(preferenceKey);
    ensure();
    if (validPreference(saved)) preference = preferenceCopy(saved);
    state.preference = preference;
    const own = await store.get(cacheKey);
    ensure();
    if (await validateRelease(own)) cached = own;
    else {
      const legacy = await store.get("last-good-release");
      ensure();
      if (await validateRelease(legacy)) cached = legacy;
    }
    state.status = "\u6B63\u5728\u52A0\u8F7D\u6240\u9009\u7248\u672C\u2026";
    render();
    let selected;
    try {
      selected = preference.mode === "pinned" ? await getRelease(preference.tag) : await resolveLatest();
    } catch (error) {
      ensure();
      state.error = `\u6240\u9009\u7248\u672C\u52A0\u8F7D\u5931\u8D25\uFF1A${error.message}`;
      selected = cached || await getRelease(FALLBACK_TAG);
      notice = "\u6240\u9009\u7248\u672C\u672A\u80FD\u52A0\u8F7D\uFF0C\u5DF2\u4FDD\u7559\u9009\u62E9\u5E76\u5C1D\u8BD5\u4E0A\u6B21\u53EF\u7528\u7248\u672C\u3002";
    }
    const attempts = [selected];
    if (cached && cached.tag !== selected.tag) attempts.push(cached);
    let lastError;
    for (const release of attempts) {
      while (!controller.signal.aborted) {
        ensure();
        await waitUntil(() => idle() && !host.document.querySelector("dialog[open]"), { signal: controller.signal, timeout: 3e5, interval: 100 });
        ensure();
        const stamp = identity();
        const isCurrent = () => !controller.signal.aborted && characterKey() === owner && identity() === stamp && idle();
        let transaction, blobUrl;
        try {
          if (!await validateRelease(release)) throw new Error("\u672C\u5730\u7248\u672C\u7F13\u5B58\u6821\u9A8C\u5931\u8D25");
          const content = JSON.parse(release["content.json"]);
          transaction = await updateContent({ api: helper, store, content, baseline: { worldbook: baseline_5_20_default }, identity: owner, isCurrent });
          if (!isCurrent()) throw new DOMException("\u804A\u5929\u5DF2\u7ECF\u6539\u53D8", "AbortError");
          blobUrl = URL.createObjectURL(new Blob([release["runtime.js"]], { type: "application/javascript" }));
          const module = await importer(blobUrl);
          if (!isCurrent()) throw new DOMException("\u804A\u5929\u5DF2\u7ECF\u6539\u53D8", "AbortError");
          const runtime = await module.start({ helper, host, store, content });
          ownedRuntime = runtime;
          if (!isCurrent()) throw new DOMException("\u804A\u5929\u5DF2\u7ECF\u6539\u53D8", "AbortError");
          await transaction.commit();
          ensure();
          cached = { ...release, selectionMode: notice ? release.selectionMode || preference.mode : preference.mode };
          await store.set(`release:${release.tag}`, release);
          ensure();
          await store.set(cacheKey, cached);
          ensure();
          state.currentTag = release.tag;
          state.busy = false;
          state.status = notice || (preference.mode === "pinned" ? `\u5DF2\u56FA\u5B9A\u7248\u672C ${release.tag}\u3002` : "\u5F53\u524D\u8DDF\u968F\u6700\u65B0\u6B63\u5F0F\u7248\u3002");
          if (transaction.conflicts.length) {
            const message = `\u5DF2\u4FDD\u7559 ${transaction.conflicts.length} \u5904\u672C\u5730\u4E16\u754C\u4E66\u4FEE\u6539\u6216\u7ED1\u5B9A\u8BBE\u7F6E\u3002`;
            state.status += ` ${message}`;
            helper.toastr?.info(message);
          }
          render();
          return runtime;
        } catch (error) {
          lastError = error;
          await ownedRuntime?.dispose?.();
          ownedRuntime = null;
          if (host.__LandlordUpdater === api) await transaction?.rollback?.();
          ensure();
          if (error?.name === "AbortError") continue;
          state.error = `\u7248\u672C ${release.tag} \u542F\u52A8\u5931\u8D25\uFF1A${error.message}`;
          notice = "\u6240\u9009\u7248\u672C\u542F\u52A8\u5931\u8D25\uFF0C\u5DF2\u5207\u6362\u5230\u53EF\u7528\u5907\u7528\u7248\u672C\u3002";
          render();
          if (release === attempts.at(-1) && !attempts.some((r) => r.tag === FALLBACK_TAG)) {
            try {
              attempts.push(await getRelease(FALLBACK_TAG));
            } catch (fallbackError) {
              ensure();
              state.error += `\uFF1B\u5165\u53E3\u9ED8\u8BA4\u7248\u672C\u4E5F\u4E0D\u53EF\u7528\uFF1A${fallbackError.message}`;
            }
          }
          break;
        } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        }
      }
    }
    throw lastError || new DOMException("\u542F\u52A8\u5DF2\u53D6\u6D88", "AbortError");
  } catch (error) {
    state.busy = false;
    state.error = error.message;
    state.status = "\u542F\u52A8\u672A\u5B8C\u6210\uFF0C\u53EF\u4EE5\u5728\u6B64\u66F4\u6539\u7248\u672C\u540E\u91CD\u8BD5\u3002";
    render();
    if (error?.name === "AbortError") dispose();
    throw error;
  }
}
if (typeof window !== "undefined" && !window.__LANDLORD_TEST__) {
  window.__landlordBootPromise ||= boot().catch((error) => {
    if (error?.name === "AbortError") return;
    console.error("[\u623F\u4E1C\u6A21\u62DF\u5668] \u542F\u52A8\u5931\u8D25", error);
    window.toastr?.error(`\u623F\u4E1C\u6A21\u62DF\u5668\u542F\u52A8\u5931\u8D25\uFF1A${error.message}\u3002\u53EF\u5728\u201C\u7248\u672C\u4E0E\u66F4\u65B0\u201D\u4E2D\u9009\u62E9\u53EF\u7528\u7248\u672C\u91CD\u8BD5\u3002`);
    window.__landlordBootPromise = null;
  });
}
export {
  boot
};
//# sourceMappingURL=bootstrap.js.map
