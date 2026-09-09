import Link from "next/link";
import { Righteous } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="relative flex flex-col items-center bg-darkest pt-40 pb-32 min-h-[80vh]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6">
        <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border border-gray-500">
          Legal
        </span>
        <h1
          className={`mt-6 text-4xl sm:text-5xl leading-tight text-white ${righteous.className}`}
        >
          {title}
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {updated}</p>
        <p className="mt-6 text-base leading-relaxed text-slate-300">{intro}</p>

        <div className="mt-12 flex flex-col gap-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl text-white">{section.heading}</h2>
              <div className="mt-3 flex flex-col gap-y-3 text-sm leading-relaxed text-slate-400">
                {section.paragraphs?.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul className="flex flex-col gap-y-2 list-disc pl-5">
                    {section.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-white/10 bg-black/40 p-6 text-sm leading-relaxed text-slate-400">
          Questions about this policy? Email{" "}
          <a
            className="text-indigo-300 underline underline-offset-2"
            href="mailto:business@webcules.com"
          >
            business@webcules.com
          </a>{" "}
          or write to Webcules Inc., Saskatoon, Saskatchewan, Canada. See also
          our{" "}
          <Link className="text-indigo-300 underline underline-offset-2" href="/terms">
            Terms &amp; Conditions
          </Link>
          ,{" "}
          <Link
            className="text-indigo-300 underline underline-offset-2"
            href="/refund-policy"
          >
            Refund Policy
          </Link>{" "}
          and{" "}
          <Link
            className="text-indigo-300 underline underline-offset-2"
            href="/privacy-policy"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
