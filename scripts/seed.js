import { Database } from '../server/db.js';
import { seed } from '../server/seed.js';
if(process.env.SEED_DEMO!=='true'||process.env.NODE_ENV==='production')throw new Error('Seed only a separate development database with SEED_DEMO=true.');
const db=new Database();try{await seed(db);console.log('Demonstration data seeded. Never use demo phone identities for real accounts.');}finally{await db.close();}
