import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

let bootstrap;
test.beforeAll(async()=>{
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  const result=await build({entryPoints:['src/updater/bootstrap.js'],bundle:true,write:false,format:'esm',define:{__APP_VERSION__:JSON.stringify(version)},logLevel:'silent'});
  bootstrap=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
  await page.route('**/version-race-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:bootstrap}));
  await page.goto('/tests/browser/host.html');await page.waitForFunction(()=>fixtureReady);
  await page.evaluate(async()=>{
    window.__LANDLORD_TEST__=true;
    window.raceBoot=(await import('/version-race-bootstrap.js')).boot;
    window.raceValues=new Map();
    window.raceStore={get:async key=>structuredClone(raceValues.get(key)),set:async(key,value)=>raceValues.set(key,structuredClone(value))};
    window.raceRelease=async(tag,content='new rules')=>{
      const release={tag,'runtime.js':`export const marker=${JSON.stringify(tag)}`,
        'content.json':JSON.stringify({version:tag.slice(1),worldbook:{entries:[{id:1,comment:'规则',enabled:true,content}]}})};
      const files={};
      for(const file of ['runtime.js','content.json']) {
        const bytes=new TextEncoder().encode(release[file]);
        const hash=await crypto.subtle.digest('SHA-256',bytes);
        files[file]={bytes:bytes.length,sha256:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')};
      }
      release.manifest={format:1,tag,version:tag.slice(1),files};return release;
    };
    window.raceImporter=async()=>({start:async()=>{
      const runtime={disposed:false,dispose:async()=>{runtime.disposed=true;if(window.LandlordRuntime===runtime)delete window.LandlordRuntime}};
      window.LandlordRuntime=runtime;return runtime;
    }});
    window.raceOffline=async()=>{throw Error('offline')};
    const before={uid:1,name:'规则',enabled:true,content:'initial rules'};
    fixtureBooks['card-book']=[structuredClone(before)];
    await raceStore.set('content:landlord-test.png:card-book',{version:'5.20',entries:[before]});
  });
});

for(const change of ['chat','generation']) {
  test(`a committed selection survives a ${change} change without refreshing or claiming it was cancelled`,async({page})=>{
    const result=await page.evaluate(async change=>{
      await raceStore.set('last-good-release:landlord-test.png',await raceRelease('v5.21.0'));
      let reloads=0;
      await raceBoot({helper:window,store:raceStore,fetcher:raceOffline,importer:raceImporter,reload:()=>reloads++});
      const set=raceStore.set;
      raceStore.set=async(key,value)=>{
        await set(key,value);
        if(key.startsWith('version-preference:')) {
          if(change==='chat')ctx.chatId='changed-after-commit';else ctx.isGenerating=true;
        }
      };
      await __LandlordUpdater.apply({mode:'pinned',tag:'v5.21.0'});
      return{reloads,saved:await raceStore.get('version-preference:landlord-test.png'),state:__LandlordUpdater.getState()};
    },change);
    expect(result.reloads).toBe(0);
    expect(result.saved).toEqual({mode:'pinned',tag:'v5.21.0'});
    expect(result.state.preference).toEqual(result.saved);
    expect(result.state.status).toContain('选择已保存');
    expect(result.state.status).toContain('下次启动');
    expect(result.state.error).toBeNull();
    expect(result.state.currentTag).toBe('v5.21.0');
  });
}

test('returning to latest offline retains pinned cache provenance and follows the official release after reconnecting',async({page})=>{
  const result=await page.evaluate(async()=>{
    await raceStore.set('last-good-release:landlord-test.png',{...await raceRelease('v5.23.0','pinned rules'),selectionMode:'pinned'});
    await raceStore.set('version-preference:landlord-test.png',{mode:'latest'});
    await raceBoot({helper:window,store:raceStore,fetcher:raceOffline,importer:raceImporter});
    const offline=await raceStore.get('last-good-release:landlord-test.png');
    const official=await raceRelease('v5.21.0','official rules');
    const fetcher=async url=>new Response(url.endsWith('/latest')?JSON.stringify({tag_name:official.tag}):url.endsWith('release.json')?JSON.stringify(official.manifest):official[url.split('/').at(-1)]);
    await raceBoot({helper:window,store:raceStore,fetcher,importer:raceImporter});
    return{offlineMode:offline.selectionMode,offlineTag:offline.tag,state:__LandlordUpdater.getState(),book:fixtureBooks['card-book'][0].content};
  });
  expect(result.offlineMode).toBe('pinned');expect(result.offlineTag).toBe('v5.23.0');
  expect(result.state.preference).toEqual({mode:'latest'});
  expect(result.state.currentTag).toBe('v5.21.0');expect(result.book).toBe('official rules');
});

test('a cancelled importer finishing late cannot dispose its successor or roll back the successor worldbook',async({page})=>{
  const result=await page.evaluate(async()=>{
    await raceStore.set('last-good-release:landlord-test.png',await raceRelease('v5.21.0','shared release rules'));
    let finishImport,notifyImport;
    const reachedImporter=new Promise(resolve=>notifyImport=resolve);
    const slowImporter=()=>new Promise(resolve=>{finishImport=resolve;notifyImport()});
    const first=raceBoot({helper:window,store:raceStore,fetcher:raceOffline,importer:slowImporter}).catch(error=>error.name);
    await reachedImporter;
    const interruptedJournal=await raceStore.get('pending:content:landlord-test.png:card-book');
    const successor=await raceBoot({helper:window,store:raceStore,fetcher:raceOffline,importer:raceImporter});
    finishImport({start:async()=>{throw Error('cancelled importer must never start')}});
    const oldError=await first;
    return{oldError,hadPendingJournal:Boolean(interruptedJournal),successorDisposed:successor.disposed,
      activeRuntimeIsSuccessor:window.LandlordRuntime===successor,
      book:fixtureBooks['card-book'][0].content,
      baseline:await raceStore.get('content:landlord-test.png:card-book'),
      pending:await raceStore.get('pending:content:landlord-test.png:card-book'),
      currentTag:__LandlordUpdater.getState().currentTag,panels:document.querySelectorAll('#landlord-version-controls').length};
  });
  expect(result.oldError).toBe('AbortError');expect(result.hadPendingJournal).toBe(true);
  expect(result.successorDisposed).toBe(false);expect(result.activeRuntimeIsSuccessor).toBe(true);
  expect(result.book).toBe('shared release rules');expect(result.baseline.version).toBe('5.21.0');
  expect(result.pending).toBeNull();expect(result.currentTag).toBe('v5.21.0');expect(result.panels).toBe(1);
});
