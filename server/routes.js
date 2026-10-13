import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { assert, text, coords, id, publicFood, csv } from './utils.js';
import { createSession, loadSession, safeUser, issueDemoOTP, verifyDemoOTP, verifyFirebase, getOrCreateUser, verifyAdmin, cookieOptions } from './auth.js';
import { availableFood, createFood, requestFood, actOnRequest, cancelFood, chatAccess, notify, emitEvents, audit, foodInput } from './services.js';
import { upload, storeImage } from './uploads.js';

export function routes(db,io){
  const allowedOrigins = [
    config.origin,
    process.env.FRONTEND_URL,
    process.env.APP_ORIGIN
  ].filter(Boolean).map(o => o.replace(/\/+$/, ''));
  const isOriginAllowed = origin => {
    if (!origin) return true;
    if (process.env.ALLOW_ALL_ORIGINS === 'true') return true;
    return allowedOrigins.includes(origin.replace(/\/+$/, ''));
  };

  const router=Router(),authLimit=rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many login attempts. Try again in 15 minutes.'}}),writeLimit=rateLimit({windowMs:60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Please slow down.'}});
  router.use(async(req,res,next)=>{req.user=await loadSession(db,req);next();});
  router.use((req,res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      assert(!req.headers.origin || isOriginAllowed(req.headers.origin),403,'Request origin is not allowed.');
      if(req.user)assert(req.headers['x-csrf-token']===req.user.csrf_token,403,'Session verification failed. Refresh and try again.');
    }next();
  });
  const auth=(req,res,next)=>{assert(req.user,401,'Please sign in to continue.');next();};
  const admin=(req,res,next)=>{assert(req.user?.role==='admin'&&req.user.admin_verified,403,'Administrator authentication required.');next();};
  router.get('/config',(req,res)=>res.json({demo:config.demo,firebase:config.firebase}));
  router.get('/health',async(req,res)=>{await db.query('SELECT 1 AS healthy');res.json({status:'ok',database:db.driver,demo:config.demo});});
  router.get('/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user),csrf:req.user.csrf_token,admin_verified:Boolean(req.user.admin_verified)}));
  router.post('/auth/demo/otp',authLimit,async(req,res)=>res.json(await issueDemoOTP(db,req.body.phone_number)));
  router.post('/auth/login',authLimit,async(req,res)=>{
    const identity=config.demo?await verifyDemoOTP(db,req.body.challenge,req.body.code):await verifyFirebase(req.body.id_token);
    const user=await getOrCreateUser(db,identity,req.body);
    const isAdmin=req.body.admin===true;if(isAdmin)await verifyAdmin(db,user,req.body.totp);
    // Rotate and invalidate an existing session on login.
    if(req.user)await db.query('DELETE FROM sessions WHERE token_hash=?',[req.user.token_hash]);
    res.json({...await createSession(db,res,user,isAdmin),admin_verified:isAdmin});
  });
  router.post('/auth/logout',auth,async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=?',[req.user.token_hash]);io.in(`session:${req.user.token_hash}`).disconnectSockets(true);res.clearCookie('foodsaver_session',cookieOptions());res.json({success:true});});

  router.patch('/profile',auth,writeLimit,async(req,res)=>{
    const name=text(req.body.full_name,'Full name',2,100),email=req.body.email?text(req.body.email,'Email',3,254):null;
    assert(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'Enter a valid email.');
    const location=req.body.latitude!==null?coords(req.body.latitude,req.body.longitude):{latitude:null,longitude:null};
    await db.query('UPDATE users SET full_name=?,email=?,latitude=?,longitude=? WHERE user_id=?',[name,email,location.latitude,location.longitude,req.user.user_id]);res.json({success:true});
  });
  router.get('/food',async(req,res)=>res.json(await availableFood(db,req.user,req.query)));
  router.get('/food/:id',async(req,res)=>{
    const [food]=await db.query('SELECT f.*,u.full_name AS donor_name,u.account_status AS donor_status FROM food_donations f JOIN users u ON f.donor_id=u.user_id WHERE food_id=?',[req.params.id]);assert(food,404,'Food listing not found.');
    let accepted=false;if(req.user){const [r]=await db.query("SELECT request_id FROM food_requests WHERE food_id=? AND receiver_id=? AND request_status IN ('Accepted','Completed')",[food.food_id,req.user.user_id]);accepted=Boolean(r)&&['Reserved','Collected'].includes(food.status);}
    assert(food.donor_status==='active'||food.donor_id===req.user?.user_id,404,'Food listing is unavailable.');
    res.json({...publicFood(food,req.user,accepted),accepted});
  });
  router.post('/food',auth,writeLimit,upload.single('image'),async(req,res)=>{
    // Validate before uploading an image; a bad donation cannot create orphan media.
    if(req.body.safe_storage==='true')req.body.safe_storage=true;foodInput(req.body);
    if(req.body.has_image==='true')assert(req.file,400,'Choose a JPEG, PNG or WebP image.');
    res.status(201).json(await createFood(db,req.user,req.body,await storeImage(req.file),io));
  });
  router.post('/food/:id/request',auth,writeLimit,async(req,res)=>res.status(201).json(await requestFood(db,req.user,req.params.id,io)));
  router.post('/food/:id/cancel',auth,writeLimit,async(req,res)=>{await cancelFood(db,req.user,req.params.id,io);res.json({success:true});});
  router.get('/my/donations',auth,async(req,res)=>res.json(await db.query('SELECT * FROM food_donations WHERE donor_id=? ORDER BY created_at DESC',[req.user.user_id])));
  router.get('/my/requests',auth,async(req,res)=>{
    const rows=await db.query('SELECT r.*,f.food_name,f.category,f.image_url,f.pickup_area,f.status AS food_status,f.expires_at,f.donor_id,u.full_name AS donor_name,v.full_name AS receiver_name FROM food_requests r JOIN food_donations f ON r.food_id=f.food_id JOIN users u ON u.user_id=f.donor_id JOIN users v ON v.user_id=r.receiver_id WHERE r.receiver_id=? OR f.donor_id=? ORDER BY r.requested_at DESC',[req.user.user_id,req.user.user_id]);res.json(rows);
  });
  router.get('/requests/:id/messages',auth,async(req,res)=>{const request=await chatAccess(db,req.user,req.params.id);const messages=await db.query('SELECT m.*,u.full_name AS sender_name FROM messages m JOIN users u ON u.user_id=m.sender_id WHERE request_id=? ORDER BY sent_at',[req.params.id]);res.json({request,messages});});
  router.post('/requests/:id/messages',auth,writeLimit,async(req,res)=>{
    const events=[],message={message_id:id(),request_id:req.params.id,sender_id:req.user.user_id,message_text:text(req.body.message_text,'Message',1,2000),sent_at:Date.now()};
    const r=await chatAccess(db,req.user,req.params.id);
    assert(r.request_status==='Accepted'&&r.expires_at>Date.now(),409,'This conversation is read-only after pickup or expiry.');
    await db.transaction(async tx=>{await tx.query('INSERT INTO messages (message_id,request_id,sender_id,message_text,sent_at) VALUES (?,?,?,?,?)',Object.values(message));await notify(tx,events,r.donor_id===req.user.user_id?r.receiver_id:r.donor_id,`New message from ${req.user.full_name} about ${r.food_name}.`,'message');});
    for(const participant of [r.donor_id,r.receiver_id])io.to(`user:${participant}`).emit('chat:message',{...message,sender_name:req.user.full_name});
    emitEvents(io,events);res.status(201).json(message);
  });
  router.post('/requests/:id/:action',auth,writeLimit,async(req,res)=>res.json(await actOnRequest(db,req.user,req.params.id,req.params.action,io)));
  router.get('/notifications',auth,async(req,res)=>res.json(await db.query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[req.user.user_id])));
  router.post('/notifications/read',auth,async(req,res)=>{await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?',[req.user.user_id]);res.json({success:true});});
  router.get('/stats',auth,async(req,res)=>{
    const [counts]=await db.query("SELECT SUM(CASE WHEN f.status='Available' AND f.expires_at>? AND u.account_status='active' THEN 1 ELSE 0 END) AS available, SUM(CASE WHEN f.status='Collected' THEN 1 ELSE 0 END) AS completed FROM food_donations f JOIN users u ON u.user_id=f.donor_id",[Date.now()]);
    const [requests]=await db.query("SELECT COUNT(*) AS active FROM food_requests WHERE receiver_id=? AND request_status IN ('Pending','Accepted')",[req.user.user_id]);
    const foods=await availableFood(db,req.user);res.json({available:Number(counts.available||0),completed:Number(counts.completed||0),active:requests.active,nearby:foods.filter(f=>f.distance_km!==null&&f.distance_km<=5).length});
  });
  router.post('/reports',auth,writeLimit,async(req,res)=>{
    const reason=text(req.body.reason,'Report reason',10,2000);assert(req.body.food_id||req.body.reported_user_id,400,'Choose a food listing or user to report.');
    if(req.body.food_id){const [f]=await db.query('SELECT food_id FROM food_donations WHERE food_id=?',[req.body.food_id]);assert(f,404,'Food not found.');}
    if(req.body.reported_user_id){const [u]=await db.query('SELECT user_id FROM users WHERE user_id=?',[req.body.reported_user_id]);assert(u,404,'User not found.');}
    await db.query('INSERT INTO reports (report_id,reporter_id,reported_user_id,food_id,reason,status,created_at) VALUES (?,?,?,?,?,?,?)',[id(),req.user.user_id,req.body.reported_user_id||null,req.body.food_id||null,reason,'Open',Date.now()]);res.status(201).json({success:true});
  });
  router.use('/admin',auth,admin);
  router.get('/admin/overview',async(req,res)=>{
    const [users]=await db.query('SELECT COUNT(*) AS total FROM users'),[food]=await db.query("SELECT COUNT(*) AS total,SUM(CASE WHEN status='Available' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='Collected' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='Expired' THEN 1 ELSE 0 END) AS expired FROM food_donations"),[requests]=await db.query('SELECT COUNT(*) AS total FROM food_requests');
    const donations=await db.query('SELECT created_at,status,pickup_area,people_count FROM food_donations'),growth=await db.query('SELECT created_at FROM users');
    const group=(rows,key)=>Object.entries(rows.reduce((out,row)=>{const k=key(row);out[k]=(out[k]||0)+1;return out;},{})).sort((a,b)=>a[0].localeCompare(b[0])).map(([label,value])=>({label,value}));
    res.json({users:users.total,donations:food.total,active:Number(food.active||0),completed:Number(food.completed||0),expired:Number(food.expired||0),requests:requests.total,daily:group(donations,r=>new Date(r.created_at).toISOString().slice(0,10)),monthly:group(donations,r=>new Date(r.created_at).toISOString().slice(0,7)),areas:group(donations,r=>r.pickup_area).sort((a,b)=>b.value-a.value),growth:group(growth,r=>new Date(r.created_at).toISOString().slice(0,10)),meals:donations.filter(r=>r.status==='Collected').reduce((sum,r)=>sum+r.people_count,0)});
  });
  router.get('/admin/users',async(req,res)=>res.json(await db.query('SELECT user_id,full_name,phone_number,email,role,account_status,created_at FROM users WHERE full_name LIKE ? OR phone_number LIKE ? ORDER BY created_at DESC',[`%${String(req.query.q||'').slice(0,100)}%`,`%${String(req.query.q||'').slice(0,100)}%`])));
  router.patch('/admin/users/:id',writeLimit,async(req,res)=>{
    assert(['active','suspended'].includes(req.body.account_status),400,'Invalid account status.');assert(req.params.id!==req.user.user_id,400,'You cannot suspend your own account.');
    await db.transaction(async tx=>{
      const [u]=await tx.query(db.lock('SELECT * FROM users WHERE user_id=?'),[req.params.id]);assert(u,404,'User not found.');assert(u.role!=='admin',400,'Admin accounts must be managed by the system owner.');
      await tx.query('UPDATE users SET account_status=? WHERE user_id=?',[req.body.account_status,req.params.id]);
      if(req.body.account_status==='suspended')await tx.query('DELETE FROM sessions WHERE user_id=?',[req.params.id]);
      await audit(tx,req.user,`account-${req.body.account_status}`,'user',req.params.id);
    });if(req.body.account_status==='suspended')io.in(`user:${req.params.id}`).disconnectSockets(true);io.emit('listings:changed');res.json({success:true});
  });
  router.get('/admin/food',async(req,res)=>res.json(await db.query('SELECT f.*,u.full_name AS donor_name FROM food_donations f JOIN users u ON u.user_id=f.donor_id ORDER BY created_at DESC')));
  router.get('/admin/requests',async(req,res)=>res.json(await db.query('SELECT r.*,f.food_name,u.full_name AS receiver_name FROM food_requests r JOIN food_donations f ON f.food_id=r.food_id JOIN users u ON u.user_id=r.receiver_id ORDER BY requested_at DESC')));
  router.get('/admin/reports',async(req,res)=>res.json(await db.query('SELECT r.*,u.full_name AS reporter_name FROM reports r JOIN users u ON u.user_id=r.reporter_id ORDER BY created_at DESC')));
  router.patch('/admin/reports/:id',async(req,res)=>{await db.transaction(async tx=>{const [r]=await tx.query('SELECT report_id FROM reports WHERE report_id=?',[req.params.id]);assert(r,404,'Report not found.');await tx.query("UPDATE reports SET status='Resolved' WHERE report_id=?",[req.params.id]);await audit(tx,req.user,'resolve-report','report',req.params.id);});res.json({success:true});});
  router.get('/admin/audit',async(req,res)=>res.json(await db.query('SELECT l.*,u.full_name AS admin_name FROM admin_audit_logs l JOIN users u ON u.user_id=l.admin_id ORDER BY created_at DESC LIMIT 200')));
  router.get('/admin/export',async(req,res)=>{
    const exports={food:'SELECT food_id,food_name,category,people_count,pickup_area,status,created_at FROM food_donations',requests:'SELECT request_id,food_id,request_status,requested_at,accepted_at,collected_at FROM food_requests',users:'SELECT user_id,full_name,role,account_status,created_at FROM users'};
    const type=req.query.type||'food';assert(exports[type],400,'Invalid report type.');res.type('text/csv').attachment(`foodsaver-${type}.csv`).send(csv(await db.query(exports[type])));await audit(db,req.user,'export-csv',type,'all');
  });
  return router;
}
