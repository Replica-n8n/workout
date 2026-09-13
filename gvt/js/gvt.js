/* =========================================================================
   GVT Tracker v2 · état, chrono, rendu

   Un seul module. Deux écrans qui alternent : la SÉRIE (un gros bouton pour
   dire qu'elle est faite) et le REPOS (tout l'écran se vide). Tout est en
   localStorage, aucun appel réseau une fois la page chargée.

   ⚠️ LES DONNÉES RESTENT COMPATIBLES AVEC LA 1.x. La v2 est testée sur la même
   origine que l'app en production (replica-n8n.github.io), donc elle lit et
   écrit le MÊME localStorage. Les clés et leur format n'ont pas bougé :
   `gvt.series` garde ses clés « séance.exercice.série », `gvt.rm` reste le
   1RM du développé couché. On n'ajoute que des clés nouvelles.
   ========================================================================= */

const $ = sel => document.querySelector(sel);

/* ------------------------------------------------------------ catalogue */

/* `barre` : poids de la barre en livres, ou null sans barre (machine, poids
   du corps, poulie). `pct` : la charge se calcule à 60 % du 1RM, ce qui ne
   vaut que pour les mouvements principaux chargés.
   ⚠️ La barre EZ est comptée à 25 lb : c'est une valeur courante, mais elles
   pèsent de 15 à 30 lb selon les salles. À confirmer avec la vraie. */
const SEANCES = {
  s1: { onglet: 'Torse', titre: 'Torse · poussée et tirage', exercices: [
    { nom: 'Développé couché', court: 'A1', barre: 45, pct: true },
    { nom: 'Tractions', court: 'A2', barre: null, pct: false },
    { nom: 'Écartés poulie', court: 'B', barre: null, pct: false },
    { nom: 'Facepulls', court: 'C', barre: null, pct: false }
  ] },
  s2: { onglet: 'Jambes', titre: 'Jambes et abdos', exercices: [
    { nom: 'Squat', court: 'A1', barre: 45, pct: true },
    { nom: 'Leg curl', court: 'A2', barre: null, pct: true },
    { nom: 'Fentes marchées', court: 'B', barre: null, pct: false },
    { nom: 'Mollets debout', court: 'C', barre: null, pct: false }
  ] },
  s3: { onglet: 'Bras', titre: 'Épaules et bras', exercices: [
    { nom: 'Développé militaire', court: 'A1', barre: 45, pct: true },
    { nom: 'Curl barre EZ', court: 'A2', barre: 25, pct: true },
    { nom: 'Barre au front', court: 'B1', barre: null, pct: false },
    { nom: 'Élévations latérales', court: 'B2', barre: null, pct: false }
  ] }
};

/* Les mouvements principaux (A) portent le volume et le repos long ;
   l'accessoire (B, C) est plus court. */
const PRINCIPAL = { series: 6, reps: 10, repos: 75 };
const ACCESSOIRE = { series: 4, reps: 12, repos: 60 };
const reglage = exo => /^A\d/.test(exo.court) ? PRINCIPAL : ACCESSOIRE;

const POURCENT = 0.6;
const PAS_LB = 5;

/* Les disques disponibles, du plus lourd au plus léger, avec leurs couleurs
   de compétition en livres. Largeur et hauteur servent au dessin. */
const DISQUES = [
  { lb: 45, couleur: '#1F4FD8', h: 56, l: 13 },
  { lb: 35, couleur: '#F2C200', h: 50, l: 12 },
  { lb: 25, couleur: '#2E9E4F', h: 44, l: 11 },
  { lb: 10, couleur: '#F4F4F4', h: 34, l: 9, bord: true },
  { lb: 5, couleur: '#2A2A2A', h: 26, l: 7 },
  { lb: 2.5, couleur: '#5A5A5A', h: 20, l: 6 }
];

/* ------------------------------------------------------------ stockage */

