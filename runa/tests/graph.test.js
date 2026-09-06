import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, multiplicateur, noeudLePlusProche, plusGrandeComposante, PENALITES }
  from '../lib/graph.js';
import { damier } from './grille.js';

test('le damier donne un graphe complet et non orienté', () => {
  const d = damier({ cotes: 5 });
  const g = construireGraphe(d.osm);

  assert.equal(g.noeuds.size, 25);
  // Un coin a 2 voisins, un bord 3, un noeud intérieur 4.
  assert.equal(g.voisins.get(d.id(0, 0)).length, 2);
  assert.equal(g.voisins.get(d.id(0, 1)).length, 3);
  assert.equal(g.voisins.get(d.id(1, 1)).length, 4);

  // Non orienté : si A voit B, B voit A.
  for (const [a, l] of g.voisins) {
    for (const arete of l) {
      assert.ok(g.voisins.get(arete.vers).some(x => x.vers === a),
        `l'arête ${a} vers ${arete.vers} n'a pas de réciproque`);
    }
  }
});

test('les arêtes du damier mesurent bien 100 m', () => {
  const d = damier({ cotes: 4, pasM: 100 });
  const g = construireGraphe(d.osm);
  for (const [, l] of g.voisins) {
    for (const a of l) assert.ok(Math.abs(a.m - 100) < 0.5, `arête de ${a.m.toFixed(1)} m`);
  }
});

test('sans pénalité, le coût vaut la longueur', () => {
  const d = damier({ cotes: 4 });
  const g = construireGraphe(d.osm);
  for (const [, l] of g.voisins) for (const a of l) assert.equal(a.cout, a.m);
});

test('un grand axe sans trottoir coûte 1,8 fois sa longueur', () => {
  const d = damier({ cotes: 5, tagsLigne: { 2: { highway: 'primary' } } });
  const g = construireGraphe(d.osm);
  const surLaLigne2 = g.voisins.get(d.id(2, 1)).find(a => a.vers === d.id(2, 2));
  assert.ok(Math.abs(surLaLigne2.cout - surLaLigne2.m * 1.8) < 0.01);
});

test('le même grand axe AVEC trottoir déclaré n’est pas pénalisé', () => {
  const d = damier({ cotes: 5, tagsLigne: { 2: { highway: 'primary', sidewalk: 'both' } } });
  const g = construireGraphe(d.osm);
  const a = g.voisins.get(d.id(2, 1)).find(x => x.vers === d.id(2, 2));
  assert.equal(a.cout, a.m);
});

test('un feu ajoute 25 m au coût des arêtes qui y arrivent', () => {
  const cible = 2 * 1000 + 3;   // ligne 2, colonne 2, id selon grille.js
  const d = damier({ cotes: 5, feux: [cible] });
  const g = construireGraphe(d.osm);
  assert.ok(g.feux.has(cible));

  const versLeFeu = g.voisins.get(d.id(2, 1)).find(a => a.vers === cible);
  assert.ok(Math.abs(versLeFeu.cout - (versLeFeu.m + PENALITES.feuMetresEquivalents)) < 0.01);

  // ...mais pas au coût des arêtes qui en repartent : sinon un feu serait
  // compté deux fois, à l'arrivée puis au départ.
  const depuisLeFeu = g.voisins.get(cible).find(a => a.vers === d.id(2, 1));
  assert.ok(Math.abs(depuisLeFeu.cout - depuisLeFeu.m) < 0.01);
});

test('décocher « éviter les feux » ramène le coût à la longueur', () => {
  // L'option est visible dans l'interface, donc elle doit VRAIMENT agir, et
  // sur les deux pénalités que son libellé annonce : les feux et les grands
  // axes. Une case à cocher qui ne change rien est le pire des défauts,
  // parce que rien ne le signale.
  const cible = 2 * 1000 + 3;
  const d = damier({ cotes: 5, feux: [cible], tagsLigne: { 0: { highway: 'primary' } } });

  const avec = construireGraphe(d.osm);
  const sans = construireGraphe(d.osm, { eviterFeux: false });

  const versLeFeuAvec = avec.voisins.get(d.id(2, 1)).find(a => a.vers === cible);
  const versLeFeuSans = sans.voisins.get(d.id(2, 1)).find(a => a.vers === cible);
  assert.ok(versLeFeuAvec.cout > versLeFeuAvec.m);
  assert.equal(versLeFeuSans.cout, versLeFeuSans.m);

  const surLAxeAvec = avec.voisins.get(d.id(0, 1)).find(a => a.vers === d.id(0, 2));
  const surLAxeSans = sans.voisins.get(d.id(0, 1)).find(a => a.vers === d.id(0, 2));
  assert.ok(surLAxeAvec.cout > surLAxeAvec.m * 1.7);
  assert.equal(surLAxeSans.cout, surLAxeSans.m);

  // Les feux restent REPÉRÉS même quand on ne les évite plus : on continue
  // de les compter et de les afficher sur la carte.
  assert.ok(sans.feux.has(cible));
});

test('la nuit, une rue non éclairée coûte 2,5 fois plus', () => {
  const tags = { highway: 'residential', lit: 'no' };
  assert.equal(multiplicateur(tags, false, false), 1);
  assert.equal(multiplicateur(tags, true, false), PENALITES.nonEclaireLaNuit);
});

test('les autoroutes et voies rapides sont absentes du graphe', () => {
  const d = damier({ cotes: 5, tagsLigne: { 2: { highway: 'motorway' } } });
  const g = construireGraphe(d.osm);
  const voisinsHorizontaux = g.voisins.get(d.id(2, 1)).filter(a => a.vers === d.id(2, 2));
  assert.equal(voisinsHorizontaux.length, 0, 'la voie rapide a été routée');
  // La colonne, elle, reste franchissable.
  assert.ok(g.voisins.get(d.id(2, 1)).some(a => a.vers === d.id(1, 1)));
});

test('foot=no exclut la voie', () => {
  const d = damier({ cotes: 5, tagsLigne: { 2: { highway: 'residential', foot: 'no' } } });
  const g = construireGraphe(d.osm);
  assert.equal(g.voisins.get(d.id(2, 1)).filter(a => a.vers === d.id(2, 2)).length, 0);
});

test('noeudLePlusProche accroche au bon carrefour', () => {
  const d = damier({ cotes: 7 });
  const g = construireGraphe(d.osm);
  const vise = d.point(3, 4);
  const trouve = noeudLePlusProche(g, { lat: vise.lat + 0.0001, lon: vise.lon + 0.0001 });
  assert.equal(trouve.id, d.id(3, 4));
  assert.ok(trouve.m < 20);
});

test('plusGrandeComposante jette l’îlot isolé', () => {
  const d = damier({ cotes: 5 });
  // Une allée privée quelque part au large, reliée à rien.
  d.osm.elements.push(
    { type: 'node', id: 900001, lat: 48.9, lon: 2.4 },
    { type: 'node', id: 900002, lat: 48.9005, lon: 2.4 },
    { type: 'way', id: 900100, nodes: [900001, 900002], tags: { highway: 'residential' } }
  );
  const g = construireGraphe(d.osm);
  assert.ok(g.voisins.has(900001), 'l’îlot devrait exister avant le nettoyage');

  const propre = plusGrandeComposante(g);
  assert.ok(!propre.voisins.has(900001), 'l’îlot aurait dû être jeté');
  assert.equal(propre.voisins.size, 25);
});
