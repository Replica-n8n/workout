/* =========================================================================
   La Cour · application
   Une seule série visible à la fois. Le repos verrouille la suivante.
   ========================================================================= */

import { SEANCE, CROISE, RULES, MOVEMENT_ORDER, movement, levelInfo } from './data.js';
import * as store from './store.js';
import * as media from './media.js';
import * as figures from './figures.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const fmt = s => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' + r : r);
};

/* Une seule zone d'annonce, pour les moments qui comptent. Le décompte du
   repos n'y passe JAMAIS : annoncer un nombre par seconde rendrait un
   lecteur d'écran inutilisable. On annonce l'ouverture, pas l'attente. */
function announce(msg) {
  const el = $('#announce');
  if (el) el.textContent = msg;
}

/* Y a-t-il des photos dans images/ ? On le demande UNE fois, au démarrage,
   sur un fichier témoin. Sonder à chaque fiche remplirait la console de 404
   et noierait les vraies erreurs ; tenir une liste des images présentes se
   désynchroniserait du dossier. Un témoin, c'est une seule convention. */
const TEMOIN = 'push_h-3';   // le fichier qui dit si le dossier est peuplé
let photosPresentes = false;

(function detecterPhotos() {
  const sonde = new Image();
  sonde.addEventListener('load', () => {
    photosPresentes = true;
    const c = $('#set-credits');
    if (c) c.hidden = false;              // attribution due dès qu'il y a des photos
  });
  sonde.src = 'images/' + TEMOIN + '.png';
})();

/* La figure d'un mouvement dépend de la variante : en version sans rien, le
   tirage devient de la chaîne postérieure et n'a rien à voir. */
function cleFigure(mov, niveau) {
  const strict = store.get().variant === 'strict' && mov === 'pull';
  return (strict ? 'pull_s' : mov) + '-' + niveau;
}

/* Fenêtre d'explication. Un <dialog> natif plutôt qu'une surcouche maison :
   Échap ferme, le focus est piégé, et le lecteur d'écran l'annonce seul. */
function ouvrirFiche(mov, niveau, titre, sousTitre) {
  const cle = cleFigure(mov, niveau);
  const d = $('#fiche');
  const boite = $('#fiche-dessin');
  $('#fiche-titre').textContent = titre;
  $('#fiche-sous').textContent = sousTitre;
  $('#fiche-note').textContent = figures.note(cle);

  /* Une photo si le fichier existe, le schéma sinon. On tente le chargement
     plutôt que de tenir une liste des images disponibles : une liste se
     désynchronise du dossier, `onerror` non. */
  const schema = figures.figure(cle) || '';
  boite.innerHTML = schema;
  boite.classList.remove('avec-photo');
  if (!photosPresentes) { d.showModal(); return; }

  const img = new Image();
  img.alt = 'Position : ' + titre;
  img.decoding = 'async';
  img.addEventListener('load', () => {
    if ($('#fiche-titre').textContent !== titre) return;   // fiche déjà changée
    boite.replaceChildren(img);
    boite.classList.add('avec-photo');
  });
  img.src = 'images/' + cle + '.png';

  d.showModal();
}

function boutonInfo(mov, niveau, titre, sousTitre) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'info';
  b.textContent = 'i';
  b.setAttribute('aria-label', 'Comment faire : ' + titre);
  b.addEventListener('click', e => {
    e.stopPropagation();
    ouvrirFiche(mov, niveau, titre, sousTitre);
  });
  return b;
}

/* ---------------------------------------------------------------- écrans */

const SCREENS = ['home', 'run', 'progress', 'settings'];
let navReady = false;

function goto(name, fromPop) {
  SCREENS.forEach(s => {
    const el = $('#screen-' + s);
    if (el) el.hidden = (s !== name);
  });
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'progress') renderProgress();
  if (name === 'settings') renderSettings();

  /* Le retour matériel d'Android et le balayage d'iOS doivent revenir d'un
     écran, pas fermer l'app installée. Chaque écran est donc une entrée
     d'historique. */
  if (fromPop) return;
  if (!navReady) { history.replaceState({ screen: name }, ''); navReady = true; }
  else if (!history.state || history.state.screen !== name) {
    history.pushState({ screen: name }, '');
  }
}

