/* =========================================================================
   Runa · la carte

   Pas de MapLibre, pas de fournisseur de tuiles, pas de clé d'API.

   Ce n'est pas de l'économie mal placée : on a DÉJÀ téléchargé la géométrie
   de toutes les rues du quartier pour pouvoir y calculer un itinéraire. Les
   dessiner coûte un tracé de plus, alors qu'un fond de carte imposerait un
   compte chez un fournisseur, un quota, un CDN, et une carte qui reste
   blanche hors ligne. Ici la carte fonctionne exactement là où le
   générateur fonctionne : sur ce qui est en cache.

   Ce qu'on y perd : pas de bâtiments, pas de relief, pas de commerces. Des
   rues, leurs noms, et le tracé. Pour choisir entre trois boucles, ça suffit.
   ========================================================================= */

import { Place, candidatsDeRues, poserDesCandidats } from '../lib/etiquettes.js';
import { placerChevrons, pasPour } from '../lib/chevrons.js';

const R = 6371008.8, RAD = Math.PI / 180;

/* ---------------------------------------------------------- les couleurs

   Le parcours et sa suite immédiate ne se distinguaient que par la CLARTÉ,
   deux verts, et c'est exactement ce qu'un écran au soleil écrase : la
   lumière renvoyée s'ajoute à chaque pixel et comprime les tons sombres.
   Mesuré sur la vraie carte : 4,1:1 à l'ombre, 2,5:1 en plein jour.

   Le jaune change de TEINTE en plus de la clarté. Écart de couleur 88 contre
   50, et surtout il tient pour les deux daltonismes les plus courants (76 en
   protanopie, 89 en deuteranopie), là où deux verts s'effondrent.

   Pourquoi pas l'orange, qui est pourtant LA couleur du running : c'est
   celle de Strava, et surtout elle est sombre. Mesurée sur ce fond de carte,
   la paire gris/orange donne 2,3:1, et 1,6:1 au soleil, moins bien que les
   deux verts qu'on remplace. Le vert reste la couleur de l'app, le jaune ne
   sert qu'à une chose : où mettre les pieds dans les 400 prochains mètres. */
const TRACE = '#6ee7a0';        // le parcours, quand rien n'est surligné
const TRACE_ATTENUE = '#2f6b4c'; // le parcours, pendant la course
const SUITE = '#facc15';         // les 400 prochains mètres

/* Les chevrons qui disent le sens, en vert, cernés de noir pour se lire sur
   le vert vif du tracé comme sur le vert sombre qu'il prend pendant la
   course. */
const CHEVRON = TRACE;
const CHEVRON_HALO = '#0d0f12';
const MOI = '#ffffff';

/* L'indigo dit « déjà fait ». Il ne peut pas être vert : le vert est le
   parcours du jour, et deux verts sur un fond sombre ne se distinguent plus
   à bout de bras, au soleil. */
const COURUE = '#5b6bb0';

/* Les noms, sur la carte comme sur l'image partagée. Communauto, Bixi et
   ParkUsher écrivent le nom de chaque rue le long de la rue : c'est ce qui
   permet de se situer sans rien toucher. */
const NOM_DE_RUE = '#7e8896';
const PARC = '#6bbd8c';
const STATION = '#b5a3f0';
const TABLE = '#e0ac4d';
const CORPS_NOM = 12;

/* En deçà, un nom de rue n'est plus qu'une trace grise sur une autre : la
   carte se lit mieux sans. Mesuré sur un téléphone, c'est autour d'un
   cinquième de pixel par mètre que ça bascule. */
const ECHELLE_NOMS = 0.2;

const VRAIE_RUE = /^(residential|tertiary|secondary|primary|living_street|unclassified|pedestrian)$/;
const TERRAIN = 'rgba(91, 107, 176, 0.30)';
const TERRAIN_BORD = 'rgba(142, 162, 255, 0.55)';

/* ------------------------------------------------- la hiérarchie des voies

   ⚠️ Tout était dessiné du même trait, et un simple croisement de deux rues
   ressemblait à un plat de spaghettis dès qu'on zoomait. Ce n'est pas une
   erreur des données : à Montréal, OpenStreetMap cartographie chaque
   trottoir comme une ligne à part. Dans un extrait du Plateau, on compte
   3 345 trottoirs et 2 716 passages piétons pour 632 rues résidentielles.

   Un croisement, c'est donc deux chaussées, quatre trottoirs et jusqu'à
   quatre passages : une dizaine de lignes pour ce que l'oeil appelle un
   carrefour. Les dessiner toutes pareil, c'est mentir sur ce qu'on voit en
   levant la tête.

   On garde tout (c'est là-dessus qu'on court, 62 % du parcours suit les
   trottoirs), mais on rend la chaussée lisible et le reste discret. */
