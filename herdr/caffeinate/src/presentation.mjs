import {stripVTControlCharacters} from 'node:util';
export const safeText=value=>stripVTControlCharacters(String(value??'')).replace(/[\x00-\x1f\x7f-\x9f]/g,'');
export function formatLocalDeadline(epochMs){
 const d=new Date(epochMs);if(!Number.isFinite(d.getTime()))throw new Error('Invalid deadline date');
 const p=(n,w=2)=>String(n).padStart(w,'0');const offset=-d.getTimezoneOffset();const year=d.getFullYear();
 const y=year>=0&&year<=9999?p(year,4):`${year<0?'-':'+'}${p(Math.abs(year),6)}`;
 return `${y}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(),3)}${offset<0?'-':'+'}${p(Math.floor(Math.abs(offset)/60))}:${p(Math.abs(offset)%60)}`;
}
export function presentAgent(row,power){
 const s=row.state,waiting=s.phase==='idle'||s.phase==='blocked';
 const headline=row.active&&s.lease?formatLocalDeadline(s.lease.deadlineAt):s.armedDurationMs!==null?`Next run · ${s.armedDurationMs/3600000} hours`:s.lease&&power==='battery'?'Paused · on battery':s.lease&&power==='unknown'?'Paused · power unknown':'Not caffeinated';
 return {cup:row.active?'☕':'',headline,primaryLabel:waiting?'Set next run':'Set from now',secondaryLabel:s.armedDurationMs!==null?'Cancel next run':s.lease||s.pending?'Stop caffeinating':null};
}
