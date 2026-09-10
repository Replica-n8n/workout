/* =========================================================================
   Runa · ce que l'app écrit à l'écran

   Tout ce qui transforme une boucle, une durée ou une erreur en phrase.
   Ces règles vivaient dans `js/app.js`, qu'on ne peut pas tester sans
   navigateur, et c'est là que sont nés « aucun feu » annoncé sur un
   parcours reçu par lien, ou la même phrase écrite deux fois qui finit par
   dire deux choses différentes.

   ⚠️ Deux sorties, jamais l'une tirée de l'autre. Le HTML des cartes échappe
   ce qui vient d'OpenStreetMap ; le texte pur (aria-label, partage, canvas)
   ne l'échappe PAS, puisqu'il n'est jamais interprété comme du HTML. Retirer
   les balises d'une phrase HTML donnait « Prince &amp; Duc ».
   ========================================================================= */

import { echapper } from './texte.js';
import { abreger, nombre } from './carrefour.js';

/* ------------------------------------------------------- noms de rues */

/* OSM écrit « Avenue du Mont-Royal Est » ou « Rue Saint-Denis », avec le type
   de voie en tête. Écrire « par Avenue du Mont-Royal » sonne faux ; il faut
   l'article, donc le genre du type de voie, et l'élision devant une voyelle. */
const FEMININ = new Set(['rue', 'ruelle', 'avenue', 'allée', 'allee', 'impasse', 'place',
  'route', 'voie', 'promenade', 'esplanade', 'traverse', 'côte', 'cote', 'montée', 'montee']);
const MASCULIN = new Set(['boulevard', 'chemin', 'passage', 'quai', 'cours', 'square',
  'sentier', 'parc', 'pont', 'rond-point', 'mail']);

/* Le nom découpé en article, type de voie et reste. Les deux `nommer` en
   dépendent, et c'est la seule chose qui garantit qu'ils disent la même. */
export function decouper(nom) {
  const mots = String(nom || '').split(' ');
  const type = mots[0].toLowerCase();
  if (!FEMININ.has(type) && !MASCULIN.has(type)) return { article: '', type: '', reste: nom };
  const article = /^[aeiouyéèêà]/i.test(type) ? 'l’' : (FEMININ.has(type) ? 'la ' : 'le ');
  return { article, type, reste: mots.slice(1).join(' ') };
}

/**
 * Le nom d'une rue, prêt à poser dans du HTML.
 *
 * ⚠️ `reste` vient d'OpenStreetMap, que n'importe qui peut modifier : il
 * passe par `echapper`. Le `type`, lui, sort d'une liste fermée écrite ici,
 * et l'article aussi.
 */
export function nommer(nom) {
  const { article, type, reste } = decouper(nom);
  if (!type) return `<b>${echapper(reste)}</b>`;
  return `${article}${type} <b>${echapper(reste)}</b>`;
}

/**
 * Le même nom, en texte pur.
 *
 * ⚠️ Pour un aria-label, un texte de partage ou un canvas : ces trois-là ne
 * rendent PAS le HTML. On reconstruit donc la phrase au lieu de retirer les
 * balises après coup, ce que faisait l'ancien `texteBrut` : une fois le nom
 * échappé, une rue « Prince & Duc » y serait devenue « Prince &amp; Duc ».
 */
export function nommerBrut(nom) {
  const { article, type, reste } = decouper(nom);
  return type ? `${article}${type} ${reste}` : reste;
}

/**
 * Les rues d'un parcours à retenir, mises bout à bout.
 *
 * L'amorce porte une flèche : « rejoindre Gounod, PUIS la boucle » n'est pas
 * la même chose que la boucle elle-même, et le coureur doit voir où elle
 * commence. La dernière étape n'est écrite que si c'est une AUTRE rue que la
 * première : le plus souvent c'est celle du départ qui ramène, et la relire
 * ne dit rien de neuf.
 *
 * Abrégé, pas « nommé » : quatre noms complets avec leur article et leur
 * type de voie font quatre lignes en 360 px de large. Et c'est ainsi qu'on
 * se donne rendez-vous, « au coin de Rachel et Saint-Dominique ».
 */
