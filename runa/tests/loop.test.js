import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { genererBoucles, partLongee, sansAllerRetour } from '../lib/loop.js';
import { damier } from './grille.js';

function quartier(o = {}) {
  const d = damier({ cotes: o.cotes ?? 41, ...o });
  return { d, g: plusGrandeComposante(construireGraphe(d.osm, o.opts || {})) };
}

test('trois boucles, fermées, à la bonne distance', () => {
  const { d, g } = quartier();
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 3000, graine: 7 });

  assert.equal(b.length, 3, `${b.length} boucle(s) au lieu de 3`);
  for (const x of b) {
    assert.equal(x.noeuds[0], x.noeuds.at(-1), 'la boucle ne revient pas au départ');
    const ecart = Math.abs(x.m - 3000) / 3000;
    assert.ok(ecart <= 0.10, `boucle de ${x.m} m, soit ${(ecart * 100).toFixed(1)} % d’écart`);
  }
});

test('les trois boucles ne sont pas la même', () => {
  const { d, g } = quartier();
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 3000, graine: 7 });
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const communs = [...b[j].ways].filter(w => b[i].ways.has(w)).length;
      const part = communs / Math.min(b[i].ways.size, b[j].ways.size);
      assert.ok(part <= 0.5, `boucles ${i} et ${j} partagent ${(part * 100).toFixed(0)} % de leurs rues`);
    }
  }
});

test('une boucle n’est pas un aller-retour', () => {
  // Sans le renchérissement des tronçons déjà pris, le générateur rendrait
  // un aller-retour sur la même avenue, qui fait bien la bonne distance et
  // n'est pourtant pas une boucle.
  const { d, g } = quartier();
  const [b] = genererBoucles(g, { depart: d.centre, distanceCible: 3000, graine: 7 });

  const passages = new Map();
  for (let i = 1; i < b.noeuds.length; i++) {
    const cle = [b.noeuds[i - 1], b.noeuds[i]].sort((x, y) => x - y).join('-');
    passages.set(cle, (passages.get(cle) || 0) + 1);
  }
  const repasses = [...passages.values()].filter(n => n > 1).length;
  assert.ok(repasses / passages.size < 0.15,
    `${repasses} tronçons sur ${passages.size} sont parcourus deux fois`);
});

test('la même graine redonne exactement les mêmes boucles', () => {
  const { d, g } = quartier();
  const a = genererBoucles(g, { depart: d.centre, distanceCible: 2500, graine: 42 });
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 2500, graine: 42 });
  assert.deepEqual(a.map(x => x.m), b.map(x => x.m));
  assert.deepEqual(a[0].noeuds, b[0].noeuds);
});

test('deux graines différentes donnent des boucles différentes', () => {
  const { d, g } = quartier();
  const a = genererBoucles(g, { depart: d.centre, distanceCible: 2500, graine: 1 });
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 2500, graine: 2 });
  assert.notDeepEqual(a[0].noeuds, b[0].noeuds);
});

test('les feux du parcours sont comptés', () => {
  const feux = [];
  for (let r = 0; r < 41; r++) for (let c = 0; c < 41; c++) feux.push(r * 1000 + c + 1);
  const { d, g } = quartier({ feux });
  const [b] = genererBoucles(g, { depart: d.centre, distanceCible: 2000, graine: 3 });
  // Tous les carrefours sont des feux : le compte doit être celui des
  // carrefours distincts traversés, pas zéro et pas le nombre de noeuds.
  assert.ok(b.feux > 5, `seulement ${b.feux} feux comptés sur un damier tout en feux`);
  assert.ok(b.feux <= new Set(b.noeuds).size);
});

test('fractionEclairee vaut null quand OSM ne dit rien', () => {
  // Le piège signalé par la spec : afficher « 0 % éclairé » sur un quartier
  // où personne n'a renseigné le tag serait un mensonge.
  const { d, g } = quartier();
  const [b] = genererBoucles(g, { depart: d.centre, distanceCible: 2000, graine: 5 });
  assert.equal(b.fractionEclairee, null);
  assert.equal(b.fractionRenseignee, 0);
});

test('la nuit, le générateur évite les rues non éclairées', () => {
  // Une moitié du quartier dans le noir, l'autre éclairée.
  const tagsLigne = {}, tagsCol = {};
  for (let i = 0; i < 41; i++) {
    tagsLigne[i] = { highway: 'residential', lit: i < 20 ? 'no' : 'yes' };
    tagsCol[i] = { highway: 'residential', lit: 'yes' };
  }
  const d = damier({ cotes: 41, tagsLigne, tagsCol });
  const g = plusGrandeComposante(construireGraphe(d.osm, { nuit: true }));
  const [b] = genererBoucles(g, { depart: d.centre, distanceCible: 2500, graine: 11 });

  assert.ok(b.fractionEclairee !== null, 'le quartier est renseigné, la fraction ne doit pas être nulle');
  assert.ok(b.fractionEclairee > 0.85,
    `seulement ${(b.fractionEclairee * 100).toFixed(0)} % du parcours est éclairé`);
});

