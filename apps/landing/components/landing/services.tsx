import { MousePointer2 } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

/* Each card carries a small, crisp illustration built from real UI primitives
   so there are no raster mockups with garbled text. */

function CodeArt() {
  const lines = [
    ["w-10", "bg-indigo-400/70"],
    ["w-24", "bg-white/25"],
    ["w-16", "bg-fuchsia-400/60"],
    ["w-32", "bg-white/20"],
    ["w-20", "bg-sky-400/60"],
    ["w-28", "bg-white/15"],
  ];
  return (
    <div className="mx-auto flex h-full w-fit flex-col justify-center gap-2.5 p-6">
      {lines.map(([w, c], i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-4 text-right font-mono text-[10px] text-slate-600">
            {i + 1}
          </span>
          <span
            className={`code-line h-2 rounded-full ${w} ${c}`}
            style={{
              marginLeft: i % 3 === 1 ? 20 : 0,
              animationDelay: `${i * 0.35}s`,
            }}
          />
          {i === 2 ? (
            <span
              className="code-line h-2 w-12 rounded-full bg-white/15"
              style={{ animationDelay: `${(i + 0.5) * 0.35}s` }}
            />
          ) : null}
          {i === lines.length - 1 ? (
            <span className="code-caret h-3.5 w-px bg-indigo-300" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Three sources stream into a processing node, which emits a result. */
function PipelineArt() {
  const sources = [
    { y: 36, delay: 0 },
    { y: 80, delay: 0.5 },
    { y: 124, delay: 0.95 },
  ];
  const inbound = (y: number) => `M46 ${y} C 108 ${y}, 118 80, 164 80`;
  const outbound = "M208 80 L266 80";
  return (
    <svg
      viewBox="0 0 320 160"
      className="h-full w-full"
      fill="none"
      aria-hidden
    >
      {/* Static rails */}
      {sources.map(({ y }) => (
        <path
          key={y}
          d={inbound(y)}
          stroke="#818cf8"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
      ))}
      <path
        d={outbound}
        stroke="#c084fc"
        strokeOpacity="0.32"
        strokeWidth="1.5"
      />

      {/* Sources: database, file, API */}
      {sources.map(({ y }, i) => (
        <g key={y}>
          <rect
            x="14"
            y={y - 12}
            width="32"
            height="24"
            rx="7"
            fill="#12102e"
            stroke="#818cf8"
            strokeOpacity="0.55"
          />
          {i === 0 ? (
            <g stroke="#a5b4fc" strokeWidth="1.4">
              <ellipse cx="30" cy={y - 5} rx="7" ry="2.6" />
              <path d={`M23 ${y - 5}v10c0 1.5 3 2.6 7 2.6s7-1.1 7-2.6v-10`} />
              <path d={`M23 ${y}c0 1.5 3 2.6 7 2.6s7-1.1 7-2.6`} />
            </g>
          ) : null}
          {i === 1 ? (
            <g stroke="#a5b4fc" strokeWidth="1.4" strokeLinecap="round">
              <path d={`M25 ${y - 7}h7l5 5v9h-12z`} />
              <path d={`M28 ${y + 2}h6`} />
            </g>
          ) : null}
          {i === 2 ? (
            <g
              stroke="#a5b4fc"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={`M26 ${y - 5}l-4 5 4 5M34 ${y - 5}l4 5-4 5`} />
            </g>
          ) : null}
        </g>
      ))}

      {/* Processing node with a scanning highlight */}
      <g>
        <rect
          className="pipe-node"
          x="164"
          y="58"
          width="44"
          height="44"
          rx="10"
          fill="#16143a"
          stroke="#818cf8"
          strokeOpacity="0.4"
        />
        <g
          stroke="#c4b5fd"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        >
          <path d="M174 70h24M174 80h24M174 90h15" />
        </g>
        <rect
          className="pipe-scan"
          x="168"
          y="62"
          width="36"
          height="3"
          rx="1.5"
          fill="#a78bfa"
          opacity="0"
        />
      </g>

      {/* Output: a small chart that fills in when a result arrives */}
      <rect
        x="266"
        y="56"
        width="42"
        height="48"
        rx="9"
        fill="#16143a"
        stroke="#c084fc"
        strokeOpacity="0.55"
      />
      <g fill="#e9d5ff">
        <rect
          className="pipe-bar"
          x="274"
          y="82"
          width="7"
          height="14"
          rx="2"
          style={{ animationDelay: "0s" }}
        />
        <rect
          className="pipe-bar"
          x="285"
          y="72"
          width="7"
          height="24"
          rx="2"
          style={{ animationDelay: "0.12s" }}
        />
        <rect
          className="pipe-bar"
          x="296"
          y="64"
          width="7"
          height="32"
          rx="2"
          style={{ animationDelay: "0.24s" }}
        />
      </g>

      {/* Streaming packets: short comets travelling along each rail */}
      {sources.map(({ y, delay }) => (
        <path
          key={`c-${y}`}
          className="pipe-comet pipe-comet-in"
          d={inbound(y)}
          pathLength={1}
          stroke="#ddd6fe"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
      <path
        className="pipe-comet pipe-comet-out"
        d={outbound}
        pathLength={1}
        stroke="#f0abfc"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DesignArt() {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className="design-outline absolute h-28 w-44 -rotate-6 rounded-xl border border-dashed border-white/25" />
      <div className="design-card relative h-28 w-44 rotate-3 rounded-xl border border-white/15 bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 p-3 backdrop-blur">
        <div className="h-2 w-16 rounded-full bg-white/60" />
        <div className="mt-2 h-1.5 w-24 rounded-full bg-white/25" />
        <div className="mt-5 flex gap-2">
          <div className="h-8 w-14 rounded-md bg-white/20" />
          <div className="h-8 w-14 rounded-md bg-white/10" />
        </div>
        <span className="design-handle absolute -right-2 -top-2 size-4 rounded-sm border border-indigo-300 bg-darkest" />
        <span className="design-handle absolute -bottom-2 -left-2 size-4 rounded-sm border border-indigo-300 bg-darkest [animation-delay:1.5s]" />
      </div>
      <MousePointer2 className="design-cursor pointer-events-none absolute left-1/2 top-1/2 -mt-12 ml-[78px] size-5 fill-white text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
    </div>
  );
}

function DeployArt() {
  const rows = [
    ["Build", "24s"],
    ["Test", "41s"],
    ["Deploy", "9s"],
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-6">
      {rows.map(([step, time], i) => {
        const d = { animationDelay: `${i * 1.8}s` };
        return (
          <div
            key={step}
            className="deploy-row relative flex items-center justify-between overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
          >
            <span className="flex items-center gap-2 text-slate-300">
              <span className="relative size-1.5">
                <span className="absolute inset-0 rounded-full bg-slate-600" />
                <span
                  className="deploy-pending absolute inset-0 animate-pulse rounded-full bg-amber-400"
                  style={d}
                />
                <span
                  className="deploy-done absolute inset-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                  style={d}
                />
              </span>
              {step}
            </span>
            <span className="deploy-time font-mono text-slate-500" style={d}>
              {time}
            </span>
            <span
              className="deploy-bar absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-indigo-400 to-fuchsia-400"
              style={d}
            />
          </div>
        );
      })}
    </div>
  );
}

const services: {
  title: string;
  body: string;
  tags: string[];
  art: ReactNode;
  className?: string;
}[] = [
  {
    title: "Product engineering",
    body: "Marketing sites to full SaaS platforms, designed, built and deployed in weeks, not months.",
    tags: ["Web apps", "SaaS", "Internal tools"],
    art: <CodeArt />,
  },
  {
    title: "Data engineering",
    body: "Pipelines, cleansing, transformation and loading. Reliable data, delivered where it needs to be.",
    tags: ["Pipelines", "Analytics", "Dashboards"],
    art: <PipelineArt />,
  },
  {
    title: "Product design",
    body: "From rough sketches to Figma prototypes to production-ready interfaces your team can extend.",
    tags: ["UX", "UI", "Prototypes"],
    art: <DesignArt />,
  },
  {
    title: "Deployment and operations",
    body: "PaaS, cloud or self-hosted, launched with CI/CD, monitoring and zero-downtime releases.",
    tags: ["CI/CD", "Cloud", "Monitoring"],
    art: <DeployArt />,
  },
];

export default function Services() {
  return (
    <section id="services" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          say="Everything under one roof"
          eyebrow="Services"
          title={
            <>
              One team for the whole{" "}
              <span className="font-display italic text-indigo-200">
                product
              </span>
              .
            </>
          }
          description="Strategy, design, engineering and operations under one roof, so decisions stay fast and nothing gets lost between vendors."
        />

        <div className="mt-16 grid gap-5 md:grid-cols-2">
          {services.map((s, i) => (
            <Reveal key={s.title} delay={(i % 2) * 0.08}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.04]">
                <div className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-indigo-500/15 blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-60" />
                <div className="relative h-52 border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
                  {s.art}
                </div>
                <div className="relative p-7">
                  <h3 className="text-2xl font-semibold tracking-tight text-white">
                    {s.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-slate-400">
                    {s.body}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {s.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
