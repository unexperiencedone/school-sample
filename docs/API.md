# API

REST route handlers under `src/app/api/`. The machine-readable description is served at **`/api/openapi.json`**
(OpenAPI 3.1, generated from the handlers by `pnpm api:docs`, so it cannot drift; a unit test fails if the committed
copy is stale). Import it into Postman, Bruno or Insomnia to get a collection.

## Conventions

- **Errors** always use one envelope, with the HTTP status set accordingly:

  ```json
  {
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Some fields need attention",
      "details": { "fieldErrors": { "phone": ["Enter a 10-digit Indian mobile number"] } }
    }
  }
  ```

  Common codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_FAILED` (422),
  `RATE_LIMITED` (429), `NOT_CONFIGURED` (503, an integration has no keys), `INTERNAL` (500).

- **Auth.** Public endpoints (forms, captcha, search, events) need nothing. `/api/admin/*` needs a staff session cookie
  and the permission named in the index below (the matrix is in `docs/ARCHITECTURE.md`); `/api/portal`-style parent
  data is served by pages and the endpoints marked _signed in_. Cron endpoints need `Authorization: Bearer $CRON_SECRET`.
  Gateway webhooks are verified against the provider's signature, not a session.
- **Money** is integer **paise** (`150000` = ₹1,500.00). Dates are ISO 8601; school days are reckoned in IST.
- **Pagination** on lists is cursor-based: `?take=50&after=<cursor>` (or `before`), responses carry
  `{ data: [...], page: { next, prev, total } }`. Filters are query parameters (`?status=…&q=…`); sorting is
  `?sort=field&dir=asc|desc`.
- **Idempotency.** Anything that moves money takes an `idempotencyKey`; repeating a request with the same key returns
  the original result, and reusing a key for a _different_ payment returns `409 IDEMPOTENCY_CONFLICT`.
- **Spam protection** on public forms: a hidden honeypot field (`website`), a captcha (`captchaToken`,
  `captchaAnswer`) and per-IP rate limits.

## Examples

### Submit an enquiry — `POST /api/leads`

```http
POST /api/leads
Content-Type: application/json

{
  "type": "ENQUIRY",
  "source": "drawer",
  "parentName": "Meera Nair",
  "phone": "+91 98765 43210",
  "email": "meera@example.test",
  "childName": "Aadhya",
  "classApplying": "Year 4",
  "preferredBoarding": "full",
  "consent": true,
  "captchaToken": "…",
  "captchaAnswer": "7K3F"
}
```

```json
{ "ref": "ENQ-2026-00123", "tour": null, "duplicate": false }
```

`201` for a new lead, `200` with `"duplicate": true` when the same family just submitted. `"type": "TOUR"` with `preferredDate` (a future weekday or Saturday), `preferredSlot` (`09:30`, `11:30` or `14:30`) and `visitors` (1–4) books a campus tour, and `tour` then describes the booking. A confirmation email lands in the Outbox, the lead appears in `/admin/leads`, and (if configured) the lead webhook
fires. `GET /api/captcha` issues the token and the image.

### Take a payment — `POST /api/payments/orders`, then the gateway, then the webhook

```http
POST /api/payments/orders
{ "instalmentId": "cm…", "idempotencyKey": "pay-7f3c…" }
```

```json
{
  "orderId": "mock_order_abc",
  "amountPaise": 9650000,
  "checkout": { "type": "redirect", "url": "/mock-pay/mock_order_abc" }
}
```

The payer completes checkout; the gateway calls `POST /api/payments/webhook/<provider>` with a signed body. The first
delivery records the payment, allocates it, issues a gap-free receipt and emails it; replays return `200` and change
nothing. `GET /api/payments/status?order=…` lets the return page poll until the webhook has landed.

### List leads — `GET /api/admin/leads`

```http
GET /api/admin/leads?status=NEW&q=nair&take=25
```

```json
{
  "data": [
    {
      "id": "cm…",
      "parentName": "Meera Nair",
      "status": "NEW",
      "source": "drawer",
      "createdAt": "2026-10-01T09:12:00.000Z"
    }
  ],
  "page": { "next": "eyJ…", "prev": null, "total": 14 }
}
```

### Export a report — `GET /api/admin/reports/{report}`

```http
GET /api/admin/reports/outstanding?format=xlsx&year=2026-27
```

Returns a `.xlsx` (or `format=csv`, UTF-8 with BOM). Reports: `collections`, `outstanding`, `funnel`, `sources`,
`seats`. Needs `reports:export`; every export is audit-logged with its filters.

### Scheduled jobs — `GET|POST /api/cron/{job}`

```http
POST /api/cron/late-fees
Authorization: Bearer <CRON_SECRET>
```

```json
{ "job": "late-fees", "ok": true, "ms": 412, "result": { "charged": 12, "flagged": 2, "forfeited": 1 } }
```

Jobs: `late-fees`, `reminders`, `outbox-retry`. All are idempotent. See `docs/FEE_ENGINE.md`.

## Endpoint index

Generated from the route handlers. Do not edit between the markers; run `pnpm api:docs`.

<!-- endpoints:start -->

| Method   | Path                                            | Access               | What it does                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/applications`                       | `applications:read`  | Cursor-paginated list; filter with ?stage=&class=&year=&q=, sort with ?sort=&dir=                                                                                                                                                                                                                                                                                                                         |
| `GET`    | `/api/admin/applications/{id}`                  | `applications:read`  | Application with documents and timeline                                                                                                                                                                                                                                                                                                                                                                   |
| `PATCH`  | `/api/admin/applications/{id}`                  | `applications:write` | Move stage (validated state machine; decisions need applications:decide)                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/applications/{id}/offer-letter`     | `applications:read`  | Offer letter PDF (staff)                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/audit-logs`                         | `audit:read`         | Cursor-paginated, newest first. `from`/`to` are IST dates (YYYY-MM-DD). Rows carry a redacted list of changed fields, never the raw before/after JSON                                                                                                                                                                                                                                                     |
| `GET`    | `/api/admin/audit-logs/export`                  | `audit:read`         | The filtered log as CSV (same filters as the list). Audit-logged as `audit.export`                                                                                                                                                                                                                                                                                                                        |
| `GET`    | `/api/admin/blog/{id}/mdx`                      | `content:write`      | The draft as an .mdx file for content/blog                                                                                                                                                                                                                                                                                                                                                                |
| `GET`    | `/api/admin/dues/export`                        | `fees:read`          | The dues view as CSV (formula-safe), audit-logged                                                                                                                                                                                                                                                                                                                                                         |
| `POST`   | `/api/admin/integrations/{key}/test`            | `settings:write`     | Runs the adapter's self-test (email goes to the caller's own address; whatsapp and sms need `{ "phone": "+91 …" }`). Returns `{ ok, message, ms }`; a failed test is a 200 with ok false                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/integrations/status`                | `settings:read`      | Each adapter's mode (MOCK / LIVE / OFF), whether its variables are set (names only, never values) and the last runs of every scheduled job                                                                                                                                                                                                                                                                |
| `GET`    | `/api/admin/leads`                              | `leads:read`         | Cursor-paginated list; same filters as the CRM inbox                                                                                                                                                                                                                                                                                                                                                      |
| `POST`   | `/api/admin/leads`                              | `leads:write`        | Staff create a lead from a walk-in or phone call (no captcha)                                                                                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/admin/leads/{id}`                         | `leads:read`         | Lead with activities, bookings and reminders                                                                                                                                                                                                                                                                                                                                                              |
| `PATCH`  | `/api/admin/leads/{id}`                         | `leads:write`        | Status, assignment, follow-up date. Assignment needs leads:assign                                                                                                                                                                                                                                                                                                                                         |
| `GET`    | `/api/admin/leads/export`                       | `leads:export`       | CSV export (elevated permission, audit-logged)                                                                                                                                                                                                                                                                                                                                                            |
| `GET`    | `/api/admin/outbox`                             | `comms:read`         | Sent/failed messages (bodies omitted)                                                                                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/admin/privacy`                            | `privacy:manage`     | The privacy request queue                                                                                                                                                                                                                                                                                                                                                                                 |
| `PATCH`  | `/api/admin/privacy/{id}`                       | `privacy:manage`     | `{ status: "DONE"                                                                                                                                                                                                                                                                                                                                                                                         | "REJECTED", notes }` closes an open request. Audit-logged |
| `GET`    | `/api/admin/privacy/{id}/bundle`                | `privacy:manage`     | Everything held about the subject of an EXPORT request, as a JSON download. Medical records, internal notes and credentials are never included. Each download is audit-logged as `privacy.bundle`                                                                                                                                                                                                         |
| `GET`    | `/api/admin/reconciliation/sample`              | `reconciliation:run` | A realistic bank statement built from recent offline payments (demo aid)                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/reports/{report}`                   | `reports:export`     | The same tables as the report page. Needs reports:export; every download is audit-logged with its filter                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/search`                             | `dashboard:view`     | Role-aware global search over students, leads and applications                                                                                                                                                                                                                                                                                                                                            |
| `GET`    | `/api/admin/settings`                           | `settings:read`      | The school profile (saved settings over the static defaults)                                                                                                                                                                                                                                                                                                                                              |
| `PUT`    | `/api/admin/settings`                           | `settings:write`     | Replaces the school profile. Money is integer paise                                                                                                                                                                                                                                                                                                                                                       |
| `GET`    | `/api/admin/staff-applications`                 | `careers:read`       | Cursor-paginated, submitted applications only (drafts are never listed). Rows omit the application form itself; fetch /api/admin/staff-applications/[id] for that                                                                                                                                                                                                                                         |
| `GET`    | `/api/admin/staff-applications/{id}`            | `careers:read`       | The whole application with its scorecard and notes                                                                                                                                                                                                                                                                                                                                                        |
| `PATCH`  | `/api/admin/staff-applications/{id}`            | `careers:write`      | `status` (+ `reason`, required for REJECTED), `scorecard` (five ratings 1–5 and an optional `comment`; the total becomes `score`) and/or `note`. Applied in that order                                                                                                                                                                                                                                    |
| `GET`    | `/api/admin/staff-applications/{id}/pdf`        | `careers:read`       | The application as a PDF. Needs careers:read; each download is audit-logged                                                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/admin/students/{id}/id-card`              | `students:read`      | CR80 ID card                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET`    | `/api/admin/students/export`                    | `students:export`    | The filtered directory as CSV. Contact details only; never medical data. Exports are a SENSITIVE action and audit-logged with the filter used                                                                                                                                                                                                                                                             |
| `GET`    | `/api/admin/tours`                              | `tours:read`         | Upcoming slots with bookings                                                                                                                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/admin/tours`                              | `tours:write`        | Create slots: { dates: ["2026-10-12"], times: ["09:30"], capacity: 6, label }                                                                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/admin/users`                              | `users:manage`       | Staff accounts (parents and applicants are not listed)                                                                                                                                                                                                                                                                                                                                                    |
| `POST`   | `/api/admin/users`                              | `users:manage`       | Invites a staff member: creates the account and emails a sign-in link                                                                                                                                                                                                                                                                                                                                     |
| `PATCH`  | `/api/admin/users/{id}`                         | `users:manage`       | `{ role, reason }` changes a staff role; `{ active, reason }` switches access on or off                                                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/admin/vacancies`                          | `careers:read`       | Every vacancy with its application counts                                                                                                                                                                                                                                                                                                                                                                 |
| `POST`   | `/api/admin/vacancies`                          | `careers:write`      | Create a vacancy. `requirements` is an array of strings (or one per line), `closesAt` is a calendar date (yyyy-mm-dd, end of that day in IST). Validated in the service                                                                                                                                                                                                                                   |
| `GET`    | `/api/admin/vacancies/{id}`                     | `careers:read`       | One vacancy with its application counts                                                                                                                                                                                                                                                                                                                                                                   |
| `PATCH`  | `/api/admin/vacancies/{id}`                     | `careers:write`      | Any subset of the vacancy fields, including `status` to close or reopen                                                                                                                                                                                                                                                                                                                                   |
| `DELETE` | `/api/admin/vacancies/{id}`                     | `careers:write`      | Only while the vacancy has no applications                                                                                                                                                                                                                                                                                                                                                                |
| `GET`    | `/api/applicant/applications/{id}/offer-letter` | signed in            | The family's own offer letter                                                                                                                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/captcha`                                  | public               | Issues an image challenge (image provider) or tells the client which widget to render                                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/cron/{job}`                               | cron secret          | Runs a scheduled job (the method Vercel Cron uses). Needs the cron secret as a bearer token                                                                                                                                                                                                                                                                                                               |
| `POST`   | `/api/cron/{job}`                               | cron secret          | Runs a scheduled job from any other scheduler. Needs the cron secret as a bearer token                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/dev/outbox`                               | public               | Latest 50 outbox messages as JSON (dev/demo only), so you can click mock magic links. Each item links to /api/dev/outbox/[id] which renders the email HTML                                                                                                                                                                                                                                                |
| `GET`    | `/api/dev/outbox/{id}`                          | public               | Renders one mock email (dev/demo only). Sandboxed via CSP                                                                                                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/events`                                   | public               | Upcoming public events (Open Mornings, talks, concerts)                                                                                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/files`                                    | public               | Serves a stored file for a signed, short-lived download link (issued after an access check)                                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/invoices/{id}/pdf`                        | signed in            | The fee invoice PDF for finance staff or the pupil's guardians                                                                                                                                                                                                                                                                                                                                            |
| `POST`   | `/api/leads`                                    | public               | Enquiry or campus-tour booking from any public placement. Zod validation · honeypot · captcha · 5 requests / 10 min / IP · double-submit protection                                                                                                                                                                                                                                                       |
| `POST`   | `/api/newsletter`                               | public               | Double-submit safe (upsert), honeypot, rate limited                                                                                                                                                                                                                                                                                                                                                       |
| `GET`    | `/api/openapi.json`                             | public               | OpenAPI 3.1 description of this API (generated from the route handlers)                                                                                                                                                                                                                                                                                                                                   |
| `POST`   | `/api/payments/imprest-topup`                   | signed in            | A guardian tops up a boarder's pocket money through the gateway                                                                                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/payments/orders`                          | signed in            | Create a gateway order for an invoice, an instalment, or a custom amount                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/payments/status`                          | public               | Minimal order status for the return page poller (no personal data)                                                                                                                                                                                                                                                                                                                                        |
| `POST`   | `/api/payments/verify`                          | public               | Client-return verification (order id, payment id, signature)                                                                                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/payments/webhook/{provider}`              | gateway signature    | Signed gateway webhooks. Reads the RAW body (signatures are over raw bytes), verifies the signature, and applies events idempotently. Always 2xx for duplicates so gateways stop retrying                                                                                                                                                                                                                 |
| `GET`    | `/api/receipts/{id}`                            | signed in            | PDF for finance staff, the pupil's guardians, or the paying applicant                                                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/registration`                             | public               | Create a draft application from step 1 (child). Returns { id, ref, draftToken }                                                                                                                                                                                                                                                                                                                           |
| `PATCH`  | `/api/registration`                             | public               | Save a later step (parents, boarding, declaration) of the draft; needs the draft token                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/registration/{id}/documents`              | public               | Current document status for the application                                                                                                                                                                                                                                                                                                                                                               |
| `POST`   | `/api/registration/{id}/documents`              | public               | Returns a signed upload target for one document slot                                                                                                                                                                                                                                                                                                                                                      |
| `POST`   | `/api/registration/{id}/pay`                    | public               | Validates the draft is complete and creates the registration-fee order                                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/search`                                   | public               | The whole public content index (small), searched client-side on /search                                                                                                                                                                                                                                                                                                                                   |
| `POST`   | `/api/staff-applications`                       | public               | Save one step of the public staff application, or submit it. - First save (no `id`, step 1): creates the draft; the response carries `resumeToken` once. - Later saves and submit need `id` + `token`; each step is validated with the same schemas as the form. - Submit validates every step (422 INCOMPLETE with per-step issues) and checks the captcha. - The honeypot (`website`) silently succeeds |
| `GET`    | `/api/staff-applications/{id}`                  | public               | The saved draft (or just the status once submitted)                                                                                                                                                                                                                                                                                                                                                       |
| `POST`   | `/api/staff-applications/{id}/documents`        | public               | Signed upload target for one certificate (header x-resume-token). The browser PUTs the file to the returned URL and keeps the returned `key` in its education row                                                                                                                                                                                                                                         |
| `POST`   | `/api/uploads/complete`                         | public               | Called by the browser after it uploaded straight to the object store (S3). The server fetches the file back, checks its size and magic bytes and runs the scan hook; a bad file is deleted                                                                                                                                                                                                                |
| `PUT`    | `/api/uploads/local`                            | public               | Receiver for the local storage adapter's signed upload URLs                                                                                                                                                                                                                                                                                                                                               |

<!-- endpoints:end -->
