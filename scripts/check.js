import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for(const folder of ['server','scripts','public','tests'])for(const file of readdirSync(folder).filter(x=>x.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',`${folder}/${file}`],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log('All JavaScript syntax checks passed.');
