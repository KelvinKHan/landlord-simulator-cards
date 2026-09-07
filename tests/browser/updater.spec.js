import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.goto('/tests/browser/host.html');await page.waitForFunction(()=>fixtureReady);
  await page.evaluate(async()=>{
    window.__LANDLORD_TEST__=true;
    window.boot=(await import('/dist/bootstrap.js')).boot;
    window.releaseFixture=async(tag,content='author content')=>{
      const runtime=`export const marker=${JSON.stringify(tag)}`;
      const pack=JSON.stringify({version:tag.slice(1),worldbook:{entries:[{id:1,comment:'规则',enabled:true,content}]}});
      const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
      const files={};for(const [key,value] of [['runtime.js',runtime],['content.json',pack]])files[key]={bytes:new TextEncoder().encode(value).length,sha256:await hash(value)};
      return{tag,manifest:{tag,version:tag.slice(1),format:1,files},'runtime.js':runtime,'content.json':pack};
    };
    window.updateValues=new Map();
    window.testStore={get:async key=>structuredClone(updateValues.get(key)),set:async(key,value)=>updateValues.set(key,structuredClone(value))};
    const seed={uid:1,name:'规则',enabled:true,content:'initial rules'};
    fixtureBooks['card-book']=[structuredClone(seed)];
    await testStore.set('content:landlord-test.png:card-book',{version:'5.20',entries:[seed]});
    window.updateImports=[];
    window.fakeImporter=async url=>{
      const text=await(await fetch(url)).text();updateImports.push(text);
      if(text.includes('5.22.0'))throw Error('simulated incompatible release');
      return{start:async()=>{window.LandlordRuntime={dispose:async()=>{}};return{ok:true}}};
    };
  });
});

test('a failed new runtime restores its worldbook and starts the verified cached release',async({page})=>{
  const result=await page.evaluate(async()=>{
    const previous=await releaseFixture('v5.21.0','old');const next=await releaseFixture('v5.22.0','new');
    await testStore.set('last-good-release',previous);
    await testStore.set('content:landlord-test.png:card-book',{version:'5.21.0',entries:[{uid:1,name:'规则',enabled:true,content:'old'}]});
    fixtureBooks['card-book']=[{uid:1,name:'规则',enabled:false,content:'old'}];
    const fetcher=async url=>new Response(url.includes('api.github.com')?JSON.stringify({tag_name:next.tag}):url.endsWith('release.json')?JSON.stringify(next.manifest):next[url.split('/').at(-1)]);
    const runtime=await boot({helper:window,store:testStore,fetcher,importer:fakeImporter});
    return{ok:runtime.ok,imports:updateImports.length,content:fixtureBooks['card-book'][0].content,enabled:fixtureBooks['card-book'][0].enabled,cached:(await testStore.get('last-good-release:landlord-test.png')).tag,pending:await testStore.get('pending:content:landlord-test.png:card-book')};
  });
  expect(result).toEqual({ok:true,imports:2,content:'old',enabled:false,cached:'v5.21.0',pending:null});
});

test('unavailable release discovery uses cache and a chat switch during update restarts safely',async({page})=>{
  const result=await page.evaluate(async()=>{
    await testStore.set('last-good-release',await releaseFixture('v5.21.0'));
    const original=window.updateWorldbookWith;let switches=0;
    window.updateWorldbookWith=async(...args)=>{if(!switches++){ctx.chatId='test-B'}return original(...args)};
    const runtime=await boot({helper:window,store:testStore,fetcher:async()=>{throw Error('offline')},importer:fakeImporter});
    return{ok:runtime.ok,switches,imports:updateImports.length,chat:ctx.chatId};
  });
  expect(result.ok).toBe(true);expect(result.switches).toBeGreaterThan(1);expect(result.imports).toBe(1);expect(result.chat).toBe('test-B');
});

test('a damaged cached asset is downloaded again instead of executing corrupted JavaScript',async({page})=>{
  const result=await page.evaluate(async()=>{
    const clean=await releaseFixture('v5.21.0');const bad={...clean,'runtime.js':'corrupted'};
    await testStore.set('last-good-release',bad);let downloads=0;
    const fetcher=async url=>{downloads++;return new Response(url.includes('api.github.com')?JSON.stringify({tag_name:clean.tag}):url.endsWith('release.json')?JSON.stringify(clean.manifest):clean[url.split('/').at(-1)])};
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter});
    return{downloads,imports:updateImports,cached:(await testStore.get('last-good-release:landlord-test.png'))['runtime.js']};
  });
  expect(result.downloads).toBe(4);expect(result.imports).toEqual(['export const marker="v5.21.0"']);expect(result.cached).toBe(result.imports[0]);
});

