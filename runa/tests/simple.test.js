import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { corridors, leLong, parcoursSimple } from '../lib/simple.js';
import { damier } from './grille.js';

/* Sur un damier au pas de 100 m, la bonne réponse se calcule de tête : un
   rectangle de 8 colonnes sur 7 lignes fait exactement 3000 m de tour. C'est
   tout l'intérêt de tester ici plutôt que sur une extraction OSM, où l'on ne
   pourrait qu'observer que « ça a l'air correct ». */
function quartier(o = {}) {
  const d = damier({ cotes: o.cotes ?? 41, ...o });
  return { d, g: plusGrandeComposante(construireGraphe(d.osm, o.opts || {})) };
}

test('les corridors sont les rues nommées, longues et droites', () => {
  const { d, g } = quartier();
  const c = corridors(g, d.centre, 1200);

  assert.ok(c.length >= 20, `${c.length} corridors seulement`);
  for (const x of c) {
    assert.ok(x.m >= 400, `corridor de ${Math.round(x.m)} m, sous le minimum`);
    assert.match(x.nom, /^(rue|avenue) \d+$/, `nom inattendu : ${x.nom}`);
  }
  /* Un damier de 41 côtés au pas de 100 m : dans un rayon de 1200 m, chaque
     rue traverse la zone de part en part, donc au moins 2 km. */
  assert.ok(c[0].m >= 2000, `la plus longue ne fait que ${Math.round(c[0].m)} m`);
});

test('une rue tortueuse n’est pas un corridor', () => {
  /* Deux morceaux à angle droit sous le même nom : le bout à bout vaut
     0,71 fois la longueur parcourue, sous le seuil de droiture. */
  const coude = {
    elements: [
      { type: 'node', id: 1, lat: 48.850, lon: 2.350 },
      { type: 'node', id: 2, lat: 48.855, lon: 2.350 },
      { type: 'node', id: 3, lat: 48.855, lon: 2.357 },
      { type: 'way', id: 10, nodes: [1, 2, 3],
        tags: { highway: 'residential', name: 'rue du Coude' } }
    ]
  };
  const g = construireGraphe(coude, {});
  const c = corridors(g, { lat: 48.8525, lon: 2.3535 }, 1500);
  assert.equal(c.length, 0, 'un coude à angle droit est passé pour un corridor');
});

test('leLong mesure le long de la rue, pas à vol d’oiseau', () => {
  const { d, g } = quartier();
  const c = corridors(g, d.centre, 1200);
  const rue = c.find(x => x.nom === 'rue 20');
  assert.ok(rue, 'rue 20 absente des corridors');

  const p = leLong(rue, d.id(20, 15), d.id(20, 21));
  assert.ok(p, 'aucun chemin le long de la rue 20');
  assert.ok(Math.abs(p.m - 600) < 5, `${Math.round(p.m)} m au lieu de 600`);
  assert.equal(p.noeuds.length, 7, 'six pas de 100 m font sept nœuds');
});

test('un parcours simple, fermé, à la bonne distance et en peu d’étapes', () => {
  const { d, g } = quartier();
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 3000 });

  assert.ok(b, 'aucun parcours simple sur un damier, où tout se croise');
  assert.equal(b.noeuds[0], b.noeuds.at(-1), 'le parcours ne revient pas au départ');
  const ecart = Math.abs(b.m - 3000) / 3000;
  assert.ok(ecart <= 0.12, `${b.m} m, soit ${(ecart * 100).toFixed(1)} % d’écart`);
  assert.ok(b.etapes.length <= 6, `${b.etapes.length} étapes, c’est trop`);
  assert.ok(b.etapes.length >= 3, `${b.etapes.length} étape(s), ce n’est pas un circuit`);

  /* ⚠️ Le minimum de 250 m ne vaut que pour les étapes DU MILIEU. La
     première et la dernière sont les deux moitiés d'une même rue, coupée au
     point où l'on rejoint la boucle : on part rarement pile à un coin, et
     exiger 250 m de chaque moitié interdirait de partir de chez soi. */
  for (const e of b.etapes) assert.equal(typeof e.nom, 'string');
  for (const e of b.etapes.slice(1, -1)) {
    assert.ok(e.m >= 250, `étape intermédiaire de ${e.m} m, sous le minimum`);
  }
  const premiere = b.etapes[0], derniere = b.etapes.at(-1);
  if (premiere.nom === derniere.nom) {
    assert.ok(premiere.m + derniere.m >= 250,
      `la rue de départ ne totalise que ${premiere.m + derniere.m} m`);
  }
});

test('une boucle courte se répète au lieu d’être écartée', () => {
  /* Sur un damier serré, aucun cycle de trois ou quatre rues ne fait 5 km :
     le plus grand tour possible est bien plus court. Plutôt que de ne rien
     rendre, on doit proposer plusieurs tours. */
  const d = damier({ cotes: 15, pasM: 100 });
  const g = plusGrandeComposante(construireGraphe(d.osm, {}));
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 4000 });

  assert.ok(b, 'aucun parcours là où des tours suffiraient');
  assert.ok(b.tours >= 1, 'le nombre de tours doit être connu');
  const ecart = Math.abs(b.m - 4000) / 4000;
  assert.ok(ecart <= 0.12, `${b.m} m pour 4000 demandés`);
  if (b.tours > 1) {
    assert.ok(Math.abs(b.tourM * b.tours + b.approcheM * 2 - b.m) <= 5,
      `${b.tours} tours de ${b.tourM} m plus ${b.approcheM} m d’amorce ne font pas ${b.m} m`);
  }
});

