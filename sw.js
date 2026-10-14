/* global self, caches, fetch, Request, Response, URL */

// The dependency-free build injects a content hash and every generated asset.
// The fallback keeps this source worker usable for a direct local preview.
const CACHE_VERSION = "1e3cd853d246cb9a";
const CACHE_PREFIX = "lonkoll-static-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const FALLBACK_CORE_PATHS = [
  "./",
  "./index.html",
  "./offline.html",
  "./offline.css",
  "./manifest.webmanifest",
  "./assets/app.js",
  "./assets/styles.css",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

const INJECTED_PRECACHE = (() => {
  try {
    return [{"url":"./assets/app.js","revision":"0d326cd31b6f330c"},{"url":"./assets/application/adapter.js","revision":"271e234cbe4c4f00"},{"url":"./assets/domain/agreementRegistry.js","revision":"c2efac80ecb568ee"},{"url":"./assets/domain/decimal.js","revision":"03b3eb8f5feececf"},{"url":"./assets/domain/employmentProfile.js","revision":"35c28c7672763c5f"},{"url":"./assets/domain/errors.js","revision":"711c503b9f2c62f1"},{"url":"./assets/domain/generated/skatteverket2026.js","revision":"e933c56287fa1786"},{"url":"./assets/domain/index.js","revision":"7a97c090c57b6610"},{"url":"./assets/domain/models.js","revision":"c41235202246b88c"},{"url":"./assets/domain/payroll.js","revision":"8818273284db128c"},{"url":"./assets/domain/planning.js","revision":"cf23a0928044b40b"},{"url":"./assets/domain/summary.js","revision":"c7d4982ebbc73d7c"},{"url":"./assets/domain/tax.js","revision":"c030478b4e68157d"},{"url":"./assets/domain/timezone.js","revision":"617f6fbae4317286"},{"url":"./assets/domain/workspace.js","revision":"8860e7bb5f721a88"},{"url":"./assets/i18n/index.js","revision":"baea4ee1dca82153"},{"url":"./assets/storage/errors.js","revision":"126c74a5aedeaccc"},{"url":"./assets/storage/fingerprint.js","revision":"dfab449980d6804e"},{"url":"./assets/storage/importExport.js","revision":"c859eaf234b1a775"},{"url":"./assets/storage/index.js","revision":"48967afb40ded03a"},{"url":"./assets/storage/indexedDbStore.js","revision":"73c25d4988110ea9"},{"url":"./assets/storage/schema.js","revision":"c73d76daeb27e5b8"},{"url":"./assets/storage/strictJson.js","revision":"289e0c87c778f7cc"},{"url":"./assets/styles.css","revision":"7405ecc9654f992e"},{"url":"./assets/ui/calendar-selection.js","revision":"920c655462554559"},{"url":"./assets/ui/dom.js","revision":"5c047ee4643c81d0"},{"url":"./assets/ui/format.js","revision":"0162ccd4cbe39af8"},{"url":"./assets/ui/import-file.js","revision":"42625e2a25f7357f"},{"url":"./assets/ui/index.js","revision":"a1901bf62a243de9"},{"url":"./assets/ui/page-context.js","revision":"36be9ff9509df689"},{"url":"./assets/ui/pages/home-calendar.js","revision":"d8933cc03be6f6a6"},{"url":"./assets/ui/pages/onboarding.js","revision":"bd726432fe915bba"},{"url":"./assets/ui/pages/settings.js","revision":"787dea2bf079aff2"},{"url":"./assets/ui/pages/shared.js","revision":"778e374948c0b681"},{"url":"./assets/ui/pages/shift.js","revision":"51a8f901f11ec0eb"},{"url":"./assets/ui/pages/summary.js","revision":"6b9ec4a45487e9b7"},{"url":"./assets/ui/router.js","revision":"7a79ba2c0be113bd"},{"url":"./assets/ui/types.js","revision":"c4dfe030014c8007"},{"url":"./icons/apple-touch-icon.png","revision":"86a4a06b1eadeb2d"},{"url":"./icons/icon-192.png","revision":"f006656c3f4ce823"},{"url":"./icons/icon-512.png","revision":"d74eaab6df3744f8"},{"url":"./icons/icon-maskable-512.png","revision":"d74eaab6df3744f8"},{"url":"./icons/icon.svg","revision":"a78e4761aa2b3a89"},{"url":"./index.html","revision":"85f8fcb0985c70b0"},{"url":"./manifest.webmanifest","revision":"892d397c2e6bdfc0"},{"url":"./offline.css","revision":"814d3adf4d3d4036"},{"url":"./offline.html","revision":"7a6af997260fb804"}];
  } catch {
    return [];
  }
})();

const CORE_PATHS = [
  "./",
  ...(Array.isArray(INJECTED_PRECACHE) && INJECTED_PRECACHE.length > 0
    ? INJECTED_PRECACHE.map((entry) => entry.url)
    : FALLBACK_CORE_PATHS)
].filter((path, index, paths) => typeof path === "string" && paths.indexOf(path) === index);

function scopedUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

function canCache(response) {
  return response && response.ok && response.type === "basic";
}

async function putSafely(cache, request, response) {
  if (!canCache(response)) return;

  try {
    await cache.put(request, response);
  } catch {
    // A full or private-mode cache must not prevent the live response.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const requests = CORE_PATHS.map(
        (path) => new Request(scopedUrl(path), { cache: "reload", credentials: "same-origin" })
      );
      await cache.addAll(requests);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

async function navigationResponse(event) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const preload = await event.preloadResponse;
    const response = preload || (await fetch(event.request));
    if (canCache(response)) {
      await putSafely(cache, scopedUrl("./index.html"), response.clone());
      return response;
    }
  } catch {
    // Continue to the fully local shell below.
  }

  return (
    (await cache.match(event.request)) ||
    (await cache.match(scopedUrl("./index.html"))) ||
    (await cache.match(scopedUrl("./offline.html"))) ||
    new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  );
}

async function cachedAssetResponse(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const fresh = fetch(event.request)
    .then(async (response) => {
      await putSafely(cache, event.request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(fresh);
    return cached;
  }

  return (await fresh) || new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // The application is deliberately local-only. CSP covers the first load;
  // this guard also rejects cross-origin traffic once the worker controls it.
  if (url.origin !== self.location.origin) {
    event.respondWith(Promise.resolve(new Response("Cross-origin request blocked", { status: 403 })));
    return;
  }

  if (event.request.method !== "GET") {
    event.respondWith(Promise.resolve(new Response("Network writes are disabled", { status: 403 })));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(navigationResponse(event));
    return;
  }

  if (event.request.headers.has("range")) return;

  event.respondWith(cachedAssetResponse(event));
});