/* Revenir en arrière DANS l'app doit consommer l'entrée de l'aller, jamais
   en empiler une nouvelle : sinon le retour matériel repasse par tous les
   écrans déjà visités au lieu de sortir. */
function goBack() {
  const here = history.state && history.state.screen;
  if (here && here !== 'home') history.back();
  else goto('home');
}

window.addEventListener('popstate', e => {
  const target = (e.state && e.state.screen) || 'home';

  if (document.body.dataset.screen === 'run' && target !== 'run') {
    pauseRun();
    goto('home', true);
    return;
  }

  /* L'entrée « run » survit à la mise en pause. Y revenir en avant
     afficherait un écran figé dont les boutons ne répondent plus : on
     renvoie à l'accueil et on écrase l'entrée morte. */
  if (target === 'run' && !run) {
    goto('home', true);
    history.replaceState({ screen: 'home' }, '');
    return;
  }

  goto(target, true);
});

/* ------------------------------------------------------------- construction
   La liste des séries de la séance, à plat. Une entrée = un écran. */

function buildSteps() {
  const st = store.get();
  const session = SEANCE;
  const steps = [];

  session.blocks.forEach((b, bi) => {
    const mv = movement(b.mov, st.variant);
    const lvl = store.levelOf(b.mov);
    const li = levelInfo(b.mov, st.variant, lvl);
    for (let i = 0; i < b.sets; i++) {
      steps.push({
        mov: b.mov,
        title: li.name,
        movName: mv.short || mv.name,
        level: lvl,
        unit: li.unit,
        setNo: i + 1,
        setsTotal: b.sets,
        rest: b.rest,
        block: bi,
        blocks: session.blocks.length + (0),
        unilateral: !!b.unilateral,
        croise: false
      });
    }
  });

  if (store.croiseDue()) {
    const n = store.croiseSets();
    const seq = CROISE.sequence(n);
    const key = 'push_h';
    const lvl = store.levelOf(key);
    const li = levelInfo(key, st.variant, lvl);
    seq.forEach((reps, i) => {
      steps.push({
        mov: key,
        title: li.name,
        movName: 'Le Croisé',
        level: lvl,
        unit: 'reps',
        setNo: i + 1,
        setsTotal: n,
        rest: CROISE.rest,
        block: session.blocks.length,
        blocks: session.blocks.length + 1,
        unilateral: false,
        croise: true,
        target: reps
      });
    });
  }

  steps.forEach(s => { s.blocks = steps[steps.length - 1].block + 1; });
  return steps;
}

/* --------------------------------------------------------------- la séance */

let run = null;          // { type, steps, i, phase, restEndsAt, value, logged, croiseClean, startedAt }
let ticker = null;
let wakeLock = null;
let pendingLevel = null; // proposition de changement de niveau en attente

function startSession(resumed) {
  const steps = resumed ? resumed.steps : buildSteps();
  run = resumed || {
    steps,
    i: 0,
    phase: 'ready',
    restEndsAt: 0,
    value: null,
    logged: [],
    croiseClean: true,
    startedAt: Date.now()
  };
  if (run.value === null || run.value === undefined) run.value = defaultValue();
  pendingLevel = null;
  keepAwake();
  /* Le geste qui a lancé la séance autorise la lecture audio : c'est le seul
     moment où l'on peut ouvrir la session média. */
  media.demarrer({
    suivant: () => { if (run && run.phase === 'rest') unlock(false); },
    pause: () => quitSession()
  }).then(() => peindreVerrouillage());
  goto('run');
  renderRun();
  startTicker();
}

function step() { return run.steps[run.i]; }

function defaultValue() {
  const s = step();
  if (!s) return 0;
  if (s.croise) return s.target;
  return store.prefill(s.mov, s.unit);
}

function persistRun() {
  if (run) store.saveRun(run);
}

/* ------------------------------------------------------------ le chrono */

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    if (!run) return;
    if (run.phase === 'rest') {
      const left = (run.restEndsAt - Date.now()) / 1000;
      if (left <= 0) { unlock(true); return; }
      paintRest(left);
    }
    paintClock();
  }, 250);
}
function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

