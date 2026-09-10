/* =========================================================================
   Runa · le parcours qu'on retient

   « Quand c'est trop long, le cerveau fonctionne en automatique. Il faut que
   le parcours soit simple, et qu'on n'ait pas besoin de sortir son téléphone
   à tous les coins de rue. »

   Le générateur habituel change de rue 17 fois par boucle de 5 km. Choisir
   la plus simple parmi vingt-quatre candidates ne descend qu'à 20 : ce n'est
   pas un problème de réglage, il faut un autre algorithme. Celui-ci fabrique
   un RECTANGLE DE RUES : « Rachel jusqu'à Saint-Dominique, Saint-Dominique
   jusqu'à Laurier, Laurier jusqu'à Chambord, et Rachel ramène ». Cinq
   étapes, qu'on se récite avant de partir.

   ⚠️ CE PARCOURS A BEAUCOUP PLUS DE FEUX, et ce n'est pas réparable.
   Mesuré : 26 contre 1 sur le Plateau, 31 contre 13 à Villeray. La cause est
   la ville, pas le code. Un parcours mémorisable a besoin de longues rues,
   or les longues rues d'un quartier sont soit des axes, qui portent les
   feux, soit des résidentielles PARALLÈLES entre elles, qui ne se croisent
   donc jamais et n'enferment aucun terrain. Retirer les quinze axes du
   Plateau supprime 158 des 233 croisements : ce sont eux qui tiennent la
   grille. Restreindre les corridors aux rues calmes ne rend aucun circuit.

   C'est pourquoi ce parcours est une PROPOSITION DE PLUS dans la liste, avec
   son compte de feux affiché comme les autres, et jamais le choix par
   défaut. Le coureur voit le marché au moment de choisir.
   ========================================================================= */

import { chemin, waysDuChemin } from './route.js';
import { mesurer } from './loop.js';

const R = 6371008.8, RAD = Math.PI / 180;

/* Un corridor plus court ne se raconte pas, et une rue tortueuse non plus :
   « tu prends Saint-Denis » suppose qu'on la suive sans y penser. */
const MINI_CORRIDOR_M = 400;
const DROITURE = 0.80;

/* On ne garde comme corridor que ce qui est une VRAIE rue. Un trottoir n'a
   pas de nom, un sentier ne se dit pas, et un tunnel à bus s'était invité
   dans le classement de Lyon au premier essai. */
const VRAIE_RUE = /^(residential|tertiary|secondary|primary|living_street|unclassified|pedestrian)$/;

/* La bande, de part et d'autre de la chaussée, qui compte encore comme « la
   rue ». Elle doit contenir les deux trottoirs : 62 % d'un parcours les
   emprunte, et c'est sur eux qu'on longe réellement un corridor. */
const COLLE_M = 25;

/* Au-delà, l'arête est fermée et le trajet ne peut plus s'écarter de la rue.
   70 m laisse passer le contournement d'une place ou d'un terre-plein, sans
   laisser A* partir explorer le quartier. */
const LARGE_M = 70;

/* Ce que coûte de quitter le corridor. Un facteur, jamais un rabais : voir
   l'avertissement sur l'admissibilité dans `route.js`. */
const ECART = 5;

/* Un tronçon plus court est un virage, pas une étape. */
const MINI_TRONCON_M = 250;

/* Au-delà, le circuit ne répond plus à la distance demandée. Même valeur que
   le classement des boucles ordinaires, pour que les cartes soient
   comparables entre elles. */
const TOL = 0.12;

/* Combien de circuits on refait à pied avant de choisir. Chacun coûte quatre
   A*, donc on ne peut pas tous les faire sur un téléphone. Mesuré à
   Villeray : les vingt premiers contiennent le circuit le moins allumé des
   trente-quatre. */
const MAX_ROUTES = 20;

/* --------------------------------------------------------- les corridors */

/**
 * Le bout à bout d'un morceau de rue, en deux passes.
 *
 * ⚠️ Comparer toutes les paires est exact mais quadratique, et c'était la
 * moitié du temps de calcul : 12 secondes pour un parcours de 8 km sur le
 * Plateau, sur un ordinateur. On part du point le plus loin du centre de
 * gravité, puis on cherche le point le plus loin de celui-là. Sur une rue
 * quasi droite, c'est-à-dire précisément ce qu'on garde ici, le résultat est
 * exact ; sur une rue tortueuse il sous-estime, donc il ne peut que la
 * REJETER à tort, jamais l'accepter à tort. L'erreur va du bon côté.
 */
