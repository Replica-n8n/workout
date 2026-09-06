/* =========================================================================
   Runa · service worker

   LE NUMÉRO DE VERSION NE VIT QU'ICI. Changer VERSION suffit à invalider
   tout le cache : aucun ?v=... à répercuter ailleurs.

   ⚠️ La coquille est servie CACHE D'ABORD, comme la-cour et gvt : ouvrir
   l'app dehors ne doit dépendre de rien.

   Les rues, elles, ne sont PAS ici : elles vivent dans IndexedDB, par tuile
   géographique, gérées par `js/donnees.js`. Deux raisons de ne pas les
   confier au service worker : elles pèsent des mégaoctets par quartier, et
   leur péremption n'a rien à voir avec celle du code (trente jours pour des
   rues, l'instant même pour une correction de bug).

   ⚠️ Runa est la première app du dépôt qui a besoin du réseau au moins une
   fois par quartier. L'invariant « rien ne dépend du réseau une fois la
   page chargée » tient toujours PENDANT la course : une fois les rues en
   mémoire, la carte et le générateur tournent en avion.
   ========================================================================= */

const VERSION = '0.5.0';
const SHELL = 'runa-shell-' + VERSION;

const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/carte.js',
  './js/donnees.js',
  './lib/geo.js',
  './lib/graph.js',
  './lib/route.js',
  './lib/loop.js',
  './lib/overpass.js',
  './lib/suivi.js',
  './manifest.webmanifest',
  './diag.html',
  './diag.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* Overpass ne doit JAMAIS passer par le cache de la coquille : ses réponses
   pèsent des mégaoctets et ont leur propre magasin. */
const HORS_COQUILLE = /overpass/;

self.addEventListener('install', e => {
  /* `cache: 'reload'` évite qu'addAll() remplisse un cache tout neuf avec
     les fichiers du cache HTTP, donc les ANCIENS. */
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (HORS_COQUILLE.test(e.request.url)) return;
  e.respondWith(
    caches.match(e.request).then(cache => cache || fetch(e.request))
  );
});
