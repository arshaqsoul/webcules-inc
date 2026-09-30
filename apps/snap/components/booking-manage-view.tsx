"use client";

/* Client side of the public manage-booking page (WEB-272). Server-resolved
 * truth (booking state, cutoffs) arrives as props; this component owns the
 * interactions: the reschedule iframe (same widget as the booking page, in
 * manage mode) and the cutoff-gated cancel flow. Every mutation ends in a
 * reload so the page re-renders from server truth. */
import { useEffect, useRef, useState } from "react";

type Props = {
  studioName: string;
  accent: string;
  logoUrl: string | null;
  contactEmail: string | null;
  whiteLabel: boolean;
  sessionTypeName: string | null;
  startAtIso: string;
  endAtIso: string;
  tz: string;
  status: string;
  paymentStatus: string;
  rescheduleAllowed: boolean;
  cancelAllowed: boolean;
  refundPolicyText: string | null;
  embedKey: string;
  manageToken: string;
  rescheduledFromIso: string | null;
  /** Live ICS link (regenerated from the booking row — always current). */
  icsUrl: string | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Not prepaid",
  deposit_paid: "Deposit paid",
  paid: "Paid",
};

function fmtWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

export function BookingManageDenied({
  reason,
  studioName,
  contactEmail,
  accent = "#5e6ad2",
}: {
  reason: "dead" | "unknown";
  studioName?: string;
  contactEmail?: string | null;
  accent?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8 text-center">
        {studioName && (
          <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
            {studioName}
          </span>
        )}
        <h1 className="mt-3 text-xl font-semibold text-ink">
          {reason === "dead" ? "This link is no longer active" : "This link doesn't look right"}
        </h1>
        <p className="mt-2 text-sm text-ink-subtle">
          {reason === "dead"
            ? "Your manage-booking link was turned off or replaced. Nothing is wrong with your booking — reach out to your studio and they can help or send a fresh link."
            : "Check that you opened the full link from your booking email."}
        </p>
        {reason === "dead" && contactEmail && (
          <a href={`mailto:${contactEmail}`} className="mt-4 inline-block text-sm font-medium" style={{ color: accent }}>
            {contactEmail}
          </a>
        )}
      </div>
    </main>
  );
}

