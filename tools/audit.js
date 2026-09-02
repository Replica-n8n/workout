/* =========================================================================
   Audit d'interface, écran par écran, sur le DOM RÉEL

   Pourquoi ce script existe
   -------------------------
   Les scanners d'accessibilité du marché lisent les fichiers source. Ici ça
   ne sert à rien : sur La Cour, 8 des 25 boutons sont fabriqués à
   l'exécution, et les 4 seuls aria-label de l'app sont dans le JavaScript,
   pas dans index.html. Un scanner statique verrait 17 boutons « sans
   libellé » qui ont tous un texte visible, et manquerait les 8 qui comptent.

   Celui-ci tourne DANS la page, parcourt les écrans en cliquant comme un
   utilisateur, et mesure des rectangles. Aucune dépendance, aucun build.

   Usage
   -----
   Depuis javascript_tool, ou depuis la console du navigateur, en étant sur
   la page d'une app. Le chemin est RELATIF, et ce n'est pas un détail : en
   production GitHub Pages sert le dépôt sous /workout/, donc un chemin
   absolu « /tools/audit.js » cherche à la racine du domaine et échoue.
   En local, où le serveur a le dépôt pour racine, les deux marchent : le
   bug ne se voit qu'une fois en ligne.

       const a = await import('../tools/audit.js?t=' + Date.now());
       await a.audit({ ecrans: a.PLAN_LA_COUR });            // rapport complet
       await a.audit({ ecrans: a.PLAN_LA_COUR, format: 'texte' });

   Les règles viennent de bugs réellement trouvés sur ce dépôt, pas d'une
   liste générique. Chaque constat porte la mesure qui l'a déclenché : c'est
   ce qui permet de trancher au lieu de discuter.
   ========================================================================= */

const INTERACTIF = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role=button]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/* Une app installée sur un téléphone suit la règle native (44 pt iOS,
   48 dp Android), pas le minimum web de 24 px. */
const CIBLE_MIN = 44;
const ECART_MIN = 8;

const attendre = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- couleurs */

