"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";

import { signOut } from "@/lib/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={compact ? "" : "w-full justify-start text-ink-subtle hover:text-ink"}
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {compact ? "Sign out" : <span className="ml-2.5">Sign out</span>}
    </Button>
  );
}
