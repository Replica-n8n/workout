import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echellePour, ECHELLE_MIN, ECHELLE_MAX } from '../js/carte.js';

test('une boucle de 2 km tient dans un écran de téléphone', () => {
  // 360 x 430 px pour 2000 x 1500 m : environ 0,15 pixel par mètre.
  const e = echellePour(360, 430, 2000, 1500);
  assert.ok(e > 0.1 && e < 0.25, `échelle ${e.toFixed(3)}`);
  // Le tracé, marge comprise, doit rentrer dans les deux sens.
  assert.ok(2000 * e <= 360 && 1500 * e <= 430);
});

test('l’échelle ne devient JAMAIS négative, même sur une carte écrasée', () => {
  // ⚠️ Le bug vu en vrai : en paysage, le panneau ne laissait que 62 px de
  // haut à la carte. 62 moins deux marges de 28 fait 6, mais 40 px de haut
  // donnaient une place négative, une échelle négative, et un canvas qui
  // lève « The radius provided is negative » en effaçant toute la carte.
  for (const h of [0, 5, 20, 40, 56, 62, 100]) {
    const e = echellePour(360, h, 2000, 1500);
    assert.ok(e > 0, `hauteur ${h} px : échelle ${e}`);
    assert.ok(Number.isFinite(e), `hauteur ${h} px : échelle non finie`);
    assert.ok(e >= ECHELLE_MIN, `hauteur ${h} px : échelle sous le plancher`);
  }
});

test('un tracé de taille nulle ne fait pas exploser le zoom', () => {
  // Une boucle réduite à un point, ou une carte pas encore mesurée.
  const e = echellePour(360, 430, 0, 0);
  assert.ok(e <= ECHELLE_MAX, `échelle ${e}`);
  assert.ok(e > 0);
});

test('des dimensions absurdes retombent sur le plancher', () => {
  assert.equal(echellePour(NaN, 430, 2000, 1500), ECHELLE_MIN);
  assert.ok(echellePour(360, 430, Infinity, 1500) >= ECHELLE_MIN);
});
