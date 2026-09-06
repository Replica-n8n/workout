/* =========================================================================
   Runa · le générateur de boucles

   Le problème : trouver un circuit qui revient à son point de départ et qui
   fait à peu près D mètres. Ce n'est pas un plus court chemin, et chercher
   l'optimum n'aurait pas de sens (il n'y a pas de « meilleure » boucle de
   6 km). On procède donc comme la spec le demande : on tire des points
   intermédiaires sur un cercle, on route entre eux, on mesure, on corrige le
   rayon, et on recommence jusqu'à tomber dans la tolérance.

   Trois choses font la différence entre ce générateur et un simple
   aller-retour :

   1. Les tronçons déjà empruntés DANS LA BOUCLE EN COURS sont renchéris, ce
      qui pousse le retour à passer par d'autres rues.
   2. Les trois propositions partent dans des directions écartées, sinon on
      obtient trois variantes de la même boucle.
   3. Deux boucles qui partagent trop de rues sont considérées comme une
      seule, et la seconde est rejetée.
   ========================================================================= */

import { destination, rayonDepart, capDeg } from './geo.js';
import { chemin, waysDuChemin, polyligne } from './route.js';

/* Le renchérissement des ways empêche de reprendre LA MÊME rue, pas de
   revenir par celle d'à côté. Le résultat fait alors une antenne : on part,
   on revient vingt mètres plus loin, et à l'oeil ce n'est pas une boucle.
   Seule la géométrie le révèle.

   Seuil lu dans les données, pas choisi au jugé : sur 540 boucles générées
   à Paris et à Lyon, la part de tracé qui longe son propre tracé a pour
   médiane 12 %, pour troisième quartile 20 %, et les pires cas montent à
   44 %. Couper à 20 % écarte le quart le plus laid sans assécher le choix. */
const LONGEE_MAXIMALE = 0.20;
const LONGEE_SEUIL_M = 30;      // « à côté », c'est la rue parallèle
const LONGEE_ECART = 12;        // en deçà, deux points sont simplement voisins

const ROSE = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];