const CLES = {
  series: 'gvt.series', seance: 'gvt.seance', rm: 'gvt.rm', echeance: 'gvt.echeance',
  duree: 'gvt.duree', rms: 'gvt.rms', repris: 'gvt.repris'
};

function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    return brut === null ? defaut : JSON.parse(brut);
  } catch { return defaut; }
}

function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch {}
}

let series = lire(CLES.series, {});
if (typeof series !== 'object' || series === null) series = {};

let rms = lire(CLES.rms, {});
if (typeof rms !== 'object' || rms === null) rms = {};

/* Le 1RM d'un exercice. Celui du développé couché vit aussi dans l'ancienne
   clé `gvt.rm`, que la 1.x lit : on la garde synchronisée. */
function rmDe(idSeance, iExo) {
  const k = idSeance + '.' + iExo;
  if (Number(rms[k]) > 0) return Number(rms[k]);
  if (k === 's1.0' && Number(lire(CLES.rm, 0)) > 0) return Number(lire(CLES.rm, 0));
  return 0;
}

function reglerRm(idSeance, iExo, valeur) {
  const k = idSeance + '.' + iExo;
  const v = Math.max(0, Math.min(1500, Math.round(Number(valeur) || 0)));
  if (v > 0) rms[k] = v; else delete rms[k];
  ecrire(CLES.rms, rms);
  if (k === 's1.0') ecrire(CLES.rm, v > 0 ? String(v) : '');
}

/* ------------------------------------------------------------ calculs */

const arrondi = v => Math.round(v / PAS_LB) * PAS_LB;

function chargeDe(idSeance, iExo) {
  const rm = rmDe(idSeance, iExo);
  return rm > 0 ? arrondi(rm * POURCENT) : 0;
}

/* Les disques à mettre DE CHAQUE CÔTÉ, en commençant par les plus lourds.
   `reste` est ce qu'aucune combinaison de disques ne permet de charger. */
function disquesPourCote(total, barre) {
  let reste = (total - barre) / 2;
  const cote = [];
  if (reste < 0) return { cote, reste: 0, tropLeger: true };
  DISQUES.forEach(d => { while (reste >= d.lb - 1e-9) { cote.push(d); reste -= d.lb; } });
  return { cote, reste: Math.round(reste * 100) / 100, tropLeger: false };
}

function svgBarre(total, barre, largeur, hauteur) {
  const { cote } = disquesPourCote(total, barre);
  const cx = largeur / 2, milieu = hauteur / 2, manchon = largeur * 0.3, k = hauteur / 64;
  let g = '<rect x="0" y="' + (milieu - 3) + '" width="' + largeur + '" height="6" rx="3" fill="var(--outline)"/>' +
    '<rect x="' + (cx - manchon / 2) + '" y="' + (milieu - 5) + '" width="' + manchon + '" height="10" rx="3" fill="var(--outline-variant)"/>';
  let gauche = cx - manchon / 2 - 2, droite = cx + manchon / 2 + 2;
  cote.forEach(d => {
    const h = d.h * k, l = d.l * k, bord = d.bord ? ' stroke="#8a8a8a" stroke-width="1"' : '';
    gauche -= l;
    g += '<rect x="' + gauche.toFixed(1) + '" y="' + (milieu - h / 2).toFixed(1) + '" width="' + (l - 1).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2.5" fill="' + d.couleur + '"' + bord + '/>';
    g += '<rect x="' + droite.toFixed(1) + '" y="' + (milieu - h / 2).toFixed(1) + '" width="' + (l - 1).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2.5" fill="' + d.couleur + '"' + bord + '/>';
    droite += l;
  });
  return '<svg viewBox="0 0 ' + largeur + ' ' + hauteur + '" aria-hidden="true" focusable="false">' + g + '</svg>';
}

