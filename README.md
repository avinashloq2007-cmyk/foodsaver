# Aravuun — Good food. Greater good.

A working food donation platform using HTML, CSS, JavaScript, Bootstrap 5, Node.js, Express, MySQL, Firebase Phone Authentication, Leaflet/OpenStreetMap, Socket.IO, and Cloudinary.

The app includes registration and phone OTP login, a dashboard, food donation and discovery, location filtering and maps, requests and donor decisions, private pickup chat, handover confirmation, notification history, profiles, and an admin console with users, food, requests, reports, analytics, audit logs and CSV exports. The frontend is a responsive single-page application; every screen has its own URL.

## Run the local demo immediately

Requires Node.js **24 or later**. The delivered workspace has installed dependencies. For a fresh checkout or the ZIP, first run `npm install` (or `pnpm install`).

```sh
cd foodsaver
npm run demo
```

Open **http://localhost:3000**. Keep its terminal running; use Ctrl+C to stop it.

This mode uses a real SQLite relational database at `data/demo.sqlite`, automatically initializes the schema and seeds an empty database. Writes, requests, messages, notifications and admin changes persist across restarts. It is a separate development path, not a substitute for the production MySQL connection. It binds only to `127.0.0.1` and is explicitly prohibited in production.

| Demo account | Phone | Use |
| --- | --- | --- |
| Aarav Sharma | +919876543210 | Discover food and request pickup |
| Ananya Rao | +919876543211 | Donate food, accept and complete requests |
| Community Kitchen | +919876543212 | Another donor or requester |
| Aravuun Admin | +919876543299 | Admin login; demo second factor **654321** |

Click a sample account, send the code, then enter the random six-digit **local demo code shown on screen**. Codes expire after five minutes, allow five attempts, cannot be reused, and have a 60-second resend cooldown and five-per-hour limit. No SMS is sent. Demo OTPs are stored as HMAC hashes, never plaintext.

To try the full flow, use separate browser profiles or an incognito window for the donor and receiver. Request a donation as Aarav; accept it from Ananya’s **My requests**; use chat; view exact pickup details as Aarav; mark **Ready for pickup**, then **Confirm handover** as Ananya. Pending requests from other receivers are rejected atomically when one request is accepted.

The example pickups are fictional. Sample food timestamps are relative to the initial seed time and expire normally; your donations persist too. To reset the demo, stop its process and remove only the three `data/demo.sqlite`, `data/demo.sqlite-wal`, and `data/demo.sqlite-shm` files inside this project, then restart. This intentionally discards local demo records.

## Configure MySQL and real phone OTP

1. Install Node.js 24+ and MySQL **8.0.16+** (or use the included Docker Compose configuration). Create an empty database called `foodsaver`, an application database user, and grant that user privileges on this database only. `database.sql` contains the database creation statement and full schema.
2. Copy `.env.example` to `.env`. Fill `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`. Set `DB_DRIVER=mysql`, `DEMO_MODE=false`, and `SEED_DEMO=false`. Generate a strong server secret: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; save its output in `AUTH_SECRET`.
3. Run `npm install`, then **`npm run db:setup`** against the empty database. This creates tables, constraints and indexes. Alternatively import `database.sql` with MySQL Workbench or the MySQL CLI. Do not do both. Setup deliberately refuses an existing schema; use a migration to change an existing installation.
4. Create a Firebase project and register a Web app. Enable **Authentication → Sign-in method → Phone**. Configure allowed domains for your deployment and localhost when testing, SMS region policy, and the billing/quota requirements applicable to your Firebase account. Copy the Web app’s `apiKey`, `authDomain`, `projectId`, and `appId` into the corresponding `FIREBASE_*` variables. These are public client identifiers.
5. Create a Firebase **Admin SDK service account**. Keep its private JSON file outside the project and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. The backend uses the Admin SDK to validate the signed ID token, revocation, verified phone provider and recent authentication. It never trusts a phone number or UID supplied by the frontend.
6. Fill `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. The server validates image type, file signature and a 5 MB limit, then uploads with Cloudinary’s signed server SDK. Without Cloudinary, production donation forms still work without an image; image uploads return a clear configuration error.
7. Set `APP_ORIGIN` to the exact browser origin. For local development use `NODE_ENV=development` and `APP_ORIGIN=http://localhost:3000`. Run **`npm start`**. For production use an HTTPS origin, `NODE_ENV=production`, and a trusted HTTPS reverse proxy; set `TRUST_PROXY=1` only if exactly one trusted proxy sits in front of Express. Cookies are HttpOnly, SameSite=Strict and Secure when the origin is HTTPS. Proxy WebSocket upgrades for Socket.IO. Bind `HOST` according to your deployment network.

