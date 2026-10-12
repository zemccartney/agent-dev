import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

if (!process.argv.includes('--allow-system-assertion')) {
  console.error('Refusing OS assertions; pass --allow-system-assertion to run bounded macOS probes.');
  process.exitCode = 2;
} else if (process.platform !== 'darwin') {
  console.error('macOS only'); process.exitCode = 2;
} else {
  for (const mode of ['timeout','owner-term','owner-kill','child-term']) {
    const owner = spawn(process.execPath, ['-e','setTimeout(()=>{},14000)'], {stdio:'ignore'});
    const child = spawn('/usr/bin/caffeinate', ['-i','-w',String(owner.pid),'-t',mode==='timeout'?'2':'12'], {stdio:'ignore'});
    const exited = new Promise(resolve => child.once('exit', resolve));
    const safety = setTimeout(() => {child.kill('SIGKILL'); owner.kill('SIGKILL');}, 15000);
    try {
      await delay(350);
      assert.equal(child.exitCode,null, 'assertion child must start alive');
      const before = execFileSync('/usr/bin/pmset',['-g','assertions'],{encoding:'utf8'});
      assert.match(before, new RegExp(`pid ${child.pid}\\(caffeinate\\)`));
      if (mode==='owner-term') owner.kill('SIGTERM');
      if (mode==='owner-kill') owner.kill('SIGKILL');
      if (mode==='child-term') child.kill('SIGTERM');
      await Promise.race([exited,delay(4000).then(()=>{throw new Error(`${mode}: child did not exit`);})]);
      assert.doesNotMatch(execFileSync('/usr/bin/pmset',['-g','assertions'],{encoding:'utf8'}), new RegExp(`pid ${child.pid}\\(caffeinate\\)`));
      console.log(`PASS ${mode}: finite timeout/owner cleanup; assertion absent after exit`);
    } finally {clearTimeout(safety);child.kill('SIGKILL');owner.kill('SIGKILL');}
  }
}
