import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { contoursDesParcs, tourDuParc, parcoursAuParc, TOL_PARC, TOUR_MINI_M } from '../lib/parc.js';
import { damier } from './grille.js';

/* Un damier au pas de 100 m, et un « parc » posé dessus : un rectangle de
   rues. Sur un damier, la bonne réponse se calcule de tête, c'est tout
   l'intérêt de tester ici plutôt que sur une vraie extraction. */
function quartier(cotes = 41) {
  const d = damier({ cotes, pasM: 100 });
  return { d, g: plusGrandeComposante(construireGraphe(d.osm, {})) };
}

/** Un parc rectangulaire dont les coins tombent entre les rues. */
function parcRectangle(d, r0, c0, r1, c1, nom = 'Parc Essai') {
  const a = d.point(r0 - 0.4, c0 - 0.4), b = d.point(r1 + 0.4, c1 + 0.4);
  return {
    type: 'way', tags: { leisure: 'park', name: nom },
    geometry: [
      { lat: a.lat, lon: a.lon }, { lat: a.lat, lon: b.lon },
      { lat: b.lat, lon: b.lon }, { lat: b.lat, lon: a.lon }, { lat: a.lat, lon: a.lon }
    ]
  };
}

test('contoursDesParcs ne garde que les parcs nommés qui ont un contour', () => {
  const osm = { elements: [
    { type: 'way', tags: { leisure: 'park', name: 'Jarry' },
      geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0.01 }, { lat: 0, lon: 0 }] },
    /* Le même parc, venu avec son centre pour écrire son nom sur la carte :
       sans géométrie, il ne doit PAS compter une deuxième fois. */
    { type: 'way', tags: { leisure: 'park', name: 'Jarry' }, center: { lat: 0.005, lon: 0.005 } },
    { type: 'way', tags: { leisure: 'park' },
      geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] },
    { type: 'way', tags: { leisure: 'garden', name: 'Jardin' },
      geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] }
  ] };
  const p = contoursDesParcs(osm);
  assert.equal(p.length, 1, `${p.length} parcs retenus au lieu d’un`);
  assert.equal(p[0].nom, 'Jarry');
  assert.ok(p[0].perimetreM > 0);
  assert.deepEqual(contoursDesParcs(null), []);
  assert.deepEqual(contoursDesParcs({}), []);
});

test('le tour du parc reste DANS le parc et se referme', () => {
  const { d, g } = quartier();
  const [parc] = contoursDesParcs({ elements: [parcRectangle(d, 12, 12, 19, 21)] });
  const t = tourDuParc(g, parc);
  assert.ok(t, 'aucun tour dans un parc de 7 rues sur 9');

  const n0 = g.noeuds.get(t.ids[0]);
  assert.ok(n0);
  /* Chaque nœud du tour doit être dans le rectangle. */
  const a = d.point(12 - 0.4, 12 - 0.4), b = d.point(19 + 0.4, 21 + 0.4);
  for (const id of t.ids) {
    const n = g.noeuds.get(id);
    assert.ok(n.lat >= a.lat && n.lat <= b.lat && n.lon >= a.lon && n.lon <= b.lon,
      'le tour sort du parc');
  }
  /* Et deux nœuds consécutifs, dernier et premier compris, se touchent. */
  for (let i = 0; i < t.ids.length; i++) {
    const x = t.ids[i], y = t.ids[(i + 1) % t.ids.length];
    assert.ok((g.voisins.get(x) || []).some(l => l.vers === y), 'le tour est cassé');
  }
});

test('le tour longe le BORD, il ne coupe pas par le milieu', () => {
  /* ⚠️ Le premier essai sur le parc Jarry zigzaguait vers l'intérieur : A*
     préférait les allées du milieu, plus courtes. Sur un rectangle de 7 × 9
     rues, un tour qui suit le bord fait exactement le périmètre intérieur,
     2 × (7 + 9) × 100 m = 3,2 km. Couper par le milieu le raccourcirait. */
  const { d, g } = quartier();
  const [parc] = contoursDesParcs({ elements: [parcRectangle(d, 12, 12, 19, 21)] });
  const t = tourDuParc(g, parc);
  assert.ok(t);
  assert.ok(t.m >= 3000, `tour de ${Math.round(t.m)} m : il coupe par le milieu`);
});

