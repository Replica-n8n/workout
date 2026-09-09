import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echapper } from '../lib/texte.js';

test('les cinq caractères qui cassent du HTML sont neutralisés', () => {
  assert.equal(echapper('<b>gras</b>'), '&lt;b&gt;gras&lt;/b&gt;');
  assert.equal(echapper('Prince & Duc'), 'Prince &amp; Duc');
  assert.equal(echapper('dit "la Main"'), 'dit &quot;la Main&quot;');
  assert.equal(echapper("l'Acadie"), 'l&#39;Acadie');
});

test('l’esperluette passe en premier, sinon on échappe son propre échappement', () => {
  /* Traiter « < » avant « & » rendrait « &amp;lt; », qui s'afficherait
     littéralement « &lt; » à l'écran. */
  assert.equal(echapper('<'), '&lt;');
  assert.equal(echapper('&lt;'), '&amp;lt;');
});

test('un nom de rue ordinaire ressort intact', () => {
  /* Les accents et les apostrophes typographiques ne sont pas du HTML : les
     toucher abîmerait la moitié des noms de rues de Montréal. */
  for (const nom of ['Rue Sainte-Catherine Est', 'Avenue De Chateaubriand',
                     'Côte-des-Neiges', 'Rue de l’Église', 'Boulevard Saint-Laurent']) {
    assert.equal(echapper(nom), nom, nom);
  }
});

test('ni null ni undefined ne font tomber l’appel', () => {
  /* OSM rend parfois un way sans nom, et une carte à moitié peinte est pire
     qu'un nom vide. */
  assert.equal(echapper(null), '');
  assert.equal(echapper(undefined), '');
  assert.equal(echapper(0), '0');
});

test('un nom hostile ne peut plus fabriquer de balise', () => {
  /* Le cas qui motive tout ce fichier : OpenStreetMap est modifiable par
     n'importe qui, et le nom finit dans un `innerHTML`. */
  const hostile = '<img src=x onerror="alert(1)">';
  const sorti = echapper(hostile);
  assert.ok(!sorti.includes('<'), 'un chevron a survécu');
  assert.ok(!sorti.includes('>'), 'un chevron fermant a survécu');
  /* Et le texte reste lisible une fois rendu par le navigateur. */
  assert.equal(sorti, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
