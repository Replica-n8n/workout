import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decouper, nommer, nommerBrut, rueParRue, phraseDesFeux,
  ageEnMots, ageEnPhrase, message, texteDuPartage, decrireBoucle
} from '../lib/phrases.js';

const sansBalises = h => h.replace(/<[^>]+>/g, '');
const MIN = 60000;

/* ------------------------------------------------------- noms de rues */

test('le type de voie prend son article, élidé devant une voyelle', () => {
  assert.equal(nommerBrut('Rue Saint-Denis'), 'la rue Saint-Denis');
  assert.equal(nommerBrut('Boulevard Saint-Laurent'), 'le boulevard Saint-Laurent');
  assert.equal(nommerBrut('Avenue du Mont-Royal Est'), 'l’avenue du Mont-Royal Est');
  assert.equal(nommerBrut('Allée des Frênes'), 'l’allée des Frênes');
});

test('un nom sans type de voie reconnu reste tel quel', () => {
  /* « par la Main » serait inventé : on ne sait pas quel article prend un
     nom qu'on ne reconnaît pas. */
  assert.equal(nommerBrut('Saint-Laurent'), 'Saint-Laurent');
  assert.equal(nommer('Saint-Laurent'), '<b>Saint-Laurent</b>');
  assert.deepEqual(decouper(''), { article: '', type: '', reste: '' });
});

test('les deux façons de nommer disent la même chose', () => {
  for (const nom of ['Rue Gounod', 'Avenue De Chateaubriand', 'Boulevard Crémazie Est',
                     'Place Jarry', 'Villeray', 'Côte-des-Neiges']) {
    assert.equal(sansBalises(nommer(nom)), nommerBrut(nom), nom);
  }
});

test('le nom venu d’OSM est échappé en HTML, et seulement en HTML', () => {
  assert.equal(nommer('Rue Prince & Duc'), 'la rue <b>Prince &amp; Duc</b>');
  assert.ok(!nommer('Rue <img src=x>').includes('<img'));
  /* Le texte pur part dans un aria-label ou un partage : l'échapper y
     afficherait « &amp; » en toutes lettres. */
  assert.equal(nommerBrut('Rue Prince & Duc'), 'la rue Prince & Duc');
});

test('rue par rue : l’amorce a sa flèche, et le retour au départ ne se répète pas', () => {
  const h = rueParRue([
    { nom: 'Rue Gounod', approche: true },
    { nom: 'Rue Berri' }, { nom: 'Rue Villeray' }, { nom: 'Rue Gounod' }
  ]);
  assert.equal(sansBalises(h), '→ Gounod › Berri › Villeray');
  assert.equal((h.match(/class="vers"/g) || []).length, 1);
  // Une seule étape : rien à retirer.
  assert.equal(sansBalises(rueParRue([{ nom: 'Rue Gounod' }])), 'Gounod');
  // Et le nom est échappé.
  assert.ok(rueParRue([{ nom: 'Rue <b>' }]).includes('&lt;b&gt;'));
});

/* ---------------------------------------------------------------- feux */

test('un compte inconnu ne devient jamais « aucun feu »', () => {
  /* Le mensonge corrigé en 1.1.0 : un parcours reçu par lien annonçait
     « aucun feu » là où l'on s'arrêtait quinze fois. */
  assert.equal(phraseDesFeux(null), '');
  assert.equal(phraseDesFeux(undefined), '');
  assert.equal(phraseDesFeux(0), '<b>aucun feu</b>');
  assert.equal(phraseDesFeux(1), '<b>1 feu</b>');
  assert.equal(phraseDesFeux(16), '<b>16 feux</b>');
});

/* -------------------------------------------------------------- le temps */

test('l’âge d’un départ, de l’instant aux jours', () => {
  assert.equal(ageEnMots(0), "à l'instant");
  assert.equal(ageEnMots(1 * MIN), "à l'instant");
  assert.equal(ageEnMots(15 * MIN), 'il y a 15 min');
  assert.equal(ageEnMots(3 * 60 * MIN), 'il y a 3 h');
  assert.equal(ageEnMots(24 * 60 * MIN), 'hier');
  assert.equal(ageEnMots(3 * 24 * 60 * MIN), 'il y a 3 jours');
});

