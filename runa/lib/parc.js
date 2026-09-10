/* =========================================================================
   Runa · le tour du parc

   « Il y a le parc Jarry pas très loin de la station Jarry : est-ce que
   l'app propose d'aller courir là-bas, même en boucle ? » Elle ne le
   proposait pas. Le parc n'arrivait dans l'app que sous forme d'un nom et
   d'un point, pour écrire son nom sur la carte. Ses allées, elles, étaient
   bien dans le graphe (10,8 km au parc Jarry, en asphalte pour 72 %), mais
   rien n'y attirait le générateur : depuis la station, aucune boucle de
   3 km n'y passait, et celles de 8 km n'y faisaient que 9 % de leur tracé.

   Ce module fabrique une sortie de la forme « rejoindre le parc, en faire
   N fois le tour, rentrer ». Aucun feu dans le parc, de l'ombre, et plus
   rien à retenir après le premier tour.

   ⚠️ UN TOUR A UNE LONGUEUR FIXE. On ne tombe donc juste que sur certaines
   distances : 4,3, 6,9 et 9,6 km au parc Jarry. Avec la tolérance des
   boucles de rues, 12 %, le parc disparaissait pour 5, 6 et 8 km, les
   distances les plus courantes. Elle a tranché : 20 % pour le parc. On le
   choisit pour l'endroit, et la carte affiche toujours la vraie distance.
   ========================================================================= */

import { chemin, waysDuChemin } from './route.js';
import { mesurer, sansAllerRetour } from './loop.js';

const R = 6371008.8, RAD = Math.PI / 180;

/* La tolérance propre au parc, décidée par elle le 2026-09-10. */
export const TOL_PARC = 0.20;

/* En dessous, on tourne autour d'un square, et ce n'est plus une sortie. */
export const TOUR_MINI_M = 1500;

/* Au-delà, rejoindre le parc devient le trajet principal. */
export const PARC_MAX_M = 1000;

/* Au-delà, « sept tours » n'est plus un parcours, c'est une piste. */
const MAX_TOURS = 5;

/* Le tri d'avant : un contour plus court ne donnera jamais un tour de
   1,5 km, inutile de construire quoi que ce soit. */
const CONTOUR_MINI_M = 1200;

/* Des jalons le long du bord. Assez pour que le tour suive le contour, pas
   tant qu'il faille relier des points à dix mètres les uns des autres. */
const JALONS = 8;

/* Ce que coûte de s'enfoncer dans le parc : 1 au bord, 3 à 80 m dedans.
   Sans ce surcoût, A* coupait par les allées du milieu, plus courtes, et le
   « tour » zigzaguait vers l'intérieur. Vu au premier essai sur Jarry. */
const ENFONCEMENT_M = 40;

/* ------------------------------------------------------------ géométrie */

function projeteur(ref) {
  const kx = R * RAD * Math.cos(ref.lat * RAD), ky = R * RAD;
  return p => [p.lon * kx, p.lat * ky];
}

/** Pair-impair : un rayon qui traverse le contour un nombre impair de fois. */
function dedans(p, contour) {
  let c = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i], b = contour[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) &&
        p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) c = !c;
  }
  return c;
}

function longueurM(pts) {
  if (pts.length < 2) return 0;
  const v = projeteur(pts[0]);
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = v(pts[i - 1]), [bx, by] = v(pts[i]);
    m += Math.hypot(bx - ax, by - ay);
  }
  return m;
}

/**
 * Les parcs d'une réponse Overpass qui ont un contour.
 *
 * Les éléments arrivent en double : une fois avec leur centre, pour écrire
 * leur nom sur la carte, une fois avec leur géométrie, pour ce module. Seuls
 * les seconds ont `geometry`, et `reperes` ignore déjà ce qui n'a pas de
 * centre : aucun nom n'apparaît deux fois.
 *
 * @returns {{nom:string, contour:{lat:number,lon:number}[], perimetreM:number}[]}
 */
export function contoursDesParcs(osm) {
  const out = [];
  if (!osm || !Array.isArray(osm.elements)) return out;
  for (const el of osm.elements) {
    const t = el.tags;
    if (!t || t.leisure !== 'park' || !t.name || !Array.isArray(el.geometry)) continue;
    const contour = el.geometry.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (contour.length < 4) continue;
    out.push({ nom: t.name, contour, perimetreM: longueurM(contour) });
  }
  return out;
}

