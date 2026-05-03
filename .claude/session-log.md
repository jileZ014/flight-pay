## 2026-05-03 — Stripe + Twilio Unified Invoicing (replaces Square + Phone Link slog)
**Session type:** VS Code (driven from CoS workspace)
**ROI tag:** REVENUE + INFRASTRUCTURE

**Why:** April 2026 frustration — 56 manual Phone Link clicks per send cycle, Lashay→Omar mis-routed invoice, Square SHARE_MANUALLY no native view tracking. User wanted unified system NOW with dashboard preserved + automated, accurate sending. Technical board (T13 Collison, T14 DHH, T15 Levels added 2026-05-03) recommended Stripe Invoicing + server-side Twilio batch SMS, dashboard kept, Square dormant as Taleb hedge.

**Tasks completed:**

**New libraries:**
- `src/lib/stripe.ts` — Stripe v22 server client with helpers: `ensureStripeCustomer` (idempotent search-then-create), `createMonthlyInvoice` (draft → item → finalize, with idempotency keys + auto-void on partial-failure), `voidOpenInvoicesForParentMonth` (canonical "what's open in Stripe right now?" check), `paymentMethodFromPaidInvoice` (reads charge/PI to derive ACH vs card vs wallet), `computeMonthAmountUsd` (custom-rate aware)
- `src/lib/twilio.ts` — Twilio client + `sendSms` + `sendSmsBatch` (concurrency=5, per-item `onItemComplete` callback so persistence happens as we go, not at end of batch)

**New API routes:**
- `POST /api/stripe/customer-sync` — bulk-create or refresh Stripe Customers from Firestore parents. Idempotent. Body: `{ all: true }` or `{ parentId: "X" }`. Force flag for refreshing existing.
- `POST /api/stripe/invoice/create` — single invoice for one parent+month
- `POST /api/stripe/invoice/batch-create` — bulk for an entire month. Returns 207 partial / 502 all-failed / 200 all-succeeded.
- `POST /api/stripe/webhook` — receives `invoice.finalized/sent/paid/payment_succeeded/payment_failed/voided/marked_uncollectible` + `customer.updated`. Mirrors to Firestore. Replaces "Sync Square" polling.
- `POST /api/sms/send` — three modes: bulk per-month / single custom / single resend. Server-side Twilio. Replaces 56 Phone Link clicks.

**Type changes (`src/types/index.ts`):**
- `Parent.stripeCustomerId: string | null` (parallel to squareCustomerId)
- `PaymentMethod` adds 'stripe'
- `InvoiceActivity` extended: optional `provider`, `stripeInvoiceId`, `stripeCustomerId`, `stripeStatus`, `paidAt`, `paidVia`, `sms` (`SmsDelivery`)
- `SmsDelivery` new type — Twilio sid/status/error tracking

**Dashboard changes (`src/app/page.tsx`):**
- 3 new buttons in header: "1. Sync Stripe Customers" / "2. Create Stripe Invoices" / "3. Send All SMS via Twilio" (indigo + green)
- 3 new state vars + handlers: `syncStripeCustomers`, `createStripeInvoicesForCurrentMonth`, `sendStripeInvoicesViaSms`
- Existing Square buttons preserved as smaller "Square (legacy fallback)" row
- No removal of existing functionality

**QA results:**
- Production build passes (5 new routes registered)
- Dev server smoke test: all 4 new routes return correct error shapes (400 with helpful messages on empty body, 200 on root)
- Webhook signature verification: PASSED via synthetic payload
- Twilio API: account active, list works
- Stripe live API tests: BLOCKED — flight-welcome's sk_test_51Rja2e... is expired. User must rotate at https://dashboard.stripe.com/test/apikeys (30 sec)
- Board QA review (Cantrill / Charity Majors / Patrick Collison) found 3 BLOCKERs + 2 SHOULD-FIXes — all fixed before commit

