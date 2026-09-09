/* =========================================================================
   Runa · du texte venu d'ailleurs, posé dans du HTML

   Les noms de rues, de parcs et de commerces viennent d'OpenStreetMap, que
   n'importe qui peut modifier. L'app les compose ensuite dans des chaînes
   HTML pour les cartes de proposition. Un nom contenant `<` ou `&` casserait
   le rendu, et rien ne garantit qu'il n'en existe pas.

   ⚠️ N'échapper QUE ce qui vient du dehors. Le HTML que l'app écrit
   elle-même, ses `<b>` et ses `<span>`, doit passer intact : l'échapper
   afficherait les balises à l'écran.

   ⚠️ Et ne PAS s'en servir pour le canvas. `ctx.fillText` écrit du texte,
   pas du HTML : `js/image.js` et `js/carte.js` doivent recevoir le nom brut,
   sinon l'image de partage porterait « Rue Sainte-Catherine &amp; Est ».
   ========================================================================= */

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Le texte, rendu sûr à poser dans du HTML.
 *
 * L'esperluette d'abord, sinon on échapperait les esperluettes qu'on vient
 * soi-même d'écrire et « < » deviendrait « &amp;lt; ».
 *
 * @param {string} t
 * @returns {string}
 */
export function echapper(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c => ENTITES[c]);
}
