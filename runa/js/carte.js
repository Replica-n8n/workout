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

export class Carte {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.origine = null;      // {lat, lon} : le zéro du repère en mètres
    this.rues = null;         // Path2D en mètres
    this.grandsAxes = null;
    this.trace = null;
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
    const rues = new Path2D();
    const axes = new Path2D();
    const vus = new Set();

    for (const [de, liste] of graphe.voisins) {
      for (const a of liste) {
        if (de > a.vers) continue;          // chaque arête une seule fois
        const cle = de + ':' + a.vers;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const p1 = this.versM(graphe.noeuds.get(de));
        const p2 = this.versM(graphe.noeuds.get(a.vers));
        const t = graphe.ways.get(a.way);
        const cible = t && /^(primary|secondary|tertiary)/.test(t.highway || '') ? axes : rues;
        cible.moveTo(p1.x, p1.y);
        cible.lineTo(p2.x, p2.y);
      }
    }
    this.rues = rues;
    this.grandsAxes = axes;
    this.feux = [...graphe.feux]
      .filter(id => graphe.noeuds.has(id))
      .map(id => this.versM(graphe.noeuds.get(id)));
  }

  /** Cadre la vue sur une boucle, avec une marge. */
  cadrer(points) {
    if (!points || !points.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      const m = this.versM(p);
      if (m.x < x0) x0 = m.x; if (m.x > x1) x1 = m.x;
      if (m.y < y0) y0 = m.y; if (m.y > y1) y1 = m.y;
    }
    const { largeur, hauteur } = this.taille();
    const marge = 28;
    this.echelle = Math.min(
      (largeur - marge * 2) / Math.max(x1 - x0, 1),
      (hauteur - marge * 2) / Math.max(y1 - y0, 1)
    );
    this.centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
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

    const e = this.echelle;
    ctx.setTransform(dpr * e, 0, 0, dpr * e,
      dpr * (largeur / 2 - this.centre.x * e),
      dpr * (hauteur / 2 - this.centre.y * e));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.rues) {
      ctx.strokeStyle = '#272c33';
      ctx.lineWidth = 2.5 / e;
      ctx.stroke(this.rues);
    }
    if (this.grandsAxes) {
      // Les grands axes en plus clair : c'est ce que la boucle évite, et le
      // voir rend le service de l'app lisible d'un coup d'oeil.
      ctx.strokeStyle = '#3a424c';
      ctx.lineWidth = 4.5 / e;
      ctx.stroke(this.grandsAxes);
    }

    if (this.feux && e > 0.12) {
      ctx.fillStyle = '#5a3f2a';
      const r = 2.6 / e;
      for (const f of this.feux) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, 7);
        ctx.fill();
      }
    }

    if (this.trace) {
      ctx.strokeStyle = '#6ee7a0';
      ctx.lineWidth = 5 / e;
      ctx.stroke(this.trace);
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
        this.echelle = Math.max(0.03, Math.min(3, this.echelle));
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
      this.echelle = Math.max(0.03, Math.min(3, this.echelle * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      this.dessiner();
    }, { passive: false });

    addEventListener('resize', () => this.dessiner());
  }

  instantane(doigts) {
    const l = [...doigts.values()];
    if (!l.length) return null;
    const milieu = l.reduce((a, p) => ({ x: a.x + p.x / l.length, y: a.y + p.y / l.length }), { x: 0, y: 0 });
    const ecart = l.length === 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0;
    return { n: l.length, milieu, ecart, echelle: this.echelle, centre: { ...this.centre } };
  }
}
