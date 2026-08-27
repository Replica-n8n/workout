/* =========================================================================
   La Cour · figures d'exercice, les 42

   Pourquoi elles sont dessinées et non photographiées
   ---------------------------------------------------
   Les banques libres existent (free-exercise-db, wger) mais ne couvrent pas
   ces mouvements-ci : zéro hollow hold, un seul rowing inversé pour quatre
   niveaux, aucune pompe piquée ni archer ni genoux au sol. Leurs
   correspondances les plus proches montrent une barre ou un kettlebell, ce
   qui contredirait le programme. Et 5,4 Mo de photos ruineraient une app qui
   pèse 50 Ko et doit tenir hors ligne.

   Une pose = des articulations. Un seul moteur les dessine toutes, donc le
   style ne peut pas diverger et corriger l'épaisseur du trait les corrige
   toutes.

   Deux vues, choisies selon où vit l'information :
   - de PROFIL par défaut, repère 200 × 120, sol à y = 110 ;
   - de DESSUS pour les Y-T-W et les snow angels, parce qu'en profil la
     forme des bras, qui est tout le sujet, est invisible.

   La tête se déduit de l'axe du tronc au-delà de l'épaule. Posée à la main
   elle se détachait du corps une fois sur deux.
   ========================================================================= */

const SOL = 110;

/* `ligne` = poignet, coude, épaule, hanche, genou, cheville.
   `bras2` dessine le second membre quand il diverge (archer, une main).
   `fleche` montre le sens du mouvement quand la pose seule ne le dit pas. */
