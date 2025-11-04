"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth-actions";
import { useRouter } from "next/navigation";
import { Button } from "@webcules/ui/components/button";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const result = await logoutAction();
    if (result.success) {
      router.push("/signin");
    }
  };

  return (
    <Button
      variant={"secondary"}
      className="cursor-pointer rounded-3xl px-4 py-2"
      onClick={handleLogout}
    >
      <LogOut className="mr-1 h-4 w-4" />
      <span>Log Out</span>
    </Button>
  );
}
