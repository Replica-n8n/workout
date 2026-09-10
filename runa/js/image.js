/* =========================================================================
   Runa · l'image qu'on envoie dans une conversation

   Un lien s'affiche comme une adresse nue : il faut le toucher, faire
   confiance, attendre. Une image se voit tout de suite. On envoie donc les
   deux, et cette image doit se suffire à elle-même : renvoyée à quelqu'un
   d'autre ou simplement enregistrée, elle perd sa légende.

   Format carré 1080, celui que les messageries affichent en entier sans
   recadrer. Le carrefour est posé SUR la carte, à côté du point, pour que
   l'oeil n'ait pas à le chercher ; le bandeau porte les chiffres.
   ========================================================================= */

import { nombre, plusProches } from '../lib/carrefour.js';
import { minutesPour } from '../lib/geo.js';
import { Place, placerLesRues } from '../lib/etiquettes.js';

const COTE = 1080;
const BANDEAU = 210;
const MARGE = 70;

const FOND = '#0d0f12';
const SENTIER = '#181c22';
const RUE = '#2b313a';
const TRACE = '#6ee7a0';
const PANNEAU = '#12151a';
const TRAIT = '#2a3038';
const TEXTE = '#eef2f6';
const GRIS = '#9aa4b2';

/* Les repères, chacun sa couleur : on doit pouvoir distinguer un parc d'un
   café sans lire, d'un coup d'oeil dans une conversation. */
const NOM_DE_RUE = '#8b95a3';
const PARC = '#7fd6a0';
const STATION = '#c9b3ff';
const TABLE = '#ffc457';
const CORPS_RUE = 21;

const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const R = 6371008.8, RAD = Math.PI / 180;

const EST_RUE = t =>
  /^(residential|tertiary|secondary|primary|living_street|unclassified|pedestrian)$/.test(t.highway)
  || (t.highway === 'service' && t.service === 'alley');

/**
 * Dessine et rend une image JPEG.
 *
 * @param {object} o
 * @param {{points:{lat,lon}[], m:number}} o.boucle
 * @param {object|null} o.graphe          pour les rues autour ; sans lui on
 *   dessine le tracé seul, ce qui reste lisible
 * @param {{lat,lon,quand}|null} o.position
 * @param {string|null} o.carrefour       « Marie-Anne Est et Coloniale »
 * @param {number|null} o.restantM
 * @param {number} o.allure               secondes par kilomètre
 * @param {{parcs:[],stations:[],tables:[]}|null} o.reperes
 * @returns {Promise<Blob|null>}
 */
