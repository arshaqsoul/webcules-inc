/* /sw.js (WEB-263) — the client-home/gallery service worker. Root scope
 * (it must control /g/{token} pages to cache their media), but its fetch
 * handler is a strict ALLOWLIST:
 *   • same-origin GET only; everything else passes through untouched;
 *   • media (/api/assets/…, /api/pimg/…) → cache-first, LRU ~200 entries;
 *   • /my + /g pages → network-first (auth surfaces are never served
 *     stale; offline falls back to the last good copy);
 *   • NEVER caches /dashboard, studio APIs, or anything cross-origin.
 * PURGE_MEDIA message evicts all cached media (revocation heartbeat);
 * versioned cache names make deploys self-cleaning. */

export const dynamic = "force-dynamic";

const VERSION = "snap-sw-v1";
const MEDIA_CACHE = `${VERSION}-media`;
const PAGE_CACHE = `${VERSION}-pages`;
const MEDIA_LRU_CAP = 200;

const worker = `
const VERSION = ${JSON.stringify(VERSION)};
const MEDIA_CACHE = ${JSON.stringify(MEDIA_CACHE)};
const PAGE_CACHE = ${JSON.stringify(PAGE_CACHE)};
const MEDIA_LRU_CAP = ${MEDIA_LRU_CAP};

function mediaPattern(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/api/assets/');
}
function pagePattern(url) {
  if (url.origin !== self.location.origin) return false;
  return (url.pathname === '/my' || url.pathname.startsWith('/g/')) && !url.pathname.includes('/otp/');
}
async function trimMediaCache() {
  const keys = await caches.open(MEDIA_CACHE).then((c) => c.keys());
  if (keys.length <= MEDIA_LRU_CAP) return;
  const cache = await caches.open(MEDIA_CACHE);
  for (const req of keys.slice(0, keys.length - MEDIA_LRU_CAP)) {
    await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE_MEDIA') {
    event.waitUntil(caches.delete(MEDIA_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cross-origin

  // Media: cache-first (thumbs/previews are immutable-ish; short server TTL
  // plus the purge message handles revocation).
  if (mediaPattern(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          await trimMediaCache();
        }
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Pages (/my, /g): network-first — a stale auth surface must never
  // render; offline falls back to the last good copy.
  if (pagePattern(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        return hit || Response.error();
      }
    })());
    return;
  }

  // Everything else (dashboard, studio APIs, OTP flows): untouched.
});
`;

export async function GET() {
  return new Response(worker, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Service-Worker-Allowed": "/",
    },
  });
}
