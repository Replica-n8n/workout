/* =========================================================================
   Runa · ce qu'on veut courir

   Deux façons de le dire : une durée choisie parmi quelques boutons, ou une
   distance tapée soi-même. Les coureurs ont dit préférer la distance.

   Le générateur, lui, ne connaît qu'une distance : la durée est convertie
   avec l'allure, et c'est la seule règle à écrire une fois ici plutôt qu'à
   quatre endroits de `js/app.js`.

   ⚠️ Au-delà de 15 km, que des parcours en tours. Mesuré le 2026-09-12 sur
   le Plateau, dans le disque que l'app télécharge vraiment (rayon plafonné à
   2 km) : jusqu'à 15 km les boucles tombent à moins de 10 % de la cible, à
   17 km jusqu'à 23 %, à 21 km elles font 27 à 35 % de moins, soit 14 km pour
   21 demandés. Les parcours en tours, eux, tombent juste (20,1 km pour 21).
   Agrandir la zone aurait coûté environ 18 Mo au premier téléchargement :
   elle a choisi de garder la zone et de ne proposer que des tours.
   ========================================================================= */

import { distancePour } from './geo.js';

export const DISTANCE_MIN_KM = 1;
export const DISTANCE_MAX_KM = 21;
export const TOURS_SEULS_AU_DELA_M = 15000;

/**
 * La distance tapée dans le champ, en km, ou null si ce n'est pas un nombre.
 *
 * Le clavier d'un téléphone en français propose la virgule : « 7,5 » doit
 * valoir 7,5 et pas 7. On tolère aussi « 8 km » collé par habitude.
 */
export function lireKm(texte) {
  const t = String(texte ?? '').trim().toLowerCase().replace(/\s*km$/, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Vrai si la distance est de celles que l'app sait proposer. */
export function distanceValide(km) {
  return typeof km === 'number' && km >= DISTANCE_MIN_KM && km <= DISTANCE_MAX_KM;
}

/**
 * La distance à chercher, en mètres, ou null si le champ est invalide.
 *
 * ⚠️ null et pas une valeur par défaut : lancer une recherche sur l'ancienne
 * distance pendant que le champ affiche autre chose, c'est chercher ce
 * qu'elle n'a pas demandé.
 */
export function cibleM({ mesure, distanceKm, duree, allure }) {
  if (mesure === 'duree') return distancePour(duree * 60, allure);
  return distanceValide(distanceKm) ? distanceKm * 1000 : null;
}

/** La durée probable de la sortie, en minutes : le mode nuit s'en sert. */
export function minutesDeSortie(r) {
  if (r.mesure === 'duree') return r.duree;
  const m = cibleM(r);
  return m == null ? r.duree : Math.round(m / 1000 * r.allure / 60);
}

/** Au-delà de ce seuil, seuls les parcours en tours tombent juste. */
export function toursSeuls(metres) {
  return metres > TOURS_SEULS_AU_DELA_M;
}

/** Une distance telle qu'on la dit : « 8 km », « 7,5 km », jamais « 8,0 ». */
export function km(metres) {
  const x = Math.round(metres / 100) / 10;
  return `${String(x).replace('.', ',')} km`;
}

function duree(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Le libellé du bouton principal : il dit ce qu'il va chercher. */
export function libelleChercher(r) {
  const m = cibleM(r);
  if (m == null) return 'Trouver des boucles';
  return toursSeuls(m) ? `Trouver des parcours en tours de ${km(m)}`
                       : `Trouver des boucles de ${km(m)}`;
}

/**
 * La ligne au-dessus des résultats.
 *
 * Écrite deux fois dans `js/app.js` jusqu'ici, avec le même `toFixed(1)` à
 * point décimal : « 5.1 km » à côté de « 1,08 km » dans la même carte.
 */
export function resumeResultats(n, metres) {
  const quoi = toursSeuls(metres)
    ? `parcours en tours`
    : `boucle${n > 1 ? 's' : ''}`;
  return `${n} ${quoi} autour de ${km(metres)}`;
}

/**
 * Le texte à droite dans le champ de distance : la durée probable, ou la
 * plage permise si la saisie ne va pas.
 *
 * Court, parce qu'il tient DANS le champ : une ligne de plus sous le champ
 * faisait sauter le panneau à chaque bascule entre distance et durée. Que
 * les longues distances donnent des tours, le bouton le dit déjà
 * (« Trouver des parcours en tours de 18 km »).
 *
 * @returns {{texte: string, erreur: boolean}}
 */
export function aideDistance(r) {
  if (!distanceValide(r.distanceKm)) {
    return { texte: `${DISTANCE_MIN_KM} à ${DISTANCE_MAX_KM} km`, erreur: true };
  }
  return { texte: `≈ ${duree(minutesDeSortie(r))}`, erreur: false };
}