export function rueParRue(etapes) {
  const suite = etapes.length > 1 && etapes[0].nom === etapes[etapes.length - 1].nom
    ? etapes.slice(0, -1) : etapes;
  return suite
    .map(e => (e.approche ? '<span class="vers" aria-hidden="true">→</span> ' : '') +
              `<b>${echapper(abreger(e.nom))}</b>`)
    .join(' <span class="fleche" aria-hidden="true">›</span> ');
}

/* ---------------------------------------------------------------- feux */

/**
 * Le compte de feux tel qu'il s'écrit sur une carte.
 *
 * ⚠️ `null` n'est PAS zéro : une boucle reçue par lien ne transporte aucun
 * compte, et annoncer « aucun feu » serait le mensonge exact corrigé en
 * 1.1.0. La phrase était écrite deux fois, pour les propositions et pour
 * les parcours gardés.
 */
export function phraseDesFeux(n) {
  if (n == null) return '';
  if (n === 0) return '<b>aucun feu</b>';
  if (n === 1) return '<b>1 feu</b>';
  return `<b>${n} feux</b>`;
}

/* -------------------------------------------------------------- le temps */

/**
 * Depuis combien de temps, pour un départ mémorisé ou une course à reprendre.
 *
 * Un point de départ qui ne se voit pas est un piège : l'app calculerait
 * sagement des boucles autour de chez soi alors qu'on est parti du bureau.
 * La ligne dit donc son âge dès qu'il commence à dater.
 *
 * @param {number} ms une DURÉE, pas un instant
 */
