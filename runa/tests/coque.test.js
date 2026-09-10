import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* La hauteur de la page a été corrigée CINQ fois : ascenseur fantôme,
   bouton coupé, bouton inatteignable. La quatrième correction n'a jamais
   agi, parce qu'une règle placée juste en dessous l'écrasait, et rien ne
   l'a signalé pendant des semaines. Le défaut revenait « à chaque mise à
   jour », au rechargement que le service worker provoque.

   ⚠️ Ces tests lisent la feuille de style, ils ne la rendent pas. Ce qu'ils
   verrouillent, c'est la règle retenue : un corps FIXÉ aux quatre bords, et
   aucune hauteur exprimée dans une unité d'écran que le téléphone
   calculerait à sa façon. */

const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');   // les commentaires parlent des anciennes unités

/** Toutes les déclarations d'un sélecteur, dans l'ordre, même réparties. */
function declarations(selecteur) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sels = m[1].split(',').map(x => x.trim());
    if (!sels.includes(selecteur)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.push([d.slice(0, i).trim(), d.slice(i + 1).trim()]);
    }
  }
  return out;
}

/** La valeur qui gagne : la dernière déclarée, comme dans la cascade. */
function valeur(selecteur, propriete) {
  const d = declarations(selecteur).filter(([p]) => p === propriete);
  return d.length ? d[d.length - 1][1] : null;
}

test('le corps de page est fixé aux quatre bords de la fenêtre', () => {
  assert.equal(valeur('body', 'position'), 'fixed');
  for (const bord of ['top', 'bottom', 'left', 'right']) {
    assert.equal(valeur('body', bord), '0', `le bord ${bord} n’est pas posé`);
  }
});

test('aucune hauteur du corps en unité d’écran, même écrasée plus bas', () => {
  /* ⚠️ C'est la cascade qui avait trompé tout le monde : `100svh` sur
     `html, body`, puis `height: 100dvh` sur `body` quelques lignes plus
     bas. On regarde donc TOUTES les déclarations, pas seulement une. */
  for (const sel of ['html', 'body']) {
    for (const [p, v] of declarations(sel)) {
      if (p === 'height' || p === 'min-height') {
        assert.ok(!/\d(d|s|l)?vh\b/.test(v), `${sel} { ${p}: ${v} } : unité d’écran`);
      }
    }
  }
});

test('le panneau se borne à la page, pas à l’écran, et défile au besoin', () => {
  const mh = valeur('#panneau', 'max-height');
  assert.ok(mh, 'le panneau n’a plus de hauteur maximale : il pourrait sortir de la page');
  assert.ok(!/vh\b/.test(mh), `#panneau { max-height: ${mh} } : unité d’écran`);
  assert.equal(valeur('#panneau', 'overflow-y'), 'auto', 'le panneau ne défile plus');
});

test('la carte ne peut pas pousser le panneau hors de la page', () => {
  assert.equal(valeur('#carte', 'min-height'), '0');
  /* Une base en pourcentage retombe sur la taille propre du canevas, qui vaut
     le double de sa taille à l'écran sur un écran dense. */
  assert.match(valeur('#carte', 'flex'), /^1 1 0px$/);
});

test('aucun raccourci `font` ne mêle `inherit` à d’autres valeurs', () => {
  /* `font: 700 1rem/1 inherit` n'est pas du CSS : `inherit` ne vaut que
     seul, jamais comme famille dans le raccourci. Le navigateur jette alors
     la déclaration ENTIÈRE, sans rien dire. Depuis la première version, tous
     les boutons s'affichaient en Arial 13 px maigre, le bouton principal
     compris, le texte le plus faible de l'écran en plein soleil. */
  const fautifs = [...css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)]
    .map(m => m[1].trim())
    .filter(v => /\binherit\b/.test(v) && v !== 'inherit');
  assert.deepEqual(fautifs, [], 'raccourcis invalides : ' + fautifs.join(' | '));
});

test('« Reprendre » garde sa couleur à côté du bouton principal', () => {
  /* `.reprendre` perdait contre `button.principal`, plus précis : les deux
     boutons de l'accueil sortaient du même vert, jumeaux, alors que l'un
     reprend une course et l'autre en cherche une nouvelle. */
  assert.match(css, /button\.principal\.reprendre\s*\{[^}]*background:\s*var\(--jaune\)/,
    'la règle de Reprendre doit être au moins aussi précise que button.principal');
});
