/* =========================================================================
   Runa · le sens du parcours, écrit le long du tracé

   Il y avait UNE flèche, jaune, au bout des 400 prochains mètres. Deux
   versions pour la faire tenir : trop longue, elle dépassait du tracé et
   pointait dans le vide ; raccourcie et posée sur le trait, elle ne faisait
   plus que 10 px de large sur un trait de 7, et avait disparu. Elle, 10 sept.
   2026 : « à la place de la flèche jaune, on peut mettre à espace régulier
   des flèches vertes pour donner le sens du parcours, non ? »

   Oui, et c'est mieux qu'une flèche corrigée une troisième fois : une flèche
   au bout du surlignage ne dit le sens qu'à un endroit, et seulement pendant
   la course. Des chevrons le long de tout le tracé le disent partout, y
   compris sur l'écran où l'on choisit, où rien ne disait jusqu'ici dans quel
   sens tourner.

   Module pur : il reçoit des points en mètres et rend où poser les chevrons.
   Le dessin reste dans `js/carte.js`.
   ========================================================================= */

/* Les espacements possibles, en mètres. Un espacement « rond » qui ne change
   qu'à des seuils : sans ça, pincer pour zoomer ferait glisser les chevrons
   en continu le long du tracé. */
const PAS = [25, 50, 100, 200, 400, 800, 1600, 3200];

/* L'écart minimal à l'écran entre deux chevrons. En dessous, ils se touchent
   et le tracé ressemble à une chenille. */
export const ECART_PX = 70;

/* Sur quelle longueur on lit la direction autour d'un chevron. Un seul
   segment de tracé peut ne faire que deux mètres, et un chevron orienté sur
   lui partirait de travers : c'était déjà le défaut de la flèche jaune,
   quand elle prenait son cap sur quatre points au lieu d'une distance. */
const LECTURE_M = 8;

/** L'espacement pour une échelle donnée, en pixels par mètre. */
export function pasPour(echelle) {
  for (const p of PAS) if (p * echelle >= ECART_PX) return p;
  return PAS[PAS.length - 1];
}

/**
 * Où poser les chevrons.
 *
 * @param {{x:number, y:number}[]} pts  le tracé, en mètres, dans l'ordre
 * @param {number} pas                  écart entre deux chevrons, en mètres
 * @param {object} [o]
 * @param {number} [o.depuis]  indice du point où l'on se trouve pendant la
 *   course ; sans lui, on part du début du tracé
 * @param {number} [o.sens]    1 dans l'ordre du tracé, -1 à rebours
 * @returns {{x:number, y:number, ang:number}[]}
 */
export function placerChevrons(pts, pas, o = {}) {
  if (!pts || pts.length < 2 || !(pas > 0)) return [];
  const sens = o.sens === -1 ? -1 : 1;

  const cumul = [0];
  for (let i = 1; i < pts.length; i++) {
    cumul.push(cumul[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumul[cumul.length - 1];
  if (total < pas) return [];

  /* Le point à une distance donnée du début, par interpolation. */
  let k = 0;
  const a = d => {
    d = Math.max(0, Math.min(total, d));
    if (d < cumul[k]) k = 0;
    while (k < cumul.length - 2 && cumul[k + 1] < d) k++;
    const l = cumul[k + 1] - cumul[k] || 1;
    const t = (d - cumul[k]) / l;
    return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t,
             y: pts[k].y + (pts[k + 1].y - pts[k].y) * t };
  };

  /* ⚠️ Des positions FIXES, prises sur le tracé depuis son début. Les faire
     partir de la position de la coureuse les ferait avancer avec elle à
     chaque relevé GPS, et c'était exactement le clignotement des noms de
     rues, corrigé en 1.9.1. */
  const candidats = [];
  for (let d = pas / 2; d < total; d += pas) {
    const avant = a(d - LECTURE_M), apres = a(d + LECTURE_M), ici = a(d);
    let ang = Math.atan2(apres.y - avant.y, apres.x - avant.x);
    if (sens < 0) ang += Math.PI;
    candidats.push({ ...ici, ang, d });
  }

  /* ⚠️ Un même endroit peut porter DEUX chevrons contraires : l'accès d'une
     sortie au parc se fait à l'aller puis au retour, et une boucle répétée
     repasse sur elle-même à chaque tour. Garder les deux dessinerait une
     flèche dans chaque sens sur la même rue.

     On garde donc celui que la coureuse va rencontrer EN PREMIER, en partant
     d'où elle est et dans le sens où elle court : sur le retour, ce sont les
     chevrons du retour qui gagnent, pas ceux de l'aller qu'elle a déjà
     faits. Hors course, on part du début, donc c'est l'aller qui gagne. */
  const depuis = Number.isInteger(o.depuis) && o.depuis >= 0 && o.depuis < pts.length
    ? cumul[o.depuis] : (sens > 0 ? 0 : total);
  /* D'abord ce qui est devant, du plus proche au plus loin ; puis ce qui est
     derrière, du plus récent au plus ancien.

     ⚠️ Pas d'ordre circulaire. Le premier essai faisait le tour du tracé, et
     sur le retour, la portion d'accès DÉJÀ courue redevenait « devant » au
     tour suivant : elle gardait les chevrons de l'aller, qui pointaient vers
     le parc à dix mètres de ceux qui pointaient vers la maison. Une sortie
     finit chez soi, il n'y a pas de tour suivant. */
  const ordre = c => {
    const ecart = sens > 0 ? c.d - depuis : depuis - c.d;
    return ecart >= 0 ? ecart : total - ecart;
  };
  candidats.sort((p, q) => ordre(p) - ordre(q));

  const gardes = [];
  const rayon2 = (pas / 2) * (pas / 2);
  for (const c of candidats) {
    if (gardes.some(g => (g.x - c.x) ** 2 + (g.y - c.y) ** 2 < rayon2)) continue;
    gardes.push({ x: c.x, y: c.y, ang: c.ang });
  }
  return gardes;
}