Real SMS delivery, reCAPTCHA, phone OTP expiry and provider resend quotas are handled by Firebase. The browser expires its verification step after five minutes; backend session creation requires a recent, verified Firebase phone token. Firebase Auth sending runs on the client through its protected reCAPTCHA flow. The backend separately rate-limits login/session creation; it cannot override Firebase’s SMS policies. Never enable Firebase’s test verification bypass in production. Use Firebase’s configured test phone numbers to test without sending real SMS.

Official references: [Firebase phone authentication](https://firebase.google.com/docs/auth/web/phone-auth), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Cloudinary Node uploads](https://cloudinary.com/documentation/node_image_and_video_upload), [MySQL2](https://sidorares.github.io/node-mysql2/), [Leaflet](https://leafletjs.com/reference.html), [Socket.IO middleware](https://socket.io/docs/v4/middlewares/).

### Optional MySQL container

Set `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` in your environment or `.env`, then:

```sh
docker compose up -d mysql
npm run db:setup
```

The container exposes MySQL on loopback port 3306 and keeps its data in a named volume. Do not commit `.env`. Run `docker compose stop` when it is no longer needed; the data volume remains. `MYSQL_ROOT_PASSWORD` is used by Compose only; the application connects as the limited `foodsaver` user.

### Secure admin setup

Register your actual admin phone using Firebase, then run this server-owner command:

```sh
node scripts/make-admin.js +YOUR_VERIFIED_PHONE
node scripts/admin-secret.js
```

The second command generates a Base32 TOTP secret and an `otpauth://` enrollment URI. Save the secret as `ADMIN_TOTP_SECRET` on the server and enroll it in an authenticator app. Restart the server. Sign in at **/#/admin-login** using the phone OTP plus the independent authenticator code. Used TOTP time steps are stored in MySQL to reject replays. Admin sessions expire after one hour; user sessions expire after 24 hours. Roles come from the database, never from registration input. Use one administrator for this initial shared-factor setup; an organization with multiple independent administrators should provision a per-admin encrypted TOTP secret store.

### Demonstration records for MySQL

`sample-data.sql` is **separate**, optional demonstration data. Import it only into a separate empty development database after the schema. `npm run db:seed` seeds the fuller set only with `NODE_ENV=development` and `SEED_DEMO=true`. Seed identities are explicitly `demo:*` and cannot authenticate with real Firebase. Never import demo identities into a production database.

## Project structure

```text
foodsaver/
  public/                  Responsive frontend and locally served vendor assets
    index.html             Application entry point
    app.js                 Screens, forms, maps, OTP flow, live chat and notifications
    icons.js, style.css     Visual system and responsive layout
    images/                Food photographs and original vector artwork
  server/
    index.js, app.js        Express server, security headers, Socket.IO, expiry worker
    config.js              Environment validation
    db.js, schema.js       MySQL pool, SQLite demo adapter, relational schema
    auth.js                Firebase verification, sessions, demo OTP, admin TOTP
    routes.js              REST routes, authentication and role authorization
    services.js            Donation and request logic, transactions, notifications
    uploads.js, utils.js    Cloudinary, image validation, distance and CSV utilities
    seed.js                Separate demonstration data
  scripts/                 Demo runner, DB setup, seed, admin setup and syntax checks
  tests/                   API/security tests and full browser workflow
  docs/                    API reference, ER diagram, architecture and test results
  database.sql             Complete MySQL schema
  sample-data.sql          Separate optional example records
  docker-compose.yml       Optional local MySQL service
  .env.example             Configuration without credentials
  package.json             Commands and dependencies
  pnpm-lock.yaml           Reproducible dependency versions
```

## Pages

| Screen | URL |
| --- | --- |
| Welcome | /#/ |
| Registration / login / verification | /#/register, /#/login, /#/verify |
| User dashboard | /#/dashboard |
| Add food / available food / details | /#/add, /#/available, /#/food/FOOD_ID |
| Nearby map | /#/map |
| Donations / requests / chat | /#/donations, /#/requests, /#/chat/REQUEST_ID |
| Profile / notifications | /#/profile, /#/notifications |
| Admin login / dashboard | /#/admin-login, /#/admin |
| User / food / request management | /#/admin/users, /#/admin/food, /#/admin/requests |
| Reports / analytics / audit | /#/admin/reports, /#/admin/analytics, /#/admin/audit |

## Validation

```sh
npm run check
npm test
node tests/browser.js
```

API tests initialize an isolated SQLite database in memory and cover verification, single-use OTP, expiry/attempt/resend limits, account uniqueness, sessions, CSRF, invalid food data, Haversine filtering, public location privacy, concurrent reservation, chat authorization, handover, food expiry, account suspension, admin authorization, TOTP and CSV injection protection. Browser tests require installed Chrome, use another in-memory database on port 3001, and exercise the complete UI flow and mobile overflow. They write screenshots and results inside `test-results/` by default (override with `BROWSER_OUTPUT_DIR`). Test data does not modify your demo or production database. Browser QA accepts the host’s development HTTPS certificate environment for external map tiles; the application itself does not disable TLS checks.

See `docs/TEST-RESULTS.md` for what was actually verified in this workspace and any service-specific limits. See `docs/API.md` and `docs/DATABASE.md` for the REST API and ER diagram.

## Operational notes

- No credentials are included. Firebase SMS and Cloudinary need your own service configuration; MySQL must be running before production starts. The local demo is ready without them.
- Maps use OpenStreetMap tiles and need internet. GPS needs browser permission and a secure context (HTTPS or localhost). Users can always select on the map or type coordinates instead. Public markers are rounded to roughly neighbourhood precision; accepted requesters get the exact address and an OpenStreetMap directions link.
- Food expiry runs on startup and every minute. Every request and reservation also rechecks the current expiry time in its transaction, so delayed cleanup cannot allow expired food to be reserved.
- MySQL reservations lock the donation row with `SELECT ... FOR UPDATE` on one pooled connection. Only one request can move a donation from Available to Reserved. SQLite uses `BEGIN IMMEDIATE` and a connection queue for the equivalent demo behavior.
- Private messages are accessible only to the donor and accepted requester. They become read-only after collection or expiry. Admins can review reported disputes but cannot read private chat through admin APIs.
- Production is designed for a Node host with a MySQL connection. The requested Express, TCP MySQL and Socket.IO stack is delivered locally; it is not deployed to the Sites Cloudflare Worker runtime, which does not support that stack unchanged.
- Food photographs are illustrative Unsplash assets; the basket, logo and fallback images are original SVGs. Donors may upload their own food photos.

Keep the Node process supervised, back up MySQL and manage provider quotas. Multi-instance deployment needs a shared Socket.IO adapter and a shared rate-limit store; this delivery targets one application instance. The included in-process limiter and expiry worker are sufficient for the local setup and a single Node instance.
