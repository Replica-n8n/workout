/* =========================================================================
   Runa · écrire les noms sur la carte

   Communauto, Bixi et ParkUsher n'ont pas d'étiquette « vous êtes ici » :
   ils écrivent le nom de chaque rue LE LONG de la rue. C'est ça qui rend une
   carte lisible, et c'est ce qui manquait à l'image partagée.

   Trois pièges, tous rencontrés en la fabriquant :

   1. OSM découpe une rue en autant d'objets qu'elle a de carrefours. La rue
      Foucher, c'est douze morceaux de cent mètres, pas un de douze cents. En
      cherchant le plus long tronçon droit morceau par morceau, on ne posait
      que 8 étiquettes sur 53 : aucun bout n'était plus long que son nom.
      D'où `recoller`.

   2. Interdire au texte de tomber sur le tracé supprime justement les rues
      que la boucle emprunte, celles qu'on veut le plus lire. Les vraies
      cartes écrivent par-dessus tout, avec un halo. On signale seulement
      qu'un nom tombe sur le tracé, pour l'écrire en clair.

   3. L'angle doit être celui de la DIRECTION D'ENSEMBLE du tronçon, et le
      texte doit se poser sur la rue, au milieu par la longueur. Avec l'angle
      du premier segment et le milieu de la corde, une rue qui a le moindre
      coude reçoit une étiquette de travers, flottant à côté de la chaussée.
   ========================================================================= */

/* Deux extrémités à moins de six pixels sont le même carrefour. */
const COLLE_PX = 6;

/* Au-delà, deux segments ne sont plus dans la même direction. */
const COUDE_MAX = 0.25;   // radians, environ 14 degrés

/**
 * Recolle les morceaux d'une même rue bout à bout.
 * @param {number[][][]} morceaux polylignes en pixels
 */
export function recoller(morceaux) {
  const restants = morceaux.map(m => m.slice());
  const chaines = [];
  const proche = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < COLLE_PX;
  while (restants.length) {
    let ch = restants.pop();
    let colle = true;
    while (colle) {
      colle = false;
      for (let i = 0; i < restants.length; i++) {
        const m = restants[i];
        if (proche(ch[ch.length - 1], m[0])) ch = ch.concat(m.slice(1));
        else if (proche(ch[ch.length - 1], m[m.length - 1])) ch = ch.concat(m.slice().reverse().slice(1));
        else if (proche(ch[0], m[m.length - 1])) ch = m.slice(0, -1).concat(ch);
        else if (proche(ch[0], m[0])) ch = m.slice().reverse().slice(0, -1).concat(ch);
        else continue;
        restants.splice(i, 1);
        colle = true;
        break;
      }
    }
    chaines.push(ch);
  }
  return chaines;
}

/** Le point situé à la fraction `t` de la longueur, entre les indices i et j. */
export function surLaRue(pts, i, j, t) {
  let total = 0;
  for (let k = i; k < j; k++) total += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
  const vise = total * t;
  let parcouru = 0;
  for (let k = i; k < j; k++) {
    const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    if (parcouru + L >= vise || k === j - 1) {
      const u = L ? (vise - parcouru) / L : 0;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u,
              pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u];
    }
    parcouru += L;
  }
  return pts[j].slice();
}

/** Le plus long tronçon presque droit : c'est là qu'on écrit. */
export function meilleurTroncon(pts) {
  if (!pts || pts.length < 2) return null;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    let j = i + 1;
    const a0 = Math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]);
    while (j + 1 < pts.length) {
      const a = Math.atan2(pts[j + 1][1] - pts[j][1], pts[j + 1][0] - pts[j][0]);
      if (Math.abs(((a - a0 + Math.PI) % (2 * Math.PI)) - Math.PI) > COUDE_MAX) break;
      j++;
    }
    const L = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    if (!best || L > best.L) {
      const avant = surLaRue(pts, i, j, 0.25), apres = surLaRue(pts, i, j, 0.75);
      best = { L, angle: Math.atan2(apres[1] - avant[1], apres[0] - avant[0]),
               milieu: surLaRue(pts, i, j, 0.5) };
    }
    i = j - 1;
  }
  return best;
}

