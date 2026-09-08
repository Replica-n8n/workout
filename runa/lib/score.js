/* =========================================================================
   Runa · les deux façons de noter une boucle

   Deux jeux, pas deux habillages du même. Mesuré sur douze sorties de 5 km
   au Plateau : les boucles retenues par l'un et par l'autre ne se recouvrent
   qu'à 9 % en médiane, et pas une fois les deux modes n'ont désigné la même.

   · DÉCOUVERTE note la part de la boucle qui passe par des rues jamais
     prises. En classant
     huit candidates au lieu d'en prendre une, la part inédite passe de 29 à
     67 % à la dixième sortie : choisir double le résultat, là où la simple
     pénalité « déjà couru » du graphe ne fait qu'orienter.

   · CONQUÊTE note le terrain que la boucle enferme et que les précédentes
     n'enfermaient pas. ⚠️ Ce mode ne vaut RIEN depuis un départ fixe :
     mesuré, 12,9 % de territoire contre 12,2 % à la découverte, en perdant
     3,6 points de rues. Il ne prend son sens que si le départ se déplace,
     et l'interface doit le dire au lieu de le supposer.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

/**
 * Les mètres de la boucle qui passent par une rue jamais prise.
 *
 * ⚠️ Se mesure arête par arête, sur le trajet réellement parcouru. Compter
 * la longueur entière d'un `way` dont la boucle ne prend qu'un tronçon donne
 * des parts au-delà de 100 % : une avenue de 2 km compte pour 2 km dans une
 * boucle qui en fait 5 et n'en emprunte que 300 m.
 *
 * @returns {number} entre 0 et 1
 */
export function partInedite(graphe, boucle, dejaCourues) {
  let neuf = 0, total = 0;
  for (let i = 1; i < boucle.noeuds.length; i++) {
    const liens = graphe.voisins.get(boucle.noeuds[i - 1]);
    if (!liens) continue;
    const a = liens.find(l => l.vers === boucle.noeuds[i]);
    if (!a) continue;
    total += a.m;
    if (!dejaCourues.has(a.way)) neuf += a.m;
  }
  return total ? neuf / total : 0;
}

/** Les mètres inédits en valeur absolue, pour l'afficher en kilomètres. */
export function metresInedits(graphe, boucle, dejaCourues) {
  let neuf = 0;
  for (let i = 1; i < boucle.noeuds.length; i++) {
    const liens = graphe.voisins.get(boucle.noeuds[i - 1]);
    if (!liens) continue;
    const a = liens.find(l => l.vers === boucle.noeuds[i]);
    if (a && !dejaCourues.has(a.way)) neuf += a.m;
  }
  return neuf;
}

/* --------------------------------------------------------- le territoire */

export const PAS_M = 10;

/* 5 km autour du point d'ancrage : de quoi tenir même si l'on va poser son
   départ à l'autre bout du quartier, sans jamais dépasser le mégaoctet de
   mémoire (1000 x 1000 cases d'un octet). */
export const RAYON_PLATEAU_M = 5000;

/**
 * Le terrain déjà encerclé, en cases de dix mètres.
 *
 * Une trame plutôt qu'une union de polygones : deux boucles qui se croisent
 * produiraient des trous et des lobes en sens contraire qu'aucune formule
 * simple ne démêle. La trame ne se trompe jamais, et dix mètres valent un
 * centième de kilomètre carré par case, soit bien plus fin que ce qu'on
 * affiche.
 */
export class Territoire {
  constructor(ancre, rayonM = RAYON_PLATEAU_M, pas = PAS_M) {
    this.ancre = ancre;
    this.rayon = rayonM;
    this.pas = pas;
    this.n = Math.round(2 * rayonM / pas);
    this.cases = new Uint8Array(this.n * this.n);
    this.prises = 0;
    this.kx = R * RAD * Math.cos(ancre.lat * RAD);
    this.ky = R * RAD;
  }

  /** Un point géographique en mètres depuis l'ancre. */
  versM(p) {
    return [(p.lon - this.ancre.lon) * this.kx, (p.lat - this.ancre.lat) * this.ky];
  }

