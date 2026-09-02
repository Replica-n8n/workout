/* =========================================================================
   GVT Tracker · état, chrono, rendu

   Un seul module : l'app tient en un écran et trois séances. Tout est en
   localStorage, aucun appel réseau une fois la page chargée.
   ========================================================================= */

const $ = sel => document.querySelector(sel);

/* ------------------------------------------------------------ catalogue */

const SEANCES = {
  s1: {
    onglet: 'Torse',
    titre: 'Torse · poussée et tirage',
    exercices: ['A1. Développé couché', 'A2. Tractions', 'B. Écartés poulie', 'C. Facepulls']
  },
  s2: {
    onglet: 'Jambes',
    titre: 'Jambes et abdos',
    exercices: ['A1. Squat', 'A2. Leg curl', 'B. Fentes marchées', 'C. Mollets debout']
  },
  s3: {
    onglet: 'Bras',
    titre: 'Épaules et bras',
    exercices: ['A1. Développé militaire', 'A2. Curl barre EZ', 'B1. Barre au front', 'B2. Élévations latérales']
  }
};

/* Les mouvements principaux (A) portent le volume et le repos long ;
   l'accessoire (B, C) est plus court. Les 10 répétitions du principal sont
   LA prescription du German Volume Training, celle qui va avec les 60 % du
   1RM affichés plus haut : sans elles, le pourcentage ne veut rien dire. */
const PRINCIPAL = { series: 6, reps: 10, repos: 75 };
const ACCESSOIRE = { series: 4, reps: 12, repos: 60 };

const reglage = nom => /^A\d/.test(nom) ? PRINCIPAL : ACCESSOIRE;

/* Le pourcentage du German Volume Training, et le plus petit saut de
   charge réellement montable sur une barre en livres. */
const POURCENT = 0.6;
const PAS_LB = 5;

/* ------------------------------------------------------------ stockage */

const CLES = { series: 'gvt.series', seance: 'gvt.seance', rm: 'gvt.rm', echeance: 'gvt.echeance' };

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

/* --------------------------------------------------------------- sons */

/* Le téléphone est dans la poche ou posé par terre : la fin du repos doit
   s'entendre et se sentir, pas seulement s'afficher. */
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

function vibrer(motif) {
  if ('vibrate' in navigator) { try { navigator.vibrate(motif); } catch {} }
}

/* --------------------------------------------------- écran allumé */

/* Le verrou n'est tenu QUE pendant le repos : c'est le seul moment où on
   attend devant l'écran. Le garder en permanence viderait la batterie
   pour rien pendant qu'on soulève. */
let verrou = null;
let verrouEnVol = false;