test('the updater waits for native import confirmations before changing the worldbook',async({page})=>{
  await page.evaluate(async()=>{
    await testStore.set('last-good-release',await releaseFixture('v5.21.0'));
    const dialog=document.createElement('dialog');dialog.innerHTML='<button>完成导入</button>';document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();
    window.pendingBoot=boot({helper:window,store:testStore,fetcher:async()=>{throw Error('offline')},importer:fakeImporter});
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>fixtureWrites.length)).toBe(0);
  await page.getByRole('button',{name:'完成导入'}).click();
  expect(await page.evaluate(async()=>(await pendingBoot).ok)).toBe(true);
});

test('a pinned older release is honored and both script and worldbook keep that version',async({page})=>{
  const result=await page.evaluate(async()=>{
    const older=await releaseFixture('v5.21.0','older rules');
    await testStore.set('last-good-release:landlord-test.png',await releaseFixture('v5.21.1','newer rules'));
    await testStore.set('version-preference:landlord-test.png',{mode:'pinned',tag:older.tag});
    const calls=[];
    const fetcher=async url=>{calls.push(url);return new Response(url.endsWith('release.json')?JSON.stringify(older.manifest):older[url.split('/').at(-1)])};
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter});
    return{state:__LandlordUpdater.getState(),calls,imports:updateImports,book:fixtureBooks['card-book']};
  });
  expect(result.state.preference).toEqual({mode:'pinned',tag:'v5.21.0'});
  expect(result.state.currentTag).toBe('v5.21.0');
  expect(result.calls.some(url=>url.includes('api.github.com'))).toBe(false);
  expect(result.imports).toEqual(['export const marker="v5.21.0"']);
  expect(result.book.find(e=>e.name==='规则').content).toBe('older rules');
});

test('choosing a release stages assets, persists per character, and applies the pair on the next boot',async({page})=>{
  const result=await page.evaluate(async()=>{
    const before=await releaseFixture('v5.21.0','old');const next=await releaseFixture('v5.21.1','next');
    const fetcher=async url=>{
      if(url.includes('/releases?'))return new Response(JSON.stringify([{tag_name:next.tag,name:'新版',draft:false,prerelease:false}]));
      if(url.endsWith('/latest'))return new Response(JSON.stringify({tag_name:before.tag}));
      const r=url.includes('@'+next.tag+'/')?next:before;return new Response(url.endsWith('release.json')?JSON.stringify(r.manifest):r[url.split('/').at(-1)]);
    };
    let reloads=0;
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter,reload:()=>reloads++});
    await __LandlordUpdater.refresh();
    const writes=fixtureWrites.length;
    await __LandlordUpdater.apply({mode:'pinned',tag:next.tag});
    const staged={reloads,writes:fixtureWrites.length-writes,preference:await testStore.get('version-preference:landlord-test.png'),other:await testStore.get('version-preference:another.png')};
    await boot({helper:window,store:testStore,fetcher:async()=>{throw Error('offline')},importer:fakeImporter});
    return{staged,tag:__LandlordUpdater.getState().currentTag,content:fixtureBooks['card-book'].find(e=>e.name==='规则').content,imports:updateImports};
  });
  expect(result.staged).toEqual({reloads:1,writes:0,preference:{mode:'pinned',tag:'v5.21.1'},other:undefined});
  expect(result.tag).toBe('v5.21.1');expect(result.content).toBe('next');expect(result.imports).toHaveLength(2);
});

test('returning from a newer pinned build follows the actual latest formal release',async({page})=>{
  const result=await page.evaluate(async()=>{
    const official=await releaseFixture('v5.21.0','official');
    await testStore.set('last-good-release:landlord-test.png',{...await releaseFixture('v5.23.0','pinned'),selectionMode:'pinned'});
    await testStore.set('version-preference:landlord-test.png',{mode:'latest'});
    const fetcher=async url=>new Response(url.endsWith('/latest')?JSON.stringify({tag_name:official.tag}):url.endsWith('release.json')?JSON.stringify(official.manifest):official[url.split('/').at(-1)]);
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter});
    return{tag:__LandlordUpdater.getState().currentTag,content:fixtureBooks['card-book'].find(e=>e.name==='规则').content};
  });
  expect(result).toEqual({tag:'v5.21.0',content:'official'});
});

test('an unavailable pinned release falls back without forgetting the pin and the version panel still works',async({page})=>{
  const result=await page.evaluate(async()=>{
    await testStore.set('last-good-release:landlord-test.png',await releaseFixture('v5.21.0','old'));
    await testStore.set('version-preference:landlord-test.png',{mode:'pinned',tag:'v5.21.1'});
    await boot({helper:window,store:testStore,fetcher:async()=>{throw Error('offline')},importer:fakeImporter});
    return{state:__LandlordUpdater.getState(),panel:!!document.querySelector('#landlord-version-controls')};
  });
  expect(result.state.currentTag).toBe('v5.21.0');expect(result.state.preference.tag).toBe('v5.21.1');
  expect(result.state.error).toContain('offline');expect(result.panel).toBe(true);
});

