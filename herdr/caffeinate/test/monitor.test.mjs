import test from 'node:test';import assert from 'node:assert/strict';
import {createMonitor} from '../src/monitor.mjs';
function setup(){let time=1_800_000_000_000,power='ac',host={instance:'host',pluginEnabled:true,local:true},fail=false,active=new Map(),config={automatic:true,defaultDurationMs:28800000};
 const phases=new Map([['a',{phase:'idle',evidence:'authoritative'}],['b',{phase:'idle',evidence:'positive'}]]),tokens=[];
 const herdr={hostStatus:async()=>host,list:async()=>{if(fail)throw Error('disconnected');return [...phases.keys()].map(occupant=>({occupant,target:occupant}));},observe:async target=>({occupant:target,...phases.get(target)}),publishToken:async(...a)=>tokens.push(a),close(){}};
 const assertions={reconcile:async desired=>{active=new Map(desired);return new Map([...desired].map(([id,deadlineAt])=>[id,{deadlineAt,pid:42}]));},close:async()=>{active.clear();}};
 const m=createMonitor({herdr,assertions,readPower:async()=>power,now:()=>time,config,persistConfig:async next=>{config=next;}});
 return {m,phases,tokens,active:()=>active,advance:n=>time+=n,setPower:p=>power=p,setHost:h=>host=h,setFail:f=>fail=f,now:()=>time,command:(type='set-duration',durationMs=7200000)=>{const s=m.snapshot().agents[0].state;return {type,occupant:s.occupant,runId:s.runId,revision:s.revision,durationMs};}};
}
async function start(f){await f.m.refresh();for(const p of f.phases.values())p.phase='working';await f.m.refresh();f.advance(10000);await f.m.tick();}
test('independent runs, power suspension and expiry preserve original deadlines',async()=>{
 const f=setup();await start(f);assert.equal(f.active().size,2);const deadline=f.m.snapshot().agents[0].state.lease.deadlineAt;
 f.setPower('battery');await f.m.tick();assert.equal(f.active().size,0);assert.equal(f.m.snapshot().agents[0].state.lease.deadlineAt,deadline);
 f.setPower('ac');await f.m.tick();assert.equal(f.active().size,2);f.phases.get('a').phase='idle';await f.m.refresh();assert.equal(f.active().size,1);
 f.advance(28800000);await f.m.tick();assert.equal(f.active().size,0);f.setPower('ac');await f.m.refresh();assert.equal(f.active().size,0);await f.m.close();
});
test('cold discovery, failed evidence, event gaps and restart do not invent fresh time',async()=>{
 const f=setup();for(const p of f.phases.values())p.phase='working';await f.m.refresh();f.advance(20000);await f.m.tick();assert.equal(f.active().size,0);
 await f.m.command(f.command());const deadline=f.m.snapshot().agents[0].state.lease.deadlineAt;
 f.setFail(true);await f.m.refresh();assert.equal(f.active().size,1);f.advance(30000);f.setFail(false);await f.m.refresh();assert.equal(f.m.snapshot().agents[0].state.lease.deadlineAt,deadline);
 await f.m.close();const g=setup();for(const p of g.phases.values())p.phase='working';await g.m.refresh();assert.equal(g.active().size,0);await g.m.close();
});
test('stale popup actions cannot arm a run after it finishes or a replacement occupant',async()=>{
 const f=setup();await start(f);const old=f.command();f.phases.get('a').phase='idle';await f.m.refresh();await assert.rejects(f.m.command(old),/changed|stale/i);assert.equal(f.m.snapshot().agents[0].state.armedDurationMs,null);
 f.phases.delete('a');f.phases.set('new',{phase:'working',evidence:'positive'});await f.m.refresh();await assert.rejects(f.m.command(old),/changed|stale/i);assert.equal(f.m.snapshot().agents.find(a=>a.state.occupant==='new').state.lease,null);await f.m.close();
});
test('server replacement and plugin disable release all owned assertions',async()=>{
 for(const host of [{instance:'new',local:true,pluginEnabled:true},{instance:'host',local:true,pluginEnabled:false}]){const f=setup();await start(f);f.setHost(host);await f.m.refresh();assert.equal(f.active().size,0);assert.equal(f.m.snapshot().stopped,true);}
});
test('confirmed server disappearance releases assertions, unlike a transient read failure',async()=>{
 let gone=false,closed=false;
 const m=createMonitor({herdr:{hostStatus:async()=>{if(gone)throw Object.assign(Error('server gone'),{code:'HOST_GONE'});return {instance:'s',local:true,pluginEnabled:true};},list:async()=>[],publishToken:async()=>{},close(){}},assertions:{reconcile:async()=>new Map(),close:async()=>{closed=true;}},readPower:async()=> 'ac'});
 await m.refresh();gone=true;await m.refresh();assert.equal(closed,true);assert.equal(m.snapshot().stopped,true);await m.close();
});
test('failed save does not acknowledge or alter config; assertion failure never shows active',async()=>{
 const m=createMonitor({herdr:{hostStatus:async()=>({local:true,instance:'s',pluginEnabled:true}),list:async()=>[{target:'a',occupant:'a'}],observe:async()=>({occupant:'a',phase:'working',evidence:'positive'}),publishToken:async()=>{},close(){}},assertions:{reconcile:async()=>new Map(),close:async()=>{}},readPower:async()=> 'ac',now:()=>100000,config:{automatic:true,defaultDurationMs:28800000},persistConfig:async()=>{throw Error('disk full');}});
 await m.refresh();const s=m.snapshot().agents[0].state;await m.command({type:'set-duration',occupant:'a',runId:s.runId,revision:s.revision,durationMs:20000});assert.equal(m.snapshot().agents[0].active,false);assert.match(m.snapshot().agents[0].error,/assertion/i);
 await assert.rejects(m.command({type:'set-config',config:{automatic:false,defaultDurationMs:1000}}),/disk full/);assert.equal(m.snapshot().config.automatic,true);await m.close();
});
test('concurrent refresh requests serialize and reread after in-flight invalidation',async()=>{
 let reads=0,concurrent=0,max=0;const f=setup();const m=createMonitor({herdr:{hostStatus:async()=>({local:true,instance:'s',pluginEnabled:true}),list:async()=>{reads++;max=Math.max(max,++concurrent);await new Promise(r=>setTimeout(r,5));concurrent--;return [];},publishToken:async()=>{},close(){}},assertions:{reconcile:async()=>new Map(),close:async()=>{}},readPower:async()=> 'ac',now:Date.now,config:{automatic:true,defaultDurationMs:28800000}});
 await Promise.all([m.refresh(),m.refresh()]);assert.equal(max,1);assert.equal(reads,2);await m.close();await f.m.close();
});
