import test from 'node:test';
import assert from 'node:assert/strict';
import { encoder, decoder } from '../lib/partage.js';

const R = 6371008.8, RAD = Math.PI / 180;
const DEPART = { lat: 45.5230, lon: -73.5800 };

/** Une boucle plausible : un cercle de `rayon` mètres, `n` points. */
function boucle(rayon = 700, n = 200) {
  const kx = R * RAD * Math.cos(DEPART.lat * RAD), ky = R * RAD;
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 2 * Math.PI;
    points.push({ lat: DEPART.lat + (Math.sin(a) * rayon - 0) / ky,
                  lon: DEPART.lon + (Math.cos(a) * rayon - rayon) / kx });
  }
  return { m: Math.round(2 * Math.PI * rayon), points };
}

const metres = (a, b) => {
  const kx = R * RAD * Math.cos(a.lat * RAD), ky = R * RAD;
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * ky);
};

test('un parcours se relit à quelques mètres près', () => {
  const b = boucle();
  const lu = decoder(encoder(b));
  assert.ok(lu, 'le paquet doit se relire');
  assert.equal(lu.m, b.m);
  // Le point de départ est le seul qu'on transporte en absolu : il doit
  // retomber exactement là où l'on habite.
  assert.ok(metres(b.points[0], lu.points[0]) < 2);
  for (const p of lu.points) {
    assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }
});

test('le lien tient dans un message', () => {
  /* La contrainte qui décide de tout : 4,63 km du Plateau tenaient en
     262 caractères. Un cercle de 4,4 km ne doit pas faire pire. */
  const p = encoder(boucle());
  assert.ok(p.length < 600, `${p.length} caractères`);
  assert.ok(!/[+/=]/.test(p), 'aucun caractère à échapper dans une adresse');
});

test('l’allègement espace les points sans casser le tracé', () => {
  /* C'est l'ESPACEMENT qu'on garantit, pas un nombre de points : avec une
     entrée déjà plus serrée que le seuil, un point sur deux tombe et le
     compte ne dit plus rien. Un point tous les 25 m au minimum, et jamais
     plus loin que le seuil plus un pas d'entrée. */
  const b = boucle(700, 500);                       // 8,8 m entre deux points
  const lu = decoder(encoder(b));
  let mini = Infinity, maxi = 0;
  for (let i = 1; i < lu.points.length; i++) {
    const d = metres(lu.points[i - 1], lu.points[i]);
    mini = Math.min(mini, d); maxi = Math.max(maxi, d);
  }
  assert.ok(mini >= 24, `deux points à ${mini.toFixed(1)} m`);
  assert.ok(maxi <= 36, `deux points à ${maxi.toFixed(1)} m`);
  // 4,4 km à environ 26 m le pas : autour de 170 points.
  assert.ok(lu.points.length > 140 && lu.points.length < 200, `${lu.points.length} points`);
});

test('la position jointe est datée, pas en direct', () => {
  const quand = Date.now() - 12 * 60000;
  const lu = decoder(encoder(boucle(), { lat: 45.5240, lon: -73.5790, quand }));
  assert.ok(lu.position);
  assert.ok(metres({ lat: 45.5240, lon: -73.5790 }, lu.position) < 2);
  // À la minute près : la seconde n'apprend rien et coûterait deux octets.
  assert.ok(Math.abs(lu.position.quand - quand) <= 60000);
});

test('sans position jointe, il n’y en a pas d’inventée', () => {
  assert.equal(decoder(encoder(boucle())).position, null);
});

test('une position ne coûte presque rien', () => {
  const sans = encoder(boucle()).length;
  const avec = encoder(boucle(), { lat: 45.524, lon: -73.579, quand: Date.now() }).length;
  assert.ok(avec - sans < 20, `${avec - sans} caractères de plus`);
});

test('un lien abîmé rend null au lieu de lever', () => {
  /* Ça ARRIVE : une messagerie qui tronque, un copier-coller à la main, un
     lien d'une version qu'on ne connaît pas encore. */
  const bon = encoder(boucle());
  for (const mauvais of [
    null, undefined, '', 'x', 'pas du base64 !!!', bon.slice(0, 12),
    bon.slice(0, bon.length - 3), 'A' + bon, bon.toUpperCase()
  ]) {
    assert.doesNotThrow(() => decoder(mauvais), `sur ${String(mauvais).slice(0, 20)}`);
  }
});

test('un paquet d’une autre version est refusé, pas mal lu', () => {
  const octets = Buffer.from(encoder(boucle()).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  octets[0] = 9;
  assert.equal(decoder(octets.toString('base64url')), null);
});

test('un tracé trop court ne se partage pas', () => {
  assert.equal(encoder({ m: 10, points: [{ lat: 45.5, lon: -73.5 }] }), null);
  assert.equal(encoder({ m: 0, points: [] }), null);
  assert.equal(encoder(null), null);
  // Trois points collés font moins de 25 m : rien à transporter.
  assert.equal(encoder({ m: 5, points: [
    { lat: 45.5, lon: -73.5 }, { lat: 45.50001, lon: -73.5 }, { lat: 45.5, lon: -73.50001 }
  ] }), null);
});

test('les coordonnées relues restent sur Terre', () => {
  /* Un paquet forgé ne doit pas produire une carte au milieu de rien. */
  assert.equal(decoder('AYCAgICAgIAB'), null);
});

test('l’hémisphère sud et les longitudes négatives passent', () => {
  const sud = { lat: -33.8688, lon: 151.2093 };   // Sydney
  const kx = R * RAD * Math.cos(sud.lat * RAD), ky = R * RAD;
  const points = [];
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * 2 * Math.PI;
    points.push({ lat: sud.lat + Math.sin(a) * 500 / ky, lon: sud.lon + Math.cos(a) * 500 / kx });
  }
  const lu = decoder(encoder({ m: 3140, points }));
  assert.ok(lu);
  assert.ok(metres(points[0], lu.points[0]) < 2);
});