test('les boucles rendues ne longent pas leur propre tracé', () => {
  const { d, g } = quartier();
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 3000, graine: 7 });
  for (const x of b) {
    assert.ok(x.longee <= 0.20,
      `${(x.longee * 100).toFixed(0)} % du tracé longe le tracé : c'est une antenne`);
  }
});

test('partLongee distingue un vrai carré d’une antenne', () => {
  // Le contre-essai de la mesure elle-même : sans lui, on ne saurait pas si
  // le seuil discrimine quelque chose ou s'il est toujours vrai.
  const d = damier({ cotes: 25 });
  const segment = (a, b, n) => Array.from({ length: n + 1 }, (_, k) =>
    d.point(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
  const coller = (...bouts) => bouts.reduce((t, b) => t.concat(t.length ? b.slice(1) : b), []);

  // Un carré de 1 km de côté : rien ne longe rien.
  const carre = coller(segment([5, 5], [5, 15], 40), segment([5, 15], [15, 15], 40),
                       segment([15, 15], [15, 5], 40), segment([15, 5], [5, 5], 40));
  assert.ok(partLongee(carre) < 0.05,
    `un carré ne devrait rien longer, obtenu ${(partLongee(carre) * 100).toFixed(0)} %`);

  // Le même kilométrage, mais l'aller et le retour sur deux rues parallèles
  // distantes de 100 m : à l'oeil, ce n'est pas une boucle.
  const antenne = coller(segment([10, 5], [10, 20], 60), segment([10, 20], [11, 20], 4),
                         segment([11, 20], [11, 5], 60), segment([11, 5], [10, 5], 4));
  const l = partLongee(antenne, 130);   // 130 m : les deux rues sont à 100 m
  assert.ok(l > 0.8, `une antenne devrait se longer partout, obtenu ${(l * 100).toFixed(0)} %`);

  // Et le seuil par défaut de 30 m ne doit PAS crier sur deux rues à 100 m :
  // longer à cent mètres, c'est encore un vrai choix d'itinéraire.
  assert.ok(partLongee(antenne) < 0.2);
});

test('sansAllerRetour efface un moignon entier, pas seulement son bout', () => {
  // a b c d c b a e : le détour par b, c, d ne mène nulle part et doit
  // disparaître en entier, pas d'un cran.
  assert.deepEqual(sansAllerRetour([1, 2, 3, 4, 3, 2, 1, 5]), [1, 5]);
  // Un parcours sans demi-tour n'est pas touché.
  assert.deepEqual(sansAllerRetour([1, 2, 3, 4, 1]), [1, 2, 3, 4, 1]);
  // Un aller-retour pur se réduit à son point de départ, ce qui le rend
  // reconnaissable comme dégénéré au lieu de compter le double des mètres.
  assert.deepEqual(sansAllerRetour([1, 2, 3, 2, 1]), [1]);
});

test('aucune boucle rendue ne contient de demi-tour immédiat', () => {
  const { d, g } = quartier();
  for (const cible of [2000, 3000, 5000]) {
    for (const x of genererBoucles(g, { depart: d.centre, distanceCible: cible, graine: 3 })) {
      for (let i = 1; i < x.noeuds.length - 1; i++) {
        assert.notEqual(x.noeuds[i - 1], x.noeuds[i + 1],
          `demi-tour au noeud ${x.noeuds[i]} sur la boucle de ${x.m} m`);
      }
    }
  }
});

test('chaque boucle annonce une direction', () => {
  const { d, g } = quartier();
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 3000, graine: 7 });
  const rose = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
  for (const x of b) assert.ok(rose.includes(x.direction), `direction inattendue : ${x.direction}`);
  // Et elles ne partent pas toutes du même côté, sinon l'information
  // n'aiderait pas à choisir.
  assert.ok(new Set(b.map(x => x.direction)).size >= 2,
    'les trois boucles partent toutes dans la même direction');
});

test('un départ hors du graphe ne fait pas planter', () => {
  const { g } = quartier({ cotes: 11 });
  const b = genererBoucles(g, { depart: { lat: -33.86, lon: 151.2 }, distanceCible: 2000 });
  assert.ok(Array.isArray(b));
});

test('trois boucles de 6 km en moins de trois secondes', () => {
  // Le budget annoncé dans la spec. Le damier de 61 côtés fait 36 fois la
  // taille du quartier de test précédent, soit l'ordre de grandeur d'une
  // vraie extraction OSM sur 1,5 km de rayon.
  const { d, g } = quartier({ cotes: 61 });
  const t0 = performance.now();
  const b = genererBoucles(g, { depart: d.centre, distanceCible: 6000, graine: 9 });
  const ms = performance.now() - t0;
  assert.ok(b.length >= 1, 'aucune boucle');
  assert.ok(ms < 3000, `${ms.toFixed(0)} ms, au-dessus du budget de 3 s`);
});
