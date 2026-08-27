/* =========================================================================
   La Cour · état persistant
   Tout tient dans localStorage. Aucun réseau, jamais.
   ========================================================================= */

import { MOVEMENT_ORDER, CROISE, RULES } from './data.js';

const KEY = 'lacour.state.v1';
const RUN = 'lacour.run.v1';     // séance en cours, pour survivre à une fermeture

function blankMovements() {
  const m = {};
  MOVEMENT_ORDER.forEach(k => { m[k] = { level: 1, best: {}, recent: [] }; });
  return m;
}

function blank() {
  return {
    variant: 'table',                 // 'table' | 'strict'
    verrou: 'heure',                  // 'heure' | 'rebours' : ce qu'affiche l'écran verrouillé
    movements: blankMovements(),
    croise: { sets: CROISE.minSets, lastDate: null },
    history: []                       // { date, logged[], croise? }
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const base = blank();
    const movements = { ...base.movements, ...(parsed.movements || {}) };
    // v1.0 stockait un meilleur score unique par mouvement. Depuis que
    // l'unité dépend du niveau, un record se garde PAR niveau : 45 secondes
    // de planche et 12 hollow rocks ne se comparent pas.
    Object.keys(movements).forEach(k => {
      const ms = movements[k];
      if (typeof ms.best === 'number') ms.best = ms.best ? { [ms.level || 1]: ms.best } : {};
      if (!ms.best || typeof ms.best !== 'object') ms.best = {};
      if (!Array.isArray(ms.recent)) ms.recent = [];
    });
    // fusion défensive : une clé absente ne doit jamais casser l'app
    return {
      ...base,
      ...parsed,
      movements,
      croise: { ...base.croise, ...(parsed.croise || {}) }
    };
  } catch (e) {
    return blank();
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

export function get() { return state; }

/* Date locale au format AAAA-MM-JJ. toISOString() renverrait la date UTC,
   ce qui change de jour le soir ou le matin selon le fuseau. */
function today() {
  const d = new Date();
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - then) / 86400000);
}

/* Ce que montre l'écran verrouillé pendant le repos. 'heure' n'est écrit
   qu'une fois par repos, donc ne clignote jamais ; 'rebours' défile à la
   seconde mais fait redessiner le bloc par le système à chaque fois. */
export function setVerrou(v) {
  state.verrou = v === 'rebours' ? 'rebours' : 'heure';
  persist();
}

export function setVariant(v) {
  state.variant = v === 'strict' ? 'strict' : 'table';
  persist();
}

export function movementState(key) {
  return state.movements[key] || { level: 1, best: {}, recent: [] };
}

export function levelOf(key) {
  return Math.min(6, Math.max(1, movementState(key).level));
}

/* Valeur pré-remplie pour la prochaine série : ce que tu as fait la
   dernière fois à ce niveau, sinon une valeur de départ raisonnable. */
export function prefill(key, unit) {
  const ms = movementState(key);
  const last = ms.recent.length ? ms.recent[ms.recent.length - 1] : null;
  if (last) return last;
  return unit === 'sec' ? RULES.defaultSec : RULES.defaultReps;
}

export function bounds(value, unit) {
  const step = unit === 'sec' ? RULES.secStep : 1;
  const span = RULES.adjustRange * step;
  return { min: Math.max(step, value - span), max: value + span, step };
}

/* Meilleure série à un niveau donné. Un record ne vaut que dans son unité :
   45 secondes de planche et 12 hollow rocks ne se comparent pas. */
export function bestAt(key, level) {
  return movementState(key).best[level] || 0;
}

/* Seuils de montée et de descente, selon l'unité du NIVEAU en cours.
   Une tenue se juge en secondes : 30 secondes de planche ne valent pas
   30 répétitions et ne doivent surtout pas franchir le seuil des 12. */
export function thresholds(unit) {
  return unit === 'sec'
    ? { up: RULES.levelUpSec, down: RULES.levelDownSec }
    : { up: RULES.levelUpReps, down: RULES.levelDownReps };
}

/* Combien de séries consécutives atteignent déjà le seuil, sur les trois
   demandées. Sans ce compteur affiché, la règle est invisible et la montée
   de niveau paraît arbitraire. */
export function progresNiveau(key, unit) {
  const ms = movementState(key);
  const seuil = thresholds(unit).up;
  let n = 0;
  for (let i = ms.recent.length - 1; i >= 0 && n < RULES.levelUpSets; i--) {
    if (ms.recent[i] >= seuil) n++; else break;
  }
  return { faites: n, requis: RULES.levelUpSets, seuil };
}

/* Enregistre une série. Renvoie une proposition éventuelle de changement
   de niveau, que l'appelant est libre d'afficher ou non. */
export function logSet(key, value, unit) {
  const ms = state.movements[key];
  if (!ms) return null;
  ms.recent.push(value);
  if (ms.recent.length > 6) ms.recent = ms.recent.slice(-6);
  const lv = ms.level || 1;
  if (!ms.best[lv] || value > ms.best[lv]) ms.best[lv] = value;
  persist();

  const t = thresholds(unit);
  const need = RULES.levelUpSets;
  const tail = ms.recent.slice(-need);
  if (tail.length === need && tail.every(v => v >= t.up) && ms.level < 6) {
    return { kind: 'up', from: ms.level, to: ms.level + 1, target: t.up, unit };
  }
  if (tail.length >= 2 && tail.slice(-2).every(v => v < t.down) && ms.level > 1) {
    return { kind: 'down', from: ms.level, to: ms.level - 1, target: t.down, unit };
  }
  return null;
}

export function changeLevel(key, level) {
  const ms = state.movements[key];
  if (!ms) return;
  ms.level = Math.min(6, Math.max(1, level));
  ms.recent = [];          // on repart de zéro au nouveau niveau
  persist();
}

/* ---------- Le Croisé ---------- */

export function croiseDue() {
  return daysSince(state.croise.lastDate) >= RULES.croiseGapDays;
}

export function croiseSets() {
  return Math.min(CROISE.maxSets, Math.max(CROISE.minSets, state.croise.sets));
}

export function finishCroise(clean) {
  state.croise.lastDate = today();
  if (clean) {
    state.croise.sets = Math.min(CROISE.maxSets, croiseSets() + CROISE.step);
  }
  persist();
}

/* ---------- Séances ---------- */

export function finishSession(logged, croise) {
  state.history.unshift({
    date: today(),
    logged,
    croise: croise || null
  });
  if (state.history.length > 60) state.history = state.history.slice(0, 60);
  persist();
}

/* Douze dernières séances prévues, pour la barre de régularité.
   On compte les jours d'entraînement réels, pas une série imaginaire. */
export function recentDone(n = 12) {
  return state.history.slice(0, n);
}

/* ---------- séance en cours ---------- */

export function saveRun(run) {
  try { localStorage.setItem(RUN, JSON.stringify(run)); } catch (e) {}
}
export function loadRun() {
  try {
    const raw = localStorage.getItem(RUN);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearRun() {
  try { localStorage.removeItem(RUN); } catch (e) {}
}

/* ---------- effacement ---------- */

export function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(RUN);
  } catch (e) {}
  state = blank();
}
