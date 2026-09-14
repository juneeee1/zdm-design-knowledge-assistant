import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { get } from '@vercel/blob';
import { root } from './knowledge.mjs';

if (process.argv.includes('--cloud')) {
  const envFile=path.join(root,'.env.vercel.local');
  if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  const record=await get('zdm-mvp/state-v1.json',{access:'private',useCache:false});
  console.log(JSON.stringify(record?(await new Response(record.stream).json()).feedback:[],null,2));
} else {
  const file=path.resolve(root,process.env.DATA_DIR||'.runtime','assistant.sqlite');
  if(!fs.existsSync(file)){console.log('[]');process.exit(0);}
  const db=new DatabaseSync(file,{readOnly:true});
  console.log(JSON.stringify(db.prepare('SELECT * FROM feedback ORDER BY created DESC').all(),null,2));db.close();
}
