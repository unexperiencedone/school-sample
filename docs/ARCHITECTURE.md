# Architecture

Aurelia Hall is one Next.js 15 (App Router) codebase with three faces:

| Area             | Path                | Audience                             | Rendering                                     |
| ---------------- | ------------------- | ------------------------------------ | --------------------------------------------- |
| Public website   | `src/app/(site)`    | Families, candidates, search engines | Server components, static where possible      |
| School CRM / ERP | `src/app/admin`     | Staff (8 roles)                      | Server components + server actions, `noindex` |
| Parent portal    | `src/app/portal`    | Parents                              | Server components + server actions, `noindex` |
| Applicant area   | `src/app/applicant` | Families mid-admission               | Server components, `noindex`                  |
| Mock gateway     | `src/app/mock-pay`  | Demo only                            | Fake checkout that posts signed webhooks      |
| REST API         | `src/app/api`       | Integrations, forms, cron            | Route handlers (documented in `docs/API.md`)  |

## Layers

```
UI (components/site, components/crm, components/forms, components/ui)
  │  React Server Components read through services; client components post to
  │  server actions or REST route handlers.
  ▼
Server actions / route handlers   — validate with Zod (src/lib/schemas), authorise with RBAC
  ▼
Domain services (src/lib/*)       — leads, admissions, fees, payments, students, careers, notify
  │      └─ fee engine (src/lib/fee-engine) — pure functions, no I/O, exhaustively unit tested
  ▼
Prisma (src/lib/db.ts) → Postgres       Integrations (src/integrations/*) → adapters (mock by default)
```

Rules the code follows:

- **Money is integer paise** everywhere (`src/lib/money.ts`). Percentages are basis points.
- **Every mutation is authorised on the server** (`actionUser(permission)` / `route(handler, { permission })`). Hiding a button is never the control.
- **Sensitive actions write an audit row** (`src/lib/audit.ts`) in the same transaction as the change, with a reason.
- **Everything external sits behind an adapter** (`src/integrations/<name>`) selected by an env var; mocks need no network.
- **All outbound messages go through `src/lib/notify.ts`** which renders the template, writes an `Outbox` row (the mock inbox and the audit trail), checks consent, then dispatches.

## Request flow examples

**Enquiry** → `POST /api/leads` → Zod + honeypot + captcha + rate limit → `Lead` row (with first-touch UTM) → `enquiry-received` email/WhatsApp via notify → optional signed CRM webhook → appears in `/admin/leads`.

**Fee payment** → portal "Pay now" → `POST /api/payments/orders` (idempotency key) → adapter `createOrder` → checkout (mock: `/mock-pay/[orderId]`) → gateway posts signed webhook to `/api/payments/webhook/[provider]` → `WebhookEvent` row (unique `provider+eventId`: replays are ignored) → `Payment` (unique `providerPaymentId`) → allocation oldest-due-first → wallet credit for overpayment → gap-free receipt number → receipt email.

## Auth

Auth.js v5, JWT sessions (12 h), Prisma adapter for magic-link tokens.

- Credentials (argon2id hashes, rate-limited), email magic link (only for existing accounts — no self sign-up), and a demo provider that only works when `NEXT_PUBLIC_DEMO_MODE=true`.
- `src/middleware.ts` does coarse, edge-safe gating of `/admin`, `/portal`, `/applicant`.
- `getCurrentUser()` re-reads the user from the database on every request, so deactivating a user takes effect immediately.

## Roles and permissions

Source of truth: `src/lib/rbac.ts` (tested in `tests/unit/rbac.test.ts`). Regenerate this table with `pnpm tsx scripts/rbac-matrix.ts`.
⚠︎ marks sensitive permissions: they always require a reason and write an audit entry.

SA Super admin · PRN Principal · ADM Admissions · ACC Accounts · REG Registrar · TCH Teacher · HSP Houseparent · HR · PAR Parent · APP Applicant

