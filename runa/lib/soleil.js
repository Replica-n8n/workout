/* =========================================================================
   Runa · fait-il jour ?

   Le mode nuit existait déjà, mais il fallait le cocher soi-même. Or le
   téléphone connaît l'heure ET la position : il peut savoir si le coureur
   sortira dans le noir, et proposer les rues éclairées sans qu'on demande.

   ⚠️ Aucun réseau. Le lever et le coucher du soleil se calculent, ils ne se
   téléchargent pas. L'app doit continuer à tout faire hors ligne.

   Algorithme classique du « Sunrise equation », en temps solaire moyen. La
   précision est de l'ordre de la minute, largement suffisant : on ne décide
   pas d'un parcours à la minute près, et on prend de toute façon une marge.
   ========================================================================= */

const RAD = Math.PI / 180, DEG = 180 / Math.PI;

/* L'angle du soleil sous l'horizon qui définit le coucher.
   -0,833° tient compte de la réfraction atmosphérique et du diamètre du
   disque : c'est la définition habituelle du lever et du coucher. */
const HORIZON = -0.833;

/* Le jour julien du 1er janvier 2000 à midi, origine des calculs. */
const J2000 = 2451545;

function jourJulien(d) {
  return d.getTime() / 86400000 + 2440587.5;
}

/**
 * Lever et coucher du soleil pour une position et une date.
 *
 * @param {{lat:number, lon:number}} lieu
 * @param {Date} [quand]
 * @returns {{lever: Date, coucher: Date} | null} `null` aux latitudes et aux
 *   dates où le soleil ne se lève ou ne se couche pas du tout. Ce n'est pas
 *   une erreur : au-delà du cercle polaire, la question n'a pas de réponse.
 */
export function soleil(lieu, quand = new Date()) {
  if (!lieu || !Number.isFinite(lieu.lat) || !Number.isFinite(lieu.lon)) return null;

  const n = Math.round(jourJulien(quand) - J2000 - 0.0009 + lieu.lon / 360);
  const midiApprox = n + 0.0009 - lieu.lon / 360;

  /* L'anomalie moyenne, puis l'équation du centre : l'orbite terrestre est
     une ellipse, donc le Soleil n'avance pas d'un pas régulier. */
  const M = (357.5291 + 0.98560028 * midiApprox) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD)
          + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;

  /* Le midi solaire vrai, décalé du midi moyen par l'équation du temps. */
  const midi = J2000 + midiApprox + 0.0053 * Math.sin(M * RAD)
             - 0.0069 * Math.sin(2 * lambda * RAD);

  const declinaison = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));

  const cosH = (Math.sin(HORIZON * RAD) - Math.sin(lieu.lat * RAD) * Math.sin(declinaison))
             / (Math.cos(lieu.lat * RAD) * Math.cos(declinaison));
  /* Hors de [-1, 1] : soleil de minuit, ou nuit polaire. */
  if (cosH > 1 || cosH < -1) return null;

  const H = Math.acos(cosH) * DEG / 360;
  const versDate = j => new Date((j - 2440587.5) * 86400000);
  return { lever: versDate(midi - H), coucher: versDate(midi + H) };
}

/* La marge autour du coucher. Il ne fait pas soudainement noir : le
   crépuscule civil dure une vingtaine de minutes sous nos latitudes, et une
   sortie qui commence juste avant le coucher se termine dans le noir. */
const MARGE_MIN = 30;

/**
 * Fera-t-il nuit pendant cette sortie ?
 *
 * ⚠️ On regarde la FIN de la sortie, pas son début. Partir à la lumière et
 * rentrer dans le noir est le cas le plus courant en automne, et c'est
 * précisément celui où l'éclairage compte.
 *
 * @param {{lat:number, lon:number}} lieu
 * @param {number} dureeMin  durée prévue de la sortie
 * @param {Date} [quand]
 * @returns {boolean}
 */
export function feraNuit(lieu, dureeMin = 0, quand = new Date()) {
  const s = soleil(lieu, quand);
  /* Sans réponse, on ne décide rien : mieux vaut laisser le réglage manuel
     que d'imposer le mode nuit à Tromsø un jour de soleil de minuit. */
  if (!s) return false;
  const fin = new Date(quand.getTime() + dureeMin * 60000);
  const seuil = new Date(s.coucher.getTime() - MARGE_MIN * 60000);
  return fin >= seuil || quand <= s.lever;
}

/** Combien de minutes de jour restent, ou `null` si la question n'a pas de sens. */
export function minutesDeJour(lieu, quand = new Date()) {
  const s = soleil(lieu, quand);
  if (!s) return null;
  return Math.round((s.coucher.getTime() - quand.getTime()) / 60000);
}