export const POSES = {

  /* ================= poussée horizontale ================= */
  'push_h-1': {
    ligne: [[38,106],[44,86],[58,68],[108,84],[140,106],[168,94]],
    appuis: [[38,106],[140,106]],
    note: 'Genoux posés, pieds relevés. Le corps reste droit des genoux à la tête.'
  },
  'push_h-2': {
    ligne: [[38,106],[34,92],[54,84],[106,92],[140,106],[168,94]],
    appuis: [[38,106],[140,106]],
    fleche: [96,58,96,78],
    note: 'Même position, mais trois secondes pour descendre. La montée reste normale.'
  },
  'push_h-3': {
    ligne: [[38,106],[44,86],[58,68],[108,78],[142,92],[176,106]],
    appuis: [[38,106],[176,106]],
    note: 'Corps en ligne des talons à la tête, mains sous les épaules.'
  },
  'push_h-4': {
    ligne: [[64,106],[64,86],[64,68],[114,78],[148,92],[180,106]],
    appuis: [[64,106],[180,106]],
    note: 'Mains jointes sous la poitrine, pouces et index se touchent. Les coudes frôlent le corps.'
  },
  'push_h-5': {
    ligne: [[74,106],[74,88],[74,70],[122,80],[152,93],[182,106]],
    bras2: [[74,70],[46,92],[24,106]],
    appuis: [[74,106],[24,106],[182,106]],
    note: 'Tout le poids sur un bras plié, l’autre reste tendu sur le côté. On alterne.'
  },
  'push_h-6': {
    ligne: [[112,106],[104,88],[92,72],[130,80],[158,93],[184,106]],
    appuis: [[112,106],[184,106]],
    note: 'Mains ramenées au niveau des hanches, épaules poussées loin devant elles.'
  },

  /* ================= tirage, version table ================= */
  'pull-1': {
    ligne: [[96,50],[88,66],[80,84],[118,98],[150,104],[180,108]],
    appuis: [[180,108]],
    accessoires: [{ type: 'table', x: 70, y: 42, l: 74 }],
    note: 'Corps oblique sous la table, pieds loin. Plus tu te redresses, plus c’est facile.'
  },
  'pull-2': {
    ligne: [[94,54],[78,66],[60,76],[112,86],[146,97],[178,108]],
    appuis: [[178,108]],
    accessoires: [{ type: 'table', x: 68, y: 46, l: 74 }],
    note: 'Corps horizontal, poitrine tirée vers le plateau. Le corps reste en planche.'
  },
  'pull-3': {
    ligne: [[94,54],[78,64],[60,72],[112,78],[146,82],[176,86]],
    appuis: [[176,86]],
    accessoires: [{ type: 'table', x: 68, y: 46, l: 74 }, { type: 'bloc', x: 164, y: 88, l: 30, h: 22 }],
    note: 'Pieds posés sur un banc ou une marche : le corps devient plus lourd à tirer.'
  },
  'pull-4': {
    ligne: [[96,56],[80,68],[62,78],[114,88],[148,98],[178,108]],
    bras2: [[62,78],[76,96],[96,104]],
    appuis: [[178,108]],
    accessoires: [{ type: 'table', x: 68, y: 46, l: 74 }],
    note: 'Un seul bras tire, l’autre accompagne à peine. On alterne d’une série à l’autre.'
  },
  'pull-5': {
    ligne: [[86,20],[84,46],[88,70],[92,92],[88,110],[84,122]],
    sansSol: true,
    accessoires: [{ type: 'barre', x: 46, y: 16, l: 84 }],
    tete: [106,60],
    fleche: [146,56,146,90],
    note: 'On part en haut, menton au-dessus de la barre, et on descend en cinq secondes. Pas de montée.'
  },
  'pull-6': {
    ligne: [[84,20],[62,42],[86,62],[92,86],[88,106],[82,120]],
    sansSol: true,
    accessoires: [{ type: 'barre', x: 44, y: 16, l: 84 }],
    tete: [108,40],
    note: 'Menton amené au-dessus de la barre, descente complète bras tendus.'
  },

  /* ========= tirage, version sans rien : chaîne postérieure ========= */
  'pull_s-1': {
    ligne: [[24,72],[46,80],[68,90],[116,100],[146,94],[176,86]],
    tete: [56,100],
    appuis: [[116,102]],
    note: 'À plat ventre. On décolle poitrine et cuisses du sol, et on tient.'
  },
  'pull_s-2': {
    vue: 'dessus',
    torse: [[100,42],[100,88]],
    bras: [[[76,56],[58,32]],[[124,56],[142,32]]],
    jambes: [[[92,88],[88,114]],[[108,88],[112,114]]],
    note: 'Bras en Y, pouces vers le plafond. On décolle les bras du sol et on serre les omoplates.'
  },
  'pull_s-3': {
    vue: 'dessus',
    torse: [[100,42],[100,88]],
    bras: [[[74,58],[52,50]],[[126,58],[148,50]]],
    jambes: [[[92,88],[88,114]],[[108,88],[112,114]]],
    fleche: [40,74,40,42],
    note: 'Bras qui balaient lentement du bas vers le haut, comme un ange dans la neige, mais sur le ventre.'
  },
  'pull_s-4': {
    vue: 'dessus',
    torse: [[100,42],[100,88]],
    bras: [[[74,58],[50,58]],[[126,58],[150,58]]],
    jambes: [[[92,88],[88,114]],[[108,88],[112,114]]],
    note: 'Bras en T, tendus sur les côtés. Trois secondes de pause dans chaque position.'
  },
  'pull_s-5': {
    ligne: [[20,54],[44,66],[70,82],[116,100],[148,86],[178,70]],
    tete: [60,98],
    appuis: [[116,102]],
    note: 'Bras tendus loin devant. Le levier est plus long, donc plus dur à tenir.'
  },
  'pull_s-6': {
    vue: 'dessus',
    torse: [[100,42],[100,88]],
    bras: [[[74,58],[80,38]],[[126,58],[120,38]]],
    jambes: [[[92,88],[88,114]],[[108,88],[112,114]]],
    fleche: [40,74,40,42],
    note: 'Bras en W, coudes bas et serrés. Cinq secondes par répétition.'
  },

  /* ================= poussée verticale ================= */
  'push_v-1': {
    ligne: [[40,106],[50,86],[64,64],[120,40],[152,74],[178,106]],
    appuis: [[40,106],[178,106]],
    note: 'Bassin haut, corps en V renversé. Plus le bassin monte, plus les épaules travaillent.'
  },
  'push_v-2': {
    ligne: [[40,106],[42,88],[58,74],[118,42],[150,76],[178,106]],
    appuis: [[40,106],[178,106]],
    fleche: [88,46,74,64],
    note: 'On plie les coudes et le front descend vers le sol, sans le toucher.'
  },
  'push_v-3': {
    ligne: [[48,106],[40,90],[58,86],[118,44],[150,78],[178,106]],
    appuis: [[48,106],[178,106],[26,104]],
    tete: [26,96],
    note: 'Le front vient effleurer le sol devant les mains, puis on repousse.'
  },
  'push_v-4': {
    ligne: [[86,108],[88,86],[90,64],[98,42],[108,26],[122,14]],
    appuis: [[86,108]],
    accessoires: [{ type: 'mur', x: 126 }],
    note: 'En appui contre un mur, talons posés dessus. On plie à peine, un quart de la descente.'
  },
  'push_v-5': {
    ligne: [[86,108],[62,96],[88,78],[98,50],[108,30],[122,16]],
    appuis: [[86,108]],
    accessoires: [{ type: 'mur', x: 126 }],
    tete: [66,108],
    note: 'Descente complète jusqu’à ce que la tête frôle le sol, puis on repousse.'
  },
  'push_v-6': {
    ligne: [[96,108],[74,98],[96,80],[102,52],[110,30],[122,16]],
    appuis: [[96,108]],
    accessoires: [{ type: 'mur', x: 126 }],
    tete: [78,110],
    note: 'Mêmes descentes, mains rapprochées : les triceps prennent presque tout.'
  },

  /* ================= genou ================= */
  'knee-1': {
    ligne: [[62,44],[84,52],[104,30],[110,62],[80,80],[96,108]],
    appuis: [[96,108]],
    note: 'Pieds écartés comme les épaules, on descend jusqu’aux cuisses parallèles au sol.'
  },
  'knee-2': {
    ligne: [[60,50],[82,58],[102,36],[110,70],[78,86],[96,108]],
    appuis: [[96,108]],
    fleche: [148,44,148,76],
    note: 'Même squat, mais trois secondes pour descendre. On ne s’assoit pas, on contrôle.'
  },
  'knee-3': {
    ligne: [[70,46],[90,54],[106,32],[110,66],[80,88],[70,108]],
    jambeLibre: [[110,66],[146,88],[176,108]],
    appuis: [[70,108],[176,108]],
    fleche: [34,96,14,96],
    note: 'On avance d’un grand pas, le genou arrière descend vers le sol, puis on enchaîne.'
  },
  'knee-4': {
    ligne: [[74,46],[94,54],[108,32],[112,66],[84,90],[74,108]],
    jambeLibre: [[112,66],[150,92],[178,104]],
    appuis: [[74,108],[178,104]],
    note: 'Pied arrière posé loin derrière, on descend sur place. Rien à surélever.'
  },
  'knee-5': {
    ligne: [[40,54],[64,50],[92,38],[102,68],[74,90],[88,108]],
    jambeLibre: [[102,68],[134,86],[156,106]],
    appuis: [[88,108],[156,106]],
    note: 'Descente sur une jambe, le talon libre effleure le sol derrière pour l’équilibre. Il porte le moins de poids possible.'
  },
  'knee-6': {
    ligne: [[54,40],[76,48],[100,30],[108,64],[78,84],[92,108]],
    jambeLibre: [[108,64],[150,58],[178,62]],
    appuis: [[92,108]],
    note: 'Jambe libre tendue devant, sans appui. On descend complet et on remonte.'
  },

  /* ================= hanche ================= */
  'hip-1': {
    ligne: [[40,106],[46,96],[58,92],[112,62],[146,84],[164,108]],
    appuis: [[40,106],[164,108]],
    tete: [42,88],
    note: 'Épaules au sol, pieds à plat, on pousse les hanches vers le plafond.'
  },
  'hip-2': {
    ligne: [[40,106],[46,96],[58,92],[112,52],[146,80],[164,108]],
    appuis: [[40,106],[164,108]],
    tete: [42,88],
    note: 'Même pont, monté plus haut, et trois secondes de pause en haut à chaque répétition.'
  },
  'hip-3': {
    ligne: [[40,106],[46,96],[58,92],[112,58],[146,82],[164,108]],
    jambeLibre: [[112,58],[150,50],[180,46]],
    appuis: [[40,106],[164,108]],
    tete: [42,88],
    note: 'Une jambe tendue en l’air, tout le poids sur l’autre talon.'
  },
  'hip-4': {
    ligne: [[54,74],[64,58],[80,44],[122,50],[126,78],[124,108]],
    jambeLibre: [[122,50],[160,44],[186,52]],
    appuis: [[124,108]],
    note: 'Debout sur une jambe, on bascule le buste vers l’avant, l’autre jambe part derrière.'
  },
  'hip-5': {
    ligne: [[40,106],[46,96],[58,92],[110,70],[150,92],[180,102]],
    appuis: [[40,106],[180,102]],
    tete: [42,88],
    fleche: [162,72,186,72],
    note: 'Depuis le pont, les talons glissent au loin et reviennent. Sol lisse ou chaussettes.'
  },
  'hip-6': {
    ligne: [[40,106],[46,96],[58,92],[110,68],[150,90],[180,100]],
    jambeLibre: [[110,68],[144,56],[172,50]],
    appuis: [[40,106],[180,100]],
    tete: [42,88],
    fleche: [162,72,186,72],
    note: 'Même glissé, sur un seul talon. L’autre jambe reste en l’air.'
  },

  /* ================= gainage ================= */
  'core-1': {
    ligne: [[34,106],[56,106],[64,74],[116,80],[150,92],[182,106]],
    appuis: [[34,106],[182,106]],
    note: 'Appui sur les avant-bras, dos plat, fessiers serrés. Ni creux ni bosse.'
  },
  'core-2': {
    ligne: [[36,66],[58,72],[78,80],[116,92],[136,72],[150,92]],
    appuis: [[116,94]],
    tete: [72,62],
    note: 'Sur le dos, genoux pliés, épaules et pieds décollés. Le bas du dos reste plaqué.'
  },
  'core-3': {
    ligne: [[24,48],[48,58],[72,70],[114,88],[146,72],[176,56]],
    appuis: [[114,90]],
    tete: [86,78],
    note: 'Mêmes appuis, jambes tendues. Seul le bas du dos touche encore le sol.'
  },
  'core-4': {
    ligne: [[24,48],[48,58],[72,70],[114,88],[146,72],[176,56]],
    appuis: [[114,90]],
    tete: [86,78],
    fleche: [58,104,140,104],
    note: 'Depuis le hollow, on se balance d’avant en arrière sans jamais poser les pieds.'
  },
  'core-5': {
    ligne: [[34,106],[56,106],[64,74],[116,80],[150,92],[182,106]],
    appuis: [[34,106],[182,106]],
    fleche: [150,60,186,60],
    note: 'En planche, le corps avance et recule d’avant en arrière, coudes fixes.'
  },
  'core-6': {
    ligne: [[34,106],[56,106],[64,74],[116,80],[150,92],[182,106]],
    bras2: [[64,74],[42,62],[16,56]],
    appuis: [[34,106],[182,106]],
    note: 'Planche avec un bras tendu devant. Le bassin ne doit surtout pas tourner.'
  }
};