| Permission              | SA  | PRN | ADM | ACC | REG | TCH | HSP | HR  | PAR | APP |
| ----------------------- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard:view`        |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |
| `leads:read`            |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `leads:write`           |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `leads:assign`          |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `leads:merge`           |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `leads:export` ⚠︎        |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `tours:read`            |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `tours:write`           |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `applications:read`     |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |     |     |     |
| `applications:write`    |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `applications:decide`   |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `academics:read`        |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |     |
| `academics:write`       |  ●  |  ●  |     |     |  ●  |     |     |     |     |     |
| `students:read`         |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |     |
| `students:write`        |  ●  |  ●  |     |     |  ●  |     |     |     |     |     |
| `students:promote`      |  ●  |  ●  |     |     |  ●  |     |     |     |     |     |
| `students:medical`      |  ●  |  ●  |     |     |  ●  |     |  ●  |     |     |     |
| `students:export` ⚠︎     |  ●  |  ●  |     |     |  ●  |     |     |     |     |     |
| `students:delete` ⚠︎     |  ●  |     |     |     |     |     |     |     |     |     |
| `fees:read`             |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |     |     |     |
| `fees:revise` ⚠︎         |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `fees:waive` ⚠︎          |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `invoices:write`        |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `concessions:request`   |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `concessions:approve` ⚠︎ |  ●  |  ●  |     |     |     |     |     |     |     |     |
| `payments:read`         |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `payments:record`       |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `refunds:request`       |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `refunds:approve` ⚠︎     |  ●  |  ●  |     |     |     |     |     |     |     |     |
| `reconciliation:run`    |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `imprest:read`          |  ●  |  ●  |     |  ●  |     |     |  ●  |     |     |     |
| `imprest:write`         |  ●  |  ●  |     |  ●  |     |     |  ●  |     |     |     |
| `careers:read`          |  ●  |  ●  |     |     |     |     |     |  ●  |     |     |
| `careers:write`         |  ●  |  ●  |     |     |     |     |     |  ●  |     |     |
| `comms:read`            |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |
| `comms:send`            |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |  ●  |     |     |
| `content:write`         |  ●  |  ●  |  ●  |     |     |     |     |     |     |     |
| `reports:read`          |  ●  |  ●  |  ●  |  ●  |  ●  |     |     |  ●  |     |     |
| `reports:export` ⚠︎      |  ●  |  ●  |     |  ●  |     |     |     |     |     |     |
| `settings:read`         |  ●  |  ●  |     |     |     |     |     |     |     |     |
| `settings:write`        |  ●  |     |     |     |     |     |     |     |     |     |
| `users:manage` ⚠︎        |  ●  |     |     |     |     |     |     |     |     |     |
| `audit:read`            |  ●  |  ●  |     |     |     |     |     |     |     |     |
| `privacy:manage` ⚠︎      |  ●  |     |     |     |     |     |     |     |     |     |
| `demo:reset`            |  ●  |     |     |     |     |     |     |     |     |     |
| `portal:access`         |     |     |     |     |     |     |     |     |  ●  |     |
| `applicant:access`      |     |     |     |     |     |     |     |     |     |  ●  |

Notable design choices in the matrix:

- **Separation of duties:** Accounts can _request_ refunds and concessions; only Principal/Super admin can _approve_ them.
- **Medical data** (`students:medical`) is field-level: Registrar, Houseparent, Principal and Super admin only. Others see that a record exists, not its content.
- **Exports** of personal data are elevated and audit-logged.

## Data model

`prisma/schema.prisma` is grouped into: auth & access · academic structure · students & guardians · leads, tours & events · admissions · fees · payments · imprest · portal requests · careers · communication & content.

Key invariants enforced by the schema:

| Invariant                              | How                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A webhook is processed once            | `WebhookEvent @@unique([provider, eventId])`                                                                                         |
| A gateway payment is recorded once     | `Payment.providerPaymentId @unique`                                                                                                  |
| Order creation is idempotent           | `PaymentOrder.idempotencyKey @unique`                                                                                                |
| Receipt numbers are gap-free per FY    | `ReceiptSequence` row incremented inside the payment transaction; `Receipt @@unique([financialYear, seq])`                           |
| Fee revisions never mutate history     | `FeeStructure` is versioned (`@@unique([yearId, band, boardingType, version])`); invoices point at the version they were priced from |
| Captcha / resume tokens are single use | `UsedToken` table                                                                                                                    |

## Background jobs

Plain route handlers protected by `CRON_SECRET` (call them from any scheduler — Vercel Cron, GitHub Actions, systemd timer):

- `POST /api/cron/late-fees` — nightly late-fee computation (idempotent) and rebate forfeiture
- `POST /api/cron/reminders` — tour reminders, upcoming/overdue fee reminders
- `POST /api/cron/outbox-retry` — retries failed messages and webhooks with backoff

## Directory map

```
src/app/(site)       public pages        src/lib/fee-engine   pure fee maths
src/app/(auth)       login               src/lib/schemas      Zod schemas shared by client and server
src/app/admin        CRM                 src/lib/services     domain services (DB + rules)
src/app/portal       parent portal       src/integrations     adapters (payments, email, …)
src/app/api          REST                src/emails           React Email layout
content/             MDX + JSON content  prisma/seed          deterministic demo data
```
