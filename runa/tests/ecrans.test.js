import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Le panneau ne doit montrer qu'un écran à la fois. La règle a été violée
   pendant des mois sans que rien ne le dise : trois transitions sur huit
   oubliaient de refermer un écran, et depuis « Mon quartier », déplacer son
   départ en touchant la carte affichait les réglages PAR-DESSUS, avec le
   pourcentage du quartier qui dépassait en bas.

   ⚠️ Ces tests lisent le SOURCE, ils n'exécutent pas l'app : `js/app.js`
   parle au DOM dès son chargement et ne s'importe pas sous Node. Ce qu'on
   verrouille, c'est donc la discipline, pas le comportement. C'est peu, mais
   c'est exactement ce qui manquait. */

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* La liste telle qu'elle est écrite dans le code. */
function ecransDeclares() {
  const m = app.match(/const ECRANS = \[([^\]]+)\]/);
  assert.ok(m, 'la liste ECRANS a disparu');
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('les quatre écrans du panneau sont déclarés', () => {
  const declares = ecransDeclares();
  for (const id of ['reglages', 'resultats', 'monquartier', 'mesparcours']) {
    assert.ok(declares.includes(id), `écran absent de ECRANS : ${id}`);
  }
});

test('chaque écran déclaré existe vraiment dans la page', () => {
  for (const id of ecransDeclares()) {
    assert.ok(html.includes(`id="${id}"`), `ECRANS nomme « ${id} », introuvable dans index.html`);
  }
});

test('aucune transition ne pose « hidden » à la main', () => {
  /* C'est LA règle. Une écriture directe est le retour exact du défaut :
     elle ne peut pas savoir qu'il faut refermer les trois autres. Les
     LECTURES restent permises, elles ne cassent rien. */
  const ecrans = ecransDeclares();
  const fautes = [];
  for (const [i, ligne] of app.split('\n').entries()) {
    for (const id of ecrans) {
      const ecriture = new RegExp(`\\$\\('${id}'\\)\\.hidden\\s*=`);
      if (ecriture.test(ligne)) fautes.push(`ligne ${i + 1} : ${ligne.trim()}`);
    }
  }
  assert.deepEqual(fautes, [],
    'passer par montrerEcran() au lieu d’écrire hidden :\n' + fautes.join('\n'));
});

test('montrerEcran ferme tous les autres', () => {
  const m = app.match(/function montrerEcran\(nom\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'montrerEcran a disparu');
  const corps = m[1];
  assert.ok(corps.includes('ECRANS'), 'montrerEcran n’itère pas sur ECRANS');
  assert.match(corps, /hidden\s*=\s*id\s*!==\s*nom/,
    'montrerEcran doit fermer tout ce qui n’est pas l’écran demandé');
});

test('toucher la carte ne déplace le départ que là où c’est annoncé', () => {
  /* La pression brève sur la carte déplace le départ, efface les boucles et
     renvoie aux réglages. C'est annoncé sur l'écran de réglages (« Touchez la
     carte pour déplacer le départ »), et nulle part ailleurs. En course, la
     carte occupe 79 % de l'écran : la toucher pour regarder effaçait la
     course en cours, sans rien pour revenir. */
  const debut = app.indexOf("addEventListener('pointerup'");
  assert.ok(debut > 0, 'le gestionnaire du toucher de carte a disparu');
  const avant = app.slice(debut, app.indexOf('etat.depart =', debut));
  assert.match(avant, /\$\('resultats'\)\.hidden/,
    'le toucher de carte doit être ignoré quand l’écran des résultats (et donc la course) est affiché');
});
