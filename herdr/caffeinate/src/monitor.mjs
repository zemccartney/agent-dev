import {initialState,reduce,DEFAULT_CONFIG} from './model.mjs';
import {validateConfig} from './config.mjs';

/** Serialized control plane. Never interprets an event payload as history. */
export function createMonitor({herdr,assertions,readPower,now=Date.now,config=DEFAULT_CONFIG,persistConfig=async()=>{},reloadConfig}){
 let prefs=validateConfig(config),rows=new Map(),power='unknown',instance=null,stopped=false,chain=Promise.resolve(),error=null,gap=false;
 const serial=fn=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;};
 const key=row=>`${row.state.occupant}:${row.state.runId}`;
 async function clear(){
  await assertions.close();
  await Promise.allSettled([...rows.values()].map(row=>herdr.publishToken(row.target,null,6000)));
  for(const row of rows.values()){row.active=false;row.state=initialState(row.state.occupant);}
  herdr.close();stopped=true;
 }
 async function sync(){
  if(stopped)return;
  power=await readPower().catch(()=> 'unknown');
  const desired=new Map();
  for(const row of rows.values()){
   row.state=reduce(row.state,{type:'tick'},now(),prefs);
   if(row.state.lease&&power==='ac')desired.set(key(row),row.state.lease.deadlineAt);
  }
  const active=await assertions.reconcile(desired);
  for(const row of rows.values()){
   row.active=active.has(key(row));
   if(desired.has(key(row))&&!row.active&&desired.get(key(row))-now()>=1000)row.error='Could not acquire caffeination assertion';
   else if(row.error==='Could not acquire caffeination assertion')row.error=null;
   // Refresh only every two seconds; otherwise event-driven refreshes can loop
   // through metadata notifications. Clearing a cup is immediate.
   const token=row.active?'☕':null;
   if(row.token!==token||now()-row.tokenAt>=2000){
    try{await herdr.publishToken(row.target,token,6000);row.token=token;row.tokenAt=now();}catch(e){row.error=`Sidebar unavailable: ${e.message}`;}
   }
  }
 }
 async function refresh(){
  if(stopped)return;
  try{
   const host=await herdr.hostStatus();
   if(!host.local||!host.pluginEnabled||instance&&instance!==host.instance){await clear();return;}
   instance=host.instance;
   if(reloadConfig)prefs=validateConfig(await reloadConfig());
   const tracked=await herdr.list(),seen=new Set();
   for(const agent of tracked){
    seen.add(agent.occupant);let row=rows.get(agent.occupant);
    if(!row){row={target:agent.target,state:initialState(agent.occupant),active:false,error:null,token:undefined,tokenAt:0};rows.set(agent.occupant,row);}
    row.target=agent.target;
    if(gap){row.state={...row.state,boundaryKnown:false};}
    try{
     const observation=await herdr.observe(agent.target);
     if(observation.occupant!==agent.occupant)throw new Error('Agent identity changed during observation');
     row.state=reduce(row.state,{type:'observe',observation},now(),prefs);row.error=null;
     if(observation.evidence==='uncertain'&&agent.kind==='pi'&&!row.state.lease)row.error='Pi lifecycle unavailable; install/update Herdr’s Pi integration';
    }catch(e){row.state=reduce(row.state,{type:'observe',observation:{occupant:agent.occupant,phase:'unknown',evidence:'uncertain'}},now(),prefs);row.error=e.message;}
   }
   for(const [occupant,row] of rows)if(!seen.has(occupant)){await herdr.publishToken(row.target,null,6000).catch(()=>{});rows.delete(occupant);}
   gap=false;error=null;
  }catch(e){gap=true;error=e.message;}
  await sync();
 }
 return {
  refresh:()=>serial(refresh),
  tick:()=>serial(refresh),
  markGap:()=>serial(async()=>{gap=true;}),
  command:command=>serial(async()=>{
   if(stopped)throw new Error('Monitor stopped');
   if(command.type==='set-config'){
    const next=validateConfig(command.config);await persistConfig(next);prefs=next;return;
   }
   // Re-read before honoring UI intent; a completed/replaced run rejects old guards.
   await refresh();if(stopped)throw new Error('Monitor stopped');
   const row=rows.get(command.occupant);
   if(!row||row.state.runId!==command.runId||row.state.revision!==command.revision)throw new Error('Agent changed; refresh controls and try again');
   const type=command.type==='set-duration'?'manual':command.type;
   if(!['manual','release','cancel-arm'].includes(type))throw new Error('Invalid command');
   row.state=reduce(row.state,{type,durationMs:command.durationMs},now(),prefs);await sync();
  }),
  snapshot:()=>({now:now(),power,config:{...prefs},stopped,error,agents:[...rows.values()].map(({target,state,active,error})=>({target,state:structuredClone(state),active,error}))}),
  close:()=>serial(async()=>{if(!stopped)await clear();}),
 };
}
