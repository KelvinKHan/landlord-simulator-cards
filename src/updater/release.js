export const REPO = 'KelvinKHan/landlord-simulator-cards';
export const FALLBACK_TAG = `v${__APP_VERSION__}`;
export async function sha256(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function isReleaseTag(tag) { return typeof tag === 'string' && tag === tag.trim() && /^v\d+\.\d+\.\d+$/.test(tag); }
export function isInstallableTag(tag) { return typeof tag === 'string' && tag === tag.trim() && /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag); }
export function compareVersions(a,b) {
  const left = a.replace(/^v/,'').split(/[.-]/).slice(0,3).map(Number);
  const right = b.replace(/^v/,'').split(/[.-]/).slice(0,3).map(Number);
  for (let i=0;i<3;i++) if (left[i]!==right[i]) return left[i]-right[i];
  const stable=Number(!a.includes('-'))-Number(!b.includes('-'));
  return stable || Number(a.match(/-rc\.(\d+)$/)?.[1] || 0)-Number(b.match(/-rc\.(\d+)$/)?.[1] || 0);
}
export async function fetchText(url,{fetcher=fetch,timeout=12000,maxBytes=12_000_000}={}) {
  const ctrl = new AbortController(); const timer = setTimeout(()=>ctrl.abort(),timeout);
  try {
    const response = await fetcher(url,{signal:ctrl.signal,cache:'no-store'});
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) throw new Error('更新文件超过大小限制');
    return text;
  } finally { clearTimeout(timer); }
}
export async function latestTag(fetcher=fetch) {
  const release = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/releases/latest`,{fetcher,maxBytes:1_000_000}));
  if (release.draft || release.prerelease || !isReleaseTag(release.tag_name)) throw new Error('没有可用正式版本');
  return release.tag_name;
}
export async function listReleases(fetcher=fetch) {
  const releases = new Map();
  for (let page=1;page<=5;page++) {
    const items = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,{fetcher,maxBytes:2_000_000}));
    if (!Array.isArray(items)) throw new Error('版本目录格式不正确');
    for (const item of items) {
      const tag = item?.tag_name;
      if (item?.draft || !isInstallableTag(tag) || releases.has(tag)) continue;
      releases.set(tag,{
        tag,version:tag.slice(1),
        name:typeof item.name === 'string' && item.name.trim() ? item.name : tag,
        prerelease:Boolean(item.prerelease) || !isReleaseTag(tag),
        publishedAt:typeof item.published_at === 'string' ? item.published_at : null,
      });
    }
    if (items.length < 100) break;
  }
  return [...releases.values()].sort((a,b)=>compareVersions(b.tag,a.tag));
}
function assertManifest(manifest,tag) {
  if (!isInstallableTag(tag) || manifest?.format !== 1 || manifest.tag !== tag || typeof manifest.version !== 'string' || `v${manifest.version}` !== tag) throw new Error('版本清单不一致');
}
async function assertRelease(release) {
  assertManifest(release?.manifest,release?.tag);
  for (const file of ['runtime.js','content.json']) {
    const text = release[file];
    const expected = release.manifest.files?.[file];
    if (typeof text !== 'string' || !Number.isSafeInteger(expected?.bytes) || expected.bytes < 0 ||
        typeof expected.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expected.sha256) ||
        new TextEncoder().encode(text).length !== expected.bytes || await sha256(text) !== expected.sha256) throw new Error(`${file} 校验失败`);
  }
  const content = JSON.parse(release['content.json']);
  if (content?.version !== release.manifest.version || !Array.isArray(content?.worldbook?.entries)) throw new Error('内容包版本不一致');
}
export async function validateRelease(release) {
  try { await assertRelease(release); return true; }
  catch { return false; }
}
export async function downloadRelease(tag,fetcher=fetch) {
  if (!isInstallableTag(tag)) throw new Error('无效版本号');
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${tag}/dist/`;
  const manifest = JSON.parse(await fetchText(base+'release.json',{fetcher,maxBytes:20000}));
  assertManifest(manifest,tag);
  const output = {manifest,tag};
  for (const file of ['runtime.js','content.json']) {
    output[file] = await fetchText(base+file,{fetcher});
  }
  await assertRelease(output);
  return output;
}
