import test from 'node:test';
import assert from 'node:assert/strict';
import { partInedite, metresInedits, Territoire, classer, PAS_M } from '../lib/score.js';

/* Un graphe minuscule écrit à la main : trois arêtes, trois rues. */
function petitGraphe() {
  const voisins = new Map([
    [1, [{ vers: 2, m: 100, way: 10 }]],
    [2, [{ vers: 3, m: 200, way: 20 }]],
    [3, [{ vers: 4, m: 700, way: 30 }]]
  ]);
  return { voisins, noeuds: new Map(), ways: new Map() };
}
const boucle = { noeuds: [1, 2, 3, 4], m: 1000, points: [] };

test('partInedite compte les mètres parcourus, pas les rues', () => {
  const g = petitGraphe();
  assert.equal(partInedite(g, boucle, new Set()), 1);
  assert.equal(partInedite(g, boucle, new Set([10])), 0.9);
  assert.equal(partInedite(g, boucle, new Set([10, 20, 30])), 0);
});

test('une rue longue prise sur un court tronçon ne dépasse pas 100 %', () => {
  /* Le défaut qu'on a eu : compter la longueur ENTIÈRE du way donnait des
     parts inédites de 151 %. La part se mesure sur le trajet. */
  const g = petitGraphe();
  g.ways.set(30, { highway: 'primary', longueurTotale: 9000 });
  assert.ok(partInedite(g, boucle, new Set()) <= 1);
});

test('metresInedits donne des mètres, pas une fraction', () => {
  const g = petitGraphe();
  assert.equal(metresInedits(g, boucle, new Set([20])), 800);
});

test('une boucle sans arête connue ne vaut pas NaN', () => {
  const g = { voisins: new Map(), noeuds: new Map(), ways: new Map() };
  assert.equal(partInedite(g, boucle, new Set()), 0);
});

/* ------------------------------------------------------------ territoire */

const ANCRE = { lat: 45.5230, lon: -73.5800 };
const R = 6371008.8, RAD = Math.PI / 180;

/** Un carré de `cote` mètres centré sur l'ancre, en lat/lon. */
function carre(cote, decalageM = 0) {
  const kx = R * RAD * Math.cos(ANCRE.lat * RAD), ky = R * RAD;
  const d = cote / 2;
  return [[-d, -d], [d, -d], [d, d], [-d, d]].map(([x, y]) => ({
    lat: ANCRE.lat + y / ky, lon: ANCRE.lon + (x + decalageM) / kx
  }));
}

test('un carré de 200 m enferme 4 hectares, à une case près', () => {
  const t = new Territoire(ANCRE, 1000);
  const a = t.ajouter(carre(200));
  assert.ok(Math.abs(a - 40000) < 40000 * 0.05, `mesuré ${a} m²`);
  assert.equal(t.m2(), a);
});

test('repasser au même endroit n’ajoute rien', () => {
  const t = new Territoire(ANCRE, 1000);
  const premier = t.ajouter(carre(200));
  assert.equal(t.ajouter(carre(200)), 0);
  assert.equal(t.m2(), premier);
});

test('deux carrés qui se chevauchent ne comptent pas deux fois', () => {
  const t = new Territoire(ANCRE, 1000);
  t.ajouter(carre(200));
  const ajout = t.ajouter(carre(200, 100));   // moitié dedans, moitié dehors
  assert.ok(ajout > 0, 'la moitié neuve doit compter');
  assert.ok(Math.abs(t.m2() - 60000) < 60000 * 0.06, `mesuré ${t.m2()} m²`);
});

test('gain annonce sans peindre', () => {
  const t = new Territoire(ANCRE, 1000);
  const promis = t.gain(carre(200));
  assert.equal(t.m2(), 0, 'gain ne doit rien changer');
  assert.equal(t.ajouter(carre(200)), promis);
});

test('un tracé dégénéré ne casse rien', () => {
  const t = new Territoire(ANCRE, 1000);
  assert.equal(t.ajouter([]), 0);
  assert.equal(t.ajouter(null), 0);
  assert.equal(t.ajouter([{ lat: ANCRE.lat, lon: ANCRE.lon }]), 0);
});

test('ce qui sort du plateau est ignoré, sans déborder du tableau', () => {
  const t = new Territoire(ANCRE, 300);      // plateau plus petit que le carré
  const a = t.ajouter(carre(2000));
  assert.ok(a > 0);
  assert.ok(a <= 600 * 600, 'ne peut pas dépasser la surface du plateau');
  assert.equal(t.cases.length, t.n * t.n);
});

