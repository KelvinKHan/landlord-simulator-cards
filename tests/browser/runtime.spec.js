import { test,expect } from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.route('https://**',async route=>{
    if(route.request().url().includes('mvu_zod.js'))return route.fulfill({contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'export function registerMvuSchema() {}'});
    return route.abort();
  });
  await page.goto('/tests/browser/host.html');
  await page.waitForFunction(()=>window.fixtureReady);
});
test('original starts with all modules, live bedrooms and a single analyzer watcher',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  await expect(page.locator('#landlord-controls')).toContainText('原版');
  const result=await page.evaluate(()=>({errors:runtime.errors,scopes:runtime.scopes.map(s=>s.id),bedrooms:getApartmentBedrooms(),watchers:eventSource.count('message_received')}));
  expect(result.errors).toEqual([]);expect(result.scopes).toHaveLength(20);expect(result.bedrooms[0].name).toBe('测试卧室');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(()=>runtime.errors)).toEqual([]);
});
test('remix initializes its state and mode switches release old globals',async({page})=>{
  await page.evaluate(()=>fixtureStart('remix'));
  await expect(page.locator('#apt-shadow-host')).toHaveCount(1);
  expect(await page.evaluate(()=>runtime.errors)).toEqual([]);
  await page.evaluate(()=>runtime.setMode('original'));
  await expect(page.locator('#apt-shadow-host')).toHaveCount(0);
  await expect(page.locator('#landlord-controls')).toContainText('原版');
  await page.evaluate(()=>runtime.setMode('remix'));
  expect(await page.evaluate(()=>runtime.errors)).toEqual([]);
  expect(await page.evaluate(()=>window.PhoneSystem)).toBeUndefined();
});
test('chat switching restarts modules and old scope cannot write to the new chat',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const old=runtime.scopes.find(s=>s.id==='S12');
    ctx.chatId='test-B';await eventSource.emit('chat_id_changed','test-B');await runtime.transitions.tail;
    let stale=false;try{await old.value('updateWorldbookWith')('chat:test-B',()=>[])}catch(e){stale=e.name==='AbortError'}
    return{stale,errors:runtime.errors,key:await runtime.chatWorldbook};
  });
  expect(result).toEqual({stale:true,errors:[],key:'chat:test-B'});
});
test('simultaneous conversation syncs both persist and retracting the last message clears old memory',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    await ChatDB.init('test-A');
    const a=await ChatDB.createConversation({type:'private',name:'甲',members:['甲']});
    const b=await ChatDB.createConversation({type:'private',name:'乙',members:['乙']});
    await ChatDB.addMessage(a.id,'甲','你好');await ChatDB.addMessage(b.id,'乙','晚安');
    const saved=await Promise.all([ChatSync.syncToChatLore(a.id),ChatSync.syncToChatLore(b.id)]);
    const before=fixtureBooks['chat:test-A'].map(e=>e.name);
    await ChatDB.deleteLastMessages(a.id,1);await ChatSync.syncToChatLore(a.id);
    return{saved,before,after:fixtureBooks['chat:test-A'].map(e=>e.name)};
  });
  expect(result.saved).toEqual([true,true]);expect(result.before).toEqual(expect.arrayContaining(['[租客微信]甲','[租客微信]乙']));expect(result.after).toEqual(['[租客微信]乙']);
});
test('late response bodies are cancelled and old global DOM listeners are removed',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const scope=runtime.scopes.find(s=>s.id==='S11');let events=0;
    scope.document.body.addEventListener('landlord-test',()=>events++);
    document.body.dispatchEvent(new Event('landlord-test'));
    const previous=scope.helper.fetch;
    scope.helper.fetch=async(_url,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('cancelled','AbortError')))}}));
    const response=await scope.fetch('/pending');const pending=response.text().then(()=>false,e=>({name:e.name,message:e.message}));
    await scope.dispose();scope.helper.fetch=previous;
    document.body.dispatchEvent(new Event('landlord-test'));
    return{events,aborted:await pending};
  });
  expect(result.events).toBe(1);expect(result.aborted).toMatchObject({name:'AbortError'});
});

