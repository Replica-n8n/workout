import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accrocher, sensDeMarche, segmentSuivant, metresRestants, ECART_MAX_M }
  from '../lib/suivi.js';
import { damier } from './grille.js';

/* Un carré de 1 km de côté, échantillonné tous les 50 m, parcouru dans le
   sens des aiguilles d'une montre. Fermé : le dernier point est le premier. */
function carre() {
  const d = damier({ cotes: 25 });
  const coins = [[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]];
  const pts = [];
  for (let c = 1; c < coins.length; c++) {
    const [r0, c0] = coins[c - 1], [r1, c1] = coins[c];
    for (let k = 0; k < 20; k++) {
      pts.push(d.point(r0 + (r1 - r0) * k / 20, c0 + (c1 - c0) * k / 20));
    }
  }
  pts.push(d.point(5, 5));
  return { pts, d };
}

test('accrocher trouve le point du parcours le plus proche', () => {
  const { pts } = carre();
  const vise = pts[30];
  const a = accrocher(pts, { lat: vise.lat + 0.00005, lon: vise.lon });
  assert.equal(a.indice, 30);
  assert.ok(a.ecartM < 10, `écart de ${a.ecartM.toFixed(0)} m`);
  assert.equal(a.global, true);
});

test('accrocher préfère le brin où l’on était déjà', () => {
  // ⚠️ Le vrai piège : sur une boucle, deux brins peuvent passer à quelques
  // dizaines de mètres l'un de l'autre. Le point le plus proche dans
  // l'absolu peut appartenir au brin d'EN FACE, et le segment surligné
  // enverrait alors dans la mauvaise direction.
  const { pts, d } = carre();
  // Un point à mi-chemin entre le côté ouest (indice ~10) et le côté est
  // (indice ~70), volontairement plus près du côté est.
  const est = pts[70];
  const moi = { lat: est.lat, lon: est.lon + 0.00002 };

  const sansMemoire = accrocher(pts, moi);
  assert.equal(sansMemoire.indice, 70);

  // Avec une mémoire située sur l'autre brin, mais assez proche pour que la
  // fenêtre l'emporte, on reste sur ce brin.
  const proche = accrocher(pts, { lat: pts[12].lat, lon: pts[12].lon + 0.00002 }, 10, 5);
  assert.ok(Math.abs(proche.indice - 12) <= 5, `accroché à ${proche.indice}`);
  assert.equal(proche.global, false);
});

test('accrocher repart en recherche globale si plus rien ne colle à côté', () => {
  const { pts } = carre();
  // Mémoire à l'indice 0, position réelle à l'autre bout du carré.
  const a = accrocher(pts, pts[45], 0, 5);
  assert.equal(a.global, true);
  assert.equal(a.indice, 45);
});

test('accrocher signale un écart quand on a quitté le parcours', () => {
  const { pts } = carre();
  const a = accrocher(pts, { lat: pts[20].lat + 0.01, lon: pts[20].lon });
  assert.ok(a.ecartM > ECART_MAX_M, `écart de ${a.ecartM.toFixed(0)} m seulement`);
});

test('sensDeMarche lit la progression, pas une position', () => {
  const n = 81;
  assert.equal(sensDeMarche([10, 12, 14, 17], n), 1);
  assert.equal(sensDeMarche([40, 37, 33, 30], n), -1);
  // À l'arrêt, on ne retourne pas le sens sur du bruit GPS.
  assert.equal(sensDeMarche([20, 21, 20, 19, 20], n, 1), 1);
  assert.equal(sensDeMarche([20, 21, 20, 19, 20], n, -1), -1);
  // Une seule mesure ne dit rien.
  assert.equal(sensDeMarche([5], n), 1);
});

test('sensDeMarche ne se retourne pas au passage du point de départ', () => {
  // ⚠️ De l'indice 79 à 2 sur 81 points, l'écart brut vaut -77 et ferait
  // croire à un demi-tour juste avant l'arrivée. Compté circulairement, il
  // vaut +4.
  assert.equal(sensDeMarche([77, 79, 1, 3], 81), 1);
});

test('segmentSuivant part dans le bon sens et fait la bonne longueur', () => {
  const { pts } = carre();
  const avant = segmentSuivant(pts, 20, 1, 400);
  const arriere = segmentSuivant(pts, 20, -1, 400);

  assert.ok(avant.length > 5 && arriere.length > 5);
  // Les deux partent du même point et divergent dès le suivant.
  assert.deepEqual(avant[0], arriere[0]);
  assert.notDeepEqual(avant[1], arriere[1]);

  // Longueur demandée respectée à un segment près (50 m ici).
  const longueur = l => { let t = 0; for (let i = 1; i < l.length; i++) {
    const a = l[i-1], b = l[i];
    t += Math.hypot((b.lat - a.lat) * 111320, (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180));
  } return t; };
  assert.ok(Math.abs(longueur(avant) - 400) < 60, `${longueur(avant).toFixed(0)} m`);
});

test('segmentSuivant repasse par le début sans se casser', () => {
  const { pts } = carre();
  const seg = segmentSuivant(pts, pts.length - 3, 1, 400);
  assert.ok(seg.length > 5, 'le segment s’arrête au bout du tableau');
});

test('le premier et le dernier point sont le même carrefour, et c’est ambigu', () => {
  // ⚠️ À documenter parce que ça a produit un vrai défaut : sur la ligne de
  // départ, `metresRestants` peut rendre la boucle entière (accroché à
  // l'indice 0) ou presque zéro (accroché au dernier indice), et les deux
  // sont défendables. Une position isolée ne peut pas trancher : c'est à
  // l'appelant de savoir si la course a commencé.
  const { pts } = carre();
  const auDebut = metresRestants(pts, 0, 1);
  const aLaFin = metresRestants(pts, pts.length - 2, 1);
  assert.ok(auDebut > 3500, `depuis l'indice 0 : ${auDebut} m`);
  assert.ok(aLaFin < 200, `depuis l'avant-dernier indice : ${aLaFin} m`);
});

test('metresRestants décompte jusqu’au départ', () => {
  const { pts } = carre();
  // Le carré fait 4 km. À un quart du parcours, il reste trois quarts.
  const reste = metresRestants(pts, 20, 1);
  assert.ok(Math.abs(reste - 3000) < 120, `${reste} m au lieu de 3000`);
  // Juste avant l'arrivée, il ne reste presque rien.
  assert.ok(metresRestants(pts, pts.length - 3, 1) < 200);
  // Et au départ, tout est encore à faire ou rien, selon le sens.
  assert.ok(metresRestants(pts, 1, -1) < 200);
});
