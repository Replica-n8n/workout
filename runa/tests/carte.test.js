import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echellePour, ECHELLE_MIN, ECHELLE_MAX, Carte } from '../js/carte.js';

/* Le canevas n'existe pas hors navigateur. On en pose juste assez pour que
   `Carte` puisse dessiner dans le vide : ce qu'on vérifie ici, c'est l'état
   qu'elle garde, pas les pixels qu'elle produit. */
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
globalThis.window = { devicePixelRatio: 1 };
globalThis.addEventListener = () => {};
const rien = new Proxy(function () {}, {
  get: (c, k) => (k === 'canvas' ? {} : rien),
  apply: () => rien
});
function fausseCarte() {
  return new Carte({
    width: 360, height: 640,
    getContext: () => rien,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ width: 360, height: 640 })
  });
}

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

test('changer de parcours efface le surlignage et la flèche', () => {
  /* Le défaut vu sur un Pixel 9a : en passant d'une boucle à l'autre, la
     flèche jaune de la précédente restait quelques secondes par-dessus le
     nouveau tracé, en indiquant un sens qui n'était plus le bon. Elle ne
     disparaîssait qu'à la relevée GPS suivante. */
  const c = fausseCarte();
  const boucle = { points: [{ lat: 45.52, lon: -73.58 }, { lat: 45.53, lon: -73.57 },
                            { lat: 45.52, lon: -73.56 }] };
  c.montrer(boucle, { lat: 45.52, lon: -73.58 });
  c.suivre({ lat: 45.522, lon: -73.578 }, boucle.points);
  assert.ok(c.restant, 'le surlignage doit exister avant');

  c.montrer({ points: [{ lat: 45.50, lon: -73.60 }, { lat: 45.51, lon: -73.59 },
                       { lat: 45.50, lon: -73.58 }] }, { lat: 45.50, lon: -73.60 });
  assert.equal(c.restant, null);
  assert.equal(c.pointe, null);
  assert.equal(c.moi, null);
});

test('les couches du quartier ne se dessinent pas sur l’écran de choix', () => {
  const c = fausseCarte();
  assert.equal(c.quartier, false, 'elles sont éteintes par défaut');
  c.poserOrigine({ lat: 45.52, lon: -73.58 });
  c.poserTerrain([[{ lat: 45.52, lon: -73.58 }, { lat: 45.53, lon: -73.57 },
                   { lat: 45.52, lon: -73.56 }]]);
  assert.ok(c.terrain, 'le terrain se construit même éteint');
});

test('un terrain vide ou dégénéré ne laisse pas de chemin fantôme', () => {
  const c = fausseCarte();
  c.poserOrigine({ lat: 45.52, lon: -73.58 });
  c.poserTerrain([]);
  assert.equal(c.terrain, null);
  c.poserTerrain([[{ lat: 45.52, lon: -73.58 }]]);
  assert.equal(c.terrain, null, 'deux points ne font pas une surface');
});

test('le cap de la flèche se prend sur une distance, pas sur 4 points', () => {
  /* Mesuré sur une vraie boucle : quatre points couvraient de 8 à 208 m selon
     l'endroit, et le cap qui en sortait s'écartait jusqu'à 80° de la
     direction du trait. La tête paraissait collée de travers. */
  const c = fausseCarte();
  c.poserOrigine({ lat: 45.52, lon: -73.58 });

  /* Un tracé qui monte plein nord sur 100 m, avec quatre points très
     rapprochés au bout : les quatre derniers ne couvrent que 3 m. */
  const ky = 6371008.8 * Math.PI / 180;
  const nord = m => ({ lat: 45.52 + m / ky, lon: -73.58 });
  const points = [nord(0), nord(50), nord(97), nord(98), nord(99), nord(100)];

  c.suivre({ lat: 45.52, lon: -73.58 }, points);
  assert.ok(c.pointe, 'la pointe doit exister');

  // Plein nord : y décroît vers le haut, donc l'angle vaut -π/2.
  assert.ok(Math.abs(c.pointe.ang + Math.PI / 2) < 0.05,
    `cap ${(c.pointe.ang * 180 / Math.PI).toFixed(0)}° au lieu de -90°`);
});

test('un coude juste avant le bout ne fait pas pivoter la tête', () => {
  const c = fausseCarte();
  c.poserOrigine({ lat: 45.52, lon: -73.58 });
  const ky = 6371008.8 * Math.PI / 180;
  const kx = ky * Math.cos(45.52 * Math.PI / 180);
  const p = (x, y) => ({ lat: 45.52 + y / ky, lon: -73.58 + x / kx });

  /* Cent mètres vers l'est, puis un crochet de 4 m vers le nord au bout. */
  const points = [p(0, 0), p(60, 0), p(100, 0), p(102, 0), p(104, 0), p(104, 4)];
  c.suivre({ lat: 45.52, lon: -73.58 }, points);
  const deg = c.pointe.ang * 180 / Math.PI;
  // Le crochet final ne pese que 4 m sur les 25 lus : le cap reste vers l'est.
  assert.ok(Math.abs(deg) < 25, `cap ${deg.toFixed(0)}°, la tête a pivoté`);
});
