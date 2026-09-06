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

const VERSION = '1.0.0';
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
  e.waitUntil((async () => {
    const ks = await caches.keys();
    const perimes = ks.filter(k => k !== SHELL);
    await Promise.all(perimes.map(k => caches.delete(k)));
    await self.clients.claim();

    /* Une page déjà ouverte a chargé ses modules avec l'ANCIEN lot. Lui faire
       servir la suite avec le nouveau, c'est la même incohérence par un autre
       chemin. On lui demande donc de se recharger, mais seulement s'il y
       avait bien une version précédente : à la toute première installation il
       n'y a rien à recharger. */
    if (perimes.length) {
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.postMessage({ runa: 'recharge' });
      }
    }
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (HORS_COQUILLE.test(e.request.url)) return;

  /* ⚠️ `caches.match(requete)` SANS nom de cache cherche dans TOUS les
     caches et rend le premier trouvé, y compris celui d'une version périmée
     qui n'a pas encore été supprimée. Pendant le passage d'une version à la
     suivante, la page recevait alors un MÉLANGE : l'ancien `donnees.js` avec
     le nouveau `overpass.js`, qui n'exporte plus la même chose. Un import
     raté fait échouer TOUT le module, et l'app s'affichait en HTML nu, sans
     un seul bouton fonctionnel.

     On interroge donc explicitement le cache de CETTE version. Les fichiers
     servis viennent alors forcément du même lot. */
  e.respondWith(
    caches.open(SHELL)
      .then(c => c.match(e.request))
      .then(rep => rep || fetch(e.request))
  );
});