function paintClock() {
  const el = $('#run-clock');
  if (el && run) el.textContent = fmt((Date.now() - run.startedAt) / 1000);
}

/* Le lecteur du verrouillage porte l'information qui change : le temps
   restant en titre, ce qui vient ensuite juste en dessous. */
function peindreVerrouillage() {
  /* Appelé depuis une promesse : la séance peut avoir été mise en pause
     entre-temps, auquel cas `run` est nul et step() déréférencerait null. */
  if (!run) return;
  const s = step();
  if (!s) return;
  const unite = s.unit === 'sec' ? ' secondes' : ' répétitions';

  if (run.phase === 'rest') {
    const reste = Math.max(0, (run.restEndsAt - Date.now()) / 1000);

    /* Deux chemins, et le meilleur gagne. Une notification se met à jour en
       place et en silence ; le bloc média, lui, se redessine entièrement dès
       que son titre change. Quand la permission est accordée, le décompte
       passe donc par la notification et le bloc média reste figé. */
    if (media.notificationsPretes()) {
      media.chrono(fmt(reste), 'Puis série ' + s.setNo + ' sur ' + s.setsTotal);
      media.afficher({ titre: 'Repos', sousTitre: s.title, detail: '' });
    } else {
      media.afficher({ titre: fmt(reste), sousTitre: '', detail: '', vignette: false });
    }
    media.position(s.rest, s.rest - reste);
  } else {
    media.fermerChrono();
    media.afficher({
      titre: 'Série ' + s.setNo + ' sur ' + s.setsTotal,
      sousTitre: run.value + unite,
      detail: s.title
    });
    media.effacerPosition();
  }
}

function paintRest(left) {
  const s = step();
  const t = $('#focus-time');
  const bar = $('#focus-bar-fill');
  if (t) t.textContent = fmt(left);
  if (bar && s) bar.style.width = Math.round(100 * (1 - left / s.rest)) + '%';
  peindreVerrouillage();
}

/* ------------------------------------------------------------- les actions */

function validate() {
  const s = step();
  if (!s) return;

  // La proposition précédente a eu le temps du repos pour être vue.
  // Sans réponse, elle disparaît : elle reviendra à la prochaine séance.
  pendingLevel = null;

  run.logged.push({ mov: s.mov, level: s.level, value: run.value, croise: s.croise });

  if (!s.croise) {
    const proposal = store.logSet(s.mov, run.value, s.unit);
    /* La proposition s'affiche dès que la condition est remplie, sur le repos
       qui suit. La réserver à la dernière série la rendait imprévisible : on
       pouvait faire trois séries à 13 sans rien voir. Le repos est justement
       le moment où l'on n'interrompt rien. */
    if (proposal) pendingLevel = { mov: s.mov, block: s.block, ...proposal };
  } else if (run.value < s.target) {
    run.croiseClean = false;   // série avortée : la taille ne montera pas
  }

  run.i++;
  if (run.i >= run.steps.length) { finish(); return; }

  run.value = defaultValue();
  run.phase = 'rest';
  run.restEndsAt = Date.now() + s.rest * 1000;
  persistRun();
  renderRun();
}

function unlock(auto) {
  if (!run) return;
  run.phase = 'ready';
  run.restEndsAt = 0;
  persistRun();
  renderRun();
  const s = step();
  if (s) {
    announce('Série ' + s.setNo + ' sur ' + s.setsTotal + ' ouverte, ' +
             run.value + (s.unit === 'sec' ? ' secondes' : ' répétitions') +
             ', ' + s.title);
  }
  if (auto) {
    media.bip();
    if (s) {
      media.alerteFinRepos('Série ' + s.setNo + ' sur ' + s.setsTotal,
        run.value + (s.unit === 'sec' ? ' secondes' : ' répétitions') + ' · ' + s.title);
    }
  }
}

