import { Database } from './db.js';
import { createApp } from './app.js';
import { schema } from './schema.js';
import { seed } from './seed.js';
import { config } from './config.js';
import { expireFood } from './services.js';
const db=new Database();
if(config.demo){await db.schema(schema.replace(/CREATE INDEX /g,'CREATE INDEX IF NOT EXISTS '));if(process.env.SEED_DEMO==='true')await seed(db);}
await db.query('SELECT 1 AS healthy');await expireFood(db);
const runtime=createApp(db);
runtime.server.listen(config.port,config.host,()=>console.log(`Aravuun ${config.demo?'LOCAL DEMO':'MySQL'} ready at ${config.origin}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await runtime.stop();process.exit(0);});