function ecartBoutABout(pts, X, Y) {
  if (pts.length < 2) return 0;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += X(p); cy += Y(p); }
  cx /= pts.length; cy /= pts.length;

  const plusLoinDe = (x, y) => {
    let mieux = pts[0], d0 = -1;
    for (const p of pts) {
      const d = Math.hypot(X(p) - x, Y(p) - y);
      if (d > d0) { d0 = d; mieux = p; }
    }
    return mieux;
  };
  const a = plusLoinDe(cx, cy);
  const b = plusLoinDe(X(a), Y(a));
  return Math.hypot(X(a) - X(b), Y(a) - Y(b));
}

/**
 * Les longues rues droites autour d'un point.
 *
 * ⚠️ Chaque rue est traitée SEULE. Construire un graphe rue-à-rue, puis y
 * router, a été essayé et échoue : 103 nœuds atteints sur 1262, parce que
 * deux rues qui se croisent visiblement ne partagent aucun nœud dès qu'un
 * trottoir sans nom s'intercale. Ici il n'y a rien à router entre deux
 * corridors, ils partagent déjà un nœud.
 *
 * @returns {{nom:string, m:number, adj:Map, noeuds:Set}[]} du plus long au plus court
 */
export function corridors(graphe, centre, rayonM) {
  const kx = R * RAD * Math.cos(centre.lat * RAD), ky = R * RAD;
  const X = n => (n.lon - centre.lon) * kx, Y = n => (n.lat - centre.lat) * ky;
  const pres = id => {
    const n = graphe.noeuds.get(id);
    return n && Math.hypot(X(n), Y(n)) <= rayonM;
  };

  const parNom = new Map(), vus = new Set();
  for (const [de, liens] of graphe.voisins) {
    for (const l of liens) {
      const cle = de < l.vers ? de + ':' + l.vers : l.vers + ':' + de;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (!pres(de) && !pres(l.vers)) continue;
      const t = graphe.ways.get(l.way);
      if (!t || !t.name || !VRAIE_RUE.test(t.highway) || t.tunnel) continue;
      if (!parNom.has(t.name)) parNom.set(t.name, []);
      parNom.get(t.name).push([de, l.vers, l.m]);
    }
  }

  const out = [];
  for (const [nom, aretes] of parNom) {
    const adj = new Map();
    for (const [a, b, m] of aretes) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push([b, m]);
      adj.get(b).push([a, m]);
    }
    /* Une même rue peut arriver en plusieurs morceaux séparés, coupée par un
       parc ou simplement homonyme d'une autre. On les prend un par un. */
    const faits = new Set();
    for (const dep of adj.keys()) {
      if (faits.has(dep)) continue;
      const compo = [], file = [dep], comptees = new Set();
      let longueur = 0;
      faits.add(dep);
      while (file.length) {
        const x = file.shift();
        compo.push(x);
        for (const [w, m] of adj.get(x)) {
          const c = x < w ? x + ':' + w : w + ':' + x;
          if (!comptees.has(c)) { comptees.add(c); longueur += m; }
          if (!faits.has(w)) { faits.add(w); file.push(w); }
        }
      }
      if (longueur < MINI_CORRIDOR_M) continue;
      const pts = compo.map(id => graphe.noeuds.get(id)).filter(Boolean);
      if (ecartBoutABout(pts, X, Y) / longueur < DROITURE) continue;
      out.push({ nom, m: longueur, adj, noeuds: new Set(compo) });
    }
  }
  return out.sort((a, b) => b.m - a.m);
}

/** Le plus court chemin LE LONG d'un corridor, entre deux de ses nœuds. */
export function leLong(corridor, a, b) {
  if (a === b) return { m: 0, noeuds: [a] };
  if (!corridor.adj.has(a) || !corridor.adj.has(b)) return null;
  const d = new Map([[a, 0]]), prec = new Map(), clos = new Set();
  while (true) {
    let x = null, mieux = Infinity;
    for (const [n, v] of d) if (!clos.has(n) && v < mieux) { mieux = v; x = n; }
    if (x == null) return null;
    if (x === b) break;
    clos.add(x);
    for (const [w, m] of corridor.adj.get(x) || []) {
      const nd = mieux + m;
      if (!d.has(w) || nd < d.get(w)) { d.set(w, nd); prec.set(w, x); }
    }
  }
  const suite = [b];
  while (suite[0] !== a) suite.unshift(prec.get(suite[0]));
  return { m: d.get(b), noeuds: suite };
}

