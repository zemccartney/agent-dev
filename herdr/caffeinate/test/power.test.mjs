import test from 'node:test';import assert from 'node:assert/strict';
import {parsePower,readPower} from '../src/power.mjs';
test('AC source, not charge percentage, determines eligibility',()=>{
 assert.equal(parsePower("Now drawing from 'AC Power'\n"),'ac');
 assert.equal(parsePower("Now drawing from 'AC Power'\nInternalBattery 100%; not charging"),'ac');
 assert.equal(parsePower("Now drawing from 'Battery Power'\n100%; discharging"),'battery');
 for(const value of ['', 'AC Power maybe',"Now drawing from 'UPS Power'"])assert.equal(parsePower(value),'unknown');
});
test('failed power query is unknown, never AC',async()=>{assert.equal(await readPower({execFile:async()=>{throw Error('unavailable');}}),'unknown');});