function phraseDisques(total, barre) {
  const r = disquesPourCote(total, barre);
  if (r.tropLeger) return 'Plus léger que la barre de ' + barre + ' lb.';
  const liste = r.cote.length ? r.cote.map(d => String(d.lb).replace('.', ',')).join(' + ') : 'aucun disque';
  return 'Barre ' + barre + ' lb · de chaque côté : ' + liste +
    (r.reste > 0 ? ' (il manque ' + String(r.reste * 2).replace('.', ',') + ' lb)' : '');
}

/* --------------------------------------------------------------- sons */

/* Le téléphone est posé par terre : la fin du repos doit s'entendre et se
   sentir, pas seulement s'afficher. */
let audio = null;

function reveillerAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    /* iOS suspend le contexte hors geste utilisateur ; on le relance à
       chaque tap, sinon le bip de fin de repos reste muet. */
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {}
}

function bip() {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  [0, 0.28, 0.56].forEach(decalage => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + decalage);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + decalage + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decalage + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + decalage);
    osc.stop(t0 + decalage + 0.22);
  });
}

/* Les vibrations ponctuent, elles ne bavardent pas : une brève pour une
   série faite, une longue pour la fin du repos. */
function vibrer(motif) {
  if ('vibrate' in navigator) { try { navigator.vibrate(motif); } catch {} }
}

/* ------------------------------------------------------------ annonces */

/* Une zone role="status" ne relit pas un texte identique au précédent : on
   vide, puis on réécrit au tour suivant. */
function annoncer(texte) {
  const el = $('#annonce');
  el.textContent = '';
  setTimeout(() => { el.textContent = texte; }, 60);
}

/* --------------------------------------------------- écran allumé */

/* Le verrou n'est tenu QUE pendant le repos : c'est le seul moment où on
   attend devant l'écran. */
let verrou = null;
let verrouEnVol = false;

async function prendreVerrou() {
  if (!('wakeLock' in navigator) || verrou || verrouEnVol) return;
  /* Sans ce drapeau, deux appels rapprochés partaient chacun sur une
     requête, et le second verrou écrasait le premier sans le relâcher. */
  verrouEnVol = true;
  try {
    const obtenu = await navigator.wakeLock.request('screen');
    if (echeance) verrou = obtenu;
    else Promise.resolve(obtenu.release()).catch(() => {});
  } catch {
    verrou = null;
  } finally {
    verrouEnVol = false;
  }
}

function rendreVerrou() {
  if (!verrou) return;
  try { Promise.resolve(verrou.release()).catch(() => {}); } catch {}
  verrou = null;
}

/* -------------------------------------------------------------- état */

let courante = lire(CLES.seance, 's1');
if (!SEANCES[courante]) courante = 's1';

const cle = (idSeance, iExo, iSerie) => idSeance + '.' + iExo + '.' + iSerie;

/* Le nombre de séries faites d'un exercice. La 1.x laissait cocher n'importe
   quelle case : on compte donc toutes les cases cochées, pas seulement celles
   du début. */
function faitesDe(idSeance, iExo) {
  const { series: nb } = reglage(SEANCES[idSeance].exercices[iExo]);
  let n = 0;
  for (let i = 0; i < nb; i++) if (series[cle(idSeance, iExo, i)]) n++;
  return n;
}

/* La prochaine case libre, pour qu'une séance commencée en 1.x continue
   sans écraser une case déjà cochée. */
function prochaineCaseLibre(idSeance, iExo) {
  const { series: nb } = reglage(SEANCES[idSeance].exercices[iExo]);
  for (let i = 0; i < nb; i++) if (!series[cle(idSeance, iExo, i)]) return i;
  return -1;
}

function premierInacheve(idSeance) {
  const exos = SEANCES[idSeance].exercices;
  for (let i = 0; i < exos.length; i++) if (faitesDe(idSeance, i) < reglage(exos[i]).series) return i;
  return exos.length - 1;
}

let exoCourant = premierInacheve(courante);

/* -------------------------------------------------------------- chrono */