/* ------------------------------------------------- coller à un corridor */

/**
 * À quelle distance de la chaussée se trouve un nœud, en trois classes :
 * 0 sur la rue, 1 dans ses parages, 2 ailleurs.
 *
 * Grille de hachage au pas de LARGE_M : sans elle, chaque arête examinée par
 * A* comparerait sa position à tous les nœuds du corridor. Chaque point est
 * posé dans les neuf cases voisines, parce qu'un point à 69 m peut tomber
 * dans la case d'à côté et que l'oublier ferait sortir le trajet du trottoir.
 */
function bande(graphe, corridor) {
  const premier = graphe.noeuds.get(corridor.noeuds.values().next().value);
  const kx = R * RAD * Math.cos(premier.lat * RAD), ky = R * RAD;
  const cases = new Map();
  const cle = (x, y) => Math.round(x / LARGE_M) + ':' + Math.round(y / LARGE_M);
  for (const id of corridor.noeuds) {
    const n = graphe.noeuds.get(id);
    if (!n) continue;
    const x = n.lon * kx, y = n.lat * ky;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const k = (Math.round(x / LARGE_M) + a) + ':' + (Math.round(y / LARGE_M) + b);
        if (!cases.has(k)) cases.set(k, []);
        cases.get(k).push([x, y]);
      }
    }
  }
  return id => {
    const n = graphe.noeuds.get(id);
    if (!n) return 2;
    const x = n.lon * kx, y = n.lat * ky;
    let mieux = Infinity;
    for (const [px, py] of cases.get(cle(x, y)) || []) {
      const d = Math.hypot(x - px, y - py);
      if (d < mieux) mieux = d;
    }
    return mieux <= COLLE_M ? 0 : mieux <= LARGE_M ? 1 : 2;
  };
}

/**
 * Le trajet réel, à pied, d'un bout à l'autre d'un corridor.
 *
 * ⚠️ Ne PAS se contenter de la géométrie du corridor : elle décrit l'axe de
 * la chaussée, où sont posés les nœuds `highway=traffic_signals`. Un piéton
 * ne passe pas par là, il longe le trottoir et traverse aux passages. Compter
 * les feux sur l'axe donnait 101 là où il y en a 49.
 */
function aPied(graphe, corridor, de, vers) {
  const ou = bande(graphe, corridor);
  const cache = new Map();
  const classe = id => {
    let c = cache.get(id);
    if (c === undefined) { c = ou(id); cache.set(id, c); }
    return c;
  };
  return chemin(graphe, de, vers, {
    /* Au-delà de LARGE_M, l'arête est fermée : c'est ce qui ramène la
       recherche d'un quartier entier à un ruban le long de la rue. Sans cette
       borne, un parcours de 8 km demandait douze secondes de calcul. */
    facteur: (a, b) => {
      const x = classe(a), y = classe(b);
      if (x === 2 || y === 2) return Infinity;
      return (x === 0 && y === 0) ? 1 : ECART;
    }
  });
}

/* ---------------------------------------------------------- l'assemblage */

/* Jusqu'où l'on accepte de marcher pour rejoindre la boucle.
   ⚠️ Exiger que la boucle passe DEVANT CHEZ SOI était ma contrainte, pas
   celle de la ville. Mesuré à la Croix-Rousse : 24 cycles existent, 14 sont
   rejetés parce que le départ n'est pas dessus. Une amorce de quelques
   centaines de mètres les débloque, au prix d'une étape en plus. */
const APPROCHE_MAX_M = 700;

/* En deçà, on considère qu'on est déjà sur la boucle et il n'y a pas
   d'amorce à annoncer. C'est la largeur d'un pâté de maisons. */
const SUR_LA_BOUCLE_M = 60;

/* Au-delà, « sept tours » n'est plus un parcours de quartier, c'est une
   piste d'athlétisme, et personne n'a demandé ça. */
const MAX_TOURS = 5;

/* Part maximale de la sortie que l'aller-retour vers la boucle peut manger. */
const PART_AMORCE_MAX = 0.30;

