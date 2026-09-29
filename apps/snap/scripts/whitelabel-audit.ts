/* WEB-245 white-label launch-gate audit — greps LIVE client surfaces of a
 * white-labeled studio for platform mentions. Run against any environment:
 *
 *   pnpm exec tsx scripts/whitelabel-audit.ts \
 *     --base https://snap.webcules.com --slug your-studio \
 *     [--gallery <token>] [--invoice <token>] [--contract <token>] [--portal]
 *
 * The portal flow needs a session; pass --portal to be reminded of the manual
 * step. Gallery/invoice/contract tokens are the share URLs' path segments.
 * Exit 1 on any platform mention; the origin hostname itself is NOT a
 * violation (the from-address/link-host honest limit covers it). */

const NEEDLES = [
  "via Snap",
  "Delivered by Snap",
  "Powered by Snap",
  "· Snap</title>",
  ">Snap<",
  "Snap portal",
  "Open in Snap",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function audit(label: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const html = await res.text();
    const hits = NEEDLES.filter((n) => html.includes(n));
    if (hits.length > 0) {
      console.log(`✗ ${label} [${res.status}] — platform mentions: ${hits.join(", ")}`);
      return false;
    }
    console.log(`✓ ${label} [${res.status}] — clean`);
    return true;
  } catch (err) {
    console.log(`✗ ${label} — fetch failed: ${String(err)}`);
    return false;
  }
}

async function main() {
  const base = arg("base") ?? "https://snap.webcules.com";
  const slug = arg("slug");
  if (!slug) {
    console.error("--slug is required (the studio's booking-page slug)");
    process.exit(2);
  }
  const results: boolean[] = [];
  results.push(await audit("booking /b/" + slug, `${base}/b/${slug}`));
  const gallery = arg("gallery");
  if (gallery) results.push(await audit("gallery /g/", `${base}/g/${gallery}`));
  else console.log("- gallery: skipped (pass --gallery <token>; OTP gate HTML is server-rendered and auditable)");
  const invoice = arg("invoice");
  if (invoice) results.push(await audit("invoice /inv/", `${base}/inv/${invoice}`));
  else console.log("- invoice: skipped (pass --invoice <token>)");
  const contract = arg("contract");
  if (contract) results.push(await audit("contract /c/", `${base}/c/${contract}`));
  else console.log("- contract: skipped (pass --contract <token>)");
  if (process.argv.includes("--portal")) {
    console.log("- portal: manual step — open /portal signed in as a client of ONLY this studio; the wordmark must be absent");
  }
  console.log(results.every(Boolean) ? "AUDIT PASS" : "AUDIT FAIL");
  process.exit(results.every(Boolean) ? 0 : 1);
}

void main();
