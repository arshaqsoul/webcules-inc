"use client";

import {
  CreditCard,
  FlaskConical,
  Hammer,
  Kanban,
  LayoutDashboard,
  LogOut,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/pricing", label: "Pricing", icon: Tags },
  { href: "/forge", label: "Forge import", icon: FlaskConical },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

export function Sidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">W</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Webcules</div>
          <div className="text-[11px] text-muted-foreground">client pipeline</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-secondary",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-auto rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <Hammer className="size-3.5" /> engine
          </div>
          <code className="block text-[11px] leading-5">/forge-redesign &lt;url&gt;</code>
          <code className="block text-[11px] leading-5">/forge-outreach &lt;slug&gt;</code>
        </div>
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            {(userName || userEmail).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium">{userName || "Admin"}</div>
            <div className="truncate text-[11px] text-muted-foreground">{userEmail}</div>
          </div>
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Sign out"
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
