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
const MOI = '#ffffff';

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
    this.feux = [...graphe.feux]
      .filter(id => graphe.noeuds.has(id))
      .map(id => this.versM(graphe.noeuds.get(id)));
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
    if (!this.origine) return;

    if (boucle && boucle.points.length) {
      const p = new Path2D();
      boucle.points.forEach((pt, i) => {
        const m = this.versM(pt);
        i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y);
      });
      this.trace = p;
    }
    this.depart = depart ? this.versM(depart) : null;
    this.dessiner();
  }

  /**
   * La position en direct, et les prochains mètres du parcours.
   *
   * C'est ce qui répond à « je tourne à gauche ou à droite ? » : voir où l'on
   * est ne suffit pas sur une boucle, il faut voir de quel côté elle
   * continue. Le segment surligné le dit sans qu'on ait à réfléchir.
   */
  suivre(moi, prochainsPoints) {
    this.poserOrigine(moi);
    this.moi = moi && this.origine ? this.versM(moi) : null;
    this.restant = null;
    this.pointe = null;
    if (prochainsPoints && prochainsPoints.length > 1 && this.origine) {
      const p = new Path2D();
      let avantDernier = null, dernier = null;
      prochainsPoints.forEach((pt, i) => {
        const m = this.versM(pt);
        i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y);
        avantDernier = dernier;
        dernier = m;
      });
      this.restant = p;
      // Le cap de la flèche se prend sur les derniers mètres du segment, pas
      // sur ses deux derniers points : deux points collés donnent un angle
      // qui saute d'un rafraîchissement à l'autre.
      const recul = prochainsPoints[Math.max(0, prochainsPoints.length - 4)];
      const rm = recul ? this.versM(recul) : avantDernier;
      if (rm && dernier) {
        this.pointe = { x: dernier.x, y: dernier.y,
                        ang: Math.atan2(dernier.y - rm.y, dernier.x - rm.x) };
      }
    }
    this.dessiner();
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

      /* La flèche au bout du surlignage. Ce n'est pas un ornement : une
         information portée par la seule couleur ne tient ni pour un
         daltonien, ni à bout de bras, ni essoufflée. Elle dit le SENS, ce
         que la couleur ne peut pas dire. */
      if (this.pointe) {
        /* ⚠️ Première version faussée : les deux coins de la base étaient
           placés à un rayon fixe et à ± 2,5 radians de la pointe, donc EN
           ARRIÈRE du dernier point. Le bout arrondi du trait, large de sept
           pixels, dépassait entre les deux côtés du triangle et dessinait une
           encoche : la flèche avait l'air cassée.

           La base se pose maintenant exactement sur le dernier point, en
           travers, et sa demi-largeur dépasse le rayon du bout arrondi : le
           trait est entièrement recouvert. */
        const { x, y, ang } = this.pointe;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const longueur = 15 / e, demiBase = 9.5 / e;
        ctx.fillStyle = SUITE;
        ctx.beginPath();
        ctx.moveTo(x + dx * longueur, y + dy * longueur);
        ctx.lineTo(x - dy * demiBase, y + dx * demiBase);
        ctx.lineTo(x + dy * demiBase, y - dx * demiBase);
        ctx.closePath();
        ctx.fill();
      }
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

    addEventListener('resize', () => {
      // Recadrer, sauf si elle a déplacé la carte elle-même : reprendre la
      // main sur son cadrage serait plus agaçant qu'utile.
      if (this.cadre && !this.deplacee) this.cadrer(this.cadre);
      this.dessiner();
    });
  }

  instantane(doigts) {
    const l = [...doigts.values()];
    if (!l.length) return null;
    const milieu = l.reduce((a, p) => ({ x: a.x + p.x / l.length, y: a.y + p.y / l.length }), { x: 0, y: 0 });
    const ecart = l.length === 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0;
    return { n: l.length, milieu, ecart, echelle: this.echelle, centre: { ...this.centre } };
  }
}
