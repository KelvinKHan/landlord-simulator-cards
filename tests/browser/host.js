import { z } from '/node_modules/zod/index.js';
window.z=z;
class Emitter {
  listeners=new Map();
  on(e,fn){const set=this.listeners.get(e)||new Set();set.add(fn);this.listeners.set(e,set);return this;}
  off(e,fn){this.listeners.get(e)?.delete(fn)}
  removeListener(e,fn){this.off(e,fn)}
  async emit(e,...args){for(const fn of [...(this.listeners.get(e)||[])])await fn(...args)}
  count(e){return this.listeners.get(e)?.size||0}
}
window.eventSource=new Emitter();
window.fixtureState={世界:{年份:'2026',日期:'9月7日',星期:'星期一',时间:'12:00'},公寓:{楼层列表:['一楼','二楼'],房间列表:{测试卧室:{名称:'测试卧室',类型:'卧室',楼层:'二楼',位置:'1-2',住户:'无',描述:'测试'}}},租客列表:{}};
window.ctx={characterId:0,chatId:'test-A',name1:'测试房东',name2:'房东模拟器测试',chat:[{mes:'测试开场',is_user:false,name:'测试',swipe_id:0,variables:{stat_data:fixtureState}}],chatMetadata:{},characters:[{name:'房东模拟器测试',avatar:'landlord-test.png'}],eventSource:window.eventSource};
window.SillyTavern={getContext:()=>ctx,getCurrentChatId:()=>ctx.chatId};
window.Mvu={getMvuData:()=>({stat_data:structuredClone(fixtureState)}),replaceMvuData:async d=>{fixtureState=d.stat_data},parseMessage:async(_,d)=>d};
window.toastr={info(){},success(){},warning(){},error(){}};
window.fixtureBooks={'card-book':[], 'chat:test-A':[]};
window.fixtureWrites=[];
window.helperAPI={
  z,_,toastr,Mvu,SillyTavern,eventSource,
  getCurrentCharacterId:()=> 'landlord-test.png',getScriptId:()=> 'landlord-single-entry',
  getContext:()=>ctx,getLastMessageId:()=>ctx.chat.length-1,
  getChatMessages:(range,opts={})=>{
    const all=ctx.chat.map((m,i)=>({message_id:i,message:m.mes,role:m.is_user?'user':'assistant',swipe_id:m.swipe_id||0}));
    if(typeof range==='number')return [all[range<0?all.length+range:range]].filter(Boolean);
    return all.filter(m=>!opts.role||m.role===opts.role);
  },
  retrieveDisplayedMessage:id=>jQuery(`.mes[mesid="${id}"] .mes_text`),
  formatAsDisplayedMessage:raw=>raw,formatAsTavernRegexedString:raw=>raw,
  getVariables:()=>({}),replaceVariables(){},updateVariablesWith(){},insertOrAssignVariables(){},getvar:()=>undefined,
  getCharWorldbookNames:()=>({primary:'card-book',additional:[]}),
  getOrCreateChatWorldbook:async()=>{const key='chat:'+ctx.chatId;fixtureBooks[key]||=[];return key},
  getWorldbook:async key=>structuredClone(fixtureBooks[key]||[]),
  updateWorldbookWith:async(key,fn)=>{fixtureBooks[key]=await fn(structuredClone(fixtureBooks[key]||[]));fixtureWrites.push({key,value:structuredClone(fixtureBooks[key])});return fixtureBooks[key]},
  setChatMessages:async items=>{for(const item of items)ctx.chat[item.message_id].mes=item.message},
  eventOn:(event,fn)=>{eventSource.on(event,fn);return{stop:()=>eventSource.off(event,fn)}},
  eventRemoveListener:(event,fn)=>eventSource.off(event,fn),eventEmit:(...args)=>eventSource.emit(...args),
  tavern_events:{MESSAGE_RECEIVED:'message_received',CHAT_CHANGED:'chat_id_changed',CHARACTER_MESSAGE_RENDERED:'character_message_rendered',MESSAGE_EDITED:'message_edited',MESSAGE_SWIPED:'message_swiped'},
  getButtonEvent:name=>'button:'+name,appendInexistentScriptButtons(){},triggerSlash:async command=>{fixtureWrites.push({command})},
};
Object.assign(window,helperAPI);
const iframe=document.createElement('iframe');iframe.id='test-helper';iframe.hidden=true;document.body.append(iframe);
Object.assign(iframe.contentWindow,helperAPI,{__LANDLORD_TEST__:true,$:jQuery,jQuery});
window.fixtureStart=async(mode)=>{
  if(mode)localStorage.setItem('landlord:mode:landlord-test.png',mode);
  const module=await iframe.contentWindow.eval('import("/dist/runtime.js")');
  window.runtime=await module.start({helper:iframe.contentWindow,host:window,skipMvu:true,content:{worldbook:{entries:[]}}});
  return runtime;
};
window.fixtureReady=true;
