import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Sidebar } from "@/components/app/sidebar";
import { auth } from "@/lib/auth";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={session.user.email} userName={session.user.name} />
      <main className="flex-1 min-w-0 bg-background">
        <div className="mx-auto max-w-7xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
