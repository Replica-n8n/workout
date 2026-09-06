/* =========================================================================
   Runa · l'assemblage

   Ce fichier ne calcule rien : il branche l'interface sur les modules de
   `lib/`, qui eux sont testés sans navigateur. Tout ce qui ressemble à une
   règle métier ici serait au mauvais endroit.
   ========================================================================= */

import { bbox, distancePour } from '../lib/geo.js';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { genererBoucles } from '../lib/loop.js';
import { charger } from './donnees.js';
import { Carte } from './carte.js';

const $ = id => document.getElementById(id);
const CLE = 'runa-reglages-v1';

const DUREES = [20, 30, 40, 50, 60];

const etat = {
  depart: null,
  duree: 30,
  allure: 360,          // secondes par km
  eviterFeux: true,
  nuit: false,
  graphe: null,
  grapheDe: null,       // le départ pour lequel le graphe a été construit
  boucles: [],
  choisie: 0,
  graine: 1
};

const carte = new Carte($('carte'));

/* ------------------------------------------------------------ réglages */

function lireReglages() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE));
    if (r) Object.assign(etat, {
      depart: r.depart ?? null,
      duree: r.duree ?? 30,
      allure: r.allure ?? 360,
      eviterFeux: r.eviterFeux ?? true,
      nuit: r.nuit ?? false
    });
  } catch (e) { /* premier lancement, ou stockage refusé */ }
}

function ecrireReglages() {
  try {
    localStorage.setItem(CLE, JSON.stringify({
      depart: etat.depart, duree: etat.duree, allure: etat.allure,
      eviterFeux: etat.eviterFeux, nuit: etat.nuit
    }));
  } catch (e) {}
}

const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function peindreReglages() {
  $('durees').innerHTML = '';
  for (const d of DUREES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = d;
    b.setAttribute('aria-pressed', String(d === etat.duree));
    b.setAttribute('aria-label', `${d} minutes`);
    b.addEventListener('click', () => { etat.duree = d; ecrireReglages(); peindreReglages(); });
    $('durees').appendChild(b);
  }
  $('allure-val').textContent = mmss(etat.allure);
  $('opt-feux').setAttribute('aria-pressed', String(etat.eviterFeux));
  $('opt-nuit').setAttribute('aria-pressed', String(etat.nuit));

  const km = distancePour(etat.duree * 60, etat.allure) / 1000;
  $('chercher').textContent = `Trouver trois boucles de ${km.toFixed(1)} km`;
}

/* ---------------------------------------------------------------- états */

let effacerEtat = null;
function dire(texte, erreur = false) {
  clearTimeout(effacerEtat);
  const e = $('etat');
  if (!texte) { e.hidden = true; return; }
  e.textContent = texte;
  e.classList.toggle('erreur', erreur);
  e.hidden = false;
}
function direUnMoment(texte, erreur = false) {
  dire(texte, erreur);
  effacerEtat = setTimeout(() => dire(null), erreur ? 9000 : 3500);
}

/* ------------------------------------------------------------- position */

function positionner() {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error('nogeo'));
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
      e => ko(e),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  });
}

/* --------------------------------------------------------------- rayon */

/* La spec demande une boîte de D/4 autour du départ. En dessous de 900 m le
   graphe devient trop maigre pour offrir un choix, au-delà de 2,5 km on
   télécharge des quartiers qu'aucune boucle n'atteindra. */
function rayonPour(distanceCible) {
  return Math.max(900, Math.min(2500, distanceCible / 4));
}

/* --------------------------------------------------------------- action */

let enCours = false;

