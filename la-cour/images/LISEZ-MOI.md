# Les images d'exercice

Ce dossier est **vide à dessein**. L'app fonctionne sans lui : si une image
manque, la fiche affiche le schéma dessiné de `js/figures.js`. Rien à
configurer, rien à déclarer.

## Comment ajouter une image

Dépose un fichier nommé d'après la clé du mouvement et son niveau :

```
images/push_h-3.jpg      pompes complètes
images/core-2.jpg        hollow hold genoux pliés
images/pull_s-4.jpg      Y-T-W avec pause
```

Formats acceptés : `.jpg`. L'app tente de charger l'image, et bascule sur le
dessin si elle n'existe pas. Aucune liste à tenir à jour.

⚠️ **`push_h-3.jpg` sert de témoin.** Au démarrage, l'app demande ce fichier
une fois pour savoir si le dossier contient des photos. S'il est absent, elle
n'en demandera aucune autre et affichera ses schémas, sans remplir la console
de 404. **Dépose-le en premier**, sinon les autres images resteront invisibles
même si elles sont là.

C'est le seul fichier qui a un rôle particulier. Une convention unique, plutôt
qu'une liste des images présentes qui finirait par se désynchroniser du
dossier.

Taille conseillée : **180 × 180**, ce qui pèse environ 8 Ko par image, soit
340 Ko pour les 42. Au-delà, on alourdit inutilement une app qui doit tenir
hors ligne.

## La liste d'achat

Le catalogue de [Gym Visual](https://gymvisual.com/) couvre les 42, avec des
noms exacts. Il faut **30 illustrations** seulement : les variantes de tempo
partagent l'image de leur mouvement de base.

À moins de 0,75 $ pièce au-delà de 10 dans le panier, cela représente
**environ 22 $**.

| Fichier à créer | Notre exercice | ID Gym Visual | Leur nom |
|---|---|---|---|
| `push_h-1.jpg` `push_h-2.jpg` | Pompes genoux au sol | **1182** | Push-up (on knees) |
| `push_h-3.jpg` | Pompes complètes | **0662** | Push-up |
| `push_h-4.jpg` | Pompes diamant | **0283** | Diamond Push-up |
| `push_h-5.jpg` | Pompes archer | **3294** | Archer Push up |
| `push_h-6.jpg` | Pompes pseudo-planche | **3300** | Lean planche |
| `pull-1.jpg` `pull-2.jpg` | Rowing sous table | **0499** | Inverted Row |
| `pull-3.jpg` | Rowing pieds surélevés | **2298** | Inverted Row on Bench |
| `pull-4.jpg` | Rowing une main | **1773** | One Arm Towel Row |
| `pull-5.jpg` | Traction négative | **7385** | Pull-up (negative) (male) |
| `pull-6.jpg` | Traction complète | **0652** | Pull-up |
| `pull_s-1.jpg` `pull_s-5.jpg` | Superman | **0804** | Superman |
| `pull_s-2.jpg` | Y-T-W, position Y | **6350** | Lying Prone Y Raise |
| `pull_s-3.jpg` `pull_s-6.jpg` | Reverse snow angel | **10045** | Snow Angel Face to Floor (male) |
| `pull_s-4.jpg` | Y-T-W, position T | **5041** | Lying Prone T |
| `push_v-1.jpg` `push_v-2.jpg` `push_v-3.jpg` | Pompes piquées | **2921** | Pike Push up |
| `push_v-4.jpg` `push_v-5.jpg` `push_v-6.jpg` | Appui mural | **0471** | Handstand Push-Up |
| `knee-1.jpg` `knee-2.jpg` | Squat | **0787** | Squat |
| `knee-3.jpg` | Fente marchée | **1460** | Walking Lunge |
| `knee-4.jpg` | Fente fendue | **0781** | Split Squat |
| `knee-5.jpg` | Squat une jambe assisté | **3747** | Assisted Pistol Squat with Bed Sheet |
| `knee-6.jpg` | Pistol complet | **0732** | Single Leg Squat (pistol) |
| `hip-1.jpg` `hip-2.jpg` | Pont fessier | **0145** | Butt Bridge |
| `hip-3.jpg` | Pont fessier une jambe | **0726** | Single Leg Bridge |
| `hip-4.jpg` | Charnière une jambe | **3928** | Bodyweight Single Leg Deadlift |
| `hip-5.jpg` `hip-6.jpg` | Curl ischio | **7746** | Nordic Hamstring Curl (male) |
| `core-1.jpg` | Planche | **0463** | Front Plank |
| `core-2.jpg` `core-3.jpg` | Hollow hold | **1246** | Hollow Hold |
| `core-4.jpg` | Hollow rock | **5649** | Hollow Rock (male) |
| `core-5.jpg` | Body saw | **2861** | Saw |
| `core-6.jpg` | Planche une main | **3983** | One Arm Front Plank |

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
