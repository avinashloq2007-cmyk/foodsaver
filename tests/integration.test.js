import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const useMySQL=process.env.TEST_MYSQL==='true';
if(useMySQL&&!process.env.MYSQL_DATABASE?.endsWith('_test'))throw new Error('MySQL tests require an empty database named with an _test suffix.');
process.env.NODE_ENV='test';process.env.DEMO_MODE='true';process.env.DB_DRIVER=useMySQL?'mysql':'sqlite';process.env.AUTH_SECRET='test-only-secret-abcdefghijklmnopqrstuvwxyz';process.env.APP_ORIGIN='http://localhost:3000';
const {Database}=await import('../server/db.js');
const {schema}=await import('../server/schema.js');
const {seed}=await import('../server/seed.js');
const {createApp}=await import('../server/app.js');
const {issueDemoOTP,verifyDemoOTP,totp}=await import('../server/auth.js');
const {requestFood,actOnRequest,expireFood,foodInput}=await import('../server/services.js');
const {distance,csv}=await import('../server/utils.js');
let db,runtime,base,donor,receiver,other,admin,foods;
async function call(path,{method='GET',body,cookie,csrf,origin='http://localhost:3000'}={}){
  const res=await fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json',Origin:origin,...cookie?{Cookie:cookie}:{},...csrf?{'X-CSRF-Token':csrf}:{}},body:body?JSON.stringify(body):undefined});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
async function login(number,isAdmin=false){const otp=await call('/auth/demo/otp',{method:'POST',body:{phone_number:number}});assert.equal(otp.status,200);const result=await call('/auth/login',{method:'POST',body:{challenge:otp.data.challenge,code:otp.data.code,admin:isAdmin,totp:isAdmin?'654321':undefined}});assert.equal(result.status,200);return {cookie:result.cookie,csrf:result.data.csrf,user:result.data.user};}
before(async()=>{db=new Database({driver:useMySQL?'mysql':'sqlite',path:':memory:'});if(useMySQL){const [tables]=await db.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()');assert.equal(tables.n,0,'Use an empty, dedicated MySQL test database.');}await db.schema(schema);await seed(db);runtime=createApp(db);await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${runtime.server.address().port}`;donor=await login('+919876543211');receiver=await login('+919876543210');other=await login('+919876543212');admin=await login('+919876543299',true);foods=(await call('/food')).data;});
after(async()=>{if(runtime)await runtime.stop();else if(db)await db.close();});
test('OTP hashes, expiry, resend throttle, attempt limits and single-use verification',async()=>{
  const challenge=await issueDemoOTP(db,'+919800000001'),[saved]=await db.query('SELECT * FROM otp_challenges WHERE challenge_id=?',[challenge.challenge]);assert.notEqual(saved.otp_hash,challenge.code);assert.equal(saved.otp_hash.length,64);
  await assert.rejects(issueDemoOTP(db,'+919800000001'),/60 seconds/);
  await verifyDemoOTP(db,challenge.challenge,challenge.code);await assert.rejects(verifyDemoOTP(db,challenge.challenge,challenge.code),/expired/);
  const exp=await issueDemoOTP(db,'+919800000002');await db.query('UPDATE otp_challenges SET expires_at=0 WHERE challenge_id=?',[exp.challenge]);await assert.rejects(verifyDemoOTP(db,exp.challenge,exp.code),/expired/);
  const brute=await issueDemoOTP(db,'+919800000003');for(let n=0;n<5;n++)await assert.rejects(verifyDemoOTP(db,brute.challenge,'000000'),/Incorrect/);await assert.rejects(verifyDemoOTP(db,brute.challenge,brute.code),/too many/);
});
test('verified mobile cannot create duplicate accounts and unverified tokens are rejected',async()=>{
  const before=(await db.query('SELECT COUNT(*) AS n FROM users'))[0].n;await db.query('UPDATE otp_challenges SET created_at=created_at-61000 WHERE phone_number=?',[receiver.user.phone_number]);await login(receiver.user.phone_number);assert.equal((await db.query('SELECT COUNT(*) AS n FROM users'))[0].n,before);
  const result=await call('/auth/login',{method:'POST',body:{id_token:'forged',challenge:randomUUID(),code:'123456'}});assert.equal(result.status,401);
});
test('API requires sessions, CSRF and same-origin writes',async()=>{
  assert.equal((await call('/my/donations')).status,401);
  assert.equal((await call('/profile',{method:'PATCH',cookie:receiver.cookie,body:{full_name:'Forged',latitude:null,longitude:null}})).status,403);
  assert.equal((await call('/profile',{method:'PATCH',...receiver,origin:'https://attacker.example',body:{full_name:'Forged',latitude:null,longitude:null}})).status,403);
});
test('food creation performs database writes and validates safe storage, dates and coordinates',async()=>{
  const data={food_name:'Test meal',category:'Veg',food_type:'Cooked meals',quantity:'3 boxes',people_count:3,description:'Fresh test meal. Contains wheat.',prepared_at:new Date(Date.now()-3600000).toISOString(),expires_at:new Date(Date.now()+7200000).toISOString(),pickup_area:'Test area',pickup_address:'Private house 42, test street',latitude:12.9716,longitude:77.5946,safe_storage:true};
  const created=await call('/food',{method:'POST',...donor,body:data});assert.equal(created.status,201);assert.equal((await db.query('SELECT food_name FROM food_donations WHERE food_id=?',[created.data.food_id]))[0].food_name,'Test meal');
  for(const invalid of [{...data,safe_storage:false},{...data,latitude:200},{...data,expires_at:new Date(Date.now()-1000).toISOString()}])assert.equal((await call('/food',{method:'POST',...donor,body:invalid})).status,400);
});
test('GPS filtering uses Haversine distances and only active non-expired food',async()=>{
  assert.equal(Math.round(distance({latitude:0,longitude:0},{latitude:0,longitude:1})),111);
  const found=await call('/food?lat=12.9716&lng=77.5946&radius=1');assert.equal(found.status,200);assert.ok(found.data.every(f=>f.distance_km<=1&&f.status==='Available'&&f.expires_at>Date.now()));
  assert.equal((await call('/food?lat=200&lng=77')).status,400);assert.equal((await call('/food?radius=10')).status,400);
});
test('public cards hide phone, precise address and exact coordinates',async()=>{
  const f=foods[0],publicDetail=await call(`/food/${f.food_id}`);assert.equal(publicDetail.data.pickup_address,undefined);assert.equal(publicDetail.data.phone_number,undefined);
  assert.equal(publicDetail.data.latitude,Math.round(publicDetail.data.latitude*100)/100);
});
test('concurrent accepts reserve one listing; accepted receiver can chat and access exact pickup',async()=>{
  const f=foods.find(x=>x.donor_id===donor.user.user_id),r1=await requestFood(db,receiver.user,f.food_id),r2=await requestFood(db,other.user,f.food_id);
  const outcomes=await Promise.allSettled([actOnRequest(db,donor.user,r1.request_id,'accept'),actOnRequest(db,donor.user,r2.request_id,'accept')]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const accepted=(await db.query("SELECT * FROM food_requests WHERE food_id=? AND request_status='Accepted'",[f.food_id]))[0],winner=accepted.receiver_id===receiver.user.user_id?receiver:other,loser=winner===receiver?other:receiver;
  const exact=await call(`/food/${f.food_id}`,winner);assert.ok(exact.data.pickup_address);assert.equal(exact.data.accepted,true);
  assert.equal((await call(`/food/${f.food_id}`,loser)).data.pickup_address,undefined);
  const message=await call(`/requests/${accepted.request_id}/messages`,{method:'POST',...winner,body:{message_text:'I will collect in 20 minutes.'}});assert.equal(message.status,201);
  assert.equal((await call(`/requests/${accepted.request_id}/messages`,admin)).status,403);
  assert.equal((await call(`/requests/${accepted.request_id}/collect`,{method:'POST',...winner})).status,403);
  assert.equal((await call(`/requests/${accepted.request_id}/collect`,{method:'POST',...donor})).status,200);
  assert.equal((await db.query('SELECT status FROM food_donations WHERE food_id=?',[f.food_id]))[0].status,'Collected');
  assert.equal((await call(`/requests/${accepted.request_id}/messages`,{method:'POST',...winner,body:{message_text:'Post-pickup message'}})).status,409);
});
test('expired food cannot be requested; expiry worker closes pending requests and notifies',async()=>{
  const f=foods.find(x=>x.donor_id===other.user.user_id);const r=await requestFood(db,receiver.user,f.food_id);await db.query('UPDATE food_donations SET expires_at=? WHERE food_id=?',[Date.now()-1000,f.food_id]);
  await assert.rejects(requestFood(db,donor.user,f.food_id),/no longer available/);await expireFood(db);
  assert.equal((await db.query('SELECT status FROM food_donations WHERE food_id=?',[f.food_id]))[0].status,'Expired');assert.equal((await db.query('SELECT request_status FROM food_requests WHERE request_id=?',[r.request_id]))[0].request_status,'Expired');
  assert.ok((await db.query("SELECT * FROM notifications WHERE notification_type='expired'")).length);
});
test('admin APIs reject regular users; suspension invalidates sessions and audit records mutation',async()=>{
  assert.equal((await call('/admin/users',receiver)).status,403);assert.equal((await call('/admin/overview',admin)).status,200);
  const suspended=await call(`/admin/users/${other.user.user_id}`,{method:'PATCH',...admin,body:{account_status:'suspended'}});assert.equal(suspended.status,200);assert.equal((await call('/auth/me',other)).status,401);
  assert.ok((await db.query('SELECT * FROM admin_audit_logs WHERE target_id=?',[other.user.user_id])).length);
  assert.equal((await call('/stats',receiver)).data.available,(await call('/food',receiver)).data.length,'Dashboard count must exclude suspended donors.');
  assert.equal((await call(`/admin/users/${admin.user.user_id}`,{method:'PATCH',...admin,body:{account_status:'suspended'}})).status,400);
});
test('TOTP follows RFC vector and CSV prevents spreadsheet formula injection',()=>{
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');assert.ok(csv([{name:'=HYPERLINK("bad")'}]).includes("'=HYPERLINK"));
});
