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

   `navigator.vibrate` n'apparaît nulle part ici : l'API n'existe pas dans
   Safari iOS, ni dans une PWA installée. Promettre une vibration serait
   mentir sur la moitié du parc.
   ========================================================================= */

let audio = null;         // le porteur silencieux
let ctx = null;           // contexte pour le bip
let actif = false;
let urlBlob = null;
let dernierAffichage = '';   // évite de repousser un affichage identique

/* Un WAV d'une seconde, à amplitude 1 sur 32767. Ce n'est pas du silence
   absolu : certains systèmes libèrent la session média quand le flux est
   parfaitement vide. Inaudible, mais présent. */
function wavPresqueSilencieux(secondes = 1, taux = 8000) {
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

/* Ce qui s'affiche sur l'écran de verrouillage. Le titre porte l'information
   qui change, parce que c'est la ligne la plus lisible du lecteur. */
export function afficher({ titre, sousTitre, detail }) {
  if (!actif || !('mediaSession' in navigator)) return;
  /* Le chrono bat quatre fois par seconde mais n'affiche qu'une valeur par
     seconde. Sans ce filtre on reconstruirait 600 MediaMetadata par repos,
     et on pousserait autant de mises à jour au système pour rien. */
  const cle = titre + '|' + (sousTitre || '') + '|' + (detail || '');
  if (cle === dernierAffichage) return;
  dernierAffichage = cle;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titre,
      artist: sousTitre || '',
      album: detail || 'La Cour',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  } catch (e) {}
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
  /* Sur Android la vibration existe et complète utilement le bip.
     Sur iPhone l'appel n'existe pas : le `if` suffit, pas de promesse. */
  try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
}
