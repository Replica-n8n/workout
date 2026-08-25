/* =========================================================================
   La Cour · catalogue
   Six mouvements, six niveaux chacun. Deux séances. Le Croisé.
   Aucune logique ici, uniquement des données.
   ========================================================================= */

/* Les six mouvements. `pull` a deux jeux de niveaux selon la variante :
   avec une table (recommandé) ou strictement rien. */
export const MOVEMENTS = {
  push_h: {
    name: 'Poussée horizontale',
    short: 'Poussée horiz.',
    muscles: 'Pectoraux, épaules, triceps',
    unit: 'reps',
    levels: [
      'Pompes genoux au sol',
      'Pompes genoux, 3 s à la descente',
      'Pompes complètes',
      'Pompes diamant',
      'Pompes archer',
      'Pompes pseudo-planche'
    ]
  },

  pull: {
    name: 'Tirage',
    short: 'Tirage',
    muscles: 'Dos, biceps',
    unit: 'reps',
    levels: [
      'Rowing sous table, corps oblique',
      'Rowing sous table, corps horizontal',
      'Rowing pieds surélevés',
      'Rowing une main assistée',
      'Traction négative, 5 s',
      'Traction complète'
    ],
    /* Version stricte : plus aucun objet. Entretient la posture,
       ne construit ni dos ni biceps. Le compromis est assumé. */
    strict: {
      name: 'Chaîne postérieure haute',
      short: 'Chaîne post.',
      muscles: 'Trapèzes, deltoïdes postérieurs, lombaires',
      levels: [
        'Superman, tenue 20 s',
        'Y-T-W au sol',
        'Reverse snow angel, lent',
        'Y-T-W avec pause 3 s',
        'Superman bras tendus, 45 s',
        'Reverse snow angel, 5 s par répétition'
      ]
    }
  },

  push_v: {
    name: 'Poussée verticale',
    short: 'Poussée vert.',
    muscles: 'Épaules, triceps',
    unit: 'reps',
    levels: [
      'Pompes piquées, bassin haut',
      'Pompes piquées, front vers le sol',
      'Pompes piquées, front au sol',
      'Appui mural, quart d’amplitude',
      'Appui mural, amplitude complète',
      'Appui mural, mains rapprochées'
    ]
  },

  knee: {
    name: 'Genou',
    short: 'Genou',
    muscles: 'Quadriceps, fessiers',
    unit: 'reps',
    levels: [
      'Squat au poids de corps',
      'Squat, 3 s à la descente',
      'Fente marchée',
      'Fente fendue, pied arrière au sol',
      'Squat une jambe, main au sol',
      'Pistol complet'
    ]
  },

  hip: {
    name: 'Hanche',
    short: 'Hanche',
    muscles: 'Ischios, fessiers',
    unit: 'reps',
    levels: [
      'Pont fessier deux jambes',
      'Pont fessier, pause 3 s',
      'Pont fessier une jambe',
      'Charnière une jambe, à vide',
      'Curl ischio glissé, deux jambes',
      'Curl ischio glissé, une jambe'
    ]
  },

  core: {
    name: 'Gainage',
    short: 'Gainage',
    muscles: 'Abdominaux, chaîne antérieure',
    unit: 'sec',
    levels: [
      'Planche',
      'Hollow hold genoux pliés',
      'Hollow hold jambes tendues',
      'Hollow rock',
      'Body saw',
      'Planche une main'
    ]
  }
};

export const MOVEMENT_ORDER = ['push_h', 'pull', 'push_v', 'knee', 'hip', 'core'];

/* Les deux séances. `rest` en secondes. `unilateral` double les séries
   annoncées, une jambe ou un côté à la fois. */
export const SESSIONS = {
  A: {
    label: 'Séance A',
    name: 'Horizontale',
    blocks: [
      { mov: 'push_h', sets: 4, rest: 150 },
      { mov: 'pull',   sets: 4, rest: 150 },
      { mov: 'knee',   sets: 3, rest: 120 },
      { mov: 'hip',    sets: 3, rest: 90  },
      { mov: 'core',   sets: 3, rest: 60  }
    ]
  },
  B: {
    label: 'Séance B',
    name: 'Verticale',
    blocks: [
      { mov: 'push_v', sets: 4, rest: 150 },
      { mov: 'pull',   sets: 3, rest: 150 },
      { mov: 'knee',   sets: 3, rest: 120, unilateral: true },
      { mov: 'hip',    sets: 3, rest: 90  },
      { mov: 'core',   sets: 3, rest: 60,  unilateral: true }
    ]
  }
};

/* Le Croisé, ajouté à la fin de la séance B, une fois par semaine.
   La taille monte de 2 en 2 jusqu'à 20, la version d'origine de la vidéo. */
export const CROISE = {
  rest: 18,
  minSets: 8,
  maxSets: 20,
  step: 2,
  /* 12 -> [12,1,11,2,10,3,9,4,8,5,7,6] */
  sequence(n) {
    const out = [];
    for (let i = 0; i < n / 2; i++) { out.push(n - i); out.push(i + 1); }
    return out;
  },
  total(n) { return this.sequence(n).reduce((a, b) => a + b, 0); }
};

/* Règles de progression, en un seul endroit. */
export const RULES = {
  levelUpReps: 12,      // 3 séries à ce chiffre font monter d'un niveau
  levelUpSec: 45,       // en gainage on compte des secondes, pas des répétitions
  levelUpSets: 3,
  levelDownReps: 5,     // deux séances sous ce chiffre proposent de redescendre
  levelDownSec: 15,
  levelDownSessions: 2,
  adjustRange: 10,      // le réglage va de la valeur pré-remplie ± ceci
  defaultReps: 8,
  defaultSec: 30,
  secStep: 5,
  croiseGapDays: 6      // délai minimum entre deux Croisés
};

/* Résout un mouvement selon la variante choisie. */
export function movement(key, variant) {
  const m = MOVEMENTS[key];
  if (key === 'pull' && variant === 'strict') {
    return { ...m, ...m.strict, unit: 'reps' };
  }
  return m;
}
