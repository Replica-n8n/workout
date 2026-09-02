/* =========================================================================
   GVT Tracker · service worker

   LE NUMÉRO DE VERSION NE VIT QU'ICI.
   Changer VERSION suffit à invalider tout le cache : pas de paramètre
   ?v=... à répercuter dans le HTML, le CSS et le module.
   ========================================================================= */

const VERSION = '1.3.0';
const SHELL = 'gvt-shell-' + VERSION;

const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  /* `cache: 'reload'` est indispensable : sans lui, addAll() passe par le
     cache HTTP du navigateur et peut remplir un cache tout neuf avec les
     ANCIENS fichiers. On obtient alors un cache nommé 1.2.3 contenant du
     1.2.2, et une mise à jour qui ne met rien à jour. */
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  /* Navigation : le réseau d'abord si disponible, sinon la coquille.
     Une salle de sport en sous-sol n'a pas de réseau, la coquille doit
     toujours répondre. */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  /* `res.ok` est indispensable : sans lui, un 404 finit en cache et est
     resservi indéfiniment, y compris pour un fichier ajouté plus tard. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copie = res.clone();
        caches.open(SHELL).then(c => c.put(req, copie)).catch(() => {});
      }
      return res;
    }))
  );
});
