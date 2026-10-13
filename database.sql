-- FoodSaver / MySQL 8.0.16+ (CHECK constraints enforced)
-- Use a new, empty database. All BIGINT times are UTC epoch milliseconds.
-- No secrets or real user data are included.
CREATE DATABASE IF NOT EXISTS foodsaver CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE foodsaver;

CREATE TABLE IF NOT EXISTS users (
 user_id VARCHAR(36) PRIMARY KEY, full_name VARCHAR(100) NOT NULL,
 phone_number VARCHAR(20) NOT NULL UNIQUE, email VARCHAR(254), firebase_uid VARCHAR(128) NOT NULL UNIQUE,
 latitude DOUBLE, longitude DOUBLE, role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 account_status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended')), created_at BIGINT NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS food_donations (
 food_id VARCHAR(36) PRIMARY KEY, donor_id VARCHAR(36) NOT NULL,
 food_name VARCHAR(120) NOT NULL, category VARCHAR(10) NOT NULL CHECK(category IN ('Veg','Non-Veg')),
 food_type VARCHAR(30) NOT NULL, quantity VARCHAR(80) NOT NULL, people_count INTEGER NOT NULL CHECK(people_count>0),
 description TEXT NOT NULL, image_url VARCHAR(1000), prepared_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 pickup_area VARCHAR(120) NOT NULL, pickup_address VARCHAR(500) NOT NULL, latitude DOUBLE NOT NULL, longitude DOUBLE NOT NULL,
 contact_preference VARCHAR(30) NOT NULL DEFAULT 'In-app chat', safe_storage INTEGER NOT NULL CHECK(safe_storage=1),
 status VARCHAR(12) NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','Reserved','Collected','Expired','Cancelled')),
 expiry_notified INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL,
 FOREIGN KEY(donor_id) REFERENCES users(user_id), CHECK(expires_at>prepared_at)
) ENGINE=InnoDB;
CREATE INDEX idx_food_active_expiry ON food_donations(status,expires_at) ENGINE=InnoDB;
CREATE INDEX idx_food_donor ON food_donations(donor_id,created_at) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS food_requests (
 request_id VARCHAR(36) PRIMARY KEY, food_id VARCHAR(36) NOT NULL, receiver_id VARCHAR(36) NOT NULL,
 request_status VARCHAR(12) NOT NULL DEFAULT 'Pending' CHECK(request_status IN ('Pending','Accepted','Rejected','Completed','Cancelled','Expired')),
 requested_at BIGINT NOT NULL, accepted_at BIGINT, collected_at BIGINT,
 FOREIGN KEY(food_id) REFERENCES food_donations(food_id), FOREIGN KEY(receiver_id) REFERENCES users(user_id),
 UNIQUE(food_id,receiver_id)
) ENGINE=InnoDB;
CREATE INDEX idx_requests_receiver ON food_requests(receiver_id,request_status) ENGINE=InnoDB;
CREATE INDEX idx_requests_food ON food_requests(food_id,request_status) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS notifications (
 notification_id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, message VARCHAR(500) NOT NULL,
 notification_type VARCHAR(30) NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE INDEX idx_notifications_user ON notifications(user_id,created_at) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS messages (
 message_id VARCHAR(36) PRIMARY KEY, request_id VARCHAR(36) NOT NULL, sender_id VARCHAR(36) NOT NULL,
 message_text VARCHAR(2000) NOT NULL, sent_at BIGINT NOT NULL,
 FOREIGN KEY(request_id) REFERENCES food_requests(request_id), FOREIGN KEY(sender_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE INDEX idx_messages_request ON messages(request_id,sent_at) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS reports (
 report_id VARCHAR(36) PRIMARY KEY, reporter_id VARCHAR(36) NOT NULL, reported_user_id VARCHAR(36), food_id VARCHAR(36),
 reason VARCHAR(2000) NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Resolved')),
 created_at BIGINT NOT NULL, FOREIGN KEY(reporter_id) REFERENCES users(user_id),
 FOREIGN KEY(reported_user_id) REFERENCES users(user_id), FOREIGN KEY(food_id) REFERENCES food_donations(food_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admin_audit_logs (
 log_id VARCHAR(36) PRIMARY KEY, admin_id VARCHAR(36) NOT NULL, action VARCHAR(80) NOT NULL,
 target_type VARCHAR(30) NOT NULL, target_id VARCHAR(36) NOT NULL, created_at BIGINT NOT NULL,
 FOREIGN KEY(admin_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, csrf_token VARCHAR(64) NOT NULL,
 admin_verified INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE INDEX idx_sessions_user ON sessions(user_id) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS otp_challenges (
 challenge_id VARCHAR(36) PRIMARY KEY, phone_number VARCHAR(20) NOT NULL, otp_hash VARCHAR(64) NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB;
CREATE INDEX idx_otp_phone ON otp_challenges(phone_number,created_at) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admin_totp_uses (
 user_id VARCHAR(36) PRIMARY KEY, last_step BIGINT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
