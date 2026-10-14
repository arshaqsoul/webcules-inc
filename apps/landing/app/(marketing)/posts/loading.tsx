import React from "react";

export default function Loading() {
  return (
    <div className="relative flex min-h-[80vh] flex-col items-center bg-darkest pt-40 pb-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mb-14 flex flex-col items-center gap-4">
          <div className="h-8 w-20 animate-pulse rounded-3xl bg-white/5" />
          <div className="h-10 w-96 max-w-full animate-pulse rounded bg-white/5" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-white/5" />
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-3xl border-[0.5px] border-gray-700 bg-black/40"
            >
              <div className="aspect-[16/10] w-full animate-pulse bg-white/5" />
              <div className="flex flex-col gap-y-3 p-6">
                <div className="h-5 w-3/4 animate-pulse rounded bg-white/5" />
                <div className="h-4 w-full animate-pulse rounded bg-white/5" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
