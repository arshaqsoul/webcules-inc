import type { ReactNode } from "react";

import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  say,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** Line the guide robot says when it is beside this heading. */
  say?: string;
}) {
  const centered = align === "center";
  return (
    <Reveal
      className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}
    >
      <div data-robot="right" data-robot-say={say}>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-indigo-300/80">
          {eyebrow}
        </p>
        <h2 className="text-balance mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
          {title}
        </h2>
        {description ? (
          <p
            className={`mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg ${centered ? "mx-auto" : ""}`}
          >
            {description}
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}
