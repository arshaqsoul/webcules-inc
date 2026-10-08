/* Spike G1 (WEB-351) - who pays Stripe processing fees: destination charge vs direct charge.
 *
 * TEST MODE ONLY. Refuses any key that is not sk_test_.
 *
 *   STRIPE_TEST_KEY=sk_test_... CONNECTED_ACCOUNT=acct_... CURRENCY=cad node scripts/spike-stripe-fees.mjs
 *
 * CONNECTED_ACCOUNT is a test-mode connected account that can take charges.
 * CURRENCY should be the account's settlement currency (cad for Snap) to avoid FX noise.
 *
 * It creates two 100.00 charges with the test card pm_card_visa and prints, for each,
 * the Stripe fee and which balance (platform or connected account) it was debited from:
 *   A) destination charge (what booking checkout does today): transfer_data.destination, no application fee
 *   B) direct charge (what invoices and the C2 plan assume): Stripe-Account header, no application fee
 * Direct charges can be rejected outright (see "Result" below); that is reported, not thrown.
 *
 * Result on 2026-10-08 (Snap's Stripe account acct_1UNko4DRtu5FIpWg, test mode, Custom test account):
 *   A) platform debited a 4.00 CAD fee on a 100.00 CAD charge; connected account received 100.00, fee 0.00.
 *   B) rejected: "Creating direct charges with type=express or type=custom is not supported for new platforms."
 */
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_KEY ?? "";
const acct = process.env.CONNECTED_ACCOUNT ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_TEST_KEY must be a sk_test_ key.");
  process.exit(1);
}
if (!acct.startsWith("acct_")) {
  console.error("Set CONNECTED_ACCOUNT to a test-mode connected account id that can take charges.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
const AMOUNT = 10_000;
const CURRENCY = process.env.CURRENCY ?? "usd";
const fmt = (n, c) => `${(n / 100).toFixed(2)} ${c.toUpperCase()}`;

async function report(pi, opts) {
  // Stripe attaches the balance transaction a moment after the charge; poll briefly.
  let ch;
  for (let i = 0; i < 10; i++) {
    ch = await stripe.charges.retrieve(pi.latest_charge, { expand: ["balance_transaction", "transfer"] }, opts);
    if (ch.balance_transaction) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const bt = ch.balance_transaction;
  if (!bt) throw new Error("balance transaction not available after 10s");
  const where = opts ? "CONNECTED account" : "PLATFORM";
  console.log(`  ${where} balance: charge ${fmt(bt.amount, bt.currency)}  Stripe fee ${fmt(bt.fee, bt.currency)}  net ${fmt(bt.net, bt.currency)}`);
  if (ch.transfer) {
    const dp = await stripe.charges.retrieve(ch.transfer.destination_payment, { expand: ["balance_transaction"] }, { stripeAccount: acct });
    const dbt = dp.balance_transaction;
    console.log(`  CONNECTED account received ${fmt(dbt.amount, dbt.currency)}  fee ${fmt(dbt.fee, dbt.currency)}  net ${fmt(dbt.net, dbt.currency)}`);
  }
}

async function destinationCharge() {
  console.log("\nA) DESTINATION charge, no application fee (current booking checkout)");
  const pi = await stripe.paymentIntents.create({
    amount: AMOUNT,
    currency: CURRENCY,
    payment_method: "pm_card_visa",
    payment_method_types: ["card"],
    confirm: true,
    transfer_data: { destination: acct },
  });
  console.log("  payment intent", pi.id, pi.status);
  await report(pi, undefined);
}

async function directCharge() {
  console.log("\nB) DIRECT charge on the connected account, no application fee (invoices, C2 plan)");
  try {
    const pi = await stripe.paymentIntents.create(
      { amount: AMOUNT, currency: CURRENCY, payment_method: "pm_card_visa", payment_method_types: ["card"], confirm: true },
      { stripeAccount: acct },
    );
    console.log("  payment intent", pi.id, pi.status);
    await report(pi, { stripeAccount: acct });
  } catch (err) {
    console.log("  REJECTED by Stripe:", err.message);
  }
}

const account = await stripe.accounts.retrieve(acct);
console.log(`Account ${acct}: type=${account.type} country=${account.country} charges_enabled=${account.charges_enabled}`);
if (!account.charges_enabled) {
  console.error("Account cannot take charges yet - finish its test onboarding first.");
  process.exit(1);
}
await destinationCharge();
await directCharge();
console.log(`
How to read this:
- A) If the PLATFORM line shows a Stripe fee and the CONNECTED line shows fee 0.00, Snap pays the
  processing fee on every destination-charge payment. That is the leak.
- B) If the CONNECTED line shows the fee and no platform fee, the studio pays (matches the FAQ).
  If it is REJECTED, direct charges are not available for this connected account type.`);
