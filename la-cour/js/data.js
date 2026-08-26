/* =========================================================================
   La Cour · catalogue
   Six mouvements, six niveaux chacun. Deux séances. Le Croisé.
   Aucune logique ici, uniquement des données.

   L'unité est portée par le NIVEAU, pas par le mouvement : un Superman se
   tient en secondes, alors qu'un Y-T-W juste au-dessus se compte en
   répétitions. Idem au gainage, où la planche est une tenue mais le hollow
   rock un mouvement.
   ========================================================================= */

/* Raccourcis de déclaration : r() pour des répétitions, s() pour des secondes. */
const r = n => ({ n, u: 'reps' });
const s = n => ({ n, u: 'sec' });

export const MOVEMENTS = {
  push_h: {
    name: 'Poussée horizontale',
    short: 'Poussée horiz.',
    muscles: 'Pectoraux, épaules, triceps',
    levels: [
      r('Pompes genoux au sol'),
      r('Pompes genoux, 3 s à la descente'),
      r('Pompes complètes'),
      r('Pompes diamant'),
      r('Pompes archer'),
      r('Pompes pseudo-planche')
    ]
  },

  pull: {
    name: 'Tirage',
    short: 'Tirage',
    muscles: 'Dos, biceps',
    levels: [
      r('Rowing sous table, corps oblique'),
      r('Rowing sous table, corps horizontal'),
      r('Rowing pieds surélevés'),
      r('Rowing une main assistée'),
      r('Traction négative, 5 s de descente'),
      r('Traction complète')
    ],
    /* Version stricte : plus aucun objet. Entretient la posture,
       ne construit ni dos ni biceps. Le compromis est assumé. */
    strict: {
      name: 'Chaîne postérieure haute',
      short: 'Chaîne post.',
      muscles: 'Trapèzes, deltoïdes postérieurs, lombaires',
      levels: [
        s('Superman, tenue'),
        r('Y-T-W au sol'),
        r('Reverse snow angel, lent'),
        r('Y-T-W avec pause 3 s par position'),
        s('Superman bras tendus, tenue'),
        r('Reverse snow angel, 5 s par répétition')
      ]
    }
  },

  push_v: {
    name: 'Poussée verticale',
    short: 'Poussée vert.',
    muscles: 'Épaules, triceps',
    levels: [
      r('Pompes piquées, bassin haut'),
      r('Pompes piquées, front vers le sol'),
      r('Pompes piquées, front au sol'),
      r('Appui mural, quart d’amplitude'),
      r('Appui mural, amplitude complète'),
      r('Appui mural, mains rapprochées')
    ]
  },

  knee: {
    name: 'Genou',
    short: 'Genou',
    muscles: 'Quadriceps, fessiers',
    levels: [
      r('Squat au poids de corps'),
      r('Squat, 3 s à la descente'),
      r('Fente marchée'),
      r('Fente fendue, pied arrière au sol'),
      r('Squat une jambe, main au sol'),
      r('Pistol complet')
    ]
  },

  hip: {
    name: 'Hanche',
    short: 'Hanche',
    muscles: 'Ischios, fessiers',
    levels: [
      r('Pont fessier deux jambes'),
      r('Pont fessier, pause 3 s en haut'),
      r('Pont fessier une jambe'),
      r('Charnière une jambe, à vide'),
      r('Curl ischio glissé, deux jambes'),
      r('Curl ischio glissé, une jambe')
    ]
  },

  core: {
    name: 'Gainage',
    short: 'Gainage',
    muscles: 'Abdominaux, chaîne antérieure',
    levels: [
      s('Planche'),
      s('Hollow hold genoux pliés'),
      s('Hollow hold jambes tendues'),
      r('Hollow rock'),
      r('Body saw'),
      s('Planche une main')
    ]
  }
};

export const MOVEMENT_ORDER = ['push_h', 'pull', 'push_v', 'knee', 'hip', 'core'];

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

export const RULES = {
  levelUpReps: 12,      // 3 séries à ce chiffre font monter d'un niveau
  levelUpSec: 45,       // une tenue se juge en secondes, pas en répétitions
  levelUpSets: 3,
  levelDownReps: 5,
  levelDownSec: 15,
  adjustRange: 10,      // le réglage va de la valeur pré-remplie ± ceci
  defaultReps: 8,
  defaultSec: 20,
  secStep: 5,
  croiseGapDays: 6      // délai minimum entre deux Croisés
};

/* Résout un mouvement selon la variante choisie. */
export function movement(key, variant) {
  const m = MOVEMENTS[key];
  if (key === 'pull' && variant === 'strict') return { ...m, ...m.strict };
  return m;
}

/* Le niveau demandé, avec son nom et son unité. */
export function levelInfo(key, variant, level) {
  const m = movement(key, variant);
  const lv = m.levels[Math.min(6, Math.max(1, level)) - 1];
  return { name: lv.n, unit: lv.u };
}
