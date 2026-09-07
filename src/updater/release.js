export const REPO = 'KelvinKHan/landlord-simulator-cards';
export const FALLBACK_TAG = `v${__APP_VERSION__}`;
export async function sha256(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function isReleaseTag(tag) { return /^v\d+\.\d+\.\d+$/.test(tag); }
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
export async function downloadRelease(tag,fetcher=fetch) {
  if (!/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag)) throw new Error('无效版本号');
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${tag}/dist/`;
  const manifest = JSON.parse(await fetchText(base+'release.json',{fetcher,maxBytes:20000}));
  if (manifest.format !== 1 || manifest.tag !== tag || `v${manifest.version}` !== tag) throw new Error('版本清单不一致');
  const output = {manifest,tag};
  for (const file of ['runtime.js','content.json']) {
    const text = await fetchText(base+file,{fetcher});
    if (await sha256(text) !== manifest.files?.[file]?.sha256 || new TextEncoder().encode(text).length !== manifest.files[file].bytes) throw new Error(`${file} 校验失败`);
    output[file] = text;
  }
  const content = JSON.parse(output['content.json']);
  if (content.version !== manifest.version || !Array.isArray(content.worldbook?.entries)) throw new Error('内容包版本不一致');
  return output;
}
