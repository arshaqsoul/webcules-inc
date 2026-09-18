import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { LoginForm } from "@/components/auth/login-form";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/");
  const countRows = await db.select({ n: sql<number>`count(*)` }).from(user);
  const firstRun = Number(countRows[0]?.n ?? 0) === 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-accent/60 via-background to-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-lg">W</div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Webcules pipeline</h1>
            <p className="text-sm text-muted-foreground">Redesign → pitch → close → maintain</p>
          </div>
        </div>
        <LoginForm firstRun={firstRun} />
      </div>
    </main>
  );
}
