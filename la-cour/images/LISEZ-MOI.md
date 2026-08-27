# Les images d'exercice

Ce dossier est **vide à dessein**. L'app fonctionne sans lui : si une image
manque, la fiche affiche le schéma dessiné de `js/figures.js`. Rien à
configurer, rien à déclarer.

## Comment ajouter une image

Dépose un fichier nommé d'après la clé du mouvement et son niveau :

```
images/push_h-3.png      pompes complètes
images/core-2.png        hollow hold genoux pliés
images/pull_s-4.png      Y-T-W avec pause
```

Format : **`.png`**, parce que Gym Visual livre des PNG à fond transparent et
que le fond sombre de l'app passe alors au travers, sans rectangle blanc. L'app tente de charger l'image, et bascule sur le
dessin si elle n'existe pas. Aucune liste à tenir à jour.

⚠️ **`push_h-3.png` sert de témoin.** Au démarrage, l'app demande ce fichier
une fois pour savoir si le dossier contient des photos. S'il est absent, elle
n'en demandera aucune autre et affichera ses schémas, sans remplir la console
de 404. **Dépose-le en premier**, sinon les autres images resteront invisibles
même si elles sont là.

C'est le seul fichier qui a un rôle particulier. Une convention unique, plutôt
qu'une liste des images présentes qui finirait par se désynchroniser du
dossier.

## Quelle taille prendre

Un achat livre **trois résolutions** : 480 × 320, 1024 × 768, et l'originale.
Prends la **480 × 320** et redimensionne-la si besoin : la fiche l'affiche à
280 px de large au maximum, et une app hors ligne n'a pas à transporter du
1024 pixels.

⚠️ Ne pas confondre deux régimes que j'avais mélangés :

- **achat** : tu reçois les trois tailles, aucune limite de résolution ;
- **permission gratuite** à la manière du dépôt cité plus bas : plafonnée à
  **180 × 180** et attribution obligatoire.

## La liste d'achat

