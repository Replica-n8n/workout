import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, multiplicateur, noeudLePlusProche, plusGrandeComposante, PENALITES, coutDunFeu }
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

test('un passage piéton à feu compte comme un feu', () => {
  // ⚠️ Le défaut le plus grave trouvé sur ce projet, et il tenait à un
  // détail de modélisation OSM : un piéton qui traverse une intersection à
  // feu ne passe PAS par le noeud posé au milieu de la chaussée, il passe
  // par le passage piéton. Comme la moitié d'un parcours suit les trottoirs,
  // l'app annonçait « aucun feu » là où on s'arrêtait quinze fois.
  const d = damier({ cotes: 5 });
  const chaussee = 2 * 1000 + 3;
  const avecFeu = 1 * 1000 + 3;
  const sansFeu = 3 * 1000 + 3;
  for (const el of d.osm.elements) {
    if (el.type !== 'node') continue;
    if (el.id === chaussee) el.tags = { highway: 'traffic_signals' };
    if (el.id === avecFeu) el.tags = { highway: 'crossing', crossing: 'traffic_signals' };
    if (el.id === sansFeu) el.tags = { highway: 'crossing', crossing: 'unmarked' };
  }
  const g = construireGraphe(d.osm);
  assert.ok(g.feux.has(chaussee), 'le feu de chaussée');
  assert.ok(g.feux.has(avecFeu), 'le passage piéton à feu');
  assert.ok(!g.feux.has(sansFeu), 'un passage sans feu n’est pas un feu');
  assert.ok(g.passages.has(sansFeu), 'il reste un passage');
});

test('les trois écritures OSM d’un passage à feu sont reconnues', () => {
  // `crossing=signals` est l'ancienne forme, encore très présente.
  for (const tags of [{ crossing: 'traffic_signals' }, { crossing: 'signals' },
                      { 'crossing:signals': 'yes' }]) {
    const d = damier({ cotes: 5 });
    const cible = 2 * 1000 + 3;
    for (const el of d.osm.elements) {
      if (el.type === 'node' && el.id === cible) el.tags = { highway: 'crossing', ...tags };
    }
    assert.ok(construireGraphe(d.osm).feux.has(cible), JSON.stringify(tags));
  }
});

test('ce que coûte un feu se déduit de l’allure, pas d’un chiffre en l’air', () => {
  // Éviter un feu vaut la distance qu'on aurait parcourue pendant l'attente.
  // Trente secondes à 6:00 au kilomètre font 83 m.
  assert.ok(Math.abs(coutDunFeu(360) - 83) < 1, `${coutDunFeu(360).toFixed(0)} m à 6:00`);
  assert.ok(coutDunFeu(300) > coutDunFeu(420), 'plus on court vite, plus un feu coûte cher');
  // Dans la plage de l'app, 3:00 à 9:00, la valeur va de 167 à 56 mètres :
  // seule la borne haute mord vraiment.
  assert.equal(coutDunFeu(3 * 60), 150, 'plafonné à l’allure de compétition');
  assert.ok(Math.abs(coutDunFeu(9 * 60) - 55.6) < 0.5, 'pas de plancher à 9:00');
  // Les bornes restent là pour une valeur aberrante, d'où qu'elle vienne.
  assert.equal(coutDunFeu(60 * 60), 50);
  assert.equal(coutDunFeu(1), 150);
});

test('l’allure change vraiment le poids des arêtes', () => {
  const cible = 2 * 1000 + 3;
  const d = damier({ cotes: 5, feux: [cible] });
  const lent = construireGraphe(d.osm, { allure: 8 * 60 });
  const vite = construireGraphe(d.osm, { allure: 4 * 60 });
  const vers = (g) => g.voisins.get(d.id(2, 1)).find(a => a.vers === cible);
  assert.ok(vers(vite).cout > vers(lent).cout,
    'un feu doit coûter plus cher à qui court vite');
});
