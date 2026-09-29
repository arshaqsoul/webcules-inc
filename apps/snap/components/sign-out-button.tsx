"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";

import { signOut } from "@/lib/auth-client";

export function SignOutButton({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={iconOnly ? "Sign out" : undefined}
      title={iconOnly ? "Sign out" : undefined}
      className={compact ? "" : iconOnly ? "w-full justify-center px-0" : "w-full justify-start text-ink-subtle hover:text-ink"}
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {compact ? "Sign out" : !iconOnly && <span className="ml-2.5">Sign out</span>}
    </Button>
  );
}
