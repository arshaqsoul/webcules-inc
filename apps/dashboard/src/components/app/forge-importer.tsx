"use client";

import { Download, FlaskConical, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importForgeProject } from "@/app/actions";
import { cad } from "@/lib/utils";

export type ForgeItem = {
  slug: string;
  business: string;
  industry: string;
  previewUrl: string | null;
  grade: { uiux: string; conversion: string; ai: string };
  oneTime: number;
  alreadyImported: boolean;
};

export function ForgeImporter({ initial, scanError }: { initial: ForgeItem[]; scanError: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();

  if (scanError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Scan failed</CardTitle>
          <CardDescription>{scanError}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set <code className="rounded bg-secondary px-1">FORGE_ROOT</code> in <code className="rounded bg-secondary px-1">.env.local</code> to the folder that holds the
            generated sites (it contains <code className="rounded bg-secondary px-1">&lt;name&gt;/research/gtm.json</code>), then reload this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" className="self-start" onClick={() => router.refresh()} disabled={pending}>
        <RefreshCw /> Rescan
      </Button>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-muted-foreground" /> No redesigns found
            </CardTitle>
            <CardDescription>
              Run <code className="rounded bg-secondary px-1 py-0.5 text-xs">/forge-redesign https://their-site.ca</code> first. Once it writes{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-xs">gtm.json</code> and you deploy the preview, the lead lands here ready to import.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.slug} className={item.alreadyImported ? "opacity-70" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{item.business}</CardTitle>
                    <CardDescription>
                      {item.slug} · {item.industry || "—"}
                    </CardDescription>
                  </div>
                  {item.alreadyImported ? (
                    <Badge variant="muted">imported</Badge>
                  ) : (
                    <Badge variant="info">{cad(item.oneTime)} quote</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex gap-2 text-xs">
                  <span className="rounded bg-secondary px-1.5 py-0.5">UI/UX {item.grade?.uiux ?? "—"}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5">CRO {item.grade?.conversion ?? "—"}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5">AI {item.grade?.ai ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {item.previewUrl ? (
                    <a href={item.previewUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">
                      {item.previewUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">no preview URL yet — run forge deploy</span>
                  )}
                  {!item.alreadyImported && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const res = await fetch("/api/forge/import", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ slug: item.slug }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error ?? "Import failed");
                            toast.success(`${item.business} imported as a lead`);
                            setItems((prev) => prev.map((x) => (x.slug === item.slug ? { ...x, alreadyImported: true } : x)));
                            router.refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Import failed");
                          }
                        })
                      }
                    >
                      <Download /> Import lead
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