test('generation or a changed chat blocks saving or refreshing a version selection',async({page})=>{
  const result=await page.evaluate(async()=>{
    const release=await releaseFixture('v5.21.0');
    await testStore.set('last-good-release:landlord-test.png',release);
    const fetcher=async url=>new Response(url.endsWith('/latest')?JSON.stringify({tag_name:release.tag}):url.endsWith('release.json')?JSON.stringify(release.manifest):release[url.split('/').at(-1)]);
    let reloads=0;await boot({helper:window,store:testStore,fetcher,importer:fakeImporter,reload:()=>reloads++});
    ctx.isGenerating=true;
    let busy;try{await __LandlordUpdater.apply({mode:'pinned',tag:release.tag})}catch(e){busy=e.message}
    ctx.isGenerating=false;
    const original=testStore.set;
    testStore.set=async(key,value)=>{await original(key,value);if(key.startsWith('release:'))ctx.chatId='changed-during-download'};
    let changed;try{await __LandlordUpdater.apply({mode:'pinned',tag:release.tag})}catch(e){changed=e.name}
    return{busy,changed,reloads,preference:await testStore.get('version-preference:landlord-test.png')};
  });
  expect(result.busy).toContain('当前回复');expect(result.changed).toBe('AbortError');expect(result.reloads).toBe(0);expect(result.preference).toBeUndefined();
});

test('bad selected assets do not overwrite the saved preference or reload a working game',async({page})=>{
  const result=await page.evaluate(async()=>{
    const current=await releaseFixture('v5.21.0');const next=await releaseFixture('v5.21.1');
    let reloads=0;
    const fetcher=async url=>{
      if(url.includes('/releases?'))return new Response(JSON.stringify([{tag_name:next.tag}]));
      if(url.endsWith('/latest'))return new Response(JSON.stringify({tag_name:current.tag}));
      const release=url.includes('@'+next.tag+'/')?next:current;
      return new Response(url.endsWith('release.json')?JSON.stringify(release.manifest):release===next?'corrupted':release[url.split('/').at(-1)]);
    };
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter,reload:()=>reloads++});await __LandlordUpdater.refresh();
    let message;try{await __LandlordUpdater.apply({mode:'pinned',tag:next.tag})}catch(e){message=e.message}
    return{message,reloads,tag:__LandlordUpdater.getState().currentTag,preference:await testStore.get('version-preference:landlord-test.png')};
  });
  expect(result.message).toContain('校验失败');expect(result.reloads).toBe(0);expect(result.tag).toBe('v5.21.0');expect(result.preference).toBeUndefined();
});

test('first installation can recover from a broken official runtime using the entry version',async({page})=>{
  const result=await page.evaluate(async()=>{
    const pkg=await(await fetch('/package.json')).json();
    const fallback=await releaseFixture('v'+pkg.version,'entry rules');
    const broken=await releaseFixture('v5.22.0','broken rules');
    const fetcher=async url=>{
      if(url.endsWith('/latest'))return new Response(JSON.stringify({tag_name:broken.tag}));
      const release=url.includes('@'+broken.tag+'/')?broken:fallback;
      return new Response(url.endsWith('release.json')?JSON.stringify(release.manifest):release[url.split('/').at(-1)]);
    };
    await boot({helper:window,store:testStore,fetcher,importer:fakeImporter});
    return{state:__LandlordUpdater.getState(),expected:fallback.tag,content:fixtureBooks['card-book'].find(e=>e.name==='规则').content,imports:updateImports.length};
  });
  expect(result.state.currentTag).toBe(result.expected);expect(result.content).toBe('entry rules');expect(result.imports).toBe(2);
  expect(result.state.error).toContain('启动失败');
});

test('opening an editor while a selected release is being staged prevents the page reload',async({page})=>{
  const result=await page.evaluate(async()=>{
    const release=await releaseFixture('v5.21.0');await testStore.set('last-good-release:landlord-test.png',release);
    let reloads=0;
    await boot({helper:window,store:testStore,fetcher:async()=>new Response(JSON.stringify({tag_name:release.tag})),importer:fakeImporter,reload:()=>reloads++});
    const set=testStore.set;
    testStore.set=async(key,value)=>{await set(key,value);if(key.startsWith('release:')){const d=document.createElement('dialog');document.body.append(d);d.showModal()}};
    let error;try{await __LandlordUpdater.apply({mode:'pinned',tag:release.tag})}catch(e){error=e.name}
    return{error,reloads,preference:await testStore.get('version-preference:landlord-test.png')};
  });
  expect(result).toEqual({error:'AbortError',reloads:0,preference:undefined});
});
