/* Radicchio service worker.
   Network-first so a change you ask for lands the next time you open the app
   with signal; cache fallback so it opens at all when you have none. */
var CACHE = "radicchio";
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png",
  "./config.js", "./core/app.css", "./core/util.js", "./core/registry.js", "./core/store.js",
  "./core/files.js", "./core/lineitems.js", "./core/sheets.js", "./core/invoices.js",
  "./core/setup.js", "./core/backup.js", "./core/merge.js", "./core/drive.js",
  "./core/load.js", "./core/boot.js"];
/* The modules come from config.js, so a new module needs no change here. */
try {
  importScripts("./config.js");
  (CONFIG.modules || []).forEach(function (id) { SHELL.push("./modules/" + id + ".js"); });
} catch (e) {}

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") !== -1) return;   // the sign-in server: never cached

  e.respondWith(
    new Promise(function (resolve) {
      var settled = false;
      function done(r) { if (!settled) { settled = true; resolve(r); } }

      // Don't hang on a flaky connection — fall back to cache quickly.
      var timer = setTimeout(function () {
        caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) done(hit);
        });
      }, 2500);

      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
        }
        done(res);
      }).catch(function () {
        clearTimeout(timer);
        caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return done(hit);
          if (req.mode === "navigate") {
            caches.match("./index.html").then(function (idx) {
              done(idx || new Response("Offline and nothing cached yet.", {
                status: 503, headers: { "Content-Type": "text/plain" } }));
            });
          } else {
            done(new Response("", { status: 504 }));
          }
        });
      });
    })
  );
});
