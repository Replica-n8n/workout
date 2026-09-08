/* =========================================================================
   Runa · ce que vous avez déjà couru

   Deux stocks, un seul fichier : les identifiants des rues prises (pour le
   mode découverte) et le contour des sorties (pour le mode conquête).

   L'ANCRE se pose une seule fois, à la première sortie enregistrée, et ne
   bouge plus. C'est le point crucial : un plateau recalculé autour de « ma
   position » remettrait le compteur à zéro dès qu'on se déplace, donc
   récompenserait la fuite au lieu de l'exploration. Mesuré : en gardant le
   même départ, la quinzième sortie ne rapporte plus que 0,28 point de
   territoire ; en décalant le départ d'un kilomètre, elle en rapporte
   encore 1,94. C'est cette différence qui doit rester visible.
   ========================================================================= */

import { Territoire } from '../lib/score.js';

const CLE = 'runa-plateau-v1';

/* Au-delà, on ne relit plus rien et on remplit le quota pour des sorties
   d'il y a six mois. La trame, elle, garde leur trace : oublier le contour
   d'une vieille sortie ne rend pas son terrain. */
const MAX_SORTIES = 60;

/* Un point tous les vingt-cinq mètres suffit à un remplissage qui compte par
   cases de dix. Le tracé complet pèserait cinq fois plus pour rien. */
const PAS_TRACE_M = 25;

const R = 6371008.8, RAD = Math.PI / 180;

let cache = null;          // l'état lu, gardé en mémoire
let terr = null;           // la trame, reconstruite à la demande

function vide() { return { ancre: null, ways: [], sorties: [] }; }

function lire() {
  if (cache) return cache;
  try {
    const b = JSON.parse(localStorage.getItem(CLE));
    cache = (b && Array.isArray(b.ways) && Array.isArray(b.sorties)) ? b : vide();
  } catch (e) {
    cache = vide();
  }
  return cache;
}

function ecrire() {
  try {
    localStorage.setItem(CLE, JSON.stringify(cache));
    return true;
  } catch (e) {
    /* Quota plein : on retire les plus vieilles sorties plutôt que de
       perdre l'enregistrement en cours, qui est celui qui vient d'être
       couru. Les ways, eux, tiennent dans quelques kilo-octets. */
    cache.sorties = cache.sorties.slice(0, Math.floor(cache.sorties.length / 2));
    try { localStorage.setItem(CLE, JSON.stringify(cache)); return true; }
    catch (e2) { return false; }
  }
}

/* ------------------------------------------------------------- les rues */

export function dejaCourues() {
  return new Set(lire().ways);
}

export function combienDeSorties() { return lire().sorties.length; }

/* ---------------------------------------------------------- le territoire */

function versM(ancre, p) {
  const kx = R * RAD * Math.cos(ancre.lat * RAD), ky = R * RAD;
  return [Math.round((p.lon - ancre.lon) * kx), Math.round((p.lat - ancre.lat) * ky)];
}

function versLatLon(ancre, x, y) {
  const kx = R * RAD * Math.cos(ancre.lat * RAD), ky = R * RAD;
  return { lat: ancre.lat + y / ky, lon: ancre.lon + x / kx };
}

/** Un tracé allégé : on ne garde un point que tous les vingt-cinq mètres. */
function alleger(ancre, points) {
  const out = [];
  let dernier = null;
  for (const p of points) {
    const [x, y] = versM(ancre, p);
    if (dernier && Math.hypot(x - dernier[0], y - dernier[1]) < PAS_TRACE_M) continue;
    out.push(x, y);
    dernier = [x, y];
  }
  return out;
}

/**
 * La trame du terrain tenu. Reconstruite depuis les contours enregistrés :
 * la stocker en clair coûterait un mégaoctet de `localStorage`, alors que la
 * refaire coûte quelques millisecondes au lancement.
 */
export function territoire() {
  const b = lire();
  if (!b.ancre) return null;
  if (terr) return terr;
  terr = new Territoire(b.ancre);
  for (const s of b.sorties) {
    const pts = [];
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      pts.push(versLatLon(b.ancre, s.pts[i], s.pts[i + 1]));
    }
    terr.ajouter(pts);
  }
  return terr;
}

export function ancre() { return lire().ancre; }

/**
 * Les contours des sorties, en lat/lon, pour les dessiner.
 *
 * Les plus récentes d'abord, comme elles sont stockées : si un jour on en
 * limite l'affichage, ce sont les dernières qu'on veut voir.
 */
export function contours() {
  const b = lire();
  if (!b.ancre) return [];
  return b.sorties.map(s => {
    const pts = [];
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      pts.push(versLatLon(b.ancre, s.pts[i], s.pts[i + 1]));
    }
    return pts;
  }).filter(p => p.length >= 3);
}

