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

/**
 * Un parcours en quelques rues, ou `null` si le quartier n'en porte pas.
 *
 * Rendre `null` est un résultat, pas un échec à rattraper : la Croix-Rousse
 * n'a pas de rectangle de rues longues et droites, et lui en inventer un
 * mauvais serait pire que de ne rien proposer.
 *
 * @param {object} graphe
 * @param {object} o
 * @param {{lat:number,lon:number}} o.depart
 * @param {number} o.distanceCible  en mètres
 * @param {number} [o.rayonM]       où chercher les corridors
 * @returns {object|null} même forme qu'une boucle ordinaire, plus `.etapes`
 */
export function parcoursSimple(graphe, o) {
  const centre = o.depart;
  const cible = o.distanceCible;
  /* Le tour d'un rectangle vaut quatre côtés : chercher les corridors à un
     quart de la cible, avec de la marge pour les circuits allongés. */
  const rayon = o.rayonM ?? Math.max(600, Math.min(2500, cible * 0.35));

  const cors = corridors(graphe, centre, rayon);
  if (cors.length < 3) return null;

  const kx = R * RAD * Math.cos(centre.lat * RAD), ky = R * RAD;

  /* Un croisement par paire de corridors.
     ⚠️ Par le NŒUD, pas par la paire. Comparer les corridors deux à deux
     coûtait mille huit cents intersections d'ensembles ; ici on passe une
     fois sur les nœuds, et un nœud partagé par deux corridors EST leur
     croisement, par définition. */
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

  /* Les corridors qui passent devant chez soi. Sans cela il faudrait une
     amorce pour rejoindre le rectangle, et cette amorce est justement le
     genre de détour qu'on ne retient pas. */
  const departs = [];
  for (let i = 0; i < cors.length; i++) {
    let s = null, d0 = Infinity;
    for (const id of cors[i].noeuds) {
      const n = graphe.noeuds.get(id);
      if (!n) continue;
      const d = Math.hypot((n.lon - centre.lon) * kx, (n.lat - centre.lat) * ky);
      if (d < d0) { d0 = d; s = id; }
    }
    if (s != null && d0 <= 250) departs.push({ i, s });
  }
  if (!departs.length) return null;

  /* --- les circuits, mesurés d'abord le long des chaussées, ce qui est
     rapide et suffit à écarter ceux qui n'ont pas la bonne longueur --- */
  const bruts = [];
  const vus = new Set();

  /* ⚠️ Sans cette mémoire, `leLong` refaisait le même Dijkstra des milliers
     de fois : l'énumération essaie toutes les chaînes de corridors, et
     toutes celles qui commencent pareil partagent leurs premières étapes.
     C'était l'essentiel du temps de calcul, dix-sept secondes pour 8 km sur
     le Plateau. Ce n'était NI la détection des corridors NI A*, contrairement
     à ce que j'avais supposé les deux premières fois. */
  const enMemoire = new Map();
  const troncon = (i, de, vers) => {
    const cle = i + ':' + de + ':' + vers;
    if (enMemoire.has(cle)) return enMemoire.get(cle);
    const p = leLong(cors[i], de, vers);
    enMemoire.set(cle, p);
    return p;
  };
  const essayer = (chaine, s, iA) => {
    const etapes = [];
    let total = 0;
    for (let k = 0; k < chaine.length; k++) {
      const cor = cors[chaine[k]];
      const de = k === 0 ? s : croisement(chaine[k - 1], chaine[k]);
      const vers = croisement(chaine[k], k + 1 < chaine.length ? chaine[k + 1] : iA);
      if (de == null || vers == null) return;
      const p = troncon(chaine[k], de, vers);
      if (!p || p.m < MINI_TRONCON_M) return;
      etapes.push({ i: chaine[k], nom: cor.nom, de, vers, m: p.m, noeuds: p.noeuds });
      total += p.m;
    }
    const dernier = croisement(chaine[chaine.length - 1], iA);
    const retour = troncon(iA, dernier, s);
    if (!retour || retour.m < MINI_TRONCON_M) return;

    /* ⚠️ La rue de départ sert DEUX FOIS, à l'aller et au retour. Le premier
       prototype l'interdisait, et aucun circuit ne pouvait alors se refermer.
       Ce qu'il faut vérifier n'est pas qu'elle serve une seule fois, mais que
       les deux tronçons ne se chevauchent pas : un seul nœud commun, le
       départ. Sinon on rentre par où l'on est parti. */
    const aller = new Set(etapes[0].noeuds);
    if (retour.noeuds.filter(n => aller.has(n)).length !== 1) return;

    etapes.push({ i: iA, nom: cors[iA].nom, de: dernier, vers: s, m: retour.m, noeuds: retour.noeuds });
    total += retour.m;
    if (Math.abs(total - cible) > cible * TOL) return;

    const cle = etapes.map(e => e.i).join('>');
    if (vus.has(cle)) return;
    vus.add(cle);
    bruts.push({ total, etapes });
  };

  for (const { i: iA, s } of departs) {
    for (const iB of voisins[iA]) {
      for (const iC of voisins[iB]) {
        if (iC === iA || iC === iB) continue;
        if (croisement(iC, iA) != null) essayer([iA, iB, iC], s, iA);
        for (const iD of voisins[iC]) {
          if (iD === iA || iD === iB || iD === iC) continue;
          if (croisement(iD, iA) != null) essayer([iA, iB, iC, iD], s, iA);
        }
      }
    }
  }
  if (!bruts.length) return null;

  /* --- puis à pied, pour de vrai, sur les plus proches de la cible --- */
  bruts.sort((a, b) => Math.abs(a.total - cible) - Math.abs(b.total - cible));

  let meilleur = null;
  for (const brut of bruts.slice(0, MAX_ROUTES)) {
    const ids = [];
    const etapes = [];
    let metres = 0, casse = false;
    for (const e of brut.etapes) {
      const p = aPied(graphe, cors[e.i], e.de, e.vers);
      if (!p) { casse = true; break; }
      metres += p.m;
      for (const n of p.noeuds) if (ids[ids.length - 1] !== n) ids.push(n);
      etapes.push({ nom: e.nom, m: Math.round(p.m) });
    }
    if (casse || ids.length < 4) continue;
    if (Math.abs(metres - cible) > cible * TOL) continue;

    let feux = 0;
    const dejaVus = new Set();
    for (const n of ids) if (graphe.feux.has(n) && !dejaVus.has(n)) { feux++; dejaVus.add(n); }
    /* Le moins allumé gagne : c'est le seul axe sur lequel ce parcours est
       en retard sur les boucles ordinaires, donc le seul qui vaille un tri. */
    if (!meilleur || feux < meilleur.feux) meilleur = { ids, metres, etapes, feux };
  }
  if (!meilleur) return null;

  const b = mesurer(graphe, meilleur.ids, meilleur.metres,
                    waysDuChemin(graphe, meilleur.ids), centre);
  b.etapes = meilleur.etapes;
  return b;
}
