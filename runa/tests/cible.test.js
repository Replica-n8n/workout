import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lireKm, distanceValide, cibleM, minutesDeSortie, toursSeuls, km,
  libelleChercher, aideDistance, resumeResultats, DISTANCE_MAX_KM
} from '../lib/cible.js';

const R = { mesure: 'distance', distanceKm: 8, duree: 30, allure: 350 };

test('le champ lit la virgule du clavier français', () => {
  assert.equal(lireKm('7,5'), 7.5);
  assert.equal(lireKm('7.5'), 7.5);
  assert.equal(lireKm(' 8 '), 8);
  assert.equal(lireKm('8 km'), 8);
  assert.equal(lireKm('10'), 10);
});

test('ce qui n’est pas un nombre ne devient pas un nombre', () => {
  /* `parseFloat('7abc')` rend 7 : une faute de frappe lancerait une
     recherche que personne n'a demandée. */
  for (const t of ['', '   ', 'abc', '7abc', '7,5,2', '-3', '1e3', null, undefined]) {
    assert.equal(lireKm(t), null, JSON.stringify(t));
  }
});

test('de 1 à 21 km, bornes comprises', () => {
  assert.ok(distanceValide(1));
  assert.ok(distanceValide(21));
  assert.ok(!distanceValide(0.9));
  assert.ok(!distanceValide(21.1));
  assert.ok(!distanceValide(null));
  assert.equal(DISTANCE_MAX_KM, 21);
});

test('une distance invalide ne cherche rien, surtout pas l’ancienne', () => {
  assert.equal(cibleM({ ...R, distanceKm: null }), null);
  assert.equal(cibleM({ ...R, distanceKm: 30 }), null);
  assert.equal(cibleM(R), 8000);
});

test('en durée, rien ne change : la durée se convertit avec l’allure', () => {
  const r = { ...R, mesure: 'duree', duree: 30, allure: 360, distanceKm: null };
  assert.equal(cibleM(r), 5000);
  /* Le champ de distance, même vide ou faux, n'a pas son mot à dire. */
  assert.equal(cibleM({ ...r, distanceKm: 99 }), 5000);
  assert.equal(minutesDeSortie(r), 30);
});

test('la durée probable suit la distance, pour le mode nuit', () => {
  assert.equal(minutesDeSortie({ ...R, distanceKm: 6, allure: 360 }), 36);
  /* Champ invalide : on retombe sur la durée connue plutôt que sur NaN, qui
     ferait basculer le mode nuit au hasard. */
  assert.equal(minutesDeSortie({ ...R, distanceKm: null, duree: 40 }), 40);
});

test('au-delà de 15 km, que des tours ; 15 km pile reste en boucles', () => {
  assert.ok(!toursSeuls(15000));
  assert.ok(toursSeuls(15001));
  assert.ok(toursSeuls(21000));
});

test('les distances s’écrivent comme on les dit', () => {
  assert.equal(km(8000), '8 km');
  assert.equal(km(7500), '7,5 km');
  assert.equal(km(5143), '5,1 km');
  assert.equal(km(21000), '21 km');
});

test('le bouton dit ce qu’il va chercher', () => {
  assert.equal(libelleChercher(R), 'Trouver des boucles de 8 km');
  assert.equal(libelleChercher({ ...R, distanceKm: 18 }), 'Trouver des parcours en tours de 18 km');
  assert.equal(libelleChercher({ ...R, distanceKm: null }), 'Trouver des boucles');
  assert.equal(libelleChercher({ ...R, mesure: 'duree', duree: 30, allure: 360 }), 'Trouver des boucles de 5 km');
});

test('le résumé des résultats dit boucles ou tours, à la virgule', () => {
  assert.equal(resumeResultats(4, 5143), '4 boucles autour de 5,1 km');
  assert.equal(resumeResultats(1, 8000), '1 boucle autour de 8 km');
  assert.equal(resumeResultats(2, 18000), '2 parcours en tours autour de 18 km');
  assert.equal(resumeResultats(1, 18000), '1 parcours en tours autour de 18 km');
});

test('la ligne sous le champ : durée probable, tours, ou erreur', () => {
  assert.deepEqual(aideDistance({ ...R, distanceKm: 8, allure: 350 }),
    { texte: 'Environ 47 min à votre allure', erreur: false });
  const long = aideDistance({ ...R, distanceKm: 18, allure: 350 });
  assert.equal(long.erreur, false);
  assert.equal(long.texte, 'Environ 1 h 45 à votre allure. Au-delà de 15 km, Runa propose des parcours en tours.');
  assert.deepEqual(aideDistance({ ...R, distanceKm: null }),
    { texte: 'Entrez une distance entre 1 et 21 km.', erreur: true });
  assert.equal(aideDistance({ ...R, distanceKm: 12, allure: 300 }).texte, 'Environ 1 h à votre allure');
});