/* ------------------------------------------------------------- classement */

function candidate(nom, m, noeuds, points) {
  return { nom, m, noeuds, points, ways: new Set(), feux: 0, rues: [] };
}

test('découverte et conquête ne choisissent pas la même boucle', () => {
  const voisins = new Map([
    [1, [{ vers: 2, m: 1000, way: 1 }]],     // A : rues neuves, petit tour
    [3, [{ vers: 4, m: 1000, way: 9 }]]      // B : rue déjà courue, grand tour
  ]);
  const graphe = { voisins, noeuds: new Map(), ways: new Map() };
  const A = candidate('A', 1000, [1, 2], carre(100));
  const B = candidate('B', 1000, [3, 4], carre(600));
  const t = new Territoire(ANCRE, 2000);

  const dec = classer([A, B], { mode: 'decouverte', graphe, dejaCourues: new Set([9]),
                                territoire: t, distanceCible: 1000, combien: 1 });
  const con = classer([A, B], { mode: 'conquete', graphe, dejaCourues: new Set([9]),
                                territoire: t, distanceCible: 1000, combien: 1 });
  assert.equal(dec[0].b.nom, 'A');
  assert.equal(con[0].b.nom, 'B');
});

test('à score égal, la bonne longueur l’emporte', () => {
  const graphe = { voisins: new Map(), noeuds: new Map(), ways: new Map() };
  const loin = candidate('loin', 6000, [], []);
  const juste = candidate('juste', 5050, [], []);
  const r = classer([loin, juste], { mode: 'decouverte', graphe,
    dejaCourues: new Set(), territoire: null, distanceCible: 5000, combien: 2 });
  assert.equal(r[0].b.nom, 'juste');
});

test('classer ne rend jamais plus que demandé', () => {
  const graphe = { voisins: new Map(), noeuds: new Map(), ways: new Map() };
  const cinq = [1, 2, 3, 4, 5].map(i => candidate('b' + i, 5000 + i, [], []));
  assert.equal(classer(cinq, { mode: 'decouverte', graphe, dejaCourues: new Set(),
    territoire: null, distanceCible: 5000 }).length, 3);
});

test('la trame reste sous le mégaoctet', () => {
  const t = new Territoire(ANCRE);
  assert.ok(t.cases.length <= 1e6, `${t.cases.length} cases`);
  assert.equal(PAS_M, 10);
});

test('une boucle trop longue est écartée, même si elle découvre plus', () => {
  /* Le défaut vu au premier essai en vrai : 5,69 km proposés pour 5,0
     demandés, parce que plus long veut dire plus de mètres inédits. */
  const voisins = new Map([
    [1, [{ vers: 2, m: 5000, way: 1 }]],
    [3, [{ vers: 4, m: 6200, way: 2 }]]
  ]);
  const graphe = { voisins, noeuds: new Map(), ways: new Map() };
  const juste = candidate('juste', 5000, [1, 2], []);
  const longue = candidate('longue', 6200, [3, 4], []);
  const r = classer([longue, juste], { mode: 'decouverte', graphe,
    dejaCourues: new Set(), territoire: null, distanceCible: 5000, combien: 1 });
  assert.equal(r[0].b.nom, 'juste');
});

test('si aucune ne tombe dans la fourchette, on propose quand même', () => {
  const graphe = { voisins: new Map(), noeuds: new Map(), ways: new Map() };
  const a = candidate('a', 7000, [], []), b = candidate('b', 8000, [], []);
  const r = classer([b, a], { mode: 'decouverte', graphe, dejaCourues: new Set(),
    territoire: null, distanceCible: 5000, combien: 2 });
  assert.equal(r.length, 2);
  assert.equal(r[0].b.nom, 'a', 'la moins mauvaise en tête');
});

test('la conquête non plus ne gagne pas en allongeant', () => {
  const graphe = { voisins: new Map(), noeuds: new Map(), ways: new Map() };
  const t = new Territoire(ANCRE, 3000);
  const juste = candidate('juste', 5000, [], carre(300));
  const longue = candidate('longue', 6500, [], carre(1200));
  const r = classer([longue, juste], { mode: 'conquete', graphe,
    dejaCourues: new Set(), territoire: t, distanceCible: 5000, combien: 1 });
  assert.equal(r[0].b.nom, 'juste');
});
