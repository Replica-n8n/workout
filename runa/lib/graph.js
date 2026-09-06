/* =========================================================================
   Runa · le graphe des rues

   Transforme la réponse brute d'Overpass en un graphe pondéré où le coût
   d'une arête n'est PAS sa longueur, mais sa longueur corrigée par ce qui
   rend une rue agréable ou pénible à courir. C'est là que vit tout l'angle
   de l'app : un itinéraire « court » au sens de Runa est un itinéraire avec
   peu de feux et peu de bitume à quatre voies, pas le plus direct.

   Le graphe est NON ORIENTÉ : les sens interdits ne concernent pas un
   piéton. C'est aussi pour ça qu'on ne peut pas se servir d'un routeur
   voiture tout fait.
   ========================================================================= */

/* Types de voies où l'on ne court pas, ou pas légalement. */
const EXCLUS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'raceway', 'construction', 'proposed', 'bus_guideway',
  'corridor', 'elevator', 'platform', 'rest_area', 'services'
]);

/* Grands axes : désagréables et bruyants, mais surtout dangereux sans
   trottoir déclaré. La spec les pénalise à 1.8. */
const GRANDS_AXES = new Set(['primary', 'primary_link', 'secondary', 'secondary_link']);

const SURFACES_MOLLES = new Set([
  'unpaved', 'ground', 'dirt', 'earth', 'grass', 'sand', 'mud', 'gravel', 'pebblestone'
]);

export const PENALITES = {
  grandAxeSansTrottoir: 1.8,   // spec 5.1
  feuMetresEquivalents: 25,    // spec 5.1 : un feu « coûte » 25 m
  nonEclaireLaNuit: 2.5,       // spec 5.1
  dejaCourue: 1.3,             // spec 5.1, option « rues inédites »
  escaliers: 3.0,              // ajout : des marches cassent une foulée
  surfaceMolle: 1.15,          // ajout : l'app vise le bitume
  paveDeTravers: 1.25          // ajout : les pavés, c'est la cheville
};

/**
 * @param {object} osm      réponse Overpass décodée (`{ elements: [...] }`)
 * @param {object} [opts]
 * @param {boolean} [opts.eviterFeux]  défaut vrai : pénalise feux et grands axes
 * @param {boolean} [opts.nuit]        pénaliser les rues non éclairées
 * @param {Set<number>} [opts.dejaCourues]  ids de ways déjà parcourus
 * @returns {{noeuds: Map, voisins: Map, feux: Set, ways: Map}}
 */
export function construireGraphe(osm, opts = {}) {
  const nuit = !!opts.nuit;
  const dejaCourues = opts.dejaCourues || new Set();
  // Décoché, le coût redevient la simple longueur : c'est le plus court
  // chemin ordinaire, et c'est utile de pouvoir comparer.
  const eviterFeux = opts.eviterFeux !== false;
  const coutFeu = eviterFeux ? PENALITES.feuMetresEquivalents : 0;

  const noeuds = new Map();   // id -> {lat, lon}
  const feux = new Set();     // ids de noeuds highway=traffic_signals
  const passages = new Set(); // ids de noeuds highway=crossing
  const ways = new Map();     // id -> tags, pour l'affichage et l'explication
  const voisins = new Map();  // id -> [{vers, m, cout, way}]

  for (const el of osm.elements) {
    if (el.type === 'node') {
      noeuds.set(el.id, { lat: el.lat, lon: el.lon });
      const h = el.tags && el.tags.highway;
      if (h === 'traffic_signals') feux.add(el.id);
      else if (h === 'crossing') passages.add(el.id);
    }
  }

  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.tags || !el.nodes) continue;
    const t = el.tags;
    if (!t.highway || EXCLUS.has(t.highway)) continue;
    if (t.area === 'yes') continue;
    if (t.foot === 'no' || t.access === 'no' || t.access === 'private') continue;

    const mult = multiplicateur(t, nuit, dejaCourues.has(el.id), eviterFeux);
    if (mult === Infinity) continue;
    ways.set(el.id, t);

    for (let i = 1; i < el.nodes.length; i++) {
      const a = el.nodes[i - 1], b = el.nodes[i];
      const na = noeuds.get(a), nb = noeuds.get(b);
      // Un way peut déborder de la boîte interrogée : ses derniers noeuds
      // manquent alors, et sauter l'arête vaut mieux que de router vers un
      // point dont on ignore la position.
      if (!na || !nb) continue;
      const m = metres(na, nb);
      if (m === 0) continue;
      ajouter(voisins, a, b, m, m * mult + (feux.has(b) ? coutFeu : 0), el.id);
      ajouter(voisins, b, a, m, m * mult + (feux.has(a) ? coutFeu : 0), el.id);
    }
  }

  return { noeuds, voisins, feux, passages, ways };
}

