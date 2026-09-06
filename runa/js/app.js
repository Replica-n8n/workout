/* =========================================================================
   Runa · l'assemblage

   Ce fichier ne calcule rien : il branche l'interface sur les modules de
   `lib/`, qui eux sont testés sans navigateur. Tout ce qui ressemble à une
   règle métier ici serait au mauvais endroit.
   ========================================================================= */

import { bbox, distancePour } from '../lib/geo.js';
import { construireGraphe, plusGrandeComposante } from '../lib/graph.js';
import { genererBoucles } from '../lib/loop.js';
import { accrocher, sensDeMarche, segmentSuivant, metresRestants, ECART_MAX_M } from '../lib/suivi.js';
import { charger, chargerDuCache } from './donnees.js';
import { Carte } from './carte.js';

const $ = id => document.getElementById(id);
const CLE = 'runa-reglages-v1';
const CLE_PARCOURS = 'runa-parcours-v1';
/* Au-delà, le parcours mémorisé n'est plus « celui en cours » mais celui
   d'avant-hier, et le restaurer au lancement embrouillerait. */
const PARCOURS_VALIDE_MS = 8 * 3600 * 1000;

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

  peindreDepart();

  const km = distancePour(etat.duree * 60, etat.allure) / 1000;
  $('chercher').textContent = `Trouver trois boucles de ${km.toFixed(1)} km`;
}

/* Un point de départ mémorisé qui ne se voit pas est un piège : l'app
   calculerait sagement des boucles autour de chez soi alors qu'on est parti
   du bureau, sans que rien ne le dise. La ligne affiche donc toujours d'où
   vient le départ, et son âge dès qu'il commence à dater. */
function ageEnMots(ms) {
  const min = Math.round(ms / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'hier' : `il y a ${j} jours`;
}

function peindreDepart() {
  const el = $('depart-quoi');
  el.className = 'sous';
  const d = etat.depart;

  if (!d) { el.textContent = 'pas encore défini'; return; }

  if (d.source !== 'gps') { el.textContent = 'point choisi sur la carte'; return; }

  const age = d.quand ? Date.now() - d.quand : null;
  // Au-delà de 50 m, le point tombe facilement dans la rue d'à côté, et
  // toute la boucle part du mauvais endroit sans que ça se voie.
  const precise = !d.precision || d.precision <= 50;
  const bouts = ['ma position'];
  if (age !== null && age > 30 * 60000) bouts.push(ageEnMots(age));
  if (d.precision) bouts.push(`à ${Math.round(d.precision)} m près`);
  el.textContent = bouts.join(', ');

  if (!precise) el.classList.add('faux');
  else if (age !== null && age > 6 * 3600000) el.classList.add('vieux');
}

/* --------------------------------------------------- le parcours en cours

   ⚠️ Sans ça, sortir le téléphone de sa poche en pleine course pouvait
   rendre un écran vide : Android est libre de tuer une PWA passée en
   arrière-plan, et l'app rouvrait alors sans le parcours qu'on était en
   train de suivre. Le tracé choisi est donc écrit sur le disque dès qu'il
   est choisi, pas gardé en mémoire. */

function sauverParcours(b) {
  try {
    localStorage.setItem(CLE_PARCOURS, JSON.stringify({
      quand: Date.now(),
      m: b.m, feux: b.feux, rues: b.rues,
      fractionEclairee: b.fractionEclairee,
      // Six décimales valent environ 10 cm : au-delà on stockerait du bruit.
      points: b.points.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)])
    }));
  } catch (e) { /* stockage plein ou refusé : on continue sans filet */ }
}

function lireParcours() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE_PARCOURS));
    if (!r || !r.points || Date.now() - r.quand > PARCOURS_VALIDE_MS) return null;
    return { ...r, points: r.points.map(([lat, lon]) => ({ lat, lon })), noeuds: [] };
  } catch (e) { return null; }
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
      p => ok({
        lat: p.coords.latitude, lon: p.coords.longitude,
        precision: p.coords.accuracy, source: 'gps', quand: Date.now()
      }),
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

/* ------------------------------------------------------------- quartier

   ⚠️ Cette étape était enfermée dans la génération de boucles, et c'est ce
   qui donnait une app qui a l'air cassée : la position était trouvée, le
   rond vert du départ s'affichait, et la carte restait NOIRE tant qu'on
   n'avait pas appuyé sur le bouton. Rien ne disait qu'il fallait appuyer.

   Elle est donc appelable seule : dès qu'on a une position, on montre le
   quartier. Chercher des boucles ensuite ne coûte plus rien. */
