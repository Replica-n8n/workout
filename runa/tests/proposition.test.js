import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirProposition } from '../lib/proposition.js';

const simple = feux => ({ genre: 'simple', feux });
const parc = feux => ({ genre: 'parc', feux });

test('une seule proposition, jamais deux', () => {
  /* Cinq cartes écrasaient la carte de 332 à 249 px sur son écran. */
  const c = choisirProposition([simple(8), parc(16)]);
  assert.ok(c && !Array.isArray(c));
});

test('la moins allumée gagne', () => {
  assert.equal(choisirProposition([simple(8), parc(16)]).genre, 'simple');
  assert.equal(choisirProposition([simple(20), parc(16)]).genre, 'parc');
});

test('à feux égaux, le parc passe devant', () => {
  assert.equal(choisirProposition([simple(10), parc(10)]).genre, 'parc');
});

test('« Autres parcours » montre l’AUTRE', () => {
  /* Le défaut signalé : on voyait toujours la même quatrième carte. */
  assert.equal(choisirProposition([simple(8), parc(16)], 'simple').genre, 'parc');
  assert.equal(choisirProposition([simple(8), parc(16)], 'parc').genre, 'simple');
});

test('s’il n’y en a qu’une, c’est elle, même en demandant l’autre', () => {
  assert.equal(choisirProposition([parc(16)], 'parc').genre, 'parc');
  assert.equal(choisirProposition([null, simple(3)]).genre, 'simple');
});

test('rien, c’est rien', () => {
  assert.equal(choisirProposition([]), null);
  assert.equal(choisirProposition(null), null);
});