async function prendreVerrou() {
  if (!('wakeLock' in navigator) || verrou || verrouEnVol) return;

  /* Sans ce drapeau, deux appels rapprochés (le début du repos, puis le
     retour au premier plan) partaient chacun sur une requête : le second
     verrou écrasait le premier, que plus personne ne relâchait. */
  verrouEnVol = true;
  try {
    const obtenu = await navigator.wakeLock.request('screen');
    /* Le repos a pu se terminer pendant l'attente. Garder ce verrou
       laisserait l'écran allumé sans qu'aucun compte à rebours ne tourne. */
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

/* Un verrou est perdu dès que l'écran s'éteint ou que l'app passe en
   arrière-plan : au retour, il faut le redemander. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  battement();
  if (echeance) prendreVerrou();
});

/* -------------------------------------------------------------- chrono */

/* L'échéance est un timestamp absolu, jamais un compteur qui décrémente :
   un setInterval est gelé dès que l'onglet passe en arrière-plan, une
   date ne l'est pas. Au retour, le temps affiché est le vrai. */
let echeance = lire(CLES.echeance, 0) || 0;
let battementId = null;

/* Au-delà de ce retard, la fin du repos n'est plus annoncée : on revient sur
   l'app longtemps après, et une alerte en retard n'alerte de rien. */
const RETARD_MAX = 2000;

const elChrono = $('#chrono');
const elEtat = $('#chrono-etat');

function mmss(secondes) {
  const s = Math.max(0, secondes);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function lancerRepos(secondes) {
  echeance = Date.now() + secondes * 1000;
  ecrire(CLES.echeance, echeance);
  prendreVerrou();
  demarrerBattement();
  battement();
}

function demarrerBattement() {
  if (battementId) return;
  battementId = setInterval(battement, 250);
}

function arreterBattement() {
  clearInterval(battementId);
  battementId = null;
}

function battement() {
  if (!echeance) return;
  const restant = Math.ceil((echeance - Date.now()) / 1000);

  if (restant > 0) {
    elChrono.textContent = mmss(restant);
    elChrono.classList.add('actif');
    elChrono.classList.remove('fini');
    elEtat.textContent = 'Repos en cours';
    return;
  }

  const retard = Date.now() - echeance;
  arreterBattement();
  echeance = 0;
  ecrire(CLES.echeance, 0);
  rendreVerrou();
  elChrono.textContent = '00:00';
  elChrono.classList.remove('actif');
  elChrono.classList.add('fini');
  elEtat.textContent = 'Repos terminé';

  /* On sonne pour un zéro qu'on vient d'atteindre, pas pour un zéro qu'on
     découvre en revenant sur l'app : le repos peut s'être terminé il y a dix
     minutes, et faire sursauter à ce moment-là n'aide personne. Le repos
     repris après un rechargement, lui, sonne bien, puisqu'il tombe à zéro
     sous les yeux. */
  if (retard < RETARD_MAX && document.visibilityState === 'visible') {
    bip();
    vibrer([300, 150, 300, 150, 500]);
    annoncer('Repos terminé.');
  }
}

function reinitialiserChrono() {
  arreterBattement();
  echeance = 0;
  ecrire(CLES.echeance, 0);
  rendreVerrou();
  elChrono.textContent = '00:00';
  elChrono.classList.remove('actif', 'fini');
  elEtat.textContent = 'Repos';
}

$('#chrono-reset').addEventListener('click', () => {
  reveillerAudio();
  reinitialiserChrono();
});

/* Une échéance survivante d'une session précédente reprend là où elle en
   était ; passée, elle est simplement effacée. */
if (echeance > Date.now()) {
  prendreVerrou();
  demarrerBattement();
  battement();
} else if (echeance) {
  reinitialiserChrono();
}

/* --------------------------------------------------------------- charge */

const elRm = $('#rm');
const elCible = $('#charge-cible');
const elDetail = $('#charge-detail');

function arrondi(valeur) { return Math.round(valeur / PAS_LB) * PAS_LB; }

function majCharge() {
  const rm = Number(elRm.value);
  if (!rm || rm <= 0) {
    elCible.textContent = '-- lb';
    elDetail.textContent = 'Entre ton 1RM pour obtenir la charge.';
    return;
  }
  const exact = rm * POURCENT;
  const barre = arrondi(exact);
  elCible.textContent = barre + ' lb';
  elDetail.textContent = '60 % de ' + rm + ' lb, soit ' + Math.round(exact) +
    ' lb, arrondi au multiple de ' + PAS_LB + '.';
}

elRm.value = lire(CLES.rm, '') || '';
elRm.addEventListener('input', () => {
  ecrire(CLES.rm, elRm.value);
  majCharge();
});
majCharge();

/* ------------------------------------------------------------ annonces */

/* Une zone role="status" ne relit pas un texte identique au précédent : le
   deuxième « Repos terminé » de la séance serait resté muet. On vide, puis
   on réécrit au tour suivant, ce qui compte comme un changement. */
function annoncer(texte) {
  const el = $('#annonce');
  el.textContent = '';
  setTimeout(() => { el.textContent = texte; }, 60);
}

/* --------------------------------------------------------------- rendu */

let courante = lire(CLES.seance, 's1');
if (!SEANCES[courante]) courante = 's1';

const elOnglets = $('#onglets');
const elSeance = $('#seance');

/* Des boutons bascule, pas un `role="tab"` : un vrai onglet ARIA impose la
   navigation aux flèches et un seul arrêt de tabulation pour le groupe.
   Annoncer « onglet » sans tenir cette promesse dessert le lecteur d'écran ;
   `aria-pressed` dit l'état sans rien promettre de plus. */
elOnglets.innerHTML = Object.entries(SEANCES).map(([id, s]) =>
  '<button class="onglet" type="button" id="onglet-' + id + '" data-seance="' + id + '">' +
  s.onglet + '</button>'
).join('');

elOnglets.addEventListener('click', e => {
  const btn = e.target.closest('[data-seance]');
  if (btn) montrer(btn.dataset.seance);
});

function cle(idSeance, iExo, iSerie) { return idSeance + '.' + iExo + '.' + iSerie; }

function montrer(id) {
  courante = id;
  ecrire(CLES.seance, id);

  elOnglets.querySelectorAll('.onglet').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.seance === id))
  );

  const seance = SEANCES[id];

  elSeance.innerHTML =
    '<h2 class="seance-titre">' + seance.titre + '</h2>' +
    seance.exercices.map((nom, iExo) => {
      const { series: nb, reps, repos } = reglage(nom);
      const cases = Array.from({ length: nb }, (_, i) => {
        const k = cle(id, iExo, i);
        return '<label class="serie">' +
          '<input type="checkbox" data-cle="' + k + '" data-repos="' + repos + '" data-exo="' + iExo + '"' +
          (series[k] ? ' checked' : '') +
          ' aria-label="' + nom + ', série ' + (i + 1) + ' sur ' + nb +
          ', ' + reps + ' répétitions">' +
          '</label>';
      }).join('');

      return '<article class="panneau exo" data-exo="' + iExo + '">' +
        '<div class="exo-tete">' +
          '<div>' +
            '<h3 class="exo-nom">' + nom + '</h3>' +
            '<p class="exo-presc">' + reps + ' répétitions par série</p>' +
          '</div>' +
          '<span class="exo-compte" data-compte="' + iExo + '"></span>' +
        '</div>' +
        '<div class="jauge"><span data-jauge="' + iExo + '"></span></div>' +
        '<div class="series">' + cases + '</div>' +
      '</article>';
    }).join('');

  seance.exercices.forEach((_, iExo) => majExercice(iExo));
  /* Une séance reprise en cours de route s'ouvre déjà rangée, sans attendre
     qu'on coche quoi que ce soit. */
  clearTimeout(descenteId);
  reordonner();
  desarmerVidage();
}

