import Link from "next/link";

export const metadata = { title: "Booking confirmed" };

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking } = await searchParams;
  void booking;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[12px] border border-hairline bg-surface-1 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl">✓</div>
        <h1 className="text-xl font-semibold text-ink">You're booked!</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          Your payment went through and your session is confirmed. A confirmation email with a calendar
          link is on its way to your inbox.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to snap.webcules.com
        </Link>
      </div>
    </main>
  );
}
