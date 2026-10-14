# Webcules landing (apps/landing)

The marketing site. Most content is served from the Payload CMS
(`packages/payload`); the home page and marketing layout are static.

## CMS resilience (WEB-406)

Every Payload fetch in this app goes through `lib/cms.ts`
(`safeCmsQuery`), which logs the failure and serves a per-surface fallback
instead of throwing a raw 500 at visitors. Intended behavior when the CMS is
fully down:

| Surface | Degrade behavior | Status |
| --- | --- | --- |
| `/` (home) | Not CMS-backed — unaffected | 200 |
| `/posts`, `/posts/page/N` | Branded empty state ("No posts yet - check back soon.") via `PostsGrid` | 200 |
| `/posts/[slug]` | Branded 404 via `not-found.tsx` (guarded redirect lookup falls through) | 404 |
| `/search` | Page shell + "No results found." (empty result set) | 200 |
| `/search/[slug]` | Branded 404 via `not-found.tsx` (page lookup fails → `CmsRedirects` falls through) | 404 |
| `/pages-sitemap.xml` | Valid sitemap with static entries only | 200 |
| `/posts-sitemap.xml` | Valid empty sitemap | 200 |
| Any other render error | `app/error.tsx` — on-brand copy, retry + link home | 500 (branded) |
| Root layout error | `app/global-error.tsx` — self-contained branded page, retry | 500 (branded) |

Redirects are resolved by `components/shared/cms-redirects.tsx` (`CmsRedirects`),
a CMS-down-tolerant local replacement for the shared
`PayloadRedirects` component (whose redirects fetch in
`packages/payload/src/utilities/getRedirects.ts` is still unguarded for other
consumers — landing no longer relies on it).

Slow CMS responses show branded skeletons (`loading.tsx` under `posts/(listing)/`
and `search/(index)/`) instead of a blank frame. The skeletons cover only the
listing routes (`/posts`, `/posts/page/N`, `/search`), which always render 200.
The `[slug]` detail routes deliberately have **no** loading boundary above them:
once a segment streams its shell, the status code is committed as 200 before
`notFound()` throws, turning unknown slugs into soft-404s (WEB-431). Detail
pages render without a skeleton so unknown slugs keep a real 404 status.

Ops routes (`/next/preview`, `/next/seed`) already handle their own errors.

## Commands

- `pnpm --filter landing dev` — dev server
- `pnpm --filter landing typecheck` / `lint` / `build`
- `pnpm --filter landing db:migrate` — local D1 migration
