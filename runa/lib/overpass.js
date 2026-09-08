/* =========================================================================
   Runa · la requête OpenStreetMap

   Ce module ne fait AUCUN appel réseau : il fabrique la requête et décide de
   la zone à demander. Le téléchargement et le cache vivent dans
   `js/donnees.js`, côté navigateur. C'est ce qui permet de tester tout ça
   sans jamais taper sur Overpass, dont la limite de débit est agressive et
   qu'on n'a aucune raison de saturer pendant des tests.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

/* Ce qui ne se court pas, filtré côté serveur pour ne pas télécharger des
   mégaoctets de voies rapides qu'on jetterait ensuite. */
const EXCLUS = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'raceway', 'construction', 'proposed', 'bus_guideway',
  'corridor', 'elevator', 'platform'
].join('|');

/* Ce qui sert de repère quand on dit où l'on est. Les commerces changent
   souvent d'enseigne, mais un restaurant périmé sur une carte reste moins
   trompeur qu'une carte sans aucun repère. */
const LIEUX = [
  'restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'place_of_worship'
].join('|');

/**
 * @param {{sud,ouest,nord,est}} b
 * @param {number} [timeout] secondes accordées au serveur
 */
export function requete(b, timeout = 90) {
  const boite = `${b.sud.toFixed(6)},${b.ouest.toFixed(6)},${b.nord.toFixed(6)},${b.est.toFixed(6)}`;
  // Trois sorties, et l'ordre compte :
  //   1. les ways avec leurs tags ET leurs références de noeuds (`body`)
  //   2. la géométrie de ces noeuds SANS leurs tags (`skel`), parce que les
  //      tags de noeud pèsent lourd et ne servent presque jamais
  //   3. les seuls noeuds dont les tags nous intéressent : feux et passages
  /* Les points d'intérêt viennent avec, dans la même requête : mesuré,
     170 Ko contre 2 Mo pour les rues, et ce sont eux qui rendent une carte
     partagée lisible. `out tags center` donne le nom et un point, sans les
     noeuds du contour dont on n'a que faire. */
  return `[out:json][timeout:${timeout}];
way["highway"]["highway"!~"^(${EXCLUS})$"]["area"!="yes"](${boite})->.w;
.w out body;
node(w.w);
out skel qt;
node["highway"~"^(traffic_signals|crossing)$"](${boite});
out body qt;
(
  nwr["amenity"~"^(${LIEUX})$"]["name"](${boite});
  way["leisure"~"^(park|garden)$"]["name"](${boite});
  node["railway"="station"]["name"](${boite});
  node["public_transport"="station"]["name"](${boite});
);
out tags center qt;`;
}

/**
 * Retrouver une zone déjà en mémoire.
 *
 * ⚠️ Trois tentatives, et les deux premières avaient le même défaut de
 * fond : vouloir ranger les zones sur une grille.
 *
 *   1. Une tuile par requête. Une boîte à cheval sur la grille en touche
 *      quatre : quatre requêtes, quatre attentes, quatre occasions d'échouer.
 *   2. Une seule requête sur le rectangle de tuiles englobant. Mesuré sur
 *      Montréal, Paris et Sydney : jusqu'à QUATRE FOIS le disque utile, soit
 *      6,8 Mo au lieu de 2,3 sur un forfait mobile.
 *   3. Une clé arrondie au millième de degré. Mesuré : un point posé près
 *      d'une frontière de la maille bascule d'une clé à l'autre à chaque
 *      relève du GPS, et 27 relèves sur 40 retombaient à côté. Arrondir ne
 *      supprime pas les frontières, il les déplace.
 *
 * On garde donc chaque zone avec SON centre et SON rayon, et on cherche par
 * inclusion : n'importe quelle zone mémorisée qui contient entièrement le
 * disque demandé fait l'affaire. Aucune grille, aucune frontière, et le
 * tremblement du GPS devient sans effet.
 */
export function zoneCouvre(zone, centre, rayonM) {
  if (!zone || typeof zone.rayon !== 'number') return false;
  return distance(zone, centre) + rayonM <= zone.rayon;
}

function distance(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* On demande un peu plus large que le strict nécessaire, pour que le départ
   d'à côté et la relève GPS suivante retombent dans la même zone au lieu de
   retélécharger. 150 m est le compromis : au-delà, la surface croît vite. */
export const MARGE_ZONE = 150;

/* Poids observé des données OSM en ville dense : 589 Ko/km² sur le Plateau
   Mont-Royal, 718 Ko/km² dans le 11e à Paris. On prend le milieu.
   ⚠️ Overpass ne renvoie AUCUN Content-Length sur une réponse en flux : sans
   cette estimation il n'y a pas de barre de progression possible, et une
   barre inventée qui se bloque à 97 % est pire que pas de barre du tout. */
export const OCTETS_PAR_KM2 = 700e3;   // rues + points d'intérêt

/** L'aire d'une boîte, en km². */
export function aireKm2(b) {
  const hauteur = (b.nord - b.sud) * RAD * R;
  const largeur = (b.est - b.ouest) * RAD * R * Math.cos(((b.sud + b.nord) / 2) * RAD);
  return (hauteur * largeur) / 1e6;
}

export function poidsEstime(b) {
  return aireKm2(b) * OCTETS_PAR_KM2;
}
