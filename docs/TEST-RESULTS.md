# Verification record

Verified on 12 October 2026 using Node.js 24.19.0 and installed Chrome on Windows.

| Check | Result |
| --- | --- |
| JavaScript syntax across server, frontend, scripts and tests | Pass |
| API integration/security tests | 10 tests passed, 0 failed |
| Local SQLite relational database writes | Pass |
| OTP hash, expiry, retries, cooldown, single-use and uniqueness | Pass |
| Authentication, CSRF and origin boundaries | Pass |
| Food creation and invalid safety/time/GPS rejection | Pass |
| Haversine distance and nearby filters | Pass |
| Public location/phone privacy | Pass |
| Competing accepts reserve exactly one request | Pass |
| Accepted requester pickup access and private chat | Pass |
| Food expiry, notification storage and handover completion | Pass |
| Admin role checks, suspension, session revocation and audit | Pass |
| TOTP RFC vector and CSV formula protection | Pass |
| Browser OTP login → donation → search → request → acceptance → live chat → collection | Pass |
| Browser admin authentication, users and analytics | Pass |
| Browser map, donations, notifications and profile | Pass |
| Mobile dashboard at 390 px: no horizontal overflow | Pass |
| Uncaught browser JavaScript errors during the completed workflow | None |

Screenshots are delivered alongside the project as `FoodSaver-desktop.png` and `FoodSaver-mobile.png`. The browser test also creates `browser-results.json`.

## Service-specific limits

Firebase service credentials and real SMS delivery were not supplied. Production code integrates Firebase reCAPTCHA/phone confirmation and Admin SDK token validation, but live provider authentication was not exercised. Cloudinary credentials were not supplied; the production signed upload integration was not exercised. The local demo uses validated local image storage.

There was no running MySQL server in the workspace. Docker was installed but its Linux engine did not become available. MySQL schema, pooled parameterized operations and row-lock transactions are provided; this verification used the shared service logic on SQLite. **Do not treat the passing SQLite reservation test as proof of a live MySQL deployment.**

To run the same API suite against MySQL, create an empty dedicated database whose name ends in `_test`, grant the test user privileges on it, and set `TEST_MYSQL=true`, `MYSQL_DATABASE=foodsaver_test`, and the usual `MYSQL_*` connection variables. Then run `npm test`. The suite refuses a nonempty test database and will not drop tables automatically. Use a fresh test database for each run.

No public production service was deployed. The local application preview and complete deployable Node/MySQL source are the delivered results.
