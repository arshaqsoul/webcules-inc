/* WEB-335 - the unmatched email's sender pre-fills the "connect a client" prompt. */
import { describe, expect, it } from "vitest";

import { senderFromTriageTitle } from "@/lib/inbox/triage";

describe("senderFromTriageTitle", () => {
  it("reads a bare address and a name + address", () => {
    expect(senderFromTriageTitle("Unmatched email — dana@t.test")).toEqual({ email: "dana@t.test", name: null });
    expect(senderFromTriageTitle("Unmatched email — Dana Lee <Dana@T.test>")).toEqual({ email: "dana@t.test", name: "Dana Lee" });
    expect(senderFromTriageTitle('Unmatched email — "Dana" <dana@t.test>')).toEqual({ email: "dana@t.test", name: "Dana" });
    expect(senderFromTriageTitle("Unmatched email - dana@t.test")).toEqual({ email: "dana@t.test", name: null });
  });

  it("returns null when there is no usable sender", () => {
    for (const t of ["Unmatched email", "", null, undefined, "Unmatched email — not an address", "Unmatched email — <>"]) {
      expect(senderFromTriageTitle(t as string | null | undefined), String(t)).toBeNull();
    }
  });
});