function adjust(delta) {
  const s = step();
  if (!s) return;
  const base = s.croise ? s.target : store.prefill(s.mov, s.unit);
  const b = store.bounds(base, s.unit);
  const next = run.value + delta * b.step;
  if (next < b.min || next > b.max) return;
  run.value = next;
  persistRun();
  renderRun();
}

function abortCroise() {
  run.croiseClean = false;
  // on saute toutes les séries restantes du Croisé
  while (run.i < run.steps.length && run.steps[run.i].croise) run.i++;
  if (run.i >= run.steps.length) { finish(); return; }
  run.phase = 'ready';
  run.value = defaultValue();
  persistRun();
  renderRun();
}

function finish() {
  stopTicker();
  releaseWake();
  media.arreter();
  const hadCroise = run.steps.some(s => s.croise);
  if (hadCroise) store.finishCroise(run.croiseClean);
  store.finishSession(run.logged, hadCroise ? { sets: store.croiseSets(), clean: run.croiseClean } : null);
  store.clearRun();
  const summary = {
    minutes: Math.round((Date.now() - run.startedAt) / 60000),
    sets: run.logged.length,
    croise: hadCroise ? run.croiseClean : null,
    level: pendingLevel
  };
  run = null;
  pendingLevel = null;
  announce('Séance terminée, ' + summary.sets + ' séries.');
  renderDone(summary);
  goto('home');
}

function pauseRun() {
  if (!run) return;
  stopTicker();
  releaseWake();
  media.arreter();
  persistRun();
  run = null;
}

function quitSession() {
  pauseRun();
  goBack();
}

/* ---------------------------------------------------------------- rendu */

function renderRun() {
  const s = step();
  if (!s) return;

  $('#run-block').textContent = s.croise
    ? 'Le Croisé · en plus'
    : 'Mouvement ' + (s.block + 1) + ' sur ' + s.blocks;

  $('#run-title').textContent = s.title;
  const info = $('#run-info');
  info.replaceChildren(boutonInfo(s.mov, s.level, s.title,
                                  s.movName + ' · niveau ' + s.level));

  const chips = $('#run-chips');
  chips.innerHTML = '';
  chips.appendChild(chip(s.movName + ' · niveau ' + s.level));
  chips.appendChild(chip(
    s.croise
      ? s.setsTotal + ' séries · ' + CROISE.total(s.setsTotal) + ' reps'
      : s.setsTotal + ' séries' + (s.unilateral ? ' par côté' : ''),
    true
  ));

  const bars = $('#run-bars');
  bars.innerHTML = '';
  for (let b = 0; b < s.blocks; b++) {
    const i = document.createElement('i');
    if (b < s.block) i.className = 'f';
    else if (b === s.block) i.className = 'c';
    bars.appendChild(i);
  }

  renderFocus(s);
  renderDoneList(s);
  paintClock();
  peindreVerrouillage();
}

function chip(text, accent) {
  const el = document.createElement('span');
  el.className = 'chip' + (accent ? ' chip-accent' : '');
  el.textContent = text;
  return el;
}