async function assurerQuartier(cible, { reseau = true } = {}) {
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
  if (memeZone) return true;

  const boite = bbox(etat.depart, rayon);
  let osm;

  if (reseau) {
    dire('Chargement des rues...');
    osm = await charger(boite, (fait, total, toutEnCache) => {
      if (toutEnCache) return dire('Quartier déjà en mémoire');
      // Le premier quartier prend une bonne minute : le dire évite de croire
      // que l'app est plantée et de la fermer.
      dire(`Téléchargement de vos rues, ${fait} sur ${total}. Une minute environ, `
         + `une seule fois par quartier.`);
    });
  } else {
    // Au lancement : ce qui est déjà en mémoire, tout de suite, sans réseau.
    osm = await chargerDuCache(boite);
    if (!osm) return false;
  }

  const brut = construireGraphe(osm, { nuit: etat.nuit, eviterFeux: etat.eviterFeux });
  etat.graphe = plusGrandeComposante(brut);
  etat.grapheDe = { ...etat.depart, rayon, nuit: etat.nuit, eviterFeux: etat.eviterFeux };
  // ⚠️ Garder l'origine existante si la carte a déjà dessiné quelque chose :
  // `charger` reconstruit les rues dans le repère qu'on lui donne, et un
  // tracé construit dans l'ancien repère se retrouverait décalé de plusieurs
  // rues sans que rien ne le signale.
  carte.charger(etat.graphe, carte.origine || etat.depart);
  if (!etat.boucles.length) {
    carte.cadrerAutour(etat.depart, rayon * 0.75);
    carte.montrer(null, etat.depart);
  }
  return true;
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
    await assurerQuartier(cible);

    if (!etat.graphe || etat.graphe.voisins.size < 50) {
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

/* OSM écrit « Avenue du Mont-Royal Est » ou « Rue Saint-Denis », avec le type
   de voie en tête. Écrire « par Avenue du Mont-Royal » sonne faux ; il faut
   l'article, donc le genre du type de voie, et l'élision devant une voyelle. */
const FEMININ = new Set(['rue', 'ruelle', 'avenue', 'allée', 'allee', 'impasse', 'place',
  'route', 'voie', 'promenade', 'esplanade', 'traverse', 'côte', 'cote', 'montée', 'montee']);
const MASCULIN = new Set(['boulevard', 'chemin', 'passage', 'quai', 'cours', 'square',
  'sentier', 'parc', 'pont', 'rond-point', 'mail']);

function nommer(nom) {
  const mots = nom.split(' ');
  const type = mots[0].toLowerCase();
  const connu = FEMININ.has(type) || MASCULIN.has(type);
  if (!connu) return `<b>${nom}</b>`;

  const reste = mots.slice(1).join(' ');
  const article = /^[aeiouyéèêà]/i.test(type) ? 'l’' : (FEMININ.has(type) ? 'la ' : 'le ');
  return `${article}${type} <b>${reste}</b>`;
}

/* L'attribut aria-label ne rend pas le HTML : il le lirait balise par balise. */
const texteBrut = html => html.replace(/<[^>]+>/g, '');

function montrerResultats(cible, ms) {
  $('resume').textContent =
    `${etat.boucles.length} boucles, cible ${(cible / 1000).toFixed(1)} km, ${Math.round(ms)} ms`;
  ouvrirResultats();
}

/* Séparé de `montrerResultats` parce que le parcours restauré au lancement
   passe par ici sans avoir ni cible ni durée de calcul à afficher. */
function ouvrirResultats() {
  $('reglages').hidden = true;
  $('resultats').hidden = false;
  peindreCartes();

  const b = etat.boucles[etat.choisie];
  sauverParcours(b);
  // Choisir une autre boucle recommence la course : garder l'accrochage de
  // la précédente ferait chercher la position dans un tableau de points qui
  // n'existe plus, et le premier segment surligné serait faux.
  indice = null;
  derniers = [];
  recentre = false;
  parcouru = 0;
  precedent = null;
  carte.cadrer(b.points);
  carte.montrer(b, etat.depart);
  $('suivi').hidden = true;
  if (document.visibilityState === 'visible') demarrerSuivi();
}

function peindreCartes() {
  const zone = $('boucles');
  zone.innerHTML = '';
  const prises = new Set();
  etat.boucles.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'boucle';
    el.type = 'button';
    el.setAttribute('aria-pressed', String(i === etat.choisie));

    const minutes = Math.round((b.m / 1000) * (etat.allure / 60));
    const feux = b.feux === 0 ? '<b>aucun feu</b>'
               : b.feux === 1 ? '<b>1 feu</b>'
               : `<b>${b.feux} feux</b>`;
    // L'éclairage n'est affiché que quand il apprend quelque chose : en mode
    // nocturne, ou quand une part notable du parcours n'est pas éclairée.
    // « 100 % éclairé » sur les trois cartes n'aide personne à choisir et
    // faisait déborder la ligne sur trois lignes en 360 px de large.
    const parle = etat.nuit || b.fractionEclairee === null || b.fractionEclairee < 0.9;
    const eclaire = !parle ? ''
      : b.fractionEclairee === null ? ' · éclairage inconnu'
      : ` · ${Math.round(b.fractionEclairee * 100)} % éclairé`;

    // Trois boucles de même longueur avec le même profil sont
    // indiscernables dans la liste. Nommer la rue principale est ce qui
    // permet de choisir, et c'est ainsi qu'on décrit un parcours à
    // quelqu'un : « celle qui passe par Mont-Royal ».
    // La première rue que les autres boucles n'ont pas déjà prise.
    const rue = (b.rues || []).find(r => !prises.has(r.nom)) || (b.rues || [])[0] || null;
    if (rue) prises.add(rue.nom);
    const par = rue ? `par ${nommer(rue.nom)}` : '';

    el.innerHTML =
      `<span class="km">${(b.m / 1000).toFixed(2)} km</span>` +
      `<span class="detail">${par}<br>${feux} · ${minutes} min${eclaire}</span>` +
      `<span class="puce" aria-hidden="true"></span>`;
    el.setAttribute('aria-label',
      `Boucle de ${(b.m / 1000).toFixed(2)} kilomètres` +
      (rue ? `, ${texteBrut(nommer(rue.nom))}` : '') +
      `, ${b.feux} feu${b.feux > 1 ? 'x' : ''}, environ ${minutes} minutes`);
    el.addEventListener('click', () => { etat.choisie = i; ouvrirResultats(); });
    zone.appendChild(el);
  });
}

