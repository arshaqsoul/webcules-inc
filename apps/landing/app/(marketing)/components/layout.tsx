import type { ReactNode } from "react";

import { ComponentsSidebar } from "@/components/wildcode-docs/components-sidebar";

/* Docs layout: left component sidebar + content. The `.dark` scope makes all
   shadcn semantic tokens (tabs, buttons, selects, checkboxes) resolve to the
   dark palette so they match the permanently-dark marketing theme. */
export default function ComponentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark mx-auto flex w-full max-w-6xl gap-12 px-6 pb-28 pt-28">
      <ComponentsSidebar />
      <div className="min-w-0 max-w-3xl flex-1">{children}</div>
    </div>
  );
}
