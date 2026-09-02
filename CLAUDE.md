# workout

Une app d'entraînement PWA par dossier (`la-cour/`, `gvt/`). Vanilla JS,
**aucune dépendance, aucun outil de build**. Servi par GitHub Pages sur la
branche `main` : `https://replica-n8n.github.io/workout/<app>/`.

Le rituel complet de vérification et de livraison est dans la skill
**`livraison-pwa`** (`.claude/skills/`). Elle fait autorité ; ce fichier ne
répète pas son contenu, il donne les invariants du dépôt.

## Invariants

- **Une app est autonome** : son `index.html`, son `manifest.webmanifest`, son
  `sw.js`. Les portées de service worker ne se chevauchent pas.
- **`VERSION` en haut du `sw.js` de l'app est le SEUL point de version.** Le
  nom du cache en dérive. La bumper est ce qui livre ; l'oublier est le seul
  moyen de pousser une correction que personne ne recevra.
- **Rien ne dépend du réseau une fois la page chargée.** Pas de CDN, pas de
  police distante, pas d'appel pendant une séance. Une maquette qui charge
  Tailwind depuis un CDN s'affiche sans aucune couleur hors ligne : c'est le
  bug qui a motivé la réécriture du CSS de `gvt/`.
- **Un chrono se stocke en timestamp absolu**, jamais en compteur qui
  décrémente : un `setInterval` est gelé dès que l'écran s'éteint.
- **Cibles tactiles à 44 px**, la règle native, pas le minimum web de 24 px.

## Avant de vérifier quoi que ce soit dans le navigateur

Le service worker sert du code périmé tant qu'on ne le purge pas. On croit
alors que la modification n'a pas pris. Purger d'abord (voir `livraison-pwa`
pour le script), puis recharger.

## Vérifier

`tools/audit.js` tourne **dans la page** et mesure des rectangles réels.
Chaque app a besoin de son plan : `PLAN_LA_COUR`, `PLAN_GVT`. Sans plan, le
parcours par défaut cherche des sections `.screen` et peut ne visiter **aucun
écran**, en rendant un « rien à signaler » qui n'a rien mesuré.

**Un test qui n'a jamais échoué ne prouve rien.** Injecter un défaut
volontaire de temps en temps et vérifier qu'il est bien détecté, avant de
croire un zéro.

## Ajouter une app

Un dossier à la racine avec ses propres `index.html`, `manifest.webmanifest`
et `sw.js`, ses icônes générées par un script de `tools/` (encodeur PNG en
Python pur, rien à installer), **plus** une ligne dans le tableau du
`README.md` et une carte dans l'`index.html` racine. Sans ces deux dernières,
l'app existe sans être annoncée nulle part.

## Écriture

Textes d'interface en français. Les messages de commit disent **ce qui
cassait** avant de dire ce qui change.
