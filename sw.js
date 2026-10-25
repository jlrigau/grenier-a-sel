// Service worker : permet d'installer l'outil et de l'utiliser sans connexion.
// Aucune donnée d'exposant ne passe ici : elles restent dans le navigateur (localStorage).
const VERSION = 'v10';
const SHELL = `grenier-shell-${VERSION}`;
const OCR = 'grenier-ocr-v1'; // moteur de lecture des fiches (gros fichiers qui ne changent pas)

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/engine.js', 'js/room.js', 'js/fiches.js', 'js/xlsx.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  'vendor/fonts/outfit-latin-wght-normal.woff2', 'vendor/fonts/outfit-latin-ext-wght-normal.woff2', 'icons/logo.svg',
];
const OCR_FILES = [
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js',
  'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'vendor/tesseract/lang/fra.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== OCR) await caches.delete(key);
    await self.clients.claim();
  })());
  // Le moteur de lecture est mis en cache en arrière-plan pour fonctionner hors connexion.
  caches.open(OCR).then(async (c) => {
    for (const f of OCR_FILES) if (!(await c.match(f))) await c.add(f).catch(() => {});
  });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.url.includes('/vendor/')) {
    // Fichiers du moteur : d'abord le cache.
    event.respondWith(caches.open(OCR).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // Application : d'abord le réseau (pour avoir la dernière version), sinon le cache.
  event.respondWith((async () => {
    const c = await caches.open(SHELL);
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch {
      return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
    }
  })());
});
