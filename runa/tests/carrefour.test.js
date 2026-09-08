import test from 'node:test';
import assert from 'node:assert/strict';
import { indexerCarrefours, carrefourProche, abreger, nombre, LOIN_M } from '../lib/carrefour.js';

/* Deux rues qui se croisent en (2), plus un bout de rue anonyme. */
function graphe() {
  const noeuds = new Map([
    [1, { lat: 45.5200, lon: -73.5800 }],
    [2, { lat: 45.5230, lon: -73.5800 }],   // le carrefour
    [3, { lat: 45.5260, lon: -73.5800 }],
    [4, { lat: 45.5230, lon: -73.5760 }]
  ]);
  const voisins = new Map([
    [1, [{ vers: 2, m: 300, way: 10 }]],
    [2, [{ vers: 3, m: 300, way: 10 }, { vers: 4, m: 300, way: 20 }]],
    [3, [{ vers: 2, m: 300, way: 10 }]],
    [4, [{ vers: 2, m: 300, way: 20 }]]
  ]);
  const ways = new Map([
    [10, { highway: 'residential', name: 'Rue Saint-Denis' }],
    [20, { highway: 'residential', name: 'Avenue du Mont-Royal Est' }],
    [30, { highway: 'residential' }]            // sans nom
  ]);
  return { noeuds, voisins, ways };
}

test('un carrefour, c’est au moins deux rues de noms différents', () => {
  const c = indexerCarrefours(graphe());
  assert.equal(c.length, 1, 'seul le nœud 2 en est un');
  assert.equal(c[0].noms.length, 2);
});

test('les rues sans nom ne créent pas de carrefour', () => {
  const g = graphe();
  g.ways.set(10, { highway: 'residential' });   // on efface le nom
  assert.equal(indexerCarrefours(g).length, 0);
});

test('le carrefour le plus proche est nommé comme on le dirait', () => {
  const c = indexerCarrefours(graphe());
  const r = carrefourProche(c, { lat: 45.5231, lon: -73.5801 });
  assert.ok(r);
  assert.equal(r.nom, 'Saint-Denis et Mont-Royal Est');
  assert.ok(r.distanceM < 20, `${r.distanceM} m`);
});

test('trop loin, on se tait plutôt que d’envoyer au mauvais coin', () => {
  const c = indexerCarrefours(graphe());
  // Un kilomètre plus au nord : le carrefour existe, mais il ne situe plus.
  assert.equal(carrefourProche(c, { lat: 45.5320, lon: -73.5800 }), null);
});

test('la distance limite est celle qu’on a mesurée, avec de la marge', () => {
  // Pire cas mesuré sur dix positions réelles : 26 m.
  assert.ok(LOIN_M >= 100, 'assez large pour les cas réels');
  assert.ok(LOIN_M <= 400, 'pas au point de désigner le mauvais carrefour');
});

test('rien à indexer ne casse rien', () => {
  assert.deepEqual(indexerCarrefours({ voisins: new Map(), ways: new Map(), noeuds: new Map() }), []);
  assert.equal(carrefourProche([], { lat: 45, lon: -73 }), null);
  assert.equal(carrefourProche(null, { lat: 45, lon: -73 }), null);
  assert.equal(carrefourProche([{ lat: 45, lon: -73, noms: ['a', 'b'] }], null), null);
});

test('on abrège le type de voie, pas le nom', () => {
  assert.equal(abreger('Rue Marie-Anne Est'), 'Marie-Anne Est');
  assert.equal(abreger('Avenue du Mont-Royal Est'), 'Mont-Royal Est');
  assert.equal(abreger('Rue de la Roquette'), 'Roquette');
  assert.equal(abreger('Avenue des Pins'), 'Pins');
  assert.equal(abreger('Boulevard Saint-Joseph'), 'Saint-Joseph');
  // Un nom qui n'est QUE son type garde son nom entier.
  assert.equal(abreger('Promenade'), 'Promenade');
  assert.equal(abreger('Chemin'), 'Chemin');
  // Ce qui ne commence pas par un type de voie ne bouge pas.
  assert.equal(abreger('Côte-des-Neiges'), 'Côte-des-Neiges');
});

test('les nombres s’écrivent à la française dans l’image', () => {
  assert.equal(nombre(1.87), '1,9');
  assert.equal(nombre(4.63, 2), '4,63');
  assert.equal(nombre(12), '12,0');
});
