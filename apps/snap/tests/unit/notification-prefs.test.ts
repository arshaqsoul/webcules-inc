/* WEB-278 — studio alert toggle contract: the prefs JSON never silently
 * suppresses on corrupt/missing data, unknown kinds fall through to "on",
 * and only explicit boolean false mutes a branch. */
import { describe, expect, it } from "vitest";

import { notificationPrefValue, STUDIO_ALERT_KINDS } from "@/lib/notify-client";

describe("notificationPrefValue", () => {
  it("defaults every branch to on when nothing is stored", () => {
    expect(notificationPrefValue(null, "inquiry")).toBe(true);
    expect(notificationPrefValue(undefined, "storage")).toBe(true);
    expect(notificationPrefValue("", "booking")).toBe(true);
  });

  it("honors an explicit false and an explicit true", () => {
    const prefs = JSON.stringify({ inquiry: false, booking: true });
    expect(notificationPrefValue(prefs, "inquiry")).toBe(false);
    expect(notificationPrefValue(prefs, "booking")).toBe(true);
  });

  it("never mutes on corrupt JSON or non-boolean values", () => {
    expect(notificationPrefValue("{oops", "inquiry")).toBe(true);
    expect(notificationPrefValue(JSON.stringify({ inquiry: "no" }), "inquiry")).toBe(true);
    expect(notificationPrefValue(JSON.stringify({ inquiry: 0 }), "inquiry")).toBe(true);
  });

  it("leaves unknown keys and unlisted kinds on", () => {
    expect(notificationPrefValue(JSON.stringify({ weird: false }), "inquiry")).toBe(true);
    expect(notificationPrefValue(JSON.stringify({ inquiry: false }), "booking")).toBe(true);
  });

  it("covers exactly the toggleable branches (founder notices excluded)", () => {
    expect([...STUDIO_ALERT_KINDS].sort()).toEqual(
      ["booking", "booking_change", "contract_signed", "inquiry", "raw_archive", "storage"].sort(),
    );
  });
});
