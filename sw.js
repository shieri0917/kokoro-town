// こころタウン Service Worker
// アプリ本体（HTML/CSS/JS/画像）だけをキャッシュする。
// AIモデル本体のキャッシュはWebLLM側のCache APIが別途管理するため、ここでは触らない。

const CACHE_NAME = "kokoro-town-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./js/app.js",
  "./js/storage.js",
  "./js/knowledge.js",
  "./js/chat.js",
  "./js/gamification.js",
  "./js/selfcare.js",
  "./js/lifedesign.js",
  "./assets/ghost.png",
  "./assets/rabbit.png",
  "./assets/cat.png",
  "./assets/icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES).catch(() => {
      // 一部ファイルが無くても失敗させない（開発中の差分に強くする）
    }))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 同一オリジンのアプリ本体ファイルのみ cache-first。
  // それ以外（AIモデルのダウンロードなど huggingface.co 等）はそのままネットワークへ通す。
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && event.request.method === "GET") {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
