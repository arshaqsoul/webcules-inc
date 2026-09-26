export const metadata = { title: "Booking canceled" };

export default function BookingCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[12px] border border-hairline bg-surface-1 p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">Payment canceled</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          No charge was made and your slot was released. You can book again anytime from the
          photographer's website.
        </p>
      </div>
    </main>
  );
}