function canal(v) {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function lire(couleur) {
  const n = (couleur || '').match(/[\d.]+/g);
  if (!n) return null;
  return {
    r: +n[0], g: +n[1], b: +n[2],
    a: n.length > 3 ? +n[3] : 1
  };
}

/* `opacity` sur un ancêtre fond le texte dans le fond SANS toucher à sa
   couleur calculée : `getComputedStyle(el).color` renvoie la même valeur que
   le bloc soit à 1 ou à 0,05. Sans ce produit, un exercice terminé rendu par
   `opacity:.5` passait pour parfaitement contrasté alors que deux de ses
   trois textes tombaient à 3,01:1. */
function opaciteHeritee(el) {
  let o = 1, n = el;
  while (n && n !== document.documentElement) {
    const v = parseFloat(getComputedStyle(n).opacity);
    o *= isNaN(v) ? 1 : v;
    n = n.parentElement;
  }
  return o;
}

function fondEffectif(el) {
  /* Remonte les ancêtres jusqu'à trouver un fond opaque. Un fond
     semi-transparent est composé sur celui du dessous, sinon les cartes
     à `background: rgba(...)` donnent des ratios faux. */
  const pile = [];
  let n = el;
  while (n && n !== document.documentElement) {
    const c = lire(getComputedStyle(n).backgroundColor);
    if (c && c.a > 0) {
      pile.push(c);
      if (c.a === 1) break;
    }
    n = n.parentElement;
  }
  const base = lire(getComputedStyle(document.body).backgroundColor) ||
               { r: 255, g: 255, b: 255, a: 1 };
  let out = pile.length && pile[pile.length - 1].a === 1
    ? pile.pop() : { ...base };
  while (pile.length) {
    const d = pile.pop();
    out = {
      r: d.r * d.a + out.r * (1 - d.a),
      g: d.g * d.a + out.g * (1 - d.a),
      b: d.b * d.a + out.b * (1 - d.a),
      a: 1
    };
  }
  return out;
}

function luminance(c) {
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

function contraste(av, ar) {
  const a = luminance(av), b = luminance(ar);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* Le seuil dépend de la taille : 3 suffit à partir de 24 px, ou 18,66 px en
   gras. C'est ce qui évite de signaler à tort un gros titre en accent. */
function seuil(style) {
  const px = parseFloat(style.fontSize);
  const gras = (parseInt(style.fontWeight, 10) || 400) >= 700;
  return (px >= 24 || (gras && px >= 18.66)) ? 3 : 4.5;
}

/* ---------------------------------------------------------------- éléments */

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
}

function nomAccessible(el) {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const par = el.getAttribute('aria-labelledby');
  if (par) {
    const cible = document.getElementById(par);
    if (cible && cible.textContent.trim()) return cible.textContent.trim();
  }
  /* `<label for>` et le label englobant nomment un champ aussi sûrement
     qu'un aria-label. Sans cette branche, tout champ correctement étiqueté
     était signalé « sans nom », et un vrai manque se serait perdu au milieu
     de ces fausses alertes. `el.labels` couvre les deux formes. */
  const etiquettes = el.labels ? Array.from(el.labels) : [];
  for (const lab of etiquettes) {
    const t = (lab.textContent || '').trim();
    if (t) return t;
  }

  const texte = (el.textContent || '').trim();
  if (texte) return texte;
  const titre = el.getAttribute('title');
  return titre && titre.trim() ? titre.trim() : '';
}

function reperer(el) {
  const parts = [el.tagName.toLowerCase()];
  if (el.id) parts.push('#' + el.id);
  else if (el.className && typeof el.className === 'string') {
    const c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
    if (c) parts.push('.' + c);
  }
  const nom = nomAccessible(el).slice(0, 28);
  return parts.join('') + (nom ? ` « ${nom} »` : '');
}

/* ------------------------------------------------------------- les règles */

function reglesEcran(nom, out, opts = {}) {
  const ajoute = (regle, gravite, cible, detail, mesure) =>
    out.push({ ecran: nom, regle, gravite, cible, detail, mesure });

  /* Un dialogue modal ouvert EST l'écran : il capte le focus et masque le
     reste. L'auditer via `.screen` renvoyait un zéro trompeur, puisque le
     <dialog> vit hors de ces sections. */
  const modal = document.querySelector('dialog[open]');
  const ecran = modal || document.querySelector('.screen:not([hidden])') || document.body;
  const cibles = Array.from(ecran.querySelectorAll(INTERACTIF)).filter(visible);

  /* 1. Taille des cibles tactiles */
  cibles.forEach(el => {
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < CIBLE_MIN || h < CIBLE_MIN) {
      ajoute('cible-tactile', h < 32 || w < 32 ? 'haute' : 'moyenne',
             reperer(el), `sous ${CIBLE_MIN} px`, `${w}×${h}`);
    }
  });

  /* 2. Écart entre deux cibles adjacentes */
  for (let i = 0; i < cibles.length; i++) {
    for (let j = i + 1; j < cibles.length; j++) {
      const a = cibles[i].getBoundingClientRect();
      const b = cibles[j].getBoundingClientRect();
      if (cibles[i].contains(cibles[j]) || cibles[j].contains(cibles[i])) continue;
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      if (dx === 0 && dy === 0) continue;               // superposées
      const d = Math.round(Math.max(dx, dy));
      if (d > 0 && d < ECART_MIN) {
        ajoute('ecart-cibles', 'moyenne',
               `${reperer(cibles[i])} / ${reperer(cibles[j])}`,
               `moins de ${ECART_MIN} px entre deux cibles`, `${d} px`);
      }
    }
  }

  /* 3. Nom accessible */
  cibles.forEach(el => {
    if (!nomAccessible(el)) {
      ajoute('nom-manquant', 'haute', reperer(el),
             'contrôle sans texte visible ni aria-label', '');
    }
  });

  /* 4. Contraste du texte */
  const vus = new Set();
  ecran.querySelectorAll('*').forEach(el => {
    if (!visible(el)) return;
    const propre = Array.from(el.childNodes)
      .some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!propre) return;
    const s = getComputedStyle(el);
    const av = lire(s.color);
    if (!av || av.a === 0) return;

    /* La couleur du texte est composée sur son fond avec son alpha TOTAL :
       celui de la couleur elle-même, multiplié par l'opacité héritée. Les
       deux étaient ignorés, et un texte à moitié transparent ressortait
       aussi contrasté qu'un texte plein. */
    const fond = fondEffectif(el);
    const alpha = av.a * opaciteHeritee(el);
    if (alpha <= 0) return;
    const compose = {
      r: av.r * alpha + fond.r * (1 - alpha),
      g: av.g * alpha + fond.g * (1 - alpha),
      b: av.b * alpha + fond.b * (1 - alpha),
      a: 1
    };
    const ratio = contraste(compose, fond);
    const min = seuil(s);
    const cle = reperer(el);
    if (ratio < min && !vus.has(cle)) {
      vus.add(cle);
      ajoute('contraste', ratio < min - 1 ? 'haute' : 'moyenne', cle,
             `sous ${min}:1`, ratio.toFixed(2) + ':1');
    }
  });

  /* 5. L'action principale doit rester sous le pouce et entière à l'écran.
        C'est le bug du min-height:100dvh qui poussait le bouton dehors. */
  const principal = ecran.querySelector('.foot .btn-primary, .foot button:last-child') ||
                    (modal ? modal.querySelector('button[type=submit], button:last-of-type') : null);
  if (principal) {
    const r = principal.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom > vh + 1 || r.top < 0) {
      ajoute('action-hors-ecran', 'haute', reperer(principal),
             'action principale non entièrement visible',
             `bas à ${Math.round(r.bottom)} px pour ${vh} px de haut`);
    } else if (r.top / vh < 0.55) {
      ajoute('action-haute', 'basse', reperer(principal),
             'action principale hors du tiers bas, gênant à une main',
             Math.round(100 * r.top / vh) + ' % de la hauteur');
    }
  }

  /* 6. La page elle-même ne doit jamais défiler : c'est la zone de contenu
        qui défile, sinon le pied de page part sous la ligne de flottaison.

        `pageDefile: true` lève la règle pour une app qui est une liste, et
        non une suite d'écrans tenant chacun dans la fenêtre. Sans cette
        sortie, l'audit de GVT signalait à chaque passage un défilement qui
        est le fonctionnement voulu : un filet qui crie toujours au même
        endroit finit par ne plus être lu. */
  if (!opts.pageDefile && document.documentElement.scrollHeight > window.innerHeight + 1) {
    ajoute('page-defile', 'haute', 'document',
           'la page défile au lieu de la zone de contenu',
           `${document.documentElement.scrollHeight} px pour ${window.innerHeight} px`);
  }

  /* 7. Débordement horizontal */
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    const coupables = Array.from(ecran.querySelectorAll('*'))
      .filter(el => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.right <= window.innerWidth + 1) return false;
        const p = el.parentElement;
        return !p || getComputedStyle(p).overflowX === 'visible';
      })
      .slice(0, 4).map(reperer);
    ajoute('debordement-horizontal', 'haute', coupables.join(', ') || 'document',
           'contenu plus large que la fenêtre',
           `${document.documentElement.scrollWidth} px pour ${window.innerWidth} px`);
  }

  /* 8. tabindex positif : casse l'ordre de tabulation */
  ecran.querySelectorAll('[tabindex]').forEach(el => {
    if (parseInt(el.getAttribute('tabindex'), 10) > 0) {
      ajoute('tabindex-positif', 'moyenne', reperer(el),
             'un tabindex positif désaligne l’ordre de tabulation',
             el.getAttribute('tabindex'));
    }
  });

  /* 9. Images sans alternative */
  ecran.querySelectorAll('img').forEach(el => {
    if (getComputedStyle(el).display === 'none') return;
    if (el.getAttribute('alt') === null) {
      ajoute('img-sans-alt', 'moyenne', reperer(el),
             'alt absent : mettre alt="" si l’image est décorative', '');
    }
  });
}