export function dessinerPartage(o) {
  const { boucle, graphe, position, carrefour, restantM, allure = 360,
          reperes = null } = o;
  if (!boucle || !boucle.points || boucle.points.length < 3) return Promise.resolve(null);

  const c = document.createElement('canvas');
  c.width = COTE; c.height = COTE;
  const ctx = c.getContext('2d');

  const zero = boucle.points[0];
  const kx = R * RAD * Math.cos(zero.lat * RAD), ky = R * RAD;
  const X = p => (p.lon - zero.lon) * kx, Y = p => (p.lat - zero.lat) * ky;

  /* Le cadrage : la boucle entière, avec une marge, jamais plus. */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of boucle.points) {
    const x = X(p), y = Y(p);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const haut = COTE - BANDEAU;
  // Une boucle dégénérée (tous les points au même endroit) donnerait une
  // division par zéro et un canvas vide.
  const largeurM = Math.max(x1 - x0, 50), hauteurM = Math.max(y1 - y0, 50);
  const e = Math.min((COTE - MARGE * 2) / largeurM, (haut - MARGE * 2) / hauteurM);
  const cx = COTE / 2 - (x0 + x1) / 2 * e, cy = haut / 2 + (y0 + y1) / 2 * e;
  const px = p => X(p) * e + cx;
  const py = p => -Y(p) * e + cy;

  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, COTE, COTE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (graphe) {
    /* Deux passes, du plus discret au plus visible : la chaussée doit passer
       par dessus les trottoirs, pas l'inverse. */
    for (const [nom, couleur, epaisseur] of
         [['sentiers', SENTIER, 3], ['rues', RUE, 6]]) {
      ctx.strokeStyle = couleur;
      ctx.lineWidth = epaisseur;
      ctx.beginPath();
      const vus = new Set();
      for (const [de, liens] of graphe.voisins) {
        for (const l of liens) {
          if (de > l.vers) continue;
          const cle = de + ':' + l.vers;
          if (vus.has(cle)) continue;
          vus.add(cle);
          const t = graphe.ways.get(l.way);
          const estRue = t ? EST_RUE(t) : false;
          if ((nom === 'rues') !== estRue) continue;
          const n1 = graphe.noeuds.get(de), n2 = graphe.noeuds.get(l.vers);
          if (!n1 || !n2) continue;
          ctx.moveTo(px(n1), py(n1));
          ctx.lineTo(px(n2), py(n2));
        }
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = TRACE;
  ctx.lineWidth = 13;
  ctx.beginPath();
  boucle.points.forEach((p, i) => {
    i ? ctx.lineTo(px(p), py(p)) : ctx.moveTo(px(p), py(p));
  });
  ctx.closePath();
  ctx.stroke();

  /* Les repères, puis les noms de rues. Dans cet ordre : les repères sont
     une dizaine et ce sont les plus forts, les noms de rues se rangent
     autour de ce qui reste. */
  const place = new Place(COTE, haut);
  if (reperes && position) {
    dessinerReperes(ctx, place, {
      parcs: plusProches(reperes.parcs, position, 4),
      stations: plusProches(reperes.stations, position, 2),
      tables: plusProches(reperes.tables, position, 4, 450)
    }, px, py);
  }
  if (graphe) dessinerLesRues(ctx, place, graphe, px, py, boucle);

  // Le départ : un anneau, pour ne pas le confondre avec le point plein.
  ctx.beginPath();
  ctx.arc(px(zero), py(zero), 17, 0, 7);
  ctx.fillStyle = '#101215';
  ctx.fill();
  ctx.strokeStyle = TRACE;
  ctx.lineWidth = 7;
  ctx.stroke();

  if (position) {
    const mx = px(position), my = py(position);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx, my, 14, 0, 7); ctx.fill();

    if (carrefour) {
      ctx.font = `600 30px ${POLICE}`;
      const larg = ctx.measureText(carrefour).width + 44;
      /* ⚠️ L'étiquette bascule du côté opposé quand le point est près du
         bord : sinon elle sort de l'image, et c'est précisément le nom
         qu'on voulait donner qui manque. */
      const aDroite = mx + 34 + larg + 20 <= COTE;
      const ex = aDroite ? mx + 34 : Math.max(20, mx - 34 - larg);
      const ey = Math.min(Math.max(my - 27, 20), haut - 74);
      coinsArrondis(ctx, ex, ey, larg, 54, 12);
      ctx.fillStyle = PANNEAU; ctx.fill();
      ctx.strokeStyle = '#3a424c'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = TEXTE;
      ctx.textAlign = 'center';
      ctx.fillText(carrefour, ex + larg / 2, ey + 36);
      ctx.textAlign = 'left';
    }
  }

  /* Le bandeau : ce qui sert à celui qui reçoit. */
  ctx.fillStyle = PANNEAU;
  ctx.fillRect(0, haut, COTE, BANDEAU);
  ctx.fillStyle = TRAIT;
  ctx.fillRect(0, haut, COTE, 2);

  const km = boucle.m / 1000;
  const grosse = restantM != null
    ? `Il me reste ${nombre(restantM / 1000)} km, environ ${minutesPour(restantM, allure)} min`
    : `${nombre(km, 2)} km, environ ${minutesPour(km * 1000, allure)} min`;
  const petite = restantM != null
    ? `boucle de ${nombre(km, 2)} km${position ? ' · position à ' + heure(position.quand) : ''}`
    : (position ? 'position à ' + heure(position.quand) : 'ma boucle du jour');

  // La taille s'ajuste : un nom long en corps 62 débordait du cadre.
  ctx.fillStyle = TEXTE;
  ctx.font = `700 ${tailleQuiTient(ctx, grosse, 62, COTE - 130, POLICE, 700)}px ${POLICE}`;
  ctx.fillText(grosse, 60, haut + 78);

  ctx.fillStyle = GRIS;
  ctx.font = `400 ${tailleQuiTient(ctx, petite, 36, COTE - 130, POLICE, 400)}px ${POLICE}`;
  ctx.fillText(petite, 60, haut + 134);

  ctx.fillStyle = TRACE;
  ctx.font = `600 34px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.fillText('Runa', COTE - 60, COTE - 46);
  ctx.textAlign = 'left';

  /* JPEG et non PNG : mesuré sur la même image, 215 Ko contre 688. Sur un
     forfait mobile la différence compte, et la messagerie recompresserait
     de toute façon en JPEG. À 0,9 le texte du bandeau reste net, ce qui est
     la seule chose que la compression pouvait abîmer ici. */
  return new Promise(ok => c.toBlob(b => ok(b), 'image/jpeg', 0.9));
}

/* --------------------------------------------------------- les étiquettes */

/** Un texte lisible sur n'importe quel fond : halo sombre, puis le texte. */
function ecrire(ctx, texte, x, y, couleur, corps, graisse, halo) {
  ctx.font = `${graisse} ${corps}px ${POLICE}`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = FOND;
  ctx.lineWidth = halo;
  ctx.strokeText(texte, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(texte, x, y);
}

function dessinerReperes(ctx, place, r, px, py) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const familles = [
    [r.stations, STATION, '#5b48a8', 25, 'carre'],
    [r.parcs, PARC, '#3f7d5c', 25, 'rond'],
    [r.tables, TABLE, '#9a7326', 24, 'rond']
  ];
  for (const [liste, couleur, pastille, corps, forme] of familles) {
    for (const o of liste) {
      const x = px(o), y = py(o);
      ctx.font = `600 ${corps}px ${POLICE}`;
      const larg = ctx.measureText(o.nom).width + 26;
      /* ⚠️ Le nom bascule à gauche quand il ne tient pas à droite. Les
         repères les plus proches sont, par construction, autour de la
         position, et celle-ci tombe souvent près d'un bord : mesuré, les
         quatre tables les plus proches étaient toutes entre x=757 et x=957
         sur 1080, donc toutes refusées faute de place à droite. */
      const aDroite = x + 12 + larg <= place.nx * place.pas;
      const centre = aDroite ? x + larg / 2 + 12 : x - larg / 2 - 12;
      if (!place.poser(centre, y, larg, corps + 8)) continue;
      ctx.fillStyle = pastille;
      if (forme === 'carre') ctx.fillRect(x - 9, y - 9, 18, 18);
      else { ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); }
      ctx.textAlign = aDroite ? 'left' : 'right';
      ecrire(ctx, o.nom, aDroite ? x + 16 : x - 16, y, couleur, corps, 600, 5);
      ctx.textAlign = 'left';
    }
  }
}

/**
 * Les noms de rues, écrits le long des rues.
 *
 * Un nom qui tombe sur le tracé passe en blanc gras avec un halo plus épais :
 * l'interdire supprimerait justement les rues que la boucle emprunte, celles
 * qu'on veut le plus lire.
 */
function dessinerLesRues(ctx, place, graphe, px, py, boucle) {
  const morceaux = new Map();
  const vus = new Set();
  for (const [de, liens] of graphe.voisins) {
    for (const l of liens) {
      if (de > l.vers) continue;
      const cle = de + ':' + l.vers;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const t = graphe.ways.get(l.way);
      if (!t || !t.name || !EST_RUE(t)) continue;
      const n1 = graphe.noeuds.get(de), n2 = graphe.noeuds.get(l.vers);
      if (!n1 || !n2) continue;
      const liste = morceaux.get(t.name) || [];
      liste.push([[px(n1), py(n1)], [px(n2), py(n2)]]);
      morceaux.set(t.name, liste);
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const largeurDe = t => {
    ctx.font = `500 ${CORPS_RUE}px ${POLICE}`;
    return ctx.measureText(t).width;
  };
  const posees = placerLesRues(morceaux, place, largeurDe,
    { hauteur: CORPS_RUE + 8 });

  /* Où passe le tracé, pour savoir quels noms écrire en clair. */
  const surTrace = new Set();
  const grille = (x, y) => Math.floor(x / 24) + ':' + Math.floor(y / 24);
  for (let i = 1; i < boucle.points.length; i++) {
    const a = [px(boucle.points[i - 1]), py(boucle.points[i - 1])];
    const b = [px(boucle.points[i]), py(boucle.points[i])];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
    for (let k = 0; k <= n; k++) {
      surTrace.add(grille(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
    }
  }

  for (const l of posees) {
    const dessus = surTrace.has(grille(l.x, l.y));
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.angle);
    ecrire(ctx, l.texte, 0, 0,
      dessus ? TEXTE : NOM_DE_RUE, CORPS_RUE, dessus ? 700 : 500, dessus ? 7 : 5);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** La plus grande taille qui tient, mesurée pour de vrai. */
function tailleQuiTient(ctx, texte, max, largeur, police, graisse) {
  for (let t = max; t > 20; t -= 2) {
    ctx.font = `${graisse} ${t}px ${police}`;
    if (ctx.measureText(texte).width <= largeur) return t;
  }
  return 20;
}

function coinsArrondis(ctx, x, y, l, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

function heure(quand) {
  const d = new Date(quand || Date.now());
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}