Le catalogue de [Gym Visual](https://gymvisual.com/) couvre les 42, avec des
noms exacts. Il faut **30 illustrations** seulement : les variantes de tempo
partagent l'image de leur mouvement de base.

**La grille de remise, relevée sur la fiche produit :** 3,00 $ l'unité, et
**75 % de remise dès 5 articles différents dans le panier**, soit 0,75 $ pièce.
Pour 30 illustrations : 90 $ moins 75 %, donc **22,50 $**.

Le bandeau du site annonce « less than $0.75 after 10 items ». Le tableau de
remise de la fiche, lui, donne le seuil réel : **5**.

| Fichier à créer | Notre exercice | ID Gym Visual | Leur nom |
|---|---|---|---|
| `push_h-1.png` `push_h-2.png` | Pompes genoux au sol | **1182** | Push-up (on knees) |
| `push_h-3.png` | Pompes complètes | **0662** | Push-up |
| `push_h-4.png` | Pompes diamant | **0283** | Diamond Push-up |
| `push_h-5.png` | Pompes archer | **3294** | Archer Push up |
| `push_h-6.png` | Pompes pseudo-planche | **3300** | Lean planche |
| `pull-1.png` `pull-2.png` | Rowing sous table | **0499** | Inverted Row |
| `pull-3.png` | Rowing pieds surélevés | **2298** | Inverted Row on Bench |
| `pull-4.png` | Rowing une main | **1773** | One Arm Towel Row |
| `pull-5.png` | Traction négative | **7385** | Pull-up (negative) (male) |
| `pull-6.png` | Traction complète | **0652** | Pull-up |
| `pull_s-1.png` `pull_s-5.png` | Superman | **0804** | Superman |
| `pull_s-2.png` | Y-T-W, position Y | **6350** | Lying Prone Y Raise |
| `pull_s-3.png` `pull_s-6.png` | Reverse snow angel | **10045** | Snow Angel Face to Floor (male) |
| `pull_s-4.png` | Y-T-W, position T | **5041** | Lying Prone T |
| `push_v-1.png` `push_v-2.png` `push_v-3.png` | Pompes piquées | **2921** | Pike Push up |
| `push_v-4.png` `push_v-5.png` `push_v-6.png` | Appui mural | **0471** | Handstand Push-Up |
| `knee-1.png` `knee-2.png` | Squat | **0787** | Squat |
| `knee-3.png` | Fente marchée | **1460** | Walking Lunge |
| `knee-4.png` | Fente fendue | **0781** | Split Squat |
| `knee-5.png` | Squat une jambe assisté | **3747** | Assisted Pistol Squat with Bed Sheet |
| `knee-6.png` | Pistol complet | **0732** | Single Leg Squat (pistol) |
| `hip-1.png` `hip-2.png` | Pont fessier | **0145** | Butt Bridge |
| `hip-3.png` | Pont fessier une jambe | **0726** | Single Leg Bridge |
| `hip-4.png` | Charnière une jambe | **3928** | Bodyweight Single Leg Deadlift |
| `hip-5.png` `hip-6.png` | Curl ischio | **7746** | Nordic Hamstring Curl (male) |
| `core-1.png` | Planche | **0463** | Front Plank |
| `core-2.png` `core-3.png` | Hollow hold | **1246** | Hollow Hold |
| `core-4.png` | Hollow rock | **5649** | Hollow Rock (male) |
| `core-5.png` | Body saw | **2861** | Saw |
| `core-6.png` | Planche une main | **3983** | One Arm Front Plank |

Les 30 identifiants, à copier dans leur recherche :

```
0145 0283 0463 0471 0499 0652 0662 0726 0732 0781
0787 0804 1182 1246 1460 1773 2298 2861 2921 3294
3300 3747 3928 3983 5041 5649 6350 7385 7746 10045
```

## Les 30 fiches produit, à vérifier avant d'acheter

La recherche du site attend le paramètre `search_query`, pas `s` :
`https://gymvisual.com/search?controller=search&search_query=0145`

| ID | Nom | Illustration | GIF animé |
|---|---|---|---|
| **0145** | Butt Bridge | [voir](https://gymvisual.com/illustrations/165-butt-bridge.html) | [voir](https://gymvisual.com/animated-gifs/4398-butt-bridge.html) |
| **0283** | Diamond Push-up | [voir](https://gymvisual.com/illustrations/303-diamond-push-up.html) | [voir](https://gymvisual.com/animated-gifs/1776-diamond-push-up.html) |
| **0463** | Front Plank | [voir](https://gymvisual.com/illustrations/483-front-plank.html) | [voir](https://gymvisual.com/animated-gifs/4401-front-plank-male.html) |
| **0471** | Handstand Push-Up | [voir](https://gymvisual.com/illustrations/491-handstand-push-up.html) | [voir](https://gymvisual.com/animated-gifs/1970-handstand-push-up.html) |
| **0499** | Inverted Row | [voir](https://gymvisual.com/illustrations/519-inverted-row.html) | [voir](https://gymvisual.com/animated-gifs/1998-inverted-row.html) |
| **0652** | Pull-up | [voir](https://gymvisual.com/illustrations/672-pull-up.html) | [voir](https://gymvisual.com/animated-gifs/2145-pull-up.html) |
| **0662** | Push-up | [voir](https://gymvisual.com/illustrations/682-push-up.html) | [voir](https://gymvisual.com/animated-gifs/2155-push-up-m.html) |
| **0726** | Single Leg Bridge | [voir](https://gymvisual.com/illustrations/746-single-leg-bridge.html) | [voir](https://gymvisual.com/animated-gifs/4415-single-leg-bridge.html) |
| **0732** | Single Leg Squat (pistol) | [voir](https://gymvisual.com/illustrations/752-single-leg-squat-pistol.html) | [voir](https://gymvisual.com/animated-gifs/2216-single-leg-squat-pistol.html) |
| **0781** | Split Squat | [voir](https://gymvisual.com/illustrations/801-split-squat.html) | [voir](https://gymvisual.com/animated-gifs/2264-split-squat.html) |
| **0787** | Squat | [voir](https://gymvisual.com/illustrations/807-squat.html) | [voir](https://gymvisual.com/animated-gifs/2270-squat.html) |
| **0804** | Superman | [voir](https://gymvisual.com/illustrations/824-superman.html) | [voir](https://gymvisual.com/animated-gifs/2286-superman.html) |
| **1182** | Push-up (on knees) | [voir](https://gymvisual.com/illustrations/1331-push-up-on-knees.html) | [voir](https://gymvisual.com/animated-gifs/2635-push-up-on-knees.html) |
| **1246** | Hollow Hold | [voir](https://gymvisual.com/illustrations/1463-hollow-hold.html) | [voir](https://gymvisual.com/animated-gifs/4440-hollow-hold.html) |
| **1460** | Walking Lunge | [voir](https://gymvisual.com/illustrations/3006-walking-lunge.html) | [voir](https://gymvisual.com/animated-gifs/3207-walking-lunge-male.html) |
| **1773** | One Arm Towel Row | [voir](https://gymvisual.com/illustrations/3805-one-arm-towel-row.html) | [voir](https://gymvisual.com/animated-gifs/3813-one-arm-towel-row.html) |
| **2298** | Inverted Row on Bench | [voir](https://gymvisual.com/illustrations/4920-inverted-row-on-bench.html) | [voir](https://gymvisual.com/animated-gifs/4949-inverted-row-on-bench.html) |
| **2861** | Saw | [voir](https://gymvisual.com/illustrations/6249-saw.html) | [voir](https://gymvisual.com/animated-gifs/6365-saw-female.html) |
| **2921** | Pike Push up | [voir](https://gymvisual.com/illustrations/6408-pike-push-up.html) | [voir](https://gymvisual.com/animated-gifs/6735-pike-push-up.html) |
| **3294** | Archer Push up | [voir](https://gymvisual.com/illustrations/7397-archer-push-up.html) | [voir](https://gymvisual.com/animated-gifs/7188-archer-push-up.html) |
| **3300** | Lean planche | [voir](https://gymvisual.com/illustrations/7403-lean-planche.html) | [voir](https://gymvisual.com/animated-gifs/7194-lean-planche.html) |
| **3747** | Assisted Pistol Squat with Bed Sheet | [voir](https://gymvisual.com/illustrations/8594-assisted-pistol-squat-with-bed-sheet.html) | [voir](https://gymvisual.com/animated-gifs/9945-assisted-pistol-squat-with-bed-sheet.html) |
| **3928** | Bodyweight Single Leg Deadlift | [voir](https://gymvisual.com/illustrations/12895-bodyweight-single-leg-deadlift.html) | [voir](https://gymvisual.com/animated-gifs/12973-bodyweight-single-leg-deadlift.html) |
| **3983** | One Arm Front Plank | [voir](https://gymvisual.com/illustrations/9259-one-arm-front-plank.html) | [voir](https://gymvisual.com/animated-gifs/10071-one-arm-front-plank.html) |
| **5041** | Lying Prone T | [voir](https://gymvisual.com/illustrations/13599-lying-prone-t.html) | [voir](https://gymvisual.com/animated-gifs/13651-lying-prone-t.html) |
| **5649** | Hollow Rock (male) | [voir](https://gymvisual.com/illustrations/16394-hollow-rock-male.html) | [voir](https://gymvisual.com/animated-gifs/16423-hollow-rock-male.html) |
| **6350** | Lying Prone Y Raise | [voir](https://gymvisual.com/illustrations/18412-lying-prone-y-raise.html) | [voir](https://gymvisual.com/animated-gifs/18420-lying-prone-y-raise.html) |
| **7385** | Pull-up (negative) (male) | [voir](https://gymvisual.com/illustrations/19413-pull-up-negative-male.html) | [voir](https://gymvisual.com/animated-gifs/19632-pull-up-negative-male.html) |
| **7746** | Nordic Hamstring Curl (male) | [voir](https://gymvisual.com/illustrations/18416-nordic-hamstring-curl-male.html) | [voir](https://gymvisual.com/animated-gifs/18424-nordic-hamstring-curl-male.html) |
| **10045** | Snow Angel Face to Floor (male) | [voir](https://gymvisual.com/illustrations/22274-snow-angel-face-to-floor-male.html) | [voir](https://gymvisual.com/animated-gifs/21919-snow-angel-face-to-floor-male.html) |

## Avant de déposer quoi que ce soit ici

Ces images ne sont pas libres. Leur licence autorise l'usage en application
mais **interdit la redistribution**, et ce dépôt est public : n'importe qui
peut télécharger un fichier depuis GitHub.

Le dépôt [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
redistribue ces mêmes images sur GitHub, mais avec une **permission écrite
séparée** obtenue auprès de Gym Visual, limitée à 180 × 180 et assortie d'une
attribution obligatoire. Son propre avis le dit sans détour : *cloning this
repo is not a license*.

Deux façons de faire les choses proprement :

1. **Demander la même permission** à Gym Visual, en citant ce précédent. Elle
   est gratuite et couvre explicitement le cas d'un dépôt public.
2. **Acheter la licence** et poser la question du dépôt public avant de
   déposer les fichiers ici.

Tant que l'un des deux n'est pas réglé, ce dossier reste vide et l'app affiche
ses schémas. Elle marche très bien comme ça.

## Attribution

Si des images de Gym Visual finissent ici, l'écran Réglages doit porter la
mention exigée :

> © Gym visual — https://gymvisual.com/
