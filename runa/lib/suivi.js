/* =========================================================================
   Runa · se situer sur le parcours

   Le cas d'usage : on court, on sort le téléphone de sa poche à un
   carrefour, et on veut savoir de quel côté la boucle continue. Voir sa
   position ne suffit pas : sur une boucle, le tracé passe des deux côtés du
   point où l'on se trouve.

   Ces fonctions ne touchent ni au GPS ni au DOM. Elles reçoivent une
   position et rendent où elle tombe sur le tracé, dans quel sens on avance,
   et ce qui reste à faire.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

function metres(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Au-delà, on considère qu'on n'est plus sur le parcours et on le dit, plutôt
   que d'accrocher de force à un point situé trois rues plus loin. */
export const ECART_MAX_M = 70;

/**
 * Où la position tombe sur le tracé.
 *
 * ⚠️ Chercher le point le plus proche sur TOUT le tracé se trompe dès qu'une
 * boucle se recroise ou longe une rue parallèle : on se retrouve accroché au
 * mauvais brin, et le segment surligné indique la mauvaise direction. On
 * cherche donc d'abord autour de la position précédente, et on ne repart en
 * recherche globale que si plus rien ne colle à proximité.
 *
 * @returns {{indice:number, ecartM:number, global:boolean}|null}
 */
export function accrocher(points, moi, indicePrecedent = null, fenetre = 80) {
  const n = points.length;
  if (!n || !moi) return null;

  const cherche = (debut, fin) => {
    let meilleur = -1, meilleurD = Infinity;
    for (let k = debut; k <= fin; k++) {
      const i = ((k % n) + n) % n;
      const d = metres(moi, points[i]);
      if (d < meilleurD) { meilleurD = d; meilleur = i; }
    }
    return { indice: meilleur, ecartM: meilleurD };
  };

  if (indicePrecedent !== null && indicePrecedent >= 0) {
    const proche = cherche(indicePrecedent - fenetre, indicePrecedent + fenetre);
    if (proche.ecartM <= ECART_MAX_M) return { ...proche, global: false };
  }
  return { ...cherche(0, n - 1), global: true };
}

/**
 * Dans quel sens on parcourt la boucle, à partir des derniers accrochages.
 *
 * On ne peut pas le déduire d'un seul point : c'est la PROGRESSION de
 * l'indice qui le dit. Les écarts se comptent de façon circulaire, sinon le
 * passage par le point de départ (de l'indice n-1 à 0) ressemblerait à un
 * gigantesque retour en arrière et retournerait le sens juste avant
 * l'arrivée.
 */
export function sensDeMarche(indices, n, defaut = 1) {
  if (!Array.isArray(indices) || indices.length < 2 || !n) return defaut;
  let somme = 0;
  for (let k = 1; k < indices.length; k++) {
    let d = indices[k] - indices[k - 1];
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    somme += d;
  }
  if (Math.abs(somme) < 3) return defaut;   // à l'arrêt, on ne tranche pas
  return somme >= 0 ? 1 : -1;
}

/** Les `metresVoulus` prochains mètres du tracé, dans le sens indiqué. */
export function segmentSuivant(points, indice, sens = 1, metresVoulus = 400) {
  const n = points.length;
  if (!n || indice == null || indice < 0) return [];
  const out = [points[indice]];
  let cumul = 0, i = indice;
  for (let k = 0; k < n; k++) {
    const j = ((i + sens) % n + n) % n;
    cumul += metres(points[i], points[j]);
    out.push(points[j]);
    i = j;
    if (cumul >= metresVoulus) break;
  }
  return out;
}

/**
 * Ce qu'il reste à courir jusqu'au point de départ, dans le sens indiqué.
 * Le tracé est fermé : son dernier point est son premier.
 */
export function metresRestants(points, indice, sens = 1) {
  const n = points.length;
  if (!n || indice == null || indice < 0) return 0;
  let cumul = 0, i = indice;
  for (let k = 0; k < n; k++) {
    const j = ((i + sens) % n + n) % n;
    cumul += metres(points[i], points[j]);
    i = j;
    if (i === 0 || i === n - 1) break;
  }
  return Math.round(cumul);
}
