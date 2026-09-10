/* =========================================================================
   Runa · la proposition en plus

   Deux générateurs à part peuvent chacun proposer une sortie : le parcours
   à retenir et le tour du parc. Les montrer tous les deux faisait cinq cartes,
   dont les deux plus hautes, et la carte tombait de 332 à 249 px sur son
   écran : « ça écrase la map et on voit moins bien les tracés ».

   On n'en montre donc qu'UNE. Module pur, pour pouvoir tester la règle :
   « Autres parcours » a déjà eu un défaut ici, il rendait toujours la même.
   ========================================================================= */

/* À feux égaux, le parc passe devant : aucun feu dans les tours, de l'ombre,
   et c'est la sortie qu'elle est venue chercher. */
const PRIORITE = { parc: 0, simple: 1 };

/**
 * Laquelle montrer.
 *
 * @param {object[]} dispo   les propositions arrivées, chacune avec `.genre`
 *   et `.feux`
 * @param {string|null} [eviter]  le genre montré la fois précédente, quand
 *   on vient de toucher « Autres parcours » : on montre l'autre
 * @returns {object|null}
 */
export function choisirProposition(dispo, eviter = null) {
  const l = (dispo || []).filter(Boolean);
  if (!l.length) return null;
  if (l.length === 1) return l[0];
  if (eviter) {
    const autre = l.find(b => b.genre !== eviter);
    if (autre) return autre;
  }
  return l.slice().sort((a, b) =>
    (a.feux ?? Infinity) - (b.feux ?? Infinity) ||
    (PRIORITE[a.genre] ?? 9) - (PRIORITE[b.genre] ?? 9))[0];
}