export function BookingManageView(props: Props) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelStep, setCancelStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [cancelError, setCancelError] = useState("");
  const [frameHeight, setFrameHeight] = useState(620);
  const frameHostRef = useRef<HTMLDivElement | null>(null);

  const startAt = new Date(props.startAtIso);
  const canceled = props.status === "canceled";
  const wasPaid = props.paymentStatus !== "unpaid";

  // Visitor-tz rendering happens post-hydration only — computing it during
  // render mismatches the server (workers run UTC) and kills hydration.
  const [visitorWhen, setVisitorWhen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (visitorTz && visitorTz !== props.tz) {
        setVisitorWhen(
          new Intl.DateTimeFormat("en-US", {
            timeZone: visitorTz, weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
          }).format(startAt),
        );
      }
    } catch {
      /* studio tz only */
    }
  }, [props.tz, props.startAtIso]);

  // Widget height sync + "moved" notification from the manage-mode iframe
  // (same-origin — the widget posts to its referrer's origin).
  useEffect(() => {
    if (!showReschedule) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; height?: number } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "snap:height" && typeof data.height === "number") {
        setFrameHeight(Math.min(Math.max(data.height, 360), 2400));
      } else if (data.type === "snap:rescheduled") {
        window.location.reload();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showReschedule]);

  useEffect(() => {
    if (showReschedule) frameHostRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showReschedule]);

  async function confirmCancel() {
    setCancelStep("busy");
    setCancelError("");
    try {
      const res = await fetch(`/api/booking-manage/${props.manageToken}/cancel`, { method: "POST" });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "cutoff_passed") {
        // The clock crossed the studio's cutoff since the page loaded —
        // reload so the server-rendered contact path takes over.
        window.location.reload();
        return;
      }
      setCancelError(body.error === "rate_limited" ? "Too many tries — please wait a minute." : "Couldn't cancel — please try again or contact the studio.");
      setCancelStep("confirm");
    } catch {
      setCancelError("Network error — please try again.");
      setCancelStep("confirm");
    }
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60";

  return (
    <main className="flex min-h-screen justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-xl flex-col gap-4">
        {/* Studio header */}
        <div className="flex items-center gap-3 px-1">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt={props.studioName} className="max-h-9 max-w-[170px] object-contain" />
          ) : (
            <span className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: props.accent }}>
              {props.studioName}
            </span>
          )}
          <span className="ml-auto text-xs text-ink-tertiary">Manage booking</span>
        </div>

        {canceled ? (
          <section className="rounded-2xl border border-hairline bg-surface p-8 text-center">
            <h1 className="text-xl font-semibold text-ink">This booking is canceled</h1>
            <p className="mt-2 text-sm text-ink-subtle">
              The session scheduled for {fmtWhen(props.startAtIso, props.tz)} was canceled
              {wasPaid ? " — your studio will process any refund per their policy" : ""}.
            </p>
            {props.contactEmail && (
              <p className="mt-3 text-sm text-ink-subtle">
                Questions?{" "}
                <a href={`mailto:${props.contactEmail}`} className="font-medium" style={{ color: props.accent }}>
                  {props.contactEmail}
                </a>
              </p>
            )}
          </section>
        ) : (
          <>
            {/* Details */}
            <section className="rounded-2xl border border-hairline bg-surface p-6">
              <h1 className="text-lg font-semibold text-ink">
                {props.sessionTypeName ?? "Photo session"}
              </h1>
              <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3">
                <p className="text-[15px] font-semibold text-ink">{fmtWhen(props.startAtIso, props.tz)}</p>
                {visitorWhen && <p className="mt-0.5 text-sm text-ink-subtle">{visitorWhen} · your time</p>}
              </div>
              {props.rescheduledFromIso && (
                <p className="mt-2 text-xs text-ink-tertiary">
                  Rescheduled from {fmtWhen(props.rescheduledFromIso, props.tz)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
                  {PAYMENT_LABEL[props.paymentStatus] ?? props.paymentStatus}
                </span>
                {props.icsUrl && !canceled && (
                  <a href={props.icsUrl} className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-ink-muted hover:text-ink">
                    Add to calendar
                  </a>
                )}
              </div>
              <p className="mt-4 text-sm text-ink-subtle">
                Want a different time, or need to cancel? You can manage it right here.
              </p>
            </section>

            {/* Actions */}
            {(props.rescheduleAllowed || props.cancelAllowed) ? (
              <section className="rounded-2xl border border-hairline bg-surface p-6">
                {cancelStep === "idle" && (
                  <div className="flex flex-wrap gap-2">
                    {props.rescheduleAllowed && (
                      <button
                        className={`${btn} text-white`}
                        style={{ background: props.accent }}
                        onClick={() => setShowReschedule((v) => !v)}
                      >
                        {showReschedule ? "Hide calendar" : "Reschedule"}
                      </button>
                    )}
                    {props.cancelAllowed && (
                      <button
                        className={`${btn} border border-hairline bg-background text-ink hover:bg-surface-2`}
                        onClick={() => setCancelStep("confirm")}
                      >
                        Cancel booking
                      </button>
                    )}
                  </div>
                )}

                {cancelStep !== "idle" && (
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink">Cancel this booking?</h2>
                    <p className="mt-2 text-sm text-ink-subtle">
                      Your session on <strong className="text-ink">{fmtWhen(props.startAtIso, props.tz)}</strong> will be
                      canceled and the time released.
                    </p>
                    {wasPaid && (
                      <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-subtle">
                        Since this session was prepaid, {props.studioName} will process your refund per their policy.
                        {props.refundPolicyText ? (
                          <span className="mt-1 block whitespace-pre-line text-ink">{props.refundPolicyText}</span>
                        ) : null}
                      </p>
                    )}
                    {cancelError && <p className="mt-2 text-sm text-red-600">{cancelError}</p>}
                    <div className="mt-4 flex gap-2">
                      <button
                        className={`${btn} bg-red-600 text-white hover:bg-red-700`}
                        disabled={cancelStep === "busy"}
                        onClick={confirmCancel}
                      >
                        {cancelStep === "busy" ? "Canceling…" : "Yes, cancel it"}
                      </button>
                      <button
                        className={`${btn} border border-hairline bg-background text-ink hover:bg-surface-2`}
                        disabled={cancelStep === "busy"}
                        onClick={() => { setCancelStep("idle"); setCancelError(""); }}
                      >
                        Keep booking
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-hairline bg-surface p-6">
                <h2 className="text-[15px] font-semibold text-ink">Too close to change online</h2>
                <p className="mt-2 text-sm text-ink-subtle">
                  This session is inside {props.studioName}'s change window. Reach out directly and they'll sort it out.
                </p>
                {props.contactEmail && (
                  <a
                    href={`mailto:${props.contactEmail}`}
                    className="mt-3 inline-block text-sm font-medium"
                    style={{ color: props.accent }}
                  >
                    {props.contactEmail}
                  </a>
                )}
              </section>
            )}

            {/* Reschedule calendar — the same first-party widget iframe the
             * booking page uses, scoped to this booking (manage mode). */}
            {showReschedule && props.rescheduleAllowed && !canceled && (
              <section ref={frameHostRef} className="rounded-2xl border border-hairline bg-surface p-3">
                <iframe
                  src={`/embed/calendar?key=${encodeURIComponent(props.embedKey)}&manage=${encodeURIComponent(props.manageToken)}`}
                  title={`Pick a new time with ${props.studioName}`}
                  className="w-full rounded-xl border-0"
                  style={{ height: frameHeight }}
                />
              </section>
            )}
          </>
        )}

        <p className="px-1 text-center text-xs text-ink-tertiary">
          {props.contactEmail ? (
            <>Questions? <a href={`mailto:${props.contactEmail}`} className="underline">{props.contactEmail}</a></>
          ) : (
            <>Questions? Just reply to your booking email.</>
          )}
          {!props.whiteLabel && <> · Delivered by Snap · snap.webcules.com</>}
        </p>
      </div>
    </main>
  );
}