/* L'échéance est un timestamp absolu, jamais un compteur qui décrémente :
   un setInterval est gelé dès que l'écran s'éteint, une date ne l'est pas. */
let echeance = lire(CLES.echeance, 0) || 0;
let duree = lire(CLES.duree, 0) || 0;
let battementId = null;

/* Au-delà de ce retard, la fin du repos n'est plus annoncée : on revient sur
   l'app longtemps après, et une alerte en retard n'alerte de rien. */
const RETARD_MAX = 2000;

const elApp = $('#app');

function mmss(secondes) {
  const s = Math.max(0, secondes);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function montrerPhase(phase) {
  elApp.dataset.phase = phase;
  if (phase === 'repos') caler();
}

/* La hauteur réelle de l'écran de repos, pour le calque foncé du niveau. */
function caler() {
  const h = $('#ecran-repos').clientHeight;
  if (h) elApp.style.setProperty('--plein', h + 'px');
}
addEventListener('resize', caler);

function lancerRepos(secondes) {
  echeance = Date.now() + secondes * 1000;
  duree = secondes;
  ecrire(CLES.echeance, echeance);
  ecrire(CLES.duree, duree);
  $('#ensuite').textContent = phraseEnsuite();
  majAnnuler();
  montrerPhase('repos');
  prendreVerrou();
  demarrerBattement();
  battement();
}

function demarrerBattement() {
  if (battementId) return;
  battementId = setInterval(battement, 200);
}

function arreterBattement() {
  clearInterval(battementId);
  battementId = null;
}

function peindreRepos(restantMs) {
  const part = duree ? Math.max(0, Math.min(1, restantMs / (duree * 1000))) : 0;
  const texte = mmss(Math.ceil(restantMs / 1000));
  $('#temps-1').textContent = texte;
  $('#temps-2').textContent = texte;
  $('#niveau').style.height = (part * 100) + '%';
}

let dernierLu = -1;

function battement() {
  if (!echeance) return;
  const restantMs = echeance - Date.now();

  if (restantMs > 0) {
    peindreRepos(restantMs);
    /* Le lecteur d'écran n'entend le décompte que toutes les 15 secondes :
       l'annoncer à chaque seconde le rendrait inutilisable. */
    const s = Math.ceil(restantMs / 1000);
    if (s % 15 === 0 && s !== dernierLu) { dernierLu = s; $('#temps-lu').textContent = 'Repos, ' + s + ' secondes.'; }
    return;
  }

  const retard = -restantMs;
  terminerRepos();

  /* On sonne pour un zéro qu'on vient d'atteindre, pas pour un zéro qu'on
     découvre en revenant sur l'app dix minutes plus tard. */
  if (retard < RETARD_MAX && document.visibilityState === 'visible') {
    bip();
    vibrer([300, 150, 300, 150, 500]);
    annoncer('Repos terminé. ' + phraseEnsuite() + '.');
  }
}

function terminerRepos() {
  arreterBattement();
  echeance = 0;
  duree = 0;
  ecrire(CLES.echeance, 0);
  ecrire(CLES.duree, 0);
  rendreVerrou();
  montrerPhase('serie');
  rendre();
}

/* Un verrou est perdu dès que l'écran s'éteint : au retour, il faut le
   redemander, et rattraper le décompte. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  battement();
  if (echeance) prendreVerrou();
});

/* --------------------------------------------------------------- rendu */

const elExos = $('#exos');

function phraseEnsuite() {
  const exos = SEANCES[courante].exercices;
  const exo = exos[exoCourant];
  const f = faitesDe(courante, exoCourant), nb = reglage(exo).series;
  if (f < nb) {
    const charge = exo.pct ? chargeDe(courante, exoCourant) : 0;
    return 'Série ' + (f + 1) + (charge ? ' · ' + charge + ' lb' : ' · ' + reglage(exo).reps + ' répétitions');
  }
  const suivant = exos[exoCourant + 1];
  return suivant ? suivant.nom + ', série 1' : 'Séance terminée';
}

function rendreExos() {
  elExos.innerHTML = SEANCES[courante].exercices.map((exo, i) => {
    const f = faitesDe(courante, i), nb = reglage(exo).series, fini = f === nb;
    return '<button class="exo' + (fini ? ' fini' : '') + '" type="button" data-i="' + i + '" aria-pressed="' + (i === exoCourant) + '"' +
      ' aria-label="' + exo.nom + ', ' + (fini ? 'terminé' : f + ' séries sur ' + nb) + '">' +
      '<b>' + exo.court + '</b><span>' + (fini ? 'fini' : f + ' / ' + nb) + '</span></button>';
  }).join('');
}

function rendre() {
  const seance = SEANCES[courante];
  const exo = seance.exercices[exoCourant];
  const { series: nb, reps } = reglage(exo);
  const f = faitesDe(courante, exoCourant);
  const fini = f === nb;
  const suivant = seance.exercices[exoCourant + 1];
  const charge = exo.pct ? chargeDe(courante, exoCourant) : 0;

  $('#ouvrir-seance').textContent = seance.onglet;
  $('#ouvrir-seance').setAttribute('aria-label', 'Séance ' + seance.onglet + ', changer de séance');
  $('#nom').textContent = exo.nom;

  $('#compteur').hidden = fini;
  $('#num').textContent = String(f + 1);
  $('#sur').textContent = '/' + nb;
  $('#compteur').setAttribute('aria-label', 'Série ' + (f + 1) + ' sur ' + nb);
  $('#presc').textContent = fini ? '' : reps + ' répétitions';

  let charges = '';
  if (!fini && exo.pct) {
    charges = charge
      ? '<button class="charge" type="button" id="charge" aria-label="Charge ' + charge + ' livres, régler le 1RM">' +
          (exo.barre ? svgBarre(charge, exo.barre, 96, 42) : '') +
          '<span class="txt"><b>' + charge + ' lb</b><small>60 % du 1RM · régler</small></span></button>'
      : '<button class="charge vide" type="button" id="charge">Entrer le 1RM pour la charge</button>';
  }
  $('#bloc-charge').innerHTML = charges;

  $('#bloc-fin').innerHTML = fini
    ? '<div class="fin"><b>' + nb + ' séries de ' + reps + ', toutes faites</b><p>' +
        (exo.pct && charge ? 'La prochaine fois : <strong>' + (charge + PAS_LB) + ' lb</strong>.' : 'Même charge la prochaine fois, ou un cran au-dessus si c\'était facile.') +
        '</p>' + (exo.pct && charge ? '<small>Proposition, à ajuster si les dernières séries étaient à la limite.</small>' : '') + '</div>'
    : '';

  $('#action').textContent = fini
    ? (suivant ? 'Passer à ' + suivant.nom : 'Séance terminée')
    : 'Série ' + (f + 1) + ' faite';
  $('#action').disabled = fini && !suivant;
  if (echeance) $('#ensuite').textContent = phraseEnsuite();

  rendreExos();
}

/* ------------------------------------------------------------ actions */

/* La dernière série cochée, pour pouvoir l'annuler pendant le repos : un
   appui de trop arrive, et il se rattrape là où on le voit. */
let derniere = lire(CLES.repris, null);

function majAnnuler() {
  const b = $('#annuler');
  if (derniere && series[derniere.cle]) {
    b.hidden = false;
    b.textContent = 'Annuler la série ' + (derniere.iSerie + 1);
  } else {
    b.hidden = true;
  }
}

$('#action').addEventListener('click', () => {
  reveillerAudio();
  const exos = SEANCES[courante].exercices;
  const exo = exos[exoCourant];
  const libre = prochaineCaseLibre(courante, exoCourant);

  if (libre < 0) {
    if (exos[exoCourant + 1]) { exoCourant++; rendre(); annoncer(exos[exoCourant].nom + '.'); }
    return;
  }

  const k = cle(courante, exoCourant, libre);
  series[k] = true;
  ecrire(CLES.series, series);
  derniere = { cle: k, seance: courante, iExo: exoCourant, iSerie: libre };
  ecrire(CLES.repris, derniere);
  vibrer(40);
  rendre();
  lancerRepos(reglage(exo).repos);
});

$('#bloc-charge').addEventListener('click', e => {
  if (e.target.closest('#charge')) ouvrirReglages(true);
});

elExos.addEventListener('click', e => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  exoCourant = Number(b.dataset.i);
  rendre();
});

