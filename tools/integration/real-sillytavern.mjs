/** Disposable real-host integration. Never reads the owner's SillyTavern installation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../..');
const fixture=path.join(root,'.local/sillytavern-test');
const ST='8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8';
const TH='8e0f4324e7d051025a333831411f03bd3145fac8';
const plugin=path.join(fixture,'public/scripts/extensions/third-party/JS-Slash-Runner');
async function clone(url,dir,ref){
  try{await fs.access(path.join(dir,'.git'))}catch{execFileSync('git',['clone','--depth','1',url,dir],{stdio:'inherit'})}
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim();
  if(head!==ref){execFileSync('git',['fetch','--depth','1','origin',ref],{cwd:dir,stdio:'inherit'});execFileSync('git',['checkout','--detach',ref],{cwd:dir,stdio:'inherit'})}
}
await clone('https://github.com/SillyTavern/SillyTavern.git',fixture,ST);
await clone('https://github.com/N0VI028/JS-Slash-Runner.git',plugin,TH);
try{await fs.access(path.join(fixture,'node_modules/express'))}catch{execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:fixture,stdio:'inherit'})}
const port=8776,origin=`http://127.0.0.1:${port}`;
const data=`data-landlord-${Date.now()}`;
const server=spawn(process.execPath,['server.js','--port',String(port),'--listen','false','--browserLaunchEnabled','false','--dataRoot',`./${data}`],{cwd:fixture,stdio:'ignore'});
let browser;
const report={date:new Date().toISOString(),sillytavern:{version:'1.18.0',commit:ST},tavernHelper:{version:'4.9.5',commit:TH},checks:[],paidApiCalls:0};
try{
  let up=false;for(let i=0;i<120;i++){try{const res=await fetch(origin+'/csrf-token');if(res.ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
  assert.ok(up,'isolated server must start');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /\[(房东模拟器|正文美化|AptOS|ChatSync|ChatDB)/.test(m.text()))errors.push(m.text())});
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
  const card=await fs.readFile(path.join(root,`exports/房东模拟器Z${pkg.version}.json`));
  const token=(await (await context.request.get(origin+'/csrf-token')).json()).token;
  const imported=await context.request.post(origin+'/api/characters/import',{headers:{'X-CSRF-Token':token},multipart:{avatar:{name:'landlord.json',mimeType:'application/json',buffer:card},file_type:'json'}});
  assert.equal(imported.status(),200);
  await page.route('https://api.github.com/repos/KelvinKHan/landlord-simulator-cards/releases/latest',r=>r.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
  await page.route('https://cdn.jsdelivr.net/gh/KelvinKHan/landlord-simulator-cards@*/dist/*',async r=>{const file=r.request().url().split('/').at(-1);await r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:file.endsWith('.json')?'application/json':'application/javascript',body:await fs.readFile(path.join(root,'dist',file))})});
  await page.route(/\/chat\/completions|\/api\/backends\/.*\/generate|\/api\/generate$/,r=>{report.paidApiCalls++;return r.abort()});
  await page.goto(origin);
  await page.waitForFunction(()=>window.TavernHelper && window.SillyTavern);
  await page.waitForTimeout(1500);
  if(await page.locator('.popup-input:visible').count()){await page.locator('.popup-input:visible').fill('隔离测试房东');await page.getByRole('dialog').getByText('Save',{exact:true}).click()}
  await page.waitForFunction(()=>SillyTavern.getContext().characters.some(c=>c.name==='房东模拟器Z5.20'));
  await page.evaluate(async()=>{const {selectCharacterById,characters}=await import('/script.js');void selectCharacterById(characters.findIndex(c=>c.name==='房东模拟器Z5.20'))});
  await page.waitForTimeout(2000);
  for(const button of await page.getByText('确认',{exact:true}).all()){if(await button.isVisible()){await button.click();break}}
  await page.evaluate(()=>{const toggle=document.getElementById('角色脚本-script-enable-toggle');if(toggle&&!toggle.checked)toggle.click()});
  for(let i=0;i<3;i++){const popup=page.locator('dialog[open]');if(!await popup.count())break;console.log('Fixture dialog:',(await popup.last().innerText()).slice(0,350));const ok=popup.last().locator('.popup-button-ok');if(!await ok.count())break;await ok.click();await page.waitForTimeout(300)}
  await page.waitForFunction(()=>window.LandlordRuntime?.running,{},{timeout:90000});
  const first=await page.evaluate(()=>({scopes:LandlordRuntime.scopes.length,errors:LandlordRuntime.errors,state:LandlordRuntime.readState(),scripts:TavernHelper.getScriptTrees({type:'character'}).length}));
  assert.equal(first.scopes,20);assert.equal(first.scripts,1);assert.deepEqual(first.errors,[]);assert.ok(first.state.世界);
  assert.equal(Object.hasOwn(first.state,'大富翁'),false);assert.equal(Object.hasOwn(first.state,'分基地'),false);
  const liveBook=await page.evaluate(async()=>{const name=TavernHelper.getCharWorldbookNames('current').primary;return TavernHelper.getWorldbook(name)});
  assert.doesNotMatch(JSON.stringify(liveBook),/大富翁|分基地|monopoly/i);
  report.checks.push('single imported script, original 20 modules, real MVU initialized');
  report.checks.push('new chat and live character worldbook contain no retired gameplay state or rules');

  await page.locator('#landlord-controls summary').click();await page.getByRole('button',{name:'使用二改版',exact:true}).click();
  await page.waitForFunction(()=>LandlordRuntime.mode==='remix' && LandlordRuntime.running);
  assert.equal(await page.evaluate(()=>LandlordRuntime.scopes.length),7);
  assert.equal(await page.locator('#apt-shadow-host').count(),1);
  report.checks.push('in-game mode button switches to remix with 7 modules');
  await page.evaluate(async()=>{const {swipe_right}=await import('/script.js');await swipe_right()});
  await page.waitForFunction(()=>LandlordRuntime.running && SillyTavern.getContext().chat[0].swipe_id===1 && LandlordRuntime.readState().世界?.年份==='2025年');
  report.checks.push('real swipe updates MVU and restarts modules');
  await page.evaluate(()=>LandlordRuntime.setMode('original'));
  const opening=JSON.parse(card).data.alternate_greetings[0];
  await page.evaluate(async greeting=>{const rt=LandlordRuntime;await rt.rebuildOpening(rt.scopes.find(s=>s.id==='S23'),greeting)},opening);
  assert.equal(await page.evaluate(()=>LandlordRuntime.readState().世界.年份),'2025年');
  assert.deepEqual(await page.evaluate(()=>Object.keys(LandlordRuntime.readState()).filter(key=>['大富翁','分基地'].includes(key))),[]);
  report.checks.push('workshop opening uses real MVU parse and replace APIs');
  const sample='<companion>候选人:\n名字: "测试租客"\n年龄: "25"</companion>\n<tenantlore>姓名：测试租客\n年龄：25\n描述：原始档案</tenantlore>';
  await page.evaluate(async message=>{await TavernHelper.createChatMessages([{role:'assistant',message}])},sample);
  await page.waitForFunction(()=>document.querySelector('.mes[mesid="1"] .beautify-edit-area'));
  const area=page.locator('.mes[mesid="1"] .beautify-edit-area');
  await area.fill('姓名：测试租客\n实际酒馆中未保存的修改');
  await page.locator('.mes[mesid="1"] .beautify-candidate-card').click();
  await page.evaluate(async message=>{await TavernHelper.setChatMessages([{message_id:1,message}],{refresh:'affected'})},sample);
  await page.waitForFunction(()=>document.querySelector('.mes[mesid="1"] .beautify-edit-area')?.textContent.includes('未保存的修改'));
  assert.equal(await page.locator('.mes[mesid="1"] .beautify-candidate-card').evaluate(el=>jQuery(el).data('selected')),true);
  report.checks.push('real embedded regex and S22 preserve candidate selection and unsaved edits after native message redraw');

  const end=await page.evaluate(()=>({errors:LandlordRuntime.errors,scripts:document.querySelectorAll('iframe[id^="TH-script"]').length,books:TavernHelper.getWorldbookNames()}));
  assert.deepEqual(end.errors,[]);assert.equal(end.scripts,1);assert.deepEqual(errors,[]);assert.equal(report.paidApiCalls,0);
  report.checks.push('no runtime/page errors, no paid API requests, one helper script remains');
  report.version=pkg.version;report.result='passed';
  await page.screenshot({path:path.join(root,'.local/real-sillytavern.png')});
  await fs.mkdir(path.join(root,'docs/testing'),{recursive:true});
  await fs.writeFile(path.join(root,'docs/testing/real-sillytavern.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.kill('SIGTERM')}