function renderFocus(s) {
  const box = $('#run-focus');
  const act = $('#run-action');
  const alt = $('#run-alt');
  const unitLabel = s.unit === 'sec' ? 'secondes' : 'répétitions';

  if (run.phase === 'ready') {
    const base = s.croise ? s.target : store.prefill(s.mov, s.unit);
    const b = store.bounds(base, s.unit);
    box.innerHTML =
      '<div class="card">' +
        '<span class="card-label">Série ' + s.setNo + ' sur ' + s.setsTotal + '</span>' +
        '<div class="stepper">' +
          '<button class="step-btn" type="button" data-adj="-1" aria-label="Moins">−</button>' +
          '<span class="stepper-value"><b>' + run.value + '</b><small>' + unitLabel + '</small></span>' +
          '<button class="step-btn" type="button" data-adj="1" aria-label="Plus">+</button>' +
        '</div>' +
        '<p class="card-hint">' +
          (s.croise
            ? 'La séquence demande ' + s.target + '. '
            : (() => {
                const p = store.progresNiveau(s.mov, s.unit);
                return 'Niveau suivant à ' + p.requis + ' séries de ' + p.seuil +
                       ' ' + unitLabel + ' : ' + p.faites + ' sur ' + p.requis +
                       ' pour l’instant. ';
              })()) +
          'Touche moins ou plus seulement si tu n’as pas fait ce compte. Réglable de ' +
          b.min + ' à ' + b.max + '.' +
        '</p>' +
      '</div>';
    $$('#run-focus .step-btn').forEach(btn => {
      const d = parseInt(btn.dataset.adj, 10);
      const nextV = run.value + d * b.step;
      btn.disabled = nextV < b.min || nextV > b.max;
      btn.addEventListener('click', () => adjust(d));
    });
    act.textContent = 'Série ' + s.setNo + ' faite';
    act.className = 'btn-primary';
  } else {
    const left = Math.max(0, (run.restEndsAt - Date.now()) / 1000);
    box.innerHTML =
      '<div class="card locked">' +
        '<span class="card-label">Série ' + s.setNo + ' verrouillée · repos</span>' +
        '<div class="card-time" id="focus-time">' + fmt(left) + '</div>' +
        '<div class="card-bar"><i id="focus-bar-fill" style="width:' +
          Math.round(100 * (1 - left / s.rest)) + '%"></i></div>' +
        '<p class="card-hint">Elle s’ouvre à zéro. ' + s.setNo + '<sup>e</sup> série : ' +
          run.value + ' ' + unitLabel + '.</p>' +
        (pendingLevel ? levelBanner() : '') +
      '</div>';
    if (pendingLevel) wireLevelBanner();
    act.textContent = 'Ouvrir maintenant';
    act.className = 'btn-primary btn-wait';
  }

  alt.hidden = !s.croise;
  if (s.croise) alt.textContent = 'Arrêter Le Croisé, amplitude perdue';
}

function levelBanner() {
  const p = pendingLevel;
  const up = p.kind === 'up';
  const unit = p.unit === 'sec' ? 'secondes' : 'répétitions';
  return '<div class="banner" id="level-banner">' +
    '<p>' + (up
      ? RULES.levelUpSets + ' séries à ' + p.target + ' ' + unit +
        '. Passer au niveau ' + p.to + ' ?'
      : 'Deux séries sous ' + p.target + ' ' + unit +
        '. Redescendre au niveau ' + p.to + ' ?') +
    '</p>' +
    '<div class="banner-actions">' +
      '<button type="button" class="btn-small" data-lvl="yes">' + (up ? 'Monter' : 'Redescendre') + '</button>' +
      '<button type="button" class="btn-small ghost" data-lvl="no">Rester</button>' +
    '</div>' +
    '<small>Effectif à la prochaine séance.</small>' +
  '</div>';
}

function wireLevelBanner() {
  const b = $('#level-banner');
  if (!b) return;
  b.addEventListener('click', e => {
    const v = e.target.dataset.lvl;
    if (!v) return;
    if (v === 'yes') store.changeLevel(pendingLevel.mov, pendingLevel.to);
    pendingLevel = null;
    renderRun();
  });
}

function renderDoneList(s) {
  const box = $('#run-done');
  // uniquement les séries du mouvement en cours
  /* Ordre chronologique : la série 1 en haut. L'ordre décroissant collait la
     plus récente à la carte en cours, mais surprenait à la lecture. */
  const here = [];
  for (let k = run.i - 1; k >= 0; k--) {
    const st = run.steps[k];
    if (st.block !== s.block) break;
    here.unshift({ n: st.setNo, v: run.logged[k] ? run.logged[k].value : '–' });
  }
  if (!here.length) { box.innerHTML = ''; return; }
  box.innerHTML =
    '<div class="done-head">Séries faites · ' + here.length + ' sur ' + s.setsTotal + '</div>' +
    here.map(d =>
      '<div class="done-row"><span class="tick">✓</span>' +
      '<span class="done-name">Série ' + d.n + '</span>' +
      '<span class="done-val">' + d.v + '</span></div>'
    ).join('');
}

/* ------------------------------------------------------------------ accueil */

