import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const steps = [
  {
    n: "01",
    title: "Brainstorm the product",
    body: "Together we plan the roadmap and make sure the highest-priority items get done first.",
  },
  {
    n: "02",
    title: "Design the experience",
    body: "Sketches become Figma prototypes you can click through before a line of production code exists.",
  },
  {
    n: "03",
    title: "Build in sprints",
    body: "Two-week sprints with working software at the end of each, so you always see real progress.",
  },
  {
    n: "04",
    title: "Release and run",
    body: "Zero-downtime launches, monitoring and iteration. We stay on to keep the product healthy.",
  },
];

const principles = [
  ["Data first", "Decisions grounded in how the product is actually used."],
  [
    "No hand-offs",
    "The people who design it are the people who build and run it.",
  ],
  [
    "Human touch",
    "AI-powered where it helps, always with a person accountable.",
  ],
];

export default function Process() {
  return (
    <section
      id="process"
      className="relative border-t border-white/10 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          say="A simple, steady rhythm"
          eyebrow="Process"
          title={
            <>
              Prompt us, and we{" "}
              <span className="font-display italic text-indigo-200">
                do the rest
              </span>
              .
            </>
          }
          description="A simple, predictable rhythm from the first conversation to a product in the hands of your customers."
        />

        <ol className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.n} className="bg-darkest">
              <Reveal delay={i * 0.07} className="h-full p-8">
                <span className="font-display text-5xl italic text-indigo-300/70">
                  {s.n}
                </span>
                <h3 className="mt-8 text-xl font-semibold tracking-tight text-white">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {s.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-16 grid gap-10 sm:grid-cols-3">
          {principles.map(([t, b]) => (
            <div key={t} className="border-l border-indigo-400/40 pl-5">
              <p className="font-medium text-white">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                {b}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
