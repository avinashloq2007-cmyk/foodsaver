import { assert, id, text, coords, distance, publicFood } from './utils.js';

export function foodInput(body){
  const location=coords(body.latitude,body.longitude),prepared=Number(new Date(body.prepared_at)),expires=Number(new Date(body.expires_at)),people=Number(body.people_count);
  assert(['Veg','Non-Veg'].includes(body.category),400,'Choose Veg or Non-Veg.');
  assert(['Cooked meals','Bakery','Produce','Packaged food','Other'].includes(body.food_type),400,'Choose a food type.');
  assert(Number.isInteger(people)&&people>0&&people<=10000,400,'People served must be between 1 and 10000.');
  assert(Number.isFinite(prepared)&&prepared<=Date.now()+60000&&Number.isFinite(expires)&&expires>Date.now()&&expires>prepared,400,'Preparation must be in the past and safe consumption time must be in the future.');
  assert(expires<=Date.now()+7*86400000,400,'Safe consumption time must be within 7 days.');
  assert(body.safe_storage===true||body.safe_storage==='true',400,'Confirm the food has been safely stored.');
  return {food_name:text(body.food_name,'Food name',2,120),category:body.category,food_type:body.food_type,quantity:text(body.quantity,'Quantity',1,80),people_count:people,description:text(body.description,'Description',10,2000),prepared_at:prepared,expires_at:expires,pickup_area:text(body.pickup_area,'Pickup area',2,120),pickup_address:text(body.pickup_address,'Pickup address',5,500),...location,contact_preference:'In-app chat',safe_storage:1};
}
export async function notify(tx,events,user,message,type){
  const row={notification_id:id(),user_id:user,message,notification_type:type,is_read:0,created_at:Date.now()};
  await tx.query('INSERT INTO notifications (notification_id,user_id,message,notification_type,is_read,created_at) VALUES (?,?,?,?,?,?)',Object.values(row));
  events.push(row);return row;
}
export function emitEvents(io,events){for(const row of events)io?.to(`user:${row.user_id}`).emit('notification',row);io?.emit('listings:changed');}
export async function expireFood(db,io){
  const events=[];
  await db.transaction(async tx=>{
    const foods=await tx.query(db.lock("SELECT * FROM food_donations WHERE status IN ('Available','Reserved') AND expires_at<=?"),[Date.now()]);
    for(const food of foods){
      await tx.query("UPDATE food_donations SET status='Expired' WHERE food_id=?",[food.food_id]);
      const requests=await tx.query("SELECT * FROM food_requests WHERE food_id=? AND request_status IN ('Pending','Accepted')",[food.food_id]);
      await tx.query("UPDATE food_requests SET request_status='Expired' WHERE food_id=? AND request_status IN ('Pending','Accepted')",[food.food_id]);
      await notify(tx,events,food.donor_id,`${food.food_name} has expired and is no longer available.`,'expired');
      for(const r of requests)await notify(tx,events,r.receiver_id,`${food.food_name} has expired. Please do not collect it.`,'expired');
    }
    const soon=await tx.query(db.lock("SELECT * FROM food_donations WHERE status IN ('Available','Reserved') AND expiry_notified=0 AND expires_at>? AND expires_at<=?"),[Date.now(),Date.now()+3600000]);
    for(const f of soon){await tx.query('UPDATE food_donations SET expiry_notified=1 WHERE food_id=?',[f.food_id]);await notify(tx,events,f.donor_id,`${f.food_name} reaches its safe consumption time within an hour.`,'expiry-warning');}
    await tx.query('DELETE FROM sessions WHERE expires_at<=?',[Date.now()]);
    await tx.query('DELETE FROM otp_challenges WHERE created_at<?',[Date.now()-86400000]);
  });
  if(events.length)emitEvents(io,events);
}
export async function availableFood(db,user,filters={}){
  let foods=await db.query("SELECT f.*,u.full_name AS donor_name FROM food_donations f JOIN users u ON f.donor_id=u.user_id WHERE f.status='Available' AND f.expires_at>? AND u.account_status='active' ORDER BY f.created_at DESC",[Date.now()]);
  let location=null;
  if(filters.lat!==undefined||filters.lng!==undefined)location=coords(filters.lat,filters.lng);
  else if(user?.latitude!==null&&user?.latitude!==undefined)location=user;
  if(filters.radius)assert(location,400,'Set your location before filtering by distance.');
  if(filters.radius)assert([1,3,5,10].includes(Number(filters.radius)),400,'Choose a valid distance.');
  foods=foods.map(f=>({...f,distance_km:location?Math.round(distance(location,f)*10)/10:null})).filter(f=>(!filters.q||f.food_name.toLowerCase().includes(String(filters.q).toLowerCase()))&&(!filters.category||f.category===filters.category)&&(!filters.type||f.food_type===filters.type)&&(!filters.radius||f.distance_km<=Number(filters.radius))&&(!filters.people||f.people_count>=Number(filters.people))&&(!filters.hours||f.expires_at<=Date.now()+Number(filters.hours)*3600000));
  if(location)foods.sort((a,b)=>a.distance_km-b.distance_km);
  if(filters.sort==='expiry')foods.sort((a,b)=>a.expires_at-b.expires_at);
  return foods.map(f=>publicFood(f,user));
}
export async function createFood(db,user,body,imageUrl,io){
  const input=foodInput(body),food={food_id:id(),donor_id:user.user_id,...input,image_url:imageUrl||null,status:'Available',created_at:Date.now()},events=[];
  await db.transaction(async tx=>{
    const keys=Object.keys(food);await tx.query(`INSERT INTO food_donations (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(food));
    const nearby=await tx.query("SELECT user_id,latitude,longitude FROM users WHERE account_status='active' AND user_id<>? AND latitude IS NOT NULL",[user.user_id]);
    for(const u of nearby)if(distance(u,food)<=10)await notify(tx,events,u.user_id,`New food nearby: ${food.food_name}, serves ${food.people_count}.`,'new-food');
  });emitEvents(io,events);return food;
}
export async function requestFood(db,user,foodId,io){
  const events=[],request=await db.transaction(async tx=>{
    const [food]=await tx.query(db.lock('SELECT f.* FROM food_donations f WHERE food_id=?'),[foodId]);
    assert(food,404,'Food listing not found.');assert(food.donor_id!==user.user_id,400,'You cannot request your own donation.');
    assert(food.status==='Available'&&food.expires_at>Date.now(),409,'This food is no longer available.');
    const [donor]=await tx.query('SELECT account_status FROM users WHERE user_id=?',[food.donor_id]);assert(donor.account_status==='active',409,'Donor account is unavailable.');
    const [duplicate]=await tx.query('SELECT request_id FROM food_requests WHERE food_id=? AND receiver_id=?',[foodId,user.user_id]);assert(!duplicate,409,'You already requested this donation.');
    const r={request_id:id(),food_id:foodId,receiver_id:user.user_id,request_status:'Pending',requested_at:Date.now()};
    await tx.query('INSERT INTO food_requests (request_id,food_id,receiver_id,request_status,requested_at) VALUES (?,?,?,?,?)',Object.values(r));
    await notify(tx,events,food.donor_id,`${user.full_name} requested your ${food.food_name}.`,'request');return r;
  });emitEvents(io,events);return request;
}
export async function actOnRequest(db,user,requestId,action,io){
  assert(['accept','reject','collect','cancel','ready'].includes(action),400,'Invalid request action.');
  const events=[];
  const result=await db.transaction(async tx=>{
    const [ref]=await tx.query('SELECT food_id FROM food_requests WHERE request_id=?',[requestId]);assert(ref,404,'Request not found.');
    // Lock listing before requests everywhere, avoiding inconsistent lock order.
    const [food]=await tx.query(db.lock('SELECT * FROM food_donations WHERE food_id=?'),[ref.food_id]);
    const [r]=await tx.query(db.lock('SELECT * FROM food_requests WHERE request_id=?'),[requestId]);
    const donor=food.donor_id===user.user_id,receiver=r.receiver_id===user.user_id;
    assert(action==='cancel'?receiver:donor,403,'You cannot perform this action.');
    assert(food.expires_at>Date.now()&&!['Cancelled','Expired','Collected'].includes(food.status),409,'Food has expired or is no longer available.');
    const now=Date.now();
    if(action==='accept'){
      assert(food.status==='Available'&&r.request_status==='Pending',409,'Another request was accepted or this request is no longer pending.');
      const [recipient]=await tx.query('SELECT account_status FROM users WHERE user_id=?',[r.receiver_id]);
      assert(recipient?.account_status==='active',409,'This requester is no longer active.');
      await tx.query("UPDATE food_donations SET status='Reserved' WHERE food_id=? AND status='Available'",[food.food_id]);
      await tx.query("UPDATE food_requests SET request_status='Accepted',accepted_at=? WHERE request_id=?",[now,requestId]);
      const others=await tx.query("SELECT * FROM food_requests WHERE food_id=? AND request_id<>? AND request_status='Pending'",[food.food_id,requestId]);
      await tx.query("UPDATE food_requests SET request_status='Rejected' WHERE food_id=? AND request_id<>? AND request_status='Pending'",[food.food_id,requestId]);
      for(const other of others)await notify(tx,events,other.receiver_id,`${food.food_name} was reserved for another requester.`,'rejected');
      await notify(tx,events,r.receiver_id,`Your request for ${food.food_name} was accepted. Pickup details and chat are now available.`,'accepted');
    }else if(action==='reject'){
      assert(r.request_status==='Pending',409,'Only pending requests can be rejected.');await tx.query("UPDATE food_requests SET request_status='Rejected' WHERE request_id=?",[requestId]);
      await notify(tx,events,r.receiver_id,`Your request for ${food.food_name} was declined.`,'rejected');
    }else if(action==='collect'){
      assert(r.request_status==='Accepted'&&food.status==='Reserved',409,'Only an accepted request can be handed over.');
      await tx.query("UPDATE food_donations SET status='Collected' WHERE food_id=?",[food.food_id]);
      await tx.query("UPDATE food_requests SET request_status='Completed',collected_at=? WHERE request_id=?",[now,requestId]);
      await notify(tx,events,r.receiver_id,`Pickup complete: ${food.food_name}. Thank you for saving food!`,'collected');
      await notify(tx,events,food.donor_id,`You completed the handover of ${food.food_name}.`,'collected');
    }else if(action==='cancel'){
      assert(['Pending','Accepted'].includes(r.request_status),409,'This request is no longer active.');
      if(r.request_status==='Accepted')await tx.query("UPDATE food_donations SET status='Available' WHERE food_id=?",[food.food_id]);
      await tx.query("UPDATE food_requests SET request_status='Cancelled' WHERE request_id=?",[requestId]);await notify(tx,events,food.donor_id,`${user.full_name} cancelled the request for ${food.food_name}.`,'cancelled');
    }else{
      assert(r.request_status==='Accepted',409,'Accept the request first.');await notify(tx,events,r.receiver_id,`${food.food_name} is ready for pickup. Please check your chat.`,'ready');
    }
    return {success:true};
  });emitEvents(io,events);return result;
}
export async function cancelFood(db,user,foodId,io){const events=[];await db.transaction(async tx=>{
  const [f]=await tx.query(db.lock('SELECT * FROM food_donations WHERE food_id=?'),[foodId]);assert(f,404,'Food not found.');assert(f.donor_id===user.user_id||user.role==='admin'&&user.admin_verified,403,'Only the donor or an administrator can remove this listing.');assert(['Available','Reserved'].includes(f.status),409,'This listing is already closed.');
  await tx.query("UPDATE food_donations SET status='Cancelled' WHERE food_id=?",[foodId]);
  const requests=await tx.query("SELECT * FROM food_requests WHERE food_id=? AND request_status IN ('Pending','Accepted')",[foodId]);
  await tx.query("UPDATE food_requests SET request_status='Cancelled' WHERE food_id=? AND request_status IN ('Pending','Accepted')",[foodId]);
  for(const r of requests)await notify(tx,events,r.receiver_id,`${f.food_name} is no longer available.`,'cancelled');
  if(user.role==='admin'&&user.admin_verified)await audit(tx,user,'remove-food','food',foodId);
});emitEvents(io,events);}
export async function audit(tx,user,action,type,target){await tx.query('INSERT INTO admin_audit_logs (log_id,admin_id,action,target_type,target_id,created_at) VALUES (?,?,?,?,?,?)',[id(),user.user_id,action,type,target,Date.now()]);}
export async function chatAccess(db,user,requestId){
  const [r]=await db.query('SELECT r.*,f.donor_id,f.food_name,f.status AS food_status,f.expires_at,u.account_status AS donor_status,v.account_status AS receiver_status FROM food_requests r JOIN food_donations f ON r.food_id=f.food_id JOIN users u ON u.user_id=f.donor_id JOIN users v ON v.user_id=r.receiver_id WHERE r.request_id=?',[requestId]);
  assert(r,404,'Request not found.');assert([r.donor_id,r.receiver_id].includes(user.user_id),403,'You are not part of this conversation.');assert(['Accepted','Completed'].includes(r.request_status),403,'Chat is available after the donor accepts your request.');assert(r.donor_status==='active'&&r.receiver_status==='active',403,'Conversation unavailable.');return r;
}
