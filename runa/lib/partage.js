/* =========================================================================
   Runa · partager un parcours

   Tout tient dans le lien : aucun serveur, aucune base, rien à héberger.
   Mesuré sur une boucle de 4,63 km du Plateau, 378 points bruts :

     JSON lat/lon complet ......... 7 858 caractères
     JSON allégé à 25 m .............. 978
     écarts successifs + base64url ... 262   ← ce fichier

   Le lien complet fait alors ~310 caractères, ce qui passe dans n'importe
   quelle messagerie et sous la limite d'URL de tous les navigateurs.

   ⚠️ Ce format ne transporte PAS une position en direct, et c'est
   volontaire : un PWA n'émet plus rien dès que l'écran s'éteint. Ce qu'on
   partage est une position DATÉE, prise au moment où l'on touche le bouton.
   Promettre un direct qu'on ne peut pas tenir serait pire que se taire.
   ========================================================================= */

const R = 6371008.8, RAD = Math.PI / 180;

/* Un point tous les vingt-cinq mètres : au-delà on transporte du bruit GPS,
   en deçà le tracé se casse dans les virages serrés. */
const PAS_M = 25;

/* Premier octet du paquet. Le changer casse les vieux liens, donc on le
   change plutôt que de deviner : un lien d'une version inconnue est refusé
   au lieu d'être mal lu. */
const VERSION = 1;
const AVEC_POSITION = 0x80;   // bit de poids fort du même octet

/* --------------------------------------------------------- les entiers */

/* Zigzag puis sept bits par octet : les écarts entre deux points voisins
   tiennent presque toujours sur un seul octet, positifs comme négatifs. */
function ecrireEntier(sortie, n) {
  let v = n < 0 ? (-n * 2 - 1) : n * 2;
  do {
    let c = v % 128;
    v = Math.floor(v / 128);
    if (v) c |= 0x80;
    sortie.push(c);
  } while (v);
}

function lireEntier(octets, curseur) {
  let v = 0, decalage = 1, c;
  do {
    if (curseur.i >= octets.length) throw new Error('tronqué');
    c = octets[curseur.i++];
    v += (c & 0x7f) * decalage;
    decalage *= 128;
  } while (c & 0x80);
  return (v % 2) ? -((v + 1) / 2) : v / 2;
}

/* ------------------------------------------------------------- base64url */

function versTexte(octets) {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function versOctets(texte) {
  const s = atob(texte.replace(/-/g, '+').replace(/_/g, '/'));
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}

/* ------------------------------------------------------------- encoder */

/**
 * @param {{m:number, points:{lat:number,lon:number}[]}} boucle
 * @param {{lat:number,lon:number,quand:number}} [position] où l'on est AU
 *   MOMENT du partage, si on veut la joindre
 * @returns {string} à mettre après le `#p=` d'une adresse
 */
export function encoder(boucle, position) {
  const pts = boucle && boucle.points;
  if (!pts || pts.length < 3) return null;

  const o = [];
  o.push(VERSION | (position ? AVEC_POSITION : 0));

  /* L'origine en centmillièmes de degré : environ un mètre, la précision
     utile pour retrouver une rue. */
  const lat0 = Math.round(pts[0].lat * 1e5), lon0 = Math.round(pts[0].lon * 1e5);
  ecrireEntier(o, lat0);
  ecrireEntier(o, lon0);

  const kx = R * RAD * Math.cos(pts[0].lat * RAD), ky = R * RAD;
  const versM = p => [Math.round((p.lon - pts[0].lon) * kx),
                      Math.round((p.lat - pts[0].lat) * ky)];

  const gardes = [];
  let dernier = null;
  for (const p of pts) {
    const m = versM(p);
    if (dernier && Math.hypot(m[0] - dernier[0], m[1] - dernier[1]) < PAS_M) continue;
    gardes.push(m);
    dernier = m;
  }
  if (gardes.length < 3) return null;

  ecrireEntier(o, gardes.length);
  ecrireEntier(o, Math.round(boucle.m));
  let px = 0, py = 0;
  for (const [x, y] of gardes) {
    ecrireEntier(o, x - px);
    ecrireEntier(o, y - py);
    px = x; py = y;
  }

  if (position) {
    ecrireEntier(o, Math.round(position.lat * 1e5) - lat0);
    ecrireEntier(o, Math.round(position.lon * 1e5) - lon0);
    // En minutes depuis l'époque : la seconde n'apprend rien et coûte deux
    // octets de plus dans un lien qu'on veut court.
    ecrireEntier(o, Math.round((position.quand || Date.now()) / 60000));
  }
  return versTexte(o);
}

/* -------------------------------------------------------------- décoder */

/**
 * Rend `null` sur n'importe quelle entrée abîmée plutôt que de lever : un
 * lien tronqué par une messagerie, recopié à la main ou d'une version
 * inconnue est une chose qui ARRIVE, pas une erreur de programmation.
 */
export function decoder(texte) {
  if (typeof texte !== 'string' || texte.length < 8) return null;
  try {
    const octets = versOctets(texte);
    const entete = octets[0];
    if ((entete & 0x7f) !== VERSION) return null;

    const c = { i: 1 };
    const lat0 = lireEntier(octets, c) / 1e5;
    const lon0 = lireEntier(octets, c) / 1e5;
    if (Math.abs(lat0) > 90 || Math.abs(lon0) > 180) return null;

    const combien = lireEntier(octets, c);
    if (combien < 3 || combien > 2000) return null;
    const m = lireEntier(octets, c);
    if (m < 0 || m > 200000) return null;

    const kx = R * RAD * Math.cos(lat0 * RAD), ky = R * RAD;
    const points = [];
    let x = 0, y = 0;
    for (let k = 0; k < combien; k++) {
      x += lireEntier(octets, c);
      y += lireEntier(octets, c);
      points.push({ lat: lat0 + y / ky, lon: lon0 + x / kx });
    }

    let position = null;
    if (entete & AVEC_POSITION) {
      const dLat = lireEntier(octets, c), dLon = lireEntier(octets, c);
      const minutes = lireEntier(octets, c);
      position = {
        lat: (Math.round(lat0 * 1e5) + dLat) / 1e5,
        lon: (Math.round(lon0 * 1e5) + dLon) / 1e5,
        quand: minutes * 60000
      };
    }
    return { m, points, position };
  } catch (e) {
    return null;
  }
}