/* Contrôles qui ne dépendent pas de l'écran affiché. */
function reglesDocument(out) {
  const ajoute = (regle, gravite, cible, detail, mesure) =>
    out.push({ ecran: '(document)', regle, gravite, cible, detail, mesure });

  if (!document.documentElement.lang) {
    ajoute('lang-manquant', 'moyenne', 'html',
           'attribut lang absent, la synthèse vocale choisit mal la langue', '');
  }

  if (!document.querySelector('[role=status], [role=alert], [aria-live]')) {
    ajoute('sans-zone-annonce', 'moyenne', 'document',
           'aucune zone role="status" : les changements d’état sont muets', '');
  }

  /* Un outline supprimé sans remplacement rend le clavier inutilisable. */
  let focusVisible = 0, outlineCoupe = 0;
  for (const feuille of Array.from(document.styleSheets)) {
    let regles;
    try { regles = feuille.cssRules; } catch (e) { continue; }  // feuille externe
    for (const r of Array.from(regles || [])) {
      const sel = r.selectorText || '';
      if (sel.includes(':focus-visible') || sel.includes(':focus')) focusVisible++;
      const st = r.style;
      if (st && (st.outline === 'none' || st.outlineWidth === '0px') &&
          !sel.includes(':focus')) outlineCoupe++;
    }
  }
  if (focusVisible === 0) {
    ajoute('sans-focus-visible', 'haute', 'CSS',
           'aucune règle :focus-visible, la navigation clavier est invisible', '');
  }
  if (outlineCoupe > 0 && focusVisible === 0) {
    ajoute('outline-supprime', 'haute', 'CSS',
           'outline supprimé sans remplacement', outlineCoupe + ' règles');
  }
}

