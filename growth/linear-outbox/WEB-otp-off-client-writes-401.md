# Bug draft: with GALLERY_OTP_MODE=off, client gallery writes fail with 401

Found 2026-10-03 while recording PP-002 against a local dev server with the
email-shock contingency mode (`GALLERY_OTP_MODE=off`, the WEB-132 switch)
turned on. Filing here because the Linear connection is not connected in this
session; the architect should move it into the Snap project.

## What happens

The gallery page renders fine when the mode is off, but every client write
fails with HTTP 401:

- POST `/api/g/[token]/selection` (submit picks)
- POST `/api/g/[token]/favorite` (hearts)
- POST `/api/g/[token]/download-request` (download approvals flow)

## Why

All of these gate on `resolveGalleryAccess` (lib/shares/gallery-auth.ts),
which requires the `snap-g` cookie. That cookie is only minted in two places:

1. `POST /api/g/[token]/otp/verify` (the OTP flow), and
2. `GET /api/my/open/[grantId]` (the client photo app).

In `off` mode the page at `app/g/[token]/page.tsx` (the
`GALLERY_OTP_MODE === "off"` branch) skips OTP entirely and never mints the
cookie, so a visitor who only ever opens the link can look but never touch:
picks, hearts and download requests all bounce. The client-side UI does not
surface it either; submit just shows "Couldn't submit - try again."

## Suggested fix

In `off` mode the server should establish the gallery session when the page
renders. An RSC cannot set cookies, so the two shapes that fit:

- a tiny route handler (or middleware match on `/g/`) that mints the cookie
  for an active grant before the page renders, or
- a client-side one-shot ping to a new `POST /api/g/[token]/session` that
  mints it when the page loads in `off` mode.

Either keeps the cookie grant-pinned (the audit P0 property) and keeps `otp`
mode untouched.

## Evidence

- Reproduced twice on the local production-shape dev server, 2026-10-03.
- PP-002's first recording run failed on it: the picks submit returned 401
  and the reel's payoff flash never appeared.

## Severity

Low in production today (staging and production run with `otp` mode on, so
every visitor verifies and gets the cookie). It becomes an outage the day the
founder flips the email-shock switch - which is the one scenario the switch
exists for. Cost: a client-side one-shot call plus a small route.