  /**
   * Ajoute l'intérieur d'une boucle. Remplissage par balayage de lignes :
   * pour chaque rangée, on cherche où le contour la traverse, et on peint
   * entre les paires. C'est la règle pair-impair, celle qui définit
   * « dedans » sans se soucier du sens de parcours.
   *
   * @param {{lat:number,lon:number}[]} points
   * @param {boolean} [pourDeVrai] à false, on compte sans rien peindre :
   *   c'est ce qui permet de dire « cette boucle ajouterait tant » avant
   *   même de la choisir.
   * @returns {number} les mètres carrés NOUVEAUX
   */
  ajouter(points, pourDeVrai = true) {
    if (!points || points.length < 3) return 0;
    const poly = points.map(p => this.versM(p));
    const { n, pas, rayon } = this;
    let yMin = Infinity, yMax = -Infinity;
    for (const [, y] of poly) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }

    const vus = pourDeVrai ? null : new Set();
    let neuves = 0;
    const bDeb = Math.max(0, Math.floor((yMin + rayon) / pas));
    const bFin = Math.min(n - 1, Math.ceil((yMax + rayon) / pas));

    for (let b = bDeb; b <= bFin; b++) {
      const y = -rayon + (b + 0.5) * pas;
      const xs = [];
      for (let i = 0, m = poly.length; i < m; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % m];
        if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const aDeb = Math.max(0, Math.ceil((xs[k] + rayon) / pas - 0.5));
        const aFin = Math.min(n - 1, Math.floor((xs[k + 1] + rayon) / pas - 0.5));
        for (let a = aDeb; a <= aFin; a++) {
          const i = a * n + b;
          if (this.cases[i]) continue;
          if (pourDeVrai) { this.cases[i] = 1; this.prises++; neuves++; }
          else if (!vus.has(i)) { vus.add(i); neuves++; }
        }
      }
    }
    return neuves * pas * pas;
  }

  /** Ce que cette boucle ajouterait, sans rien changer. */
  gain(points) { return this.ajouter(points, false); }

  m2() { return this.prises * this.pas * this.pas; }
}

/* ------------------------------------------------------------- classement */

/**
 * Au-delà, la boucle ne répond plus à la question posée.
 *
 * ⚠️ Ce filtre n'est pas un raffinement, c'est une correction. Sans lui, les
 * deux scores favorisent mécaniquement la boucle la plus LONGUE : plus de
 * mètres parcourus, donc plus de mètres inédits, et plus de terrain enfermé.
 * Vu en vrai au premier essai : 5,69 km proposés pour 5,0 demandés.
 */
const ECART_MAX = 0.12;

/**
 * Classe les candidates selon le mode, et n'en garde que `combien`.
 *
 * La découverte se note en FRACTION inédite, pas en mètres : c'est la
 * mesure qui a été validée (100 % à la première sortie, 49 % à la douzième
 * depuis un départ fixe), et elle ne dépend pas de la longueur.
 *
 * À score égal, la bonne longueur l'emporte.
 */
export function classer(boucles, { mode, graphe, dejaCourues, territoire,
                                   distanceCible, combien = 3 }) {
  const bonneTaille = boucles.filter(b =>
    Math.abs(b.m - distanceCible) <= distanceCible * ECART_MAX);
  // Si aucune ne tombe dans la fourchette, mieux vaut proposer les moins
  // mauvaises que de ne rien proposer du tout.
  const retenues = bonneTaille.length ? bonneTaille : boucles;

  const notees = retenues.map(b => ({
    b,
    part: graphe ? partInedite(graphe, b, dejaCourues) : 0,
    neufM: graphe ? metresInedits(graphe, b, dejaCourues) : 0,
    gainM2: territoire ? territoire.gain(b.points) : 0
  }));

  notees.sort((x, y) => {
    const dx = mode === 'conquete' ? y.gainM2 - x.gainM2 : y.part - x.part;
    if (Math.abs(dx) > 1e-9) return dx;
    return Math.abs(x.b.m - distanceCible) - Math.abs(y.b.m - distanceCible);
  });

  return notees.slice(0, combien);
}
