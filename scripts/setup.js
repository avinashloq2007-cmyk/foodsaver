import { Database } from '../server/db.js';
import { schema } from '../server/schema.js';
const db=new Database();
try {const [existing]=await db.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'");if(existing.total)throw new Error('Database already initialized. Use a migration for existing installations.');await db.schema(schema);console.log('FoodSaver MySQL schema created.');}finally{await db.close();}
