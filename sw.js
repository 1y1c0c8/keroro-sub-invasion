/*
 * Keroro藍星地下侵略計畫 — Service Worker
 * 策略：Cache-first（先查快取，沒有才走網路，並把網路回應存入快取）
 *
 * 部署新版本時請務必更新 CACHE_VERSION，舊快取會在 activate 階段自動清除；
 * 否則 Cache-first 會一直回傳舊版 index.html。
 */
const CACHE_VERSION = 'v1.0.1';
const CACHE_PREFIX = 'keroro-base-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// 核心檔案：任一失敗就視為安裝失敗（確保離線可開啟）
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// 選用資源：個別快取，缺檔不會讓整個 Service Worker 安裝失敗
// 未來新增的遊戲資源（CSS、JS、音效、卡通圖片）可直接加在這裡預先快取
const OPTIONAL_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png'
  // './assets/css/game.css',
  // './assets/js/game.js',
  // './assets/img/keroro.png',
  // './assets/sfx/kero.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' 繞過瀏覽器 HTTP 快取，確保抓到剛部署的新版檔案
    await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await Promise.all(
      OPTIONAL_ASSETS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('[SW] 選用資源快取失敗：', url, err))
      )
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只處理同源的 GET 請求；Range 請求（音訊/影片分段）交給瀏覽器處理
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // 執行期快取：之後新增的遊戲資源第一次載入後就會自動進入快取
      if (res && res.ok && res.type === 'basic') {
        event.waitUntil(cache.put(req, res.clone()));
      }
      return res;
    } catch (err) {
      // 離線時的頁面導覽一律回傳快取中的 index.html
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('目前離線，且此資源尚未被快取。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
