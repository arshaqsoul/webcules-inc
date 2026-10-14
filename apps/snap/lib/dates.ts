/* Hydration-safe date formatting (WEB-367).
 *
 * SSR runs on a Cloudflare worker (UTC) while the client hydrates in the
 * visitor's local timezone. Any date format that leaves `timeZone` unset
 * renders different strings on each side whenever a timestamp's UTC date
 * differs from the client-local date, which React reports as hydration
 * error #418 and answers by discarding the server HTML.
 *
 * Every formatter below pins locale AND timeZone: "UTC" so server and client
 * render byte-identical strings. Event/booking dates are day-granular
 * business data anchored to UTC when entered and stored — displaying them in
 * UTC matches that. Keep helpers pure (no JSX, no next/headers) so they stay
 * unit-testable under workerd. */

/** Short day label: "Oct 13". Kanban cards, inbox relative-time fallback. */
export function formatDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Short day + time label: "Oct 13, 4:36 AM" (UTC). Inbox message stamps. */
export function formatDayTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Full date + time label: "Oct 13, 2026, 4:36 AM" (UTC). Triage detail. */
export function formatFullDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}
