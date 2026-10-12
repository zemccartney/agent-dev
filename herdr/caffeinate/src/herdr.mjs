import net from 'node:net';
import {lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
export const PLUGIN_ID='agent-dev.caffeinate';
const MAX=1024*1024;
const phase=s=>s==='done'?'idle':s;
export function occupantKey(instance,a,processIdentity=''){
 return createHash('sha256').update(JSON.stringify([instance,a.terminal_id,a.agent,a.agent_session?.source,a.agent_session?.kind,a.agent_session?.value,processIdentity])).digest('hex');
}
export function classifyAgent(a,e){
 const o={occupant:a.occupant??occupantKey('',a),phase:'unknown',evidence:'uncertain'};
 if(!e||!['pi','claude'].includes(a.agent)||e.agent&&e.agent!==a.agent)return o;
 const p=phase(a.agent_status);
 if(!['working','idle','blocked'].includes(p)||phase(e.state)!==p)return o;
 if(a.agent==='pi'){
  if(a.screen_detection_skipped===true&&e.screen_detection_skipped===true&&e.screen_detection_skip_reason==='full_lifecycle_hook_authority')return {...o,phase:p,evidence:'authoritative'};
  return o;
 }
 if(e.skip_state_update||e.skipped_update_reason||e.fallback_reason||e.screen_detection_skipped)return o;
 const visible=p==='working'?e.visible_working:p==='blocked'?e.visible_blocker:e.visible_idle;
 if(e.matched_rule?.state===p&&visible===true)return {...o,phase:p,evidence:'positive'};
 return o;
}
/** One newline-delimited request; no shell and no transcript reads. */
export function request(socketPath,method,params={},timeoutMs=5000){
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(socketPath);let buffer='',done=false;
  const timer=setTimeout(()=>finish(new Error(`${method}: timed out`)),timeoutMs);
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
  socket.on('connect',()=>socket.write(JSON.stringify({id:'caffeinate',method,params})+'\n'));
  socket.on('error',e=>finish(e));socket.on('end',()=>finish(new Error(`${method}: connection ended`)));
  socket.on('data',data=>{buffer+=data;if(Buffer.byteLength(buffer)>MAX)return finish(new Error('Herdr response too large'));const end=buffer.indexOf('\n');if(end<0)return;
   try{const v=JSON.parse(buffer.slice(0,end));if(v.error)finish(Object.assign(new Error(v.error.message??v.error.code),{code:v.error.code}));else if(v.result)finish(null,v.result);else finish(new Error('Invalid Herdr response'));}catch(e){finish(e);}
  });
 });
}
export async function localHost(socketPath){
 const st=await lstat(socketPath);if(!st.isSocket()||st.uid!==process.getuid())throw new Error('Not an owned local Herdr socket');
 const {stdout}=await exec('/usr/sbin/lsof',['-n','-Fpc',socketPath],{timeout:1500,maxBuffer:MAX});
 const pairs=stdout.match(/p\d+\ncherdr\n/g)??[];
 if(pairs.length!==1)throw new Error('Cannot establish local Herdr server ownership');
 const pid=Number(pairs[0].match(/p(\d+)/)[1]);
 const {stdout:started}=await exec('/bin/ps',['-p',String(pid),'-o','lstart='],{timeout:1500});
 if(!started.trim())throw new Error('Herdr server exited');
 return {instance:`${st.dev}:${st.ino}:${st.birthtimeMs}:${pid}:${started.trim()}`,local:true};
}
export async function localAgentProcess(info,kind){
 const all=info?.foreground_processes??[];
 if(all.some(p=>['ssh','mosh','tmux'].includes(p.name)))return null;
 const selected=all.find(p=>p.name===kind||p.argv0===kind||(['node','bun'].includes(p.name)&&p.argv?.some(a=>kind==='pi'?/pi-coding-agent\/dist\/(bundle\/)?cli\.js$/.test(a):/claude-code\/.+\.(js|mjs)$/.test(a))));
 if(!selected||!Number.isSafeInteger(selected.pid)||selected.pid<1)return null;
 const {stdout}=await exec('/bin/ps',['-p',String(selected.pid),'-o','lstart='],{timeout:1500});
 return stdout.trim()?`${selected.pid}:${stdout.trim()}`:null;
}
export async function connectHerdr({socketPath,onInvalidate=()=>{},onUnavailable=()=>{},verifyHost,verifyProcess=localAgentProcess}){
 let sub=null,subKey='',closed=false;
 const client={
  async hostStatus(){
   if(verifyHost)return verifyHost();
   const host=await localHost(socketPath);const r=await request(socketPath,'plugin.list',{plugin_id:PLUGIN_ID});
   return {...host,pluginEnabled:r.plugins?.some(p=>p.plugin_id===PLUGIN_ID&&p.enabled)===true};
  },
  async list(){
   const host=await client.hostStatus();if(!host.local)throw new Error('Remote Herdr not supported');
   const r=await request(socketPath,'session.snapshot',{});
   if(!Array.isArray(r.snapshot?.agents))throw new Error('Invalid Herdr snapshot');
   const result=[];
   for(const a of r.snapshot.agents){
    if(!['pi','claude'].includes(a.agent))continue;
    const p=await request(socketPath,'pane.process_info',{pane_id:a.pane_id});
    const processIdentity=await verifyProcess(p.process_info,a.agent);if(!processIdentity)continue;
    result.push({target:a.pane_id,occupant:occupantKey(host.instance,a,processIdentity),kind:a.agent,record:a});
   }
   await subscribe(result.map(a=>a.target));return result;
  },
  async observe(target){
   const host=await client.hostStatus();if(!host.local)throw new Error('Remote Herdr not supported');
   const first=(await request(socketPath,'agent.get',{target})).agent;
   if(!first)throw new Error('Agent disappeared');
   const pi=(await request(socketPath,'pane.process_info',{pane_id:first.pane_id})).process_info;
   const id=await verifyProcess(pi,first.agent);if(!id)throw new Error('Local agent process not established');
   const occupant=occupantKey(host.instance,first,id);let explain;
   try{explain=(await request(socketPath,'agent.explain',{target})).explain;}catch{return {occupant,phase:'unknown',evidence:'uncertain'};}
   const last=(await request(socketPath,'agent.get',{target})).agent;
   if(!last||occupantKey(host.instance,last,id)!==occupant||last.state_change_seq!==first.state_change_seq)return {occupant,phase:'unknown',evidence:'uncertain'};
   return classifyAgent({...last,occupant},explain);
  },
  async publishToken(target,value,ttlMs=6000){await request(socketPath,'pane.report_metadata',{pane_id:target,source:PLUGIN_ID,tokens:{caffeination:value||null},ttl_ms:ttlMs});},
  close(){closed=true;sub?.destroy();sub=null;subKey='';},
 };
 async function subscribe(targets){
  const key=JSON.stringify(targets.sort());if(closed||sub&&subKey===key)return;
  sub?.destroy();const socket=net.createConnection(socketPath);sub=socket;subKey=key;
  const subscriptions=['pane.created','pane.closed','pane.exited','pane.agent_detected','pane.moved'].map(type=>({type}));
  subscriptions.push(...targets.map(pane_id=>({type:'pane.agent_status_changed',pane_id})));
  await new Promise((resolve,reject)=>{
   let buffer='',ready=false;
   const timer=setTimeout(()=>fail(new Error('Subscription timed out')),5000);
   function fail(error){clearTimeout(timer);if(sub===socket){sub=null;subKey='';}socket.destroy();if(!ready)reject(error);if(!closed){onUnavailable(error);onInvalidate();}}
   socket.on('error',fail);socket.on('end',()=>fail(new Error('Subscription ended')));
   socket.on('connect',()=>socket.write(JSON.stringify({id:'caffeinate-events',method:'events.subscribe',params:{subscriptions}})+'\n'));
   socket.on('data',d=>{buffer+=d;if(Buffer.byteLength(buffer)>MAX)return fail(new Error('Event batch too large'));let end;
    while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const v=JSON.parse(line);if(v.error)return fail(new Error(v.error.code??'Subscription failed'));if(!ready){if(v.result?.type!=='subscription_started')return fail(new Error('Unexpected subscription acknowledgement'));ready=true;clearTimeout(timer);resolve();onInvalidate();}else onInvalidate();}catch(e){return fail(e);}}
   });
  });
 }
 await subscribe([]);return client;
}
