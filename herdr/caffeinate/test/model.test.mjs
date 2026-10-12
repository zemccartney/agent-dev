import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduce,validateDuration,DEFAULT_CONFIG} from '../src/model.mjs';
const t=1_800_000_000_000, cfg={automatic:true,defaultDurationMs:28_800_000};
const event=(phase,evidence='positive',occupant='one')=>({type:'observe',observation:{occupant,phase,evidence}});
const step=(s,e,at=t,c=cfg)=>reduce(s,e,at,c);
const start=()=>step(step(initialState('one'),event('idle')),event('working'));
const live=()=>step(start(),{type:'tick'},t+10_000);

test('ten seconds suppress short replies and anchor deadline to original start',()=>{
 assert.deepEqual(DEFAULT_CONFIG,cfg);let s=start();assert.equal(s.runId,1);
 s=step(s,{type:'tick'},t+9999);assert.equal(s.lease,null);
 s=step(s,{type:'tick'},t+10000);assert.equal(s.lease.deadlineAt,t+28_800_000);
 assert.equal(step(start(),event('idle'),t+9000).pending,null);
});
test('cold discovery never invents a lease, even after uncertain/working repeats',()=>{
 let s=step(initialState('one'),event('working')); s=step(s,event('unknown','uncertain'));s=step(s,event('working'));
 assert.equal(step(s,{type:'tick'},t+100_000).lease,null);
});
test('uncertainty during delay defers grant without restarting deadline',()=>{
 let s=step(start(),event('unknown','uncertain'),t+5000);
 s=step(s,{type:'tick'},t+20000);assert.equal(s.lease,null);
 s=step(s,event('working'),t+21000);assert.equal(s.lease.deadlineAt,t+28_800_000);
});
test('commentary-equivalent repeats and uncertainty preserve run and deadline',()=>{
 let s=live(),rev=s.revision;s=step(s,event('working'),t+60000);assert.equal(s.revision,rev);
 s=step(s,event('idle','uncertain'),t+90000);assert.equal(s.lease.deadlineAt,t+28_800_000);assert.equal(s.runId,1);
});
for(const phase of ['idle','blocked','gone'])test(`confirmed ${phase} ends lease and next work has fresh generation`,()=>{
 let s=step(live(),event(phase,'authoritative'),t+60000);assert.equal(s.lease,null);assert.equal(s.pending,null);
 if(phase!=='gone'){s=step(s,event('working'),t+70000);s=step(s,{type:'tick'},t+80000);assert.equal(s.runId,2);assert.equal(s.lease.deadlineAt,t+70_000+28_800_000);}
});
test('expiration cannot renew or resurrect after backward clock jump',()=>{
 let s=step(live(),{type:'tick'},t+28_800_000);assert.equal(s.lease,null);assert.equal(s.suppressed,true);
 for(const at of [t+28_800_001,t+1]){s=step(s,event('working'),at);assert.equal(s.lease,null);}
});
test('manual extension and shortening are immediate, release suppresses until manual or boundary',()=>{
 let s=step(start(),{type:'manual',durationMs:7_200_000},t+1);assert.equal(s.lease.deadlineAt,t+1+7_200_000);assert.equal(s.pending,null);
 s=step(s,{type:'manual',durationMs:1000},t+2);assert.equal(s.lease.deadlineAt,t+1002);
 s=step(s,{type:'release'},t+3);s=step(s,event('working'),t+4);assert.equal(s.lease,null);
 s=step(s,{type:'manual',durationMs:36_000_000},t+5);assert.equal(s.lease.deadlineAt,t+36_000_005);
});
for(const phase of ['idle','blocked'])test(`manual ${phase} arms one next run without immediate caffeine`,()=>{
 let s=step(initialState('one'),event(phase));s=step(s,{type:'manual',durationMs:7200000});assert.equal(s.lease,null);assert.equal(s.armedDurationMs,7200000);
 s=step(s,event('working'),t+100000,{...cfg,automatic:false});assert.equal(s.armedDurationMs,null);assert.equal(s.lease.deadlineAt,t+7_300_000);
 s=step(s,event('idle'));s=step(s,event('working'),t+200000,{...cfg,automatic:false});assert.equal(s.pending,null);
});
test('cancel arm and occupant replacement discard intent; stale revisions can be detected',()=>{
 let s=step(initialState('one'),event('idle'));s=step(s,{type:'manual',durationMs:1000});const rev=s.revision;
 s=step(s,{type:'cancel-arm'});assert.equal(s.armedDurationMs,null);assert.ok(s.revision>rev);
 s=step(live(),event('working','positive','two'));assert.equal(s.lease,null);assert.equal(s.runId,0);assert.equal(s.occupant,'two');
});
test('settings changes affect future runs only and agents are independent',()=>{
 let s=start();s=step(s,{type:'tick'},t+10000,{automatic:false,defaultDurationMs:1000});assert.equal(s.lease.deadlineAt,t+28_800_000);
 const other=step(initialState('other'),event('working','positive','other'));assert.equal(other.lease,null);assert.equal(s.lease.deadlineAt,t+28_800_000);
});
test('invalid and submillisecond durations cannot create overflow or zero leases',()=>{
 for(const value of [0,-1,NaN,Infinity,0.1,9e15])assert.throws(()=>validateDuration(value,t),RangeError);
 assert.doesNotThrow(()=>validateDuration(1,t));assert.doesNotThrow(()=>validateDuration(1500.5,t));
});
