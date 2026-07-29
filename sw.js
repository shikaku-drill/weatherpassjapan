/* WEATHERPASS JAPAN — service worker
 *
 * Why network-first and not cache-first:
 * the site is republished by hand, and a cache-first worker would pin visitors to whatever
 * build they happened to load first. Every online visit therefore goes to the network and
 * refreshes the copy in the cache; the cache is only read when the network fails. Offline
 * you get the last page you actually opened, which for a traveller on a weak SIM in a
 * basement is the whole point.
 *
 * Bump CACHE when the shell changes so old entries are swept.
 */
const CACHE = "wpj-v1";

/* Only the icons are worth pre-fetching: the HTML shells are ~640 KB each and there are
   five of them, so we cache whichever language the visitor actually uses instead. */
const PRECACHE = ["/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Let the page tell a stuck worker to step aside. */
self.addEventListener("message", (e) => {
  if (e.data === "wpj-skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Leave anything off-origin alone: the weather API must never be served stale, and the
     three booking sites are navigations we have no business touching. */
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        /* Keep a copy of good responses so the next offline visit has something to show. */
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          /* An uncached page while offline: fall back to whichever shell we do hold, so the
             visitor still lands on the app rather than the browser's error page. */
          if (req.mode === "navigate") {
            return caches.match("/ja.html")
              .then((p) => p || caches.match("/index.html"))
              .then((p) => p || Response.error());
          }
          return Response.error();
        })
      )
  );
});