function renderHome() {
  const st = store.get();
  const session = SEANCE;
  const saved = store.loadRun();

  $('#home-date').textContent = new Date().toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long' });
  $('#home-session').textContent = 'La séance';

  const withCroise = store.croiseDue();
  // durée honnête : travail + repos, moins le dernier repos de chaque bloc
  const mins = session.blocks.reduce(
    (a, b) => a + (b.sets * (b.rest + 30) - b.rest) / 60, 0) + 5;
  $('#home-sub').textContent = session.blocks.length + ' mouvements · ' +
    Math.round(mins + (withCroise ? 12 : 0)) + ' min';

  const list = $('#home-list');
  list.innerHTML = '';
  session.blocks.forEach((b, i) => {
    const mv = movement(b.mov, st.variant);
    const lvl = store.levelOf(b.mov);
    const li = levelInfo(b.mov, st.variant, lvl);
    const target = store.prefill(b.mov, li.unit);
    const sous = (mv.short || mv.name) + ' · niveau ' + lvl;
    const el = row(String(i + 1), li.name, sous,
                   b.sets + ' × ' + target + (li.unit === 'sec' ? ' s' : ''));
    el.insertBefore(boutonInfo(b.mov, lvl, li.name, sous), el.querySelector('.plan-v'));
    list.appendChild(el);
  });
  if (withCroise) {
    const n = store.croiseSets();
    const lvlC = store.levelOf('push_h');
    const liC = levelInfo('push_h', st.variant, lvlC);
    const el = row('+', 'Le Croisé, sur les pompes',
      n + ' séries · une fois par semaine', CROISE.total(n) + ' reps');
    el.classList.add('extra');
    // Le Croisé se fait sur les pompes : sa fiche est celle du niveau en cours.
    el.insertBefore(boutonInfo('push_h', lvlC, liC.name, 'Le Croisé · niveau ' + lvlC),
                    el.querySelector('.plan-v'));
    list.appendChild(el);
  }

  const streak = $('#home-streak');
  streak.innerHTML = '';
  const done = store.recentDone(12).length;
  for (let i = 0; i < 12; i++) {
    const j = document.createElement('i');
    if (i < done) j.className = 'f';
    streak.appendChild(j);
  }
  $('#home-streak-label').textContent = done
    ? done + ' séance' + (done > 1 ? 's' : '') + ' enregistrée' + (done > 1 ? 's' : '')
    : 'Aucune séance enregistrée pour l’instant';

  const resume = $('#home-resume');
  resume.hidden = !saved;
  if (saved) {
    resume.textContent = 'Reprendre · série ' + (saved.i + 1) +
      ' sur ' + saved.steps.length;
  }
  $('#home-start').textContent = saved ? 'Recommencer à zéro' : 'Commencer';
}

function row(index, name, sub, value) {
  const el = document.createElement('div');
  el.className = 'plan-row';
  el.innerHTML =
    '<span class="plan-i">' + index + '</span>' +
    '<span class="plan-n">' + name + '<s>' + sub + '</s></span>' +
    '<span class="plan-v">' + value + '</span>';
  return el;
}

function renderDone(sum) {
  const box = $('#home-flash');
  box.hidden = false;
  box.innerHTML =
    '<strong>Séance terminée</strong>' +
    '<span>' + sum.sets + ' séries en ' +
    (sum.minutes < 1 ? 'moins d’une minute' : sum.minutes + ' minutes') +
    (sum.croise === true ? ' · Croisé bouclé, plus 2 séries la prochaine fois'
      : sum.croise === false ? ' · Croisé interrompu, même taille la prochaine fois' : '') +
    '</span>';

  /* Le dernier mouvement d'une séance n'a pas de repos derrière lui :
     sa proposition de niveau n'a nulle part où s'afficher pendant la
     séance. Elle atterrit donc ici. */
  if (sum.level) {
    const p = sum.level;
    const mv = movement(p.mov, store.get().variant);
    const unit = p.unit === 'sec' ? 'secondes' : 'répétitions';
    void mv;
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.innerHTML =
      '<p>' + (mv.short || mv.name) + ' : ' +
      (p.kind === 'up'
        ? RULES.levelUpSets + ' séries à ' + p.target + ' ' + unit +
          '. Passer au niveau ' + p.to + ' ?'
        : 'deux séries sous ' + p.target + ' ' + unit +
          '. Redescendre au niveau ' + p.to + ' ?') + '</p>' +
      '<div class="banner-actions">' +
        '<button type="button" class="btn-small" data-lvl="yes">' +
          (p.kind === 'up' ? 'Monter' : 'Redescendre') + '</button>' +
        '<button type="button" class="btn-small ghost" data-lvl="no">Rester</button>' +
      '</div>';
    banner.addEventListener('click', e => {
      const v = e.target.dataset.lvl;
      if (!v) return;
      if (v === 'yes') store.changeLevel(p.mov, p.to);
      banner.remove();
      renderHome();
    });
    box.appendChild(banner);
  }
}