$('#plus15').addEventListener('click', () => {
  if (!echeance) return;
  echeance += 15000;
  duree += 15;
  ecrire(CLES.echeance, echeance);
  ecrire(CLES.duree, duree);
  battement();
});

$('#passer').addEventListener('click', () => {
  terminerRepos();
  annoncer(phraseEnsuite() + '.');
});

$('#annuler').addEventListener('click', () => {
  if (!derniere) return;
  delete series[derniere.cle];
  ecrire(CLES.series, series);
  /* On revient à la séance ET à l'exercice de la série annulée : la séance
     a pu changer pendant le repos, et l'index seul pointait alors dans la
     mauvaise séance. */
  if (SEANCES[derniere.seance]) { courante = derniere.seance; ecrire(CLES.seance, courante); }
  exoCourant = derniere.iExo;
  derniere = null;
  ecrire(CLES.repris, null);
  terminerRepos();
  annoncer('Série annulée.');
});

/* ------------------------------------------------------------ réglages */

const elFeuille = $('#reglages');
const elRm = $('#rm');

function exoARegler() {
  const exos = SEANCES[courante].exercices;
  if (exos[exoCourant].pct) return exoCourant;
  const i = exos.findIndex(x => x.pct);
  return i < 0 ? null : i;
}

function rendreRm() {
  const i = exoARegler();
  $('#bloc-rm').hidden = i === null;
  if (i === null) return;
  const exo = SEANCES[courante].exercices[i];
  $('#rm-titre').textContent = '1RM · ' + exo.nom;
  const rm = rmDe(courante, i);
  if (document.activeElement !== elRm) elRm.value = rm > 0 ? String(rm) : '';
  const charge = chargeDe(courante, i);
  $('#rm-apercu').innerHTML = charge
    ? '<div class="ligne"><span>Charge à 60 %</span><b>' + charge + ' lb</b></div>' +
      (exo.barre ? svgBarre(charge, exo.barre, 300, 60) + '<p>' + phraseDisques(charge, exo.barre) + '</p>' : '<p>Sur machine : réglez la charge la plus proche.</p>')
    : '<p>Entrez le 1RM : la charge et les disques se calculent tout seuls.</p>';
}

