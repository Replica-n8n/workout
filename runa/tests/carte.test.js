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

test('changer de parcours efface le surlignage et les chevrons de l’autre', () => {
  /* Le défaut vu sur un Pixel 9a : en passant d'une boucle à l'autre, le
     sens de la précédente restait quelques secondes par-dessus le nouveau
     tracé, en indiquant une direction qui n'était plus la bonne. Il ne
     disparaissait qu'à la relevée GPS suivante. La flèche jaune a laissé la
     place aux chevrons, la règle reste la même. */
  const c = fausseCarte();
  const boucle = { points: [{ lat: 45.52, lon: -73.58 }, { lat: 45.53, lon: -73.57 },
                            { lat: 45.52, lon: -73.56 }] };
  c.montrer(boucle, { lat: 45.52, lon: -73.58 });
  c.suivre({ lat: 45.522, lon: -73.578 }, boucle.points, { indice: 1, sens: -1 });
  assert.ok(c.restant, 'le surlignage doit exister avant');
  const anciens = c.chevrons;

  c.montrer({ points: [{ lat: 45.50, lon: -73.60 }, { lat: 45.51, lon: -73.59 },
                       { lat: 45.50, lon: -73.58 }] }, { lat: 45.50, lon: -73.60 });
  assert.equal(c.restant, null);
  /* `montrer` redessine aussitôt, et le dessin repose les chevrons : ils ne
     sont donc pas vides, ils doivent être NEUFS. */
  assert.notEqual(c.chevrons, anciens, 'les chevrons de l’ancien tracé sont restés');
  assert.equal(c.suiviSens, 1, 'le sens de l’ancienne course est resté');
  assert.equal(c.suiviIndice, null);
  assert.equal(c.moi, null);
});

test('la tête jaune a disparu, pour de bon', () => {
  /* Trop longue, elle sortait du tracé ; raccourcie, elle ne faisait plus
     que 10 px de large sur un trait de 7 et on ne la voyait plus. Elle a été
     remplacée par des chevrons le long de tout le tracé. Si elle revenait,
     les deux diraient le sens en même temps. */
  const c = fausseCarte();
  const boucle = { points: [{ lat: 45.52, lon: -73.58 }, { lat: 45.53, lon: -73.57 },
                            { lat: 45.52, lon: -73.56 }] };
  c.montrer(boucle, { lat: 45.52, lon: -73.58 });
  c.suivre({ lat: 45.522, lon: -73.578 }, boucle.points, { indice: 0 });
  assert.equal(c.pointe, undefined);
  assert.equal(typeof c.reculDe, 'undefined');
});

test('un nouveau relevé qui change le sens repose les chevrons', () => {
  /* Sans ça, courir la boucle à l'envers laissait les chevrons dans le sens
     du tracé, donc à contresens de la coureuse. */
  const c = fausseCarte();
  const boucle = { points: [{ lat: 45.52, lon: -73.58 }, { lat: 45.53, lon: -73.57 },
                            { lat: 45.52, lon: -73.56 }] };
  c.montrer(boucle, { lat: 45.52, lon: -73.58 });
  const marque = { pas: 100, liste: [] };
  c.chevrons = marque;
  c.suivre({ lat: 45.522, lon: -73.578 }, boucle.points, { indice: 1, sens: -1 });
  assert.notEqual(c.chevrons, marque, 'les chevrons n’ont pas été reposés');
  assert.equal(c.suiviSens, -1);
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

/* Les deux tests sur le cap de la flèche jaune vivent désormais dans
   `tests/chevrons.test.js` : un chevron lit sa direction sur une distance
   autour de lui, pour la même raison qu'elle, et un crochet de quelques
   mètres ne doit pas le faire pivoter. */
