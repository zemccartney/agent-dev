import net from 'node:net';
import {mkdir,writeFile,chmod,rm,lstat,open} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';import {localHost} from './herdr.mjs';
const main=fileURLToPath(new URL('main.mjs',import.meta.url));
export async function resolveContext(env=process.env){
 if(process.platform!=='darwin')throw new Error('Caffeination requires macOS');
 if(!env.HERDR_SOCKET_PATH||!env.HERDR_PLUGIN_CONFIG_DIR)throw new Error('Launch through Herdr plugin action/startup (missing plugin context)');
 const host=await localHost(env.HERDR_SOCKET_PATH);
 const root=join(tmpdir(),`caffeinate-${process.getuid()}`);
 const hash=createHash('sha256').update(host.instance).digest('hex').slice(0,16);
 return {socketPath:env.HERDR_SOCKET_PATH,configDir:env.HERDR_PLUGIN_CONFIG_DIR,binPath:env.HERDR_BIN_PATH??'herdr',runtimeDir:join(root,hash),instance:host.instance};
}
async function privateParent(dir){
 await mkdir(dir,{recursive:true,mode:0o700});const s=await lstat(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw new Error(`Unsafe runtime directory: ${dir}`);
}
export async function serveRuntime(context,handler){
 const dir=context.runtimeDir;await privateParent(dirname(dir));
 try{await mkdir(dir,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw new Error(`Monitor lock already exists: ${dir}. If the monitor crashed, inspect owner.json before removing this directory.`);throw e;}
 const socketPath=join(dir,'ipc.sock'),clients=new Set();let closed=false;
 const server=net.createServer(socket=>{
  socket.setEncoding('utf8');clients.add(socket);socket.on('close',()=>clients.delete(socket));socket.on('error',()=>{});socket.setTimeout(10000,()=>socket.destroy());let buffer='',handled=false;
  socket.on('data',async data=>{
   if(handled)return;buffer+=data;
   if(Buffer.byteLength(buffer)>65536){handled=true;socket.end(JSON.stringify({error:'IPC request too large'})+'\n');return;}
   const end=buffer.indexOf('\n');if(end<0)return;handled=true;
   try{const message=JSON.parse(buffer.slice(0,end));if(!message||!['snapshot','command'].includes(message.type))throw new Error('Invalid request');const result=await handler(message);if(!socket.destroyed)socket.end(JSON.stringify({result})+'\n');}
   catch(e){if(!socket.destroyed)socket.end(JSON.stringify({error:e.message})+'\n');}
  });
 });
 try{
  await writeFile(join(dir,'owner.json'),JSON.stringify({pid:process.pid,startedAt:Date.now(),socketPath:context.socketPath??null})+'\n',{mode:0o600,flag:'wx'});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await chmod(socketPath,0o600);
 }catch(e){await rm(dir,{recursive:true,force:true});throw e;}
 return {async close(){if(closed)return;closed=true;for(const s of clients)s.destroy();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}};
}
export function runtimeRequest(context,message,timeoutMs=10000){
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(join(context.runtimeDir,'ipc.sock'));socket.setEncoding('utf8');let done=false,buffer='';
  const timer=setTimeout(()=>finish(new Error('Monitor request timed out')),timeoutMs);
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(result);}
  socket.on('error',e=>finish(e));socket.on('end',()=>finish(new Error('Monitor connection ended')));
  socket.on('connect',()=>socket.write(JSON.stringify(message)+'\n'));
  socket.on('data',d=>{buffer+=d;if(Buffer.byteLength(buffer)>1048576)return finish(new Error('IPC response too large'));const end=buffer.indexOf('\n');if(end<0)return;try{const v=JSON.parse(buffer.slice(0,end));v.error?finish(new Error(v.error)):finish(null,v.result);}catch(e){finish(e);}});
 });
}
export async function ensureMonitor(context,{launch}={}){
 const client={request:message=>runtimeRequest(context,message),close(){}};
 try{await client.request({type:'snapshot'});return client;}catch{}
 if(launch)launch();
 else{
  await privateParent(dirname(context.runtimeDir));
  const log=await open(context.runtimeDir+'.log','a',0o600);
  try{const child=spawn(process.execPath,[main,'monitor'],{detached:true,stdio:['ignore',log.fd,log.fd],env:process.env});child.unref();child.on('error',()=>{});}finally{await log.close();}
 }
 for(let i=0;i<40;i++){await wait(100);try{await runtimeRequest(context,{type:'snapshot'},500);return client;}catch{}}
 throw new Error(`Monitor unavailable; see ${context.runtimeDir}.log. A stale lock at ${context.runtimeDir} requires manual recovery; no PID will be killed automatically.`);
}
