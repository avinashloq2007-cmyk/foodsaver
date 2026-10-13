# Brief-to-implementation map

| Requested module | Implementation |
| --- | --- |
| HTML/CSS/JS + Bootstrap | `public/index.html`, `style.css`, `app.js`; Bootstrap served locally |
| Node / Express REST backend | `server/app.js`, `routes.js`, `services.js` |
| MySQL database | `server/db.js`, `schema.js`, `database.sql`; separate SQLite-only local demo |
| Registration and OTP | Firebase client flow in `app.js`; Admin SDK verification in `auth.js`; optional signup GPS |
| Sessions and resend/expiry limits | Database sessions, CSRF, API limiters; Firebase provider controls real OTP; hashed limited demo challenges |
| Dashboard / profile / navigation | Named SPA routes, stats, responsive sidebar and own profile |
| Add food | Validated fields, optional photo, safe storage confirmation, GPS/manual map selection |
| Available food | Cards, search, diet/type, servings, expiry, nearest/expiry sort and 1/3/5/10 km distance filters |
| Leaflet / OSM / Haversine | `drawMap`, geolocation buttons, server Haversine filtering and accepted pickup directions |
| Precise location and phone privacy | Server-side response redaction, protected profile/admin user APIs |
| Food requests | Transactional creation and accept/reject/reserve/cancel/ready/collect actions |
| In-app chat | Protected REST messages; authenticated Socket.IO delivery |
| Notifications and expiry | Transactional history, private rooms, startup/minute expiry checks |
| Admin security | Verified phone + TOTP, server roles, protected APIs and one-hour sessions |
| Admin operations | Users, food moderation, request history, complaints/disputes, analytics, audits, CSV |
| Demonstration records | `sample-data.sql`, `seed.js`; distinct development identities |
| Installation / environment | `.env.example`, Docker Compose, README, Windows demo launcher |
| ER diagram | `docs/DATABASE.md` with Mermaid ER and lifecycle diagrams |
| Tests | API/security/concurrency suite and full browser flow; optional real MySQL test mode |

Production third-party connections require the owner’s Firebase, MySQL and Cloudinary settings. They are not replaced with mock integrations in the production path. The local demo is visibly labelled, binds to loopback, persists data in a relational database and cannot be enabled in production.
