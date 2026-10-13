# REST API

All endpoints are under `/api`. Responses are JSON unless the endpoint exports CSV. Errors use `{ "error": "Readable message" }` and HTTP 400/401/403/404/409/429/500. Authenticated requests use the HttpOnly `foodsaver_session` cookie. Mutations require the exact configured `Origin`; authenticated mutations also require `X-CSRF-Token`, returned by login and `/auth/me`. Use credentials when calling from a browser.

| Method | Route | Access / behavior |
| --- | --- | --- |
| GET | /config | Public Firebase web config and demo flag; no private secrets |
| GET | /health | DB connection readiness |
| POST | /auth/demo/otp | Loopback demo only; phone_number → challenge and clearly labelled simulated code |
| POST | /auth/login | Verified Firebase id_token; new account full_name/email/optional coordinates; optional admin=true and totp |
| GET | /auth/me | Current user, CSRF token and admin verification flag |
| POST | /auth/logout | Revoke session and disconnect its sockets |
| PATCH | /profile | Own full_name, optional email, coordinates or null |
| GET | /food | Active, non-expired food; q, category, type, radius, people, hours, sort, lat, lng filters |
| GET | /food/:id | Food detail; precise address only for owner or accepted receiver |
| POST | /food | Multipart image (optional) and validated donation fields; JSON works without image |
| POST | /food/:id/request | Request food; rejects self-request, duplicates and expired/unavailable food |
| POST | /food/:id/cancel | Donor or verified admin cancels and notifies requesters |
| GET | /my/donations | Own full donation history |
| GET | /my/requests | Sent requests and requests received for own donations |
| POST | /requests/:id/accept | Donor; transactional reservation |
| POST | /requests/:id/reject | Donor; pending only |
| POST | /requests/:id/ready | Donor; notify accepted requester |
| POST | /requests/:id/collect | Donor; confirm handover and close donation |
| POST | /requests/:id/cancel | Receiver; cancel own pending/accepted request |
| GET / POST | /requests/:id/messages | Accepted participants only; POST body message_text; completed chat is read-only |
| GET | /notifications | Own latest 100 notifications |
| POST | /notifications/read | Mark own notifications as read |
| GET | /stats | Available/completed counts, own active requests, nearby donations |
| POST | /reports | reason plus food_id and/or reported_user_id |
| GET | /admin/overview | Counts, daily/monthly activity, completed servings, areas and user growth |
| GET | /admin/users | User search using q |
| PATCH | /admin/users/:id | account_status active/suspended; revoke sessions on suspension |
| GET | /admin/food | Moderation listings |
| GET | /admin/requests | Request and handover history |
| GET | /admin/reports | Complaints and pickup disputes |
| PATCH | /admin/reports/:id | Resolve complaint with audit log |
| GET | /admin/audit | Latest 200 admin actions |
| GET | /admin/export | type=food, users, requests; CSV with formula-injection protection |

Admin routes require both a database admin role and an admin session created after second-factor verification. Every session load rechecks account status from the database. User phone numbers are returned only in the user’s own profile or the authorized admin users endpoint.

Donation fields: `food_name`, `category` (`Veg` / `Non-Veg`), `food_type` (`Cooked meals`, `Bakery`, `Produce`, `Packaged food`, `Other`), `quantity`, `people_count`, `description`, `prepared_at`, `expires_at` (ISO timestamps), `pickup_area`, `pickup_address`, `latitude`, `longitude`, `safe_storage=true`. Contact is private in-app chat. The frontend sends `has_image=true` when a file is selected so rejected file types cannot silently discard the chosen image.

Distance filters allow 1, 3, 5 or 10 km and require an explicit or saved location. Raw coordinates are validated server-side. Public coordinates are rounded after distance calculations; no precise address, email or phone is exposed by public food APIs.

## Socket.IO

The browser connects with its session cookie and `auth: { csrf }`. The server validates the session and CSRF token before joining the authenticated user room; browsers cannot choose rooms. Origin is checked when supplied. Sessions are revalidated every minute and explicitly disconnected on logout or suspension.

Events: `notification` sends a stored private notification to its owner; `listings:changed` prompts clients to refresh; `chat:message` delivers a newly stored message to its two participants. Chat sends use the validated REST endpoint. No phone numbers, private addresses or GPS coordinates are broadcast in global events.
