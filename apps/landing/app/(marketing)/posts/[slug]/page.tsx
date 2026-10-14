import type { Metadata } from "next";

import { RelatedPosts } from "@webcules/payload/blocks/RelatedPosts/Component";
import configPromise from "@webcules/payload/payload.config";
import { getPayload } from "payload";
import { draftMode } from "next/headers";
import React, { cache } from "react";
import RichText from "@webcules/payload/components/RichText/index";

import type { Post } from "@webcules/payload/payload-types";

import { PostHero } from "@webcules/payload/heros/PostHero/index";
import { generateMeta } from "@webcules/payload/utilities/generateMeta";
import { CmsRedirects } from "@/components/shared/cms-redirects";
import { emptyPaginatedDocs, safeCmsQuery } from "@/lib/cms";
import PageClient from "./page.client";
import { LivePreviewListener } from "@webcules/payload/components/LivePreviewListener/index";

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise });
  const posts = await safeCmsQuery(
    payload,
    "posts:static-params",
    () =>
      payload.find({
        collection: "posts",
        draft: false,
        limit: 1000,
        overrideAccess: false,
        pagination: false,
        select: {
          slug: true,
        },
        where: {
          application: {
            equals: "webcules",
          },
        },
      }),
    emptyPaginatedDocs<Post>(),
  );

  const params = posts.docs.map(({ slug }) => {
    return { slug };
  });

  return params;
}

type Args = {
  params: Promise<{
    slug?: string;
  }>;
};

export default async function Post({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode();
  const { slug = "" } = await paramsPromise;
  const url = "/posts/" + slug;
  const post = await queryPostBySlug({ slug });

  if (!post) return <CmsRedirects url={url} />;

  return (
    <article className="pt-32 pb-16">
      <PageClient />

      {/* Allows redirects for valid pages too */}
      <CmsRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <PostHero post={post} />

      <div className="flex flex-col items-center gap-4 pt-8">
        <div className="container">
          <RichText
            className="max-w-[48rem] mx-auto"
            data={post.content}
            enableGutter={false}
          />
          {post.relatedPosts && post.relatedPosts.length > 0 && (
            <RelatedPosts
              className="mt-12 max-w-[52rem] lg:grid lg:grid-cols-subgrid col-start-1 col-span-3 grid-rows-[2fr]"
              docs={post.relatedPosts.filter(
                (post) => typeof post === "object"
              )}
            />
          )}
        </div>
      </div>
    </article>
  );
}

export async function generateMetadata({
  params: paramsPromise,
}: Args): Promise<Metadata> {
  const { slug = "" } = await paramsPromise;
  const post = await queryPostBySlug({ slug });

  return generateMeta({ doc: post });
}

const queryPostBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode();

  const payload = await getPayload({ config: configPromise });

  const result = await safeCmsQuery(
    payload,
    "posts:by-slug",
    () =>
      payload.find({
        collection: "posts",
        draft,
        limit: 1,
        overrideAccess: draft,
        pagination: false,
        where: {
          and: [
            {
              slug: {
                equals: slug,
              },
            },
            {
              application: {
                equals: "webcules",
              },
            },
          ],
        },
      }),
    emptyPaginatedDocs<Post>(),
  );

  return result.docs?.[0] || null;
});