/* ------------------------------------------------------------- parcours */

/* Découvre les écrans et le moyen d'y aller. Par défaut on clique les
   contrôles [data-goto], comme un utilisateur, pour que le rendu de
   l'écran ait bien lieu ; manipuler `hidden` à la main sauterait les
   fonctions de rendu et mesurerait un écran vide. */
function parcoursParDefaut() {
  const plan = [];
  document.querySelectorAll('.screen').forEach(sec => {
    const nom = (sec.id || '').replace(/^screen-/, '') || sec.id || '?';
    const bouton = document.querySelector(`[data-goto="${nom}"]`);
    plan.push({ nom, aller: bouton ? () => bouton.click() : null });
  });
  return plan;
}

/* Un écran atteint autrement que par [data-goto] doit être décrit à la main,
   sinon il n'est jamais audité. C'est le cas de l'écran de séance de
   La Cour : on y entre par le bouton principal de l'accueil, et on en sort
   par la mise en pause. */
export const PLAN_LA_COUR = [
  { nom: 'accueil', attendu: 'screen-home', aller: async () => {
      /* Un audit précédent a pu laisser l'app ailleurs. On rentre. */
      const run = document.querySelector('#screen-run');
      if (run && !run.hidden) document.querySelector('#run-quit').click();
      const retour = document.querySelector('.screen:not([hidden]) [data-back]');
      if (retour) retour.click();
      await attendre(250);
    } },
  { nom: 'progression', attendu: 'screen-progress', aller: () => document.querySelector('[data-goto="progress"]').click() },
  { nom: 'réglages', attendu: 'screen-settings', aller: async () => {
      document.querySelector('#screen-progress [data-back]').click();
      await attendre(200);            // history.back() est asynchrone
      document.querySelector('[data-goto="settings"]').click();
    } },
  { nom: 'séance', attendu: 'screen-run', aller: async () => {
      document.querySelector('#screen-settings [data-back]').click();
      await attendre(200);
      document.querySelector('#home-start').click();
    } },
  { nom: 'séance, repos', attendu: 'screen-run', aller: () => document.querySelector('#run-action').click() }
];

