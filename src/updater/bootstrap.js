import { UpdateStore } from './store.js';
import { updateContent } from './content.js';
import { latestTag, downloadRelease, compareVersions, FALLBACK_TAG, validateRelease, listReleases, isInstallableTag, isReleaseTag } from './release.js';
import { mountVersionControls } from './controls.js';
import { waitUntil } from '../runtime/coordination.js';
import originalWorldbook from '../content/baseline-5.20.json';

const latestPreference = () => ({mode:'latest'});
const validPreference = value => value?.mode === 'latest' || (value?.mode === 'pinned' && isInstallableTag(value.tag));
const preferenceCopy = value => value.mode === 'pinned' ? {mode:'pinned',tag:value.tag} : latestPreference();

/** One permanent entry: selection survives reloads and stays available with older runtimes. */
export async function boot({helper=window,fetcher=fetch,importer=url=>import(url),store=new UpdateStore(helper.parent.indexedDB),reload}={}) {
  const host = helper.parent;
  await host.__LandlordUpdater?.dispose?.();
  const controller = new AbortController();
  const characterKey = () => {
    const ctx=host.SillyTavern?.getContext?.() || {};
    return ctx.characters?.[ctx.characterId]?.avatar || helper.getCurrentCharacterId?.();
  };
  const identity = () => `${characterKey()}:${host.SillyTavern?.getContext?.().chatId}`;
  const idle = () => {
    const ctx=host.SillyTavern?.getContext?.() || {};
    return ctx.characterId != null && !ctx.isGenerating && !ctx.is_send_press && !host.document.querySelector('#mes_stop')?.offsetParent && !host.LandlordRuntime?.busy?.();
  };
  let panel, api, ownedRuntime;
  const dispose = () => {
    controller.abort(); panel?.dispose();
    helper.removeEventListener('pagehide',dispose);
    if (host.__LandlordUpdater === api) delete host.__LandlordUpdater;
    return ownedRuntime?.dispose?.();
  };
  helper.addEventListener('pagehide',dispose,{once:true});
  await waitUntil(()=>characterKey() && host.document?.body,{signal:controller.signal});
  const owner = characterKey();
  const ensure = () => {
    if (controller.signal.aborted || characterKey() !== owner) throw new DOMException('角色已经改变，操作已取消','AbortError');
  };
  const scopedFetch = (url,options={}) => fetcher(url,{...options,signal:options.signal ? AbortSignal.any([options.signal,controller.signal]) : controller.signal});
  const preferenceKey = `version-preference:${owner}`;
  const cacheKey = `last-good-release:${owner}`;
  let cached;
  let preference=latestPreference();
  let catalog=[];
  let notice='';
  const state={currentTag:null,preference,releases:[],busy:true,status:'正在读取版本设置…',error:null};
  const render = () => { if (!controller.signal.aborted) panel?.render(); };
  const available = () => {
    const entries=new Map(catalog.map(r=>[r.tag,r]));
    for(const [tag,label] of [[FALLBACK_TAG,'入口默认版本'],[cached?.tag,'已验证版本'],[state.currentTag,'当前版本'],[preference.tag,'固定版本']]) {
      if(isInstallableTag(tag) && !entries.has(tag)) entries.set(tag,{tag,version:tag.slice(1),name:label,prerelease:tag.includes('-')});
    }
    return [...entries.values()].sort((a,b)=>compareVersions(b.tag,a.tag));
  };
  const getRelease = async tag => {
    ensure();
    if(cached?.tag===tag && await validateRelease(cached)) { ensure(); return cached; }
    const stored=await store.get(`release:${tag}`); ensure();
    if(stored?.tag===tag && await validateRelease(stored)) { ensure(); return stored; }
    const release=await downloadRelease(tag,scopedFetch); ensure(); return release;
  };
  const resolveLatest = async () => {
    try {
      const tag=await latestTag(scopedFetch); ensure();
      // A deliberately pinned build never takes precedence over an explicit return to latest.
      if(cached && cached.selectionMode!=='pinned' && isReleaseTag(cached.tag) && compareVersions(cached.tag,tag)>0) return cached;
      return await getRelease(tag);
    } catch(error) {
      ensure();
      notice='正式版检查暂未完成；当前使用已验证版本，下次启动会再检查。';
      if(cached && compareVersions(cached.tag,FALLBACK_TAG)>=0) return cached;
      try { return await getRelease(FALLBACK_TAG); }
      catch(error) { ensure(); if(cached) return cached; throw error; }
    }
  };
  api={
    getState:()=>({...state,preference:preferenceCopy(preference),releases:available(),busy:state.busy || !idle()}),
    refresh:async()=>{
      ensure();
      const next=await listReleases(scopedFetch); ensure(); catalog=next; state.error=null; render();
      return available();
    },
    apply:async next=>{
      ensure();
      if(state.busy || !idle() || host.document.querySelector('dialog[open]')) throw new Error('请等当前回复或操作完成，再保存版本选择');
      if(!validPreference(next)) throw new Error('无效的版本选择');
      const chosen=preferenceCopy(next);
      if(chosen.mode==='pinned' && !available().some(r=>r.tag===chosen.tag)) throw new Error('该版本不在公开目录或已知版本中，请先刷新版本列表');
      const stamp=identity();
      const ensureSelection=()=>{ensure();if(identity()!==stamp || !idle() || host.document.querySelector('dialog[open]')) throw new DOMException('聊天或操作状态已经改变，请重新选择','AbortError');};
      state.busy=true; state.error=null; state.status='正在检查所选版本…'; render();
      try {
        const release=chosen.mode==='pinned' ? await getRelease(chosen.tag) : await resolveLatest();
        ensureSelection();
        // Stage verified assets before committing the preference. No gameplay is changed here.
        await store.set(`release:${release.tag}`,release); ensureSelection();
        await store.set(preferenceKey,chosen);
        preference=chosen; state.preference=chosen;
        try { ensureSelection(); }
        catch(error) {
          state.status='选择已保存；聊天状态已改变，将在下次启动时生效。';
          helper.toastr?.info(state.status);
          return;
        }
        state.status='选择已保存，正在刷新…'; render();
        if(reload) await reload();
        else if(helper!==host && typeof helper.reloadIframe==='function') {
          // Recreate the one helper script without losing the host's selected chat.
          // Await owned cleanup before its iframe disappears and new globals mount.
          await ownedRuntime?.dispose?.();
          ensureSelection();
          helper.reloadIframe();
        } else host.location.reload();
      } catch(error) {
        state.error=error.message; state.status='当前游戏版本未更换。'; throw error;
      } finally { state.busy=false; render(); }
    },
    dispose,
  };
  host.__LandlordUpdater=api;
  panel=mountVersionControls({host,getState:api.getState,refresh:api.refresh,apply:api.apply});
  try {
    const saved=await store.get(preferenceKey); ensure();
    if(validPreference(saved)) preference=preferenceCopy(saved);
    state.preference=preference;
    const own=await store.get(cacheKey); ensure();
    if(await validateRelease(own)) cached=own;
    else {
      // Read the old global cache only to migrate pre-selector installations.
      const legacy=await store.get('last-good-release'); ensure();
      if(await validateRelease(legacy)) cached=legacy;
    }
    state.status='正在加载所选版本…'; render();
    let selected;
    try { selected=preference.mode==='pinned' ? await getRelease(preference.tag) : await resolveLatest(); }
    catch(error) {
      ensure(); state.error=`所选版本加载失败：${error.message}`;
      selected=cached || await getRelease(FALLBACK_TAG);
      notice='所选版本未能加载，已保留选择并尝试上次可用版本。';
    }
    const attempts=[selected];
    if(cached && cached.tag!==selected.tag) attempts.push(cached);
    let lastError;
    for(const release of attempts) {
      while(!controller.signal.aborted) {
        ensure();
        await waitUntil(()=>idle() && !host.document.querySelector('dialog[open]'),{signal:controller.signal,timeout:300000,interval:100});
        ensure();
        const stamp=identity();
        const isCurrent=()=>!controller.signal.aborted && characterKey()===owner && identity()===stamp && idle();
        let transaction, blobUrl;
        try {
          if(!await validateRelease(release)) throw new Error('本地版本缓存校验失败');
          const content=JSON.parse(release['content.json']);
          transaction=await updateContent({api:helper,store,content,baseline:{worldbook:originalWorldbook},identity:owner,isCurrent});
          if(!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          blobUrl=URL.createObjectURL(new Blob([release['runtime.js']],{type:'application/javascript'}));
          const module=await importer(blobUrl);
          if(!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          const runtime=await module.start({helper,host,store,content});
          ownedRuntime=runtime;
          if(!isCurrent()) throw new DOMException('聊天已经改变','AbortError');
          await transaction.commit();
          ensure();
          // Falling back to a formerly pinned build must not promote it to an
          // automatic high-water mark, or reconnecting could never follow latest.
          cached={...release,selectionMode:notice ? (release.selectionMode || preference.mode) : preference.mode};
          await store.set(`release:${release.tag}`,release); ensure();
          await store.set(cacheKey,cached); ensure();
          state.currentTag=release.tag; state.busy=false;
          state.status=notice || (preference.mode==='pinned' ? `已固定版本 ${release.tag}。` : '当前跟随最新正式版。');
          if(transaction.conflicts.length) {
            const message=`已保留 ${transaction.conflicts.length} 处本地世界书修改或绑定设置。`;
            state.status+=` ${message}`; helper.toastr?.info(message);
          }
          render(); return runtime;
        } catch(error) {
          lastError=error;
          await ownedRuntime?.dispose?.();
          ownedRuntime=null;
          // A successor boot recovers the pending journal before its own update.
          // A late predecessor must never roll that newer transaction back.
          if(host.__LandlordUpdater===api) await transaction?.rollback?.();
          ensure();
          if(error?.name==='AbortError') continue;
          state.error=`版本 ${release.tag} 启动失败：${error.message}`;
          notice='所选版本启动失败，已切换到可用备用版本。'; render();
          if(release===attempts.at(-1) && !attempts.some(r=>r.tag===FALLBACK_TAG)) {
            try { attempts.push(await getRelease(FALLBACK_TAG)); }
            catch(fallbackError) { ensure(); state.error+=`；入口默认版本也不可用：${fallbackError.message}`; }
          }
          break;
        } finally { if(blobUrl) URL.revokeObjectURL(blobUrl); }
      }
    }
    throw lastError || new DOMException('启动已取消','AbortError');
  } catch(error) {
    state.busy=false; state.error=error.message; state.status='启动未完成，可以在此更改版本后重试。'; render();
    if(error?.name==='AbortError') dispose();
    throw error;
  }
}

if(typeof window!=='undefined' && !window.__LANDLORD_TEST__) {
  window.__landlordBootPromise ||= boot().catch(error=>{
    if(error?.name==='AbortError') return;
    console.error('[房东模拟器] 启动失败',error);
    window.toastr?.error(`房东模拟器启动失败：${error.message}。可在“版本与更新”中选择可用版本重试。`);
    window.__landlordBootPromise=null;
  });
}