const VOIES = {
  axes:     { couleur: '#3a424c', largeur: 4.5 },   // primary, secondary, tertiary
  rues:     { couleur: '#272c33', largeur: 2.6 },   // residential, ruelles, piétonnes
  sentiers: { couleur: '#191d23', largeur: 1.2 }    // trottoirs, passages, sentiers
};

function familleDeVoie(tags) {
  if (!tags || !tags.highway) return 'sentiers';
  const h = tags.highway;
  if (h === 'primary' || h === 'secondary' || h === 'tertiary' ||
      h === 'primary_link' || h === 'secondary_link' || h === 'tertiary_link') return 'axes';
  if (h === 'footway' || h === 'path' || h === 'steps' ||
      h === 'cycleway' || h === 'corridor') return 'sentiers';
  // Une allée de stationnement ou une entrée de garage n'est pas une rue.
  if (h === 'service') return tags.service === 'alley' ? 'rues' : 'sentiers';
  return 'rues';
}

/* Bornes de zoom, en pixels par mètre. En dessous, tout un arrondissement
   tient dans un timbre ; au-dessus, on voit trois maisons. */
export const ECHELLE_MIN = 0.02;
export const ECHELLE_MAX = 3;

/**
 * L'échelle qui fait tenir un tracé de `largeurM` sur `largeurPx`.
 *
 * ⚠️ Extrait et exporté pour être testé, parce que la version naïve produit
 * une échelle NÉGATIVE dès que la zone de carte est plus petite que deux
 * fois la marge : le canvas lève alors « The radius provided is negative »
 * et toute la carte disparaît. Vu en vrai en faisant pivoter le téléphone en
 * paysage, où le panneau ne laisse que quelques dizaines de pixels à la
 * carte. La marge doit donc s'effacer avant de rendre la place négative.
 */
export function echellePour(largeurPx, hauteurPx, largeurM, hauteurM, marge = 28) {
  const m = Math.min(marge, Math.max(0, Math.min(largeurPx, hauteurPx) / 2 - 4));
  const dispoX = Math.max(1, largeurPx - m * 2);
  const dispoY = Math.max(1, hauteurPx - m * 2);
  const e = Math.min(dispoX / Math.max(largeurM, 1), dispoY / Math.max(hauteurM, 1));
  if (!Number.isFinite(e)) return ECHELLE_MIN;
  return Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, e));
}

