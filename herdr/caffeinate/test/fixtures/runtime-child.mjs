import {serveRuntime} from '../../src/runtime.mjs';
try {const s=await serveRuntime({runtimeDir:process.argv[2]},async()=>({snapshot:{pid:process.pid,agents:[]}}));process.on('SIGTERM',async()=>{await s.close();process.exit(0);});}catch{process.exit(1);}
