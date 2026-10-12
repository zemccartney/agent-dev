import {execFile as exec} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(exec);
export function parsePower(text){
 const source=String(text).match(/^Now drawing from '(AC Power|Battery Power)'\s*$/m)?.[1];
 return source==='AC Power'?'ac':source==='Battery Power'?'battery':'unknown';
}
export async function readPower({execFile=run}={}){
 try{return parsePower((await execFile('/usr/bin/pmset',['-g','batt'],{timeout:1500,maxBuffer:65536})).stdout);}catch{return 'unknown';}
}
