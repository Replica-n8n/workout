import { test } from 'node:test';
import assert from 'node:assert/strict';

/* `js/donnees.js` garde une connexion unique dans une variable de module :
   chaque test le réimporte avec une requête différente pour partir d'une
   ardoise propre. */
let compteur = 0;
const neuf = () => import(`../js/donnees.js?essai=${++compteur}`);

/* Un faux `indexedDB` dont on choisit la réaction à l'ouverture. */
function fausseBase(reaction) {
  return {
    open() {
      const r = {};
      setTimeout(() => {
        if (reaction === 'bloquee' && r.onblocked) r.onblocked();
        if (reaction === 'erreur' && r.onerror) r.onerror();
      }, 5);
      return r;
    }
  };
}

/* Échoue au lieu d'attendre indéfiniment : c'est précisément le défaut. */
function avantLimite(promesse, ms = 2000) {
  return Promise.race([
    promesse,
    new Promise((_, ko) => setTimeout(() => ko(new Error(`toujours en attente après ${ms} ms`)), ms))
  ]);
}

test('une base BLOQUÉE par une autre page ne fige pas la recherche', async () => {
  /* ⚠️ Trouvé par la revue de la 1.13.0 : monter la base en version 3 alors
     qu'une autre page de Runa garde la version 2 ouverte, et le navigateur
     met l'ouverture en attente sans succès ni erreur. La recherche restait
     figée sur « Calcul des boucles… ». Sans mémoire, elle doit simplement
     télécharger. */
  globalThis.indexedDB = fausseBase('bloquee');
  const d = await neuf();
  const r = await avantLimite(d.chargerDuCache({ lat: 45.52, lon: -73.58 }, 1000));
  assert.equal(r, null);
});

test('une base en erreur rend « rien en mémoire », elle ne lève pas', async () => {
  globalThis.indexedDB = fausseBase('erreur');
  const d = await neuf();
  assert.equal(await avantLimite(d.chargerDuCache({ lat: 45.52, lon: -73.58 }, 1000)), null);
});

test('sans indexedDB du tout, on continue sans mémoire', async () => {
  /* Navigation privée, stockage refusé : `open` lève tout de suite. */
  globalThis.indexedDB = { open() { throw new Error('SecurityError'); } };
  const d = await neuf();
  assert.equal(await avantLimite(d.chargerDuCache({ lat: 45.52, lon: -73.58 }, 1000)), null);
});
