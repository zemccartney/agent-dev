import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyAgent,occupantKey,request,connectHerdr} from '../src/herdr.mjs';
const f=JSON.parse(await readFile(new URL('fixtures/herdr-evidence.json',import.meta.url)));
const claude={...f.pi.agent,agent:'claude',agent_session:{source:'herdr:claude',value:'abc',kind:'id'},screen_detection_skipped:false};
test('fallback/conflict/skipped/failed evidence never ends a run',()=>{
 for(const e of [f.fallback,null,{...f.claude.idle,skip_state_update:true},{...f.claude.working}]){
  assert.equal(classifyAgent({...claude,agent_status:'idle'},e).evidence,'uncertain');
 }
});
test('positive Claude evidence and authoritative Pi produce semantic observations',()=>{
 for(const phase of ['idle','working','blocked'])assert.deepEqual(classifyAgent({...claude,agent_status:phase},f.claude[phase]).phase,phase);
 assert.equal(classifyAgent(f.pi.agent,f.pi.explain).evidence,'authoritative');
 assert.equal(classifyAgent({...f.pi.agent,screen_detection_skipped:false},f.fallback).evidence,'uncertain');
 assert.equal(classifyAgent({...claude,agent_status:'done'},f.claude.idle).phase,'idle');
});
test('occupant identity ignores status revisions but includes terminal/session/process',()=>{
 const a=occupantKey('server',claude,'pid-start');
 assert.equal(occupantKey('server',{...claude,state_change_seq:999},'pid-start'),a);
 for(const x of [{...claude,terminal_id:'other'},{...claude,agent_session:{value:'other'}}])assert.notEqual(occupantKey('server',x,'pid-start'),a);
 assert.notEqual(occupantKey('server',claude,'new-process'),a);
});
async function server(t,handler){
 const dir=await mkdtemp(join(tmpdir(),'cf-'));const path=join(dir,'s');const sockets=new Set();
 const s=net.createServer(c=>{sockets.add(c);c.on('close',()=>sockets.delete(c));let b='';c.on('data',d=>{b+=d;let i;while((i=b.indexOf('\n'))>=0){const line=b.slice(0,i);b=b.slice(i+1);handler(JSON.parse(line),c);}});});
 await new Promise(r=>s.listen(path,r));t.after(async()=>{for(const c of sockets)c.destroy();await new Promise(r=>s.close(r));await rm(dir,{recursive:true,force:true});});return path;
}
test('request frames partial lines and rejects errors/timeouts/oversized responses',async t=>{
 const path=await server(t,(q,c)=>{if(q.method==='hang')return;if(q.method==='big'){c.write('x'.repeat(1024*1024+1));return;}const line=JSON.stringify(q.method==='bad'?{id:q.id,error:{code:'bad',message:'bad request'}}:{id:q.id,result:{ok:true}})+'\n';c.write(line.slice(0,6));setTimeout(()=>c.write(line.slice(6)),2);});
 assert.deepEqual(await request(path,'ok',{}),{ok:true});
 await assert.rejects(request(path,'bad',{}),/bad request/);await assert.rejects(request(path,'hang',{},30),/timed out/);await assert.rejects(request(path,'big',{}),/large/);
});
test('client filters unsupported/locality and invalidates rather than replaying events',async t=>{
 let subscription, invalidations=0;
 const agent={...f.pi.agent};
 const path=await server(t,(q,c)=>{
  let result={};
  if(q.method==='events.subscribe'){subscription=c;result={type:'subscription_started'};}
  if(q.method==='session.snapshot')result={snapshot:{agents:[agent,{...agent,agent:'codex',pane_id:'other'}]}};
  if(q.method==='agent.get')result={agent};
  if(q.method==='agent.explain')result={explain:f.pi.explain};
  if(q.method==='pane.process_info')result={process_info:{foreground_processes:[{pid:42,name:'pi'}]}};
  c.write(JSON.stringify({id:q.id,result})+'\n');
 });
 const client=await connectHerdr({socketPath:path,onInvalidate:()=>invalidations++,verifyHost:async()=>({instance:'s',local:true,pluginEnabled:true}),verifyProcess:async()=> '42:start'});
 t.after(()=>client.close());
 assert.equal((await client.list()).length,1);const obs=await client.observe('w2:p1');assert.equal(obs.evidence,'authoritative');
 subscription.write(JSON.stringify({event:{type:'pane.agent_status_changed',agent_status:'idle'}})+'\n');await new Promise(r=>setTimeout(r,10));assert.ok(invalidations>0);assert.equal((await client.observe('w2:p1')).phase,'working');
 subscription.write(JSON.stringify({error:{code:'events_lost',message:'lost'}})+'\n');await new Promise(r=>setTimeout(r,10));await client.list();assert.equal((await client.observe('w2:p1')).phase,'working');
});