/* Renvoie true si l'exercice vient de passer fini, ou de cesser de l'être :
   c'est le seul cas où l'ordre de la liste doit bouger. */
function majExercice(iExo) {
  const bloc = elSeance.querySelector('.exo[data-exo="' + iExo + '"]');
  if (!bloc) return false;
  const cases = bloc.querySelectorAll('input[type=checkbox]');
  const faites = bloc.querySelectorAll('input[type=checkbox]:checked').length;
  bloc.querySelector('[data-jauge]').style.width = (faites / cases.length * 100) + '%';
  bloc.querySelector('[data-compte]').textContent = faites + ' / ' + cases.length + ' séries';

  const fini = faites === cases.length;
  const etaitFini = bloc.classList.contains('fini');
  bloc.classList.toggle('fini', fini);
  return fini !== etaitFini;
}

/* Les exercices finis descendent, pour que le suivant à faire soit toujours
   en tête. `data-exo` reste l'index d'origine dans le catalogue : c'est lui
   qui compose les clés de stockage, et le déplacement ne concerne QUE
   l'affichage. Les toucher reviendrait à effacer des séries en changeant
   l'ordre. */
function reordonner() {
  [...elSeance.querySelectorAll('.exo')]
    .map(bloc => ({ bloc, fini: bloc.classList.contains('fini') ? 1 : 0, i: Number(bloc.dataset.exo) }))
    .sort((a, b) => (a.fini - b.fini) || (a.i - b.i))
    .forEach(({ bloc }) => elSeance.appendChild(bloc));   // appendChild DÉPLACE
}

/* La descente attend une demi-seconde. Sans ce délai, la carte s'échappe
   sous le doigt à l'instant même où on coche la dernière série, et le
   déplacement se lit comme un bug plutôt que comme un rangement. */
