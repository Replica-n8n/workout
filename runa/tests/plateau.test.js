import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { damier } from './grille.js';

/* `js/plateau.js` porte la logique la plus sensible de l'app : le pourcentage
   de quartier déjà couru, et l'ancre du territoire. Les deux ont déjà eu un
   défaut grave, et le module n'avait aucun test.

   ⚠️ Il garde son état dans une variable de module, lue une seule fois. Pour
   que chaque test parte d'une ardoise propre, on le RÉIMPORTE avec une
   requête différente : c'est le seul moyen d'obtenir une instance neuve sans
   percer une porte dans le module juste pour les essais. */
let compteur = 0;
async function neuf() {
  boite.clear();
  return import(`../js/plateau.js?essai=${++compteur}`);
}

/* `localStorage` n'existe pas sous Node. */
const boite = new Map();
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: k => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => boite.set(k, String(v)),
    removeItem: k => boite.delete(k),
    clear: () => boite.clear()
  };
}

/** Une boucle minimale, carrée, autour d'un point. */
function boucle(centre, cote = 0.002, ways = [1, 2]) {
  return {
    m: 4 * cote * 111000,
    ways,
    points: [
      { lat: centre.lat, lon: centre.lon },
      { lat: centre.lat + cote, lon: centre.lon },
      { lat: centre.lat + cote, lon: centre.lon + cote },
      { lat: centre.lat, lon: centre.lon + cote },
      { lat: centre.lat, lon: centre.lon }
    ]
  };
}

test('l’ancre se pose une fois et ne bouge PLUS JAMAIS', async () => {
  /* ⚠️ C'est le point crucial du mode conquête. Une trame recalculée autour
     de « ma position » remettrait le compteur à zéro dès qu'on se déplace,
     donc récompenserait la fuite au lieu de l'exploration. */
  const p = await neuf();
  const a = { lat: 45.52, lon: -73.58 };
  const b = { lat: 45.60, lon: -73.70 };

  assert.equal(p.ancre(), null, 'une ancre existe avant la première sortie');
  p.enregistrer(boucle(a));
  const posee = p.ancre();
  assert.ok(posee);
  assert.ok(Math.abs(posee.lat - a.lat) < 1e-9);

  p.enregistrer(boucle(b));
  assert.deepEqual(p.ancre(), posee, 'l’ancre a suivi le nouveau départ');
});

test('enregistrer refuse ce qui n’est pas une boucle', async () => {
  const p = await neuf();
  assert.equal(p.enregistrer(null), false);
  assert.equal(p.enregistrer({}), false);
  assert.equal(p.enregistrer({ points: [{ lat: 1, lon: 1 }], m: 10 }), false,
    'un point isolé a été accepté comme boucle');
  assert.equal(p.combienDeSorties(), 0);
});

test('le bilan additionne les sorties et dédoublonne les rues', async () => {
  const p = await neuf();
  const a = { lat: 45.52, lon: -73.58 };
  p.enregistrer({ ...boucle(a), m: 5000, ways: [10, 20] });
  p.enregistrer({ ...boucle(a), m: 3000, ways: [20, 30] });

  const b = p.bilan();
  assert.equal(b.sorties, 2);
  assert.equal(b.km, 8);
  assert.equal(b.rues, 3, 'la rue 20, courue deux fois, doit compter une seule');
  assert.ok(b.km2 > 0, 'deux boucles n’enferment aucun terrain');
});

test('les rues déjà courues sont l’union de toutes les sorties', async () => {
  const p = await neuf();
  const a = { lat: 45.52, lon: -73.58 };
  p.enregistrer({ ...boucle(a), ways: [1, 2] });
  p.enregistrer({ ...boucle(a), ways: [2, 3] });
  assert.deepEqual([...p.dejaCourues()].sort((x, y) => x - y), [1, 2, 3]);
});