function ajouter(voisins, de, vers, m, cout, way) {
  let l = voisins.get(de);
  if (!l) voisins.set(de, l = []);
  l.push({ vers, m, cout, way });
}

/** Le facteur qui multiplie la longueur réelle d'un tronçon. */
export function multiplicateur(tags, nuit, dejaCourue, eviterFeux = true) {
  let f = 1;

  if (eviterFeux && GRANDS_AXES.has(tags.highway)) {
    const trottoir = tags.sidewalk && tags.sidewalk !== 'no' && tags.sidewalk !== 'none';
    if (!trottoir) f *= PENALITES.grandAxeSansTrottoir;
  }

  if (tags.highway === 'steps') f *= PENALITES.escaliers;

  if (nuit && tags.lit === 'no') f *= PENALITES.nonEclaireLaNuit;

  if (dejaCourue) f *= PENALITES.dejaCourue;

  if (tags.surface) {
    if (SURFACES_MOLLES.has(tags.surface)) f *= PENALITES.surfaceMolle;
    else if (tags.surface === 'cobblestone' || tags.surface === 'sett') f *= PENALITES.paveDeTravers;
  }

  return f;
}

/* Haversine en local plutôt qu'importée : construireGraphe est appelée sur
   des dizaines de milliers d'arêtes, et l'inline évite un aller-retour de
   module par arête. Le résultat est identique à geo.distanceM, qui reste la
   référence testée. */
const R = 6371008.8, RAD = Math.PI / 180;
function metres(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Le noeud du graphe le plus proche d'un point, pour accrocher un départ
 * saisi à la main. Ne renvoie que des noeuds qui ont au moins une arête :
 * accrocher sur un noeud isolé donnerait un itinéraire impossible.
 */
export function noeudLePlusProche(graphe, point) {
  let meilleur = null, meilleureD = Infinity;
  for (const [id, n] of graphe.noeuds) {
    if (!graphe.voisins.has(id)) continue;
    const d = metres(point, n);
    if (d < meilleureD) { meilleureD = d; meilleur = id; }
  }
  return meilleur === null ? null : { id: meilleur, m: meilleureD };
}

/**
 * Ne garder que la plus grande composante connexe.
 *
 * Sans ça, un départ accroché par erreur sur une impasse isolée (une allée
 * privée, un bout de rue coupé du reste par la limite de la boîte) rend
 * toute génération de boucle impossible, et l'échec est incompréhensible
 * pour qui regarde la carte : les rues sont là, elles ont juste l'air
 * reliées alors qu'elles ne le sont pas dans les données.
 */
export function plusGrandeComposante(graphe) {
  const vus = new Set();
  let meilleure = new Set();

  for (const depart of graphe.voisins.keys()) {
    if (vus.has(depart)) continue;
    const composante = new Set([depart]);
    const pile = [depart];
    vus.add(depart);
    while (pile.length) {
      const id = pile.pop();
      for (const a of graphe.voisins.get(id) || []) {
        if (vus.has(a.vers)) continue;
        vus.add(a.vers);
        composante.add(a.vers);
        pile.push(a.vers);
      }
    }
    if (composante.size > meilleure.size) meilleure = composante;
  }

  const voisins = new Map();
  for (const id of meilleure) {
    const l = (graphe.voisins.get(id) || []).filter(a => meilleure.has(a.vers));
    if (l.length) voisins.set(id, l);
  }
  const noeuds = new Map();
  for (const id of meilleure) if (graphe.noeuds.has(id)) noeuds.set(id, graphe.noeuds.get(id));

  return { ...graphe, noeuds, voisins };
}
