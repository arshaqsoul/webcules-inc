"use client";

/* Installation tabs for the docs: shadcn CLI vs manual copy-paste.
 * The Manual tab fetches /r/<name>.json (the shadcn registry file) so the
 * shown source is always exactly what the CLI would install. */
import { Check, Copy, Download, FileCode2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@webcules/ui/components/tabs";

import { CodeBlock } from "./code-block";


const PREREQS: { name: string; why: string; install: string | null }[] = [
  { name: "React 19", why: "client component, ref-as-prop API", install: null },
  { name: "Tailwind CSS", why: "utility classes on the wrapper + canvas styles", install: null },
  { name: "cn() helper", why: "className merging (shadcn's cn — already in your project after shadcn init)", install: "npx shadcn@latest init" },
  { name: "lucide-react", why: "only needed for the docs demo controls, not the component itself", install: "pnpm add lucide-react" },
];

type RegistryFile = { path: string; type: string; content: string };

function useRegistry(siteUrl: string, name: string) {
  const [files, setFiles] = useState<RegistryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${siteUrl}/r/${name}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (alive) setFiles(json.files as RegistryFile[]); })
      .catch((e) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [siteUrl]);
  return { files, error };
}

function CopyAllButton({ files }: { files: RegistryFile[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n"));
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard unavailable */ }
      }}
      className="gap-1.5"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "All files copied" : "Copy all files"}
    </Button>
  );
}

export function InstallTabs({ siteUrl, name }: { siteUrl: string; name: string }) {
  const { files, error } = useRegistry(siteUrl, name);
  const cliCmd = `npx shadcn@latest add "${siteUrl}/r/${name}.json"`;

  return (
    <Tabs defaultValue="cli" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="cli" className="gap-1.5">
          <Download className="size-3.5" /> CLI
        </TabsTrigger>
        <TabsTrigger value="manual" className="gap-1.5">
          <FileCode2 className="size-3.5" /> Manual
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cli">
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Requires the shadcn CLI. Run this from your project root — it writes the component source, then you import and go.
          </p>
          <CodeBlock code={cliCmd} title="bash" />
          <p className="text-xs text-white/40">
            The command installs the component source (plus its engine / type
            files when the component ships one). No other dependencies —
            everything is dependency-free canvas, SVG and CSS.
          </p>
        </div>
      </TabsContent>

      <TabsContent value="manual">
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-white/80">Prerequisites</h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-white/[0.06]">
                  {PREREQS.map((p) => (
                    <tr key={p.name}>
                      <td className="px-4 py-2.5 font-mono text-[13px] font-medium text-white">{p.name}</td>
                      <td className="px-4 py-2.5 text-white/60">{p.why}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-violet-300/80">
                        {p.install ?? "included"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white/80">
                Source files {files ? <span className="text-white/40">({files.length})</span> : null}
              </h3>
              {files ? <CopyAllButton files={files} /> : null}
            </div>
            <p className="mb-4 text-sm text-white/60">
              Copy these into your project (paths relative to your components
              folder), then import:
            </p>
            <CodeBlock
              title="import"
              code={`import { ${name.replace(/(^|-)([a-z])/g, (_, a, b) => (a ? a.toUpperCase() : "") + b.toUpperCase())} from "@/components/${name}";`}
            />
          </div>

          {error ? (
            <p className="text-sm text-red-400">
              Could not load the registry file ({error}). Serve the app and retry,
              or copy the files from{" "}
              <code className="font-mono">packages/ui/src/components/</code>.
            </p>
          ) : null}

          {files
            ? files.map((f) => (
                <details key={f.path} className="group rounded-xl border border-white/10 bg-white/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-white/70">
                    <FileCode2 className="size-4 text-white/40" />
                    <span className="font-mono text-[13px]">{f.path}</span>
                    <span className="ml-auto text-xs text-white/30">
                      {(f.content.length / 1024).toFixed(1)} kB — click to expand
                    </span>
                  </summary>
                  <div className="p-3 pt-0">
                    <CodeBlock code={f.content} title={f.path.split("/").pop()} />
                  </div>
                </details>
              ))
            : (
              <p className="text-sm text-white/40">Loading source files…</p>
            )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
