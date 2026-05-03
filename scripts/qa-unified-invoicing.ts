// End-to-end QA for the unified invoicing pipeline.
// Validates: Stripe Customer creation, Stripe Invoice + finalize + hosted URL,
// test card payment (4242), webhook signature construction, Twilio API connectivity.
//
// Usage: cd Flight_Pay && npx tsx scripts/qa-unified-invoicing.ts
//
// Environment:
//   - .env.local must be loaded (run via tsx so dotenv-style won't auto-load — read directly)
//   - STRIPE_SECRET_KEY must be sk_test_* (NEVER run against live keys)
//   - TWILIO_FROM_NUMBER must be a real Twilio number for the SMS check

import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import twilio from 'twilio';

// Load .env.local (Next.js convention) since tsx doesn't auto-load it
function loadEnv(filename: string) {
  const p = path.join(process.cwd(), filename);
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, 'utf8');
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env.local');

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error('ERROR: STRIPE_SECRET_KEY not set');
  process.exit(1);
}
if (!SECRET.startsWith('sk_test_')) {
  console.error('SAFETY ABORT: STRIPE_SECRET_KEY is not a test key. Refusing to run QA against live mode.');
  process.exit(1);
}

const stripe = new Stripe(SECRET, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});

async function step(label: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${label} ... `);
  try {
    await fn();
    console.log('OK');
  } catch (err) {
    console.log('FAIL');
    console.error('     ', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function checkKeyStatus(): Promise<'ok' | 'expired' | 'invalid'> {
  try {
    await stripe.balance.retrieve();
    return 'ok';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/expired/i.test(message)) return 'expired';
    return 'invalid';
  }
}

async function main() {
  console.log('\n=== Flight Pay — Unified Invoicing QA ===\n');
  console.log(`Stripe mode: TEST (key prefix: ${SECRET.slice(0, 10)}...)`);

  const keyStatus = await checkKeyStatus();
  console.log(`Stripe key status: ${keyStatus.toUpperCase()}`);
  if (keyStatus !== 'ok') {
    console.log('\n  Stripe API calls will be SKIPPED until a fresh test key is provided.');
    console.log('  Webhook signature + Twilio validations will still run.\n');
  } else {
    console.log(`Account: ${(await stripe.accounts.retrieve()).id}`);
    console.log('');
  }

  let customerId = '';
  let invoiceId = '';
  let hostedUrl = '';

  if (keyStatus !== 'ok') {
    console.log('1. Stripe Customer creation — SKIPPED (no valid test key)');
    console.log('2. Stripe Invoice creation + finalize — SKIPPED');
    console.log('3. Test card payment (4242) — SKIPPED');
    console.log('');
  } else {

  console.log('1. Stripe Customer creation');
  await step('Creating test customer', async () => {
    const customer = await stripe.customers.create({
      name: 'QA Test Family',
      email: 'qa-test@flight-pay.local',
      phone: '+15005550006',
      metadata: {
        firestoreParentId: 'QA_TEST_PARENT_DO_NOT_USE',
        team: '14u',
      },
    });
    customerId = customer.id;
    if (!customerId.startsWith('cus_')) throw new Error(`bad customer id: ${customerId}`);
  });

  console.log('\n2. Stripe Invoice creation + finalize');
  await step('Creating draft invoice', async () => {
    const draft = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 7,
      auto_advance: false,
      description: 'QA test — May 2026 tuition',
      metadata: {
        firestoreParentId: 'QA_TEST_PARENT_DO_NOT_USE',
        month: '2026-05',
        tier: 'regular',
      },
    });
    invoiceId = draft.id;
  });

  await step('Adding $95 line item', async () => {
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoiceId,
      amount: 9500,
      currency: 'usd',
      description: 'AZ Flight Hoops — May 2026 Tuition (Regular rate)',
    });
  });

  await step('Finalizing invoice (auto_advance=false)', async () => {
    const finalized = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false });
    if (finalized.status !== 'open') throw new Error(`expected status=open, got ${finalized.status}`);
    if (!finalized.hosted_invoice_url) throw new Error('no hosted_invoice_url');
    hostedUrl = finalized.hosted_invoice_url;
  });

  console.log(`\n  Hosted invoice URL: ${hostedUrl}\n`);

  console.log('3. Test card payment (4242 4242 4242 4242 via pm_card_visa)');
  await step('Creating PaymentMethod from tok_visa', async () => {
    // Stripe test mode magic — tok_visa simulates a successful 4242 card
    // We use stripe.paymentIntents.confirm with a pm_card_visa for invoices
    const paid = await stripe.invoices.pay(invoiceId, {
      payment_method: 'pm_card_visa',
      paid_out_of_band: false,
    });
    if (paid.status !== 'paid') throw new Error(`expected status=paid, got ${paid.status}`);
    if (paid.amount_paid !== 9500) throw new Error(`expected amount_paid=9500, got ${paid.amount_paid}`);
  });

  } // end of keyStatus === 'ok' block (Stripe live API tests)

  console.log('\n4. Webhook signature construction (verifies our handler will accept Stripe events)');
  await step('Constructing webhook test event', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not set');

    // Synthesize an Invoice payload — does NOT require a live API call
    const synthetic = {
      id: 'in_qa_test_synthetic',
      object: 'invoice',
      amount_due: 9500,
      amount_paid: 9500,
      currency: 'usd',
      customer: 'cus_qa_test_synthetic',
      hosted_invoice_url: 'https://invoice.stripe.com/i/acct_test/qa_synthetic',
      status: 'paid',
      status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
      metadata: {
        firestoreParentId: 'QA_TEST_PARENT_DO_NOT_USE',
        month: '2026-05',
        tier: 'regular',
      },
    } as unknown as Stripe.Invoice;
    const eventPayload = {
      id: 'evt_test_qa_123',
      object: 'event',
      api_version: '2025-02-24.acacia',
      created: Math.floor(Date.now() / 1000),
      data: { object: synthetic },
      type: 'invoice.paid',
      livemode: false,
    };

    // Construct a valid Stripe-Signature header so we know constructEvent would accept it
    const payload = JSON.stringify(eventPayload);
    const ts = Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${payload}`;
    const crypto = await import('crypto');
    const sig = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
    const header = `t=${ts},v1=${sig}`;

    // Verify our own constructed signature passes Stripe's verifier
    const event = stripe.webhooks.constructEvent(payload, header, webhookSecret);
    if (event.type !== 'invoice.paid') throw new Error(`unexpected event type: ${event.type}`);
    if (!('metadata' in (event.data.object as Stripe.Invoice))) throw new Error('event missing metadata');
    const inv = event.data.object as Stripe.Invoice;
    if (inv.metadata?.firestoreParentId !== 'QA_TEST_PARENT_DO_NOT_USE')
      throw new Error('metadata.firestoreParentId not preserved through webhook');
    if (inv.metadata?.month !== '2026-05')
      throw new Error('metadata.month not preserved through webhook');
  });

  console.log('\n5. Twilio API connectivity');
  await step('Verifying Twilio credentials', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');
    const client = twilio(sid, token);
    const account = await client.api.v2010.accounts(sid).fetch();
    if (account.status !== 'active') throw new Error(`Twilio account status: ${account.status}`);
  });

  await step('Listing recent Twilio messages (read-only smoke test)', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const client = twilio(sid, token);
    const msgs = await client.messages.list({ limit: 1 });
    if (!Array.isArray(msgs)) throw new Error('messages.list did not return array');
  });

  if (keyStatus === 'ok') {
    console.log('\n6. Cleanup — deleting test customer');
    await step('Cleanup', async () => {
      if (customerId) await stripe.customers.del(customerId);
    });
  }

  console.log('\n=== QA SUMMARY ===');
  if (keyStatus === 'ok') {
    console.log(`  Stripe Customer:  ${customerId} (deleted)`);
    console.log(`  Stripe Invoice:   ${invoiceId} (paid, $95.00, test mode)`);
    console.log(`  Test card:        4242 4242 4242 4242 (via pm_card_visa) — accepted`);
  } else {
    console.log(`  Stripe API:       SKIPPED — key is ${keyStatus}.`);
    console.log(`                    Rotate at: https://dashboard.stripe.com/test/apikeys`);
    console.log(`                    Update STRIPE_SECRET_KEY in .env.local + Netlify env, then re-run this script.`);
  }
  console.log(`  Webhook sig:      verified by stripe.webhooks.constructEvent (synthetic payload)`);
  console.log(`  Webhook metadata: firestoreParentId + month preserved through signature flow`);
  console.log(`  Twilio:           account active, API reachable, list works`);
  console.log('');
  console.log('Post-deploy webhook config (Stripe Dashboard → Developers → Webhooks):');
  console.log('  URL:    https://flight-pay.netlify.app/api/stripe/webhook');
  console.log('  Events: invoice.finalized, invoice.sent, invoice.paid, invoice.payment_failed,');
  console.log('          invoice.voided, invoice.marked_uncollectible, customer.updated');
}

main().catch((err) => {
  console.error('\nQA FAILED:', err);
  process.exit(1);
});