export function ageEnMots(ms) {
  const min = Math.round(ms / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'hier' : `il y a ${j} jours`;
}

/**
 * L'âge de la position d'un parcours reçu par lien.
 *
 * Plus vague que `ageEnMots` au-delà d'une journée, et c'est voulu : une
 * position d'hier ne dit plus où est la personne, « il y a 3 jours » ferait
 * croire qu'elle compte encore.
 *
 * @param {number} quand l'INSTANT de la position
 * @param {number} [maintenant]
 */
export function ageEnPhrase(quand, maintenant = Date.now()) {
  const min = Math.round((maintenant - quand) / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : 'hier ou avant';
}

/* ------------------------------------------------------------ les erreurs */

/**
 * Ce qu'on dit quand ça rate.
 *
 * ⚠️ Sans position, l'app est un cul-de-sac : pas de position, donc pas de
 * quartier chargé, donc pas de carte, donc rien à toucher pour poser un
 * départ à la main. Le message doit donc dire quoi FAIRE, pas seulement ce
 * qui a raté. C'est le cas le plus courant sur ordinateur, où il n'y a pas
 * de GPS et où le navigateur refuse souvent tout net.
 */
export function message(e) {
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

/* ------------------------------------------------------------- partager */

/**
 * La phrase qui accompagne un partage.
 *
 * ⚠️ Un PWA n'émet plus rien dès que l'écran s'éteint. On partage donc une
 * position DATÉE, prise au moment où l'on touche le bouton, et le texte le
 * dit. Le carrefour y figure aussi : une messagerie qui n'affiche pas
 * l'image laisserait sinon la phrase sans le seul renseignement utile.
 *
 * Texte pur : il part dans une messagerie, qui ne rend pas le HTML.
 */
export function texteDuPartage(b, position, coin) {
  const km = (b.m / 1000).toFixed(2).replace('.', ',');
  const rue = (b.rues || [])[0];
  const par = rue ? `, par ${nommerBrut(rue.nom)}` : '';
  if (!position) return `Ma boucle du jour : ${km} km${par}.`;
  return coin
    ? `Je cours une boucle de ${km} km. Je suis au coin de ${coin.nom}.`
    : `Je cours une boucle de ${km} km${par}. Voici où j'en suis.`;
}

/* --------------------------------------------------- la carte d'une boucle */

/**
 * Ce qu'affiche une proposition, et ce qu'en lit un lecteur d'écran.
 *
 * Les deux sortent d'ici ensemble : ils décrivent la même boucle, et tant
 * qu'ils étaient écrits côte à côte dans `app.js`, rien ne vérifiait qu'ils
 * disaient la même chose.
 *
 * @param {object} b la boucle
 * @param {object} o
 * @param {{nom:string}|null} o.rue la rue qui la distingue des autres cartes
 * @param {number} o.minutes
 * @param {boolean} o.nuit
 * @returns {{html:string, aria:string}}
 */
export function decrireBoucle(b, { rue = null, minutes, nuit = false }) {
  // Une boucle reçue par lien n'a pas de compte de feux : on se tait
  // plutôt que d'inventer un chiffre.
  const sait = b.feux != null;
  const feux = phraseDesFeux(b.feux);
  // L'éclairage n'est affiché que quand il apprend quelque chose : en mode
  // nocturne, ou quand une part notable du parcours n'est pas éclairée.
  // « 100 % éclairé » sur les trois cartes n'aide personne à choisir et
  // faisait déborder la ligne sur trois lignes en 360 px de large.
  const parle = sait && (nuit || b.fractionEclairee === null || b.fractionEclairee < 0.9);
  const eclaire = !parle ? ''
    : b.fractionEclairee === null ? ' · éclairage inconnu'
    : ` · ${Math.round(b.fractionEclairee * 100)} % éclairé`;

  /* Le parcours à retenir ne se décrit pas par une rue principale mais par
     sa suite de rues : c'est tout ce qui le distingue, et c'est ce qu'on se
     récite avant de partir. */
  const etapes = b.etapes && b.etapes.length ? b.etapes : null;
  const chaine = etapes ? rueParRue(etapes) : null;
  /* Le parc se nomme en premier : c'est pour lui qu'on choisit cette
     sortie, et les rues ne disent que comment y aller. */
  const par = b.genre === 'parc'
    ? `<b>${echapper(b.parc)}</b>${chaine ? ', par ' + chaine : ''}`
    : chaine ? chaine : (rue ? `par ${nommer(rue.nom)}` : '');

  /* Le critère qui manquait pour trancher entre trois boucles de même
     longueur. Il n'apparaît que s'il a été calculé : une boucle restaurée
     au lancement ou reprise d'un favori n'a pas de score, et inventer un
     « 0 % » serait pire que se taire. */
  const score = b.score == null ? '' : `<span class="score">${b.score}</span>`;

  const marque = b.genre === 'parc' ? '<span class="marque">Au parc</span>'
               : b.genre === 'simple' ? '<span class="marque">À retenir</span>' : '';
  /* « 16 feux » sans plus se lit comme un parcours plein d'arrêts. Ils sont
     en fait tous sur le trajet pour rejoindre le parc, et aucun dans les
     tours : c'est précisément ce qui fait l'intérêt de cette sortie. */
  const ouSontLesFeux = b.genre === 'parc' && b.feux > 0 && b.feuxDansLeParc === 0
    ? ', tous sur l’accès' : '';
  /* ⚠️ Les tours doivent se lire AVANT de choisir. Quatre tours d'un
     kilomètre et une boucle unique de quatre kilomètres ne sont pas la même
     sortie, et l'un des deux se retient sans rien regarder. */
  const tours = b.tours > 1
    ? `<span class="tours">${b.tours} tours de ${nombre(b.tourM / 1000, 2)} km</span>` : '';

  const html =
    `<span class="km">${(b.m / 1000).toFixed(2)} km${marque}</span>` +
    `<span class="detail">${par}<br>${feux}${ouSontLesFeux}${feux ? ' · ' : ''}${minutes} min${eclaire}${tours}${score}</span>` +
    `<span class="puce" aria-hidden="true"></span>`;

  const aria =
    (b.genre === 'parc' ? `Au parc, ${b.parc}, ` : b.genre === 'simple' ? 'Parcours à retenir, ' : '') +
    `Boucle de ${(b.m / 1000).toFixed(2)} kilomètres` +
    (etapes ? `, par ${etapes.map(e => nommerBrut(e.nom)).join(', puis ')}`
            : rue ? `, ${nommerBrut(rue.nom)}` : '') +
    (b.tours > 1 ? `, ${b.tours} tours` : '') +
    /* La même phrase que la carte, sans ses balises : le lecteur d'écran
       disait « 0 feu » là où l'écran écrit « aucun feu ». */
    (sait ? ', ' + phraseDesFeux(b.feux).replace(/<\/?b>/g, '') : '') + ouSontLesFeux +
    `, environ ${minutes} minutes` +
    (b.score ? `, ${b.score}` : '');

  return { html, aria };
}
