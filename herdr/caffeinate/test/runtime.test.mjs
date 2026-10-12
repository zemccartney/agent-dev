import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {serveRuntime,runtimeRequest,ensureMonitor} from '../src/runtime.mjs';
import net from 'node:net';
const fixture=fileURLToPath(new URL('fixtures/runtime-child.mjs',import.meta.url));
test('runtime owns private IPC, rejects bad messages, and does not kill stale/live PIDs',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cr-'));t.after(()=>rm(dir,{recursive:true,force:true}));const context={runtimeDir:join(dir,'run')};
 const s=await serveRuntime(context,async message=>{if(message.type!=='snapshot')throw Error('Invalid request');return {snapshot:{agents:[]}};});t.after(()=>s.close());
 assert.equal((await stat(context.runtimeDir)).mode&0o777,0o700);
 assert.deepEqual(await runtimeRequest(context,{type:'snapshot'}),{snapshot:{agents:[]}});
 await assert.rejects(runtimeRequest(context,{type:'unexpected'}),/Invalid/);await assert.rejects(runtimeRequest(context,{type:'snapshot',padding:'x'.repeat(70000)}),/large/);await assert.rejects(serveRuntime(context,async()=>{}),/already|lock/i);
 process.kill(process.pid,0);await s.close();
 await mkdir(context.runtimeDir,{recursive:true,mode:0o700});await writeFile(join(context.runtimeDir,'owner.json'),JSON.stringify({pid:process.pid}));
 await assert.rejects(serveRuntime(context,async()=>{}),/already|lock/i);process.kill(process.pid,0);
});
test('private IPC preserves UTF-8 split across incoming and outgoing chunks',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cu-'));const context={runtimeDir:join(dir,'run')};const server=await serveRuntime(context,async q=>({snapshot:{value:q.value}}));
 t.after(async()=>{await server.close();await rm(dir,{recursive:true,force:true});});
 const result=await new Promise((resolve,reject)=>{const c=net.createConnection(join(context.runtimeDir,'ipc.sock'));c.setEncoding('utf8');let output='';c.on('error',reject);c.on('connect',()=>{const b=Buffer.from(JSON.stringify({type:'snapshot',value:'café'})+'\n');const i=b.indexOf(Buffer.from('é'))+1;c.write(b.subarray(0,i));setTimeout(()=>c.write(b.subarray(i)),5);});c.on('data',d=>output+=d);c.on('end',()=>resolve(JSON.parse(output)));});
 assert.equal(result.result.snapshot.value,'café');
 await server.close();await mkdir(context.runtimeDir,{mode:0o700});
 const raw=net.createServer(c=>{c.once('data',()=>{const b=Buffer.from(JSON.stringify({result:{snapshot:{value:'☕'}}})+'\n');const i=b.indexOf(Buffer.from('☕'))+1;c.write(b.subarray(0,i));setTimeout(()=>c.end(b.subarray(i)),5);});});
 await new Promise(r=>raw.listen(join(context.runtimeDir,'ipc.sock'),r));t.after(()=>new Promise(r=>raw.close(r)));
 assert.equal((await runtimeRequest(context,{type:'snapshot'})).snapshot.value,'☕');
});
test('simultaneous ensure launches one detached child and client close does not kill it',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ce-'));const context={runtimeDir:join(dir,'run')};const children=[];
 t.after(async()=>{for(const c of children)c.kill('SIGTERM');await new Promise(r=>setTimeout(r,50));await rm(dir,{recursive:true,force:true});});
 const launch=()=>{const c=spawn(process.execPath,[fixture,context.runtimeDir],{stdio:'ignore'});children.push(c);return c;};
 const [a,b]=await Promise.all([ensureMonitor(context,{launch}),ensureMonitor(context,{launch})]);const pa=await a.request({type:'snapshot'}),pb=await b.request({type:'snapshot'});assert.equal(pa.snapshot.pid,pb.snapshot.pid);a.close();assert.equal((await b.request({type:'snapshot'})).snapshot.pid,pa.snapshot.pid);b.close();
});
