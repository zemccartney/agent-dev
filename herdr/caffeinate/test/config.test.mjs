import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadConfig,saveConfig} from '../src/config.mjs';
test('global config persists only validated preferences atomically',async t=>{
 const d=await mkdtemp(join(tmpdir(),'cf-'));t.after(()=>rm(d,{recursive:true,force:true}));const path=join(d,'settings.json');
 assert.deepEqual(await loadConfig(path),{automatic:true,defaultDurationMs:28800000});
 await saveConfig(path,{automatic:false,defaultDurationMs:1000,leases:['never persist']});assert.deepEqual(JSON.parse(await readFile(path)),{automatic:false,defaultDurationMs:1000});
 assert.deepEqual(await loadConfig(path),{automatic:false,defaultDurationMs:1000});
 await assert.rejects(saveConfig(path,{automatic:'yes',defaultDurationMs:1000}),/automatic/);
 await writeFile(path,'{"automatic":false,"defaultDurationMs":0}');await assert.rejects(loadConfig(path),/duration/i);
});
