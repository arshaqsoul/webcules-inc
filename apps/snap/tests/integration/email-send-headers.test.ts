/* WEB-334 - what sendEmail hands to the Email Service binding. */
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sendEmail, sendEmailDetailed } from "@/lib/email";
import { resetDb } from "../helpers/db";

type Sent = { to: string; from: string; headers?: Record<string, string> };
let sent: Sent[] = [];
const original = (env as { EMAIL?: unknown }).EMAIL;

beforeEach(async () => {
  await resetDb();
  sent = [];
  (env as { EMAIL?: unknown }).EMAIL = {
    send: async (m: Sent) => {
      sent.push(m);
      return { messageId: "<svc-id-1@snaphq.app>" };
    },
  };
});
afterEach(() => {
  (env as { EMAIL?: unknown }).EMAIL = original;
});

const base = { to: "client@example.test", subject: "Re: hello", html: "<p>hi</p>", text: "hi", template: "inbox.reply" };

describe("sendEmailDetailed", () => {
  it("strips Message-ID and Thread-Index before the service sees them, and returns the service's Message-ID", async () => {
    const r = await sendEmailDetailed({
      ...base,
      fromOverride: "t-0b9d2f3e-1c4a-4e5b-8f6a-7d8e9f0a1b2c-abc123@snaphq.app",
      headers: {
        "Message-ID": "<mine@snaphq.app>",
        "Thread-Index": "AAAA",
        "In-Reply-To": "<prior@snaphq.app>",
        References: "<prior@snaphq.app>",
        "X-Snap-Thread-ID": "t1",
      },
    });
    expect(r).toEqual({ ok: true, messageId: "<svc-id-1@snaphq.app>" });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers).toEqual({
      "In-Reply-To": "<prior@snaphq.app>",
      References: "<prior@snaphq.app>",
      "X-Snap-Thread-ID": "t1",
    });
    expect(sent[0].from).toContain("t-0b9d2f3e-1c4a-4e5b-8f6a-7d8e9f0a1b2c-abc123@snaphq.app");
  });

  it("sendEmail stays a boolean and still reports a binding failure as false", async () => {
    expect(await sendEmail(base)).toBe(true);
    (env as { EMAIL?: unknown }).EMAIL = {
      send: async () => {
        throw new Error("custom header 'Message-ID' is not allowed");
      },
    };
    expect(await sendEmail(base)).toBe(false);
    expect(await sendEmailDetailed(base)).toEqual({ ok: false, messageId: null });
  });

  it("refuses a from-override outside the Snap mail domain", async () => {
    await expect(sendEmailDetailed({ ...base, fromOverride: "x@legacy-evil.test" })).rejects.toThrow();
  });
});
