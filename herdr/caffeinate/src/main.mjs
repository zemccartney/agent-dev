#!/usr/bin/env node
import {join} from 'node:path';
import {resolveContext,ensureMonitor,serveRuntime,runtimeRequest} from './runtime.mjs';
import {connectHerdr} from './herdr.mjs';
import {createAssertions} from './assertions.mjs';
import {readPower} from './power.mjs';
import {createMonitor} from './monitor.mjs';
import {loadConfig,saveConfig} from './config.mjs';

async function runMonitor(context){
 let monitor,ipc,client,timer,closing=false,busy=false,dirty=false;
 const log=e=>console.error(new Date().toISOString(),e.message??e);
 async function shutdown(){
  if(closing)return;closing=true;clearTimeout(timer);
  // Release OS children even if the serialized Herdr control plane is stuck.
  await assertions.close();await monitor?.close();client?.close();await ipc?.close();
 }
 const assertions=createAssertions({onExit:(_key,error)=>{if(error)log(error);schedule();}});
 function schedule(){if(closing)return;dirty=true;if(!busy){clearTimeout(timer);timer=setTimeout(cycle,50);}}
 async function cycle(){
  if(closing||!monitor)return;busy=true;dirty=false;
  try{await monitor.refresh();if(monitor.snapshot().stopped){await shutdown();return;}}catch(e){log(e);}
  finally{busy=false;if(!closing)timer=setTimeout(cycle,dirty?50:1000);}
 }
 try{
  ipc=await serveRuntime(context,async message=>{
   if(!monitor)throw new Error('Monitor starting');
   if(message.type==='command'){
    if(message.command?.type==='stop-monitor'){setTimeout(shutdown,100);}
    else await monitor.command(message.command);
   }
   return {snapshot:monitor.snapshot()};
  });
  client=await connectHerdr({socketPath:context.socketPath,onInvalidate:schedule,onUnavailable:e=>{log(e);monitor?.markGap();}});
  const configPath=join(context.configDir,'settings.json');
  monitor=createMonitor({herdr:client,assertions,readPower,config:await loadConfig(configPath),persistConfig:config=>saveConfig(configPath,config),reloadConfig:()=>loadConfig(configPath)});
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  await cycle();
 }catch(e){await shutdown();throw e;}
}
async function main(){
 const command=process.argv[2];
 if(!command||command==='--help'){console.log('Caffeinate: ensure | monitor | controls | popup | stop\nLaunch actions through Herdr so socket and plugin context are available.');return;}
 if(!['ensure','monitor','controls','popup','stop'].includes(command))throw new Error('Unknown command');
 const context=await resolveContext();
 if(command==='monitor')return runMonitor(context);
 if(command==='stop'){await runtimeRequest(context,{type:'command',command:{type:'stop-monitor'}});console.log('Monitor stopping');return;}
 const client=await ensureMonitor(context);
 if(command==='ensure'){console.log('Caffeination monitor ready');return;}
 if(command==='popup'){
  const {runPopup}=await import('./popup.mjs');await runPopup({client,input:process.stdin,output:process.stdout,target:process.env.CAFFEINATE_TARGET});return;
 }
 const {openControls}=await import('./popup.mjs');await openControls(context,process.env);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
