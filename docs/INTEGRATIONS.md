# Integrations

Every external service sits behind an adapter in `src/integrations/<name>/`. Each adapter folder has the same shape:

```
types.ts    interface, provider-neutral DTOs, and <NAME>_ENV: which env vars each provider needs
mock.ts     the default: no network; writes to the Outbox table or the database
<provider>.ts  a real implementation (endpoints, headers, payloads, signature checks); throws NotConfiguredError
               naming the missing variables until they are set
index.ts    factory: reads <NAME>_PROVIDER and returns the adapter
```

Nothing outside `src/integrations/` knows which provider is active. To go live, set `<NAME>_PROVIDER` and the variables
listed for that provider; there are no code changes. **Admin → Settings → Integrations** shows each adapter's mode
(MOCK / LIVE), which variables are present or missing (names only, never values) and a **Send test** button.
`pnpm verify-env` prints the same table in a terminal.

| Integration | Variable            | Default  | Other providers                  |
| ----------- | ------------------- | -------- | -------------------------------- |
| Payments    | `PAYMENT_PROVIDER`  | `mock`   | `razorpay`, `payu`, `cashfree`   |
| Email       | `EMAIL_PROVIDER`    | `mock`   | `smtp`, `ses`, `resend`          |
| WhatsApp    | `WHATSAPP_PROVIDER` | `mock`   | `gupshup`, `interakt`, `meta`    |
| SMS         | `SMS_PROVIDER`      | `mock`   | `msg91`, `twilio`                |
| Storage     | `STORAGE_PROVIDER`  | `local`  | `s3` (AWS or any S3-compatible)  |
| Captcha     | `CAPTCHA_PROVIDER`  | `image`  | `turnstile`, `recaptcha`, `none` |
| Maps        | `MAPS_PROVIDER`     | `static` | `google`                         |
| Lead hook   | `LEAD_WEBHOOK_URL`  | off      | any HTTPS endpoint               |

## Payments

Interface: `createOrder`, `getCheckout`, `verifyPayment`, `handleWebhook`, `fetchPayment`, `refund`.

- **mock**: `createOrder` stores an order and returns `/mock-pay/[orderId]`, a believable gateway page (UPI, card,
  net banking) with **Succeed / Fail / Stay pending / Duplicate webhook**. It delivers an HMAC-signed event
  (`MOCK_WEBHOOK_SECRET`) through the same webhook handler a real gateway would hit, then returns the payer to the
  site. Allocation, receipts and emails run through the production code path.
- **razorpay** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`): orders API, checkout options,
  `razorpay_signature` HMAC-SHA256 verification, `payment.captured`, `payment.failed`, `refund.processed`.
- **payu** (`PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_ENV`) and **cashfree** (`CASHFREE_APP_ID`,
  `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`): the same interface, unconfigured until keys exist.

Webhooks are idempotent: each event is stored under a unique `(provider, eventId)` and each payment under its
`providerPaymentId`, so replays and races produce one receipt. Point the gateway's webhook at
`https://<your-domain>/api/payments/webhook/<provider>`.

To go live on payments: `PAYMENT_PROVIDER=razorpay` plus the three variables. That is the only change.

## Email, WhatsApp, SMS

All three send **template + variables** (templates live in `src/lib/messages/templates.ts`, rendered with React Email
for email), respect each contact's consent flags, and write every message to the `Outbox` table. In mock mode the
outbox is the delivery: read it at **Admin → Outbox** (or `/api/dev/outbox` in development). Failed live sends are
retried with exponential backoff by the `outbox-retry` cron. With a live email provider, the sign-in and
draft-resume links are removed from the stored copy once delivered (anyone who can read the Outbox could otherwise
use them); with the mock provider they stay, because the Outbox _is_ the mock inbox.

| Provider | Variables                                                        |
| -------- | ---------------------------------------------------------------- |
| smtp     | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| ses      | `AWS_REGION`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`             |
| resend   | `RESEND_API_KEY`, `EMAIL_FROM`                                   |
| gupshup  | `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE_NUMBER`, `GUPSHUP_APP_NAME`   |
| interakt | `INTERAKT_API_KEY`                                               |
| meta     | `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`                       |
| msg91    | `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`                              |
| twilio   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`         |

WhatsApp and SMS templates must be approved with the provider before live use (a regulatory requirement in India);
the template names and variables in code are the ones to register.

## Storage

Uploads (registration documents, staff certificates) use signed, expiring URLs, a type and size allow-list and
magic-byte sniffing. A virus-scan hook is a marked placeholder in the upload service.

- **local**: files in `.storage/` (outside `public/`, never served statically). On Vercel the disk is read-only, so
  files go to `/tmp`: fine for a demo, **not durable**.
- **s3**: AWS S3 or any S3-compatible store, using SigV4 presigned URLs (no SDK). Variables: `S3_BUCKET`,
  `AWS_REGION` (or `S3_REGION`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and for non-AWS stores
  `AWS_ENDPOINT_URL_S3` (or `S3_ENDPOINT`), which switches to path-style URLs. The browser uploads straight to the
  bucket, so the bucket needs a CORS rule allowing `PUT` from your site's origin (the site's Content-Security-Policy
  already allows the store's origin when `STORAGE_PROVIDER=s3`). Because the bytes never pass through the server,
  the browser calls `POST /api/uploads/complete` afterwards; the server fetches the file back, checks size and magic
  bytes, runs the scan hook and deletes anything that fails.

## Captcha

`image` (default) is self-generated: a server-signed token with an expiry, no third party. `turnstile` and
`recaptcha` verify tokens server-side (`TURNSTILE_SECRET_KEY` / `RECAPTCHA_SECRET_KEY`, plus
`NEXT_PUBLIC_CAPTCHA_SITE_KEY` for the widget). `none` disables it (used by the e2e server only).

## Lead and application webhook

Set `LEAD_WEBHOOK_URL` to receive a normalised JSON event for each lead or application change (`lead.created`,
`lead.status_changed`, `tour.booked`, `application.registered`, `application.stage_changed`,
`application.admitted`), so the school can attach Zoho, HubSpot or LeadSquared later. The body is signed:
`x-aurelia-signature: sha256=<HMAC of the raw body with LEAD_WEBHOOK_SECRET>`. Failures retry with backoff and are
visible in the Outbox.

## Scheduled jobs

`/api/cron/{late-fees,reminders,outbox-retry}` need `Authorization: Bearer $CRON_SECRET` (Vercel sends it
automatically when `CRON_SECRET` is set). Schedules are in `vercel.json`; any scheduler can call them. Each run is
recorded and listed under **Settings → Integrations**. See `docs/FEE_ENGINE.md` for what each job does.

## Analytics

Off by default and always gated by the cookie banner's consent: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA4_ID`,
`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_LINKEDIN_PARTNER_ID`, `NEXT_PUBLIC_CLARITY_ID`. Events are defined once in
`src/lib/analytics.ts`: `lead_submit`, `tour_book`, `registration_start`, `payment_start`, `payment_success`,
`whatsapp_click`, `brochure_download`, `vacancy_apply`.