/**
 * Un parcours en quelques rues, ou `null` si le quartier n'en porte pas.
 *
 * Trois formes possibles, de la plus simple à la plus contrainte :
 *   1. la boucle passe devant chez vous et fait la bonne distance ;
 *   2. elle passe devant chez vous mais elle est courte : on la répète ;
 *   3. elle est à côté : on la rejoint, on la fait, on rentre.
 *
 * ⚠️ Rendre `null` est un RÉSULTAT, pas un échec à rattraper. Certains
 * quartiers n'ont pas de rues longues qui se croisent, et leur inventer un
 * mauvais parcours serait pire que se taire.
 *
 * @param {object} graphe
 * @param {object} o
 * @param {{lat:number,lon:number}} o.depart
 * @param {number} o.distanceCible  en mètres
 * @param {number} [o.rayonM]       où chercher les corridors
 * @returns {object|null} même forme qu'une boucle ordinaire, plus `.etapes`,
 *   `.tours` et `.approcheM`
 */
/**
 * Ce qui fait qu'un parcours à retenir est « le même » : ses rues, sans
 * l'ordre ni le sens. Deux circuits qui prennent les mêmes quatre rues se
 * récitent pareil, et les proposer l'un après l'autre ne changerait rien.
 */
export function signature(etapes) {
  return [...new Set((etapes || []).filter(e => !e.approche).map(e => e.nom))].sort().join('|');
}

