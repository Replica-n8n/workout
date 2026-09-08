/* =========================================================================
   Runa · dire où l'on est

   « Je suis à 4 km » ne permet à personne de venir vous rejoindre. Un
   carrefour, si : c'est ce qu'on se dit vraiment au téléphone.

   Mesuré sur dix positions le long d'une vraie boucle du Plateau : un
   carrefour nommé trouvé DIX FOIS SUR DIX, à 13 m en médiane, 26 m au pire.
   Et sans rien demander de plus au réseau : les 535 noms de rues sont déjà
   dans ce que l'app télécharge pour calculer ses boucles.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

/* Au-delà, ce n'est plus « au coin de », c'est une approximation qui
   enverrait quelqu'un au mauvais endroit. Le pire cas mesuré étant 26 m,
   la marge est large. */
export const LOIN_M = 250;

/**
 * Les rues NOMMÉES qui se croisent en chaque nœud.
 *
 * Construit une fois par quartier : refaire le tour du graphe à chaque
 * position coûterait un dixième de seconde pour rien.
 */
export function indexerCarrefours(graphe) {
  const parNoeud = new Map();
  for (const [de, liens] of graphe.voisins) {
    for (const l of liens) {
      const t = graphe.ways.get(l.way);
      if (!t || !t.name) continue;
      for (const n of [de, l.vers]) {
        let noms = parNoeud.get(n);
        if (!noms) parNoeud.set(n, noms = new Set());
        noms.add(t.name);
      }
    }
  }
  // Un nœud d'une seule rue n'est pas un carrefour : c'est un point au
  // milieu d'un pâté de maisons, et le nommer ne situe personne.
  const out = [];
  for (const [id, noms] of parNoeud) {
    if (noms.size < 2) continue;
    const n = graphe.noeuds.get(id);
    if (n) out.push({ lat: n.lat, lon: n.lon, noms: [...noms] });
  }
  return out;
}

/**
 * « Rue Marie-Anne Est » se dit « Marie-Anne Est » entre gens qui se donnent
 * rendez-vous, et l'image n'a pas la place du reste.
 */
const TYPE_DE_VOIE =
  /^(rue|avenue|boulevard|chemin|allée|allee|impasse|place|côte|cote|montée|montee|ruelle|promenade|quai|square|voie|route|passage|sentier|cours|esplanade)\s+/i;

/* Et l'article qui suit : on dit « au coin de Saint-Denis et Mont-Royal »,
   pas « et du Mont-Royal ». */
const ARTICLE = /^(du|de la|des|de l’|de l'|de|le|la|les|l’|l')\s+/i;

export function abreger(nom) {
  let court = nom.replace(TYPE_DE_VOIE, '');
  const sansArticle = court.replace(ARTICLE, '');
  if (sansArticle.length >= 2) court = sansArticle;
  // Certaines voies n'ont QUE leur type pour nom (« la Promenade ») :
  // les abréger n'en laisserait rien.
  return court.length >= 2 ? court : nom;
}

/**
 * Le carrefour nommé le plus proche d'une position.
 *
 * @returns {{nom:string, distanceM:number}|null}
 */
export function carrefourProche(carrefours, position, loinM = LOIN_M) {
  if (!carrefours || !carrefours.length || !position) return null;
  const kx = R * RAD * Math.cos(position.lat * RAD), ky = R * RAD;
  let meilleur = null, mieux = Infinity;
  for (const c of carrefours) {
    const d = Math.hypot((c.lon - position.lon) * kx, (c.lat - position.lat) * ky);
    if (d < mieux) { mieux = d; meilleur = c; }
  }
  if (!meilleur || mieux > loinM) return null;
  return {
    nom: meilleur.noms.slice(0, 2).map(abreger).join(' et '),
    distanceM: Math.round(mieux)
  };
}

/**
 * Un nombre à la française : la virgule décimale.
 *
 * ⚠️ Toute l'app écrit encore « 4.63 km » avec un point, hérité de
 * `toFixed`. On corrige ici seulement, parce que c'est l'image qui part dans
 * une conversation et qu'on la lit comme une phrase, pas comme un tableau.
 */
export function nombre(x, decimales = 1) {
  return x.toFixed(decimales).replace('.', ',');
}

/* ------------------------------------------------- les points d'intérêt */

/**
 * Trie les repères d'une réponse Overpass en trois familles.
 *
 * Trois, et pas une seule liste : elles ne se dessinent pas pareil et ne
 * servent pas au même moment. Un parc se voit de loin et ne déménage
 * jamais ; un café sert à se donner rendez-vous mais change d'enseigne.
 */
export function reperes(osm) {
  const parcs = [], stations = [], tables = [];
  if (!osm || !osm.elements) return { parcs, stations, tables };
  for (const el of osm.elements) {
    const t = el.tags;
    if (!t || !t.name) continue;
    const c = el.center ? { lat: el.center.lat, lon: el.center.lon }
            : (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
    if (!c) continue;
    const o = { nom: t.name, lat: c.lat, lon: c.lon };
    if (t.leisure === 'park' || t.leisure === 'garden' || t.amenity === 'place_of_worship') parcs.push(o);
    else if (t.railway === 'station' || t.public_transport === 'station') stations.push(o);
    else if (t.amenity) tables.push(o);
  }
  return { parcs, stations, tables };
}

/** Les plus proches d'un point, les `combien` premières. */
export function plusProches(liste, point, combien, maxM = Infinity) {
  if (!liste || !point) return [];
  const kx = R * RAD * Math.cos(point.lat * RAD), ky = R * RAD;
  return liste
    .map(o => ({ ...o, d: Math.hypot((o.lon - point.lon) * kx, (o.lat - point.lat) * ky) }))
    .filter(o => o.d <= maxM)
    .sort((a, b) => a.d - b.d)
    .slice(0, combien);
}
