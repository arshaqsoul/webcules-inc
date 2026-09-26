"use client";

/* Promise-based confirm over the ui package's ConfirmDialog (WEB-170) —
 * mounted once in the dashboard layout; call sites swap window.confirm for
 * `await confirm({ title, body, destructive })` with zero per-component
 * dialog state. */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@webcules/ui/components/dialog";

export type ConfirmOptions = {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireText?: string;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setBusy(false);
    setOpts(null);
  }

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {opts && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next && !busy) settle(false);
          }}
          title={opts.title}
          body={opts.body}
          confirmLabel={opts.confirmLabel ?? (opts.destructive ? "Confirm" : "OK")}
          destructive={opts.destructive}
          requireText={opts.requireText}
          busy={busy}
          onConfirm={() => {
            setBusy(true);
            // let the caller's async work finish via the promise; dialogs for
            // pure confirmations resolve immediately after the click
            settle(true);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}
