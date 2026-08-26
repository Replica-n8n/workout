---
name: livraison-pwa
description: >
  Rituel de vérification et de livraison des PWA du dépôt workout (La Cour et
  les suivantes). Utilise ce skill dès qu'on touche à un fichier sous
  workout/, et pas seulement quand on parle explicitement de « livrer » :
  modifier du CSS ou du JS d'une app, ajouter un écran, corriger un bug,
  tester dans le navigateur, préparer un commit, pousser sur GitHub, ou se
  demander pourquoi une modification n'apparaît pas. Il contient trois choses
  qu'on redécouvre douloureusement sinon : le service worker sert du code
  périmé tant qu'on ne le purge pas, les captures d'écran ne fonctionnent pas
  sur cette machine, et la revue de code attrape des bugs que les
  vérifications maison laissent passer.
---

# Livraison des PWA du dépôt workout

Vanilla JS, aucune dépendance, aucun build. Une app par dossier
(`la-cour/`, et les suivantes). Chacune est autonome : son `index.html`, son
`manifest.webmanifest`, son `sw.js`.

## Le piège numéro un : tu testes du code périmé

Le service worker met la coquille en cache. Après une modification, le
navigateur **continue de servir l'ancienne version**, y compris après un
rechargement. On croit alors que le changement n'a pas pris, on le refait, on
s'énerve.

Avant toute vérification dans le navigateur, purge :

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
for (const k of await caches.keys()) await caches.delete(k);
location.replace('/la-cour/?t=' + Date.now());
```

Et pour livrer, **une seule chose à changer** : la constante `VERSION` en haut
de `sw.js`. Le nom du cache en dérive et l'ancien est supprimé à l'activation.
Il n'y a aucun `?v=...` à répercuter ailleurs. `window.LACOUR_VERSION` dans
`index.html` sert uniquement à l'affichage dans l'écran Réglages : la garder
alignée est cosmétique, l'oublier n'a aucune conséquence sur le cache.

Oublier de bumper `VERSION` est le seul moyen de pousser une correction que
personne ne recevra jamais.

## Vérifier sans captures d'écran

Le panneau navigateur de cette machine **ne capture pas** : `computer` avec
`screenshot` échoue systématiquement. Ce n'est pas un incident, c'est l'état
de l'installation. Ne perds pas de temps à réessayer.

La vérification passe donc par `javascript_tool` et par des mesures. C'est
d'ailleurs plus fiable qu'un coup d'œil : on obtient des nombres.

Démarrer le serveur : `preview_start` avec `{name: "workout"}` (défini dans
`.claude/launch.json` du dépôt parent), puis naviguer vers
`http://localhost:8099/<app>/`.

## L'audit automatique

`tools/audit.js` fait la plus grande partie du travail ci-dessous. Il tourne
**dans la page**, parcourt les écrans en cliquant comme un utilisateur, et
mesure des rectangles réels :

```js
const a = await import('/tools/audit.js?t=' + Date.now());
await a.audit({ ecrans: a.PLAN_LA_COUR, format: 'texte' });
```

Il couvre les cibles tactiles, les écarts entre cibles, les noms accessibles,
les contrastes composés, l'action principale hors écran, le défilement de la
page, le débordement horizontal, les `tabindex` positifs, les images sans
`alt`, la présence d'une zone `role="status"`, l'attribut `lang` et les règles
`:focus-visible`.

Un scanner statique de fichiers ne servirait à rien ici : 8 des 25 boutons de
La Cour sont fabriqués à l'exécution, et les 4 seuls `aria-label` de l'app sont
dans le JavaScript, pas dans `index.html`.

`PLAN_LA_COUR` décrit comment atteindre chaque écran, y compris ceux qui n'ont
pas de bouton `[data-goto]`. Une nouvelle app a besoin de son propre plan,
sinon seuls les écrans atteignables automatiquement sont audités. Chaque étape
porte un `attendu` : si la navigation dérive, l'audit le signale au lieu de
mesurer silencieusement le mauvais écran.

⚠️ Ce script est un filet, pas une garantie. Il ne juge ni la clarté des
libellés, ni la logique d'un parcours, ni ce que la revue de code attrape.
Vérifie qu'il détecte encore quelque chose de temps en temps, en injectant un
défaut volontaire : un audit qui renvoie toujours zéro peut être un audit
cassé.

## Ce qu'il faut mesurer