/* -------------------------------------------------------------- progression */

function renderProgress() {
  const st = store.get();
  const box = $('#progress-list');
  box.innerHTML = '';

  MOVEMENT_ORDER.forEach(key => {
    const mv = movement(key, st.variant);
    const ms = store.movementState(key);
    const lvl = store.levelOf(key);
    const li = levelInfo(key, st.variant, lvl);
    const up = store.thresholds(li.unit).up;
    const tail = ms.recent.slice(-RULES.levelUpSets);
    const near = tail.length === RULES.levelUpSets && tail.every(v => v >= up);
    const prog = store.progresNiveau(key, li.unit);
    const best = store.bestAt(key, lvl);
    const suffix = li.unit === 'sec' ? ' s' : '';

    const el = document.createElement('div');
    el.className = 'prog-item';
    el.innerHTML =
      '<div class="prog-top">' +
        '<span class="prog-name">' + (mv.short || mv.name) + '</span>' +
        '<span class="lvl-edit">' +
          '<button type="button" data-d="-1" aria-label="Niveau précédent"' +
            (lvl <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span class="prog-lvl">Niveau ' + lvl + '</span>' +
          '<button type="button" data-d="1" aria-label="Niveau suivant"' +
            (lvl >= 6 ? ' disabled' : '') + '>+</button>' +
        '</span>' +
      '</div>' +
      '<div class="pips">' + Array.from({ length: 6 }, (_, i) =>
        '<i class="' + (i < lvl ? 'f' : '') + '"></i>').join('') + '</div>' +
      '<p class="prog-goal">' + li.name +
        (best ? ' · meilleure série : ' + best + suffix : '') +
        (lvl < 6
          ? (near
              ? ' · <b>prêt pour le niveau ' + (lvl + 1) + '</b>'
              : ' · ' + prog.faites + '/' + prog.requis + ' séries à ' +
                prog.seuil + suffix + ' pour monter')
          : ' · niveau maximum') +
      '</p>';

    el.querySelector('.lvl-edit').addEventListener('click', e => {
      const d = e.target.dataset.d;
      if (!d) return;
      const to = lvl + parseInt(d, 10);
      store.changeLevel(key, to);
      announce((mv.short || mv.name) + ' passé au niveau ' + to + ', ' +
               levelInfo(key, st.variant, to).name);
      renderProgress();
    });
    box.appendChild(el);
  });

  const n = store.croiseSets();
  const el = document.createElement('div');
  el.className = 'prog-item';
  el.innerHTML =
    '<div class="prog-top"><span class="prog-name">Le Croisé</span>' +
    '<span class="prog-lvl">' + n + ' séries sur ' + CROISE.maxSets + '</span></div>' +
    '<div class="pips">' + Array.from({ length: 7 }, (_, i) =>
      '<i class="' + (CROISE.minSets + i * CROISE.step <= n ? 'f' : '') + '"></i>').join('') + '</div>' +
    '<p class="prog-goal">' + CROISE.total(n) + ' répétitions · destination ' +
    CROISE.maxSets + ' séries, ' + CROISE.total(CROISE.maxSets) + ' répétitions</p>';
  box.appendChild(el);

  const hist = $('#progress-history');
  const h = store.get().history;
  // "2026-08-25" passé à new Date() est interprété en UTC, ce qui décale
  // l'affichage d'un jour selon le fuseau. On construit la date en local.
  const localDate = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  hist.innerHTML = h.length
    ? h.slice(0, 10).map(x =>
        '<div class="hist-row"><span>' +
        localDate(x.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
        '</span><span>' + (x.croise ? 'Séance + Croisé' : 'Séance') + '</span><span>' +
        x.logged.length + ' séries</span></div>').join('')
    : '<p class="muted">Rien encore. La première séance apparaîtra ici.</p>';
}

/* ----------------------------------------------------------------- réglages */

function renderSettings() {
  const st = store.get();
  $$('#settings-variant .opt').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.variant === st.variant));
  });
  $('#settings-version').textContent = window.LACOUR_VERSION || '1.0.0';
  // l'attribution suit le témoin détecté au démarrage
  $('#set-credits').hidden = !photosPresentes;
  document.dispatchEvent(new CustomEvent('lacour:reglages'));
}