export class Carte {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.origine = null;      // {lat, lon} : le zéro du repère en mètres
    this.traces = null;       // {axes, rues, sentiers} en Path2D, en mètres
    this.trace = null;
    this.restant = null;      // les prochains mètres, surlignés
    this.moi = null;          // la position en direct
    this.depart = null;
    this.courues = null;      // les rues déjà prises, en Path2D
    this.terrain = null;      // le terrain déjà encerclé, en Path2D
    this.quartier = false;    // l'écran « Mon quartier » les montre, pas l'autre
    this.candidats = [];      // les noms de rues, en mètres, calculés une fois
    this.reperes = null;      // parcs, stations, tables, en mètres
    this.nomsPoses = null;    // le résultat du dernier placement
    this.nomsPour = '';       // la vue pour laquelle il a été fait
    this.enGeste = false;     // un doigt déplace ou pince la carte
    this.echelle = 0.35;      // pixels par mètre
    this.centre = { x: 0, y: 0 };
    this.brancher();
  }

  /* Projection locale : sur un quartier de quelques kilomètres, traiter la
     Terre comme un plan est faux de moins d'un mètre. Inutile d'aller
     chercher une vraie projection Mercator. */
  versM(p) {
    const o = this.origine;
    return {
      x: (p.lon - o.lon) * RAD * R * Math.cos(o.lat * RAD),
      y: -(p.lat - o.lat) * RAD * R
    };
  }

  versLatLon(x, y) {
    const o = this.origine;
    return {
      lat: o.lat - (y / R) / RAD,
      lon: o.lon + (x / (R * Math.cos(o.lat * RAD))) / RAD
    };
  }

  /** Construit une seule fois les tracés de toutes les rues. Redessiner
      80 000 segments à chaque doigt qui bouge serait injouable ; un Path2D
      construit une fois puis transformé ne coûte presque rien. */
  charger(graphe, origine) {
    this.origine = origine;
    const traces = { axes: new Path2D(), rues: new Path2D(), sentiers: new Path2D() };
    const vus = new Set();

    for (const [de, liste] of graphe.voisins) {
      for (const a of liste) {
        if (de > a.vers) continue;          // chaque arête une seule fois
        const cle = de + ':' + a.vers;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const p1 = this.versM(graphe.noeuds.get(de));
        const p2 = this.versM(graphe.noeuds.get(a.vers));
        const cible = traces[familleDeVoie(graphe.ways.get(a.way))];
        cible.moveTo(p1.x, p1.y);
        cible.lineTo(p2.x, p2.y);
      }
    }
    this.traces = traces;

    /* ⚠️ Les candidats se calculent EN MÈTRES, une seule fois par quartier.
       Recoller les morceaux de rue et chercher leurs tronçons droits coûte
       le tour complet du graphe : le refaire à chaque image pendant qu'on
       déplace la carte serait injouable. L'échelle étant uniforme, un
       tronçon droit en mètres reste droit à l'écran. */
    const parNom = new Map();
    const vusNom = new Set();
    for (const [de, liste] of graphe.voisins) {
      for (const a of liste) {
        if (de > a.vers) continue;
        const cle = de + ':' + a.vers;
        if (vusNom.has(cle)) continue;
        vusNom.add(cle);
        const t = graphe.ways.get(a.way);
        if (!t || !t.name || !VRAIE_RUE.test(t.highway)) continue;
        const n1 = graphe.noeuds.get(de), n2 = graphe.noeuds.get(a.vers);
        if (!n1 || !n2) continue;
        const m1 = this.versM(n1), m2 = this.versM(n2);
        const l = parNom.get(t.name) || [];
        l.push([[m1.x, m1.y], [m2.x, m2.y]]);
        parNom.set(t.name, l);
      }
    }
    // 300 m entre deux étiquettes d'une même rue, comme les 300 px de l'image
    // à son échelle habituelle.
    this.candidats = candidatsDeRues(parNom, { ecartMinimal: 300 });
    this.nomsPoses = null;

    this.feux = [...graphe.feux]
      .filter(id => graphe.noeuds.has(id))
      .map(id => this.versM(graphe.noeuds.get(id)));
  }

  /**
   * Les rues déjà prises, en un seul tracé.
   *
   * Reconstruit à chaque ouverture de l'écran plutôt que gardé : la liste
   * grandit à chaque sortie, et un Path2D périmé dessinerait une rue de
   * moins sans que rien ne le signale.
   */
  chargerCourues(graphe, ways) {
    this.courues = null;
    if (!graphe || !ways || !ways.size || !this.origine) return;
    const p = new Path2D();
    const vus = new Set();
    let combien = 0;
    for (const [de, liste] of graphe.voisins) {
      for (const a of liste) {
        if (de > a.vers || !ways.has(a.way)) continue;
        const cle = de + ':' + a.vers;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const n1 = graphe.noeuds.get(de), n2 = graphe.noeuds.get(a.vers);
        if (!n1 || !n2) continue;
        const m1 = this.versM(n1), m2 = this.versM(n2);
        p.moveTo(m1.x, m1.y);
        p.lineTo(m2.x, m2.y);
        combien++;
      }
    }
    this.courues = combien ? p : null;
  }

  /**
   * Le terrain encerclé : un seul chemin, tous les contours fermés.
   *
   * ⚠️ Toutes les boucles sont remises dans le même sens avant d'être
   * ajoutées. Le canevas remplit selon la règle nonzero : deux contours de
   * sens contraires se trouent mutuellement au lieu de s'unir, et on verrait
   * apparaître des lacunes là où deux sorties se chevauchent.
   */
  poserTerrain(contours) {
    this.terrain = null;
    if (!contours || !contours.length || !this.origine) return;
    const p = new Path2D();
    let combien = 0;
    for (const points of contours) {
      if (!points || points.length < 3) continue;
      const m = points.map(q => this.versM(q));
      let aire = 0;
      for (let i = 0, n = m.length; i < n; i++) {
        const a = m[i], b = m[(i + 1) % n];
        aire += a.x * b.y - b.x * a.y;
      }
      const suite = aire < 0 ? m.slice().reverse() : m;
      p.moveTo(suite[0].x, suite[0].y);
      for (let i = 1; i < suite.length; i++) p.lineTo(suite[i].x, suite[i].y);
      p.closePath();
      combien++;
    }
    this.terrain = combien ? p : null;
  }

  /**
   * Les repères à nommer : parcs, stations, tables.
   *
   * Gardés en mètres pour la même raison que les rues : seul le placement
   * dépend du zoom.
   */
  poserReperes(r) {
    this.reperes = null;
    if (!r || !this.origine) return;
    const enM = liste => (liste || []).map(o => ({ nom: o.nom, ...this.versM(o) }));
    this.reperes = { parcs: enM(r.parcs), stations: enM(r.stations), tables: enM(r.tables) };
    this.nomsPoses = null;
  }

  /** Cadre la vue sur une boucle, avec une marge. */
  cadrer(points) {
    if (!points || !points.length) return;
    // Mémoriser de quoi recadrer si la fenêtre change de forme : sur un
    // téléphone qui pivote, garder l'ancien cadrage laisse la boucle hors
    // de l'écran, et on croit que le tracé a disparu.
    this.cadre = points;
    this.deplacee = false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      const m = this.versM(p);
      if (m.x < x0) x0 = m.x; if (m.x > x1) x1 = m.x;
      if (m.y < y0) y0 = m.y; if (m.y > y1) y1 = m.y;
    }
    const { largeur, hauteur } = this.taille();
    this.echelle = echellePour(largeur, hauteur, x1 - x0, y1 - y0);
    this.centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  /** Cadre sur un point, quand il n'y a pas encore de boucle à montrer :
      juste après avoir trouvé la position, on veut voir SON quartier. */
  cadrerAutour(point, rayonM) {
    this.poserOrigine(point);
    if (!this.origine) return;
    const { largeur, hauteur } = this.taille();
    this.echelle = echellePour(largeur, hauteur, rayonM * 2, rayonM * 2);
    this.centre = this.versM(point);
    this.cadre = null;
    this.deplacee = false;
  }

  /* Au tout premier lancement il y a un départ mémorisé mais pas encore de
     rues : sans origine, toute projection déréférence null. On pose donc le
     repère sur le départ, quitte à ne dessiner qu'un point sur du noir. */
  poserOrigine(point) {
    if (!this.origine && point) this.origine = { lat: point.lat, lon: point.lon };
  }

  montrer(boucle, depart) {
    this.poserOrigine(depart || (boucle && boucle.points[0]));
    this.trace = null;
    this.tours = null;
    this.milieuTrace = null;
    /* ⚠️ Le surlignage et la flèche appartiennent à la boucle qu'on suivait,
       pas à celle qu'on affiche. Sans cette remise à zéro, ils restaient à
       l'écran par-dessus le nouveau tracé jusqu'à la prochaine relevée du
       GPS, soit quelques secondes, en montrant un sens qui n'était plus le
       bon. */
    this.restant = null;
    this.moi = null;
    this.pointsM = null;
    this.chevrons = null;
    this.suiviIndice = null;
    this.suiviSens = 1;
    if (!this.origine) return;

    if (boucle && boucle.points.length) {
      const p = new Path2D();
      this.pointsM = boucle.points.map(pt => this.versM(pt));
      this.pointsM.forEach((m, i) => { i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y); });
      this.trace = p;

      /* Le nombre de tours, posé au milieu de la boucle.
         ⚠️ Écrit sur la CARTE, pas seulement sur la fiche : « 3 tours de
         1,60 km » en petites lettres sous le parcours ne se voit pas, et
         trois tours d'un kilomètre ne sont pas la même sortie qu'une boucle
         de trois kilomètres. C'est la première chose à comprendre, donc la
         plus grosse à l'écran. */
      if (boucle.tours > 1) {
        this.tours = boucle.tours;
        /* ⚠️ Le centre du TOUR quand on le connaît, pas celui du tracé
           entier. Le tracé comprend l'accès, fait deux fois : au parc Jarry
           depuis la station, 843 m d'accès contre 2,6 km de tour tiraient le
           chiffre vers la station, jusqu'à le poser hors de la boucle. */
        if (boucle.centreTour) {
          this.milieuTrace = this.versM(boucle.centreTour);
        } else {
          let sx = 0, sy = 0;
          for (const pt of boucle.points) { const m = this.versM(pt); sx += m.x; sy += m.y; }
          this.milieuTrace = { x: sx / boucle.points.length, y: sy / boucle.points.length };
        }
      }
    }
    this.depart = depart ? this.versM(depart) : null;
    this.dessiner();
  }

  /**
   * La position en direct, et les prochains mètres du parcours.
   *
   * C'est ce qui répond à « je tourne à gauche ou à droite ? » : voir où l'on
   * est ne suffit pas sur une boucle, il faut voir de quel côté elle
   * continue. Le segment surligné le dit sans qu'on ait à réfléchir, et les
   * chevrons disent dans quel sens.
   *
   * @param {object} [o]
   * @param {number} [o.indice]  où l'on est sur le tracé
   * @param {number} [o.sens]    1 dans l'ordre du tracé, -1 à rebours : on
   *   peut courir une boucle dans l'autre sens, et les chevrons doivent alors
   *   se retourner avec elle
   */
  suivre(moi, prochainsPoints, o = {}) {
    this.poserOrigine(moi);
    this.moi = moi && this.origine ? this.versM(moi) : null;
    this.restant = null;
    if (prochainsPoints && prochainsPoints.length > 1 && this.origine) {
      const p = new Path2D();
      prochainsPoints.forEach((pt, i) => {
        const m = this.versM(pt);
        i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y);
      });
      this.restant = p;
    }
    const indice = Number.isInteger(o.indice) ? o.indice : null;
    const sens = o.sens === -1 ? -1 : 1;
    if (indice !== this.suiviIndice || sens !== this.suiviSens) {
      this.suiviIndice = indice;
      this.suiviSens = sens;
      this.chevrons = null;   // à reposer : ce qui est devant a changé
    }
    this.dessiner();
  }

  /**
   * Les noms de rues et de repères, en pixels.
   *
   * Le placement dépend du zoom et du centre : on le refait quand la vue a
   * changé, jamais pendant qu'elle ne bouge pas. Sans ce cache, chaque doigt
   * qui glisse relancerait un placement complet.
   */
  dessinerLesNoms(ctx, e, largeur, hauteur, dpr) {
    if (!this.candidats.length && !this.reperes) return;

    /* ⚠️ On ne REFAIT le choix des noms que quand la vue s'immobilise. En le
       refaisant à chaque image, les collisions se résolvaient autrement d'une
       image à l'autre : les noms clignotaient, apparaissaient, disparaissaient
       pendant qu'on déplace la carte du doigt. Insupportable, et c'est le
       genre de défaut qu'aucune mesure ne montre.

       Entre deux choix, les mêmes noms suivent simplement la carte : ils sont
       gardés en mètres et reprojetés à chaque image. */
    const vue = `${e.toFixed(4)}:${Math.round(largeur)}:${Math.round(hauteur)}`;
    if (!this.nomsPoses || (vue !== this.nomsPour && !this.enGeste)) {
      this.nomsPour = vue;
      this.nomsPoses = this.calculerLesNoms(ctx, e, largeur, hauteur);
    }
    if (!this.nomsPoses) return;

    const versEcran = (mx, my) => [
      (mx - this.centre.x) * e + largeur / 2,
      (my - this.centre.y) * e + hauteur / 2
    ];

    /* On sort du repère en mètres : le texte se dessine à sa taille, pas à
       celle de la carte. */
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';

    for (const r of this.nomsPoses.reperes) {
      const [x, y] = versEcran(r.mx, r.my);
      if (x < -60 || x > largeur + 60 || y < -20 || y > hauteur + 20) continue;
      ctx.fillStyle = r.pastille;
      if (r.carre) ctx.fillRect(x - 4, y - 4, 8, 8);
      else { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
      ctx.textAlign = r.aDroite ? 'left' : 'right';
      this.ecrire(ctx, r.nom, r.aDroite ? x + 8 : x - 8, y, r.couleur, 600, 3);
    }

    ctx.textAlign = 'center';
    for (const l of this.nomsPoses.rues) {
      const [x, y] = versEcran(l.mx, l.my);
      if (x < -120 || x > largeur + 120 || y < -30 || y > hauteur + 30) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(l.angle);
      this.ecrire(ctx, l.texte, 0, 0, NOM_DE_RUE, 500, 3);
      ctx.restore();
    }
    ctx.restore();
  }

  ecrire(ctx, texte, x, y, couleur, graisse, halo) {
    ctx.font = `${graisse} ${CORPS_NOM}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.strokeStyle = '#0d0f12';
    ctx.lineWidth = halo;
    ctx.strokeText(texte, x, y);
    ctx.fillStyle = couleur;
    ctx.fillText(texte, x, y);
  }

  /** Choisit ce qui tient à l'écran, dans le repère en pixels. */
  calculerLesNoms(ctx, e, largeur, hauteur) {
    const place = new Place(largeur, hauteur);
    const versEcran = (mx, my) => [
      (mx - this.centre.x) * e + largeur / 2,
      (my - this.centre.y) * e + hauteur / 2
    ];
    ctx.font = `500 ${CORPS_NOM}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const largeurDe = t => ctx.measureText(t).width;

    /* Les repères d'abord : ils sont peu nombreux et ce sont les plus forts.
       On ne garde que ceux qui sont à l'écran, triés par distance au centre
       de la vue, parce que c'est là qu'on regarde. */
    const reperes = [];
    if (this.reperes) {
      const familles = [
        [this.reperes.stations, STATION, '#5b48a8', true, 3],
        [this.reperes.parcs, PARC, '#3f7d5c', false, 5],
        [this.reperes.tables, TABLE, '#9a7326', false, 7]
      ];
      for (const [liste, couleur, pastille, carre, combien] of familles) {
        const proches = liste
          .map(o => { const [x, y] = versEcran(o.x, o.y); return { ...o, x, y }; })
          .filter(o => o.x > 0 && o.x < largeur && o.y > 0 && o.y < hauteur)
          .sort((a, b) => Math.hypot(a.x - largeur / 2, a.y - hauteur / 2)
                        - Math.hypot(b.x - largeur / 2, b.y - hauteur / 2))
          .slice(0, combien);
        for (const o of proches) {
          const larg = largeurDe(o.nom) + 14;
          const aDroite = o.x + 8 + larg <= largeur;
          const cx = aDroite ? o.x + larg / 2 + 8 : o.x - larg / 2 - 8;
          if (!place.poser(cx, o.y, larg, CORPS_NOM + 6)) continue;
          reperes.push({ ...o, couleur, pastille, carre, aDroite });
        }
      }
    }

    /* Puis les rues. ⚠️ L'angle ne change PAS de signe : `versM` renvoie
       déjà un axe vertical vers le bas, comme l'écran. Le nier retournait
       chaque nom autour de l'horizontale, et toutes les rues penchaient du
       mauvais côté. Seule la longueur se multiplie par l'échelle. */
    const cands = [];
    for (const c of this.candidats) {
      const [x, y] = versEcran(c.milieu[0], c.milieu[1]);
      if (x < -80 || x > largeur + 80 || y < -40 || y > hauteur + 40) continue;
      cands.push({ nom: c.nom, milieu: [x, y], angle: c.angle, L: c.L * e });
    }
    /* On rend les positions en MÈTRES : c'est ce qui permet de faire suivre
       les mêmes noms pendant qu'on déplace la carte, sans les rechoisir. */
    const versM = (x, y) => [
      (x - largeur / 2) / e + this.centre.x,
      (y - hauteur / 2) / e + this.centre.y
    ];
    const rues = poserDesCandidats(cands, place, largeurDe, { hauteur: CORPS_NOM + 6 })
      .map(l => { const [mx, my] = versM(l.x, l.y); return { ...l, mx, my }; });
    return {
      reperes: reperes.map(r => { const [mx, my] = versM(r.x, r.y); return { ...r, mx, my }; }),
      rues
    };
  }

  /** Recentre sur un point sans changer le zoom. */
  centrerSur(point) {
    if (!this.origine || !point) return;
    this.centre = this.versM(point);
    this.deplacee = false;
    this.dessiner();
  }

  taille() {
    const r = this.c.getBoundingClientRect();
    return { largeur: r.width, hauteur: r.height };
  }

  dessiner() {
    const { c, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { largeur, hauteur } = this.taille();
    if (c.width !== Math.round(largeur * dpr) || c.height !== Math.round(hauteur * dpr)) {
      c.width = Math.round(largeur * dpr);
      c.height = Math.round(hauteur * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, largeur, hauteur);
    if (!this.origine) return;

    // Dernier filet : une échelle non finie ou négative fait lever le canvas
    // sur le premier `arc`, et la carte entière disparaît.
    const e = Number.isFinite(this.echelle) && this.echelle > 0
      ? this.echelle : ECHELLE_MIN;
    ctx.setTransform(dpr * e, 0, 0, dpr * e,
      dpr * (largeur / 2 - this.centre.x * e),
      dpr * (hauteur / 2 - this.centre.y * e));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.traces) {
      /* Du plus discret au plus visible, pour que la chaussée passe par
         dessus les trottoirs et pas l'inverse. Les grands axes en dernier :
         c'est ce que la boucle évite, et le voir rend le service de l'app
         lisible d'un coup d'oeil. */
      for (const nom of ['sentiers', 'rues', 'axes']) {
        // Les trottoirs ne s'affichent qu'une fois qu'on a zoomé assez pour
        // que la nuance ait un sens ; de loin, ils empataient le dessin.
        if (nom === 'sentiers' && e < 0.25) continue;
        const v = VOIES[nom];
        ctx.strokeStyle = v.couleur;
        ctx.lineWidth = v.largeur / e;
        ctx.stroke(this.traces[nom]);
      }
    }

    /* Les deux couches de l'écran « Mon quartier ». Sous les feux et sous le
       parcours du jour : ce sont un fond, pas le sujet. */
    if (this.quartier && this.terrain) {
      ctx.fillStyle = TERRAIN;
      ctx.fill(this.terrain);
      ctx.strokeStyle = TERRAIN_BORD;
      ctx.lineWidth = 1.5 / e;
      ctx.stroke(this.terrain);
    }
    if (this.quartier && this.courues) {
      ctx.strokeStyle = COURUE;
      ctx.lineWidth = 3 / e;
      ctx.stroke(this.courues);
    }

    if (this.feux && e > 0.12) {
      ctx.fillStyle = '#5a3f2a';
      const r = 2.2 / e;
      for (const f of this.feux) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, 7);
        ctx.fill();
      }
    }

    if (this.trace) {
      // Le parcours entier s'assombrit dès qu'une portion est surlignée :
      // sans ce contraste, le surlignage ne se voit pas en plein soleil.
      ctx.strokeStyle = this.restant ? TRACE_ATTENUE : TRACE;
      ctx.lineWidth = 5 / e;
      ctx.stroke(this.trace);
    }

    if (this.restant) {
      ctx.strokeStyle = SUITE;
      ctx.lineWidth = 7 / e;
      ctx.stroke(this.restant);

    }

    /* Le sens du parcours, tout du long.
       ⚠️ Remplace la flèche jaune au bout du surlignage. Trop longue, elle
       dépassait du tracé et pointait dans le vide ; raccourcie et posée sur
       le trait, elle ne faisait plus que 10 px de large sur un trait de 7 et
       elle a « disparu ». Une flèche au bout ne disait de toute façon le sens
       qu'à un seul endroit, et seulement pendant la course : sur l'écran où
       l'on choisit, rien ne disait dans quel sens tourner. */
    if (this.pointsM) {
      const pas = pasPour(e);
      if (!this.chevrons || this.chevrons.pas !== pas) {
        this.chevrons = {
          pas,
          liste: placerChevrons(this.pointsM, pas,
            { depuis: this.suiviIndice ?? undefined, sens: this.suiviSens })
        };
      }
      /* Plus larges que le trait, qui fait 5 px : sinon ils s'y fondent,
         et c'est exactement ce qui avait fait disparaître la tête jaune. */
      const long = 4.4 / e, large = 6 / e;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const chemin = new Path2D();
      for (const { x, y, ang } of this.chevrons.liste) {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const bx = x - dx * long, by = y - dy * long;
        chemin.moveTo(bx - dy * large, by + dx * large);
        chemin.lineTo(x + dx * long, y + dy * long);
        chemin.lineTo(bx + dy * large, by - dx * large);
      }
      ctx.strokeStyle = CHEVRON_HALO;
      ctx.lineWidth = 5.5 / e;
      ctx.stroke(chemin);
      ctx.strokeStyle = CHEVRON;
      ctx.lineWidth = 2.6 / e;
      ctx.stroke(chemin);
      ctx.restore();
    }

    /* Le nombre de tours, au centre de la boucle. Il se dessine AVANT le
       rond de départ pour ne jamais le masquer. */
    if (this.tours && this.milieuTrace) {
      /* ⚠️ On reste dans la transformation courante et on divise les tailles
         par l'échelle, comme partout ailleurs ici. Reprojeter à la main avait
         inversé l'axe vertical, que cette transformation n'inverse pas :
         le chiffre partait de l'autre côté de la boucle. */
      const { x, y } = this.milieuTrace;
      ctx.save();
      ctx.font = `700 ${40 / e}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const texte = this.tours + '×';
      /* Un liseré sombre : le chiffre doit rester lisible sur le tracé vert
         comme sur le fond noir, sans peindre un rectangle derrière. */
      ctx.lineWidth = 6 / e;
      ctx.strokeStyle = 'rgba(13, 15, 18, .85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(texte, x, y);
      ctx.fillStyle = TRACE;
      ctx.fillText(texte, x, y);
      ctx.restore();
    }

    if (this.depart) {
      ctx.fillStyle = '#101215';
      ctx.strokeStyle = '#6ee7a0';
      ctx.lineWidth = 3 / e;
      ctx.beginPath();
      ctx.arc(this.depart.x, this.depart.y, 8 / e, 0, 7);
      ctx.fill();
      ctx.stroke();
    }

    /* Les noms en dernier : ils doivent se lire par-dessus tout, et c'est le
       seul ordre qui le garantisse. Ils sont dessinés en pixels, hors du
       repère transformé, sinon le texte serait étiré par l'échelle. */
    if (e >= ECHELLE_NOMS) this.dessinerLesNoms(ctx, e, largeur, hauteur, dpr);

    if (this.moi) {
      // Un disque plein, plus gros que le rond du départ : en courant, on
      // regarde l'écran une seconde, il faut le trouver du premier coup.
      ctx.fillStyle = MOI;
      ctx.beginPath();
      ctx.arc(this.moi.x, this.moi.y, 11 / e, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#101215';
      ctx.beginPath();
      ctx.arc(this.moi.x, this.moi.y, 5 / e, 0, 7);
      ctx.fill();
    }
  }

  /* Déplacement et pincement. Une carte qu'on ne peut pas bouger donne
     l'impression d'une image, et on n'y cherche pas sa rue. */
  brancher() {
    let doigts = new Map();
    let depart = null;

    const pos = e => {
      const r = this.c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.c.addEventListener('pointerdown', e => {
      this.c.setPointerCapture(e.pointerId);
      doigts.set(e.pointerId, pos(e));
      depart = this.instantane(doigts);
      this.enGeste = true;
    });

    this.c.addEventListener('pointermove', e => {
      if (!doigts.has(e.pointerId)) return;
      doigts.set(e.pointerId, pos(e));
      const maintenant = this.instantane(doigts);
      if (!depart || !maintenant) return;

      if (maintenant.n === 2 && depart.n === 2 && depart.ecart > 10) {
        this.echelle = depart.echelle * (maintenant.ecart / depart.ecart);
        this.echelle = Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, this.echelle));
      }
      this.centre = {
        x: depart.centre.x - (maintenant.milieu.x - depart.milieu.x) / this.echelle,
        y: depart.centre.y - (maintenant.milieu.y - depart.milieu.y) / this.echelle
      };
      this.dessiner();
    });

    const fin = e => {
      doigts.delete(e.pointerId);
      depart = doigts.size ? this.instantane(doigts) : null;
      if (!doigts.size) {
        // La carte s'immobilise : c'est le moment de rechoisir les noms.
        this.enGeste = false;
        this.nomsPour = '';
        this.dessiner();
      }
    };
    this.c.addEventListener('pointerup', fin);
    this.c.addEventListener('pointercancel', fin);

    this.c.addEventListener('wheel', e => {
      e.preventDefault();
      this.echelle = Math.max(ECHELLE_MIN,
        Math.min(ECHELLE_MAX, this.echelle * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      this.dessiner();
    }, { passive: false });

    const bouge = () => { this.deplacee = true; };
    this.c.addEventListener('pointermove', e => { if (doigts.has(e.pointerId)) bouge(); });
    this.c.addEventListener('wheel', bouge, { passive: true });

    const recadrer = () => {
      // Recadrer, sauf si elle a déplacé la carte elle-même : reprendre la
      // main sur son cadrage serait plus agaçant qu'utile.
      if (this.cadre && !this.deplacee) this.cadrer(this.cadre);
      this.dessiner();
    };
    addEventListener('resize', recadrer);

    /* ⚠️ `resize` ne suffit PAS : la carte est en `flex: 1` sous un panneau
       dont la hauteur change sans que la fenêtre bouge, quand on passe des
       réglages aux résultats ou qu'une quatrième carte s'ajoute. Entre ce
       changement et le dessin suivant, le navigateur ÉTIRE l'ancienne image
       pour remplir la nouvelle boîte, et un tracé penché paraît alors penché
       autrement. C'est ce qu'elle décrit : « pendant une seconde il est
       penché, pas droit ». Un observateur de taille suit la boîte
       elle-même. */
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(recadrer).observe(this.c);
    }
  }

  instantane(doigts) {
    const l = [...doigts.values()];
    if (!l.length) return null;
    const milieu = l.reduce((a, p) => ({ x: a.x + p.x / l.length, y: a.y + p.y / l.length }), { x: 0, y: 0 });
    const ecart = l.length === 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0;
    return { n: l.length, milieu, ecart, echelle: this.echelle, centre: { ...this.centre } };
  }
}