/* ------------------------------------------------------- suivi en direct

   Le GPS ne tourne QUE pendant que l'app est ouverte et visible. C'est la
   seule chose qu'un PWA sait faire, et c'est exactement le geste visé :
   sortir le téléphone à un carrefour pour savoir de quel côté ça continue.
   Il s'arrête dès que la page passe en arrière-plan, sinon on viderait la
   batterie d'une poche. */

let veille = null;
let indice = null;
let derniers = [];
let sens = 1;
let recentre = false;
let parcouru = 0;        // mètres réellement avancés depuis le début du suivi
let precedent = null;

/* En dessous, on considère qu'on n'est pas encore parti.
   ⚠️ Sans ce garde-fou, l'app annonce « Encore 0 m » à celle qui se tient sur
   sa ligne de départ : le premier et le dernier point du tracé sont le MÊME
   carrefour, et rien dans une position isolée ne dit si on l'aborde au
   départ ou à l'arrivée. Seul le chemin déjà parcouru le dit. */
const DEMARRE_M = 120;

function demarrerSuivi() {
  if (veille !== null || !navigator.geolocation) return;
  if (!etat.boucles.length) return;
  recentre = false;
  parcouru = 0;
  precedent = null;
  veille = navigator.geolocation.watchPosition(surPosition, () => {}, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 30000
  });
}

function arreterSuivi() {
  if (veille === null) return;
  navigator.geolocation.clearWatch(veille);
  veille = null;
  indice = null;
  derniers = [];
}

function surPosition(p) {
  const b = etat.boucles[etat.choisie];
  if (!b) return;
  const moi = { lat: p.coords.latitude, lon: p.coords.longitude };

  // Le cumul sert uniquement à savoir si la course a commencé, pas à mesurer
  // une distance : le bruit GPS le gonflerait, ce qui est sans importance ici
  // puisqu'on ne compare qu'à un seuil de 120 m.
  if (precedent) {
    const dx = (moi.lon - precedent.lon) * 111320 * Math.cos(moi.lat * Math.PI / 180);
    const dy = (moi.lat - precedent.lat) * 111320;
    parcouru += Math.hypot(dx, dy);
  }
  precedent = moi;

  const a = accrocher(b.points, moi, indice);
  const ligne = $('suivi');
  ligne.hidden = false;

  if (!a || a.ecartM > ECART_MAX_M) {
    // Mieux vaut dire qu'on ne sait pas que de surligner une direction au
    // hasard : c'est exactement le moment où on suivrait le mauvais côté.
    carte.suivre(moi, null);
    ligne.className = 'pied dehors';
    ligne.innerHTML = `Vous êtes à <b>${Math.round(a ? a.ecartM : 0)} m</b> du parcours.`;
    if (!recentre) { carte.centrerSur(moi); recentre = true; }
    return;
  }

  indice = a.indice;
  derniers.push(a.indice);
  if (derniers.length > 6) derniers.shift();
  sens = sensDeMarche(derniers, b.points.length, sens);

  carte.suivre(moi, segmentSuivant(b.points, indice, sens, 400));
  if (!recentre) { carte.centrerSur(moi); recentre = true; }

  const reste = parcouru < DEMARRE_M ? b.m : metresRestants(b.points, indice, sens);
  ligne.className = 'pied';
  ligne.innerHTML = reste >= 1000
    ? `Encore <b>${(reste / 1000).toFixed(2)} km</b> · le jaune montre les 400 prochains mètres`
    : `Encore <b>${reste} m</b> · le jaune montre la suite`;
}

