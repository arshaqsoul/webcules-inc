import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { leads, payments, projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { appUrl, getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured — set STRIPE_SECRET_KEY in .env.local" }, { status: 400 });
  }

  // route handlers are trusted (same-origin dashboard) but still require a session
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { leadId, mode } = (await req.json()) as { leadId: string; mode: "payment" | "subscription" };
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const [project] = await db.select().from(projects).where(eq(projects.leadId, leadId)).limit(1);

  const oneTimeCents = (project?.quoteOneTime ?? 799) * 100;
  const monthlyCents = (project?.quoteMaintenance ?? 10) * 100;

  const checkout = await stripe.checkout.sessions.create({
    mode,
    customer_creation: mode === "payment" ? "always" : undefined,
    line_items: [
      {
        quantity: 1,
        ...(mode === "payment"
          ? {
              price_data: {
                currency: "cad",
                unit_amount: oneTimeCents,
                product_data: { name: `${lead.business} — website redesign & launch`, description: "One-time. Domain switch included." },
              },
            }
          : {
              price_data: {
                currency: "cad",
                unit_amount: monthlyCents,
                recurring: { interval: "month" },
                product_data: { name: "Webcules care plan", description: "Hosting, edits within 48h, monthly AI-readiness check. Cancel anytime." },
              },
            }),
      },
    ],
    metadata: { leadId, business: lead.business },
    success_url: `${appUrl()}/leads/${leadId}?stripe=success`,
    cancel_url: `${appUrl()}/leads/${leadId}?stripe=cancelled`,
  });

  if (mode === "payment") {
    // pending row — webhook flips it to paid; if the webhook isn't armed yet, mark manually
    await db.insert(payments).values({
      id: crypto.randomUUID(),
      leadId,
      kind: "one_time",
      method: "stripe",
      amountCents: oneTimeCents,
      status: "pending",
      stripeRef: checkout.id,
      note: "Stripe checkout link sent",
    });
  }

  return NextResponse.json({ url: checkout.url });
}
