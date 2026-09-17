/* =========================================================================
   La Cour · service worker

   LE NUMÉRO DE VERSION NE VIT QU'ICI.
   Changer VERSION suffit à invalider tout le cache : pas de paramètre
   ?v=... à répercuter dans le HTML, le CSS et les modules.
   ========================================================================= */

const VERSION = '1.9.1';
/* Toutes nos apps partagent l'origine replica-n8n.github.io, donc le même
   CacheStorage. Le nom porte l'app et sa portée, et l'activation ne supprime
   QUE ces caches-là : avant, La Cour effaçait ceux de GVT, de Runa et des
   jeux, qui ne marchaient plus hors ligne jusqu'à leur prochaine visite. */
const PREFIXE = 'lacour:' + new URL(self.registration.scope).pathname + ':';
const SHELL = PREFIXE + VERSION;
const ANCIENS = ['lacour-shell-', 'lacour-assets-'];

const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/data.js',
  './js/store.js',
  './js/media.js',
  './js/figures.js',
  './polices/saira-condensed-600.woff2',
  './polices/saira-condensed-700.woff2',
  './polices/saira-condensed-800.woff2',
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
     1.2.2, et une mise à jour qui ne met rien à jour. Constaté en local,
     et possible en production tant que Pages sert ses en-têtes de cache. */
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => (k.startsWith(PREFIXE) && k !== SHELL) || ANCIENS.some(a => k.startsWith(a)))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* Plus rien ne vient d'une autre origine depuis que la police est hébergée. */
  if (url.origin !== location.origin) return;

  /* Navigation : le réseau d'abord si disponible, sinon la coquille.
     Un parc n'a pas de réseau, la coquille doit toujours répondre.
     `no-cache` revalide le HTML : Pages le garde 10 minutes en cache HTTP, et
     un ancien index.html pouvait sinon partir avec le nouveau JavaScript. */
  if (req.mode === 'navigate') {
    const coquille = () => caches.open(SHELL).then(c => c.match('./index.html'));
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => res.ok ? res : coquille().then(hit => hit || res))
        .catch(coquille)
    );
    return;
  }

  /* `res.ok` est indispensable : sans lui, un 404 finissait en cache et
     était resservi indéfiniment. Concrètement, une image ajoutée dans
     images/ APRÈS un premier chargement restait invisible, le worker
     répondant par l'échec qu'il avait mémorisé avant qu'elle existe.
     La recherche se fait dans NOTRE cache seulement : un `caches.match`
     sans nom pouvait rendre un fichier du même chemin rangé par une autre app. */
  e.respondWith(
    caches.open(SHELL).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    })))
  );
});
