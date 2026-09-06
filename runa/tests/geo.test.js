import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, capDeg, destination, bbox, longueurM, distancePour } from '../lib/geo.js';

const PARIS = { lat: 48.8566, lon: 2.3522 };

test('distanceM : une valeur connue', () => {
  // Paris - Lyon, 392 km à vol d'oiseau. On tolère 1 km.
  const lyon = { lat: 45.7640, lon: 4.8357 };
  const d = distanceM(PARIS, lyon) / 1000;
  assert.ok(Math.abs(d - 392) < 1, `attendu ~392 km, obtenu ${d.toFixed(1)}`);
});

test('distanceM : un point avec lui-même vaut zéro', () => {
  assert.equal(distanceM(PARIS, PARIS), 0);
});

test('capDeg : plein nord, plein est', () => {
  assert.ok(Math.abs(capDeg(PARIS, { lat: 49.8566, lon: 2.3522 }) - 0) < 0.01);
  assert.ok(Math.abs(capDeg(PARIS, { lat: 48.8566, lon: 3.3522 }) - 90) < 0.5);
});

test('destination : aller puis revenir retombe au départ', () => {
  for (const cap of [0, 45, 137, 270, 359]) {
    const loin = destination(PARIS, 1500, cap);
    assert.ok(Math.abs(distanceM(PARIS, loin) - 1500) < 0.5,
      `à ${cap}° la distance parcourue n'est pas 1500 m`);
    const retour = destination(loin, 1500, (cap + 180) % 360);
    assert.ok(distanceM(PARIS, retour) < 1, 'le retour ne retombe pas au départ');
  }
});

test('bbox : la boîte est plus large en longitude qu’en latitude', () => {
  // C'est tout l'objet de la correction par le cosinus : sans elle, la boîte
  // serait carrée en degrés, donc trop étroite en mètres d'est en ouest.
  const b = bbox(PARIS, 1000);
  const hauteur = distanceM({ lat: b.sud, lon: PARIS.lon }, { lat: b.nord, lon: PARIS.lon });
  const largeur = distanceM({ lat: PARIS.lat, lon: b.ouest }, { lat: PARIS.lat, lon: b.est });
  assert.ok(Math.abs(hauteur - 2000) < 5, `hauteur ${hauteur.toFixed(0)} m`);
  assert.ok(Math.abs(largeur - 2000) < 5, `largeur ${largeur.toFixed(0)} m`);
  assert.ok((b.est - b.ouest) > (b.nord - b.sud) * 1.4, 'la boîte devrait être plus large en degrés');
});

test('longueurM : trois points alignés', () => {
  const a = PARIS;
  const b = destination(a, 300, 90);
  const c = destination(b, 200, 90);
  assert.ok(Math.abs(longueurM([a, b, c]) - 500) < 1);
});

test('distancePour : 35 minutes à 6 min/km font 5,8 km', () => {
  const m = distancePour(35 * 60, 6 * 60);
  assert.ok(Math.abs(m - 5833) < 5, `obtenu ${m.toFixed(0)} m`);
});
