# Workout

Applications d'entraînement, une par dossier. Vanilla JS, aucune dépendance,
aucun outil de build. Chaque app est une PWA autonome qui fonctionne hors ligne.

| Dossier | App | Quoi |
|---|---|---|
| [`la-cour/`](la-cour/) | **La Cour** | Calisthénie au poids de corps, dérivée de l'entraînement des prisons mexicaines et corrigée selon la littérature actuelle sur l'hypertrophie. |

## Ajouter une app

Créer un dossier à la racine, avec sa propre `index.html`, son
`manifest.webmanifest` et son `sw.js`. Les portées des service workers ne se
chevauchent pas : chaque app est isolée dans son sous-chemin. Ajouter ensuite
une ligne dans le tableau ci-dessus et une carte dans l'`index.html` racine.

---

## La Cour

### Le principe

Une seule série est visible à la fois. Tu la fais, tu valides, elle descend
dans les séries faites et s'efface. La suivante apparaît **verrouillée**, avec
le compte à rebours du repos posé dessus, et s'ouvre à zéro.

### Trois mots, et pas un de plus

- **Niveau** : la difficulté d'un mouvement, de 1 à 6. La seule chose qui progresse.
- **Série** : un bloc de répétitions suivi d'un repos.
- **Le Croisé** : le finisher, le vendredi seulement, ajouté à la fin de la séance.

### Niveaux, unités, alternance

**L'unité est portée par le niveau, pas par le mouvement.** Un Superman se tient
en secondes, mais le Y-T-W du niveau juste au-dessus se compte en répétitions ;
au gainage, la planche est une tenue alors que le hollow rock est un mouvement.
Chaque niveau déclare donc `reps` ou `sec`, et le seuil de montée suit : 12
répétitions, ou 45 secondes pour une tenue. Les records personnels sont gardés
**par niveau**, puisque 45 secondes de planche et 12 hollow rocks ne se
comparent pas.

**Le niveau se règle à la main** dans l'écran Progression, avec moins et plus :
la montée automatique convient à un débutant, pas à quelqu'un qui arrive avec du
bagage.

**L'alternance A/B est un défaut, pas une contrainte.** Un bouton sur l'accueil
bascule sur l'autre séance ; l'alternance reprend d'elle-même ensuite.

### Le programme

Deux séances complètes en alternance, A puis B, 3 à 4 fois par semaine. Six
mouvements, six niveaux chacun. Une seule règle de progression : **3 séries de
12 répétitions propres en gardant 2 répétitions en réserve font monter d'un
niveau**.

Le Croisé reprend la double échelle inversée de la vidéo d'origine
(`20 / 1 / 19 / 2 … 11 / 10`, soit 210 répétitions en 20 séries), mais comme
destination et non comme point de départ : on entre à 8 séries et on ajoute
2 séries à chaque fois qu'on boucle la séquence en amplitude complète.

### Ce qui a été corrigé par rapport à la vidéo

| | Vidéo d'origine | Ici |
|---|---|---|
| Progression | Aller plus vite | 6 niveaux de difficulté par mouvement |
| Repos | 5 secondes | 2 min 30 dans la séance, 18 s dans Le Croisé |
| Volume | 210 reps dont la moitié inutile | 3 à 4 séries à 1 ou 2 reps de la limite |
| Amplitude | Demi-répétitions | Complète par défaut |

Sources des corrections : Schoenfeld et al. 2016 (repos long supérieur au repos
court chez l'entraîné), Pedrosa 2022, Kassiano 2023 et Wolf 2023 (les partielles
ne fonctionnent qu'en position allongée du muscle).

### Le tirage, et pourquoi il y a deux variantes

Aucun exercice au sol ne charge le dos et les biceps : tirer suppose quelque
chose à tirer. En prison ce n'est pas un problème, le lit superposé, les
barreaux et le chambranle servent d'ancrage. Le « aucun matériel » de la vidéo
parle de zéro *poids*, pas de zéro *objet*.

L'app propose donc, dans les réglages :

- **Avec une table** (par défaut) : rowing sous une table solide. C'est
  l'équivalent du dessous de lit superposé, rien à acheter, et le pattern de
  tirage est complet.
- **Rien du tout** : le sol seul. Le tirage est remplacé par de la chaîne
  postérieure haute, qui tient la posture mais ne construit ni dos ni biceps.
  Le programme devient dominant en poussée, et c'est dit dans l'écran de réglages.

### Structure des fichiers

```
la-cour/
  index.html            les quatre écrans, en HTML statique
  css/app.css           thème sombre unique, assumé
  js/data.js            catalogue : mouvements, niveaux, séances, Le Croisé
  js/store.js           localStorage et règles métier
  js/app.js             machine à états de la séance et rendu
  manifest.webmanifest
  sw.js                 cache hors ligne
  icons/                générées, voir plus bas
```

### Cache et versions

**Le numéro de version ne vit qu'à un seul endroit : la constante `VERSION` en
haut de `sw.js`.** La changer suffit à invalider tout le cache, parce que le nom
du cache en dérive et que l'ancien est supprimé à l'activation. Il n'y a aucun
paramètre `?v=...` à répercuter dans le HTML, le CSS ou les modules.

`window.LACOUR_VERSION` dans `index.html` sert uniquement à l'affichage dans
l'écran de réglages, et n'a aucun effet sur le cache.

### Les icônes

Générées par un encodeur PNG en Python pur, sans dépendance. Le motif est la
séquence du Croisé elle-même : des barres horizontales dont les longues
rétrécissent pendant que les courtes grandissent, jusqu'à se rejoindre.

Pour les régénérer, voir `tools/mkicons.py`.

### Contraintes techniques respectées

- **Hors ligne d'abord.** Aucun appel réseau pendant une séance. Tout en
  `localStorage`.
- **Chrono fiable en arrière-plan.** L'échéance du repos est stockée comme
  timestamp absolu, pas comme un compteur : un `setInterval` est gelé dès que
  l'écran s'éteint, un timestamp non.
- **Écran allumé** via la Wake Lock API, réacquis au retour de veille, relâché
  à la fin de la séance.
- **Fin de repos audible** : vibration plus bip WebAudio, le téléphone est dans
  la poche.
- **Jamais de clavier.** Le nombre de répétitions est pré-rempli avec ta
  dernière performance et réglable par pas bornés à ± 10. Une valeur aberrante
  est donc impossible à saisir, ce qui protège la règle de montée de niveau.
- **Séance interrompue reprise.** L'état de la séance en cours est persisté à
  chaque validation.

### Développement

Aucun build. Les modules ES imposent un serveur, `file://` ne suffit pas :

```bash
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080/la-cour/`.

---

Programmes d'entraînement à titre informatif. Ils ne remplacent pas l'avis d'un
médecin ou d'un kinésithérapeute, en particulier en cas de douleur articulaire,
de blessure récente ou de reprise après une longue interruption.