let descenteId = null;
function reordonnerBientot() {
  clearTimeout(descenteId);
  descenteId = setTimeout(reordonner, 500);
}

elSeance.addEventListener('change', e => {
  const box = e.target;
  if (!box.matches('input[type=checkbox]')) return;

  reveillerAudio();

  if (box.checked) series[box.dataset.cle] = true;
  else delete series[box.dataset.cle];
  ecrire(CLES.series, series);

  const iExo = Number(box.dataset.exo);
  const ordreChange = majExercice(iExo);
  desarmerVidage();

  if (ordreChange) {
    reordonnerBientot();
    const bloc = elSeance.querySelector('.exo[data-exo="' + iExo + '"]');
    if (bloc.classList.contains('fini')) {
      annoncer(bloc.querySelector('.exo-nom').textContent + ' terminé.');
    }
  }

  if (box.checked) {
    vibrer(50);
    lancerRepos(Number(box.dataset.repos));
  }
});

/* ------------------------------------------------------- vider la séance */

/* Deux temps plutôt qu'une confirmation native : un seul tap ne doit pas
   effacer une séance entière, et une boîte de dialogue système coupe le
   geste à une main. */
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
    elVider.textContent = 'Confirmer : tout décocher';
    return;
  }
  Object.keys(series).forEach(k => { if (k.startsWith(courante + '.')) delete series[k]; });
  ecrire(CLES.series, series);
  montrer(courante);
  annoncer('Séries effacées.');
});

/* ---------------------------------------------------------- défilement */

/* Sous le défilement, l'en-tête se replie pour laisser voir la grille. */
let compact = false;
addEventListener('scroll', () => {
  const doit = scrollY > 40;
  if (doit === compact) return;
  compact = doit;
  $('#entete').classList.toggle('compact', doit);
}, { passive: true });

montrer(courante);

/* ---------------------------------------------------------- installation */

/* Sans ce bouton, l'app était installable sans jamais le proposer : Chrome
   ne montre plus de bandeau de lui-même, il se contente de prévenir la page
   par `beforeinstallprompt`, et une page qui ignore cet événement paraît
   ne pas être une app. C'était le cas ici. */
let evenementInstall = null;
const elInstall = $('#install');

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  evenementInstall = e;
  elInstall.hidden = false;
});

/* L'écoute du clic est posée UNE fois, hors de l'événement : l'attacher à
   l'intérieur empilerait un écouteur de plus à chaque `beforeinstallprompt`,
   et le même appui déclencherait alors plusieurs invites. */
elInstall.addEventListener('click', async () => {
  const invite = evenementInstall;
  if (!invite) return;
  /* L'événement ne sert qu'une fois, refusé ou accepté. On le jette donc
     tout de suite ; si le navigateur en renvoie un autre plus tard, le
     bouton revient de lui-même. */
  evenementInstall = null;
  elInstall.hidden = true;
  try { await invite.prompt(); } catch {}
});

addEventListener('appinstalled', () => {
  evenementInstall = null;
  elInstall.hidden = true;
});

/* Safari sur iPhone ne déclenche jamais `beforeinstallprompt` : la seule
   voie est Partager puis « Sur l'écran d'accueil ». Sans ce rappel, l'app
   a l'air non installable sur iPhone alors qu'elle l'est. */
const surIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dejaInstallee = matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;
if (surIOS && !dejaInstallee) $('#install-ios').hidden = false;

/* ------------------------------------------------------- service worker */

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    /* On note AVANT d'enregistrer si la page était déjà pilotée par un
       worker. Tester `controller` plus tard ne marche pas : install appelle
       skipWaiting() et activate appelle clients.claim(), si bien que la
       toute première installation se donne un contrôleur avant que le
       statechange arrive, et la page annonçait « nouvelle version prête »
       à quelqu'un qui ouvrait l'app pour la première fois. */
    const dejaPilotee = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && dejaPilotee) {
            const barre = $('#update-bar');
            barre.hidden = false;
            $('#update-btn').addEventListener('click', () => {
              sw.postMessage('skip-waiting');
              location.reload();
            });
          }
        });
      });
    }).catch(() => {});
  });
}
