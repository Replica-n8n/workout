import test from 'node:test';
import assert from 'node:assert/strict';
import { recoller, surLaRue, meilleurTroncon, Place, placerLesRues } from '../lib/etiquettes.js';

/* ------------------------------------------------------------- recoller */

test('les morceaux d’une même rue se recollent en une chaîne', () => {
  /* Le défaut mesuré : OSM découpe une rue à chaque carrefour, et chercher
     le plus long tronçon droit morceau par morceau ne posait que 8
     étiquettes sur 53, aucun bout n'étant plus long que son propre nom. */
  const a = [[0, 0], [100, 0]], b = [[100, 0], [200, 0]], c = [[200, 0], [300, 0]];
  const ch = recoller([b, a, c]);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].length, 4);
  assert.deepEqual(ch[0][0], [0, 0]);
  assert.deepEqual(ch[0][3], [300, 0]);
});

test('un morceau à l’envers se retourne', () => {
  const ch = recoller([[[0, 0], [100, 0]], [[200, 0], [100, 0]]]);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].length, 3);
});

test('deux rues du même nom mais séparées restent deux chaînes', () => {
  const ch = recoller([[[0, 0], [100, 0]], [[500, 0], [600, 0]]]);
  assert.equal(ch.length, 2);
});

/* ------------------------------------------------------------ surLaRue */

test('le point du milieu est sur la rue, pas sur la corde', () => {
  /* Une rue coudée : le milieu de la corde tombe à côté de la chaussée. */
  const pts = [[0, 0], [100, 0], [100, 100]];
  const m = surLaRue(pts, 0, 2, 0.5);
  assert.deepEqual(m, [100, 0], 'le milieu par la longueur est le coude');
  const corde = [(0 + 100) / 2, (0 + 100) / 2];
  assert.notDeepEqual(m, corde);
});

test('les extrémités sont les extrémités', () => {
  const pts = [[0, 0], [50, 0], [100, 0]];
  assert.deepEqual(surLaRue(pts, 0, 2, 0), [0, 0]);
  assert.deepEqual(surLaRue(pts, 0, 2, 1).map(Math.round), [100, 0]);
});

/* ------------------------------------------------------ meilleurTroncon */

test('l’angle suit la direction d’ensemble, pas le premier segment', () => {
  /* Le défaut vu à l'oeil : « Avenue De Gaspé » partait de travers alors que
     « Avenue Casgrain », parfaitement droite, suivait sa rue. La cause était
     l'angle du PREMIER segment. */
  const pts = [[0, 0], [10, 30], [100, 60], [200, 90]];   // un coude au départ
  const t = meilleurTroncon(pts);
  const premier = Math.atan2(30, 10);
  assert.ok(Math.abs(t.angle - premier) > 0.3, 'ne doit pas être l’angle du premier segment');
  assert.ok(Math.abs(t.angle - Math.atan2(90, 200)) < 0.35, `angle ${t.angle}`);
});

test('une droite parfaite garde son angle', () => {
  const t = meilleurTroncon([[0, 0], [100, 100], [200, 200]]);
  assert.ok(Math.abs(t.angle - Math.PI / 4) < 1e-6);
  assert.ok(Math.abs(t.L - Math.hypot(200, 200)) < 1e-6);
});

test('un tracé dégénéré ne casse rien', () => {
  assert.equal(meilleurTroncon([]), null);
  assert.equal(meilleurTroncon([[0, 0]]), null);
  assert.equal(meilleurTroncon(null), null);
});

/* --------------------------------------------------------------- Place */

test('deux étiquettes ne se marchent pas dessus', () => {
  const p = new Place(500, 500);
  assert.ok(p.poser(100, 100, 120, 30));
  assert.ok(!p.poser(110, 100, 120, 30), 'la seconde chevauche la première');
  assert.ok(p.poser(400, 400, 120, 30), 'ailleurs, la place est libre');
});

test('une étiquette qui déborde du cadre est refusée', () => {
  const p = new Place(500, 500);
  assert.ok(!p.poser(10, 250, 200, 30), 'sort par la gauche');
  assert.ok(!p.poser(250, 5, 200, 30), 'sort par le haut');
});

/* ------------------------------------------------------ placerLesRues */

const largeurDe = t => t.length * 11;

test('les rues longues passent avant les ruelles', () => {
  /* Deux rues au même endroit : une seule tiendra, et ce doit être la plus
     longue, celle qui sert de repère. */
  const parNom = new Map([
    ['Avenue du Mont-Royal', [[[100, 300], [900, 300]]]],
    ['Ruelle', [[[400, 295], [500, 295]]]]
  ]);
  const posees = placerLesRues(parNom, new Place(1000, 600), largeurDe);
  assert.equal(posees.length, 1);
  assert.equal(posees[0].texte, 'Avenue du Mont-Royal');
});

test('un nom jamais à l’envers', () => {
  // Une rue orientée vers la gauche : le texte doit être retourné.
  const parNom = new Map([['Rue Test', [[[900, 300], [100, 300]]]]]);
  const [l] = placerLesRues(parNom, new Place(1000, 600), largeurDe);
  assert.ok(Math.abs(l.angle) <= Math.PI / 2 + 1e-9, `angle ${l.angle}`);
});

test('une rue trop courte pour son nom n’est pas nommée', () => {
  const parNom = new Map([['Boulevard Interminable', [[[500, 300], [520, 300]]]]]);
  assert.equal(placerLesRues(parNom, new Place(1000, 600), largeurDe).length, 0);
});

test('une longue rue est nommée deux fois, jamais trois', () => {
  const parNom = new Map([['Rue Longue', [[[20, 100], [980, 100]], [[20, 500], [980, 500]]]]]);
  const posees = placerLesRues(parNom, new Place(1000, 600), largeurDe, { ecartMinimal: 200 });
  assert.ok(posees.length <= 2, `${posees.length} étiquettes`);
});

test('rien à placer ne casse rien', () => {
  assert.deepEqual(placerLesRues(new Map(), new Place(100, 100), largeurDe), []);
});
