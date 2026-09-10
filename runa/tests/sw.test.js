import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Hors ligne, un module absent de la liste du service worker ne se charge
   pas, et l'import qui le demande fait tomber TOUT `app.js` : écran figé, pas
   un message. Rien ne le voit en ligne, puisque le réseau répond à la place
   du cache. On suit donc les imports depuis la page, et chacun doit y être. */

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function listeDuServiceWorker() {
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  const bloc = sw.match(/const FILES = \[([\s\S]*?)\];/);
  assert.ok(bloc, 'la liste FILES du service worker est introuvable');
  return new Set([...bloc[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]));
}

/* Tous les fichiers atteints depuis `js/app.js`, par import statique ou
   dynamique, chemins relatifs à la racine de l'app. */
function modulesAtteints(depart) {
  const vus = new Set();
  const aVoir = [depart];
  while (aVoir.length) {
    const rel = aVoir.pop();
    if (vus.has(rel)) continue;
    vus.add(rel);
    const code = fs.readFileSync(path.join(RACINE, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const cibles = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)'([^']+)'/gm)].map(m => m[1]);
    for (const c of cibles) {
      if (!c.startsWith('.')) continue;
      aVoir.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), c)));
    }
  }
  return vus;
}

test('chaque module que la page importe est gardé pour le hors-ligne', () => {
  const liste = listeDuServiceWorker();
  const atteints = modulesAtteints('js/app.js');
  /* Garde-fou du garde-fou : si le suivi des imports ne voyait rien, le test
     passerait sans rien vérifier. */
  assert.ok(atteints.size > 15, `seulement ${atteints.size} modules suivis`);
  const manquants = [...atteints].filter(f => !liste.has(f));
  assert.deepEqual(manquants, [], 'absents de FILES dans sw.js : ' + manquants.join(', '));
});

test('la liste ne promet pas un fichier qui n’existe pas', () => {
  /* `cache.addAll` échoue en bloc sur un seul 404 : le nouveau service
     worker ne s'installe pas, et personne ne reçoit plus aucune mise à jour. */
  for (const f of listeDuServiceWorker()) {
    if (f === '') continue;
    assert.ok(fs.existsSync(path.join(RACINE, f)), `${f} est listé mais n'existe pas`);
  }
});
