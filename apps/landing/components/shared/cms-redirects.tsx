import type React from "react";
import type { Redirect } from "@webcules/payload/payload-types";

import configPromise from "@webcules/payload/payload.config";
import { getPayload } from "payload";
import { notFound, redirect } from "next/navigation";

import { emptyPaginatedDocs, safeCmsQuery } from "@/lib/cms";

interface Props {
  disableNotFound?: boolean;
  url: string;
}

/**
 * CMS-down-tolerant replacement for `PayloadRedirects` (WEB-406).
 *
 * The shared component's redirects fetch lives in packages/payload and can
 * throw when the CMS is unreachable, which would surface a raw 500 on
 * content pages. This local variant skips redirect processing on CMS
 * failure (no match → fall through to notFound/render) instead of throwing.
 */
export const CmsRedirects: React.FC<Props> = async ({
  disableNotFound,
  url,
}) => {
  const payload = await getPayload({ config: configPromise });

  const { docs: redirects } = await safeCmsQuery(
    payload,
    "redirects",
    () =>
      payload.find({
        collection: "redirects",
        depth: 1,
        limit: 0,
        pagination: false,
      }),
    emptyPaginatedDocs<Redirect>(),
  );

  const redirectItem = redirects.find((redirect) => redirect.from === url);

  if (redirectItem) {
    if (redirectItem.to?.url) {
      redirect(redirectItem.to.url);
    }

    const relationTo = redirectItem.to?.reference?.relationTo;
    const value = redirectItem.to?.reference?.value;

    if (relationTo && value) {
      let slug: string | null | undefined;

      if (typeof value === "object") {
        slug = value.slug;
      } else {
        // Unpopulated reference (ID only): resolve defensively — if that
        // lookup also fails, fall through without redirecting.
        const document = await safeCmsQuery(
          payload,
          `redirects:resolve:${relationTo}`,
          () => payload.findByID({ collection: relationTo, id: value, depth: 0 }),
          null,
        );
        slug = document && "slug" in document ? document.slug : null;
      }

      if (slug) {
        redirect(
          `${relationTo !== "pages" ? `/${relationTo}` : ""}/${slug}`,
        );
      }
    }
  }

  if (disableNotFound) return null;

  notFound();
};
