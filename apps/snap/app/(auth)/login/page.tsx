import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/* Logged-in users hitting /login go straight to their dashboard. */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return <LoginForm />;
}