test('native redraw keeps candidate selection and unsaved tenant edits, then resets on a changed reply',async({page})=>{
  await page.evaluate(async()=>{
    ctx.chat[0].mes='<companion>候选人:\n名字: "测试租客"\n年龄: "25"</companion>\n<tenantlore>姓名：测试租客\n年龄：25\n描述：原始档案</tenantlore>';
    await fixtureStart('original');
  });
  await expect(page.locator('.beautify-edit-area')).toHaveCount(1);
  await page.locator('.beautify-edit-area').fill('姓名：测试租客\n尚未保存的修改');
  await page.locator('.beautify-candidate-card').click();
  await page.evaluate(async()=>{
    document.querySelector('.mes_text').innerHTML='酒馆原生重绘';
    await eventSource.emit('character_message_rendered',0);
    await eventSource.emit('message_received',0);
  });
  await expect(page.locator('.beautify-edit-area')).toContainText('尚未保存的修改');
  expect(await page.locator('.beautify-candidate-card').evaluate(el=>jQuery(el).data('selected'))).toBe(true);
  await page.locator('.beautify-confirm-btn').click();
  expect(await page.evaluate(()=>fixtureWrites.filter(w=>w.command?.includes('测试租客')).length)).toBe(1);
  await page.evaluate(async()=>{ctx.chat[0].mes='<tenantlore>姓名：新租客\n描述：另一条回复</tenantlore>';document.querySelector('.mes_text').innerHTML='新回复';await eventSource.emit('message_edited',0)});
  await expect(page.locator('.beautify-edit-area')).toContainText('另一条回复');
});

test('pending initialization can be cancelled so a new chat does not wait forever',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const scope=runtime.scopes[0];
    const pending=scope.wait(new Promise(()=>{})).then(()=>false,e=>e.name);
    await runtime.setMode('remix');
    return{cancelled:await pending,running:runtime.running,errors:runtime.errors};
  });
  expect(result).toEqual({cancelled:'AbortError',running:true,errors:[]});
});

test('repeated mode switches do not accumulate message listeners or UI roots',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const before=eventSource.count('message_received');
    for(let i=0;i<3;i++){await runtime.setMode('remix');await runtime.setMode('original')}
    return{before,after:eventSource.count('message_received'),controls:document.querySelectorAll('#landlord-controls').length,errors:runtime.errors};
  });
  expect(result.after).toBe(result.before);expect(result.controls).toBe(1);expect(result.errors).toEqual([]);
});

test('saving a message commits the conversation preview and rejects a deleted conversation',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const conv=await ChatDB.createConversation({type:'private',name:'甲',members:['甲']});
    await ChatDB.addMessage(conv.id,'甲','已完整保存');
    const preview=(await ChatDB.getConversation(conv.id)).lastMessage.content;
    const synced=await ChatSync.instantSync(conv.id);
    let failed=false;try{await ChatDB.addMessage('不存在','甲','不可成为孤儿消息')}catch{failed=true}
    return{preview,synced,failed,orphan:(await ChatDB.getMessages('不存在')).length};
  });
  expect(result).toEqual({preview:'已完整保存',synced:true,failed:true,orphan:0});
});

test('remix scheduler deduplicates a queued job and only retries after the first attempt settles',async({page})=>{
  await page.evaluate(()=>fixtureStart('remix'));
  const ids=await page.evaluate(()=>{
    window.taskCalls=0;window.taskActive=0;window.maxTaskActive=0;
    const job={key:'test-job',execute:async()=>{taskCalls++;taskActive++;maxTaskActive=Math.max(maxTaskActive,taskActive);await new Promise(r=>setTimeout(r,100));taskActive--;if(taskCalls===1)throw Error('temporary');}};
    return[AptSystem.Scheduler.addTask(job),AptSystem.Scheduler.addTask(job)];
  });
  expect(ids[0]).toBe(ids[1]);
  await expect.poll(()=>page.evaluate(()=>AptSystem.Scheduler.history[0]?.status),{timeout:6000}).toBe('completed');
  expect(await page.evaluate(()=>({calls:taskCalls,max:maxTaskActive,status:AptSystem.Scheduler.history[0]?.status}))).toEqual({calls:2,max:1,status:'completed'});
});

test('different modules serialize writes to the same worldbook without losing either entry',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const names=await page.evaluate(async()=>{
    const a=runtime.scopes.find(s=>s.id==='S09'),b=runtime.scopes.find(s=>s.id==='S22');
    await Promise.all([
      a.value('updateWorldbookWith')('chat:test-A',async entries=>{await new Promise(r=>setTimeout(r,70));entries.push({name:'动态分析'});return entries}),
      b.value('updateWorldbookWith')('chat:test-A',entries=>[...entries,{name:'固定档案'}]),
    ]);
    return fixtureBooks['chat:test-A'].map(e=>e.name);
  });
  expect(names).toEqual(['动态分析','固定档案']);
});

