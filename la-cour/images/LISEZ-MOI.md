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
