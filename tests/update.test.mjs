import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { UpdateStore } from '../src/updater/store.js';
import { updateContent } from '../src/updater/content.js';
globalThis.__APP_VERSION__='5.21.0-rc.1';
const {sha256,downloadRelease,latestTag,compareVersions}=await import('../src/updater/release.js');

async function releaseFixture(tag,body='export const version=1;') {
  const content=JSON.stringify({version:tag.slice(1),worldbook:{entries:[]}});
  const files={};for(const [file,text] of [['runtime.js',body],['content.json',content]])files[file]={sha256:await sha256(text),bytes:new TextEncoder().encode(text).length};
  const manifest={format:1,tag,version:tag.slice(1),files};
  return {manifest,tag,'runtime.js':body,'content.json':content};
}
test('formal release discovery excludes drafts and prereleases',async()=>{
  const response=value=>async()=>new Response(JSON.stringify(value));
  assert.equal(await latestTag(response({tag_name:'v5.21.0'})),'v5.21.0');
  await assert.rejects(latestTag(response({tag_name:'v5.22.0',prerelease:true})));
  await assert.rejects(latestTag(response({tag_name:'v5.22.0-rc.1'})));
  assert.ok(compareVersions('v5.21.1','v5.21.0')>0);assert.ok(compareVersions('v5.21.0','v5.21.0-rc.1')>0);
});
test('CDN assets must match the tag, size and SHA-256 as one release',async()=>{
  const fixture=await releaseFixture('v5.21.0');
  const fetcher=async url=>new Response(url.endsWith('release.json')?JSON.stringify(fixture.manifest):fixture[url.split('/').at(-1)]);
  assert.equal((await downloadRelease('v5.21.0',fetcher)).tag,'v5.21.0');
  fixture['runtime.js']+=';bad';await assert.rejects(downloadRelease('v5.21.0',fetcher),/校验失败/);
  await assert.rejects(downloadRelease('../../evil',fetcher),/无效版本/);
});
test('worldbook update can roll back a failed runtime without touching chat memories',async()=>{
  const store=new UpdateStore(new IDBFactory());
  const base={uid:1,name:'规则',enabled:false,content:'old'};
  const books={book:[base,{uid:99,name:'自定义',content:'keep'}],chat:[{uid:1,name:'租客',content:'memory'}]};
  await store.set('content:card:book',{version:'5.21.0',entries:[base]});
  const api={getCharWorldbookNames:()=>({primary:'book'}),updateWorldbookWith:async(name,fn)=>books[name]=await fn(structuredClone(books[name]))};
  const tx=await updateContent({api,store,content:{version:'5.21.1',worldbook:{entries:[{id:1,comment:'规则',enabled:true,content:'new'}]}},baseline:{worldbook:{entries:[]}},identity:'card',isCurrent:()=>true});
  assert.equal(books.book[0].content,'new');assert.equal(books.book[0].enabled,false);assert.equal(books.chat[0].content,'memory');
  await tx.rollback();assert.deepEqual(books.book,[base,{uid:99,name:'自定义',content:'keep'}]);assert.equal((await store.get('content:card:book')).version,'5.21.0');
});
test('a changed chat aborts an asynchronous update before writing the worldbook',async()=>{
  const store=new UpdateStore(new IDBFactory());let current=true;let writes=0;
  const api={getCharWorldbookNames:()=>({primary:'book'}),updateWorldbookWith:async(name,fn)=>{current=false;await fn([]);writes++}};
  await assert.rejects(updateContent({api,store,content:{version:'5.21.1',worldbook:{entries:[]}},baseline:{worldbook:{entries:[]}},identity:'card',isCurrent:()=>current}),{name:'AbortError'});
  assert.equal(writes,0);
});

test('an interrupted worldbook transaction is recovered on the next startup and commit clears its journal',async()=>{
  const store=new UpdateStore(new IDBFactory());
  let entries=[{uid:1,name:'规则',enabled:true,content:'before'}];
  const raw={id:1,comment:'规则',enabled:true,content:'before'};
  const api={getCharWorldbookNames:()=>({primary:'book'}),updateWorldbookWith:async(_,fn)=>entries=await fn(structuredClone(entries))};
  const args={api,store,baseline:{worldbook:{entries:[raw]}},identity:'card',isCurrent:()=>true};
  await updateContent({...args,content:{version:'5.21.0',worldbook:{entries:[{...raw,content:'broken version'}]}}});
  assert.equal(entries[0].content,'broken version');
  assert.ok(await store.get('pending:content:card:book'));
  const tx=await updateContent({...args,content:{version:'5.21.1',worldbook:{entries:[{...raw,content:'working version'}]}}});
  assert.equal(entries[0].content,'working version');await tx.commit();
  assert.equal(await store.get('pending:content:card:book'),null);
  assert.equal((await store.get('content:card:book')).version,'5.21.1');
});

test('rollback retains edits the player made after the author update',async()=>{
  const store=new UpdateStore(new IDBFactory());const raw={id:1,comment:'规则',enabled:true,content:'before'};
  let entries=[{uid:1,name:'规则',enabled:true,content:'before'}];
  const api={getCharWorldbookNames:()=>({primary:'book'}),updateWorldbookWith:async(_,fn)=>entries=await fn(structuredClone(entries))};
  const tx=await updateContent({api,store,baseline:{worldbook:{entries:[raw]}},content:{version:'5.21.1',worldbook:{entries:[{...raw,content:'after'}]}},identity:'card',isCurrent:()=>true});
  entries[0].content='玩家之后的修改';await tx.rollback();assert.equal(entries[0].content,'玩家之后的修改');
});
