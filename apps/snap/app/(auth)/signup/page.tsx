/* Signup step 1 — account + studio. The marketing pricing CTAs pass
 * ?plan=<tier> so the studio is created on that plan; paid tiers continue
 * straight into Stripe checkout after the studio exists. Already-logged-in
 * visitors land in the dashboard instead of a dead signup form. */
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

const PLANS = ["free", "lite", "studio", "pro"] as const;
type PlanChoice = (typeof PLANS)[number];

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const { plan } = await searchParams;
  const initialPlan: PlanChoice | null = PLANS.includes(plan as PlanChoice) ? (plan as PlanChoice) : null;
  return <SignupForm initialPlan={initialPlan} />;
}
