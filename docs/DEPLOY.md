# Deploying the sample to Vercel

Works with zero third-party accounts apart from Vercel and a Postgres database. Every integration (payments, email,
WhatsApp, SMS, captcha, storage) stays in mock mode.

## 1. Database

In the Vercel project: **Storage → Create Database → Neon (Postgres)** and connect it to the project for all
environments. This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`. Any other Postgres works — set
`DATABASE_URL` yourself.

## 2. Environment variables (Project → Settings → Environment Variables)

| Name                    | Value                               | Why                                                     |
| ----------------------- | ----------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`          | set by the Neon integration         | the app's database                                      |
| `AUTH_SECRET`           | output of `openssl rand -base64 32` | signs sessions, captcha, magic links (required in prod) |
| `CRON_SECRET`           | any long random string              | Vercel sends it to the scheduled jobs automatically     |
| `NEXT_PUBLIC_DEMO_MODE` | `true`                              | demo login picker, `/demo`, the "Sample build" ribbon   |

Everything else has a working default. `NEXT_PUBLIC_SITE_URL` falls back to the Vercel URL; set it once you add a
custom domain. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## 3. Deploy

Push to the branch. `package.json` has a `vercel-build` script (`scripts/vercel-build.mjs`) that Vercel runs instead
of `next build`:

1. `prisma migrate deploy` (uses `DATABASE_URL_UNPOOLED` when present),
2. seeds the demo school **only if the database has no users**,
3. `next build`.

Open `/login?demo=1` and pick a role. To reset the demo data, redeploy with `SEED_ON_BUILD=always` (wipes everything),
or use the reset action on `/demo`.

## Known limits on Vercel (fine for a demo)

- **Uploads** (registration documents) are written to `/tmp`, which is per-instance and not durable. Set
  `STORAGE_PROVIDER=s3` plus its variables for real use.
- **Cron:** the Hobby plan only runs daily jobs, so the outbox retry is scheduled once a day (`vercel.json`).
- **Mock payments** work as-is; the fake gateway delivers its signed webhook in-process.
