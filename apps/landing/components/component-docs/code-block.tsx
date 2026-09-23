"use client";

/* Code block with Webcules purple syntax theme (prism-react-renderer).
 * `code` is highlighted client-side; `language` is derived from `title`. */
import { Check, Copy } from "lucide-react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

// Purple-tinted theme on the Webcules dark ink background.
// Keywords → violet-300 · strings/attrs → fuchsia accent · comments → muted purple
const WEBCULES_THEME: PrismTheme = {
  plain: { color: "#cfc7ec", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#6f6394", fontStyle: "italic" } },
    { types: ["keyword", "keyword-control", "rule", "important"], style: { color: "#c4b5fd" } },
    { types: ["string", "char", "attr-value"], style: { color: "#f0abfc" } },
    { types: ["function", "method"], style: { color: "#a78bfa" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "#d8b4fe" } },
    { types: ["tag"], style: { color: "#e879f9" } },
    { types: ["attr-name", "property-access"], style: { color: "#c4b5fd" } },
    { types: ["class-name", "maybe-class-name", "builtin"], style: { color: "#d8b4fe" } },
    { types: ["operator", "punctuation", "spread"], style: { color: "#8f83bd" } },
    { types: ["variable", "parameter"], style: { color: "#cfc7ec" } },
  ],
};

function languageFromTitle(title?: string): string {
  const ext = title?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx": return "tsx";
    case "ts": return "typescript";
    case "js": return "javascript";
    case "json": return "json";
    case "bash": case "sh": case "shell": return "bash";
    case "css": return "css";
    default: return "tsx";
  }
}

export function CodeBlock({
  code,
  title = "tsx",
  className,
}: {
  code: string;
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const language = languageFromTitle(title);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/10 bg-[#0d0d17] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-xs text-white/40">{title}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          className="h-7 gap-1.5 px-2 text-xs text-white/60 hover:text-white"
        >
          {copied ? (
            <Check className="size-3.5 text-fuchsia-300" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Highlight code={code.trimEnd()} language={language} theme={WEBCULES_THEME}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
