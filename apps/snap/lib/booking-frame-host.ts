/* Host-side script for the standalone booking page /b/{slug} (WEB-165).
 *
 * The page hosts the calendar widget in a same-origin iframe. The widget reports
 * two things to its parent with postMessage:
 *   - snap:height   - grow/shrink the frame
 *   - snap:checkout - a paid booking: navigate the whole page to Stripe Checkout
 * Without the checkout branch a paid booking hangs on "Redirecting to secure
 * payment..." forever (WEB-352 staging test). The URL is validated exactly like
 * embed/loader.js: it must be a Stripe Checkout URL. Kept as a string builder so
 * the behavior is unit-tested with stubbed window/document objects. */

export const STRIPE_CHECKOUT_PREFIX = "https://checkout.stripe.com/";

export function bookingFrameHostScript(frameId = "snap-booking-frame"): string {
  return `(function () {
  window.addEventListener("message", function (e) {
    var f = document.getElementById(${JSON.stringify(frameId)});
    if (!f || e.source !== f.contentWindow) return;
    var d = e.data || {};
    if (d.type === "snap:checkout") {
      if (e.origin === window.location.origin && typeof d.url === "string" && d.url.indexOf(${JSON.stringify(STRIPE_CHECKOUT_PREFIX)}) === 0) {
        window.location.href = d.url;
      }
      return;
    }
    if (d.type === "snap:height" && typeof d.height === "number") {
      f.style.height = Math.max(420, Math.round(d.height) + 16) + "px";
    }
  });
})();`;
}