async function chercher(nouvelleGraine) {
  if (enCours) return;
  enCours = true;
  $('chercher').disabled = true;

  try {
    if (!etat.depart) {
      dire('Recherche de votre position...');
      etat.depart = await positionner();
      ecrireReglages();
    }

    const cible = distancePour(etat.duree * 60, etat.allure);
    const rayon = rayonPour(cible);

    const memeZone = etat.grapheDe &&
      Math.abs(etat.grapheDe.lat - etat.depart.lat) < 0.004 &&
      Math.abs(etat.grapheDe.lon - etat.depart.lon) < 0.006 &&
      etat.grapheDe.rayon >= rayon &&
      etat.grapheDe.nuit === etat.nuit &&
      // Les deux options changent le POIDS des arêtes, donc le graphe entier.
      // Les vérifier ici plutôt que de compter sur les gestionnaires de clic
      // pour invalider : un jour on ajoutera une troisième option et on
      // oubliera la ligne d'invalidation, sans que rien ne le signale.
      etat.grapheDe.eviterFeux === etat.eviterFeux;

    if (!memeZone) {
      dire('Chargement des rues...');
      const osm = await charger(bbox(etat.depart, rayon), (fait, total, toutEnCache) => {
        if (toutEnCache) return dire('Quartier déjà en mémoire');
        // Le premier quartier prend une bonne minute : le dire évite de
        // croire que l'app est plantée et de la fermer.
        dire(`Téléchargement du quartier ${fait} sur ${total}, une minute environ`);
      });

      const brut = construireGraphe(osm, { nuit: etat.nuit, eviterFeux: etat.eviterFeux });
      etat.graphe = plusGrandeComposante(brut);
      etat.grapheDe = { ...etat.depart, rayon, nuit: etat.nuit, eviterFeux: etat.eviterFeux };
      carte.charger(etat.graphe, etat.depart);
    }

    if (etat.graphe.voisins.size < 50) {
      throw new Error('desert');
    }

    dire('Calcul des boucles...');
    if (nouvelleGraine) etat.graine = (etat.graine + 1) % 100000;

    const t0 = performance.now();
    etat.boucles = genererBoucles(etat.graphe, {
      depart: etat.depart,
      distanceCible: cible,
      graine: etat.graine
    });
    const ms = performance.now() - t0;

    if (!etat.boucles.length) throw new Error('rien');

    etat.choisie = 0;
    montrerResultats(cible, ms);
    dire(null);
  } catch (e) {
    dire(message(e), true);
  } finally {
    enCours = false;
    $('chercher').disabled = false;
  }
}

function message(e) {
  if (e && e.code === 1) return 'Position refusée. Autorisez la localisation pour ce site, puis réessayez.';
  if (e && e.code === 2) return 'Position indisponible. Sortez ou activez la localisation, puis réessayez.';
  if (e && e.code === 3) return 'La position met trop de temps à arriver. Réessayez.';
  if (e && e.message === 'debit') return 'Le serveur OpenStreetMap est saturé. Réessayez dans une minute.';
  if (e && e.message === 'lent') return 'Le serveur OpenStreetMap ne répond pas. Réessayez dans une minute.';
  if (e && e.message === 'desert') return 'Trop peu de rues autour de ce départ pour tracer une boucle.';
  if (e && e.message === 'rien') return 'Aucune boucle trouvée ici à cette distance. Essayez une autre durée.';
  if (e && e.message === 'reseau') return 'Pas de réseau, et ce quartier n’est pas encore en mémoire.';
  return 'Échec : ' + (e && e.message ? e.message : 'inconnu');
}

/* ----------------------------------------------------------- résultats */

