"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Columns3, Images, LayoutTemplate, ShieldCheck } from "lucide-react";

import { LaptopReplay, SCENE_MS, SCENE_STEPS, type SceneId } from "./screens";

const SHOWCASE: { id: SceneId; label: string; icon: typeof Images }[] = [
  { id: "pipeline", label: "Pipeline", icon: Columns3 },
  { id: "cull", label: "Cull", icon: Images },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "secure", label: "Secure links", icon: ShieldCheck },
];

/**
 * The hero laptop plays four different Snap surfaces back to back. Each
 * scene runs its full loop once, then the next takes over; the chips under
 * the laptop show progress and let a visitor jump to any scene (a manual
 * pick holds that scene for one extra loop before auto-advance resumes).
 */
export function HeroShowcase() {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(0);
  const scene = SHOWCASE[i]!;
  const dwell = SCENE_STEPS[scene.id] * SCENE_MS[scene.id] + 400;

  useEffect(() => {
    const id = window.setTimeout(() => setI((x) => (x + 1) % SHOWCASE.length), dwell * (hold ? 2 : 1));
    return () => window.clearTimeout(id);
  }, [i, hold, dwell]);

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div
          key={scene.id}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <LaptopReplay scene={scene.id} />
        </motion.div>
      </AnimatePresence>

      <div role="tablist" aria-label="Snap feature previews" className="mt-9 flex flex-wrap justify-center gap-2 sm:mt-12">
        {SHOWCASE.map((s, idx) => {
          const on = idx === i;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setI(idx);
                setHold((h) => h + 1);
              }}
              className={`relative flex items-center gap-1.5 overflow-hidden rounded-full border px-3.5 py-2 text-[12.5px] font-medium backdrop-blur-md transition-colors ${
                on ? "border-white/40 bg-white/15 text-white" : "border-white/12 bg-white/[0.05] text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
              {on && (
                <motion.span
                  key={`${i}-${hold}`}
                  aria-hidden
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: (dwell * (hold ? 2 : 1)) / 1000, ease: "linear" }}
                  className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-white/80"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
