// Register the Stripe webhook endpoint pointing at the deployed Netlify URL.
// Idempotent — if an endpoint with the same URL already exists, returns it.
//
// Usage: npx tsx scripts/register-stripe-webhook.ts
//
// Outputs the signing secret (whsec_*) — caller is responsible for putting it
// into Netlify env STRIPE_WEBHOOK_SECRET (the script also tries to do that automatically).

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Stripe from 'stripe';

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
  console.error('STRIPE_SECRET_KEY not set');
  process.exit(1);
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flight-pay.netlify.app';
const WEBHOOK_URL = `${APP_URL}/api/stripe/webhook`;
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'invoice.finalized',
  'invoice.sent',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'customer.updated',
];

async function main() {
  const stripe = new Stripe(SECRET!, {
    apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });

  const account = await stripe.accounts.retrieve();
  console.log(`Stripe account: ${account.id}`);
  console.log(`Mode:           ${SECRET!.startsWith('sk_test_') ? 'TEST' : 'LIVE'}`);
  console.log(`Webhook URL:    ${WEBHOOK_URL}`);

  // Check for existing webhook with same URL — idempotent
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((e) => e.url === WEBHOOK_URL);

  let endpoint: Stripe.WebhookEndpoint;
  if (match) {
    console.log(`\nFound existing webhook endpoint: ${match.id} — reusing`);
    // Update it to ensure event list is current
    endpoint = await stripe.webhookEndpoints.update(match.id, {
      enabled_events: EVENTS,
      description: 'Flight_Pay invoice + customer events (auto-registered)',
    });
    console.log('Existing webhook does NOT expose its signing secret on retrieve — you may need');
    console.log('to either keep the previous Netlify env STRIPE_WEBHOOK_SECRET, or delete this');
    console.log('endpoint and re-run this script to get a fresh secret.');
    console.log(`\nEndpoint id:        ${endpoint.id}`);
    console.log(`Enabled events:     ${endpoint.enabled_events.length}`);
    console.log(`Status:             ${endpoint.status}`);
    return;
  }

  endpoint = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: 'Flight_Pay invoice + customer events (auto-registered)',
  });

  const secret = endpoint.secret;
  if (!secret) {
    console.error('No signing secret returned (this should never happen on creation)');
    process.exit(1);
  }

  console.log(`\nWebhook created: ${endpoint.id}`);
  console.log(`Signing secret:  ${secret}`);

  // Try to set the secret in Netlify env automatically
  try {
    console.log('\nUpdating Netlify env STRIPE_WEBHOOK_SECRET...');
    execSync(`netlify env:set STRIPE_WEBHOOK_SECRET "${secret}" --context all`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('Netlify env updated. A redeploy is required for the new secret to take effect.');
  } catch (err) {
    console.warn('Netlify env update failed (non-fatal):', err);
    console.warn('Set STRIPE_WEBHOOK_SECRET=' + secret + ' in Netlify env manually.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