function montrerResultats(cible, ms) {
  $('reglages').hidden = true;
  $('resultats').hidden = false;

  $('resume').textContent =
    `${etat.boucles.length} boucles, cible ${(cible / 1000).toFixed(1)} km, ${Math.round(ms)} ms`;

  const zone = $('boucles');
  zone.innerHTML = '';
  etat.boucles.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'boucle';
    el.type = 'button';
    el.setAttribute('aria-pressed', String(i === etat.choisie));

    const minutes = Math.round((b.m / 1000) * (etat.allure / 60));
    const feux = b.feux === 0 ? '<b>aucun feu</b>'
               : b.feux === 1 ? '<b>1 feu</b>'
               : `<b>${b.feux} feux</b>`;
    const eclaire = b.fractionEclairee === null
      ? 'éclairage non renseigné'
      : `${Math.round(b.fractionEclairee * 100)} % éclairé`;

    // Trois boucles de même longueur avec le même profil sont
    // indiscernables sur la carte comme dans la liste. La direction est ce
    // qui permet de choisir : on ne veut pas toujours partir du même côté.
    // « vers le est » : l'élision se fait devant une voyelle, et seuls
    // « est » et « ouest » sont concernés dans la rose des vents.
    const article = /^[aeiouy]/.test(b.direction || '') ? 'l’' : 'le ';
    const ou = b.direction ? `vers ${article}<b>${b.direction}</b> · ` : '';

    el.innerHTML =
      `<span class="km">${(b.m / 1000).toFixed(2)} km</span>` +
      `<span class="detail">${ou}${feux}<br>environ ${minutes} min · ${eclaire}</span>` +
      `<span class="puce" aria-hidden="true"></span>`;
    el.setAttribute('aria-label',
      `Boucle de ${(b.m / 1000).toFixed(2)} kilomètres ${b.direction ? 'vers ' + article + b.direction : ''}, ` +
      `${b.feux} feu${b.feux > 1 ? 'x' : ''}, environ ${minutes} minutes`);
    el.addEventListener('click', () => { etat.choisie = i; montrerResultats(cible, ms); });
    zone.appendChild(el);
  });

  const b = etat.boucles[etat.choisie];
  carte.cadrer(b.points);
  carte.montrer(b, etat.depart);
}

/* -------------------------------------------------------------- branche */

$('allure-moins').addEventListener('click', () => {
  etat.allure = Math.min(9 * 60, etat.allure + 10); ecrireReglages(); peindreReglages();
});
$('allure-plus').addEventListener('click', () => {
  etat.allure = Math.max(3 * 60, etat.allure - 10); ecrireReglages(); peindreReglages();
});
$('opt-feux').addEventListener('click', () => {
  etat.eviterFeux = !etat.eviterFeux; ecrireReglages(); peindreReglages();
  etat.grapheDe = null;   // le poids des arêtes change, le graphe est à refaire
});
$('opt-nuit').addEventListener('click', () => {
  etat.nuit = !etat.nuit; ecrireReglages(); peindreReglages();
  etat.grapheDe = null;
});
$('chercher').addEventListener('click', () => chercher(false));
$('autres').addEventListener('click', () => chercher(true));
$('retour').addEventListener('click', () => {
  $('resultats').hidden = true;
  $('reglages').hidden = false;
});

/* Une pression brève sur la carte déplace le départ. Le déplacement et le
   pincement restent gérés par la carte : on ne réagit qu'à un appui qui
   n'a ni duré ni bougé. */
(() => {
  const c = $('carte');
  let t0 = 0, x0 = 0, y0 = 0, doigts = 0;
  c.addEventListener('pointerdown', e => { t0 = Date.now(); x0 = e.clientX; y0 = e.clientY; doigts++; });
  c.addEventListener('pointercancel', () => { doigts = Math.max(0, doigts - 1); });
  c.addEventListener('pointerup', e => {
    const seul = doigts === 1;
    doigts = Math.max(0, doigts - 1);
    if (!seul || !carte.origine) return;
    if (Date.now() - t0 > 400) return;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 12) return;

    const r = c.getBoundingClientRect();
    const { largeur, hauteur } = carte.taille();
    const x = carte.centre.x + ((e.clientX - r.left) - largeur / 2) / carte.echelle;
    const y = carte.centre.y + ((e.clientY - r.top) - hauteur / 2) / carte.echelle;
    etat.depart = carte.versLatLon(x, y);
    ecrireReglages();

    // Les boucles affichées partaient de l'ANCIEN point : les garder à
    // l'écran montrerait un tracé qui ne passe plus par le départ, ce qui
    // se lit comme un bug de la carte alors que c'est un tracé périmé.
    etat.boucles = [];
    etat.choisie = 0;
    $('resultats').hidden = true;
    $('reglages').hidden = false;
    carte.montrer(null, etat.depart);
    direUnMoment('Départ déplacé.');
  });
})();

lireReglages();
peindreReglages();
if (etat.depart) carte.montrer(null, etat.depart);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
