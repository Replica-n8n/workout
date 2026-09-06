/* =========================================================================
   Runa · le plus court chemin, au sens des coûts de Runa

   A* plutôt que Dijkstra, parce qu'une boucle demande quatre ou cinq
   itinéraires, qu'on en essaie plusieurs, et qu'on vise moins de trois
   secondes de bout en bout.

   ⚠️ INVARIANT dont dépend la justesse d'A* ici : le coût d'une arête est
   toujours SUPÉRIEUR OU ÉGAL à sa longueur en mètres. C'est vrai par
   construction dans graph.js, où tous les facteurs sont ≥ 1 et toutes les
   pénalités de noeud ≥ 0 : on pénalise ce qui déplaît, on ne bonifie jamais
   ce qui plaît. La distance à vol d'oiseau est donc une heuristique
   admissible, et A* rend bien l'optimum.

   Le jour où quelqu'un ajoute un facteur < 1 (« bonifier les parcs »),
   l'heuristique cesse d'être admissible et A* peut rendre un itinéraire qui
   n'est pas le meilleur, SANS RIEN SIGNALER. Il faudra alors soit repasser
   à Dijkstra, soit diviser l'heuristique par le plus petit facteur.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

function metres(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Tas binaire minimal. Un tri de tableau à chaque insertion coûterait
    plus cher que tout le reste de l'algorithme réuni. */
class Tas {
  constructor() { this.a = []; }
  get taille() { return this.a.length; }
  pousser(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  tirer() {
    const a = this.a;
    const haut = a[0];
    const dernier = a.pop();
    if (a.length) {
      a[0] = dernier;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1, d = g + 1;
        let m = i;
        if (g < a.length && a[g].f < a[m].f) m = g;
        if (d < a.length && a[d].f < a[m].f) m = d;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return haut;
  }
}

/**
 * Chemin de `depart` à `arrivee`, en ids de noeuds.
 *
 * @param {object} graphe        sortie de construireGraphe
 * @param {number} depart
 * @param {number} arrivee
 * @param {object} [opts]
 * @param {Set<number>} [opts.waysUtilises]  ways déjà empruntés dans CETTE boucle
 * @param {number} [opts.facteurRetour]      combien on renchérit ces ways
 * @returns {{noeuds: number[], m: number, cout: number} | null}
 */
export function chemin(graphe, depart, arrivee, opts = {}) {
  const { voisins, noeuds } = graphe;
  const utilises = opts.waysUtilises;
  const facteurRetour = opts.facteurRetour ?? 1;

  if (depart === arrivee) return { noeuds: [depart], m: 0, cout: 0 };
  if (!voisins.has(depart) || !voisins.has(arrivee)) return null;

  const cible = noeuds.get(arrivee);
  const g = new Map([[depart, 0]]);      // coût réel connu
  const m = new Map([[depart, 0]]);      // mètres réels, suivis en parallèle
  const de = new Map();
  const clos = new Set();
  const tas = new Tas();
  tas.pousser({ id: depart, f: metres(noeuds.get(depart), cible) });

  while (tas.taille) {
    const { id } = tas.tirer();
    if (clos.has(id)) continue;
    clos.add(id);

    if (id === arrivee) {
      const chemin = [id];
      let c = id;
      while (de.has(c)) { c = de.get(c); chemin.push(c); }
      chemin.reverse();
      return { noeuds: chemin, m: m.get(arrivee), cout: g.get(arrivee) };
    }

    const gi = g.get(id);
    for (const a of voisins.get(id) || []) {
      if (clos.has(a.vers)) continue;
      // Renchérir un tronçon déjà emprunté dans cette boucle est ce qui
      // empêche le générateur de rendre un aller-retour sur la même rue.
      const cout = utilises && utilises.has(a.way) ? a.cout * facteurRetour : a.cout;
      const nouveau = gi + cout;
      if (nouveau < (g.get(a.vers) ?? Infinity)) {
        g.set(a.vers, nouveau);
        m.set(a.vers, m.get(id) + a.m);
        de.set(a.vers, id);
        tas.pousser({ id: a.vers, f: nouveau + metres(noeuds.get(a.vers), cible) });
      }
    }
  }
  return null;
}

/** Les ways empruntés par un chemin, pour pouvoir les renchérir ensuite. */
export function waysDuChemin(graphe, ids) {
  const out = new Set();
  for (let i = 1; i < ids.length; i++) {
    const a = (graphe.voisins.get(ids[i - 1]) || []).find(x => x.vers === ids[i]);
    if (a) out.add(a.way);
  }
  return out;
}

/** Transforme une suite d'ids en polyligne affichable. */
export function polyligne(graphe, ids) {
  return ids.map(id => graphe.noeuds.get(id)).filter(Boolean);
}
