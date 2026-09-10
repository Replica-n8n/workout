/* =========================================================================
   Runa · le temps qu'il fait

   ⚠️ LE SEUL APPEL RÉSEAU DE L'APP EN DEHORS DES RUES, et il doit rester
   FACULTATIF. L'invariant du dépôt est que rien ne dépend du réseau une fois
   la page chargée : la météo enrichit l'écran de départ, elle ne conditionne
   jamais un parcours. Hors ligne, en panne, trop lent, refusé : l'app se tait
   et tout le reste fonctionne exactement pareil.

   Open-Meteo : gratuit, sans clé, sans compte, avec les en-têtes CORS. Pas de
   bibliothèque, une seule requête.

   Ce que la météo change VRAIMENT pour un coureur :
   · la pluie et le froid changent la distance qu'on a envie de faire ;
   · la chaleur donne envie d'ombre ;
   · le vent est le seul qui pourrait changer le TRACÉ, et sur une boucle il
     s'annule en grande partie. On l'affiche, on ne route pas dessus tant
     qu'on n'a pas mesuré que ça sert.
   ========================================================================= */

const RACINE = 'https://api.open-meteo.com/v1/forecast';

/* Au-delà, on renonce. Mieux vaut un écran sans météo qu'un écran qui
   attend : la recherche de parcours, elle, ne doit jamais patienter. */
const DELAI_MS = 4000;

/* La météo ne change pas en cinq minutes, et rappeler à chaque écran serait
   grossier envers un service gratuit. */
export const FRAICHEUR_MS = 20 * 60 * 1000;

/* Un déplacement plus grand relève d'un autre coin de ciel. */
const MEME_LIEU_M = 5000;

const CLE = 'runa-meteo-v1';
const R = 6371008.8, RAD = Math.PI / 180;

/** Les seize aires de vent, comme on les dit. */
const AIRES = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est',
               'est', 'est-sud-est', 'sud-est', 'sud-sud-est',
               'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest',
               'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];

/**
 * D'où vient le vent, en toutes lettres.
 *
 * ⚠️ Un vent « d'ouest » vient de l'ouest, il ne va pas vers l'ouest. C'est la
 * convention météo, et l'inverser ferait dire exactement le contraire.
 */
export function aire(degres) {
  if (!Number.isFinite(degres)) return null;
  const i = Math.round(((degres % 360) + 360) % 360 / 22.5) % 16;
  return AIRES[i];
}

/**
 * Ce qu'on retient d'une réponse Open-Meteo.
 *
 * Séparé de l'appel réseau pour être testable sans réseau : c'est la forme
 * de la réponse qui casse en silence quand une API change, pas le `fetch`.
 *
 * @returns {object|null} `null` si la réponse ne porte pas ce qu'il faut
 */
export function lire(json) {
  const c = json && json.current;
  if (!c) return null;
  const t = Number(c.temperature_2m);
  if (!Number.isFinite(t)) return null;
  const vent = Number(c.wind_speed_10m);
  const dir = Number(c.wind_direction_10m);
  return {
    tempC: Math.round(t),
    ressentiC: Number.isFinite(Number(c.apparent_temperature))
      ? Math.round(Number(c.apparent_temperature)) : null,
    ventKmh: Number.isFinite(vent) ? Math.round(vent) : null,
    ventDeg: Number.isFinite(dir) ? dir : null,
    ventDe: aire(dir),
    pluieMm: Number.isFinite(Number(c.precipitation)) ? Number(c.precipitation) : 0,
    quand: Date.now()
  };
}

/**
 * Une phrase courte, ou `null` s'il n'y a rien d'utile à dire.
 *
 * ⚠️ On ne dit que ce qui CHANGE une décision. « 14 °C, vent 6 km/h » sur
 * l'écran de départ est du bruit : c'est une belle journée, la mentionner
 * n'aide personne à choisir une durée.
 */
