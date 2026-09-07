import { UpdateStore } from './store.js';
import { updateContent } from './content.js';
import { latestTag,downloadRelease,compareVersions,FALLBACK_TAG,sha256 } from './release.js';
import { waitUntil } from '../runtime/coordination.js';
import originalWorldbook from '../content/baseline-5.20.json';

async function validCache(release) {
  if (!release) return false;
  try {
    return await sha256(release['runtime.js']) === release.manifest.files['runtime.js'].sha256 &&
      await sha256(release['content.json']) === release.manifest.files['content.json'].sha256;
  } catch { return false; }
}

export async function boot({helper=window,fetcher=fetch,importer=url=>import(url),store=new UpdateStore(helper.parent.indexedDB)}={}) {
  const host = helper.parent;
  const controller = new AbortController();
  const leave = () => controller.abort();
  helper.addEventListener('pagehide',leave,{once:true});
  const characterKey = () => { const ctx=host.SillyTavern.getContext(); return ctx.characters?.[ctx.characterId]?.avatar || helper.getCurrentCharacterId?.(); };
  const identity = () => `${helper.getCurrentCharacterId?.()}:${host.SillyTavern?.getContext?.().chatId}`;
  const idle = () => {
    const ctx=host.SillyTavern?.getContext?.() || {};
    return ctx.characterId != null && !ctx.isGenerating && !ctx.is_send_press && !host.document.querySelector('#mes_stop')?.offsetParent;
  };
  const cacheKey = 'last-good-release';
  let cached = await store.get(cacheKey);
  if (!await validCache(cached)) cached = null;
  let selected;
  try {
    const tag = await latestTag(fetcher);
    selected = cached && compareVersions(tag,cached.tag) <= 0 ? cached : await downloadRelease(tag,fetcher);
  } catch (error) {
    host.console.warn('[房东模拟器] 更新检查未完成，尝试已验证版本',error.message);
    selected = cached && compareVersions(cached.tag,FALLBACK_TAG) >= 0 ? cached : await downloadRelease(FALLBACK_TAG,fetcher);
  }
  const attempts = [selected];
  if (cached && cached.tag !== selected.tag) attempts.push(cached);
  let lastError;
  try {
    for (const release of attempts) {
      // A chat switch during download/update is a restart, not a failed release.
      while (!controller.signal.aborted) {
        await waitUntil(()=>idle() && !host.document.querySelector('dialog[open]'),{signal:controller.signal,timeout:300000,interval:100});
        const stamp=identity();
        const isCurrent=()=>!controller.signal.aborted && identity()===stamp && idle();
        let transaction; let blobUrl;
        try {
          if (!await validCache(release)) throw new Error('本地更新缓存校验失败');
          const content = JSON.parse(release['content.json']);
          transaction = await updateContent({api:helper,store,content,baseline:{worldbook:originalWorldbook},identity:characterKey() ?? stamp,isCurrent});
          if (!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          blobUrl = URL.createObjectURL(new Blob([release['runtime.js']],{type:'application/javascript'}));
          const module = await importer(blobUrl);
          if (!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          const runtime = await module.start({helper,host,store,content});
          if (!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          await transaction.commit();
          await store.set(cacheKey,release);
          if (transaction.conflicts.length) helper.toastr?.info(`已保留 ${transaction.conflicts.length} 处本地世界书修改或绑定设置。`);
          return runtime;
        } catch(error) {
          lastError = error;
          await host.LandlordRuntime?.dispose?.();
          await transaction?.rollback?.();
          if (error?.name === 'AbortError' && !controller.signal.aborted) continue;
          break;
        } finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
      }
    }
    throw lastError || new DOMException('启动已取消','AbortError');
  } finally { helper.removeEventListener('pagehide',leave); }
}

if (typeof window !== 'undefined' && !window.__LANDLORD_TEST__) {
  window.__landlordBootPromise ||= boot().catch(error => {
    if (error?.name === 'AbortError') return;
    console.error('[房东模拟器] 启动失败',error);
    window.toastr?.error(`房东模拟器启动失败：${error.message}。请稍后刷新重试。`);
    window.__landlordBootPromise=null;
  });
}
