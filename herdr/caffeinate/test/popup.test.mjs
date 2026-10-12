import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough} from 'node:stream';
import {runPopup} from '../src/popup.mjs';import {initialState} from '../src/model.mjs';
const wait=()=>new Promise(r=>setTimeout(r,10));
async function setup(phase='working',fail=false,state={}){
 const input=new PassThrough(),output=new PassThrough();input.isTTY=true;output.isTTY=true;output.columns=80;input.isRaw=false;input.setRawMode=v=>{input.isRaw=v;};let text='';output.on('data',d=>text+=d);const commands=[];
 const snap={now:1800000000000,power:'ac',config:{automatic:true,defaultDurationMs:28800000},agents:[{target:'w1:p1',state:{...initialState('a'),phase,revision:1,...state},active:false,error:null}]};
 const client={request:async m=>{if(m.type==='command'){commands.push(m.command);if(fail)throw Error('Agent changed\x1b[2J');}return {snapshot:structuredClone(snap)};},close(){}};
 const done=runPopup({client,input,output,target:'w1:p1'});await wait();return {input,output,commands,done,text:()=>text,snap,key:async(name,sequence='')=>{input.emit('keypress',sequence,{name,sequence});await wait();}};
}
test('duration entry and Enter submit guarded fractional hours; Escape restores terminal',async()=>{
 const f=await setup();await f.key('0','0');await f.key('.','.');await f.key('5','5');await f.key('return','\r');assert.equal(f.commands[0].durationMs,1800000);assert.equal(f.commands[0].revision,1);
 f.output.columns=35;f.output.emit('resize');await f.key('escape','\x1b');await f.done;assert.equal(f.input.isRaw,false);assert.match(f.text(),/Set from now/);
});
test('idle controls arm next run and settings/help stay available',async()=>{
 const f=await setup('idle');assert.match(f.text(),/Set next run/);await f.key('s','s');assert.match(f.text(),/Automatic/);await f.key('space',' ');await f.key('tab','\t');await f.key('1','1');await f.key('2','2');await f.key('return','\r');assert.equal(f.commands[0].type,'set-config');assert.equal(f.commands[0].config.automatic,false);assert.equal(f.commands[0].config.defaultDurationMs,43200000);
 await f.key('escape','\x1b');await f.key('?','?');assert.match(f.text(),/ten seconds/);await f.key('escape','\x1b');await f.key('escape','\x1b');await f.done;
});
test('invalid duration is rejected, stale command error is visible and sanitized',async()=>{
 const f=await setup('working',true);await f.key('0','0');await f.key('return','\r');assert.equal(f.commands.length,0);assert.match(f.text(),/positive/);
 await f.key('backspace','\x7f');await f.key('1','1');await f.key('return','\r');assert.match(f.text(),/Agent changed/);await f.key('escape','\x1b');await f.done;
});
test('secondary controls release a run or cancel next-run arming without cancellation commands',async()=>{
 for(const [phase,state,type] of [['working',{lease:{deadlineAt:1800000020000,origin:'manual'}},'release'],['idle',{armedDurationMs:3600000},'cancel-arm']]){const f=await setup(phase,false,state);await f.key('tab','\t');await f.key('tab','\t');await f.key('return','\r');assert.equal(f.commands[0].type,type);assert.equal(f.commands[0].occupant,'a');await f.key('escape','\x1b');await f.done;}
});
test('non-TTY popup refuses without mutating terminal',async()=>{await assert.rejects(runPopup({client:{},input:new PassThrough(),output:new PassThrough()}),/terminal/i);});
