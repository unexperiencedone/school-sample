# Fee engine

How Aurelia Hall turns a fee structure into a family's invoice, takes payments against it, and keeps the books
honest. The pure calculation lives in `src/lib/fee-engine/` (no database, no I/O, unit-tested in
`tests/unit/fee-engine.test.ts`). The services in `src/lib/services/` apply it inside database transactions.

## Rules that never bend

- **Money is integer paise.** Percentages are basis points (1 % = 100 bp). Splitting an amount uses the largest-remainder method, so the parts always add up exactly (`splitByWeights`). Floating-point numbers never touch money.
- **Every rupee is explained.** An invoice stores the engine's `breakdown`: each charge, concession and rebate in order, with a running total. Concessions that were considered but not applied are listed with the reason. The invoice screen shows this as "How this invoice was calculated".
- **History is never rewritten.**
  - Structures are versioned.
  - Payments, receipts and allocations are append-only.
  - Revisions, waivers, approvals and refunds write an audit entry with who, when, before/after and a reason.
- **Settled instalments are never re-opened** by a revision.
- **Receipt numbers are gap-free per financial year.** The counter row is incremented inside the payment's transaction, so a rolled-back payment also rolls back its number.

## Building blocks

| Thing              | Where                    | What it holds                                                                                                  |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Fee head           | `FeeHead`                | What a charge is: kind (tuition, boarding, …), one-time or annual, refundable or not                           |
| Structure          | `FeeStructure` + lines   | Amount per head for a year × stage (band) × boarding type, **versioned** (DRAFT → ACTIVE → SUPERSEDED)         |
| Instalment plan    | `InstalmentPlan` + parts | Annual (100 %), two instalments (60/40), three terms (40/30/30) — percentages or fixed amounts, with due dates |
| Concession         | `Concession`             | Value (percentage or fixed), heads it applies to, priority, stackable/exclusive, automatic or on approval      |
| Student concession | `StudentConcession`      | A grant (or request) of a concession to a pupil for a year, with an optional override value                    |
| Advance rebate     | `AdvanceRebate`          | A fixed amount off a single-payment plan paid in full by a date                                                |
| Late-fee rule      | `LateFeeRule`            | Monthly rate, grace days, the "flag for review" threshold                                                      |
| Refund policy      | `Setting: refund_policy` | New-pupil before/after-start percentages; existing-pupil notice period and in-lieu deduction                   |

## Computing an invoice (`computeInvoice`)

1. **Charges.** Every head in the active structure version, except registration, which is paid at registration through its own order. One-time heads (admission, first-year uniform) apply to new admissions only.
2. **Concessions, in priority order, on what remains.**
   - Each eligible concession reduces only the heads it applies to, and only by what is left on them.
   - An **exclusive** concession applies only if nothing was applied before it, and blocks everything after it.
   - **Automatic** concessions are checked by the engine: sibling (second child onwards, by date of birth across shared guardians), staff ward and founding family.
   - Scholarships and bursaries need an **approved grant**; an approver may set an override percentage.
   - A fixed-amount concession is spread across its heads with largest remainder.
3. **Advance-payment rebate.** Only on a single-instalment plan due on or before the rebate date, invoiced before that date. It comes off recurring fees, never one-time heads.
4. **Instalments.**
   - One-time heads land in instalment 1.
   - Recurring heads are split by the plan's percentages (or fixed amounts) using largest remainder.
   - The instalments always sum to the invoice total.

```
Upper School, full boarding, three terms, second child, new admission (sample figures)
  Tuition                        5,76,500   running 5,76,500
  Boarding & meals               4,83,500   running 10,60,000
  …
  Admission fee (one-time)       1,39,500
  Sibling concession 10% on Tuition  −57,650
  → Instalment 1 = 40% of recurring + all one-time; 2 and 3 = 30% each
```

## Taking payments (`recordPayment`, `allocatePayment`)

- **Exactly once.** A payment is keyed by `providerPaymentId` (unique). Gateway webhooks are also stored under a unique `(provider, eventId)`. A replayed event, a double-clicked "record payment", or two webhooks racing (Postgres P2002) all end up as one payment.
- **Allocation.** Oldest due first across all the family's open instalments, or to a chosen instalment first. An instalment's outstanding amount is its principal plus any unwaived late fee, less what has been paid. Money left over becomes a **credit on account** (`WalletEntry`), shown on the invoice and the receipt.
- **Statuses** are recomputed from the rows after every change (`refreshInvoice`): DUE / PARTIAL / PAID / OVERDUE per instalment, and OPEN / PARTIAL / PAID / OVERDUE per invoice.
- **Offline payments** (cheque, DD, bank transfer, cash) go through the same function with provider `manual`, a per-form idempotency key, a reference, and the person who recorded it.

## Late fees, flags and forfeiture (nightly job)

`POST /api/cron/late-fees` (02:00 IST), `runLateFees` in `src/lib/services/jobs.ts`.

- **Late fee:** `rate × started months overdue × unpaid principal`, once the grace period has passed.
  - It is calculated on principal, never on late fees.
  - The stored value is absolute, so running the job twice changes nothing.
  - It never lowers an amount already charged, so a part-payment doesn't erase a fee.
  - It can be **waived** per instalment by someone with `fees:waive`, with a reason.