test('la position d’un parcours reçu ne se date plus au-delà d’un jour', () => {
  const t = 1_800_000_000_000;
  assert.equal(ageEnPhrase(t, t), 'à l’instant');
  assert.equal(ageEnPhrase(t - 20 * MIN, t), 'il y a 20 min');
  assert.equal(ageEnPhrase(t - 5 * 60 * MIN, t), 'il y a 5 h');
  assert.equal(ageEnPhrase(t - 3 * 24 * 60 * MIN, t), 'hier ou avant');
  // Sans `maintenant`, c'est l'heure du téléphone.
  assert.equal(ageEnPhrase(Date.now()), 'à l’instant');
});

/* ------------------------------------------------------------ les erreurs */

test('sans position, le message dit quoi faire', () => {
  /* Sans position l'app est un cul-de-sac : il faut nommer le bouton qui
     en sort. */
  assert.match(message({ code: 1 }), /« Ma position »/);
});

test('chaque panne connue a sa phrase, jamais le repli technique', () => {
  const pannes = [{ code: 2 }, { code: 3 }, ...['debit', 'silence', 'bloque', 'http 504',
    'desert', 'rien', 'reseau'].map(m => new Error(m))];
  const vues = new Set();
  for (const e of pannes) {
    const m = message(e);
    assert.ok(!m.startsWith('Échec'), `${e.message || e.code} tombe dans le repli`);
    vues.add(m);
  }
  assert.equal(vues.size, pannes.length, 'deux pannes disent la même chose');
  assert.match(message(new Error('http 429')), /\(http 429\)/);
});

test('une panne inconnue se dit quand même, sans planter', () => {
  assert.equal(message(new Error('bizarre')), 'Échec : bizarre');
  assert.equal(message(null), 'Échec : inconnu');
  assert.equal(message(undefined), 'Échec : inconnu');
});

/* ------------------------------------------------------------- partager */

test('le texte du partage dit d’où l’on vient, en texte pur', () => {
  const b = { m: 6120, rues: [{ nom: 'Rue Prince & Duc' }] };
  assert.equal(texteDuPartage(b, null, null), 'Ma boucle du jour : 6,12 km, par la rue Prince & Duc.');
  assert.equal(texteDuPartage(b, { lat: 0, lon: 0 }, { nom: 'Gounod et Berri' }),
    'Je cours une boucle de 6,12 km. Je suis au coin de Gounod et Berri.');
  assert.equal(texteDuPartage(b, { lat: 0, lon: 0 }, null),
    'Je cours une boucle de 6,12 km, par la rue Prince & Duc. Voici où j\'en suis.');
  // Une boucle sans rue connue ne fabrique pas de « par undefined ».
  assert.equal(texteDuPartage({ m: 5000 }, null, null), 'Ma boucle du jour : 5,00 km.');
});

/* --------------------------------------------------- la carte d'une boucle */

const ORDINAIRE = { m: 6120, feux: 4, fractionEclairee: 1, score: null,
                    rues: [{ nom: 'Rue Gounod' }] };

test('une boucle ordinaire : sa rue, ses feux, sa durée', () => {
  const { html, aria } = decrireBoucle(ORDINAIRE, { rue: ORDINAIRE.rues[0], minutes: 37 });
  assert.equal(sansBalises(html), '6.12 kmpar la rue Gounod4 feux · 37 min');
  assert.equal(aria, 'Boucle de 6.12 kilomètres, la rue Gounod, 4 feux, environ 37 minutes');
});

test('une boucle reçue par lien ne prétend rien sur les feux', () => {
  const recu = { m: 5000, feux: null, fractionEclairee: null, score: null, rues: [] };
  const { html, aria } = decrireBoucle(recu, { rue: null, minutes: 30 });
  for (const t of [sansBalises(html), aria]) {
    assert.ok(!/feu/.test(t), t);
    assert.ok(!/éclair/.test(t), `l'éclairage inconnu d'un lien n'a pas à être annoncé : ${t}`);
  }
});

test('la carte et le lecteur d’écran annoncent le même nombre de feux', () => {
  /* Le lecteur d'écran disait « 0 feu » là où la carte écrit « aucun feu ». */
  for (const feux of [0, 1, 7]) {
    const { html, aria } = decrireBoucle({ ...ORDINAIRE, feux }, { rue: null, minutes: 30 });
    const ecrit = sansBalises(html).match(/(aucun feu|\d+ feux?)/)[1];
    assert.ok(aria.includes(ecrit), `${feux} : « ${ecrit} » absent de « ${aria} »`);
  }
});

