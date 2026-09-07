import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue, bedroomsFrom, waitUntil } from '../src/runtime/coordination.js';
import { mergeEntries } from '../src/updater/content.js';
import { ModuleScope } from '../src/runtime/scope.js';
import { UpdateStore } from '../src/updater/store.js';
import { IDBFactory } from 'fake-indexeddb';

test('queued sync waits for an in-flight sync instead of losing the second conversation',async()=>{
  const q=new SerialQueue();const order=[];let release;const gate=new Promise(r=>release=r);
  const a=q.run(async()=>{order.push('A-start');await gate;order.push('A-done');return true});
  const b=q.run(async()=>{order.push('B');return true});
  await Promise.resolve();assert.deepEqual(order,['A-start']);release();assert.deepEqual(await Promise.all([a,b]),[true,true]);assert.deepEqual(order,['A-start','A-done','B']);
});
test('closing the queue discards waiting work while a failed job does not poison later work',async()=>{
  const q=new SerialQueue();await assert.rejects(q.run(()=>{throw Error('network')}));assert.equal(await q.run(()=>42),42);
  q.close();await assert.rejects(q.run(()=>assert.fail('must not run')),{name:'AbortError'});
});
test('live bedroom adapter reflects new rooms and permanent occupancy',()=>{
  const state={公寓:{房间列表:{A:{类型:'卧室',住户:'无'},B:{类型:'厨房',住户:'无'}}}};
  assert.equal(bedroomsFrom(state).length,1);state.公寓.房间列表.A.住户='甲';assert.equal(bedroomsFrom(state)[0].isEmpty,false);
});
test('ready wait supports slow dependencies, timeout and cancellation',async()=>{
  let ready=false;setTimeout(()=>ready=true,15);assert.equal(await waitUntil(()=>ready,{interval:2,timeout:200}),true);
  await assert.rejects(waitUntil(()=>false,{timeout:5,interval:2}));const ctrl=new AbortController();ctrl.abort();await assert.rejects(waitUntil(()=>true,{signal:ctrl.signal}),{name:'AbortError'});
});
test('worldbook merge updates official content and preserves toggles, unknown fields, player edits and new entries',()=>{
  const base=[{uid:1,name:'规则',enabled:true,content:'old',position:{depth:0,order:1}},{uid:2,name:'人物',enabled:true,content:'base'}];
  const current=[{...base[0],enabled:false,unknown:'retain'},{...base[1],content:'玩家改写'}, {uid:99,name:'玩家条目',enabled:true,content:'私人设定'}];
  const next=[{...base[0],content:'new',position:{depth:0,order:2}},{...base[1],content:'新官方内容'}];
  const {entries,conflicts}=mergeEntries(current,base,next);
  assert.equal(entries[0].content,'new');assert.equal(entries[0].enabled,false);assert.equal(entries[0].unknown,'retain');assert.equal(entries[0].position.depth,0);
  assert.equal(entries[1].content,'玩家改写');assert.equal(entries[2].content,'私人设定');assert.deepEqual(conflicts,['人物.content']);
});
test('local deletions and UID collisions are never silently overwritten',()=>{
  const old=[{uid:1,name:'规则',enabled:true,content:'a'}];
  const {entries,conflicts}=mergeEntries([{uid:2,name:'玩家',content:'x'}],old,[{...old[0],content:'b'},{uid:2,name:'新增',content:'c'}]);
  assert.equal(entries.length,1);assert.equal(conflicts.length,2);
});
test('backup storage resolves after transaction commit and survives reopening',async()=>{
  const idb=new IDBFactory();const a=new UpdateStore(idb);await a.set('backup',{version:'1',body:'keep'});const b=new UpdateStore(idb);assert.deepEqual(await b.get('backup'),{version:'1',body:'keep'});
});