/* ------------------------------------------------------------------ rendu */

const T = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"';

function fleche(p, [x1, y1, x2, y2]) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const l = 7;
  p.push(`<line ${T} stroke-width="3" opacity=".7" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  [a - 2.5, a + 2.5].forEach(b => {
    p.push(`<line ${T} stroke-width="3" opacity=".7" x1="${x2}" y1="${y2}" ` +
           `x2="${(x2 + Math.cos(b) * l).toFixed(1)}" y2="${(y2 + Math.sin(b) * l).toFixed(1)}"/>`);
  });
}

function accessoires(p, liste) {
  (liste || []).forEach(a => {
    if (a.type === 'table') {
      p.push(`<line ${T} stroke-width="4" opacity=".55" x1="${a.x}" y1="${a.y}" x2="${a.x + a.l}" y2="${a.y}"/>`);
      [a.x + 4, a.x + a.l - 4].forEach(x =>
        p.push(`<line ${T} stroke-width="2.5" opacity=".3" x1="${x}" y1="${a.y}" x2="${x}" y2="${SOL}"/>`));
    }
    if (a.type === 'barre') {
      p.push(`<line ${T} stroke-width="5" opacity=".55" x1="${a.x}" y1="${a.y}" x2="${a.x + a.l}" y2="${a.y}"/>`);
    }
    if (a.type === 'bloc') {
      p.push(`<rect x="${a.x}" y="${a.y}" width="${a.l}" height="${a.h}" ` +
             `fill="none" stroke="currentColor" stroke-width="2.5" opacity=".4"/>`);
    }
    if (a.type === 'mur') {
      p.push(`<line ${T} stroke-width="4" opacity=".45" x1="${a.x}" y1="2" x2="${a.x}" y2="${SOL}"/>`);
    }
  });
}

function vueProfil(p, pose) {
  if (!pose.sansSol) {
    p.push(`<line ${T} stroke-width="1.5" stroke-dasharray="3 5" opacity=".35" ` +
           `x1="6" y1="${SOL}" x2="194" y2="${SOL}"/>`);
  }
  accessoires(p, pose.accessoires);
  [pose.jambeLibre, pose.bras2].forEach(m => {
    if (m) p.push(`<polyline ${T} stroke-width="5" opacity=".5" points="${m.map(q => q.join(',')).join(' ')}"/>`);
  });
  p.push(`<polyline ${T} stroke-width="7" points="${pose.ligne.map(q => q.join(',')).join(' ')}"/>`);

  const [ep, ha] = [pose.ligne[2], pose.ligne[3]];
  let tete = pose.tete;
  if (!tete) {
    const dx = ep[0] - ha[0], dy = ep[1] - ha[1];
    const d = Math.hypot(dx, dy) || 1;
    tete = [ep[0] + (dx / d) * 17, ep[1] + (dy / d) * 17];
  }
  p.push(`<line ${T} stroke-width="7" x1="${ep[0]}" y1="${ep[1]}" x2="${tete[0]}" y2="${tete[1]}"/>`);
  p.push(`<circle cx="${tete[0]}" cy="${tete[1]}" r="11" fill="currentColor" stroke="none"/>`);
}

/* Vue de dessus : réservée aux poses où la forme des bras EST l'exercice.
   De profil, un Y et un T se ressemblent trait pour trait. */
function vueDessus(p, pose) {
  const [haut, bas] = pose.torse;
  pose.jambes.forEach(j =>
    p.push(`<polyline ${T} stroke-width="6" opacity=".55" points="${[bas, ...j].map(q => q.join(',')).join(' ')}"/>`));
  p.push(`<line ${T} stroke-width="12" opacity=".9" x1="${haut[0]}" y1="${haut[1]}" x2="${bas[0]}" y2="${bas[1]}"/>`);
  pose.bras.forEach(b =>
    p.push(`<polyline ${T} stroke-width="7" points="${[[haut[0], haut[1] + 8], ...b].map(q => q.join(',')).join(' ')}"/>`));
  p.push(`<circle cx="${haut[0]}" cy="${haut[1] - 4}" r="11" fill="currentColor" stroke="none"/>`);
  p.push(`<text x="100" y="17" text-anchor="middle" font-size="9" fill="currentColor" ` +
         `opacity=".5" font-family="sans-serif">vu de dessus</text>`);
}

export function figure(cle, { largeur = 200 } = {}) {
  const pose = POSES[cle];
  if (!pose) return null;
  const p = [];
  if (pose.vue === 'dessus') vueDessus(p, pose); else vueProfil(p, pose);
  if (pose.fleche) fleche(p, pose.fleche);
  (pose.appuis || []).forEach(a =>
    p.push(`<circle cx="${a[0]}" cy="${a[1]}" r="4.5" fill="var(--accent)" stroke="none"/>`));
  return `<svg viewBox="0 0 200 120" width="${largeur}" role="img" ` +
         `aria-label="Schéma de position" style="max-width:100%;height:auto">${p.join('')}</svg>`;
}

export function note(cle) { return (POSES[cle] || {}).note || ''; }
export function existe(cle) { return !!POSES[cle]; }
