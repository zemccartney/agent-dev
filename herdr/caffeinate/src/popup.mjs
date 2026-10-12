import {emitKeypressEvents} from 'node:readline';
import {safeText,presentAgent,formatLocalDeadline} from './presentation.mjs';
import {validateDuration} from './model.mjs';
import {request,PLUGIN_ID} from './herdr.mjs';

export async function openControls(context,env=process.env,send=request){
 let invocation;
 try{invocation=JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON??'{}');}catch{throw new Error('Invalid Herdr action context');}
 const target=invocation.focused_pane_id??env.HERDR_PANE_ID;
 if(target!==undefined&&typeof target!=='string')throw new Error('Invalid Herdr pane context');
 const params={plugin_id:PLUGIN_ID,entrypoint:'controls',placement:'popup',env:target?{CAFFEINATE_TARGET:target}:{}};
 await send(context.socketPath,'plugin.pane.open',params);
}

export async function runPopup({client,input,output,target}){
 if(!input.isTTY||!output.isTTY)throw new Error('Caffeination controls require an interactive terminal');
 let snapshot,selected=target,view='controls',focus=0,hours='2',replace=true,message='',busy=false,ended=false,timer;
 let settingsHours='8',automatic=true;const wasRaw=!!input.isRaw;
 const request=async m=>{const r=await client.request(m);snapshot=r.snapshot;return snapshot;};
 const row=()=>snapshot?.agents.find(a=>a.target===selected);
 function paint(){
  if(ended)return;const lines=['Caffeination',''];
  if(view==='help')lines.push('Automatic caffeination starts after ten seconds.','Only while plugged in; the display may sleep.','Finishing or waiting for input ends this run’s caffeine.','Set from now affects this run only, not future defaults.','Idle / permission wait: Set next run arms one run.','Expiration never stops the agent.','Short native timeouts may end less than one second early.','','Escape · back');
  else if(view==='settings')lines.push('Settings','',`${focus===0?'>':' '} [${automatic?'x':' '}] Automatic`,`${focus===1?'>':' '} Default hours: ${settingsHours}`,`${focus===2?'>':' '} Save`,'','Space · toggle   Tab · next   Enter · save','Escape · back');
  else if(!row()){
   lines.push(snapshot?.agents.length?'Choose an agent':'No supported local agents available','');
   for(let i=0;i<(snapshot?.agents.length??0);i++){const a=snapshot.agents[i];lines.push(`${i===focus?'>':' '} ${safeText(a.target)} · ${a.active?'☕ ':''}${a.state.phase}`);}
   lines.push('','↑/↓ · select   Enter · open   s · settings   ? · help   Esc · close');
  }else{
   const a=row(),p=presentAgent(a,snapshot.power);lines.push(`${safeText(a.target)} · ${p.cup?p.cup+' ':''}${a.state.phase}`,'',p.headline,'');
   if(a.state.lease&&!a.active)lines.push(formatLocalDeadline(a.state.lease.deadlineAt),'');
   lines.push(`${focus===0?'>':' '} Hours: ${hours}`,`${focus===1?'>':' '} ${p.primaryLabel}`);
   if(p.secondaryLabel)lines.push(`${focus===2?'>':' '} ${p.secondaryLabel}`);
   if(a.error)lines.push('',safeText(a.error));
   lines.push('','Tab · next   Enter · apply   s · settings   ? · help   Esc · close');
  }
  if(message||snapshot?.error)lines.push('',safeText(message||snapshot.error));
  const width=Math.max(20,(output.columns??80)-2);const wrapped=lines.flatMap(line=>{const chars=[...safeText(line)];if(!chars.length)return [''];const parts=[];while(chars.length)parts.push(chars.splice(0,width).join(''));return parts;});
  output.write('\x1b[H\x1b[2J'+wrapped.join('\r\n'));
 }
 async function refresh(){if(busy||ended)return;busy=true;try{await request({type:'snapshot'});}catch(e){message=e.message;}finally{busy=false;paint();}}
 function duration(value){const h=Number(value);const ms=Math.floor(h*3600000);validateDuration(ms,Date.now());return ms;}
 async function submit(command){busy=true;try{await request({type:'command',command});message='';}catch(e){message=e.message;try{await request({type:'snapshot'});}catch{}}finally{busy=false;paint();}}
 let finish;
 const done=new Promise(resolve=>{finish=resolve;});
 function end(){if(ended)return;ended=true;clearInterval(timer);input.off('keypress',key);input.off('end',end);output.off('resize',paint);input.setRawMode(wasRaw);input.pause();output.write('\x1b[?25h\x1b[?1049l');client.close();finish();}
 async function key(str,k={}){
  if(ended)return;if(k.ctrl&&k.name==='c')return end();
  if(k.name==='escape'){if(view!=='controls'){view='controls';focus=0;paint();return;}return end();}
  if(busy)return;
  if(str==='?'||k.name==='?'){view='help';paint();return;}
  if(view==='help')return;
  if(str==='s'&&view==='controls'){view='settings';automatic=snapshot?.config.automatic??true;settingsHours=String((snapshot?.config.defaultDurationMs??28800000)/3600000);focus=0;replace=true;message='';paint();return;}
  const a=row(),max=view==='settings'?3:!a?Math.max(1,snapshot?.agents.length??0):presentAgent(a,snapshot.power).secondaryLabel?3:2;
  if(['tab','down','up'].includes(k.name)){focus=(focus+(k.name==='up'||k.shift?-1:1)+max)%max;replace=true;paint();return;}
  if(view==='settings'&&focus===0&&(k.name==='space'||str===' ')){automatic=!automatic;paint();return;}
  if(k.name==='return'){
   try{
    if(view==='settings'){await submit({type:'set-config',config:{automatic,defaultDurationMs:duration(settingsHours)}});return;}
    if(!a){selected=snapshot?.agents[focus]?.target;focus=0;paint();return;}
    const guard={occupant:a.state.occupant,runId:a.state.runId,revision:a.state.revision};
    if(focus===2){await submit({...guard,type:a.state.armedDurationMs!==null?'cancel-arm':'release'});}
    else await submit({...guard,type:'set-duration',durationMs:duration(hours)});
   }catch(e){message=e.message;paint();}return;
  }
  const editing=view==='settings'?focus===1:!!a&&focus===0;
  if(editing){let v=view==='settings'?settingsHours:hours;
   if(k.ctrl&&k.name==='u'){v='';replace=false;}
   else if(k.name==='backspace'){v=v.slice(0,-1);replace=false;}
   else if(str&&/^[0-9.eE+-]+$/.test(str)&&str.length<100){v=replace?str:v+str;replace=false;}
   if(v.length<=100){if(view==='settings')settingsHours=v;else hours=v;}paint();
  }
 }
 try{
  await request({type:'snapshot'});output.write('\x1b[?1049h\x1b[?25l');emitKeypressEvents(input);input.setRawMode(true);input.resume();input.on('keypress',key);input.on('end',end);output.on('resize',paint);paint();timer=setInterval(refresh,1000);await done;
 }finally{end();}
}