test('un square trop petit ne donne pas de sortie', () => {
  const { d, g } = quartier();
  /* 2 rues sur 2 : un tour de 800 m, sous le minimum. */
  const parcs = contoursDesParcs({ elements: [parcRectangle(d, 19, 19, 21, 21, 'Square')] });
  const b = parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 4000 });
  assert.equal(b, null, 'un tour de square a été proposé comme sortie');
  assert.ok(TOUR_MINI_M >= 1000);
});

test('un parc trop loin ne donne pas de sortie', () => {
  const { d, g } = quartier(61);
  /* Le parc est dans un coin, à plus de 1 km du centre. */
  const parcs = contoursDesParcs({ elements: [parcRectangle(d, 1, 1, 8, 10, 'Lointain')] });
  const b = parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 6000 });
  assert.equal(b, null, 'un parc à plus d’un kilomètre a été proposé');
});

test('une sortie au parc : accès, tours, retour, et la bonne distance', () => {
  const { d, g } = quartier();
  const parcs = contoursDesParcs({ elements: [parcRectangle(d, 12, 12, 19, 21)] });
  const b = parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 7000 });
  assert.ok(b, 'aucune sortie au parc');

  assert.equal(b.genre, 'parc');
  assert.equal(b.parc, 'Parc Essai');
  assert.ok(b.tours >= 1);
  assert.equal(b.noeuds[0], b.noeuds.at(-1), 'on ne rentre pas au départ');
  const ecart = Math.abs(b.m - 7000) / 7000;
  assert.ok(ecart <= TOL_PARC, `${b.m} m pour 7000 demandés`);
  assert.ok(Math.abs(b.tourM * b.tours + b.approcheM * 2 - b.m) <= 5,
    `${b.tours} tours de ${b.tourM} m et ${b.approcheM} m d’accès ne font pas ${b.m} m`);
  assert.ok(b.centreTour && Number.isFinite(b.centreTour.lat));
});

test('la tolérance du parc est de 20 %, pas les 12 % des boucles', () => {
  /* Décidé par elle le 2026-09-10 : un tour a une longueur fixe, et à 12 %
     le parc disparaissait pour 5, 6 et 8 km, les distances courantes. */
  assert.equal(TOL_PARC, 0.20);
});

test('les feux se comptent à chaque tour et l’accès deux fois', () => {
  /* Toute la colonne 15 est allumée : l'accès et le tour la croisent. */
  const feux = [];
  for (let r = 0; r < 41; r++) feux.push(r * 1000 + 15 + 1);
  const d = damier({ cotes: 41, pasM: 100, feux });
  const g = plusGrandeComposante(construireGraphe(d.osm, {}));
  const parcs = contoursDesParcs({ elements: [parcRectangle(d, 12, 12, 19, 21)] });
  const b = parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 7000 });
  assert.ok(b);
  const distincts = new Set(b.noeuds.filter(n => g.feux.has(n))).size;
  assert.ok(b.feux >= distincts,
    `${b.feux} feux annoncés, moins que les ${distincts} distincts du tracé`);
});

test('rien à proposer sans parc, sans graphe ou sans départ', () => {
  const { d, g } = quartier(21);
  assert.equal(parcoursAuParc(g, [], { depart: d.centre, distanceCible: 5000 }), null);
  assert.equal(parcoursAuParc(null, [], { depart: d.centre, distanceCible: 5000 }), null);
  assert.equal(parcoursAuParc(g, [{}], null), null);
});

test('un parc déjà montré est sauté quand on demande autre chose', () => {
  const { d, g } = quartier();
  const parcs = contoursDesParcs({ elements: [parcRectangle(d, 12, 12, 19, 21)] });
  const a = parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 7000 });
  assert.ok(a);
  assert.equal(a.signature, 'Parc Essai');
  /* Un seul parc : l'exclure ne laisse rien, et c'est à l'app de revenir au
     premier plutôt que de faire disparaître la carte. */
  assert.equal(parcoursAuParc(g, parcs, { depart: d.centre, distanceCible: 7000,
                                          exclure: new Set(['Parc Essai']) }), null);
});
