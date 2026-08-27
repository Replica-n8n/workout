/* =========================================================================
   La Cour · écran de verrouillage et sons

   Pourquoi ce module existe
   -------------------------
   Deux problèmes distincts, une seule solution.

   1. On veut voir le temps de repos restant sans déverrouiller le téléphone.
   2. Le bip de fin de repos était à peine audible : une page en arrière-plan
      voit son contexte audio suspendu.

   Faire jouer un son en boucle règle les deux. Le système affiche alors
   l'app dans le lecteur de l'écran de verrouillage, où l'on peut réécrire le
   titre à chaque seconde, et le contexte audio reste vivant.

   Le prix, assumé et dit dans les réglages : ça consomme de la batterie, et
   ça prend la place du lecteur média, donc ça coupe la musique.

   Deux contraintes de plateforme dictent tout ce fichier :

   - Chrome sur Android n'affiche la notification média que si la durée du
     son atteint CINQ SECONDES. Un porteur d'une seconde ne déclenche rien,
     et l'écran de verrouillage reste vide. D'où les douze secondes.
   - `navigator.vibrate()` est ignoré quand la page est cachée, donc
     précisément quand l'écran est verrouillé. La vibration de fin de repos
     passe par une notification du service worker, qui elle en a le droit.
     Sur iOS l'API n'existe pas du tout : rien n'est promis.
   ========================================================================= */

let audio = null;         // le porteur silencieux
let ctx = null;           // contexte pour le bip
let actif = false;
let urlBlob = null;
let dernierAffichage = '';   // évite de repousser un affichage identique

/* Douze secondes, pas une : sous cinq, Chrome Android refuse d'ouvrir une
   session média et l'écran de verrouillage reste vide. Amplitude 1 sur
   32767, donc inaudible, mais pas un silence absolu : certains systèmes
   libèrent la session quand le flux est parfaitement vide. */
function wavPresqueSilencieux(secondes = 12, taux = 8000) {
  const n = secondes * taux;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const txt = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };
  txt(0, 'RIFF');  v.setUint32(4, 36 + n * 2, true);
  txt(8, 'WAVE');  txt(12, 'fmt ');
  v.setUint32(16, 16, true);      // taille du bloc fmt
  v.setUint16(20, 1, true);       // PCM
  v.setUint16(22, 1, true);       // mono
  v.setUint32(24, taux, true);
  v.setUint32(28, taux * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/* Doit être appelé depuis un geste de l'utilisateur, sinon la lecture est
   refusée. Le bouton « Commencer » fait office de geste. */
export async function demarrer(handlers = {}) {
  if (actif) return true;
  try {
    if (!urlBlob) urlBlob = URL.createObjectURL(wavPresqueSilencieux());
    audio = new Audio(urlBlob);
    audio.loop = true;
    audio.preload = 'auto';
    await audio.play();

    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
      const pose = (nom, fn) => {
        try { navigator.mediaSession.setActionHandler(nom, fn || null); } catch (e) {}
      };
      /* Les commandes du verrouillage servent la séance, pas la lecture :
         « suivant » ouvre la série sans attendre la fin du repos. */
      pose('nexttrack', handlers.suivant);
      pose('play', handlers.suivant);
      pose('pause', handlers.pause);
      pose('stop', handlers.pause);
      pose('previoustrack', null);
      pose('seekbackward', null);
      pose('seekforward', null);
    }
    actif = true;
    return true;
  } catch (e) {
    actif = false;                 // refusé : l'app marche quand même
    return false;
  }
}

export function arreter() {
  fermerChrono();
  effacerPosition();
  actif = false;
  dernierAffichage = '';
  try { if (audio) { audio.pause(); audio.src = ''; audio = null; } } catch (e) {}
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch (e) {}
  }
}

export function disponible() { return actif; }

/* Le compte à rebours passe par setPositionState, PAS par le titre.

   Réécrire le titre chaque seconde remplace tout l'objet MediaMetadata, et le
   système redessine alors le bloc entier : titre, sous-titre et vignette
   clignotent une fois par seconde. setPositionState alimente la barre de
   progression native, que le système anime tout seul à partir d'une seule
   pose. Le texte, lui, ne bouge plus qu'aux changements de série. */
