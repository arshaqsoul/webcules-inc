"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-full justify-start text-ink-subtle hover:text-ink"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      <span className="ml-2.5">{isDark ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
