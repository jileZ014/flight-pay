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
