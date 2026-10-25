// Service worker : permet d'installer l'outil et de l'utiliser sans connexion.
// Aucune donnée d'exposant ne passe ici : elles restent dans le navigateur (localStorage).
const VERSION = 'v55';
const SHELL = `grenier-shell-${VERSION}`;
const OCR = 'grenier-ocr-v1'; // moteur de lecture des fiches (gros fichiers qui ne changent pas)

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/engine.js', 'js/room.js', 'js/fiches.js', 'js/xlsx.js', 'js/code.js', 'js/util.js', 'js/day.js', 'js/messages.js', 'js/inscriptions.js', 'js/help.js',
  'inscription.html', 'js/inscription.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  'vendor/fonts/outfit-latin-wght-normal.woff2', 'vendor/fonts/outfit-latin-ext-wght-normal.woff2', 'icons/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== OCR) await caches.delete(key);
    await self.clients.claim();
  })());
  // Le moteur de lecture des photos (plusieurs Mo) n'est plus téléchargé d'avance : il est mis en
  // cache à sa première utilisation (voir « /vendor/ » ci-dessous), puis marche hors connexion.
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
