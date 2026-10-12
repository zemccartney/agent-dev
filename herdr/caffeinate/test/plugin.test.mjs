import test from 'node:test';import assert from 'node:assert/strict';
import {openControls} from '../src/popup.mjs';import {createMonitor} from '../src/monitor.mjs';
test('controls action pins invocation target instead of later focused pane',async()=>{
 const calls=[];await openControls({socketPath:'local'},{HERDR_PLUGIN_CONTEXT_JSON:JSON.stringify({focused_pane_id:'w1:p2',workspace_id:'w1'}),HERDR_PANE_ID:'w1:p9'},async(...a)=>{calls.push(a);return {type:'ok'};});
 assert.deepEqual(calls[0],['local','plugin.pane.open',{plugin_id:'agent-dev.caffeinate',entrypoint:'controls',placement:'popup',env:{CAFFEINATE_TARGET:'w1:p2'}}]);
 await assert.rejects(openControls({socketPath:'local'},{HERDR_PLUGIN_CONTEXT_JSON:'bad'},async()=>{}),/context/i);
});
test('only active assertions publish a cup; TTL refresh cannot renew lease',async()=>{
 let now=100000,phase='idle',power='ac';const tokens=[];
 const m=createMonitor({now:()=>now,config:{automatic:true,defaultDurationMs:28800000},readPower:async()=>power,herdr:{hostStatus:async()=>({instance:'s',local:true,pluginEnabled:true}),list:async()=>[{target:'pane',occupant:'a'}],observe:async()=>({occupant:'a',phase,evidence:'positive'}),publishToken:async(...args)=>tokens.push(args),close(){}},assertions:{reconcile:async d=>d,close:async()=>{}}});
 await m.refresh();assert.deepEqual(tokens.at(-1),['pane',null,6000]);phase='working';await m.refresh();now+=10000;await m.tick();assert.deepEqual(tokens.at(-1),['pane','☕',6000]);const deadline=m.snapshot().agents[0].state.lease.deadlineAt;
 const n=tokens.length;now+=1000;await m.tick();assert.equal(tokens.length,n);now+=1000;await m.tick();assert.equal(tokens.length,n+1);assert.equal(m.snapshot().agents[0].state.lease.deadlineAt,deadline);
 power='battery';await m.tick();assert.deepEqual(tokens.at(-1),['pane',null,6000]);await m.close();
});
