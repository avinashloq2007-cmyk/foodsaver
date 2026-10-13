import { Database } from '../server/db.js';
import { phone } from '../server/auth.js';
const number=phone(process.argv[2]),db=new Database();
try{
  const [user]=await db.query('SELECT * FROM users WHERE phone_number=?',[number]);
  if(!user||user.firebase_uid.startsWith('demo:'))throw new Error('First register this account with real Firebase phone verification.');
  await db.query("UPDATE users SET role='admin' WHERE user_id=?",[user.user_id]);
  await db.query('DELETE FROM sessions WHERE user_id=?',[user.user_id]);
  console.log('Administrator role assigned. Sign in through /#/admin-login with phone OTP and the configured authenticator.');
}finally{await db.close();}