/* ------------------------------------------------------------------ système */

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* refusé ou non supporté, sans conséquence */ }
}
function releaseWake() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (run) { keepAwake(); renderRun(); }   // renderRun repose aussi la barre
  }
});

/* --------------------------------------------------------------- démarrage */

function wire() {
  $('#home-start').addEventListener('click', () => {
    store.clearRun();
    $('#home-flash').hidden = true;
    startSession();
  });

  $('#home-resume').addEventListener('click', () => {
    const saved = store.loadRun();
    if (saved) startSession(saved);
  });

  $('#run-action').addEventListener('click', () => {
    if (!run) return;
    if (run.phase === 'ready') validate(); else unlock(false);
  });

  $('#run-alt').addEventListener('click', () => { if (run) abortCroise(); });
  $('#run-quit').addEventListener('click', quitSession);

  $$('[data-goto]').forEach(b => {
    b.addEventListener('click', () => goto(b.dataset.goto));
  });

  $$('[data-back]').forEach(b => {
    b.addEventListener('click', goBack);
  });

  $$('#settings-variant .opt').forEach(b => {
    b.addEventListener('click', () => {
      store.setVariant(b.dataset.variant);
      announce(b.dataset.variant === 'strict'
        ? 'Variante sans matériel activée. Le tirage devient de la chaîne postérieure haute.'
        : 'Variante avec une table activée. Le tirage est complet.');
      renderSettings();
    });
  });

  const majNotifs = () => {
    const b = $('#settings-notifs');
    if (!('Notification' in window)) {
      b.textContent = 'Non disponible sur cet appareil';
      b.disabled = true;
    } else if (Notification.permission === 'granted') {
      b.textContent = 'Alerte activée';
      b.disabled = true;
    } else if (Notification.permission === 'denied') {
      b.textContent = 'Refusée : à réactiver dans les réglages du navigateur';
      b.disabled = true;
    } else {
      b.textContent = 'Activer l’alerte de fin de repos';
      b.disabled = false;
    }
  };
  $('#settings-notifs').addEventListener('click', async () => {
    const r = await media.demanderNotifications();
    announce(r === 'accordee' ? 'Alerte de fin de repos activée.'
                              : 'Alerte non activée.');
    majNotifs();
  });
  document.addEventListener('lacour:reglages', majNotifs);

  $('#settings-wipe').addEventListener('click', () => {
    if (confirm('Effacer toute la progression et l’historique ? C’est définitif.')) {
      store.wipe();
      announce('Progression effacée. Tous les mouvements sont revenus au niveau 1.');
      goto('home');
      const box = $('#home-flash');
      box.hidden = false;
      box.innerHTML = '<strong>Progression effacée</strong>' +
        '<span>Tous les mouvements sont revenus au niveau 1.</span>';
    }
  });
}

wire();
goto('home');

/* Service worker : le seul endroit où vit le numéro de version. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            const bar = $('#update-bar');
            bar.hidden = false;
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

/* Proposition d'installation, seulement si le navigateur l'offre. */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  const b = $('#install-btn');
  b.hidden = false;
  b.addEventListener('click', async () => {
    b.hidden = true;
    installEvent.prompt();
    installEvent = null;
  });
});