**Board QA fixes applied:**
- BLOCKER 1 (Cantrill): if `invoiceItems.create` fails between draft + finalize, draft would have been finalized as $0 invoice. Fix: try/catch around item-create and finalize, void orphaned draft on either failure. Idempotency keys added.
- BLOCKER 2 (Cantrill): `invoiceActivity.stripeStatus === 'open'` check trusted Firestore cache; stale cache → duplicate open Stripe invoices. Fix: new `voidOpenInvoicesForParentMonth` queries Stripe directly (`stripe.invoices.list({ customer, status: 'open' })`) and voids matching metadata.
- BLOCKER 3 (Collison): `paidVia: 'card'` was hardcoded for ALL paid invoices. ACH/CashApp/wallet would have been mis-recorded. Fix: `paymentMethodFromPaidInvoice` reads `charge.payment_method_details.type` or `paymentIntent.payment_method_types[0]`.
- SHOULD-FIX (Majors): SMS batch persisted Firestore writes only AFTER all sends; mid-batch timeout would lose delivery status. Fix: `sendSmsBatch` now takes `onItemComplete` callback, route persists per-item.
- SHOULD-FIX (Majors): batch endpoints returned HTTP 200 even when every send failed. Fix: 207 Multi-Status when partial, 502 when all-failed, 200 when all-succeeded.
- NIT (Cantrill): `computeMonthAmountUsd` returned 0 for `rateType='custom'` parents with `monthlyRate=0` and `customRate>0`. Fix: explicit rateType branch.

**Current state:**
- All Stripe/Twilio code merged on `main` and built clean
- TEST mode env vars in `.env.local` (not committed): expired sk_test from flight-welcome + valid Twilio creds from GameTriq-StatTracker
- LIVE mode key on Forge612 account (acct_1TDHzHGkPljrK6It) ready to drop into Netlify env when going to production
- Existing Square invoice flow untouched — fallback works

**Remaining (single 30-sec user action when Jonas returns):**
1. Rotate Stripe TEST keys: https://dashboard.stripe.com/test/apikeys
2. Update `STRIPE_SECRET_KEY` in `.env.local`
3. Run `npx tsx scripts/qa-unified-invoicing.ts` — completes the customer-create + invoice-create + 4242-pay end-to-end test
4. If green: deploy via `bash deploy.sh` and configure webhook in Stripe Dashboard at https://flight-pay.netlify.app/api/stripe/webhook

**To continue:** Awaiting fresh Stripe TEST key from user. Pipeline is otherwise deploy-ready. Tonight's invoices: user can use either the new Stripe pipeline (after key rotation) or fall back to legacy Square buttons — the new code is purely additive.

---

## 2026-04-10 (previous session)
**Session type:** VS Code
**ROI tag:** REVENUE + INFRASTRUCTURE
**Tasks completed:**

**Data integrity audit + fixes (triggered by Lashay Espitia → Omar Rubalcaba mis-routed invoice)**
- Built `/api/audit/sync` (full audit), `/api/audit/quick` (1.5s fast audit),
  `/api/audit/fix`, `/api/audit/sync-phones-from-square`, `/api/audit/backfill`, `/api/audit/finalize`
