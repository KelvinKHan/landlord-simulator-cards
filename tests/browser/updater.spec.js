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
    return{ok:runtime.ok,imports:updateImports.length,content:fixtureBooks['card-book'][0].content,enabled:fixtureBooks['card-book'][0].enabled,cached:(await testStore.get('last-good-release')).tag,pending:await testStore.get('pending:content:landlord-test.png:card-book')};
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
    return{downloads,imports:updateImports,cached:(await testStore.get('last-good-release'))['runtime.js']};
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