export function parcoursSimple(graphe, o) {
  const centre = o.depart;
  const cible = o.distanceCible;
  const rayon = o.rayonM ?? Math.max(600, Math.min(2500, cible * 0.35));

  const cors = corridors(graphe, centre, rayon);
  if (cors.length < 3) return null;

  const kx = R * RAD * Math.cos(centre.lat * RAD), ky = R * RAD;
  const loin = id => {
    const n = graphe.noeuds.get(id);
    return n ? Math.hypot((n.lon - centre.lon) * kx, (n.lat - centre.lat) * ky) : Infinity;
  };

  /* Un croisement par paire de corridors, trouvé par le NŒUD et non par la
     paire : un nœud partagé par deux corridors EST leur croisement. */
  const croise = new Map();
  const voisins = cors.map(() => []);
  const parNoeud = new Map();
  for (let i = 0; i < cors.length; i++) {
    for (const n of cors[i].noeuds) {
      if (!parNoeud.has(n)) parNoeud.set(n, []);
      parNoeud.get(n).push(i);
    }
  }
  for (const [n, liste] of parNoeud) {
    if (liste.length < 2) continue;
    for (let a = 0; a < liste.length; a++) {
      for (let b = a + 1; b < liste.length; b++) {
        const i = liste[a], j = liste[b];
        if (croise.has(i + ':' + j)) continue;
        croise.set(i + ':' + j, n);
        croise.set(j + ':' + i, n);
        voisins[i].push(j);
        voisins[j].push(i);
      }
    }
  }
  const croisement = (a, b) => croise.get(a + ':' + b);

  /* Les corridors assez proches pour qu'un cycle qui les contient soit
     rejoignable. Sans cette borne l'énumération partirait explorer tout le
     quartier téléchargé. */
  const proches = [];
  for (let i = 0; i < cors.length; i++) {
    let d0 = Infinity;
    for (const id of cors[i].noeuds) { const d = loin(id); if (d < d0) d0 = d; }
    if (d0 <= APPROCHE_MAX_M) proches.push(i);
  }
  if (!proches.length) return null;

  /* ⚠️ Sans cette mémoire, `leLong` refaisait le même Dijkstra des milliers
     de fois : toutes les chaînes qui commencent pareil partagent leurs
     premières étapes. C'était l'essentiel du temps de calcul, dix-sept
     secondes pour 8 km sur le Plateau. Ce n'était NI la détection des
     corridors NI A*, contrairement à ce que j'avais supposé deux fois. */
  const enMemoire = new Map();
  const troncon = (i, de, vers) => {
    const cle = i + ':' + de + ':' + vers;
    if (enMemoire.has(cle)) return enMemoire.get(cle);
    const p = leLong(cors[i], de, vers);
    enMemoire.set(cle, p);
    return p;
  };

  /* --- les cycles fermés, mesurés le long des chaussées d'abord --- */
  const bruts = [];
  const vus = new Set();

  const essayer = chaine => {
    const cle = chaine.join('>');
    if (vus.has(cle)) return;
    vus.add(cle);

    const legs = [];
    let total = 0;
    for (let k = 0; k < chaine.length; k++) {
      const avant = chaine[(k - 1 + chaine.length) % chaine.length];
      const apres = chaine[(k + 1) % chaine.length];
      const de = croisement(avant, chaine[k]);
      const vers = croisement(chaine[k], apres);
      if (de == null || vers == null || de === vers) return;
      const p = troncon(chaine[k], de, vers);
      if (!p || p.m < MINI_TRONCON_M) return;
      legs.push({ i: chaine[k], nom: cors[chaine[k]].nom, m: p.m, noeuds: p.noeuds });
      total += p.m;
    }

    /* Un cycle dégénéré revient sur ses pas. Chaque nœud n'appartient qu'à
       une étape, sauf les croisements, partagés par deux. */
    const compte = new Map();
    for (const l of legs) for (const n of l.noeuds) compte.set(n, (compte.get(n) || 0) + 1);
    for (const [, c] of compte) if (c > 2) return;

    /* Où l'on accroche la boucle : son point le plus proche de chez soi. */
    let accroche = null, d0 = Infinity, legAccroche = 0;
    legs.forEach((l, k) => {
      for (const n of l.noeuds) {
        const d = loin(n);
        if (d < d0) { d0 = d; accroche = n; legAccroche = k; }
      }
    });
    if (accroche == null || d0 > APPROCHE_MAX_M) return;

    /* ⚠️ Un PRÉ-tri, pas une mesure. Compté sur l'axe de la chaussée, ce
       chiffre vaut le double du vrai (101 contre 49) : il ne sert qu'à
       choisir lesquels valent la peine d'être refaits à pied, puisque le
       vrai compte n'existe qu'après. Sans lui, les vingt candidats retenus
       étaient les plus proches de la distance voulue, pas les moins
       allumés, et Villeray remontait de 31 à 42 feux. */
    let feuxBruts = 0;
    const dejaVus = new Set();
    for (const l of legs) {
      for (const nd of l.noeuds) {
        if (graphe.feux.has(nd) && !dejaVus.has(nd)) { feuxBruts++; dejaVus.add(nd); }
      }
    }
    bruts.push({ legs, total, accroche, d0, legAccroche, feuxBruts });
  };

  for (const iA of proches) {
    for (const iB of voisins[iA]) {
      for (const iC of voisins[iB]) {
        if (iC === iA || iC === iB) continue;
        if (croisement(iC, iA) != null) essayer([iA, iB, iC]);
        for (const iD of voisins[iC]) {
          if (iD === iA || iD === iB || iD === iC) continue;
          if (croisement(iD, iA) != null) essayer([iA, iB, iC, iD]);
        }
      }
    }
  }
  if (!bruts.length) return null;

  /* --- combien de tours, et quelle amorce, pour tomber sur la cible --- */
  let depart = null, dDepart = Infinity;
  for (const [id] of graphe.voisins) {
    const d = loin(id);
    if (d < dDepart) { dDepart = d; depart = id; }
  }
  if (depart == null) return null;

  const candidats = [];
  for (const b of bruts) {
    const surPlace = b.d0 <= SUR_LA_BOUCLE_M;
    /* L'amorce se fait deux fois, à l'aller et au retour. Estimée à vol
       d'oiseau ici, mesurée pour de vrai plus bas.

       ⚠️ Et ÉCARTÉE ici si elle dépasse déjà le plafond. `d0` est une borne
       basse : par la rue ce sera plus long, jamais moins. Sans ce filtre, le
       tri par feux remontait vingt boucles sans un seul feu mais toutes à
       plus de six cents mètres, toutes rejetées ensuite pour cette raison,
       et l'app ne proposait plus rien du tout. */
    const amorce = surPlace ? 0 : b.d0 * 2;
    if (amorce > cible * PART_AMORCE_MAX) continue;
    /* ⚠️ On ne FIXE pas le nombre de tours ici : la longueur le long des
       chaussées n'est qu'une estimation, et le trajet à pied en diffère
       assez pour faire sortir de la fourchette un circuit parfaitement bon.
       Paris à 3 km disparaissait comme ça. On vérifie seulement qu'UN
       nombre de tours pourrait convenir, et on tranche après la mesure. */
    let possible = false, estime = Infinity;
    for (let tours = 1; tours <= MAX_TOURS; tours++) {
      const t = b.total * tours + amorce;
      if (Math.abs(t - cible) < Math.abs(estime - cible)) estime = t;
      if (Math.abs(t - cible) <= cible * TOL * 1.5) possible = true;
    }
    if (possible) candidats.push({ ...b, surPlace, estime, cible, tol: TOL });
  }
  if (!candidats.length) return null;

  /* Le moins de tours d'abord, puis le plus proche de la distance demandee.
     ⚠️ NE PAS trier sur la proximité du départ : les rues qui passent devant
     chez soi sont les grands axes, et les préférer faisait remonter le
     Plateau de 28 à 37 feux. C'est le tri par feux, plus bas, qui décide. */
  /* ⚠️ Trier D'ABORD sur les feux remplissait les vingt places de circuits
     peu allumés dont aucun ne tombait sur la bonne distance, et l'app ne
     proposait plus rien. La distance passe donc en premier, mais seulement
     comme un OUI ou NON : parmi ceux qui tiennent la demande, c'est bien le
     moins allumé qui gagne. */
  const tient = x => Math.abs(x.estime - cible) <= cible * TOL ? 0 : 1;
  candidats.sort((a, b) => tient(a) - tient(b) ||
                           a.feuxBruts - b.feuxBruts ||
                           Math.abs(a.estime - cible) - Math.abs(b.estime - cible));

  /* --- puis à pied, pour de vrai --- */
  let meilleur = null;
  /* Les circuits déjà montrés, que « Autres parcours » doit sauter. */
  const exclure = o.exclure || null;
  for (const c of candidats.slice(0, MAX_ROUTES)) {
    const fait = aPiedLeCircuit(graphe, cors, c, depart, cible);
    if (!fait) continue;
    if (exclure && exclure.has(signature(fait.etapes))) continue;
    /* Le moins allumé gagne : c'est le seul axe sur lequel ce parcours est en
       retard sur les boucles ordinaires, donc le seul qui vaille un tri. */
    if (!meilleur || fait.feux < meilleur.feux ||
        (fait.feux === meilleur.feux && fait.tours < meilleur.tours)) meilleur = fait;
  }
  if (!meilleur) return null;

  const b = mesurer(graphe, meilleur.ids, meilleur.m,
                    waysDuChemin(graphe, meilleur.ids), centre);
  b.genre = 'simple';
  b.signature = signature(meilleur.etapes);
  b.etapes = meilleur.etapes;
  b.tours = meilleur.tours;
  b.tourM = Math.round(meilleur.tourM);
  b.centreTour = meilleur.centreTour;
  b.approcheM = Math.round(meilleur.approcheM);
  /* ⚠️ `mesurer` compte les nœuds DISTINCTS : sur trois tours il ne verrait
     les feux qu'une fois, alors qu'on s'y arrête à chaque passage. La carte
     annoncerait dix feux pour une sortie qui en compte trente. */
  b.feux = meilleur.feux;
  return b;
}

