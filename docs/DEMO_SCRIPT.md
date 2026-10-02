# Demo script

A guided walk through the sample build for a school leadership audience: about 25 minutes for all ten moments, or
10 minutes with moments 1, 4, 5, 7 and 9. The same list lives in the app at **`/demo`** (one click per moment: it
signs in as the right person and opens the right screen) and is generated from `src/lib/demo/moments.ts`.

> Everything is fictional: "Aurelia Hall School", its pupils, staff and fees. Payments use a mock gateway, and
> email, WhatsApp and SMS are written to an outbox you can open instead of being sent. A "Sample build" tab sits on
> the left edge of every page.

## Before you start

- Open `/login?demo=1` (or `/demo`). Demo accounts sign in with one click; no passwords are shown.
- Use a desktop window for the CRM and a phone-sized window for the parent portal to show both.
- Sent messages: `/admin/outbox` (staff) shows every email, WhatsApp and SMS the system "sent".
- Before a demo and after each run-through, sign in as **Super admin** and press **Reset the sample school** on `/demo`. It also moves every date forward so "today" is today (instalments due next week, this month's collections, upcoming events).

| Account     | Sees                                             |
| ----------- | ------------------------------------------------ |
| Principal   | Whole school, approvals, reports                 |
| Admissions  | Leads, tours, applications                       |
| Accounts    | Fees, payments, refunds, reconciliation, reports |
| Registrar   | Students, classes, promotion, medical records    |
| HR          | Vacancies, staff applications, staff directory   |
| Houseparent | Boarders, pocket money                           |
| Teacher     | Class lists and timetable (deliberately limited) |
| Parent      | Two children, dues, receipts, pocket money       |
| Super admin | Settings, users, audit log, demo reset           |

## 1. An enquiry lands in the CRM, live

**Who:** Visitor, then Admissions · **Open:** `/contact` → `/admin/leads` (Admissions)

> A parent's question never sits in a shared inbox. It arrives tagged with its source, assigned and timestamped, and the first reply is minutes away, not days.

1. Submit the enquiry form (any placeholder details; the captcha is a self-hosted image).
2. Open the lead inbox as Admissions: the new lead is at the top, with its source.
3. Open it: the activity timeline shows the confirmation email already sent (Outbox).

## 2. Book a campus tour

**Who:** Visitor, then Admissions · **Open:** `/book-a-tour` → `/admin/tours` (Admissions)

> Slots have real capacity, so a Saturday can't be overbooked. The family gets a confirmation and a reminder the day before.

1. Pick a slot and book for two visitors.
2. As Admissions open Tours: the booking is on that slot's list.
3. Check the family in on the day; the lead moves to Tour done.

## 3. Register and pay on the mock gateway

**Who:** Visitor · **Open:** `/admissions/register`

> Registration ends in a payment through the same code path as production. Switching to Razorpay is one environment variable.

1. Walk the five steps (child, parents, boarding, documents, review).
2. Pay the registration fee: on the fake gateway press Succeed (try Duplicate webhook too: still one receipt).
3. You land on a receipt and a sign-in link to track the application.

## 4. Revise a fee structure and review the diff

**Who:** Accounts · **Open:** `/admin/fees/structures`

> Fees are versioned. Before anything changes you see exactly what a 5% revision does to every open invoice, family by family.

1. Open a structure and press Revise; apply +5% to recurring heads.
2. Read the impact preview: head-by-head diff, invoices affected, change still to collect, credits created.
3. Publish with reprice on: families get a revised invoice by email; paid instalments stay untouched.

## 5. Pay an instalment as a parent

**Who:** Parent · **Open:** `/portal`

> One login, two daughters. The parent sees what is due, pays in two taps and the receipt is there before they put the phone down.

1. Switch to Anvi (second instalment due).
2. Pay on the mock gateway; return to the fees page.
3. Open the receipt PDF: gap-free number, the allocation, any credit on account.

## 6. A refund needs two people

**Who:** Accounts, then Principal · **Open:** `/admin/payments/refunds/new` → `/admin/payments/refunds` (Principal)

> The person who asks can never be the person who approves. The policy quote does the arithmetic; the audit log keeps the story.

1. As Accounts pick a pupil's payment and take the policy quote for a withdrawal.
2. Request the refund. Try approving it as the same user: refused.
3. As Principal approve; as Accounts pay out. The family is notified.

## 7. Reports and exports

**Who:** Accounts · **Open:** `/admin/reports`

> The numbers a bursar and a principal ask for every month, one click each, with the table behind every chart and an Excel file for the board pack.

1. Open Collections: month by month, by class, by head.
2. Open Outstanding: ageing buckets and the top families by balance.
3. Export to XLSX: real numbers, not text; every export is audited.

## 8. Import a bank statement and reconcile

**Who:** Accounts · **Open:** `/admin/payments/reconciliation`

> Month-end reconciliation drops from an afternoon to a few clicks, and nothing is guessed: ambiguous lines wait for a person.

1. Press 'Download sample statement' then import that file.
2. Watch lines auto-match by reference, then by unique amount and date.
3. Set the stray credit aside as 'not a fee'.

## 9. Year-end promotion, and a locked medical record

**Who:** Registrar · **Open:** `/admin/students/promotion`

> Promoting 240 girls is a preview and one confirmation. And the most sensitive data in the school is behind its own door, with every look recorded.

1. Read the preview: who moves where, over-capacity sections, Year 13 leavers.
2. Tick Repeat for one pupil to see how retention is handled (don't confirm unless you want to).
3. Open a pupil's medical record: the access notice, then the audit log entry.

## 10. From a staff application to a hire

**Who:** Applicant, then HR · **Open:** `/careers/apply` → `/admin/careers` (HR)

> Nine steps, autosaved and resumable by email, with the safer-recruitment questions built in. HR sees a clean, scored, printable file.

1. Start an application and leave: use the emailed link (Outbox in dev) to resume it.
2. As HR open the pipeline, shortlist a candidate, score and add a note.
3. Download the application PDF; move a candidate to Hired and add them to the staff directory.

## Questions you will be asked

- **"Is this live data?"** No. Everything is generated and fictional; the seed is deterministic.
- **"How do we take real payments?"** Set `PAYMENT_PROVIDER=razorpay` and its three keys. No code change: the
  mock gateway and the real one share one interface, one webhook handler and one set of tests.
- **"What about WhatsApp and email?"** Same pattern: adapters for several providers, mock by default, consent per
  contact respected. See `docs/INTEGRATIONS.md`.
- **"Who can see a child's medical record?"** Only roles with that permission, and every view is logged.
  Teachers can't open it (try it in moment 9).
- **"Can we change fees mid-year?"** Yes, and see the effect first (moment 4). Paid instalments are never
  re-opened.
- **"What does it run on?"** Next.js and Postgres. `docs/DEPLOY.md` covers hosting.

## If something looks off

- A page that shows nothing after a reset: refresh once (the first request after a reset warms the database).
- Moment 5 needs the demo parent's second instalment to be unpaid: reset the school if it has already been paid.