test('les feux se comptent à chaque tour, pas une seule fois', () => {
  /* Un compteur de nœuds distincts annoncerait dix feux pour une sortie de
     trois tours qui en compte trente. C'est le chiffre sur lequel le coureur
     choisit : il doit dire ce qu'il va subir. */
  const feux = [];
  for (let c = 0; c < 15; c++) feux.push(7 * 1000 + c + 1);
  const d = damier({ cotes: 15, pasM: 100, feux });
  const g = plusGrandeComposante(construireGraphe(d.osm, {}));
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 4000 });
  assert.ok(b);
  const surUnTour = new Set(b.noeuds.filter(n => g.feux.has(n))).size;
  if (b.tours > 1 && surUnTour > 0) {
    assert.ok(b.feux >= surUnTour * b.tours * 0.9,
      `${b.feux} feux annoncés pour ${surUnTour} par tour sur ${b.tours} tours`);
  }
});

test('la rue de départ sert deux fois, et c’est voulu', () => {
  /* Le premier prototype interdisait de reprendre la rue de départ : aucun
     circuit ne pouvait alors se refermer. Ce test verrouille la règle
     inverse, la seule qui compte : les deux tronçons ne se chevauchent pas. */
  const { d, g } = quartier();
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 3000 });
  assert.ok(b);
  assert.equal(b.etapes[0].nom, b.etapes.at(-1).nom,
    'le retour ne se fait pas par la rue de départ');

  const compte = new Map();
  for (const n of b.noeuds) compte.set(n, (compte.get(n) || 0) + 1);
  /* Seul le départ est vu deux fois : une fois au début, une fois à la fin. */
  const repetes = [...compte.values()].filter(v => v > 1).length;
  assert.equal(repetes, 1, `${repetes} nœuds repassés, le parcours se recouvre`);
});

test('le parcours a la même forme qu’une boucle ordinaire', () => {
  /* Les cartes de proposition lisent toutes les mêmes champs : si celui-ci
     en oubliait un, la carte afficherait un blanc au lieu d'un chiffre. */
  const { d, g } = quartier();
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 3000 });
  assert.ok(b);
  for (const champ of ['noeuds', 'points', 'm', 'feux', 'ways', 'longee',
                       'rues', 'fractionEclairee', 'fractionRenseignee']) {
    assert.ok(champ in b, `champ manquant : ${champ}`);
  }
  assert.equal(typeof b.feux, 'number');
  assert.ok(Array.isArray(b.points) && b.points.length > 3);
});

test('les feux sont comptés sur le trajet réellement emprunté', () => {
  /* Un damier dont une ligne entière est allumée. Le parcours qui la longe
     doit voir ses feux, et le compte ne doit jamais dépasser le nombre de
     nœuds allumés que le trajet touche. */
  const feux = [];
  for (let c = 0; c < 41; c++) feux.push(20 * 1000 + c + 1);
  const { d, g } = quartier({ feux });
  const b = parcoursSimple(g, { depart: d.centre, distanceCible: 3000 });
  assert.ok(b);
  const distincts = new Set(b.noeuds.filter(n => g.feux.has(n))).size;

  /* ⚠️ Le compte annoncé n'est PAS le nombre de nœuds distincts : sur trois
     tours on s'arrête trois fois au même feu, et c'est bien ce que le coureur
     subit. Il ne peut donc qu'être supérieur ou égal. */
  assert.ok(b.feux >= distincts,
    `${b.feux} feux annoncés, moins que les ${distincts} feux distincts du tracé`);

  /* Un seul tour et pas d'amorce : là, les deux doivent coïncider. */
  if (b.tours === 1 && b.approcheM === 0) {
    assert.equal(b.feux, distincts,
      `${b.feux} feux pour ${distincts} traversés sur un tour unique`);
  }
});

test('rien à proposer là où il n’y a pas de rues qui se croisent', () => {
  /* Trois rues parallèles, aucune transversale : c'est la Croix-Rousse en
     miniature, et la bonne réponse est de se taire. */
  const elements = [];
  for (let k = 0; k < 3; k++) {
    const noeuds = [];
    for (let i = 0; i < 30; i++) {
      const id = 1000 * (k + 1) + i;
      elements.push({ type: 'node', id, lat: 48.85 + i * 0.0009, lon: 2.35 + k * 0.004 });
      noeuds.push(id);
    }
    elements.push({ type: 'way', id: 90 + k, nodes: noeuds,
                    tags: { highway: 'residential', name: 'avenue ' + k } });
  }
  const g = plusGrandeComposante(construireGraphe({ elements }, {}));
  const b = parcoursSimple(g, { depart: { lat: 48.86, lon: 2.35 }, distanceCible: 3000 });
  assert.equal(b, null, 'un circuit inventé là où aucune rue n’en croise une autre');
});
