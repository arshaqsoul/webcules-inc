"use client";

/* Copy-to-clipboard code block for the integration docs (WEB-169). */
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

export function DocsCode({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>}
      <div className="relative">
        <code className="block overflow-x-auto whitespace-pre rounded-lg bg-canvas px-3.5 py-3 pr-12 font-mono text-[12.5px] leading-relaxed text-ink-muted">
          {code}
        </code>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Copy code"
          className="absolute right-1.5 top-1.5 text-ink-subtle"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

/* Extraction marker — see lib/docs/primitives.tsx. */
(DocsCode as { docKind?: string }).docKind = "docs-code";