test('partDuQuartier ne compte QUE le disque autour du départ', async () => {
  /* ⚠️ Le défaut corrigé un jour : le dénominateur prenait la boîte entière
     téléchargée, bien plus large que ce qu'on atteint, et rendait « 3 % »
     après une sortie. Un chiffre à la fois faux et décourageant. */
  const p = await neuf();
  const d = damier({ cotes: 41, pasM: 100 });
  const g = plusGrandeComposante(construireGraphe(d.osm, {}));

  const large = p.partDuQuartier(g, d.centre, 2000);
  const etroit = p.partDuQuartier(g, d.centre, 400);
  assert.ok(large && etroit);
  assert.ok(etroit.kmTotal < large.kmTotal,
    `le disque de 400 m (${etroit.kmTotal} km) devrait être plus petit que celui de 2 km (${large.kmTotal} km)`);
});

test('partDuQuartier ignore les trottoirs, qui doubleraient chaque rue', async () => {
  const p = await neuf();
  const d = damier({ cotes: 21, pasM: 100 });
  const avec = plusGrandeComposante(construireGraphe(d.osm, {}));
  const seul = p.partDuQuartier(avec, d.centre, 600);

  /* Le même damier, mais dont toutes les lignes sont des trottoirs. */
  const tagsLigne = {};
  for (let r = 0; r < 21; r++) tagsLigne[r] = { highway: 'footway' };
  const d2 = damier({ cotes: 21, pasM: 100, tagsLigne });
  const g2 = plusGrandeComposante(construireGraphe(d2.osm, {}));
  const p2 = await neuf();
  const sansLesLignes = p2.partDuQuartier(g2, d2.centre, 600);

  assert.ok(seul && sansLesLignes);
  assert.ok(sansLesLignes.kmTotal < seul.kmTotal * 0.75,
    `les trottoirs sont comptés : ${sansLesLignes.kmTotal} km contre ${seul.kmTotal} km`);
});

test('partDuQuartier rend une fraction cohérente', async () => {
  const p = await neuf();
  const d = damier({ cotes: 21, pasM: 100 });
  const g = plusGrandeComposante(construireGraphe(d.osm, {}));

  const rien = p.partDuQuartier(g, d.centre, 600);
  assert.equal(rien.part, 0, 'du terrain pris sans aucune sortie');

  /* On marque quelques rues comme courues, puis la part doit monter. */
  const ways = [...g.ways.keys()].slice(0, 5);
  p.enregistrer({ ...boucle(d.centre), ways });
  const apres = p.partDuQuartier(g, d.centre, 600);
  assert.ok(apres.part > 0 && apres.part <= 1, `part = ${apres.part}`);
  assert.ok(apres.km <= apres.kmTotal, 'plus de rues prises que de rues existantes');
});

test('partDuQuartier se tait quand il n’y a rien à mesurer', async () => {
  const p = await neuf();
  assert.equal(p.partDuQuartier(null, { lat: 0, lon: 0 }), null);
  assert.equal(p.partDuQuartier({ voisins: new Map(), noeuds: new Map(), ways: new Map() },
                                null), null);
});

test('quota plein : on sacrifie les vieilles sorties, pas la nouvelle', async () => {
  /* Perdre l'enregistrement en cours serait le pire échange : c'est celui
     qui vient d'être couru. */
  const p = await neuf();
  const a = { lat: 45.52, lon: -73.58 };
  for (let i = 0; i < 6; i++) p.enregistrer({ ...boucle(a), m: 1000 + i });
  assert.equal(p.combienDeSorties(), 6);

  const vrai = globalThis.localStorage.setItem;
  let refus = 0;
  globalThis.localStorage.setItem = () => {
    /* Le premier essai échoue, le second passe : c'est exactement le
       comportement d'un quota qui se libère après l'élagage. */
    if (refus++ === 0) throw new Error('QuotaExceededError');
  };
  const ok = p.enregistrer({ ...boucle(a), m: 9999 });
  globalThis.localStorage.setItem = vrai;

  assert.equal(ok, true, 'l’enregistrement a été perdu au lieu d’élaguer');
  assert.ok(p.combienDeSorties() < 7, 'rien n’a été élagué');
  assert.equal(p.bilan().sorties, p.combienDeSorties());
});