function rendreSeances() {
  $('#seances').innerHTML = Object.entries(SEANCES).map(([id, s]) =>
    '<button class="option" type="button" data-seance="' + id + '" aria-pressed="' + (id === courante) + '">' + s.onglet + '</button>'
  ).join('');
}

function ouvrirReglages(versLeRm) {
  desarmerVidage();
  rendreRm();
  rendreSeances();
  if (!elFeuille.open) elFeuille.showModal();
  if (versLeRm && !$('#bloc-rm').hidden) elRm.focus();
}

$('#ouvrir-reglages').addEventListener('click', () => ouvrirReglages(false));
$('#ouvrir-seance').addEventListener('click', () => ouvrirReglages(false));
$('#fermer').addEventListener('click', () => elFeuille.close());
/* Un appui sur le fond assombri ferme la feuille, comme partout ailleurs. */
elFeuille.addEventListener('click', e => { if (e.target === elFeuille) elFeuille.close(); });
elFeuille.addEventListener('close', () => rendre());

elRm.addEventListener('input', () => {
  const i = exoARegler();
  if (i === null) return;
  reglerRm(courante, i, elRm.value);
  rendreRm();
  rendre();
});

function pasRm(delta) {
  const i = exoARegler();
  if (i === null) return;
  const v = Math.max(0, (rmDe(courante, i) || 0) + delta);
  reglerRm(courante, i, v);
  elRm.value = v > 0 ? String(v) : '';
  rendreRm();
  rendre();
}
$('#rm-moins').addEventListener('click', () => pasRm(-PAS_LB));
$('#rm-plus').addEventListener('click', () => pasRm(PAS_LB));