export function phrase(m) {
  if (!m) return null;
  const bouts = [`${m.tempC} °C`];
  /* Le ressenti ne s'ajoute que s'il diffère franchement : sinon il répète. */
  if (m.ressentiC != null && Math.abs(m.ressentiC - m.tempC) >= 3) {
    bouts.push(`ressenti ${m.ressentiC}`);
  }
  /* En dessous de 15 km/h, un coureur ne sent rien. */
  if (m.ventKmh != null && m.ventKmh >= 15 && m.ventDe) {
    bouts.push(`vent ${m.ventKmh} km/h de ${m.ventDe}`);
  }
  if (m.pluieMm > 0) bouts.push(m.pluieMm >= 2 ? 'il pleut' : 'quelques gouttes');
  return bouts.join(' · ');
}

/* --------------------------------------------------------- la mémoire */

function distanceM(a, b) {
  const kx = R * RAD * Math.cos(a.lat * RAD), ky = R * RAD;
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky);
}

/** La dernière météo si elle vaut encore, sinon `null`. */
export function enMemoire(lieu, maintenant = Date.now()) {
  if (!lieu) return null;
  try {
    const g = JSON.parse(localStorage.getItem(CLE));
    if (!g || !g.lieu || !g.m) return null;
    if (maintenant - g.m.quand > FRAICHEUR_MS) return null;
    if (distanceM(lieu, g.lieu) > MEME_LIEU_M) return null;
    return g.m;
  } catch (e) {
    return null;
  }
}

function garder(lieu, m) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ lieu: { lat: lieu.lat, lon: lieu.lon }, m }));
  } catch (e) { /* stockage plein ou refusé : la météo n'en vaut pas la peine */ }
}

/* ------------------------------------------------------------ l'appel */

/* L'appel en cours, partagé par les demandes simultanées. */
let enVol = null;

/**
 * La météo au départ, ou `null`.
 *
 * ⚠️ Ne LÈVE JAMAIS. Un écran de réglages qui plante parce qu'un service
 * gratuit répond mal serait un très mauvais échange.
 *
 * @param {{lat:number, lon:number}} lieu
 * @param {object} [o]
 * @param {typeof fetch} [o.fetch]  pour les essais
 * @returns {Promise<object|null>}
 */
export async function meteo(lieu, o = {}) {
  if (!lieu || !Number.isFinite(lieu.lat) || !Number.isFinite(lieu.lon)) return null;
  const dejaLa = enMemoire(lieu);
  if (dejaLa) return dejaLa;

  /* ⚠️ La mémoire ne s'écrit qu'À LA RÉPONSE. Or l'écran de réglages se
     repeint depuis onze endroits, dont chaque bouton de durée : sur un cache
     froid, enchaîner deux touchers lançait deux requêtes en parallèle vers
     un service gratuit, pour le même point. On partage donc l'appel en
     cours. */
  if (enVol && enVol.cle === cleDeLieu(lieu)) return enVol.promesse;

  const url = `${RACINE}?latitude=${lieu.lat.toFixed(4)}&longitude=${lieu.lon.toFixed(4)}`
            + '&current=temperature_2m,apparent_temperature,precipitation,'
            + 'wind_speed_10m,wind_direction_10m';

  const promesse = (async () => {
    const arreter = new AbortController();
    const minuteur = setTimeout(() => arreter.abort(), DELAI_MS);
    try {
      const f = o.fetch || fetch;
      const rep = await f(url, { signal: arreter.signal });
      if (!rep.ok) return null;
      const m = lire(await rep.json());
      if (m) garder(lieu, m);
      return m;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(minuteur);
      enVol = null;
    }
  })();
  enVol = { cle: cleDeLieu(lieu), promesse };
  return promesse;
}

/* Deux points à moins d'une centaine de mètres sont le même appel. */
function cleDeLieu(lieu) {
  return lieu.lat.toFixed(3) + ',' + lieu.lon.toFixed(3);
}
