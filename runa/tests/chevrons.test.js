import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placerChevrons, pasPour, ECART_PX } from '../lib/chevrons.js';

/* Un carré de 1 km de côté, parcouru dans le sens des aiguilles d'une
   montre sur l'écran (y vers le bas), échantillonné tous les 10 m. */
function carre() {
  const coins = [[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]];
  const pts = [];
  for (let c = 1; c < coins.length; c++) {
    const [x0, y0] = coins[c - 1], [x1, y1] = coins[c];
    for (let k = 0; k < 100; k++) pts.push({ x: x0 + (x1 - x0) * k / 100, y: y0 + (y1 - y0) * k / 100 });
  }
  pts.push({ x: 0, y: 0 });
  return pts;
}

const proche = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.05;

test('un chevron tous les « pas » mètres, le long du tracé', () => {
  const c = placerChevrons(carre(), 200);
  /* 4 km de tour, un chevron tous les 200 m : vingt. */
  assert.equal(c.length, 20);
});

test('les chevrons suivent le sens du tracé', () => {
  const c = placerChevrons(carre(), 200);
  /* Le premier est à 100 m sur le premier côté, qui va vers la droite. */
  assert.ok(proche(c[0].ang, 0), `premier chevron orienté à ${c[0].ang}`);
  /* Sur le deuxième côté, on descend : +90°, y vers le bas. */
  const bas = c.find(k => Math.abs(k.x - 1000) < 1 && k.y > 100 && k.y < 900);
  assert.ok(bas && proche(bas.ang, Math.PI / 2), 'le deuxième côté ne descend pas');
});

test('à rebours, les chevrons se retournent', () => {
  const a = placerChevrons(carre(), 200);
  const b = placerChevrons(carre(), 200, { sens: -1 });
  const pa = a.find(k => Math.abs(k.y) < 1 && k.x > 50 && k.x < 150);
  const pb = b.find(k => Math.abs(k.y) < 1 && k.x > 50 && k.x < 150);
  assert.ok(pa && pb);
  assert.ok(proche(pb.ang, pa.ang + Math.PI), 'le sens n’a pas été inversé');
});

/* L'accès d'une sortie au parc : 300 m tout droit, un tour, et retour par les
   mêmes 300 m. */
function allerRetour() {
  const pts = [];
  for (let k = 0; k <= 30; k++) pts.push({ x: 0, y: -k * 10 });
  for (let k = 1; k < 200; k++) {
    const t = 2 * Math.PI * k / 200;
    pts.push({ x: 300 * Math.sin(t), y: -300 - 300 * (1 - Math.cos(t)) });
  }
  pts.push({ x: 0, y: -300 });
  for (let k = 29; k >= 0; k--) pts.push({ x: 0, y: -k * 10 });
  return pts;
}

test('jamais deux chevrons contraires sur la même rue', () => {
  /* ⚠️ Sans tri, l'accès portait une flèche dans chaque sens : celle de
     l'aller et celle du retour, au même endroit. */
  const c = placerChevrons(allerRetour(), 100);
  const surAcces = c.filter(k => Math.abs(k.x) < 1 && k.y > -300 && k.y < 0);
  for (const a of surAcces) {
    for (const b of surAcces) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 50, 'deux chevrons empilés sur l’accès');
    }
  }
});

test('hors course, l’accès pointe vers le parc ; sur le retour, vers la maison', () => {
  const pts = allerRetour();
  const n = pts.length;
  const surAcces = c => c.filter(k => Math.abs(k.x) < 1 && k.y > -280 && k.y < -20);

  /* Hors course, on part du début : les chevrons de l'accès montent vers le
     parc (y décroissant, donc angle -90°). */
  const aller = surAcces(placerChevrons(pts, 100));
  assert.ok(aller.length > 0);
  for (const k of aller) assert.ok(proche(k.ang, -Math.PI / 2), 'l’accès ne pointe pas vers le parc');

  /* Sur le retour, ce sont ceux qu'elle va rencontrer : vers la maison. */
  const retour = surAcces(placerChevrons(pts, 100, { depuis: n - 20 }));
  assert.ok(retour.length > 0);
  for (const k of retour) assert.ok(proche(k.ang, Math.PI / 2), 'sur le retour, l’accès pointe encore vers le parc');
});

test('l’espacement ne change qu’à des seuils, et reste lisible', () => {
  /* Pincer pour zoomer ne doit pas faire glisser les chevrons en continu :
     l'espacement reste le même sur toute une plage d'échelles. */
  assert.equal(pasPour(1.0), pasPour(1.1));
  for (const e of [0.05, 0.2, 0.8, 2, 5]) {
    assert.ok(pasPour(e) * e >= ECART_PX || pasPour(e) === 3200, `à ${e} px/m, chevrons trop serrés`);
  }
});

test('rien à placer sur un tracé vide ou trop court', () => {
  assert.deepEqual(placerChevrons([], 100), []);
  assert.deepEqual(placerChevrons([{ x: 0, y: 0 }], 100), []);
  assert.deepEqual(placerChevrons([{ x: 0, y: 0 }, { x: 10, y: 0 }], 100), []);
  assert.deepEqual(placerChevrons(carre(), 0), []);
});

test('un crochet de quelques mètres ne fait pas pivoter le chevron', () => {
  /* ⚠️ La leçon payée par la flèche jaune : prendre le cap sur un nombre de
     points, qui peuvent ne couvrir que deux mètres, l'avait fait partir de
     travers jusqu'à 80°. Un chevron lit la direction sur une distance. */
  const pts = [{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 98, y: -2 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  const c = placerChevrons(pts, 100);
  const au = c.find(k => Math.abs(k.x - 50) < 2 || Math.abs(k.x - 150) < 2);
  assert.ok(au, 'aucun chevron sur le tracé');
  for (const k of c) {
    assert.ok(Math.abs(k.ang) < 0.35, `chevron à ${(k.ang * 180 / Math.PI).toFixed(0)}° sur un tracé qui va vers l’est`);
  }
});
