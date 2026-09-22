import React, { Suspense, lazy } from "react";
import { demos } from "./registry";

/** Statically-imported island: Astro requires a static component for client: hydration,
 *  so the dynamic per-demo import happens inside React.lazy on the client instead. */
export default function DemoLoader({
  slug,
  variant = "",
  layout = "wide",
  hook = "",
  panel = false,
}: {
  slug: string;
  variant?: string;
  layout?: string;
  hook?: string;
  panel?: boolean;
}) {
  const entry = demos[slug];
  if (!entry) return <div style={{ color: "#fff", padding: 24 }}>no demo "{slug}"</div>;
  const Demo = lazy(entry.load);
  return (
    <Suspense fallback={null}>
      <Demo variant={variant} layout={layout} hook={hook} panel={panel} />
    </Suspense>
  );
}
