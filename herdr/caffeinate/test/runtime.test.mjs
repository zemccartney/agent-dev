import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {serveRuntime,runtimeRequest,ensureMonitor} from '../src/runtime.mjs';
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
test('simultaneous ensure launches one detached child and client close does not kill it',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ce-'));const context={runtimeDir:join(dir,'run')};const children=[];
 t.after(async()=>{for(const c of children)c.kill('SIGTERM');await new Promise(r=>setTimeout(r,50));await rm(dir,{recursive:true,force:true});});
 const launch=()=>{const c=spawn(process.execPath,[fixture,context.runtimeDir],{stdio:'ignore'});children.push(c);return c;};
 const [a,b]=await Promise.all([ensureMonitor(context,{launch}),ensureMonitor(context,{launch})]);const pa=await a.request({type:'snapshot'}),pb=await b.request({type:'snapshot'});assert.equal(pa.snapshot.pid,pb.snapshot.pid);a.close();assert.equal((await b.request({type:'snapshot'})).snapshot.pid,pa.snapshot.pid);b.close();
});
