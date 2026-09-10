/* =========================================================================
   Runa · les parcours gardés

   « Je fais toujours le même trajet » et « je veux refaire celui-là » ne se
   contredisent pas : on garde les deux ou trois boucles qu'on a aimées, et
   on évite de refaire par accident toutes les autres. Ce fichier tient la
   première moitié ; la seconde lira le même stock pour savoir quelles rues
   ont déjà été courues.

   Le stockage est volontairement `localStorage` et non IndexedDB : une
   boucle pèse environ 9 Ko, trente boucles font 270 Ko, et on veut pouvoir
   les lire de façon synchrone au premier rendu, sans attendre.
   ========================================================================= */

const CLE = 'runa-favoris-v1';

/* Au-delà, ce n'est plus une liste de favoris, c'est un historique qu'on ne
   relit jamais. La limite protège aussi le quota de `localStorage`. */
const MAX = 30;

export function lireTout() {
  try {
    const l = JSON.parse(localStorage.getItem(CLE));
    if (!Array.isArray(l)) return [];
    return l.map(f => ({ ...f, points: f.points.map(([lat, lon]) => ({ lat, lon })) }));
  } catch (e) {
    return [];
  }
}

function ecrireTout(liste) {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX).map(f => ({
      ...f,
      // Six décimales valent une dizaine de centimètres : au-delà on
      // stockerait du bruit GPS et on remplirait le quota pour rien.
      points: f.points.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)])
    }))));
    return true;
  } catch (e) {
    return false;   // quota plein ou stockage refusé : on ne casse rien
  }
}

/**
 * Deux parcours sont « le même » s'ils partent du même endroit et font la
 * même longueur à cinquante mètres près. Comparer les tracés point par point
 * serait plus juste et parfaitement inutile : on cherche seulement à éviter
 * qu'un double appui garde deux fois la même boucle.
 */
function memeParcours(a, b) {
  if (Math.abs(a.m - b.m) > 50) return false;
  const p = a.points[0], q = b.points[0];
  return Math.abs(p.lat - q.lat) < 0.0005 && Math.abs(p.lon - q.lon) < 0.0005;
}

export function estGarde(boucle) {
  return lireTout().some(f => memeParcours(f, boucle));
}

/**
 * Ce qui décrit la FORME d'un parcours, au-delà de son tracé : le genre de
 * sortie, le parc, les tours, les rues à retenir.
 *
 * ⚠️ Partagé avec la reprise d'une course interrompue. Ni l'une ni l'autre ne
 * gardait ces champs : une sortie au parc reprise après qu'Android avait tué
 * l'app perdait son « 2× » sur la carte et sa marque « Au parc », alors que
 * c'est précisément ce qu'on veut lire d'un coup d'œil en courant. Une seule
 * liste pour les deux, sinon elles finiront par diverger.
 */
export const CHAMPS_DE_FORME = ['genre', 'parc', 'tours', 'tourM', 'approcheM',
  'centreTour', 'etapes', 'feuxDansLeParc'];

/** Les champs de forme présents dans une boucle, prêts à être stockés. */
export function forme(boucle) {
  const f = {};
  for (const c of CHAMPS_DE_FORME) if (boucle && boucle[c] != null) f[c] = boucle[c];
  return f;
}

/** @returns {boolean} vrai si le parcours a été ajouté, faux s'il y était déjà */
export function garder(boucle) {
  const liste = lireTout();
  if (liste.some(f => memeParcours(f, boucle))) return false;
  liste.unshift({
    id: 'p' + Date.now().toString(36),
    quand: Date.now(),
    m: boucle.m,
    feux: boucle.feux,
    rues: boucle.rues || [],
    fractionEclairee: boucle.fractionEclairee ?? null,
    // Les ways servent à l'exploration du quartier : savoir quelles rues on
    // a déjà courues demande leurs identifiants, pas seulement le dessin.
    ways: boucle.ways ? [...boucle.ways] : [],
    points: boucle.points,
    ...forme(boucle)
  });
  return ecrireTout(liste);
}

export function oublier(id) {
  return ecrireTout(lireTout().filter(f => f.id !== id));
}

export function combien() {
  return lireTout().length;
}
