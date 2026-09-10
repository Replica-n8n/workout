import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soleil, feraNuit, minutesDeJour } from '../lib/soleil.js';

/* Les heures de référence viennent d'éphémérides publiques. On tolère cinq
   minutes : la formule est une approximation, et personne ne choisit son
   parcours à la minute près. Ce qui compte est qu'elle ne se trompe ni de
   jour, ni d'heure, ni d'hémisphère. */
const TOLERANCE_MIN = 5;

/** L'écart en minutes avec un instant UTC donné en clair. */
function ecartAvec(date, iso) {
  return Math.abs(date.getTime() - new Date(iso).getTime()) / 60000;
}

test('Montréal au solstice d’été', () => {
  /* 21 juin 2026 : lever 05:06 et coucher 20:47 heure locale, soit 09:06 UTC
     et 00:47 UTC le lendemain.
     ⚠️ J'avais d'abord écrit 09:15 de mémoire, et le test échouait alors que
     le calcul était juste à la minute près. Une valeur de référence se
     vérifie, elle ne se récite pas. */
  const s = soleil({ lat: 45.5230, lon: -73.5800 }, new Date('2026-06-21T12:00:00Z'));
  assert.ok(s, 'aucune réponse pour Montréal en juin');
  assert.ok(ecartAvec(s.lever, '2026-06-21T09:06:00Z') <= TOLERANCE_MIN,
    `lever à ${s.lever.toISOString()}`);
  assert.ok(ecartAvec(s.coucher, '2026-06-22T00:47:00Z') <= TOLERANCE_MIN,
    `coucher à ${s.coucher.toISOString()}`);
});

test('Paris au solstice d’été, deuxième témoin', () => {
  /* Une seule ville ne prouve rien : une erreur de longitude se verrait mal
     à un seul endroit. Paris, 21 juin 2026 : 05:47 et 21:58 heure locale. */
  const s = soleil({ lat: 48.8566, lon: 2.3522 }, new Date('2026-06-21T12:00:00Z'));
  assert.ok(s);
  assert.ok(ecartAvec(s.lever, '2026-06-21T03:47:00Z') <= TOLERANCE_MIN,
    `lever à ${s.lever.toISOString()}`);
  assert.ok(ecartAvec(s.coucher, '2026-06-21T19:58:00Z') <= TOLERANCE_MIN,
    `coucher à ${s.coucher.toISOString()}`);
});

test('Montréal au solstice d’hiver : le jour est court', () => {
  const s = soleil({ lat: 45.5230, lon: -73.5800 }, new Date('2026-12-21T12:00:00Z'));
  assert.ok(s);
  const heures = (s.coucher - s.lever) / 3600000;
  assert.ok(heures > 8 && heures < 9, `${heures.toFixed(1)} h de jour en décembre`);
});

test('l’hémisphère sud est à l’envers', () => {
  /* Sydney en décembre est en été : le jour doit y être LONG au moment où il
     est court à Montréal. Une erreur de signe sur la latitude passerait
     inaperçue avec un seul hémisphère. */
  const sud = soleil({ lat: -33.87, lon: 151.21 }, new Date('2026-12-21T02:00:00Z'));
  assert.ok(sud);
  const heures = (sud.coucher - sud.lever) / 3600000;
  assert.ok(heures > 14, `Sydney : ${heures.toFixed(1)} h de jour en décembre`);
});

test('au-delà du cercle polaire, la question n’a pas de réponse', () => {
  /* ⚠️ Rendre `null` est le comportement voulu, pas un échec : imposer le
     mode nuit à Tromsø un jour de soleil de minuit serait faux. */
  assert.equal(soleil({ lat: 78.2, lon: 15.6 }, new Date('2026-06-21T12:00:00Z')), null);
  assert.equal(soleil({ lat: 78.2, lon: 15.6 }, new Date('2026-12-21T12:00:00Z')), null);
});

test('une position absente ne fait rien planter', () => {
  assert.equal(soleil(null), null);
  assert.equal(soleil({ lat: NaN, lon: 0 }), null);
  assert.equal(minutesDeJour(null), null);
  assert.equal(feraNuit(null, 30), false);
});

test('feraNuit regarde la FIN de la sortie, pas son début', () => {
  const lieu = { lat: 45.5230, lon: -73.5800 };
  const s = soleil(lieu, new Date('2026-10-15T18:00:00Z'));
  assert.ok(s);

  /* Deux heures avant le coucher, une sortie de dix minutes reste au jour. */
  const tot = new Date(s.coucher.getTime() - 120 * 60000);
  assert.equal(feraNuit(lieu, 10, tot), false, 'nuit annoncée deux heures avant le coucher');

  /* Le même départ, mais deux heures de course : on rentre dans le noir. */
  assert.equal(feraNuit(lieu, 120, tot), true, 'une sortie qui finit après le coucher');
});

test('feraNuit est vrai avant le lever', () => {
  const lieu = { lat: 45.5230, lon: -73.5800 };
  const s = soleil(lieu, new Date('2026-01-15T12:00:00Z'));
  const avant = new Date(s.lever.getTime() - 60 * 60000);
  assert.equal(feraNuit(lieu, 30, avant), true, 'une sortie avant le lever du soleil');
});

test('minutesDeJour décroît au fil de l’après-midi', () => {
  const lieu = { lat: 48.8600, lon: 2.3800 };
  const t = new Date('2026-05-10T14:00:00Z');
  const a = minutesDeJour(lieu, t);
  const b = minutesDeJour(lieu, new Date(t.getTime() + 60 * 60000));
  assert.ok(a > 0 && b > 0);
  assert.ok(Math.abs((a - b) - 60) <= 1, `${a} puis ${b} : l’écart devrait être 60 min`);
});
