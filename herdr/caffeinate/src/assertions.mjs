import {spawn as spawnChild} from 'node:child_process';

/** Each native assertion has BOTH an owner lifetime and finite timeout. */
export function createAssertions({spawn=spawnChild,ownerPid=process.pid,now=Date.now,onExit=()=>{}}={}){
 if(!Number.isSafeInteger(ownerPid)||ownerPid<1)throw new Error('Invalid assertion owner');
 const entries=new Map();let closed=false;
 async function stop(key){
  const e=entries.get(key);if(!e)return;entries.delete(key);e.stopping=true;
  if(e.dead)return;
  await new Promise(resolve=>{
   let timer;const done=()=>{clearTimeout(timer);resolve();};e.child.once('exit',done);
   timer=setTimeout(()=>{e.child.kill('SIGKILL');done();},500);e.child.kill('SIGTERM');
  });
 }
 return {
  async reconcile(desired){
   if(closed)return new Map();
   for(const [key,e] of entries){if(desired.get(key)!==e.deadlineAt||e.deadlineAt<=now())await stop(key);}
   for(const [key,deadlineAt] of desired){
    if(entries.has(key))continue;
    const seconds=Math.floor((deadlineAt-now())/1000);
    if(!Number.isSafeInteger(deadlineAt)||!Number.isSafeInteger(seconds)||seconds<1||!Number.isFinite(new Date(deadlineAt).getTime()))continue;
    // caffeinate parses seconds as a signed int on macOS. Chunk only the native
    // assertion, never the lease: reacquisition still uses the original deadline.
    const timeout=Math.min(seconds,2147483647);
    try{
     const child=spawn('/usr/bin/caffeinate',['-i','-w',String(ownerPid),'-t',String(timeout)],{stdio:'ignore'});
     const e={child,deadlineAt,dead:false,stopping:false};
     child.on('error',error=>{e.dead=true;if(entries.get(key)===e)entries.delete(key);onExit(key,error);});
     child.once('exit',(code,signal)=>{e.dead=true;if(entries.get(key)===e)entries.delete(key);if(!e.stopping)onExit(key,code===0?null:new Error(`caffeinate exited (${code??signal})`));});
     await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
     if(!e.dead)entries.set(key,e);
    }catch(error){onExit(key,error);}
   }
   return new Map([...entries].filter(([,e])=>!e.dead).map(([key,e])=>[key,{deadlineAt:e.deadlineAt,pid:e.child.pid}]));
  },
  async close(){closed=true;await Promise.all([...entries.keys()].map(stop));},
 };
}
