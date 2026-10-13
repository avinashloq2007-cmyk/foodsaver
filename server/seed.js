import { id } from './utils.js';
export async function seed(db){
  const [count]=await db.query('SELECT COUNT(*) AS total FROM users');if(count.total)return;
  const now=Date.now(),users=[
    {user_id:id(),full_name:'Aarav Sharma',phone:'+919876543210',role:'user',lat:12.9716,lng:77.5946},
    {user_id:id(),full_name:'Ananya Rao',phone:'+919876543211',role:'user',lat:12.977,lng:77.602},
    {user_id:id(),full_name:'Community Kitchen',phone:'+919876543212',role:'user',lat:12.963,lng:77.588},
    {user_id:id(),full_name:'FoodSaver Admin',phone:'+919876543299',role:'admin',lat:12.9716,lng:77.5946}
  ];
  const examples=[
    ['Fresh vegetable bowls','Veg','Cooked meals','8 meal boxes',8,'Freshly prepared rice, seasonal vegetables and dal. Packed individually in clean, sealed containers.','Central Bengaluru',12.979,77.603,6,'meal',1],
    ['Artisan bread & rolls','Veg','Bakery','12 assorted pieces',6,'A selection of freshly baked sourdough and soft rolls from our bakery. Contains wheat and gluten.','Richmond Town',12.965,77.6,12,'bread',2],
    ['Seasonal fruit basket','Veg','Produce','3 kg assorted fruit',10,'Apples, oranges and bananas. Whole, fresh fruit with no cuts. Please bring a reusable bag.','Indiranagar',12.975,77.631,24,'fruit',1],
    ['Homestyle chicken biryani','Non-Veg','Cooked meals','6 sealed portions',6,'Fresh chicken biryani stored in a refrigerator after preparation. Contains dairy. Reheat thoroughly before eating.','Shanti Nagar',12.957,77.597,4,'biryani',2],
    ['Garden vegetable box','Veg','Produce','4 kg mixed vegetables',12,'Fresh carrots, tomatoes and greens from our community garden. Wash before preparation.','Jayanagar',12.938,77.588,30,'vegetables',2],
    ['Evening meal packs','Veg','Cooked meals','10 meal packs',10,'Rice, lentil curry and vegetables, cooled and refrigerated in covered containers. Contains mustard.','Vasanth Nagar',12.991,77.591,8,'meal',1]
  ];
  await db.transaction(async tx=>{
    for(const u of users)await tx.query('INSERT INTO users (user_id,full_name,phone_number,email,firebase_uid,latitude,longitude,role,account_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[u.user_id,u.full_name,u.phone,null,`demo:${u.phone}`,u.lat,u.lng,u.role,'active',now]);
    for(const [name,category,type,quantity,people,description,area,lat,lng,hours,image,donor] of examples)await tx.query('INSERT INTO food_donations (food_id,donor_id,food_name,category,food_type,quantity,people_count,description,image_url,prepared_at,expires_at,pickup_area,pickup_address,latitude,longitude,contact_preference,safe_storage,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id(),users[donor].user_id,name,category,type,quantity,people,description,`/images/${image}.${image==='biryani'?'svg':'jpg'}`,now-3600000,now+hours*3600000,area,`DEMO ADDRESS ONLY: Community pickup desk, ${area}`,lat,lng,'In-app chat',1,'Available',now]);
  });
}
