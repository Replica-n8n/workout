/* =========================================================================
   Runa · la requête OpenStreetMap

   Ce module ne fait AUCUN appel réseau : il fabrique la requête et découpe
   le monde en tuiles. Le téléchargement et le cache vivent dans
   `js/donnees.js`, côté navigateur. C'est ce qui permet de tester la
   requête sans jamais taper sur Overpass, dont la limite de débit est
   agressive et qu'on n'a aucune raison de saturer pendant des tests.
   ========================================================================= */

/* Ce qui ne se court pas, filtré côté serveur pour ne pas télécharger des
   mégaoctets de voies rapides qu'on jetterait ensuite. */
const EXCLUS = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'raceway', 'construction', 'proposed', 'bus_guideway',
  'corridor', 'elevator', 'platform'
].join('|');

/**
 * @param {{sud,ouest,nord,est}} b
 * @param {number} [timeout] secondes accordées au serveur
 */
export function requete(b, timeout = 50) {
  const boite = `${b.sud.toFixed(6)},${b.ouest.toFixed(6)},${b.nord.toFixed(6)},${b.est.toFixed(6)}`;
  // Trois sorties, et l'ordre compte :
  //   1. les ways avec leurs tags ET leurs références de noeuds (`body`)
  //   2. la géométrie de ces noeuds SANS leurs tags (`skel`), parce que les
  //      tags de noeud pèsent lourd et ne servent presque jamais
  //   3. les seuls noeuds dont les tags nous intéressent : feux et passages
  return `[out:json][timeout:${timeout}];
way["highway"]["highway"!~"^(${EXCLUS})$"]["area"!="yes"](${boite})->.w;
.w out body;
node(w.w);
out skel qt;
node["highway"~"^(traffic_signals|crossing)$"](${boite});
out body qt;`;
}

/**
 * Clé de tuile pour le cache.
 *
 * Overpass est lent et limité en débit, mais les rues ne bougent quasiment
 * pas : ce qu'on télécharge une fois est bon pour des semaines. On découpe
 * donc en tuiles fixes plutôt que de cacher par requête, sinon deux départs
 * distants de 50 mètres feraient deux téléchargements complets.
 *
 * 0.02° font environ 2,2 km en latitude : une tuile couvre largement une
 * boucle d'une heure, et un quartier tient en une poignée de tuiles.
 */
export const PAS_TUILE = 0.02;

export function tuile(point) {
  return {
    i: Math.floor(point.lat / PAS_TUILE),
    j: Math.floor(point.lon / PAS_TUILE)
  };
}

export function cleTuile(t) { return `${t.i}:${t.j}`; }

/** Les tuiles qui couvrent une boîte. Pas de marge : la boîte est déjà
    calculée avec un rayon confortable autour du départ, en ajouter une
    doublerait le téléchargement du premier quartier pour rien. */
export function tuilesPour(b) {
  const out = [];
  const i0 = Math.floor(b.sud / PAS_TUILE), i1 = Math.floor(b.nord / PAS_TUILE);
  const j0 = Math.floor(b.ouest / PAS_TUILE), j1 = Math.floor(b.est / PAS_TUILE);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push({ i, j });
  return out;
}

export function boiteDeTuile(t) {
  return {
    sud: t.i * PAS_TUILE,
    ouest: t.j * PAS_TUILE,
    nord: (t.i + 1) * PAS_TUILE,
    est: (t.j + 1) * PAS_TUILE
  };
}

/** Fusionne plusieurs réponses Overpass en une seule, sans doublons. */
export function fusionner(reponses) {
  const vus = new Set();
  const elements = [];
  for (const r of reponses) {
    for (const el of r.elements || []) {
      const cle = el.type[0] + el.id;
      if (vus.has(cle)) continue;
      vus.add(cle);
      elements.push(el);
    }
  }
  return { elements };
}
