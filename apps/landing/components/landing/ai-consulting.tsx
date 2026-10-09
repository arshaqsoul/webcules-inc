import {
  Coins,
  Gauge,
  ShieldCheck,
  UserCheck,
  Mail,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import { CTAButton } from "@/components/shared/cta-button";

import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const pillars = [
  {
    icon: Gauge,
    title: "Optimize",
    body: "We map your workflows, find the repetitive, high-effort steps and automate only the ones where AI clearly beats the manual route. Everything else stays as it is.",
  },
  {
    icon: Coins,
    title: "Cost-effective",
    body: "We start with the cheapest approach that works, right-size the model for each step, cache what repeats and track cost per run, so spend stays predictable as usage grows.",
  },
  {
    icon: ShieldCheck,
    title: "Safe",
    body: "Human review on consequential steps, least-privilege access to your data, sensitive details redacted, audit logs and clear fallbacks. We pick providers and settings that keep your data out of model training.",
  },
];

const steps = [
  ["Audit", "Find where AI pays off"],
  ["Pilot", "Prove it on one workflow"],
  ["Integrate", "Connect your tools and data"],
  ["Operate", "Monitor quality and cost"],
];

const guardrails = [
  "Human approval on risky steps",
  "Per-run cost and usage limits",
  "Sensitive data redacted",
  "Full audit trail",
];

/** An illustrative workflow, not a real client system. */
function WorkflowArt() {
  const nodes = [
    {
      icon: Mail,
      label: "Trigger",
      title: "New customer email",
      tone: "text-slate-300",
    },
    {
      icon: Sparkles,
      label: "AI step",
      title: "Draft a reply",
      tone: "text-indigo-300",
    },
    {
      icon: UserCheck,
      label: "Human check",
      title: "Approve or edit",
      tone: "text-amber-300",
    },
    {
      icon: CheckCircle2,
      label: "Done",
      title: "Sent and logged",
      tone: "text-emerald-300",
    },
  ];
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full bg-indigo-500/20 blur-3xl" />
      <p className="relative text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
        Example workflow
      </p>
      <ol className="relative mt-6 space-y-3">
        {nodes.map((n, i) => (
          <li key={n.title} className="relative">
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0c0b1f] px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <n.icon className={`size-5 ${n.tone}`} />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  {n.label}
                </p>
                <p className="text-sm font-medium text-white">{n.title}</p>
              </div>
            </div>
            {i < nodes.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-9 top-full h-3 w-px bg-gradient-to-b from-indigo-400/60 to-transparent"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <ul className="relative mt-7 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400">
        {guardrails.map((g) => (
          <li key={g} className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-indigo-300" />
            {g}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AiConsulting() {
  return (
    <section
      id="ai"
      className="relative border-t border-white/10 py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(50%_100%_at_20%_0%,rgba(139,141,255,0.14),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          say="Let's make AI useful and safe"
          eyebrow="AI consultancy"
          title={
            <>
              Put AI to work in your workflows,{" "}
              <span className="font-display italic text-indigo-200">
                safely
              </span>
              .
            </>
          }
          description="We help teams find where AI genuinely pays off, integrate it into the tools and processes they already use, and keep both cost and risk under control."
        />

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className="space-y-9">
              {pillars.map((p, i) => (
                <Reveal key={p.title} delay={i * 0.07}>
                  <div className="flex gap-5">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/10">
                      <p.icon className="size-5 text-indigo-200" />
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-white">
                        {p.title}
                      </h3>
                      <p className="mt-2 leading-relaxed text-slate-400">
                        {p.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-12">
              <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
                {steps.map(([t, b], i) => (
                  <li key={t} className="bg-darkest p-4">
                    <span className="font-mono text-xs text-indigo-300/80">
                      0{i + 1}
                    </span>
                    <p className="mt-2 text-sm font-medium text-white">{t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {b}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                <CTAButton>Book an AI workflow review</CTAButton>
              </div>
            </Reveal>
          </div>

          <Reveal className="lg:col-span-5" delay={0.1}>
            <WorkflowArt />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