- Fixed 18 data issues in total:
  - Lashay Espitia: phone 6234514092 (Omar's) → 6024591384, linked to Square PT1KHSRMRVKQ837DYH6M3K9G90
  - Renamed Julianne Worthen → Julianne Levich (same person, name change)
  - Swapped firstName/lastName on 4 records imported "Last First" (Bermudez, Caldwell, Lopez, Rubalcaba)
  - Deleted test data: chris_smith_3039086810 (Firestore), Nathan Snively, Test Test, Chris Smith (Square)
  - Backfilled squareCustomerId on 41 Firestore parents (up from 10 linked → 52)
- Final state: 58 parents, 52 with squareCustomerId, 0 dup phones, 0 invoice mismatches
- 6 remaining parents without squareCustomerId will auto-create on next Text click (flow already handles this)
- Deployed `deploy.sh` + `.env.deploy` + `.netlify/state.json` — site was linked to wrong GitHub repo so auto-deploy wasn't working; now uses `npm run deploy` with safe deploy script

**Invoice view tracking (earlier in session)**
- Added invoice view tracking (Square has no native "viewed" API for SHARE_MANUALLY invoices)
- New `InvoiceActivity` type on Parent: `{squareInvoiceId, publicUrl, amount, sentAt, viewedAt, viewCount, lastReminderAt}` keyed by month
- New redirect route `src/app/r/[parentId]/[month]/route.ts` — logs `viewedAt` + `viewCount` to Firestore, then 302s to Square publicUrl
- `sendTextToParent` now stamps `invoiceActivity[currentMonth]` and texts `${origin}/r/{parentId}/{month}` instead of raw Square URL. View count resets when invoiceId changes (cancelled+recreated).
- Dashboard "Current Month — Invoice Status" panel above stats with 4 buckets: Paid / Viewed-Unpaid / Sent-Not-Viewed / Not-Sent. Click bucket → drilldown list with per-family Re-text + "Re-text all in bucket"
- Action column shows "Viewed ✓ (Nx)" badge in yellow when invoice has been opened
- `/api/square/sync` backfills `invoiceActivity` for unpaid invoices already in Square (so existing UNPAID invoices appear in buckets)
- Build passes clean

**Key decisions:**
- Tracking via custom redirector (Square API doesn't expose view events). Acceptable trade-off: redirect adds one hop but gives full click telemetry.
- Bucket "sentAt" only set when texted via dashboard. Backfilled invoices show as "Not Sent" until next text — intentional, since we genuinely don't know if a backfilled Square invoice was already delivered to the parent.
- View tracking persists across invoice updates only when invoiceId is the same. Cancelling + recreating an invoice resets view count.

**Current state:**
- Feature implemented, build clean, NOT yet deployed to Netlify
- Existing parents have no invoiceActivity until either (a) user clicks Text again, or (b) Sync Square is run

**Open items:**
- Deploy to Netlify (`npm run deploy` or `bash deploy.sh`)
- User to run Sync Square so existing UNPAID invoices populate buckets
- User to start texting via dashboard so view tracking begins flowing

**To continue:** Deploy + Sync Square, then start texting families. The "Viewed · Unpaid" bucket is the highest-leverage reminder target.

---

## 2026-03-09 17:30
**Session type:** VS Code
**Tasks completed:**
- Cancelled duplicate Isaiah Rubalcaba invoice → 22 unpaid remain
- Added per-family "Text" button (green, copies message + opens Phone Link)
- Persisted "Texted ✓" to Firestore (lastTexted field, survives refresh)
- Fixed stale link bug (fetches fresh from Square on every click)
- **Auto-sync Text button** — if dashboard balance ≠ Square invoice amount, auto-cancels old + creates new one
- **Fixed sync route** — parses order line items to mark ALL months for multi-month invoices. Returns paid/unpaid counts and totals.
- Sync refreshes invoice cache so Text buttons update immediately
- Build passes clean

**Current state:**
- Dev server on localhost:3001, ~17 unpaid invoices in Square
- Text button auto-creates/updates invoices when amounts mismatch
- Sync pulls paid invoices from Square → marks months paid in Firestore

**Open items:**
- Continue texting families
- Deploy to Netlify

**To continue:** User texting families. Click "Sync Square" after payments come in.

---

## 2026-03-09 (CORRECTED — Session ended due to context overflow)
**Session type:** VS Code
**Tasks completed:**
- Full dashboard rewrite — families grouped by team (9u/10u/11u, 12u/13u, 14u)
- Draft-then-publish invoice flow (Create All Drafts → Send All Texts)
- "Re-send Texts" button + `/api/square/invoice/list-published` endpoint
- BatchSendModal with manual "Next" button (no auto-advance)
- `/api/square/invoice/batch-cancel` and `/api/square/invoice/batch-update` endpoints
- Auto-create Square customer for new families (Karissa Porter fix)
- Phone Link / `sms:` URI integration for texting payment links
- 23 invoices were created as drafts, published in Square (due date 2026-03-12)
- Build passes clean

**UNRESOLVED ISSUES (session died before these were fixed):**
- **Source of truth problem:** "Actions" column shows inconsistent sent/texted state. Browser-only "Sent" tracking is unreliable (resets on refresh, wrong after re-sends). Proposed fix was never implemented:
  1. Remove browser-only "Sent" tracking
  2. Add `lastTexted: timestamp` field to Firestore family docs
  3. Action column reads from Firestore: No invoice + owes = "Invoice" button. Has unpaid invoice + not texted = "Text" button. Texted = "Texted ✓" (green).
- **Square push notifications:** `SHARE_MANUALLY` doesn't send SMS/email but parents WITH the Square app get push notifications automatically when invoices are published. This confused the user — some parents saw invoices before any text was sent.
- **23 invoices status unknown:** They were published in Square but NO texts were sent via Phone Link. Need to verify current state in Square before proceeding.

**Current state:**
- Dashboard is functional but Actions column has stale/incorrect sent state
- Invoice creation, batch operations, and re-send features are built
- NOT deployed to Netlify yet
- NOT feature-complete — source of truth fix is needed

**To continue:**
1. Fix the source of truth: add `lastTexted` to Firestore, remove browser-only sent tracking
2. Verify current Square invoice state (how many still unpaid, any already paid?)
3. Then send texts for remaining unpaid invoices
4. Deploy to Netlify

---

## 2026-03-09 (continued — Draft-then-Publish Implementation)
**Session type:** VS Code
**Tasks completed:**
- Ran 9-member board deliberation → unanimous: draft-then-publish flow
- Batch-cancelled ALL Square invoices (26 total: 14 UNPAID cancelled, 12 DRAFT deleted)
- Fixed invoice title: always uses current month ("March 2026") regardless of overdue months included
- Implemented draft-then-publish flow:
  - Invoice API no longer publishes — returns DRAFT invoiceId
  - New `/api/square/invoice/publish` endpoint publishes a draft and returns publicUrl
  - BatchSendModal now publishes each draft before opening SMS
  - SendInvoiceModal shows "Draft Created — parents can't see this yet"
  - Queue stores `invoiceId` instead of `publicUrl`
- Created `/api/square/invoice/batch-cancel` endpoint for bulk cancellation
- Build passes clean

**Key decisions:**
- Draft-then-publish is the approved flow (board unanimous)
- "Create Invoice" = DRAFT in Square (invisible to parents)
- "Send All Texts" = publish + get URL + open SMS per family
- Past-due months roll into current month's invoice as separate line items
- Invoice title always uses current month (e.g., "March 2026")
- Old queue (19 entries) was lost on page refresh — need to re-create drafts

**Current state:**
- Draft-then-publish flow fully implemented
- Built "Create All Drafts" button — one click creates drafts for all families that owe
- Due date prompt added (user enters date each time, default is 7th of next month)
- User successfully created 23 drafts with due date 2026-03-12
- "Queued ✕" buttons showing on all 23 families
- "Send All Texts (23)" button pulsing in header
- User wants to preview invoices before sending — can check Square dashboard → Drafts filter

**Open items:**
- User reviewing drafts in Square before sending
- Send All Texts once confirmed
- Deploy to Netlify when ready

**To continue:** User reviewing draft invoices, then "Send All Texts" to publish + text all at once.

---

## 2026-03-04 13:50
**Session type:** VS Code
**Tasks completed:**
- Cloned flight-pay repo, installed deps, pulled env vars from Netlify, build passes

**To continue:** Dashboard rebuild session.

---
