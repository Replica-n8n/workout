import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe } from '../lib/graph.js';
import { chemin, waysDuChemin } from '../lib/route.js';
import { damier } from './grille.js';

test('sur un damier nu, le chemin fait la distance de Manhattan', () => {
  const d = damier({ cotes: 9 });
  const g = construireGraphe(d.osm);
  const r = chemin(g, d.id(0, 0), d.id(3, 2));
  assert.ok(r, 'aucun chemin trouvé');
  // 3 lignes + 2 colonnes = 5 arêtes de 100 m. Il n'existe pas plus court.
  assert.ok(Math.abs(r.m - 500) < 2, `attendu 500 m, obtenu ${r.m.toFixed(1)}`);
  assert.equal(r.noeuds[0], d.id(0, 0));
  assert.equal(r.noeuds.at(-1), d.id(3, 2));
});

test('le chemin d’un noeud vers lui-même est vide et gratuit', () => {
  const d = damier({ cotes: 5 });
  const g = construireGraphe(d.osm);
  const r = chemin(g, d.id(2, 2), d.id(2, 2));
  assert.deepEqual(r, { noeuds: [d.id(2, 2)], m: 0, cout: 0 });
});

test('un grand axe sans trottoir fait VRAIMENT changer d’itinéraire', () => {
  // C'est le test qui compte : vérifier que la pénalité modifie le coût ne
  // prouve rien, il faut qu'elle change le tracé rendu.
  // Ligne 0 en primary : tout droit = 400 m à 1,8 => coût 720.
  // Le détour par la ligne 1 = 600 m résidentiels => coût 600. Il gagne.
  const d = damier({ cotes: 9, tagsLigne: { 0: { highway: 'primary' } } });
  const g = construireGraphe(d.osm);
  const r = chemin(g, d.id(0, 0), d.id(0, 4));

  assert.ok(Math.abs(r.m - 600) < 2, `attendu un détour de 600 m, obtenu ${r.m.toFixed(0)}`);
  const surLAxe = r.noeuds.filter(n => n >= 1 && n <= 9).length;
  assert.equal(surLAxe, 2, 'l’itinéraire ne devrait toucher le grand axe qu’à ses deux bouts');
});

test('sans la pénalité, le même trajet passe tout droit', () => {
  // Le contre-essai : sans lui, le test précédent pourrait passer pour une
  // raison qui n'a rien à voir avec la pénalité.
  const d = damier({ cotes: 9 });
  const g = construireGraphe(d.osm);
  const r = chemin(g, d.id(0, 0), d.id(0, 4));
  assert.ok(Math.abs(r.m - 400) < 2, `attendu tout droit, 400 m, obtenu ${r.m.toFixed(0)}`);
});

test('une file de feux détourne l’itinéraire, à partir du moment où ça vaut le coup', () => {
  // Colonne 4 truffée de feux, un à chaque carrefour, sur 13 lignes.
  //
  // Descendre tout droit sur N arêtes coûte 100N mètres plus 25 par feu
  // traversé, soit 125N. Contourner par la colonne voisine coûte les mêmes
  // 100N, plus 200 m pour sortir et revenir, plus le seul feu d'arrivée :
  // 100N + 225. Le contournement ne gagne donc qu'à partir de N = 10.
  //
  // Avec N = 12 il gagne, et c'est ce qu'on vérifie. C'est aussi la preuve
  // que la pénalité est un ARBITRAGE et pas un évitement systématique : sur
  // un trajet court, traverser les feux reste la bonne réponse.
  const cotes = 13;
  const feux = Array.from({ length: cotes }, (_, r) => r * 1000 + 5);
  const d = damier({ cotes, feux });
  const g = construireGraphe(d.osm);

  const r = chemin(g, d.id(0, 4), d.id(12, 4));
  const feuxTraverses = r.noeuds.filter(n => g.feux.has(n)).length;
  assert.ok(feuxTraverses <= 2,
    `${feuxTraverses} feux traversés sur ${r.noeuds.length} noeuds, le contournement aurait dû gagner`);
  assert.ok(Math.abs(r.m - 1400) < 2, `attendu 1400 m de contournement, obtenu ${r.m.toFixed(0)}`);
});

test('sur un trajet court, la même file de feux ne détourne PAS', () => {
  // Le pendant du test précédent : à N = 4, tout droit reste le moins cher,
  // et un générateur qui fuirait les feux à tout prix aurait tort.
  const cotes = 13;
  const feux = Array.from({ length: cotes }, (_, r) => r * 1000 + 5);
  const d = damier({ cotes, feux });
  const g = construireGraphe(d.osm);

  const r = chemin(g, d.id(0, 4), d.id(4, 4));
  assert.ok(Math.abs(r.m - 400) < 2, `attendu 400 m tout droit, obtenu ${r.m.toFixed(0)}`);
});

test('renchérir les ways déjà pris force un autre tracé', () => {
  const d = damier({ cotes: 9 });
  const g = construireGraphe(d.osm);
  const aller = chemin(g, d.id(0, 0), d.id(4, 4));
  const ways = waysDuChemin(g, aller.noeuds);

  const retour = chemin(g, d.id(0, 0), d.id(4, 4), { waysUtilises: ways, facteurRetour: 4 });
  assert.ok(retour, 'aucun chemin de repli');
  const communs = [...waysDuChemin(g, retour.noeuds)].filter(w => ways.has(w)).length;
  assert.ok(communs < ways.size,
    'le second tracé emprunte exactement les mêmes rues que le premier');
});

test('aucun chemin vers un noeud absent du graphe', () => {
  const d = damier({ cotes: 5 });
  const g = construireGraphe(d.osm);
  assert.equal(chemin(g, d.id(0, 0), 999999), null);
});
