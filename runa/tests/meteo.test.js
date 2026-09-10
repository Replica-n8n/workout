import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aire, lire, phrase, meteo, enMemoire, FRAICHEUR_MS } from '../lib/meteo.js';

/* `localStorage` n'existe pas sous Node. La mémoire de la météo doit donc se
   taire au lieu de faire tomber l'app : ces tests vérifient aussi ça. */
if (typeof localStorage === 'undefined') {
  const boite = new Map();
  globalThis.localStorage = {
    getItem: k => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => boite.set(k, String(v)),
    removeItem: k => boite.delete(k),
    clear: () => boite.clear()
  };
}

test('le vent vient d’une aire, il n’y va pas', () => {
  /* ⚠️ Convention météo : 270° est un vent D'OUEST, qui souffle vers l'est.
     Inverser ferait dire exactement le contraire au coureur. */
  assert.equal(aire(0), 'nord');
  assert.equal(aire(90), 'est');
  assert.equal(aire(180), 'sud');
  assert.equal(aire(270), 'ouest');
  assert.equal(aire(360), 'nord');
  assert.equal(aire(-90), 'ouest', 'un angle négatif doit se ramener dans le tour');
  assert.equal(aire(45), 'nord-est');
  assert.equal(aire(null), null);
  assert.equal(aire(NaN), null);
});

test('lire une réponse complète', () => {
  const m = lire({ current: {
    temperature_2m: 12.4, apparent_temperature: 9.8, precipitation: 0.3,
    wind_speed_10m: 21.6, wind_direction_10m: 268 } });
  assert.equal(m.tempC, 12);
  assert.equal(m.ressentiC, 10);
  assert.equal(m.ventKmh, 22);
  assert.equal(m.ventDe, 'ouest');
  assert.equal(m.pluieMm, 0.3);
  assert.ok(m.quand > 0);
});

test('une réponse mutilée ne rend rien plutôt qu’un objet à moitié faux', () => {
  /* Un service gratuit peut changer de forme sans prévenir. Rendre un objet
     dont la température est `NaN` afficherait « NaN °C » à l'écran. */
  assert.equal(lire(null), null);
  assert.equal(lire({}), null);
  assert.equal(lire({ current: {} }), null);
  assert.equal(lire({ current: { temperature_2m: 'chaud' } }), null);

  /* Le reste peut manquer sans que la température devienne inutilisable. */
  const m = lire({ current: { temperature_2m: 5 } });
  assert.equal(m.tempC, 5);
  assert.equal(m.ventKmh, null);
  assert.equal(m.ventDe, null);
  assert.equal(m.pluieMm, 0);
});

test('la phrase ne dit que ce qui change une décision', () => {
  /* Une belle journée sans vent : la mentionner n'aide personne à choisir
     une durée. Seule la température reste. */
  assert.equal(phrase(lire({ current: {
    temperature_2m: 14, wind_speed_10m: 6, wind_direction_10m: 90 } })), '14 °C');

  /* Du vent qu'on sent, lui, se dit. */
  assert.equal(phrase(lire({ current: {
    temperature_2m: 14, wind_speed_10m: 25, wind_direction_10m: 270 } })),
    '14 °C · vent 25 km/h de ouest');

  /* Un ressenti proche répète la température : on le tait. */
  assert.equal(phrase(lire({ current: {
    temperature_2m: 10, apparent_temperature: 9 } })), '10 °C');
  assert.equal(phrase(lire({ current: {
    temperature_2m: 10, apparent_temperature: 3 } })), '10 °C · ressenti 3');

  assert.equal(phrase(lire({ current: {
    temperature_2m: 8, precipitation: 3 } })), '8 °C · il pleut');
  assert.equal(phrase(null), null);
});

test('une panne réseau rend null, elle ne lève pas', async () => {
  /* ⚠️ C'est l'exigence centrale : la météo est un supplément. Si elle
     pouvait faire tomber l'écran de départ, elle coûterait plus qu'elle ne
     rapporte. */
  localStorage.clear();
  const lieu = { lat: 45.52, lon: -73.58 };
  assert.equal(await meteo(lieu, { fetch: () => Promise.reject(new Error('hors ligne')) }), null);
  assert.equal(await meteo(lieu, { fetch: () => Promise.resolve({ ok: false, status: 503 }) }), null);
  assert.equal(await meteo(lieu, {
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('json')) })
  }), null);
});

test('une position absente n’appelle même pas', async () => {
  let appels = 0;
  const compte = () => { appels++; return Promise.reject(new Error('ne devrait pas arriver')); };
  assert.equal(await meteo(null, { fetch: compte }), null);
  assert.equal(await meteo({ lat: NaN, lon: 0 }, { fetch: compte }), null);
  assert.equal(appels, 0, 'un appel réseau est parti sans position valable');
});

test('la mémoire évite un deuxième appel au même endroit', async () => {
  localStorage.clear();
  const lieu = { lat: 45.52, lon: -73.58 };
  let appels = 0;
  const faux = () => {
    appels++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      current: { temperature_2m: 11, wind_speed_10m: 4, wind_direction_10m: 10 } }) });
  };
  const a = await meteo(lieu, { fetch: faux });
  const b = await meteo(lieu, { fetch: faux });
  assert.equal(a.tempC, 11);
  assert.equal(b.tempC, 11);
  assert.equal(appels, 1, 'la météo a été redemandée alors qu’elle était fraîche');
});

test('la mémoire ne vaut ni pour un autre lieu ni pour hier', async () => {
  localStorage.clear();
  const lieu = { lat: 45.52, lon: -73.58 };
  const faux = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    current: { temperature_2m: 11 } }) });
  await meteo(lieu, { fetch: faux });

  /* Cent kilomètres plus loin, c'est un autre ciel. */
  assert.equal(enMemoire({ lat: 46.5, lon: -73.58 }), null);
  /* Et une heure plus tard, ce n'est plus la même météo. */
  assert.equal(enMemoire(lieu, Date.now() + FRAICHEUR_MS + 1000), null);
  /* Mais tout de suite et sur place, elle vaut. */
  assert.ok(enMemoire(lieu));
});