/* GVT n'a pas de sections `.screen` : c'est une page unique, et le fond de
   mesure est donc `document.body`. Les trois étapes ne changent pas d'écran,
   elles changent d'ÉTAT : repos au repos, repos en cours, en-tête replié par
   le défilement. Aucune n'a d'`attendu`, faute d'écran à nommer.

   À lancer avec `pageDefile: true`, voir la règle 6 :
       await a.audit({ ecrans: a.PLAN_GVT, pageDefile: true, format: 'texte' });  */
export const PLAN_GVT = [
  { nom: 'séance', aller: async () => {
      document.querySelectorAll('#seance input:checked').forEach(b => b.click());
      document.querySelector('#chrono-reset').click();
      scrollTo(0, 0);
      await attendre(250);
    } },
  { nom: 'séance, repos en cours', aller: async () => {
      document.querySelector('#seance input[type=checkbox]').click();
      await attendre(150);
    } },
  { nom: 'séance, en-tête replié', aller: async () => {
      scrollTo(0, 400);
      await attendre(250);
    } }
];

export async function audit(options = {}) {
  const auto = !options.ecrans;
  const plan = options.ecrans || parcoursParDefaut();
  const out = [];
  const visites = [];
  const idsVus = [];

  reglesDocument(out);

  for (const etape of plan) {
    if (etape.aller) {
      try { await etape.aller(); } catch (e) { /* écran inatteignable */ }
      await attendre(options.delai || 120);
    }
    const affiche = document.querySelector('.screen:not([hidden])');
    const id = affiche ? affiche.id : '(aucun)';

    /* En découverte automatique, deux étapes qui aboutissent au même écran
       signifient qu'un bouton n'a pas navigué : inutile de mesurer deux fois.
       Avec un plan explicite, au contraire, revenir sur le même écran dans un
       autre état est exactement le but (une série active puis en repos). */
    if (auto && idsVus.includes(id)) continue;
    idsVus.push(id);

    const nom = etape.nom === id ? id : `${etape.nom} (${id})`;
    if (!auto && etape.attendu && id !== etape.attendu) {
      out.push({ ecran: nom, regle: 'plan-devie', gravite: 'basse',
                 cible: etape.nom, detail: 'étape arrivée sur un autre écran',
                 mesure: `${id} au lieu de ${etape.attendu}` });
    }
    visites.push(nom);
    reglesEcran(nom, out, options);
  }

  const parGravite = { haute: 0, moyenne: 0, basse: 0 };
  out.forEach(f => { parGravite[f.gravite] = (parGravite[f.gravite] || 0) + 1; });

  const rapport = {
    fenetre: `${window.innerWidth}×${window.innerHeight}`,
    ecransVisites: visites,
    total: out.length,
    parGravite,
    constats: out.sort((a, b) =>
      ({ haute: 0, moyenne: 1, basse: 2 })[a.gravite] -
      ({ haute: 0, moyenne: 1, basse: 2 })[b.gravite])
  };

  return options.format === 'texte' ? enTexte(rapport) : rapport;
}

function enTexte(r) {
  const l = [];
  l.push(`Audit ${r.fenetre} · ${r.ecransVisites.join(', ')}`);
  l.push(`${r.total} constat${r.total > 1 ? 's' : ''} : ` +
         `${r.parGravite.haute || 0} haute, ${r.parGravite.moyenne || 0} moyenne, ` +
         `${r.parGravite.basse || 0} basse`);
  l.push('');
  if (!r.total) { l.push('Rien à signaler.'); return l.join('\n'); }
  let ecran = null;
  r.constats.forEach(c => {
    if (c.ecran !== ecran) { ecran = c.ecran; l.push(`— ${ecran} —`); }
    l.push(`  [${c.gravite}] ${c.regle} · ${c.cible}`);
    l.push(`      ${c.detail}${c.mesure ? ' : ' + c.mesure : ''}`);
  });
  return l.join('\n');
}

export default audit;