L'audit couvre la plupart de ces points. Ils sont détaillés ici parce qu'ils
viennent tous de bugs réellement trouvés sur ce projet, pas d'une liste
générique, et parce qu'il faut comprendre pourquoi une règle existe pour savoir
quand elle ne s'applique pas.

**Cibles tactiles.** C'est une app installée sur un téléphone, donc 44 px
minimum, pas le minimum web de 24 px. Espacement d'au moins 8 px entre deux
cibles adjacentes. Mesure les rectangles, ne te fie pas au `padding` déclaré.

**Le bouton principal.** Il doit rester entièrement visible dans le tiers bas,
sur chaque écran, et la page ne doit jamais défiler. Un `min-height:100dvh`
laisse l'écran grandir et pousse le bouton sous la ligne de flottaison ; c'est
`height` plus `min-height:0` sur la zone défilante qui tient. Vérifie
`document.documentElement.scrollHeight > window.innerHeight` à false partout.

**Navigation matérielle.** Le retour Android et le balayage iOS ne doivent pas
fermer l'app. Chaque écran est une entrée d'historique, et les boutons
« Retour » de l'interface doivent **consommer** l'entrée de l'aller
(`history.back()`), pas en empiler une nouvelle. Test concret : cinq
allers-retours entre deux écrans doivent ajouter une entrée, pas dix. Vérifie
aussi la navigation *avant* : revenir sur une entrée dont l'état a été détruit
ne doit pas afficher un écran figé aux boutons inertes.

**Unités.** L'unité se déclare par **niveau**, jamais par mouvement : un
Superman se tient en secondes alors que le Y-T-W du niveau au-dessus se compte
en répétitions. Les seuils et les records suivent l'unité du niveau.

**Dates.** Jamais `toISOString().slice(0,10)` ni `new Date("2026-08-25")` :
les deux passent par UTC et décalent d'un jour selon le fuseau. Construis en
local, composant par composant.

**Chronos.** Une échéance se stocke en timestamp absolu, jamais en compteur :
`setInterval` est gelé dès que l'écran s'éteint, un timestamp non. C'est ce qui
permet au repos de 2 min 30 de rester juste, y compris sur iOS où le Wake Lock
n'existe pas.

**Hors ligne.** Aucune requête réseau pendant une séance. Vérifie que le cache
contient bien tous les fichiers de la liste `FILES` de `sw.js`.

**Contrastes.** Au-dessus de 4,5 pour le texte courant, 3 suffit au-delà de
18,66 px en gras. Calcule-les, ne les estime pas.

**Console.** `read_console_messages` avec `onlyErrors` doit ne rien renvoyer.

## Vocabulaire

Trois mots, et un quatrième est un bug : **niveau** (difficulté d'un mouvement,
1 à 6), **série** (un bloc de répétitions suivi d'un repos), **Le Croisé** (le
finisher du vendredi). « Palier », « barreau », « échelle » ont été bannis
après que l'utilisateur s'est perdu dans sa propre app. Si un synonyme
réapparaît dans une chaîne affichée, c'est une régression.

## Avant de pousser

Lance `/code-review` sur le diff. Ce n'est pas une formalité : sur ce projet,
la revue a trouvé deux bugs de navigation réels dans un diff écrit dix minutes
plus tôt, que les vérifications maison avaient laissés passer. On teste ce
qu'on a écrit, pas ce que l'utilisateur va faire.

Puis :

1. Bumper `VERSION` dans `sw.js`.
2. Message de commit en français, qui dit **ce qui cassait** avant de dire ce
   qui change.
3. `git push origin main`. Les identifiants sont dans le gestionnaire Windows,
   rien n'est demandé.

`gh` n'est installé nulle part sur cette machine. Créer un dépôt passe donc par
l'interface web ; le push, lui, fonctionne seul. GitHub Pages sert le dépôt sur
`https://replica-n8n.github.io/workout/<app>/`, et redéploie tout seul.

## Ajouter une app au dépôt

Un dossier à la racine, avec son propre `index.html`,
`manifest.webmanifest` et `sw.js`. Les portées de service worker ne se
chevauchent pas, chaque app est isolée dans son sous-chemin. Ajoute ensuite une
ligne au tableau du `README.md` et une carte dans l'`index.html` racine, sans
quoi l'app existe sans être annoncée nulle part.

Les icônes se génèrent sans dépendance avec `tools/mkicons.py` : encodeur PNG
en Python pur, pas de Pillow à installer.
