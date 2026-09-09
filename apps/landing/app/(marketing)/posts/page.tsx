import type { Metadata } from "next/types";

import { PostsGrid } from "@/components/shared/posts-grid";
import configPromise from "@webcules/payload/payload.config";
import { getPayload } from "payload";
import React from "react";
import PageClient from "./page.client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const payload = await getPayload({ config: configPromise });

  const posts = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 12,
    overrideAccess: false,
    sort: "-publishedAt",
    where: {
      application: {
        equals: "webcules",
      },
    },
  });

  return (
    <div className="relative flex flex-col items-center bg-darkest pt-40 pb-32 min-h-[80vh]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full">
        <PageClient />
        <div className="mx-auto w-full max-w-6xl px-6 mb-14 text-center">
          <span className="whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border border-gray-500">
            Blog
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl font-medium leading-tight text-white">
            Notes from the Webcules workshop
          </h1>
          <p className="mt-4 text-base text-slate-400">
            Ideas, lessons and behind-the-scenes from shipping web, design and
            data products.
          </p>
        </div>

        <PostsGrid posts={posts.docs} />
      </div>
    </div>
  );
}

export function generateMetadata(): Metadata {
  return {
    title: `Blog | Webcules`,
    description:
      "Ideas, lessons and behind-the-scenes from shipping web, design and data products.",
  };
}