/* ------------------------------------------------------- le tour du parc */

/**
 * Le tour d'un parc sur ses allées, au plus près du bord.
 *
 * @returns {{ids:number[], m:number, centre:{lat:number,lon:number}} | null}
 */
export function tourDuParc(graphe, parc) {
  const { contour } = parc;
  const v = projeteur(contour[0]);

  /* Les nœuds du parc, triés d'abord sur la boîte englobante : tester le
     contour pour chaque nœud du quartier coûterait cher pour rien. */
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const p of contour) {
    if (p.lat < la0) la0 = p.lat; if (p.lat > la1) la1 = p.lat;
    if (p.lon < lo0) lo0 = p.lon; if (p.lon > lo1) lo1 = p.lon;
  }
  const tous = new Set();
  for (const [id, n] of graphe.noeuds) {
    if (n.lat < la0 || n.lat > la1 || n.lon < lo0 || n.lon > lo1) continue;
    if (graphe.voisins.has(id) && dedans(n, contour)) tous.add(id);
  }
  if (tous.size < 10) return null;

  /* ⚠️ Seulement le plus grand morceau d'allées d'un seul tenant. Au parc
     Jarry, 1023 nœuds sur 1045 se tiennent ; les autres sont un parvis ou un
     terrain de tennis isolés. Un jalon posé dessus rendait le tour
     impossible sans sortir du parc. */
  const vus = new Set();
  let auParc = [];
  for (const s of tous) {
    if (vus.has(s)) continue;
    const c = [], f = [s];
    vus.add(s);
    while (f.length) {
      const x = f.pop();
      c.push(x);
      for (const l of graphe.voisins.get(x) || []) {
        if (tous.has(l.vers) && !vus.has(l.vers)) { vus.add(l.vers); f.push(l.vers); }
      }
    }
    if (c.length > auParc.length) auParc = c;
  }
  const dans = new Set(auParc);

  /* La distance au bord, qui fait longer le pourtour. */
  const segs = [];
  for (let i = 1; i < contour.length; i++) segs.push([v(contour[i - 1]), v(contour[i])]);
  const bord = new Map();
  for (const id of dans) {
    const [px, py] = v(graphe.noeuds.get(id));
    let d = Infinity;
    for (const [[ax, ay], [bx, by]] of segs) {
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      d = Math.min(d, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    bord.set(id, d);
  }

  /* ⚠️ Un jalon ne se pose que sur un VRAI carrefour d'allées. Posé sur un
     cul-de-sac, il imposait un aller-retour, et c'était l'antenne vers l'est
     du premier essai. La même leçon avait déjà été payée pour les boucles de
     rues. */
  const degre = id => (graphe.voisins.get(id) || []).filter(l => dans.has(l.vers)).length;
  const carrefours = auParc.filter(id => degre(id) >= 3);
  if (carrefours.length < 3) return null;

  const cumul = [0];
  for (let i = 1; i < contour.length; i++) {
    const [ax, ay] = v(contour[i - 1]), [bx, by] = v(contour[i]);
    cumul.push(cumul[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const perim = cumul[cumul.length - 1];
  const jalons = [];
  for (let j = 0; j < JALONS; j++) {
    const cible = perim * j / JALONS;
    let i = cumul.findIndex(c => c >= cible);
    if (i < 1) i = 1;
    const [cx, cy] = v(contour[i]);
    let mieux = null, d0 = Infinity;
    for (const id of carrefours) {
      const [x, y] = v(graphe.noeuds.get(id));
      const d = Math.hypot(x - cx, y - cy);
      if (d < d0) { d0 = d; mieux = id; }
    }
    if (mieux != null && jalons[jalons.length - 1] !== mieux && jalons[0] !== mieux) jalons.push(mieux);
  }
  if (jalons.length < 3) return null;

  /* Relier les jalons SANS sortir du parc : une allée dehors est fermée, une
     allée au cœur coûte plus qu'une allée au bord. Jamais de rabais : voir
     l'avertissement d'admissibilité dans `route.js`. */
  const facteur = (a, b) => {
    if (!dans.has(a) || !dans.has(b)) return Infinity;
    return 1 + Math.max(bord.get(a), bord.get(b)) / ENFONCEMENT_M;
  };
  let ids = [];
  for (let j = 0; j < jalons.length; j++) {
    const p = chemin(graphe, jalons[j], jalons[(j + 1) % jalons.length], { facteur });
    if (!p) return null;
    for (const n of p.noeuds) if (ids[ids.length - 1] !== n) ids.push(n);
  }

  /* Les allers-retours résiduels, effacés comme pour les boucles de rues. */
  ids = sansAllerRetour(ids);
  if (ids[ids.length - 1] === ids[0]) ids.pop();
  if (ids.length < 4) return null;

  let m = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], b = ids[(i + 1) % ids.length];
    const l = (graphe.voisins.get(a) || []).find(x => x.vers === b);
    if (!l) return null;   // deux nœuds qui ne se touchent plus : le tour est cassé
    m += l.m;
  }

  let sla = 0, slo = 0;
  for (const id of ids) { const n = graphe.noeuds.get(id); sla += n.lat; slo += n.lon; }
  return { ids, m, centre: { lat: sla / ids.length, lon: slo / ids.length } };
}

/* ------------------------------------------------------ la sortie entière */

/* Au-delà, l'accès cesse d'être une indication et devient un itinéraire. */
const RUES_ACCES_MAX = 3;

/**
 * Les rues de l'accès, dans l'ordre où on les prend.
 *
 * ⚠️ Chaque rue une seule fois, et trois au plus. Depuis le centre de
 * Villeray, la liste brute donnait « Faillon, Henri-Julien, Faillon,
 * Gary-Carter, Saint-Laurent » : cinq noms dont un en double pour 420 m, ce
 * qui se lit comme un parcours compliqué alors que c'est un petit détour.
 */
function ruesDe(graphe, ids) {
  const noms = [];
  for (let i = 1; i < ids.length; i++) {
    const l = (graphe.voisins.get(ids[i - 1]) || []).find(x => x.vers === ids[i]);
    const t = l && graphe.ways.get(l.way);
    if (t && t.name && !noms.includes(t.name)) noms.push(t.name);
  }
  return noms.slice(0, RUES_ACCES_MAX);
}

/**
 * Une sortie au parc, ou `null` si aucun parc ne s'y prête.
 *
 * ⚠️ `null` est un RÉSULTAT. Pas de parc assez grand à portée, ou aucun
 * nombre de tours qui tombe dans la tolérance : la carte ne s'affiche pas,
 * et c'est mieux que d'en proposer une mauvaise.
 *
 * @param {object} graphe
 * @param {object[]} parcs  sortie de `contoursDesParcs`
 * @param {object} o
 * @param {{lat:number,lon:number}} o.depart
 * @param {number} o.distanceCible  en mètres
 * @returns {object|null} même forme qu'une boucle ordinaire, plus `.parc`,
 *   `.tours`, `.tourM`, `.approcheM`, `.etapes` et `.centreTour`
 */
export function parcoursAuParc(graphe, parcs, o) {
  if (!graphe || !Array.isArray(parcs) || !parcs.length || !o || !o.depart) return null;
  const depart = o.depart, cible = o.distanceCible;
  const v = projeteur(depart);
  const [dx0, dy0] = v(depart);

  /* Le nœud de départ : le plus proche de la position. */
  let d0 = null, dd = Infinity;
  for (const [id, n] of graphe.noeuds) {
    if (!graphe.voisins.has(id)) continue;
    const [x, y] = v(n);
    const d = Math.hypot(x - dx0, y - dy0);
    if (d < dd) { dd = d; d0 = id; }
  }
  if (d0 == null) return null;

  let meilleur = null;
  /* Les parcs déjà montrés, que « Autres parcours » doit sauter. */
  const exclure = o.exclure || null;
  for (const parc of parcs) {
    if (parc.perimetreM < CONTOUR_MINI_M) continue;
    if (exclure && exclure.has(parc.nom)) continue;

    /* À portée : le bord du parc à moins de PARC_MAX_M, à vol d'oiseau. */
    let bord = Infinity;
    for (const p of parc.contour) {
      const [x, y] = v(p);
      bord = Math.min(bord, Math.hypot(x - dx0, y - dy0));
    }
    if (bord > PARC_MAX_M) continue;

    const t = tourDuParc(graphe, parc);
    if (!t || t.m < TOUR_MINI_M) continue;

    /* L'accès, vers le nœud du tour le plus proche du départ. Par le routeur
       ordinaire : il sait déjà éviter les feux et les grands axes. */
    let accroche = t.ids[0], da = Infinity;
    for (const id of t.ids) {
      const [x, y] = v(graphe.noeuds.get(id));
      const d = Math.hypot(x - dx0, y - dy0);
      if (d < da) { da = d; accroche = id; }
    }
    const amorce = d0 === accroche ? { noeuds: [d0], m: 0 } : chemin(graphe, d0, accroche);
    if (!amorce) continue;

    /* Combien de tours : les deux arrondis, et le plus proche de la demande. */
    const aller = amorce.m * 2;
    const vise = (cible - aller) / t.m;
    let tours = 0, total = 0, ecart = Infinity;
    for (const n of [Math.floor(vise), Math.ceil(vise)]) {
      if (n < 1 || n > MAX_TOURS) continue;
      const tot = n * t.m + aller;
      const e = Math.abs(tot - cible);
      if (e < ecart) { ecart = e; tours = n; total = tot; }
    }
    if (!tours || ecart > cible * TOL_PARC) continue;

    /* Le tour, tourné pour partir du point d'accroche. */
    const k = t.ids.indexOf(accroche);
    const unTour = t.ids.slice(k).concat(t.ids.slice(0, k));

    /* ⚠️ Les feux se comptent À CHAQUE PASSAGE : trois tours devant le même
       feu, ce sont trois arrêts. Et l'accès se fait deux fois. `mesurer`
       compte les nœuds distincts, il faut donc corriger derrière lui. */
    const feuxTour = new Set(unTour.filter(n => graphe.feux.has(n)));
    const feuxAmorce = new Set(amorce.noeuds.filter(n => graphe.feux.has(n) && !feuxTour.has(n)));
    const feux = feuxTour.size * tours + feuxAmorce.size * 2;

    const cand = { parc, t, amorce, unTour, tours, total, feux, ecart, feuxParTour: feuxTour.size };
    /* Le moins allumé, puis le moins de tours, puis le plus juste. */
    if (!meilleur || feux < meilleur.feux ||
        (feux === meilleur.feux && tours < meilleur.tours) ||
        (feux === meilleur.feux && tours === meilleur.tours && ecart < meilleur.ecart)) {
      meilleur = cand;
    }
  }
  if (!meilleur) return null;

  const { parc, t, amorce, unTour, tours, total, feux } = meilleur;
  const ids = [];
  const pousser = suite => { for (const n of suite) if (ids[ids.length - 1] !== n) ids.push(n); };
  pousser(amorce.noeuds);
  /* Les tours sont répétés dans le tracé, pas comptés à part : l'écran de
     course suit ce tracé pour dire ce qu'il reste, et un tracé d'un seul
     tour annoncerait l'arrivée au premier passage. */
  for (let n = 0; n < tours; n++) pousser(unTour.concat([unTour[0]]));
  pousser([...amorce.noeuds].reverse());

  const b = mesurer(graphe, ids, total, waysDuChemin(graphe, ids), depart);
  b.feux = feux;
  /* Pour dire « tous sur l'accès » quand le parc lui-même n'en a aucun. */
  b.feuxDansLeParc = meilleur.feuxParTour * tours;
  b.genre = 'parc';
  b.signature = parc.nom;
  b.parc = parc.nom;
  b.tours = tours;
  b.tourM = Math.round(t.m);
  b.approcheM = Math.round(amorce.m);
  b.etapes = ruesDe(graphe, amorce.noeuds).map(nom => ({ nom, m: 0 }));
  /* Le centre du TOUR, pas de tout le tracé : l'accès tirerait le « 2× »
     vers la station, hors de la boucle. */
  b.centreTour = t.centre;
  return b;
}