/**
 * La place occupée par les étiquettes déjà posées.
 *
 * Une trame de douze pixels : assez fine pour que deux noms ne se touchent
 * pas, assez grossière pour que poser cent étiquettes reste instantané.
 */
export class Place {
  constructor(largeur, hauteur, pas = 12) {
    this.pas = pas;
    this.nx = Math.ceil(largeur / pas);
    this.ny = Math.ceil(hauteur / pas);
    this.prise = new Uint8Array(this.nx * this.ny);
  }

  cases(cx, cy, larg, haut, angle) {
    const ca = Math.cos(angle), sa = Math.sin(angle), p = this.pas;
    const out = [];
    for (let u = -larg / 2; u <= larg / 2; u += p / 2) {
      for (let v = -haut / 2; v <= haut / 2; v += p / 2) {
        const i = Math.floor((cx + u * ca - v * sa) / p);
        const j = Math.floor((cy + u * sa + v * ca) / p);
        if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return null;   // déborde
        out.push(j * this.nx + i);
      }
    }
    return out;
  }

  /** @returns {boolean} vrai si l'étiquette a pu être posée */
  poser(cx, cy, larg, haut, angle = 0) {
    const c = this.cases(cx, cy, larg, haut, angle);
    if (!c) return false;
    for (const i of c) if (this.prise[i]) return false;
    for (const i of c) this.prise[i] = 1;
    return true;
  }
}

/**
 * Choisit où écrire les noms de rues.
 *
 * @param {Map<string, number[][][]>} parNom morceaux en pixels, par nom
 * @param {Place} place
 * @param {(t:string)=>number} largeurDe mesure du texte
 * @param {object} o
 * @returns {{texte:string,x:number,y:number,angle:number}[]}
 */
export function candidatsDeRues(parNom, o = {}) {
  const { ecartMinimal = 300, parRue = 2 } = o;
  const candidats = [];
  for (const [nom, morceaux] of parNom) {
    const trouves = [];
    for (const chaine of recoller(morceaux)) {
      const t = meilleurTroncon(chaine);
      if (t) trouves.push(t);
    }
    trouves.sort((a, b) => b.L - a.L);
    /* Deux étiquettes au plus par nom, et seulement si elles sont loin l'une
       de l'autre : une rue qui traverse toute l'image se lit mieux nommée
       deux fois, trois fois c'est du bruit. */
    const gardees = [];
    for (const t of trouves) {
      if (gardees.length >= parRue) break;
      if (gardees.some(x => Math.hypot(x.milieu[0] - t.milieu[0],
                                       x.milieu[1] - t.milieu[1]) < ecartMinimal)) continue;
      gardees.push(t);
    }
    for (const t of gardees) candidats.push({ ...t, nom });
  }
  return candidats;
}

/**
 * Pose des candidats déjà calculés.
 *
 * Séparé de `candidatsDeRues` pour la carte qu'on déplace : recoller les
 * morceaux et chercher les tronçons droits se fait UNE FOIS par quartier, en
 * mètres ; seul le placement, qui dépend du zoom, se refait à l'écran.
 */
export function poserDesCandidats(candidats, place, largeurDe, o = {}) {
  const { hauteur = 29, debordement = 0.7 } = o;
  // Les plus longues d'abord : si la place manque, mieux vaut perdre une
  // ruelle qu'une avenue.
  candidats = candidats.slice().sort((a, b) => b.L - a.L);

  const posees = [];
  for (const c of candidats) {
    const larg = largeurDe(c.nom);
    // Le texte peut déborder un peu de son tronçon, comme sur toutes les
    // cartes : l'exiger plus long écartait les rues courtes.
    if (c.L < larg * debordement) continue;
    // Jamais à l'envers, et raméné dans (-π, π] : une rue orientee vers la
    // gauche donnait un angle de 2π, juste à l'écran mais faux à relire.
    let angle = c.angle;
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (!place.poser(c.milieu[0], c.milieu[1], larg, hauteur, angle)) continue;
    posees.push({ texte: c.nom, x: c.milieu[0], y: c.milieu[1], angle });
  }
  return posees;
}

export function placerLesRues(parNom, place, largeurDe, o = {}) {
  return poserDesCandidats(candidatsDeRues(parNom, o), place, largeurDe, o);
}
