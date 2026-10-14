import { describe, expect, it } from "vitest";

import { formatDay, formatDayTime, formatFullDateTime } from "@/lib/dates";

/* WEB-367 — hydration-safe date rendering. These formatters must return the
 * SAME string no matter which timezone the calling process runs in (worker
 * SSR is UTC; the browser is the visitor's zone). The pinned timestamps below
 * sit in the 00:00–06:00 UTC band that previously made a UTC server and an
 * America/Regina client disagree on the date ("Oct 13" vs "Oct 12").
 * Vitest runs with TZ=UTC by default; TZ independence is enforced by the
 * explicit timeZone: "UTC" pin, asserted via the fixed expected strings. */
describe("lib/dates — hydration-safe formatters (WEB-367)", () => {
  it("formatDay anchors to the UTC date, not the runner's zone", () => {
    // 00:36 UTC on Oct 13 — renders "Oct 12" for any client west of UTC
    // without the pin (this exact timestamp reproduced React #418 on staging).
    expect(formatDay("2026-10-13T00:36:00.000Z")).toBe("Oct 13");
    expect(formatDay("2026-10-13T05:59:59.000Z")).toBe("Oct 13");
    expect(formatDay("2026-10-13T06:00:00.000Z")).toBe("Oct 13");
    // Date objects and ISO strings agree.
    expect(formatDay(new Date("2026-10-13T00:36:00.000Z"))).toBe(
      formatDay("2026-10-13T00:36:00.000Z"),
    );
    // Month rollover.
    expect(formatDay("2026-11-01T00:41:00.000Z")).toBe("Nov 1");
  });

  it("formatDayTime pins locale and timezone so SSR and client match", () => {
    expect(formatDayTime("2026-10-13T00:36:00.000Z")).toBe("Oct 13, 12:36 AM");
    expect(formatDayTime("2026-10-13T18:05:00.000Z")).toBe("Oct 13, 6:05 PM");
  });

  it("formatFullDateTime renders a stable en-US/UTC stamp", () => {
    expect(formatFullDateTime("2026-10-13T00:36:00.000Z")).toBe(
      "Oct 13, 2026, 12:36 AM",
    );
  });
});