test('a partially failed analysis batch does not advance the completed-floor marker',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const analyzer=TenantAnalyzer;
    analyzer.getTenantList=()=>({甲:{},乙:{}});analyzer.getCurrentFloor=()=>30;analyzer.lastAnalyzedFloor=0;
    analyzer.executeAnalysis=async name=>{if(name==='乙')throw Error('模拟失败');return{ok:true}};
    const failed=await analyzer.runAnalysisBatch(['甲','乙'],true);const afterFailure=analyzer.lastAnalyzedFloor;
    analyzer.executeAnalysis=async()=>({ok:true});const succeeded=await analyzer.runAnalysisBatch(['甲','乙'],true);
    return{failed,afterFailure,succeeded,afterSuccess:analyzer.lastAnalyzedFloor};
  });
  expect(result).toEqual({failed:false,afterFailure:0,succeeded:true,afterSuccess:30});
});

test('a failed opening variable write restores both the old message and old MVU data',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const values=new Map();runtime.store={get:async k=>structuredClone(values.get(k)),set:async(k,v)=>values.set(k,structuredClone(v))};
    runtime.content={worldbook:{entries:[{comment:'[InitVar]',content:'fixture'}]}};
    runtime.helper.YAML={parse:()=>({世界:{年份:'新世界'}})};
    const before=structuredClone(fixtureState);const oldMessage=ctx.chat[0].mes;
    const mvu=runtime.helper.Mvu;const original=mvu.replaceMvuData;let count=0;
    mvu.replaceMvuData=async data=>{await original(data);if(!count++)throw Error('模拟部分写入失败')};
    let failed=false;try{await runtime.rebuildOpening(runtime.scopes.find(s=>s.id==='S23'),'新开场')}catch{failed=true}
    mvu.replaceMvuData=original;
    return{failed,message:ctx.chat[0].mes,oldMessage,stateRestored:JSON.stringify(before)===JSON.stringify(fixtureState),pending:await runtime.store.get(`opening-pending:${runtime.identity()}`)};
  });
  expect(result.failed).toBe(true);expect(result.message).toBe(result.oldMessage);expect(result.stateRestored).toBe(true);expect(result.pending).toBeNull();
});

test('switching chat between opening writes never writes MVU into the new chat and recovers on return',async({page})=>{
  await page.evaluate(()=>fixtureStart('original'));
  const result=await page.evaluate(async()=>{
    const values=new Map();runtime.store={get:async k=>structuredClone(values.get(k)),set:async(k,v)=>values.set(k,structuredClone(v))};
    runtime.content={worldbook:{entries:[{comment:'[InitVar]',content:'fixture'}]}};
    runtime.helper.YAML={parse:()=>({世界:{年份:'新世界'}})};
    const oldChat=ctx.chat,oldText=ctx.chat[0].mes;
    const oldSet=runtime.helper.setChatMessages,oldMvu=runtime.helper.Mvu.replaceMvuData;
    let switched=false,writes=0;
    runtime.helper.Mvu.replaceMvuData=async(...a)=>{writes++;return oldMvu(...a)};
    runtime.helper.setChatMessages=async(...a)=>{
      await oldSet(...a);
      if(!switched){switched=true;ctx.chatId='test-B';ctx.chat=[{mes:'B 的开场',is_user:false}];await eventSource.emit('chat_id_changed','test-B')}
    };
    let aborted=false;try{await runtime.rebuildOpening(runtime.scopes.find(s=>s.id==='S23'),'新开场')}catch(e){aborted=e.name==='AbortError'}
    await runtime.transitions.tail;const inB={text:ctx.chat[0].mes,writes};
    runtime.helper.setChatMessages=oldSet;
    ctx.chatId='test-A';ctx.chat=oldChat;await eventSource.emit('chat_id_changed','test-A');await runtime.transitions.tail;
    runtime.helper.Mvu.replaceMvuData=oldMvu;
    return{aborted,inB,restored:ctx.chat[0].mes===oldText,pending:await runtime.store.get(`opening-pending:${runtime.identity()}`),errors:runtime.errors};
  });
  expect(result).toEqual({aborted:true,inB:{text:'B 的开场',writes:0},restored:true,pending:null,errors:[]});
});