const R = 6371008.8, RAD = Math.PI / 180;
function metres(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Générateur pseudo-aléatoire à graine : sans lui, un test ne pourrait rien
   affirmer d'une fonction qui tire des points au hasard. */
export function hasard(graine) {
  let a = graine >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Une grille pour retrouver le noeud le plus proche sans parcourir les
   dizaines de milliers de noeuds à chaque point intermédiaire. */
class Grille {
  /* `degreMin` à 3 ne garde que les vrais carrefours. Un noeud de degré 1
     est un cul-de-sac, un noeud de degré 2 est un point au milieu d'une
     rue : viser l'un ou l'autre comme point intermédiaire OBLIGE à faire
     demi-tour pour en repartir, et c'est ce qui fabrique les moignons
     aller-retour qu'on voit sur la carte. */
  constructor(noeuds, voisins, celluleM = 200, degreMin = 3) {
    this.cases = new Map();
    this.pas = (celluleM / R) * (180 / Math.PI);
    for (const [id, n] of noeuds) {
      const aretes = voisins.get(id);
      if (!aretes || aretes.length < degreMin) continue;
      const c = this.cle(n);
      let l = this.cases.get(c);
      if (!l) this.cases.set(c, l = []);
      l.push({ id, n });
    }
  }
  cle(p) { return Math.round(p.lat / this.pas) + ':' + Math.round(p.lon / this.pas); }
  proche(p) {
    const li = Math.round(p.lat / this.pas), lo = Math.round(p.lon / this.pas);
    // On élargit l'anneau de recherche tant que rien n'est trouvé : dans une
    // zone peu dense, la case du point peut être vide.
    for (let rayon = 1; rayon <= 12; rayon++) {
      let meilleur = null, meilleureD = Infinity;
      for (let i = li - rayon; i <= li + rayon; i++) {
        for (let j = lo - rayon; j <= lo + rayon; j++) {
          for (const c of this.cases.get(i + ':' + j) || []) {
            const d = metres(p, c.n);
            if (d < meilleureD) { meilleureD = d; meilleur = c.id; }
          }
        }
      }
      if (meilleur !== null) return meilleur;
    }
    return null;
  }
}

/**
 * @param {object} graphe
 * @param {object} opts
 * @param {{lat,lon}} opts.depart
 * @param {number} opts.distanceCible   en mètres
 * @param {number} [opts.tolerance]     0.10 = plus ou moins 10 %
 * @param {number} [opts.nb]            nombre de boucles voulues
 * @param {number} [opts.points]        points intermédiaires par boucle (3 à 5)
 * @param {number} [opts.graine]
 * @param {number} [opts.maxEssais]     itérations d'ajustement par boucle
 * @returns {Array<object>} boucles, la plus proche de la cible en premier
 */
export function genererBoucles(graphe, opts) {
  const {
    depart, distanceCible,
    tolerance = 0.10, nb = 3, points = 3,
    graine = 1, maxEssais = 8, facteurRetour = 4
  } = opts;

  const rnd = hasard(graine);
  const grille = new Grille(graphe.noeuds, graphe.voisins);
  const idDepart = grille.proche(depart);
  if (idDepart === null) return [];
  const pDepart = graphe.noeuds.get(idDepart);

  const boucles = [];
  const dejaVues = [];

  // Écarter les directions de départ, sinon les trois propositions se
  // ressemblent. On en essaie plus que nécessaire : certaines directions ne
  // donnent rien (un fleuve, une voie ferrée, une impasse de quartier).
  const directions = [];
  for (let i = 0; i < nb * 3; i++) directions.push((360 / (nb * 3)) * i + rnd() * 20);

  for (const cap0 of directions) {
    if (boucles.length >= nb) break;
    const b = uneBoucle(graphe, grille, idDepart, pDepart, {
      distanceCible, tolerance, points, cap0, rnd, maxEssais, facteurRetour
    });
    if (!b) continue;
    // Deux boucles qui partagent la moitié de leurs rues sont la même
    // proposition aux yeux de qui court.
    if (dejaVues.some(v => ressemblance(v, b.ways) > 0.5)) continue;
    dejaVues.push(b.ways);
    boucles.push(b);
  }

  boucles.sort((x, y) =>
    Math.abs(x.m - distanceCible) - Math.abs(y.m - distanceCible));
  return boucles;
}

/**
 * Efface les allers-retours d'un parcours : si l'on passe par a, b, a, le
 * détour par b n'a servi à rien et se retire. L'opération se répète d'elle
 * même, si bien qu'un moignon de dix carrefours s'efface entièrement.
 *
 * Ce n'est pas cosmétique : sans ça, la distance annoncée compte deux fois
 * des mètres que personne n'a envie de courir deux fois.
 */
export function sansAllerRetour(ids) {
  const out = [];
  for (const id of ids) {
    if (out.length >= 2 && out[out.length - 2] === id) out.pop();
    else out.push(id);
  }
  return out;
}

/** Longueur réelle d'une suite de noeuds, en suivant les arêtes du graphe. */
function metrique(graphe, ids) {
  let total = 0;
  for (let i = 1; i < ids.length; i++) {
    const a = (graphe.voisins.get(ids[i - 1]) || []).find(x => x.vers === ids[i]);
    if (a) total += a.m;
  }
  return total;
}

function ressemblance(a, b) {
  // Sans ce garde-fou, deux ensembles vides donnent 0/0, donc NaN, et
  // `NaN > 0.5` étant faux, la boucle en double passerait le filtre.
  const petit = Math.min(a.size, b.size);
  if (!petit) return 0;
  let communs = 0;
  for (const w of b) if (a.has(w)) communs++;
  return communs / petit;
}

function uneBoucle(graphe, grille, idDepart, pDepart, o) {
  let rayon = rayonDepart(o.distanceCible);
  let meilleure = null;

  for (let essai = 0; essai < o.maxEssais; essai++) {
    const etapes = [];
    for (let i = 0; i < o.points; i++) {
      // Les points intermédiaires sont régulièrement répartis sur le cercle,
      // avec un peu de jeu : deux boucles tirées au même cap mais avec un
      // jeu différent passent par des rues différentes.
      const cap = o.cap0 + (360 / o.points) * i + (o.rnd() - 0.5) * (180 / o.points);
      const p = destination(pDepart, rayon * (0.85 + o.rnd() * 0.3), cap);
      const id = grille.proche(p);
      if (id === null || id === idDepart) { etapes.length = 0; break; }
      etapes.push(id);
    }
    if (!etapes.length) { rayon *= 1.15; continue; }

    const parcours = [idDepart, ...etapes, idDepart];
    const utilises = new Set();
    let ids = [];
    let total = 0;
    let echec = false;

    for (let i = 1; i < parcours.length; i++) {
      const seg = chemin(graphe, parcours[i - 1], parcours[i], {
        waysUtilises: utilises, facteurRetour: o.facteurRetour
      });
      if (!seg || seg.noeuds.length < 2) { echec = true; break; }
      for (const w of waysDuChemin(graphe, seg.noeuds)) utilises.add(w);
      ids = ids.length ? ids.concat(seg.noeuds.slice(1)) : seg.noeuds.slice();
      total += seg.m;
    }
    if (echec) { rayon *= 1.1; continue; }

    ids = sansAllerRetour(ids);
    if (ids.length < 8 || ids[0] !== ids[ids.length - 1]) { rayon *= 1.1; continue; }
    total = metrique(graphe, ids);

    const ecart = (total - o.distanceCible) / o.distanceCible;
    const candidate = mesurer(graphe, ids, total, utilises, pDepart);

    // Une boucle à la bonne distance mais en forme d'antenne est un mauvais
    // résultat, alors qu'elle passe toutes les vérifications de longueur.
    // On garde donc la meilleure au sens de la FORME d'abord, de l'écart
    // ensuite : entre deux candidates acceptables, la plus ronde gagne.
    const bonneForme = candidate.longee <= LONGEE_MAXIMALE;
    if (!meilleure || mieux(candidate, meilleure, o.distanceCible)) meilleure = candidate;
    if (bonneForme && Math.abs(ecart) <= o.tolerance) return candidate;

    // Corriger le rayon proportionnellement à l'erreur, en amortissant :
    // appliquer le ratio brut fait osciller autour de la cible sans jamais
    // y tomber, parce que la longueur ne varie pas linéairement avec le
    // rayon quand le tracé change de rues.
    const ratio = o.distanceCible / total;
    rayon *= 1 + (ratio - 1) * 0.6;
  }

  // Mieux vaut proposer une boucle un peu trop longue que rien du tout ;
  // l'écart est affiché, elle décide.
  return meilleure;
}

/* Comparer deux candidates : une boucle bien formée bat une antenne, même si
   l'antenne tombe plus juste en distance. À forme égale, l'écart tranche. */
function mieux(a, b, cible) {
  const formeA = a.longee <= LONGEE_MAXIMALE;
  const formeB = b.longee <= LONGEE_MAXIMALE;
  if (formeA !== formeB) return formeA;
  return Math.abs(a.m - cible) < Math.abs(b.m - cible);
}

/**
 * Quelle part du tracé longe son propre tracé.
 *
 * Pour chaque point, on cherche un autre point du parcours à moins de 30 m
 * qui ne soit pas simplement son voisin immédiat dans la suite. La distance
 * entre indices se compte de façon CIRCULAIRE : le premier et le dernier
 * point sont le même carrefour, et sans ça toute boucle correctement fermée
 * s'accuserait elle-même sur ses derniers mètres.
 *
 * Une grille de 30 m évite le O(n²) : sur un parcours de 800 points, la
 * comparaison de toutes les paires coûterait plus cher que la génération de
 * la boucle entière.
 */
export function partLongee(points, seuilM = LONGEE_SEUIL_M, ecart = LONGEE_ECART) {
  const n = points.length;
  if (n < 3 * ecart) return 0;

  const RAD = Math.PI / 180;
  const kx = R * RAD * Math.cos(points[0].lat * RAD), ky = R * RAD;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (points[i].lon - points[0].lon) * kx;
    ys[i] = (points[i].lat - points[0].lat) * ky;
  }

  const cases = new Map();
  for (let i = 0; i < n; i++) {
    const c = Math.floor(xs[i] / seuilM) + ':' + Math.floor(ys[i] / seuilM);
    let l = cases.get(c);
    if (!l) cases.set(c, l = []);
    l.push(i);
  }

  const seuil2 = seuilM * seuilM;
  let longes = 0;
  for (let i = 0; i < n; i++) {
    const ci = Math.floor(xs[i] / seuilM), cj = Math.floor(ys[i] / seuilM);
    let trouve = false;
    for (let a = ci - 1; a <= ci + 1 && !trouve; a++) {
      for (let b = cj - 1; b <= cj + 1 && !trouve; b++) {
        for (const j of cases.get(a + ':' + b) || []) {
          const d = Math.abs(i - j);
          if (Math.min(d, n - d) < ecart) continue;
          const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
          if (dx * dx + dy * dy < seuil2) { trouve = true; break; }
        }
      }
    }
    if (trouve) longes++;
  }
  return longes / n;
}

/** Vers où part la boucle, vue du départ : la seule chose qui distingue
    vraiment trois propositions de même longueur et de même profil. */
function direction(points, pDepart) {
  if (!points.length) return null;
  let lat = 0, lon = 0;
  for (const p of points) { lat += p.lat; lon += p.lon; }
  const centre = { lat: lat / points.length, lon: lon / points.length };
  const cap = capDeg(pDepart, centre);
  return ROSE[Math.round(cap / 45) % 8];
}

function mesurer(graphe, ids, m, ways, pDepart) {
  let feux = 0;
  const vus = new Set();
  for (const id of ids) {
    if (graphe.feux.has(id) && !vus.has(id)) { feux++; vus.add(id); }
  }

  let eclairee = 0, connue = 0;
  for (let i = 1; i < ids.length; i++) {
    const a = (graphe.voisins.get(ids[i - 1]) || []).find(x => x.vers === ids[i]);
    if (!a) continue;
    const t = graphe.ways.get(a.way);
    if (!t || t.lit === undefined) continue;
    connue += a.m;
    if (t.lit !== 'no') eclairee += a.m;
  }

  const points = polyligne(graphe, ids);

  return {
    noeuds: ids,
    points,
    m: Math.round(m),
    feux,
    ways,
    longee: partLongee(points),
    direction: direction(points, pDepart),
    // `null` et non 0 quand OSM ne dit rien : afficher « 0 % éclairé » sur un
    // quartier non renseigné serait un mensonge, et c'est exactement le
    // piège que la spec signale sur le tag `lit`.
    fractionEclairee: connue > 0 ? eclairee / connue : null,
    fractionRenseignee: m > 0 ? connue / m : 0
  };
}