/**
 * Le circuit refait sur le vrai réseau piéton, tours et amorce compris.
 *
 * On tourne les étapes pour partir du point d'accroche, et l'on coupe en deux
 * celle qui le contient : c'est ce qui donne « Rachel jusqu'à
 * Saint-Dominique [...] et Rachel ramène ».
 */
function aPiedLeCircuit(graphe, cors, c, depart, cible) {
  const ordre = [];
  for (let k = 0; k < c.legs.length; k++) ordre.push(c.legs[(c.legAccroche + k) % c.legs.length]);

  /* L'étape d'accroche, coupée au point où l'on rejoint la boucle. */
  const tete = ordre[0];
  const i = tete.noeuds.indexOf(c.accroche);
  if (i < 0) return null;
  const debut = { i: tete.i, nom: tete.nom, de: c.accroche, vers: tete.noeuds[tete.noeuds.length - 1] };
  const fin = { i: tete.i, nom: tete.nom, de: tete.noeuds[0], vers: c.accroche };

  const morceaux = [debut];
  for (let k = 1; k < ordre.length; k++) {
    morceaux.push({ i: ordre[k].i, nom: ordre[k].nom,
                    de: ordre[k].noeuds[0], vers: ordre[k].noeuds[ordre[k].noeuds.length - 1] });
  }
  morceaux.push(fin);

  const tour = [];
  const etapes = [];
  let tourM = 0;
  for (const m of morceaux) {
    if (m.de === m.vers) continue;   // l'accroche tombe pile sur un croisement
    const p = aPied(graphe, cors[m.i], m.de, m.vers);
    if (!p) return null;
    tourM += p.m;
    etapes.push({ nom: m.nom, m: Math.round(p.m) });
    for (const n of p.noeuds) if (tour[tour.length - 1] !== n) tour.push(n);
  }
  if (tour.length < 4 || !tourM) return null;

  /* L'amorce, mesurée cette fois. Elle n'a pas à longer quoi que ce soit :
     c'est le chemin le plus agréable pour rejoindre la boucle, et le routeur
     sait déjà éviter les feux et les grands axes. */
  let amorce = null;
  if (!c.surPlace) {
    amorce = chemin(graphe, depart, c.accroche);
    if (!amorce) return null;
    /* ⚠️ L'amorce se fait DEUX FOIS. Sans ce plafond, une sortie de 3,2 km
       mettait 1,5 km en aller-retour pour rejoindre la boucle : ce n'est
       plus une boucle, c'est un trajet avec un détour au milieu. */
    if (amorce.m * 2 > c.cible * PART_AMORCE_MAX) return null;
  }

  /* Maintenant seulement, avec la vraie longueur d'un tour : combien ?
     ⚠️ Essayer le SEUL arrondi ne suffit pas. Quand il tombe juste hors de
     la fourchette, son voisin y est souvent, et jeter le circuit pour si peu
     faisait disparaître Paris à 5 km et le damier de test. On regarde donc
     les deux, et l'on garde le plus proche de la demande. */
  const aller = amorce ? amorce.m * 2 : 0;
  const vise = (cible - aller) / tourM;
  let tours = 0, m = 0, ecart = Infinity;
  for (const t of [Math.floor(vise), Math.ceil(vise)]) {
    if (t < 1 || t > MAX_TOURS) continue;
    const total = tourM * t + aller;
    const e = Math.abs(total - cible);
    if (e < ecart) { ecart = e; tours = t; m = total; }
  }
  if (!tours || ecart > cible * TOL) return null;

  const ids = [];
  const pousser = suite => { for (const n of suite) if (ids[ids.length - 1] !== n) ids.push(n); };
  if (amorce) pousser(amorce.noeuds);
  /* Les tours sont répétés dans le tracé, et non comptés à part : l'écran de
     course suit ce tracé pour dire ce qu'il reste, et un tracé d'un seul tour
     annoncerait l'arrivée au tiers du parcours. */
  for (let t = 0; t < tours; t++) pousser(tour);
  if (amorce) pousser([...amorce.noeuds].reverse());

  /* Les feux se comptent à CHAQUE passage : c'est ce que le coureur subit. */
  const unTour = new Set();
  for (const n of tour) if (graphe.feux.has(n)) unTour.add(n);
  let feux = unTour.size * tours;
  if (amorce) {
    const surAmorce = new Set();
    for (const n of amorce.noeuds) if (graphe.feux.has(n) && !unTour.has(n)) surAmorce.add(n);
    feux += surAmorce.size * 2;
  }

  /* Le centre du TOUR, pour y poser le « 3× » : celui du tracé entier
     serait tiré vers l'amorce, faite deux fois. */
  let sla = 0, slo = 0;
  for (const id of tour) { const nd = graphe.noeuds.get(id); sla += nd.lat; slo += nd.lon; }
  const centreTour = { lat: sla / tour.length, lon: slo / tour.length };
  const sortie = { ids, m, feux, tours, tourM, approcheM: amorce ? amorce.m : 0, etapes, centreTour };
  if (amorce) {
    /* L'amorce est une étape comme les autres : elle se retient aussi. */
    const nom = nomDuNoeud(graphe, c.accroche) || etapes[0].nom;
    /* Annoncer « rejoindre Chemin Vert » puis « Chemin Vert » ferait lire deux
       fois la même rue : on fond l'amorce dans la première étape. */
    if (nom === etapes[0].nom) {
      sortie.etapes = etapes.map((e, i) => i ? e : { ...e, m: e.m + Math.round(amorce.m) });
    } else {
      sortie.etapes = [{ nom, m: Math.round(amorce.m), approche: true }, ...etapes];
    }
  }
  return sortie;
}

/** Le nom de la rue qui passe par un nœud, pour annoncer où l'on va. */
function nomDuNoeud(graphe, id) {
  for (const a of graphe.voisins.get(id) || []) {
    const t = graphe.ways.get(a.way);
    if (t && t.name) return t.name;
  }
  return null;
}