/* ------------------------------------------------------- enregistrer */

/**
 * Marque une boucle comme courue. Appelé quand on touche « Suivre ce
 * parcours » : c'est le seul geste qui dise « je pars faire celle-là ».
 *
 * On a hésité avec « Garder », qui existe déjà. Mais on garde un parcours
 * qu'on compte REFAIRE, pas seulement un qu'on a fait : deux ou trois
 * favoris pour dix sorties, le compteur sous-compterait massivement. Le faux
 * positif ici est « j'ai choisi la boucle sans la courir », nettement plus
 * rare.
 *
 * @returns {boolean} vrai si quelque chose a été enregistré
 */
export function enregistrer(boucle) {
  if (!boucle || !boucle.points || boucle.points.length < 3) return false;
  const b = lire();
  if (!b.ancre) b.ancre = { lat: boucle.points[0].lat, lon: boucle.points[0].lon };

  const avant = new Set(b.ways);
  for (const w of (boucle.ways || [])) avant.add(w);
  b.ways = [...avant];

  b.sorties.unshift({
    quand: Date.now(),
    m: Math.round(boucle.m),
    pts: alleger(b.ancre, boucle.points)
  });
  if (b.sorties.length > MAX_SORTIES) b.sorties.length = MAX_SORTIES;

  /* La trame en mémoire connaît déjà les sorties précédentes : on lui ajoute
     celle-ci au lieu de tout refaire. */
  if (terr) terr.ajouter(boucle.points);
  return ecrire();
}

export function oublierTout() {
  cache = vide();
  terr = null;
  try { localStorage.removeItem(CLE); } catch (e) {}
}

/* ------------------------------------------------------------- le bilan */

/**
 * Ce qu'on peut afficher sans rien télécharger de plus.
 *
 * ⚠️ Pas de pourcentage de territoire : le dénominateur supposerait de
 * connaître tout le plateau, donc de télécharger 12 km² de rues là où l'app
 * en charge 2,5. Les kilomètres carrés se suffisent, et ils montent toujours
 * au lieu de plafonner.
 */
export function bilan() {
  const b = lire();
  const t = territoire();
  return {
    sorties: b.sorties.length,
    rues: b.ways.length,
    km: +(b.sorties.reduce((s, x) => s + x.m, 0) / 1000).toFixed(1),
    km2: t ? +(t.m2() / 1e6).toFixed(2) : 0
  };
}

/**
 * La part des rues du quartier que l'on a déjà prises.
 *
 * ⚠️ Le dénominateur est un DISQUE autour du départ, pas le graphe entier.
 * Le graphe est téléchargé en boîte carrée et plus large que nécessaire :
 * le prendre tel quel donnait 173 km de rues là où il y en a 90 à moins d'un
 * kilomètre, donc « 3 % » après une sortie, un chiffre à la fois faux et
 * décourageant, gonflé par des rues qu'on n'atteindra jamais.
 *
 * On ne compte que les vraies rues : additionner les trottoirs doublerait
 * chaque rue et le chiffre ne voudrait plus rien dire.
 */
const VRAIE_RUE = /^(residential|tertiary|secondary|primary|living_street|unclassified|pedestrian)$/;

/* Un kilomètre : la distance qu'une boucle de 5 km atteint réellement, ses
   points intermédiaires se posant vers 675 m du départ. */
export const RAYON_QUARTIER_M = 1000;

export function partDuQuartier(graphe, centre, rayonM = RAYON_QUARTIER_M) {
  if (!graphe || !centre) return null;
  const faits = dejaCourues();
  const kx = R * RAD * Math.cos(centre.lat * RAD), ky = R * RAD;
  const dedans = n => {
    if (!n) return false;
    const x = (n.lon - centre.lon) * kx, y = (n.lat - centre.lat) * ky;
    return x * x + y * y <= rayonM * rayonM;
  };
  let total = 0, pris = 0;
  const vus = new Set();
  for (const [de, liens] of graphe.voisins) {
    for (const l of liens) {
      const cle = de < l.vers ? de + ':' + l.vers : l.vers + ':' + de;
      if (vus.has(cle)) continue;
      vus.add(cle);
      // Une arête compte si l'une de ses deux extrémités est à portée : la
      // couper au bord introduirait des demi-rues sans rien améliorer.
      if (!dedans(graphe.noeuds.get(de)) && !dedans(graphe.noeuds.get(l.vers))) continue;
      const t = graphe.ways.get(l.way);
      if (!t || !VRAIE_RUE.test(t.highway)) continue;
      total += l.m;
      if (faits.has(l.way)) pris += l.m;
    }
  }
  if (!total) return null;
  return { part: pris / total, km: pris / 1000, kmTotal: total / 1000 };
}
