"use client";

/* Small client-side bits for the portal (WEB-130/133). */
export function PortalSignOut() {
  return (
    <button
      type="button"
      onClick={() => {
        void fetch("/portal/api/logout", { method: "POST" }).then(() => {
          window.location.href = "/portal/login";
        });
      }}
      className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-subtle hover:text-ink"
    >
      Sign out
    </button>
  );
}
