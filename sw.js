const CACHE_NAME = "btts-scanner-pro-v04-final";

const APP_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())

  );

});


self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys()
      .then(keys => {

        return Promise.all(

          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))

        );

      })
      .then(() => self.clients.claim())

  );

});


self.addEventListener("fetch", event => {

  event.respondWith(

    fetch(event.request)
      .then(response => {

        if (
          response &&
          response.status === 200 &&
          event.request.method === "GET"
        ) {

          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, copy);
            });

        }

        return response;

      })
      .catch(() => {

        return caches.match(event.request);

      })

  );

});
