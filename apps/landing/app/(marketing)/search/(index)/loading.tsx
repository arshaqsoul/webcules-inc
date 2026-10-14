import React from "react";

export default function Loading() {
  return (
    <div className="container pt-24 pb-24">
      <div className="prose dark:prose-invert max-w-none text-center">
        <div className="mx-auto mb-8 h-10 w-40 animate-pulse rounded bg-white/5 lg:mb-16" />
        <div className="mx-auto mb-16 h-12 max-w-[50rem] animate-pulse rounded-2xl bg-white/5" />
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border-[0.5px] border-gray-700 bg-black/40"
          >
            <div className="aspect-[16/10] w-full animate-pulse bg-white/5" />
            <div className="flex flex-col gap-y-3 p-6">
              <div className="h-5 w-3/4 animate-pulse rounded bg-white/5" />
              <div className="h-4 w-full animate-pulse rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
