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
import { MARGE_ZONE } from '../lib/overpass.js';
import { Carte } from './carte.js';
import * as favoris from './favoris.js';
import * as plateau from './plateau.js';
import { encoder, decoder } from '../lib/partage.js';
import { classer, Territoire } from '../lib/score.js';

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
  enCourse: false,
  mode: 'decouverte',   // ou 'conquete'
  graine: 1
};

/* Le mode change ce qu'on cherche, pas seulement ce qu'on affiche :
   découverte classe les candidates aux mètres de rues jamais prises,
   conquête au terrain qu'elles ajoutent. Mesuré sur douze sorties, les deux
   ne désignent jamais la même boucle. */
const MODES = {
  decouverte: {
    titre: 'Découverte',
    quoi: null            // le nom de l'onglet suffit, la carte prend la place
  },
  conquete: {
    titre: 'Conquête',
    quoi: '⚠️ À partir du même point, le terrain cesse vite de grandir. '
        + 'Déplacez votre départ pour gagner du quartier.'
  }
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
      nuit: r.nuit ?? false,
      mode: r.mode === 'conquete' ? 'conquete' : 'decouverte'
    });
  } catch (e) { /* premier lancement, ou stockage refusé */ }
}

function ecrireReglages() {
  try {
    localStorage.setItem(CLE, JSON.stringify({
      depart: etat.depart, duree: etat.duree, allure: etat.allure,
      eviterFeux: etat.eviterFeux, nuit: etat.nuit, mode: etat.mode
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

  /* Annoncer « touchez la carte » devant un écran noir est un mensonge :
     sans quartier chargé, la carte n'a pas de repère et ne réagit à rien. */
  $('astuce').hidden = !carte.origine;

  /* La ligne n'apparaît qu'une fois qu'il y a quelque chose dedans. Ce qui
     annonce la fonction, c'est le bouton « Garder » pendant la course, au
     moment où elle a un sens : un « Mes parcours (0) » sur l'écran de
     départ ne serait que du bruit. */
  /* Même règle que pour les favoris : une ligne à zéro n'est que du bruit.
     Ce qui annonce la fonction, ce sont les onglets au moment de choisir. */
  const b = plateau.bilan();
  $('ouvrir-quartier').hidden = b.sorties === 0;
  $('quartier-combien').textContent =
    b.sorties === 1 ? '1 sortie · ' + b.km + ' km'
                    : b.sorties + ' sorties · ' + b.km + ' km';

  const n = favoris.combien();
  $('ouvrir-favoris').hidden = n === 0;
  $('favoris-combien').textContent = n === 1 ? '1 parcours gardé' : `${n} parcours gardés`;

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
  if (!b) { try { localStorage.removeItem(CLE_PARCOURS); } catch (e) {} return; }
  try {
    localStorage.setItem(CLE_PARCOURS, JSON.stringify({
      quand: Date.now(),
      enCourse: !!etat.enCourse,
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

/**
 * @param {string|null} texte
 * @param {object} [o]
 * @param {boolean} [o.erreur]
 * @param {number|'attente'|null} [o.part]  0..1, ou 'attente' pour un
 *        va-et-vient quand on ne peut RIEN savoir de l'avancement.
 */
function dire(texte, o = {}) {
  clearTimeout(effacerEtat);
  const e = $('etat'), barre = $('etat-barre');
  if (!texte) { e.hidden = true; return; }
  $('etat-texte').textContent = texte;
  e.classList.toggle('erreur', !!o.erreur);

  if (o.part === undefined || o.part === null) {
    barre.hidden = true;
  } else {
    barre.hidden = false;
    barre.classList.toggle('attente', o.part === 'attente');
    barre.firstElementChild.style.width =
      o.part === 'attente' ? '' : `${Math.round(o.part * 100)}%`;
  }
  e.hidden = false;
}
function direUneErreur(texte) { dire(texte, { erreur: true }); }
function direUnMoment(texte, erreur = false) {
  dire(texte, { erreur });
  effacerEtat = setTimeout(() => dire(null), erreur ? 9000 : 3500);
}

/* ------------------------------------------------------------- position */

function unePosition(options) {
  return new Promise((ok, ko) => {
    navigator.geolocation.getCurrentPosition(
      p => ok({
        lat: p.coords.latitude, lon: p.coords.longitude,
        precision: p.coords.accuracy, source: 'gps', quand: Date.now()
      }),
      ko, options
    );
  });
}

async function positionner() {
  if (!navigator.geolocation) throw new Error('nogeo');
  try {
    return await unePosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  } catch (e) {
    // Un refus est définitif, inutile d'insister. Mais un échec ou une
    // expiration en haute précision arrive souvent sur un ordinateur, qui
    // n'a pas de GPS : la position par le réseau, elle, répond.
    if (e && e.code === 1) throw e;
    return unePosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  }
}

/* --------------------------------------------------------------- rayon */

/* La spec demandait une boîte de D/4 autour du départ. Mesuré : c'est deux
   fois trop, et chaque mètre de rayon coûte des mégaoctets sur le réseau
   mobile. Les points intermédiaires d'une boucle de D se posent à environ
   0,85 x D / 2π du départ, soit 675 m pour 5 km.

   Vérifié sur les vraies rues de Montréal et de Paris : à 850 m de rayon les
   trois boucles sortent identiques à celles obtenues avec 1500 m. À 700 m,
   Paris se dégrade (jusqu'à 22 % d'écart à la cible). D / 5,5 donne 909 m
   pour 5 km, juste au-dessus du seuil, avec un plancher pour les sorties
   courtes. */
function rayonPour(distanceCible) {
  return Math.max(700, Math.min(2000, distanceCible / 5.5));
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
    etat.grapheDe.eviterFeux === etat.eviterFeux &&
    // L'allure fixe ce que coûte un feu, donc le poids de chaque arête.
    etat.grapheDe.allure === etat.allure;
  if (memeZone) return true;

  /* On télécharge un peu plus large qu'on n'a besoin, pour que le départ
     d'à côté et la relève GPS suivante retombent dans la même zone. */
  const boite = bbox(etat.depart, rayon + MARGE_ZONE);
  let osm;

  if (reseau) {
    dire('Préparation...', { part: 'attente' });
    osm = await charger(etat.depart, rayon + MARGE_ZONE, boite, info => {
      if (info.phase === 'memoire') return dire('Quartier déjà en mémoire', { part: 1 });
      if (info.phase === 'attente') {
        return dire('Le serveur prépare vos rues...', { part: 'attente' });
      }
      if (info.phase === 'range') return dire('Mise en mémoire...', { part: 1 });
      // Les mégaoctets affichés sont EXACTS ; c'est la barre qui est une
      // estimation, faute de taille annoncée par le serveur.
      dire(`Téléchargement de vos rues, ${(info.octets / 1e6).toFixed(1)} Mo. `
         + `Une seule fois par quartier.`, { part: info.part });
    });
  } else {
    // Au lancement : ce qui est déjà en mémoire, tout de suite, sans réseau.
    osm = await chargerDuCache(etat.depart, rayon);
    if (!osm) return false;
  }

  const brut = construireGraphe(osm, {
    nuit: etat.nuit, eviterFeux: etat.eviterFeux, allure: etat.allure
  });
  etat.graphe = plusGrandeComposante(brut);
  etat.grapheDe = { ...etat.depart, rayon, nuit: etat.nuit,
                    eviterFeux: etat.eviterFeux, allure: etat.allure };
  // ⚠️ Garder l'origine existante si la carte a déjà dessiné quelque chose :
  // `charger` reconstruit les rues dans le repère qu'on lui donne, et un
  // tracé construit dans l'ancien repère se retrouverait décalé de plusieurs
  // rues sans que rien ne le signale.
  carte.charger(etat.graphe, carte.origine || etat.depart);
  if (!etat.boucles.length) {
    carte.cadrerAutour(etat.depart, rayon * 0.75);
    carte.montrer(null, etat.depart);
  }
  $('astuce').hidden = false;   // il y a une carte, on peut le dire
  return true;
}

/* ----------------------------------------------- classer les candidates */

/**
 * Garde les trois meilleures selon le mode, et pose sur chacune la phrase
 * qui dit pourquoi elle est là.
 */
function retenir(candidates, cible) {
  const dejaCourues = plateau.dejaCourues();
  /* Une trame neuve à chaque recherche : `classer` ne fait qu'interroger,
     elle ne peint pas, et repartir de l'état enregistré évite qu'une
     recherche précédente ait déjà « pris » le terrain de celle-ci. */
  /* ⚠️ Sans sortie enregistrée il n'y a pas d'ancre, donc pas de trame, et
     `classer` recevait null : chaque boucle était notée à zéro et l'app
     annonçait « aucun terrain nouveau » sur les trois propositions, alors que
     TOUT était nouveau. Une trame vierge ancrée sur le départ dit la
     vérité : la première boucle prend tout ce qu'elle enferme. */
  const terr = etat.mode !== 'conquete' ? null
             : (plateau.territoire() || new Territoire(etat.depart));

  const notees = classer(candidates, {
    mode: etat.mode,
    graphe: etat.graphe,
    dejaCourues,
    territoire: terr,
    distanceCible: cible,
    combien: 3
  });

  return notees.map(n => {
    const b = n.b;
    if (etat.mode === 'conquete') {
      const km2 = n.gainM2 / 1e6;
      b.score = km2 < 0.005 ? 'aucun terrain nouveau'
              : `+ ${km2.toFixed(2)} km² de terrain`;
    } else {
      /* Le POURCENTAGE, pas les kilomètres : c'est sur la part que les
         candidates sont classées, et afficher autre chose donnait une liste
         qui avait l'air mal triée (4,5 km au-dessus de 4,9 km, parce que la
         première boucle était plus courte). */
      const pct = Math.round(n.part * 100);
      b.score = dejaCourues.size === 0
        ? null                              // première sortie : tout est neuf
        : pct < 1 ? 'que des rues déjà prises'
                  : `${pct} % de rues nouvelles`;
    }
    return b;
  });
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
    $('recu').hidden = true;
    normaliserMode();
    if (nouvelleGraine) etat.graine = (etat.graine + 1) % 100000;

    /* Huit candidates au lieu de trois, puis on classe. Ce n'est pas un
       luxe : mesuré à la dixième sortie, la meilleure des huit est à 67 %
       d'inédit et la pire à 29 %. Choisir double le résultat, là où la
       pénalité « déjà couru » du graphe ne fait qu'orienter. */
    const candidates = genererBoucles(etat.graphe, {
      depart: etat.depart,
      distanceCible: cible,
      graine: etat.graine,
      nb: 8
    });

    if (!candidates.length) throw new Error('rien');
    etat.boucles = retenir(candidates, cible);

    etat.choisie = 0;
    etat.enCourse = false;
    montrerResultats(cible);
    dire(null);
  } catch (e) {
    direUneErreur(message(e));
  } finally {
    enCours = false;
    $('chercher').disabled = false;
  }
}

function message(e) {
  /* ⚠️ Sans position, l'app est un cul-de-sac : pas de position, donc pas de
     quartier chargé, donc pas de carte, donc rien à toucher pour poser un
     départ à la main. Le message doit donc dire quoi FAIRE, pas seulement ce
     qui a raté. C'est le cas le plus courant sur ordinateur, où il n'y a pas
     de GPS et où le navigateur refuse souvent tout net. */
  if (e && e.code === 1) {
    return 'Runa a besoin de votre position pour trouver vos rues. '
         + 'Autorisez-la dans les réglages du site, par l’icône à gauche de '
         + 'l’adresse, puis touchez « Ma position ».';
  }
  if (e && e.code === 2) return 'Position indisponible. Sortez ou activez la localisation, puis réessayez.';
  if (e && e.code === 3) return 'La position met trop de temps à arriver. Réessayez.';
  if (e && e.message === 'debit') return 'Le serveur OpenStreetMap est saturé. Réessayez dans une minute.';
  if (e && e.message === 'silence') return 'Le téléchargement s’est interrompu. Réessayez : ce qui était reçu n’est pas perdu.';
  if (e && e.message === 'bloque') return 'La requête n’est jamais partie. Vérifiez le réseau, ou un bloqueur de contenu sur ce site.';
  if (e && e.message && e.message.startsWith('http ')) return `Le serveur OpenStreetMap a refusé (${e.message}). Réessayez dans une minute.`;
  if (e && e.message === 'desert') return 'Trop peu de rues autour de ce départ pour tracer une boucle.';
  if (e && e.message === 'rien') return 'Aucune boucle trouvée ici à cette distance. Essayez une autre durée.';
  if (e && e.message === 'reseau') return 'Pas de réseau, et ce quartier n’est pas encore en mémoire.';
  return 'Échec : ' + (e && e.message ? e.message : 'inconnu');
}

/* ---------------------------------------------------------- partager */

/**
 * ⚠️ Un PWA n'émet plus rien dès que l'écran s'éteint : le suivi GPS
 * s'arrête en arrière-plan et le système gèle l'onglet. Un partage « en
 * direct » enverrait donc une position au départ puis plus rien, pendant que
 * la personne en face croit suivre quelqu'un. On partage une position
 * DATÉE, prise au moment où l'on touche le bouton, et le texte le dit.
 */
function texteDuPartage(b, position) {
  const km = (b.m / 1000).toFixed(2);
  const rue = (b.rues || [])[0];
  const par = rue ? `, par ${texteBrut(nommer(rue.nom))}` : '';
  return position
    ? `Je cours une boucle de ${km} km${par}. Voici où j'en suis.`
    : `Ma boucle du jour : ${km} km${par}.`;
}

async function partager() {
  const b = etat.boucles[etat.choisie];
  if (!b) return;

  // La position du moment si on l'a déjà sous la main. On ne RELANCE pas le
  // GPS pour l'occasion : ça ferait attendre debout au coin d'une rue.
  const position = derniereVue
    ? { lat: derniereVue.lat, lon: derniereVue.lon, quand: derniereVue.quand || Date.now() }
    : null;

  const paquet = encoder(b, position);
  if (!paquet) return direUnMoment('Ce parcours ne peut pas être partagé.', true);

  const lien = location.origin + location.pathname + '#p=' + paquet;
  const texte = texteDuPartage(b, position);

  /* `navigator.share` ouvre le menu de partage du téléphone, celui qu'on
     connaît déjà. Il n'existe pas partout : sans lui, on copie, et on le
     DIT, sinon le bouton a l'air de ne rien faire. */
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Runa', text: texte, url: lien });
      return;
    }
    await navigator.clipboard.writeText(texte + ' ' + lien);
    direUnMoment('Lien copié : collez-le dans un message.');
  } catch (e) {
    // Fermer le menu de partage n'est pas une erreur : ne rien dire.
    if (e && e.name === 'AbortError') return;
    direUnMoment('Le partage n’a pas pu s’ouvrir.', true);
  }
}

/* ------------------------------------------------------ parcours reçu */

function ageEnPhrase(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : 'hier ou avant';
}

/**
 * Ouvre un parcours reçu par lien. Le tracé s'affiche TOUT DE SUITE, sans
 * réseau : les rues autour arrivent ensuite si elles peuvent. L'inverse
 * donnerait un écran noir pendant deux mégaoctets de téléchargement, pour
 * un lien qu'on vient de toucher dans une messagerie.
 */
function ouvrirRecu(recu) {
  /* ⚠️ `feux: null` et non zéro. Le lien ne transporte qu'un tracé : on
     ignore les feux et l'éclairage tant que les rues ne sont pas chargées.
     Annoncer « aucun feu » par défaut serait le mensonge exact corrigé en
     1.1.0, où l'app disait ça là où l'on s'arrêtait quinze fois. */
  const b = { m: recu.m, points: recu.points, noeuds: [], ways: new Set(),
              feux: null, rues: [], fractionEclairee: null, score: null };
  etat.boucles = [b];
  etat.choisie = 0;
  etat.enCourse = false;
  etat.depart = { ...recu.points[0], source: 'partage', quand: Date.now() };

  $('resume').textContent = `Parcours reçu · ${(recu.m / 1000).toFixed(2)} km`;
  $('recu').hidden = false;
  $('recu').innerHTML = recu.position
    ? `Parcours partagé avec vous. Sa position, <b>${ageEnPhrase(recu.position.quand)}</b>, `
      + `est le point blanc.`
    : 'Parcours partagé avec vous.';

  carte.poserOrigine(etat.depart);
  carte.cadrer(recu.points);
  carte.montrer(b, etat.depart);
  if (recu.position) carte.suivre(recu.position, null);
  ouvrirResultats();

  /* Les rues, ensuite, sans bloquer l'affichage du tracé.

     ⚠️ Deux choses que `assurerQuartier` ne fait PAS quand il est appelé
     seul, hors de `chercher` : il construit les tracés de rues sans les
     peindre dès lors qu'une boucle est déjà affichée, et il n'efface pas son
     propre message d'état. Le résultat, vu en vrai : les rues arrivaient
     mais restaient invisibles, sous un « Mise en mémoire... » qui ne
     partait plus. */
  assurerQuartier(recu.m)
    .then(() => {
      carte.montrer(b, etat.depart);
      // `montrer` remet le surlignage à zéro : on repose le point de la
      // personne après, sinon il disparaît quand les rues arrivent.
      if (recu.position) carte.suivre(recu.position, null);
    })
    .catch(() => {})
    .finally(() => dire(null));
}

/* ------------------------------------------------------- mon quartier */

function ouvrirQuartier() {
  $('reglages').hidden = true;
  $('resultats').hidden = true;
  $('monquartier').hidden = false;
  arreterSuivi();
  peindreQuartier();
}

function fermerQuartier() {
  $('monquartier').hidden = true;
  $('reglages').hidden = false;
  carte.quartier = false;
  carte.dessiner();
  peindreReglages();
}

function peindreQuartier() {
  const b = plateau.bilan();
  const part = plateau.partDuQuartier(etat.graphe, etat.depart);

  /* Le gros chiffre est le pourcentage quand on peut l'établir honnêtement,
     c'est-à-dire quand un quartier est chargé pour servir de dénominateur.
     Sinon des kilomètres, qui ne demandent rien à personne. */
  if (part) {
    $('q-gros').textContent = Math.round(part.part * 100) + ' %';
    $('q-mot').textContent = 'des rues autour de vous';
    $('q-barre').hidden = false;
    $('q-barre').firstElementChild.style.width = Math.round(part.part * 100) + '%';
    $('q-detail').textContent =
      `${part.km.toFixed(1)} km de rues sur les ${part.kmTotal.toFixed(0)} km à moins d’un kilomètre, `
      + `en ${b.sorties} sortie${b.sorties > 1 ? 's' : ''}. `
      + `${b.km2} km² de terrain encerclé.`;
  } else {
    $('q-gros').textContent = b.km + ' km';
    $('q-mot').textContent = 'de rues déjà prises';
    $('q-barre').hidden = true;
    $('q-detail').textContent =
      `${b.sorties} sortie${b.sorties > 1 ? 's' : ''}, ${b.km2} km² de terrain encerclé.`;
  }

  /* Les deux couches ne se dessinent que sur cet écran : sur la carte
     d'accueil, le tracé vert du jour traverserait de l'indigo au lieu de se
     détacher sur du gris. */
  carte.chargerCourues(etat.graphe, plateau.dejaCourues());
  carte.poserTerrain(plateau.contours());
  carte.quartier = true;
  carte.trace = null;
  carte.restant = null;
  if (etat.depart) carte.cadrerAutour(etat.depart, 1400);
  carte.dessiner();
}

/* ----------------------------------------------------- parcours gardés */

function ouvrirFavoris() {
  $('reglages').hidden = true;
  $('resultats').hidden = true;
  $('mesparcours').hidden = false;
  arreterSuivi();
  peindreFavoris();
}

function fermerFavoris() {
  $('mesparcours').hidden = true;
  $('reglages').hidden = false;
  peindreReglages();
}

function peindreFavoris() {
  const zone = $('liste-favoris');
  zone.innerHTML = '';
  const liste = favoris.lireTout();

  if (!liste.length) {
    zone.innerHTML = '<p class="vide">Aucun parcours gardé pour l’instant.</p>';
    return;
  }

  const prises = new Set();
  for (const f of liste) {
    const el = document.createElement('div');
    el.className = 'favori';

    const rue = (f.rues || []).find(r => !prises.has(r.nom)) || (f.rues || [])[0] || null;
    if (rue) prises.add(rue.nom);
    const feux = f.feux == null ? ''
               : f.feux === 0 ? '<b>aucun feu</b>'
               : f.feux === 1 ? '<b>1 feu</b>' : `<b>${f.feux} feux</b>`;
    const minutes = Math.round((f.m / 1000) * (etat.allure / 60));

    el.innerHTML =
      `<button class="ouvrir" type="button">` +
        `<span class="km">${(f.m / 1000).toFixed(2)} km</span>` +
        `<span class="detail">${rue ? 'par ' + nommer(rue.nom) + '<br>' : ''}` +
        `${feux}${feux ? ' · ' : ''}${minutes} min</span>` +
      `</button>` +
      `<button class="jeter" type="button" aria-label="Oublier ce parcours">&#10005;</button>`;

    el.querySelector('.ouvrir').addEventListener('click', () => reprendre(f));
    el.querySelector('.jeter').addEventListener('click', () => {
      favoris.oublier(f.id);
      peindreFavoris();
      if (!favoris.combien()) fermerFavoris();
    });
    zone.appendChild(el);
  }
}

/* Reprendre un parcours gardé : on le remet en cours, sans rien recalculer
   ni redemander au réseau. Les rues du quartier se redessinent depuis la
   mémoire si elles y sont, sinon le tracé seul suffit à courir. */
function reprendre(f) {
  $('mesparcours').hidden = true;
  etat.boucles = [{ ...f, noeuds: [], ways: new Set(f.ways || []) }];
  etat.choisie = 0;
  etat.enCourse = true;
  $('resume').textContent = 'Parcours gardé';
  ouvrirResultats();
  if (etat.depart) {
    assurerQuartier(distancePour(etat.duree * 60, etat.allure), { reseau: false })
      .catch(() => {});
  }
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

/* La phrase d'accueil ne se montre qu'une fois. */
const CLE_MODES_VUS = 'runa-modes-vus';

/**
 * Ramène le mode à ce qui a un sens dans l'état actuel.
 *
 * ⚠️ À appeler AVANT de chercher, pas seulement avant de peindre : la
 * remise à zéro se faisait dans `peindreOnglets`, donc après que les boucles
 * avaient déjà été notées. Un téléphone qui avait connu le mode conquête
 * puis perdu son historique affichait des kilomètres carrés sous des onglets
 * cachés, ce qui est exactement l'incompréhension qu'on cherchait à éviter.
 */
function normaliserMode() {
  if (!plateau.combienDeSorties() && etat.mode !== 'decouverte') {
    etat.mode = 'decouverte';
    ecrireReglages();
  }
}

function peindreOnglets() {
  /* Au premier lancement, le choix N'EXISTE PAS : sans historique, les deux
     onglets classent les mêmes boucles de la même façon. Proposer un choix
     qui ne change rien est ce qui rend l'app incompréhensible, bien plus
     qu'un manque d'explication. Les onglets apparaissent donc quand ils
     commencent à départager quelque chose, comme « Mes parcours » et
     « Mon quartier » n'existent qu'une fois qu'il y a de quoi les remplir. */
  const sorties = plateau.combienDeSorties();
  $('onglets').hidden = sorties === 0;

  normaliserMode();

  let note = false;
  if (sorties >= 1) {
    try {
      note = !localStorage.getItem(CLE_MODES_VUS);
      if (note) localStorage.setItem(CLE_MODES_VUS, '1');
    } catch (e) { note = false; }
  }
  // `hidden` ne se remet pas à true tout seul : une fois lue, la phrase doit
  // disparaître au rendu suivant, pas rester jusqu'au rechargement.
  if (note) $('mode-note').hidden = false;

  for (const m of ['decouverte', 'conquete']) {
    $('ong-' + m).setAttribute('aria-selected', String(etat.mode === m));
  }
  /* La phrase n'apparaît que quand elle apprend quelque chose. En découverte
     elle ne faisait que répéter le nom de l'onglet, pour 44 px pris à la
     carte, qui est ce qu'on regarde. En conquête c'est un avertissement qui
     change ce qu'on va faire : rester au même départ ne rapporte plus rien. */
  const quoi = MODES[etat.mode].quoi;
  $('mode-quoi').textContent = quoi || '';
  $('mode-quoi').hidden = !quoi;
}

function montrerResultats(cible) {
  // Le temps de calcul n'a rien à faire là : c'est une information de
  // développeur, elle n'aide personne à choisir une boucle.
  const n = etat.boucles.length;
  $('resume').textContent =
    `${n} boucle${n > 1 ? 's' : ''} autour de ${(cible / 1000).toFixed(1)} km`;
  ouvrirResultats();
}

/* Séparé de `montrerResultats` parce que le parcours restauré au lancement
   passe par ici sans avoir ni cible ni durée de calcul à afficher. */
function ouvrirResultats() {
  $('reglages').hidden = true;
  $('monquartier').hidden = true;
  $('resultats').hidden = false;
  carte.quartier = false;
  peindreOnglets();
  peindreMode();
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
  if (document.visibilityState === 'visible') demarrerSuivi();
}

/* Une fois le parcours choisi, les réglages et les deux autres propositions
   ne servent plus à rien : ce qu'on veut voir en courant, c'est la carte et
   ce qui reste. Le panneau se réduit, et la carte prend la place. */
function peindreMode() {
  $('choix').hidden = !!etat.enCourse;
  $('course').hidden = !etat.enCourse;
  /* « Suivre ce parcours » enregistre la sortie APRÈS le dernier rendu de
     l'écran de choix. Sans ce repeint, revenir par « Changer de parcours »
     juste après la toute première sortie montrait encore l'écran sans
     onglets, alors qu'ils avaient de quoi exister. */
  peindreOnglets();
  peindreGarder();
}

function peindreGarder() {
  const b = etat.boucles[etat.choisie];
  const deja = b ? favoris.estGarde(b) : false;
  const bouton = $('garder');
  bouton.setAttribute('aria-pressed', String(deja));
  bouton.textContent = deja ? 'Gardé' : 'Garder';
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
    // Une boucle reçue par lien n'a pas de compte de feux : on se tait
    // plutôt que d'inventer un chiffre.
    const sait = b.feux != null;
    const feux = !sait ? ''
               : b.feux === 0 ? '<b>aucun feu</b>'
               : b.feux === 1 ? '<b>1 feu</b>'
               : `<b>${b.feux} feux</b>`;
    // L'éclairage n'est affiché que quand il apprend quelque chose : en mode
    // nocturne, ou quand une part notable du parcours n'est pas éclairée.
    // « 100 % éclairé » sur les trois cartes n'aide personne à choisir et
    // faisait déborder la ligne sur trois lignes en 360 px de large.
    const parle = sait && (etat.nuit || b.fractionEclairee === null || b.fractionEclairee < 0.9);
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

    /* Le critère qui manquait pour trancher entre trois boucles de même
       longueur. Il n'apparaît que s'il a été calculé : une boucle restaurée
       au lancement ou reprise d'un favori n'a pas de score, et inventer un
       « 0 % » serait pire que se taire. */
    const score = b.score == null ? '' : `<span class="score">${b.score}</span>`;

    el.innerHTML =
      `<span class="km">${(b.m / 1000).toFixed(2)} km</span>` +
      `<span class="detail">${par}<br>${feux}${feux ? ' · ' : ''}${minutes} min${eclaire}${score}</span>` +
      `<span class="puce" aria-hidden="true"></span>`;
    el.setAttribute('aria-label',
      `Boucle de ${(b.m / 1000).toFixed(2)} kilomètres` +
      (rue ? `, ${texteBrut(nommer(rue.nom))}` : '') +
      (sait ? `, ${b.feux} feu${b.feux > 1 ? 'x' : ''}` : '') +
      `, environ ${minutes} minutes` +
      (b.score ? `, ${b.score}` : ''));
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

/* La dernière position relevée, gardée pour le partage : on ne rallume pas
   le GPS juste pour joindre un point qu'on avait il y a dix secondes. */
let derniereVue = null;

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
  derniereVue = { lat: p.lat, lon: p.lon, quand: Date.now() };
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
  /* Plus de phrase pour expliquer ce que veut dire le jaune : la flèche le
     dit d'elle-même, et une légende qu'on relit à chaque coup d'oeil est du
     bruit. Il ne reste que le seul chiffre qu'on lit en courant. */
  ligne.innerHTML = reste >= 1000
    ? `Encore <b>${(reste / 1000).toFixed(2)} km</b>`
    : `Encore <b>${reste} m</b>`;
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

/* ⚠️ Les deux ronds agissent sur le NOMBRE AFFICHé, pas sur la vitesse.
   La première version faisait l'inverse, en se disant que « + » veut dire
   « plus vite » : appuyer sur moins faisait alors monter le 6:00 à l'écran.
   Un bouton posé à côté d'un nombre doit déplacer ce nombre dans le sens
   qu'il annonce, quoi que ce nombre veuille dire. */
$('allure-moins').addEventListener('click', () => {
  etat.allure = Math.max(3 * 60, etat.allure - 10); ecrireReglages(); peindreReglages();
});
$('allure-plus').addEventListener('click', () => {
  etat.allure = Math.min(9 * 60, etat.allure + 10); ecrireReglages(); peindreReglages();
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
    direUneErreur(message(e));
  } finally {
    b.disabled = false;
  }
});

$('chercher').addEventListener('click', () => chercher(false));
$('autres').addEventListener('click', () => chercher(true));
$('retour').addEventListener('click', () => {
  $('resultats').hidden = true;
  $('monquartier').hidden = true;
  $('reglages').hidden = false;
  // Repeindre : sans ça l'indigo de « Mon quartier » reste à l'écran jusqu'au
  // prochain dessin, et on croit que la carte a changé de couleur.
  carte.quartier = false;
  carte.dessiner();
  etat.enCourse = false;
  sauverParcours(null);
  arreterSuivi();
  // ⚠️ Repeindre, sinon la ligne « Mes parcours » reste à la valeur qu'elle
  // avait avant qu'on garde quoi que ce soit : on venait d'en garder un et
  // l'écran annonçait toujours zéro.
  peindreReglages();
});

$('ouvrir-quartier').addEventListener('click', ouvrirQuartier);
$('fermer-quartier').addEventListener('click', fermerQuartier);

for (const m of ['decouverte', 'conquete']) {
  $('ong-' + m).addEventListener('click', () => {
    if (etat.mode === m) return;
    etat.mode = m;
    ecrireReglages();
    peindreOnglets();
    /* Changer de mode change le classement, donc les propositions. Les
       recalculer sur place évite d'afficher trois boucles choisies pour
       l'autre jeu sous l'onglet qui vient d'être sélectionné. */
    if (!etat.enCourse) chercher(false);
  });
}

$('partager').addEventListener('click', partager);
$('ouvrir-favoris').addEventListener('click', ouvrirFavoris);
$('fermer-favoris').addEventListener('click', fermerFavoris);

$('garder').addEventListener('click', () => {
  const b = etat.boucles[etat.choisie];
  if (!b) return;
  if (favoris.estGarde(b)) {
    // Deuxième appui : on retire, sinon il n'y aurait aucun moyen de
    // défaire un appui malencontreux sans passer par la liste.
    const f = favoris.lireTout().find(x => Math.abs(x.m - b.m) <= 50);
    if (f) favoris.oublier(f.id);
    direUnMoment('Parcours retiré de vos gardés.');
  } else {
    favoris.garder(b) ? direUnMoment('Parcours gardé.')
                      : direUnMoment('Impossible de garder : mémoire pleine.', true);
  }
  peindreGarder();
});

$('suivre').addEventListener('click', () => {
  etat.enCourse = true;
  peindreMode();
  /* C'est ici qu'une rue devient « courue ». On a hésité avec « Garder »,
     qui existe déjà : mais on garde un parcours qu'on compte REFAIRE, pas
     seulement un qu'on a fait. Deux ou trois favoris pour dix sorties, le
     compteur sous-compterait massivement. */
  plateau.enregistrer(etat.boucles[etat.choisie]);
  sauverParcours(etat.boucles[etat.choisie]);
  // Le panneau vient de rétrécir : la carte a plus de place, on la recadre.
  const b = etat.boucles[etat.choisie];
  if (b) { carte.cadrer(b.points); carte.montrer(b, etat.depart); }
});

$('quitter').addEventListener('click', () => {
  etat.enCourse = false;
  peindreMode();
  const b = etat.boucles[etat.choisie];
  if (b) { carte.cadrer(b.points); carte.montrer(b, etat.depart); }
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

/* Un lien reçu passe AVANT le parcours en cours : on vient de le toucher
   dans une messagerie, c'est ce qu'on veut voir. */
const recu = location.hash.startsWith('#p=') ? decoder(location.hash.slice(3)) : null;

const enCoursDeCourse = recu ? null : lireParcours();
if (recu) {
  ouvrirRecu(recu);
} else if (enCoursDeCourse) {
  etat.boucles = [enCoursDeCourse];
  etat.choisie = 0;
  // Rouvrir l'app en pleine course doit rendre l'écran de course, pas la
  // liste des propositions : c'est tout l'intérêt de retrouver son parcours.
  etat.enCourse = enCoursDeCourse.enCourse !== false;
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
  montrerBandeauInstallation();
});

const PLUS_TARD = 'runa-installe-plus-tard';

function montrerBandeauInstallation() {
  if (!inviteInstallation) return;
  // Un refus explicite se respecte pendant une semaine : reproposer a chaque
  // ouverture est le meilleur moyen de faire desinstaller une app.
  try {
    const t = Number(localStorage.getItem(PLUS_TARD) || 0);
    if (Date.now() - t < 7 * 24 * 3600 * 1000) return;
  } catch (e) {}
  $('installe').hidden = false;
}

$('plus-tard').addEventListener('click', () => {
  $('installe').hidden = true;
  try { localStorage.setItem(PLUS_TARD, String(Date.now())); } catch (e) {}
});

$('installer').addEventListener('click', async () => {
  if (!inviteInstallation) return;
  const invite = inviteInstallation;
  inviteInstallation = null;          // une invite ne se rejoue pas
  invite.prompt();
  const { outcome } = await invite.userChoice;
  if (outcome === 'accepted') {
    $('installe').hidden = true;
  } else {
    // Refusée : le bouton reste, mais l'invite est consommée. Le navigateur
    // en renverra une plus tard ; d'ici là on renvoie vers le menu.
    direUnMoment('Sinon, menu du navigateur puis « Installer l’application ».');
  }
});

addEventListener('appinstalled', () => { $('installe').hidden = true; });

// Déjà installée : le bandeau n'a plus lieu d'être.
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) {
  $('installe').hidden = true;
  inviteInstallation = null;
}

/* Dit au filet de sécurité que le module a bien démarré. */
dispatchEvent(new Event('runa-demarre'));

/* Le service worker prévient quand il a remplacé une version précédente : la
   page tourne alors avec l'ancien lot de modules, et il faut la recharger
   pour retrouver un ensemble cohérent. Une seule fois, sinon on boucle. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data || e.data.runa !== 'recharge') return;
    try {
      if (sessionStorage.getItem('runa-recharge')) return;
      sessionStorage.setItem('runa-recharge', '1');
    } catch (err) {}
    location.reload();
  });
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