/* Une page cachée n'a pas besoin du GPS, et un PWA qu'on rouvre doit le
   reprendre : l'événement est le seul signal fiable des deux côtés. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!$('resultats').hidden) demarrerSuivi();
  } else {
    arreterSuivi();
  }
});

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
$('ma-position').addEventListener('click', async () => {
  const b = $('ma-position');
  b.disabled = true;
  dire('Recherche de votre position...');
  try {
    const avant = etat.depart;
    etat.depart = await positionner();
    ecrireReglages();
    peindreDepart();

    // Un départ qui bouge périme les boucles affichées et, s'il sort de la
    // zone chargée, le graphe lui-même.
    const bouge = !avant ||
      Math.abs(avant.lat - etat.depart.lat) > 1e-5 || Math.abs(avant.lon - etat.depart.lon) > 1e-5;
    if (bouge) { etat.boucles = []; etat.choisie = 0; $('resultats').hidden = true; $('reglages').hidden = false; }
    carte.montrer(null, etat.depart);
    if (etat.depart.precision > 50) {
      direUnMoment(`Position trouvée, mais à ${Math.round(etat.depart.precision)} m près seulement.`);
    }
    // Montrer le quartier dans la foulée : une carte noire sous un rond vert
    // ne dit rien de ce qu'il faut faire ensuite.
    await assurerQuartier(distancePour(etat.duree * 60, etat.allure));
    if (etat.depart.precision <= 50) dire(null);
  } catch (e) {
    dire(message(e), true);
  } finally {
    b.disabled = false;
  }
});

$('chercher').addEventListener('click', () => chercher(false));
$('autres').addEventListener('click', () => chercher(true));
$('retour').addEventListener('click', () => {
  $('resultats').hidden = true;
  $('reglages').hidden = false;
  arreterSuivi();
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
    etat.depart = { ...carte.versLatLon(x, y), source: 'carte', quand: Date.now() };
    ecrireReglages();
    peindreDepart();

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

/* Rouvrir l'app en pleine course doit retrouver le parcours, pas l'écran de
   réglages : Android est libre de tuer une PWA restée en poche. */
/* Au lancement, si le quartier est déjà en mémoire, l'afficher sans rien
   demander au réseau. Sinon la carte reste noire jusqu'au premier appui, ce
   qui se lit comme une panne. */
if (etat.depart) {
  assurerQuartier(distancePour(etat.duree * 60, etat.allure), { reseau: false })
    .catch(() => {});
}

const enCoursDeCourse = lireParcours();
if (enCoursDeCourse) {
  etat.boucles = [enCoursDeCourse];
  etat.choisie = 0;
  $('resume').textContent = 'Parcours en cours';
  ouvrirResultats();
}


/* -------------------------------------------------------- installation

   ⚠️ Chrome et Brave ne montrent PLUS de bandeau « installer ». Ils
   préviennent la page par `beforeinstallprompt` et attendent qu'elle
   réagisse. Une app qui n'écoute pas cet événement remplit tous les critères
   d'installation et ne propose pourtant jamais rien : c'est exactement ce
   qui est arrivé ici, et déjà à GVT 1.0.0.

   Deux défauts à ne pas reproduire, tous deux présents dans la-cour :
   l'écouteur de clic doit être posé UNE FOIS, hors du gestionnaire, sinon un
   second événement l'empile et un seul appui déclenche plusieurs invites ;
   et une invite refusée ne doit pas cacher le bouton définitivement, on
   change souvent d'avis. */
let inviteInstallation = null;

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  inviteInstallation = e;
  $('installer').hidden = false;
});

$('installer').addEventListener('click', async () => {
  if (!inviteInstallation) return;
  const invite = inviteInstallation;
  inviteInstallation = null;          // une invite ne se rejoue pas
  invite.prompt();
  const { outcome } = await invite.userChoice;
  if (outcome === 'accepted') {
    $('installer').hidden = true;
  } else {
    // Refusée : le bouton reste, mais l'invite est consommée. Le navigateur
    // en renverra une plus tard ; d'ici là on renvoie vers le menu.
    direUnMoment('Sinon, menu du navigateur puis « Installer l’application ».');
  }
});

addEventListener('appinstalled', () => { $('installer').hidden = true; });

// Déjà installée : le bouton n'a plus lieu d'être.
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) {
  $('installer').hidden = true;
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