$('#seances').addEventListener('click', e => {
  const b = e.target.closest('[data-seance]');
  if (!b || b.dataset.seance === courante) return;
  courante = b.dataset.seance;
  ecrire(CLES.seance, courante);
  exoCourant = premierInacheve(courante);
  rendreSeances();
  rendreRm();
  rendre();
});

/* Vider en deux temps : un seul appui ne doit pas effacer une séance. */
const elVider = $('#vider');
let armee = false;

function desarmerVidage() {
  armee = false;
  elVider.classList.remove('arme');
  elVider.textContent = 'Vider les séries de cette séance';
}

elVider.addEventListener('click', () => {
  if (!armee) {
    armee = true;
    elVider.classList.add('arme');
    elVider.textContent = 'Confirmer : tout effacer';
    return;
  }
  Object.keys(series).forEach(k => { if (k.startsWith(courante + '.')) delete series[k]; });
  ecrire(CLES.series, series);
  derniere = null;
  ecrire(CLES.repris, null);
  exoCourant = 0;
  desarmerVidage();
  if (echeance) terminerRepos(); else rendre();
  annoncer('Séries effacées.');
});

/* ------------------------------------------------------------ démarrage */

/* Un repos survivant d'une session précédente reprend là où il en était ;
   passé, il est simplement effacé. */
if (echeance > Date.now()) {
  $('#ensuite').textContent = phraseEnsuite();
  majAnnuler();
  montrerPhase('repos');
  prendreVerrou();
  demarrerBattement();
  battement();
} else if (echeance) {
  echeance = 0;
  ecrire(CLES.echeance, 0);
}
rendre();

/* ---------------------------------------------------------- installation */

/* Chrome ne montre plus de bandeau : il prévient la page par
   `beforeinstallprompt`, et une page qui l'ignore paraît ne pas être une app. */
let evenementInstall = null;
const elInstall = $('#install');

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  evenementInstall = e;
  elInstall.hidden = false;
});

/* L'écoute du clic est posée UNE fois, hors de l'événement : sinon un
   écouteur de plus s'empilerait à chaque `beforeinstallprompt`. */
elInstall.addEventListener('click', async () => {
  const invite = evenementInstall;
  if (!invite) return;
  evenementInstall = null;
  elInstall.hidden = true;
  try { await invite.prompt(); } catch {}
});

addEventListener('appinstalled', () => {
  evenementInstall = null;
  elInstall.hidden = true;
});

/* Safari sur iPhone ne déclenche jamais `beforeinstallprompt`. */
const surIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dejaInstallee = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (surIOS && !dejaInstallee) $('#install-ios').hidden = false;

/* ------------------------------------------------------- service worker */

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    /* On note AVANT d'enregistrer si la page était déjà pilotée : sinon la
       toute première installation annonçait « nouvelle version prête ». */
    const dejaPilotee = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.active) {
        const canal = new MessageChannel();
        canal.port1.onmessage = e => { $('#version').textContent = 'Version ' + e.data; };
        reg.active.postMessage('version', [canal.port2]);
      }
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && dejaPilotee) {
            $('#update-bar').hidden = false;
            $('#update-btn').addEventListener('click', () => {
              sw.postMessage('skip-waiting');
              location.reload();
            }, { once: true });
          }
        });
      });
    }).catch(() => {});
  });
}