export function position(duree, ecoule) {
  if (!actif || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(1, duree),
      position: Math.min(Math.max(0, ecoule), Math.max(1, duree)),
      playbackRate: 1
    });
  } catch (e) { /* API absente : on perd la barre, pas le reste */ }
}

export function effacerPosition() {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.setPositionState(); } catch (e) {}
}

/* Ce qui s'affiche sur l'écran de verrouillage. Le titre porte l'information
   qui change, parce que c'est la ligne la plus lisible du lecteur. */
export function afficher({ titre, sousTitre, detail, vignette = true }) {
  if (!actif || !('mediaSession' in navigator)) return;
  /* Le chrono bat quatre fois par seconde mais n'affiche qu'une valeur par
     seconde. Sans ce filtre on reconstruirait 600 MediaMetadata par repos,
     et on pousserait autant de mises à jour au système pour rien. */
  const cle = titre + '|' + (sousTitre || '') + '|' + (detail || '');
  if (cle === dernierAffichage) return;
  dernierAffichage = cle;
  try {
    /* Pendant le repos on n'envoie QUE le temps, sans vignette : le titre
       change chaque seconde, et tout ce qui est présent dans le bloc est
       redessiné à chaque fois. Moins il y a d'éléments, moins ça saute. */
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titre,
      artist: sousTitre || '',
      album: detail || '',
      artwork: vignette ? [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ] : []
    });
  } catch (e) {}
}

/* Autorisation de notifier, demandée seulement si l'utilisateur la réclame
   depuis les réglages. Une demande à froid au premier lancement se fait
   refuser, et le refus est définitif. */
export async function demanderNotifications() {
  if (!('Notification' in window)) return 'indisponible';
  if (Notification.permission === 'granted') return 'accordee';
  if (Notification.permission === 'denied') return 'refusee';
  try { return (await Notification.requestPermission()) === 'granted' ? 'accordee' : 'refusee'; }
  catch (e) { return 'indisponible'; }
}

export function notificationsPretes() {
  return 'Notification' in window && Notification.permission === 'granted';
}

/* Le compte à rebours en notification.

   L'appli Horloge d'Android est fluide parce qu'elle utilise
   setUsesChronometer : le système anime le champ lui-même, sans que l'app
   pousse quoi que ce soit. Cette API n'existe pas côté web.

   Le plus proche possible : réécrire une notification portant le MÊME tag.
   Elle se met alors à jour en place, sans bannière ni son, sur un chemin de
   rendu différent de celui du bloc média — lequel redessine tout à chaque
   changement de titre.

   `enCours` évite d'empiler les appels : showNotification est asynchrone et
   on l'appelle chaque seconde. */
let enCours = false;

export async function chrono(texte, sousTexte) {
  if (!notificationsPretes() || !('serviceWorker' in navigator)) return false;
  if (enCours) return false;
  enCours = true;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.showNotification(texte, {
      body: sousTexte || '',
      tag: 'lacour-chrono',
      renotify: false,        // pas de re-alerte : mise à jour silencieuse
      silent: true,
      requireInteraction: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png'
    });
    return true;
  } catch (e) { return false; }
  finally { enCours = false; }
}

export async function fermerChrono() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    (await reg.getNotifications({ tag: 'lacour-chrono' })).forEach(n => n.close());
  } catch (e) {}
}

/* L'alerte qui marche écran éteint sur Android. `tag` fait remplacer la
   précédente au lieu d'en empiler une par série. */
export async function alerteFinRepos(titre, corps) {
  if (!notificationsPretes() || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.showNotification(titre, {
      body: corps,
      tag: 'lacour-repos',
      renotify: true,
      vibrate: [180, 90, 180],
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png'
    });
    setTimeout(async () => {
      const n = await reg.getNotifications({ tag: 'lacour-repos' });
      n.forEach(x => x.close());
    }, 12000);
    return true;
  } catch (e) { return false; }
}

/* Bip court. Passe par le même contexte que le porteur silencieux, donc
   reste audible quand l'écran est éteint. */
export function bip() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    [0, 0.18].forEach(decalage => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + decalage);
      g.gain.exponentialRampToValueAtTime(0.25, t + decalage + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decalage + 0.14);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + decalage);
      o.stop(t + decalage + 0.16);
    });
  } catch (e) {}
  /* Ne marche que si la page est visible : écran verrouillé, l'appel est
     ignoré en silence. C'est la notification qui prend le relais. */
  try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
}
