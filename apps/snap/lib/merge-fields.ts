/* Merge-field registry (WEB-247/251) - pure data only, safe for client
 * bundles (designer picker UIs import from here; the resolver lives in
 * lib/merge.ts). */
export type MergeField = {
  id: string;
  label: string;
  description: string;
  /** Renders a URL — auto-linked on HTML surfaces. */
  link?: boolean;
  /** Contract-era alias kept so existing drafts keep resolving. */
  legacy?: boolean;
};

/** The registry — also feeds every designer's {{…}} picker. */
export const MERGE_FIELDS: MergeField[] = [
  { id: "client_name", label: "Client name", description: "The client's display name" },
  { id: "client_email", label: "Client email", description: "The client's email address" },
  { id: "client_phone", label: "Client phone", description: "The client's phone number, when known" },
  { id: "studio_name", label: "Studio name", description: "Your studio's name" },
  { id: "studio_email", label: "Studio email", description: "Your contact email" },
  { id: "project_title", label: "Project", description: "The project or collection title" },
  { id: "event_date", label: "Event date", description: "The project's event date (e.g. June 14, 2027)" },
  { id: "session_type", label: "Session type", description: "The booked session type (Wedding, Mini…)" },
  { id: "total", label: "Package total", description: "The project's quoted total, when set" },
  { id: "deposit", label: "Deposit", description: "The booking deposit amount, when configured" },
  { id: "studio_legal_name", label: "Studio legal name", description: "Your studio's name for agreement language" },
  { id: "client_legal_name", label: "Client legal name", description: "The client's full name for agreement language" },
  { id: "event_date_long", label: "Event date (long)", description: "The event date spelled out (June 14, 2027)" },
  { id: "invoice_number", label: "Invoice number", description: "The invoice's number (e.g. INV-014)" },
  { id: "invoice_total", label: "Invoice total", description: "The invoice total with currency" },
  { id: "today", label: "Today", description: "Today's date" },
  { id: "booking_link", label: "Booking link", description: "Your public booking page", link: true },
  { id: "gallery_link", label: "Gallery link", description: "The client's gallery link", link: true },
  { id: "portal_link", label: "Portal link", description: "The client portal sign-in", link: true },
  { id: "sign_url", label: "Signing link", description: "The contract's signing link", link: true },
  // Legacy contract aliases ({{date}}, {{package}}) — resolvers identical to
  // today's mergeContractBody so existing drafts are unchanged.
  { id: "date", label: "Today", description: "Today's date", legacy: true },
  { id: "package", label: "Project", description: "The project or collection title", legacy: true },
];

/** The five fields the contract composer offers (WEB-158 set + order). */
export const CONTRACT_MERGE_FIELDS = ["client_name", "studio_name", "date", "event_date", "package"]
  .map((id) => MERGE_FIELDS.find((f) => f.id === id))
  .filter((f): f is MergeField => Boolean(f));
