import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {DEFAULT_CONFIG,validateDuration} from './model.mjs';
export function validateConfig(value){
 if(typeof value?.automatic!=='boolean')throw new Error('automatic must be true or false');
 validateDuration(value.defaultDurationMs,Date.now());
 return {automatic:value.automatic,defaultDurationMs:Math.floor(value.defaultDurationMs)};
}
export async function loadConfig(path){try{return validateConfig(JSON.parse(await readFile(path,'utf8')));}catch(e){if(e.code==='ENOENT')return {...DEFAULT_CONFIG};throw e;}}
export async function saveConfig(path,value){
 const config=validateConfig(value);await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';
 try{await writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}
}
