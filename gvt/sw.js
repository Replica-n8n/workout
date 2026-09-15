/* =========================================================================
   GVT Tracker · service worker

   LE NUMÉRO DE VERSION NE VIT QU'ICI.
   Changer VERSION suffit à invalider tout le cache : pas de paramètre
   ?v=... à répercuter dans le HTML, le CSS et le module.
   ========================================================================= */

const VERSION = '2.1.1';

/* ⚠️ LE NOM DU CACHE PORTE L'APP ET SA PORTÉE. Toutes les apps du compte
   partagent la même origine (replica-n8n.github.io), donc le même
   CacheStorage. Jusqu'en 1.4.0, l'activation supprimait TOUS les caches qui
   n'étaient pas le sien : mettre GVT à jour effaçait le hors ligne de La Cour,
   de Runa, du Chevalier. On ne supprime plus que les caches de GVT à cette
   portée, plus les anciens `gvt-shell-*`, qui n'appartenaient qu'à GVT. */
const PREFIXE = 'gvt:' + new URL(self.registration.scope).pathname + ':';
const SHELL = PREFIXE + VERSION;

/* ⚠️ En 2.0.0 le CSS et le module ont changé de NOM (app.* devient gvt.*).
   Le cache de la 1.4.0 garde les anciens noms : un ancien index.html ne peut
   donc jamais recevoir le nouveau code, ni l'inverse. C'est ce mélange qui
   figeait l'app après une mise à jour. */
const FILES = [
  './',
  './index.html',
  './css/gvt.css',
  './js/gvt.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/roboto-flex-latin.woff2'
];

self.addEventListener('install', e => {
  /* `cache: 'reload'` est indispensable : sans lui, addAll() passe par le
     cache HTTP du navigateur et peut remplir un cache tout neuf avec les
     ANCIENS fichiers. */
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => (k.startsWith(PREFIXE) && k !== SHELL) || k.startsWith('gvt-shell-'))
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Navigation : le réseau d'abord, en REVALIDANT. Pages sert le HTML avec dix
     minutes de cache HTTP : sans `no-cache`, on recevait un index.html périmé
     alors que le code, lui, était neuf. Hors réseau, la coquille répond,
     prise dans NOTRE cache et pas dans celui d'une autre app. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => res.ok ? res : caches.open(SHELL).then(c => c.match('./index.html')).then(hit => hit || res))
        .catch(() => caches.open(SHELL).then(c => c.match('./index.html')))
    );
    return;
  }

  /* Une requête avec `?` (les outils de contrôle importent audit.js?t=...)
     ne va jamais en cache : sinon chaque import laissait une entrée de plus. */
  const jetable = url.search !== '';

  e.respondWith(
    caches.open(SHELL).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && !jetable) c.put(req, res.clone()).catch(() => {});
      return res;
    })))
  );
});
