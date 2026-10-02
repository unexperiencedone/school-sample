# Aurelia Hall School — sample build

A public website, a school CRM and a parent portal for a **fictional** all-girls British-curriculum day and boarding
school (ages 4–18). It exists to be shown: everything is original sample content, payments run on a mock gateway, and
email, WhatsApp and SMS go to an outbox instead of being sent. Nothing needs an external account.

- **Public website**: admissions, fees, academics, boarding, events, blog, careers, search, a 360° tour, enquiry and
  campus-tour forms, online registration with payment.
- **CRM at `/admin`** (14 modules, 8 staff roles): leads and tours, admissions pipeline, academic structure, students,
  a versioned fee engine with payments, refunds and bank reconciliation, pocket money, hiring, communications, content,
  reports with CSV/XLSX export, and settings with an audit log.
- **Parent portal at `/portal`**: switch between children, pay fees, receipts, pocket-money top-ups, circulars,
  requests, consent and privacy.

## Five-minute start

```bash
pnpm i                       # also creates .env from .env.example (all values are safe local defaults)
docker compose up -d         # Postgres 16 on :5432
pnpm db:migrate
pnpm db:seed                 # ~35 s: 240 pupils, 60 leads, 25 applications, 12 vacancies, 20 staff applications…
pnpm dev                     # http://localhost:3000
```

Then open **`/login?demo=1`** and pick a role (one click, no password), or **`/demo`** for ten guided moments that sign
you in as the right person and open the right screen. The talking points are in `docs/DEMO_SCRIPT.md`.

Needs Node 20+ and pnpm 10.

## Putting it online

Deploy to Vercel with a Postgres database (Neon works) and four environment variables: see **`docs/DEPLOY.md`**. The
build applies migrations and loads the demo school by itself.

## Scripts

| Command                                    | What it does                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`             | Next.js                                                                         |
| `pnpm db:migrate`                          | Apply migrations (`db:migrate:dev` to create one)                               |
| `pnpm db:seed`                             | Wipe and rebuild the sample school (deterministic)                              |
| `pnpm db:snapshot`                         | Regenerate `prisma/snapshot/demo.sql.gz`, which deploys load instead of seeding |
| `pnpm test`                                | Unit tests (Vitest): fee engine, money, reconciliation, reports, rules…         |
| `pnpm e2e`                                 | Playwright: every flow, plus axe accessibility checks in light and dark         |
| `pnpm lint` / `typecheck` / `format:check` | Static checks (also run on commit)                                              |
| `pnpm verify-env`                          | Which integrations are mock or live, and which variables are missing            |
| `pnpm api:docs`                            | Regenerate the OpenAPI document and endpoint index from the route handlers      |

`pnpm e2e` starts its own server on port 3100 and reseeds the database first (`E2E_SKIP_SEED=1` skips that). It uses the
database in `.env`, so point `DATABASE_URL` at a local one.

## Going live on real services

Every integration has a mock default and a real implementation behind the same interface. Setting
`PAYMENT_PROVIDER=razorpay` plus its three variables is the only change needed to take real payments; email, WhatsApp,
SMS, storage and captcha work the same way. **Admin → Settings → Integrations** shows what is mock and what is live.
See `docs/INTEGRATIONS.md`.

## Documentation

| Doc                     | What is in it                                                       |
| ----------------------- | ------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`  | Layers, auth, the roles and permissions matrix, data model, jobs    |
| `docs/FEE_ENGINE.md`    | How invoices, payments, late fees, revisions and refunds work       |
| `docs/INTEGRATIONS.md`  | Adapters, environment variables, going live                         |
| `docs/API.md`           | REST conventions, examples and every endpoint (`/api/openapi.json`) |
| `docs/DEPLOY.md`        | Vercel + Neon, environment variables, known limits                  |
| `docs/DEMO_SCRIPT.md`   | The ten moments, with talking points                                |
| `docs/DESIGN_SYSTEM.md` | Tokens, components, charts, accessibility rules                     |
| `docs/CONTENT_GUIDE.md` | Editing pages, posts and structured content                         |
| `docs/DECISIONS.md`     | Choices made where the brief was silent                             |
| `docs/CREDITS.md`       | Image and font credits                                              |

## Built with

Next.js 15 (App Router, Server Actions) · TypeScript (strict) · Tailwind CSS with CSS-variable tokens · Prisma and
Postgres · Auth.js · Zod · React Email · `@react-pdf/renderer` · exceljs · Vitest · Playwright with axe.

Money is stored as integer paise, dates are reckoned in IST, and sensitive actions (fee revisions, refunds, exports,
medical-record views, role changes) are enforced in the service layer and recorded in the audit log.

## A note on the content

"Aurelia Hall", its people, places, fees and statistics are invented. Contacts use reserved test domains and
placeholder numbers. A "Sample build" tab appears on every page while `NEXT_PUBLIC_DEMO_MODE=true`.
