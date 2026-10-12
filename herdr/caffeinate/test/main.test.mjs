import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('CLI help is usable without Herdr and invalid command cannot launch a monitor',()=>{
 const help=spawnSync(process.execPath,['src/main.mjs','--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/ensure.*monitor.*controls.*popup.*stop/s);
 const bad=spawnSync(process.execPath,['src/main.mjs','unknown'],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/Unknown command/);
});