test('l’éclairage ne parle que quand il apprend quelque chose', () => {
  const dire = (b, nuit) => sansBalises(decrireBoucle(b, { rue: null, minutes: 30, nuit }).html);
  assert.ok(!dire(ORDINAIRE, false).includes('éclair'), '100 % éclairé, de jour : se taire');
  assert.ok(dire(ORDINAIRE, true).includes('100 % éclairé'), 'la nuit, le dire');
  assert.ok(dire({ ...ORDINAIRE, fractionEclairee: 0.6 }, false).includes('60 % éclairé'));
  assert.ok(dire({ ...ORDINAIRE, fractionEclairee: null }, false).includes('éclairage inconnu'));
});

test('le tour du parc : le parc d’abord, ses tours, et des feux tous sur l’accès', () => {
  const parc = { m: 6090, feux: 16, feuxDansLeParc: 0, fractionEclairee: 1, score: null,
                 genre: 'parc', parc: 'Parc Jarry', tours: 2, tourM: 2620,
                 etapes: [{ nom: 'Rue Gounod', approche: true }, { nom: 'Rue Faillon Est' }] };
  const { html, aria } = decrireBoucle(parc, { rue: null, minutes: 36 });
  const t = sansBalises(html);
  assert.ok(t.startsWith('6.09 kmAu parcParc Jarry, par → Gounod › Faillon'), t);
  assert.ok(t.includes('16 feux, tous sur l’accès'), t);
  assert.ok(t.includes('2 tours de 2,62 km'), t);
  assert.ok(aria.startsWith('Au parc, Parc Jarry, Boucle de 6.09 kilomètres, par la rue Gounod, puis la rue Faillon Est'), aria);
  assert.ok(aria.includes(', 2 tours'), aria);
  assert.ok(aria.includes('16 feux, tous sur l’accès'), aria);
});

test('des feux DANS le parc ne sont pas dits « tous sur l’accès »', () => {
  const parc = { m: 6000, feux: 3, feuxDansLeParc: 1, genre: 'parc', parc: 'Parc X',
                 fractionEclairee: 1, score: null };
  const { html, aria } = decrireBoucle(parc, { rue: null, minutes: 36 });
  assert.ok(!html.includes('accès') && !aria.includes('accès'));
});

test('le parcours à retenir se décrit par sa suite de rues', () => {
  const simple = { m: 5980, feux: 0, fractionEclairee: 1, score: null, genre: 'simple',
                   tours: 1, rues: [{ nom: 'Rue Gounod' }],
                   etapes: [{ nom: 'Rue Gounod' }, { nom: 'Rue Berri' }, { nom: 'Rue Gounod' }] };
  const { html, aria } = decrireBoucle(simple, { rue: simple.rues[0], minutes: 35 });
  const t = sansBalises(html);
  assert.ok(t.includes('À retenir'), t);
  assert.ok(t.includes('Gounod › Berri'), t);
  assert.ok(!t.includes('la rue Gounod'), 'la suite de rues remplace la rue principale');
  assert.ok(!t.includes('tours'), 'un seul tour ne s’annonce pas');
  assert.ok(aria.startsWith('Parcours à retenir, '), aria);
});

test('un nom de parc hostile ne fabrique pas de balise', () => {
  const b = { m: 5000, feux: 0, genre: 'parc', parc: '<img src=x onerror=alert(1)>',
              fractionEclairee: 1, score: null };
  assert.ok(!decrireBoucle(b, { rue: null, minutes: 30 }).html.includes('<img'));
});

test('le score n’apparaît que s’il a été calculé', () => {
  const sans = decrireBoucle(ORDINAIRE, { rue: null, minutes: 30 }).html;
  assert.ok(!sans.includes('class="score"'));
  const avec = decrireBoucle({ ...ORDINAIRE, score: '+0,4 km²' }, { rue: null, minutes: 30 });
  assert.ok(avec.html.includes('<span class="score">+0,4 km²</span>'));
  assert.ok(avec.aria.endsWith(', +0,4 km²'));
});
