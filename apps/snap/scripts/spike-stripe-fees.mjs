/* Spike G1 - who pays Stripe processing fees: destination charge vs direct charge.
 *
 * TEST MODE ONLY. Refuses any key that is not sk_test_.
 * Run it yourself so no key passes through an agent:
 *
 *   STRIPE_TEST_KEY=sk_test_... CONNECTED_ACCOUNT=acct_... node scripts/spike-stripe-fees.mjs
 *
 * CONNECTED_ACCOUNT must be an ACTIVE test-mode Express account from the Snap
 * staging onboarding (Settings -> Payouts), so it matches production's account type.
 *
 * It creates two $100.00 USD charges with the test card pm_card_visa:
 *   A) destination charge (what booking checkout does today): transfer_data.destination, no application fee
 *   B) direct charge (what C2 assumes and what invoices do): Stripe-Account header, no application fee
 * For each it reads the balance transactions on BOTH the platform and the connected
 * account and prints who was debited the processing fee.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_KEY ?? "";
const acct = process.env.CONNECTED_ACCOUNT ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_TEST_KEY must be a sk_test_ key.");
  process.exit(1);
}
if (!acct.startsWith("acct_")) {
  console.error("Set CONNECTED_ACCOUNT to an active test-mode Express account id.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
const AMOUNT = 10_000;
const usd = (n) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toFixed(2)}`;

async function listBt(opts, label) {
  const bts = await stripe.balanceTransactions.list({ limit: 5 }, opts);
  console.log(`  ${label} balance transactions (newest first):`);
  for (const bt of bts.data) {
    console.log(`    ${bt.type.padEnd(22)} amount ${usd(bt.amount).padStart(9)}  fee ${usd(bt.fee).padStart(7)}  net ${usd(bt.net).padStart(9)}`);
  }
}

async function destinationCharge() {
  console.log("\nA) DESTINATION charge, no application fee (current booking checkout)");
  const pi = await stripe.paymentIntents.create({
    amount: AMOUNT,
    currency: "usd",
    payment_method: "pm_card_visa",
    payment_method_types: ["card"],
    confirm: true,
    transfer_data: { destination: acct },
  });
  console.log("  payment intent", pi.id, pi.status);
  await listBt(undefined, "PLATFORM");
  await listBt({ stripeAccount: acct }, "CONNECTED");
}

async function directCharge() {
  console.log("\nB) DIRECT charge on the connected account, no application fee (invoices, C2 plan)");
  const pi = await stripe.paymentIntents.create(
    {
      amount: AMOUNT,
      currency: "usd",
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      confirm: true,
    },
    { stripeAccount: acct },
  );
  console.log("  payment intent", pi.id, pi.status);
  await listBt(undefined, "PLATFORM");
  await listBt({ stripeAccount: acct }, "CONNECTED");
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
- A) If the PLATFORM list shows a payment row with a fee of about $3.20 (2.9% + 30c) and the
  CONNECTED list shows a transfer-in of the full $100.00 with fee $0.00, Snap pays the processing
  fee on every booking payment. That is the leak.
- B) If the CONNECTED list shows the payment with the fee and the PLATFORM list shows no new fee,
  the studio pays, which matches the FAQ.
- Record both results, plus the Connect account/payout fees from the Stripe dashboard billing page,
  on the spike issue.`);
