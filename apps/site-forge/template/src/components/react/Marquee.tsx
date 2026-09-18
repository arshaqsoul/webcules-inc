import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** seconds for one full pass */
  speed?: number;
  className?: string;
};

/** CSS-only infinite marquee — content is rendered twice; children must be a flat list. */
export default function Marquee({ children, speed = 40, className = "" }: Props) {
  return (
    <div className={`group relative overflow-hidden ${className}`}>
      <div
        className="animate-marquee flex w-max items-center group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${speed}s` }}
      >
        <div className="flex items-center">{children}</div>
        <div className="flex items-center" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
