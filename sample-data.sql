-- DEMONSTRATION ONLY. Import into an EMPTY, SEPARATE DEVELOPMENT database.
-- These identities cannot authenticate through real Firebase. Never promote them to production.
-- Prefer node scripts/demo.js for the complete local demonstration.
SET @now = CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED);
INSERT INTO users (user_id,full_name,phone_number,firebase_uid,latitude,longitude,role,account_status,created_at) VALUES
('demo-donor','Ananya Rao','+919876543211','demo:+919876543211',12.977,77.602,'user','active',@now),
('demo-receiver','Aarav Sharma','+919876543210','demo:+919876543210',12.9716,77.5946,'user','active',@now);
INSERT INTO food_donations (food_id,donor_id,food_name,category,food_type,quantity,people_count,description,image_url,prepared_at,expires_at,pickup_area,pickup_address,latitude,longitude,safe_storage,status,created_at) VALUES
('demo-meal','demo-donor','Fresh vegetable bowls','Veg','Cooked meals','8 boxes',8,'Fresh vegetable rice, cooled and refrigerated safely. Contains mustard.','/images/meal.jpg',@now-3600000,@now+21600000,'Central Bengaluru','FICTIONAL DEMO: community pickup desk',12.979,77.603,1,'Available',@now);
