import { cn } from "@webcules/ui/lib/utils";
import Image from "next/image";

/** A product screenshot inside a minimal browser window. */
export function BrowserFrame({
  src,
  alt,
  url,
  priority,
  sizes = "(min-width: 1024px) 60vw, 100vw",
  className,
}: {
  src: string;
  alt: string;
  url: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-[#0c0b1f] shadow-[0_40px_120px_-30px_rgba(99,102,241,0.45),0_0_0_1px_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md bg-white/[0.06] px-3 text-[11px] text-slate-400">
          {url}
        </div>
        <div className="w-10" aria-hidden />
      </div>
      <div className="relative aspect-[1463/812] overflow-hidden bg-white">
        {/* The captures include a native scrollbar on the right edge, so the
            image is rendered slightly wider than the frame to crop it out. */}
        <div className="absolute inset-y-0 left-0 w-[101.4%]">
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className="object-cover object-left-top"
          />
        </div>
      </div>
    </div>
  );
}