- **Flag for review:** an invoice with principal overdue beyond `cancelFlagAfterDays` (90 in the sample) is flagged on the Dues screen. **The system never cancels a seat** — a person decides.
- **Rebate forfeiture:** a single-payment invoice that took the advance rebate but isn't paid in full by the rebate date has the rebate removed. The instalment and total go up by the rebate, the rebate line is removed, and the breakdown and audit log record why.

## Revising fees (versioned structures)

Fees → Structures → **Revise**:

1. **Draft.** Edit amounts head by head (or apply a percentage to all recurring heads). Saved as a new `DRAFT` version with a reason and an effective date.
2. **Impact preview.** Before anything changes, the draft page shows:
   - the head-by-head difference;
   - every open invoice on the live version, recomputed with the family's own plan, concessions, rebate decision and payments;
   - the totals: invoices affected, the change in fees still to collect, credits that would be created, and how many fully paid invoices stay as issued.
3. **Publish** (one transaction). The live version becomes `SUPERSEDED` and the draft `ACTIVE`, so the website fee pages, the fee PDF and new invoices use it immediately. Optionally, every open invoice is **repriced forwards** and the family is emailed the revised invoice.

**Forward repricing** (`repriceForward`):

- Instalments already paid in full keep their amounts.
- The revised total, less those settled amounts, is spread over the remaining instalments in the plan's proportions.
- Part-payments stay where they are.
- Principal paid beyond what the revised invoice needs becomes a credit on account. Nothing is lost and nothing is invented; the unit tests check that paid money is conserved.
- Late fees and late-fee payments stay with their instalment.

Approving a concession uses the same machinery: the pupil's open invoice for that year is repriced forwards, so the discount lands on what is still to pay.

## Refunds

Request → approve → pay out.

- **Request** (`refunds:request`, Accounts):
  - Usually from a **policy quote**. For a withdrawing pupil, the quote spreads what has been paid across fee heads, then applies the refund policy. New pupils get a percentage before/after the session starts. Existing pupils get the unconsumed share of the year, less one term in lieu of notice when notice was short.
  - Non-refundable heads (registration, admission) are never refunded.
  - A request can't exceed what is left on the payment after other requested, approved or processed refunds.
- **Approve or reject** (`refunds:approve`, Principal). **Maker–checker:** the requester can never approve their own request; the server enforces it.
- **Pay out** (`payments:record`):
  - **Gateway payments** are refunded through the provider's refund API. The idempotency key is the refund id, so a retried click never refunds twice.
  - **Offline payments** are refunded by bank transfer, with the reference recorded.
  - A gateway that answers "pending" is completed later by the signed `refund.processed` webhook.
  - The payment's refunded total and status are updated, and the family is notified.

A refund never re-opens instalments. A withdrawal settlement closes the invoice separately.

## Reconciliation

Payments → Reconciliation imports the school account's **CSV statement** (`src/lib/reconcile.ts`, pure and unit-tested).

**Reading the file:**

- It finds the header row below any account preamble.
- Dates are read day-first (`05/04/2026`, `05-Apr-2026`, ISO); amounts in Indian grouping are read into paise.
- Only **credits** are kept.

**Matching** recorded offline payments, each used at most once:

1. **By reference.** Same amount, and the payment's reference appears in the line's reference or narration.
2. **By unique amount and date.** Same amount within ±3 days, **only when exactly one payment fits**. Two identical cheques are never guessed between.

Whatever is left is for a person: match it from same-amount suggestions, or mark it "not a fee". The screen also lists offline payments recorded more than three days ago that no statement has confirmed. A **sample statement** built from recent payments (with a stray credit and a debit) is one click away for demos.

## Scheduled jobs

| Route                    | When (IST)   | What                                                                                                         |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `/api/cron/late-fees`    | 02:00 daily  | Late fees, review flags, rebate forfeiture                                                                   |
| `/api/cron/reminders`    | 09:00 daily  | Tour reminders (visits tomorrow), "due soon" 7 days and 1 day before an instalment, weekly overdue reminders |
| `/api/cron/outbox-retry` | every 15 min | Retries failed messages with exponential backoff                                                             |

- All three need `Authorization: Bearer $CRON_SECRET`; the comparison is constant-time.
- All three are idempotent.
- `vercel.json` schedules them on Vercel. Any other scheduler can `curl` them.

## Where to look

| Question                        | File                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| How is an invoice computed?     | `src/lib/fee-engine/invoice.ts`                              |
| How is a payment split?         | `src/lib/fee-engine/allocation.ts`                           |
| Late fee arithmetic             | `src/lib/fee-engine/late-fee.ts`                             |
| Refund policy arithmetic        | `src/lib/fee-engine/refund.ts`                               |
| Repricing                       | `src/lib/fee-engine/reprice.ts`                              |
| Recording payments, receipts    | `src/lib/services/ledger.ts`                                 |
| Gateway orders, webhooks        | `src/lib/services/payments.ts`                               |
| Revisions, concessions, waivers | `src/lib/services/fee-admin.ts`                              |
| Manual payments, refunds        | `src/lib/services/payments-admin.ts`                         |
| Bank statements                 | `src/lib/reconcile.ts`, `src/lib/services/reconciliation.ts` |
| Nightly and daily jobs          | `src/lib/services/jobs.ts`                                   |
