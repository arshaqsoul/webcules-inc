/* WEB-352: the /b/{slug} host page must follow the widget's snap:checkout message,
 * otherwise a paid booking hangs on "Redirecting to secure payment...". The script is
 * run against stubbed window/document objects (the test runtime has no DOM). */
import { describe, expect, it } from "vitest";

import { STRIPE_CHECKOUT_PREFIX, bookingFrameHostScript } from "@/lib/booking-frame-host";

type Handler = (e: { origin: string; source: unknown; data: unknown }) => void;

function mount() {
  const frameWindow = {};
  const frame = { contentWindow: frameWindow, style: { height: "" } };
  let handler: Handler | null = null;
  const win = {
    location: { origin: "https://snaphq.app", href: "https://snaphq.app/b/studio" },
    addEventListener: (_: string, h: Handler) => {
      handler = h;
    },
  };
  const doc = { getElementById: (id: string) => (id === "snap-booking-frame" ? frame : null) };
  new Function("window", "document", bookingFrameHostScript())(win, doc);
  const send = (e: Partial<{ origin: string; source: unknown; data: unknown }>) =>
    handler!({ origin: "https://snaphq.app", source: frameWindow, data: {}, ...e });
  return { win, frame, frameWindow, send };
}

describe("booking page host script (WEB-352)", () => {
  it("navigates to Stripe Checkout when the widget posts snap:checkout", () => {
    const { win, send } = mount();
    const url = `${STRIPE_CHECKOUT_PREFIX}c/pay/cs_test_123`;
    send({ data: { type: "snap:checkout", url } });
    expect(win.location.href).toBe(url);
  });

  it("ignores checkout messages from anything but its own frame or origin", () => {
    const { win, send } = mount();
    const url = `${STRIPE_CHECKOUT_PREFIX}c/pay/cs_test_123`;
    send({ source: {}, data: { type: "snap:checkout", url } });
    send({ origin: "https://evil.example", data: { type: "snap:checkout", url } });
    expect(win.location.href).toBe("https://snaphq.app/b/studio");
  });

  it("refuses any URL that is not a Stripe Checkout URL", () => {
    const { win, send } = mount();
    for (const url of ["https://evil.example/pay", "http://checkout.stripe.com/x", "javascript:alert(1)", "https://checkout.stripe.com.evil.example/x", 42]) {
      send({ data: { type: "snap:checkout", url } });
    }
    expect(win.location.href).toBe("https://snaphq.app/b/studio");
  });

  it("still resizes the frame from snap:height", () => {
    const { frame, send } = mount();
    send({ data: { type: "snap:height", height: 700 } });
    expect(frame.style.height).toBe("716px");
    send({ data: { type: "snap:height", height: 100 } });
    expect(frame.style.height).toBe("420px");
  });
});
