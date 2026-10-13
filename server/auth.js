import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from './config.js';
import { assert, id, text, coords } from './utils.js';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const otpHash=(challenge,code)=>createHmac('sha256',config.secret).update(`${challenge}:${code}`).digest('hex');
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function phone(value){assert(typeof value==='string'&&/^\+[1-9]\d{7,14}$/.test(value),400,'Use an international phone number, such as +919876543210.');return value;}
export function cookieToken(req){const c=(req.headers.cookie||'').split(';').map(x=>x.trim());return c.find(x=>x.startsWith('aravuun_session='))?.slice(16)||c.find(x=>x.startsWith('foodsaver_session='))?.slice(18);}
export async function loadSession(db,req){
  const token=cookieToken(req); if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const [row]=await db.query('SELECT s.*, u.full_name,u.phone_number,u.email,u.firebase_uid,u.latitude,u.longitude,u.role,u.account_status FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[digest(token),Date.now()]);
  return row?.account_status==='active'?row:null;
}
export const safeUser=u=>({user_id:u.user_id,full_name:u.full_name,phone_number:u.phone_number,email:u.email,latitude:u.latitude,longitude:u.longitude,role:u.role,account_status:u.account_status});
export function cookieOptions(admin=false){
  const isHttps=Boolean(config.production||process.env.RENDER||(config.origin&&config.origin.startsWith('https:'))||process.env.SECURE_COOKIES==='true');
  return {httpOnly:true,secure:isHttps,sameSite:isHttps?'none':'lax',maxAge:admin?3600000:86400000,path:'/'};
}
export async function createSession(db,res,user,admin=false){
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),now=Date.now();
  await db.query('INSERT INTO sessions (token_hash,user_id,csrf_token,admin_verified,expires_at,created_at) VALUES (?,?,?,?,?,?)',[digest(token),user.user_id,csrf,admin?1:0,now+(admin?3600000:86400000),now]);
  res.cookie('aravuun_session',token,cookieOptions(admin));
  res.cookie('foodsaver_session',token,cookieOptions(admin));
  return {user:safeUser(user),csrf};
}

export async function issueDemoOTP(db,number){
  assert(config.demo,404,'Demo authentication is disabled.'); phone(number);
  const now=Date.now();
  return db.transaction(async tx=>{
    const recent=await tx.query('SELECT created_at FROM otp_challenges WHERE phone_number=? AND created_at>? ORDER BY created_at DESC',[number,now-3600000]);
    assert(!recent[0]||now-recent[0].created_at>=60000,429,'Wait 60 seconds before resending.');
    assert(recent.length<5,429,'Hourly resend limit reached.');
    await tx.query('UPDATE otp_challenges SET expires_at=0 WHERE phone_number=?',[number]);
    const challenge=id(),code=String(randomInt(100000,1000000));
    await tx.query('INSERT INTO otp_challenges (challenge_id,phone_number,otp_hash,attempts,expires_at,created_at) VALUES (?,?,?,0,?,?)',[challenge,number,otpHash(challenge,code),now+300000,now]);
    return {challenge,code,expiresIn:300,demo:true};
  });
}
export async function verifyDemoOTP(db,challenge,code){
  assert(config.demo,404,'Demo authentication is disabled.');
  const result=await db.transaction(async tx=>{
    const [row]=await tx.query(db.lock('SELECT * FROM otp_challenges WHERE challenge_id=?'),[challenge]);
    if(!row||row.expires_at<=Date.now()||row.attempts>=5)return {error:'Code expired or too many attempts. Request a new code.'};
    const match=safeEqual(row.otp_hash,otpHash(challenge,String(code)));
    await tx.query('UPDATE otp_challenges SET attempts=attempts+1,expires_at=? WHERE challenge_id=?',[match?0:row.expires_at,challenge]);
    return match?{uid:`demo:${row.phone_number}`,phone_number:row.phone_number}:{error:'Incorrect verification code.'};
  });
  assert(!result.error,401,result.error);return result;
}
export async function verifyFirebase(token){
  assert(typeof token==='string'&&token.length<10000,400,'Firebase ID token is required.');
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  let decoded;
  try {decoded=await getAuth().verifyIdToken(token,true);}catch{assert(false,401,'Phone verification failed. Sign in again.');}
  assert(decoded.phone_number&&decoded.firebase?.sign_in_provider==='phone',401,'Verified phone authentication is required.');
  assert(Date.now()/1000-decoded.auth_time<300,401,'Phone verification is too old. Sign in again.');
  return {uid:decoded.uid,phone_number:phone(decoded.phone_number)};
}
export async function getOrCreateUser(db,identity,profile){
  return db.transaction(async tx=>{
    const [existing]=await tx.query('SELECT * FROM users WHERE firebase_uid=? OR phone_number=?',[identity.uid,identity.phone_number]);
    if(existing){assert(existing.account_status==='active',403,'This account is suspended.');assert(existing.firebase_uid===identity.uid,409,'This number belongs to another verified account. Contact support.');return existing;}
    const user={user_id:id(),full_name:text(profile.full_name,'Full name',2,100),phone_number:identity.phone_number,email:profile.email?text(profile.email,'Email',3,254):null,firebase_uid:identity.uid,role:'user',account_status:'active',latitude:null,longitude:null,created_at:Date.now()};
    assert(!user.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email),400,'Enter a valid email.');
    if(profile.latitude!==undefined&&profile.latitude!==null)Object.assign(user,coords(profile.latitude,profile.longitude));
    await tx.query('INSERT INTO users (user_id,full_name,phone_number,email,firebase_uid,latitude,longitude,role,account_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[user.user_id,user.full_name,user.phone_number,user.email,user.firebase_uid,user.latitude,user.longitude,user.role,user.account_status,user.created_at]);
    return user;
  });
}
// RFC 6238 (SHA-1 / 30 seconds / 6 digits). Replays are rejected in the DB.
export function totp(secret,step=Math.floor(Date.now()/30000)){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const ch of secret.toUpperCase().replace(/=+$/,'')){const n=alphabet.indexOf(ch);assert(n>=0,500,'Invalid admin TOTP configuration.');bits+=n.toString(2).padStart(5,'0');}
  const key=Buffer.from(bits.match(/.{8}/g)?.map(x=>parseInt(x,2))||[]);
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const mac=createHmac('sha1',key).update(counter).digest(),offset=mac[19]&15;
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export async function verifyAdmin(db,user,code){
  assert(user.role==='admin',403,'Administrator access required.');
  if(config.demo){assert(code==='654321',401,'Use the local demo admin factor 654321.');return;}
  const secret=process.env.ADMIN_TOTP_SECRET;assert(secret&&secret.length>=32,503,'Admin second factor is not configured.');
  const current=Math.floor(Date.now()/30000),step=[current-1,current,current+1].find(n=>safeEqual(totp(secret,n),String(code)));
  assert(step!==undefined,401,'Invalid authenticator code.');
  await db.transaction(async tx=>{
    await tx.query(db.lock('SELECT user_id FROM users WHERE user_id=?'),[user.user_id]);
    const [last]=await tx.query('SELECT last_step FROM admin_totp_uses WHERE user_id=?',[user.user_id]);
    assert(!last||step>last.last_step,401,'This authenticator code has already been used.');
    if(last)await tx.query('UPDATE admin_totp_uses SET last_step=? WHERE user_id=?',[step,user.user_id]);
    else await tx.query('INSERT INTO admin_totp_uses (user_id,last_step) VALUES (?,?)',[user.user_id,step]);
  });
}
