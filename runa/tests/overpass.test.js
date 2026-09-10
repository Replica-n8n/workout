import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requete, zoneCouvre, aireKm2, poidsEstime, OCTETS_PAR_KM2, MARGE_ZONE } from '../lib/overpass.js';
import { bbox, distanceM } from '../lib/geo.js';

/* Le rayon réellement demandé par l'app, recopié ici : si la formule change
   sans qu'on y pense, ces tests le disent. */
const rayonPour = d => Math.max(700, Math.min(2000, d / 5.5));

test('on ne télécharge pas beaucoup plus que le disque utile', () => {
  // ⚠️ Le vrai défaut, mesuré sur son téléphone : alignée sur une grille de
  // tuiles, la zone demandée couvrait jusqu'à QUATRE FOIS le disque, soit
  // 6,8 Mo au lieu de 2,3 sur un forfait mobile.
  for (const p of [{ lat: 45.523, lon: -73.58 }, { lat: 48.8566, lon: 2.3522 },
                   { lat: -33.86, lon: 151.2 }]) {
    for (const minutes of [20, 30, 45, 60]) {
      const cible = (minutes * 60 / 360) * 1000;
      const rayon = rayonPour(cible);
      // La marge de cache s'ajoute au rayon demande : on la compte dans la mesure.
      const rapport = aireKm2(bbox(p, rayon + MARGE_ZONE)) / (Math.PI * (rayon / 1000) ** 2);
      assert.ok(rapport < 1.9,
        `à ${p.lat},${p.lon} sur ${minutes} min : ${rapport.toFixed(1)} fois le disque`);
    }
  }
});

test('la boîte contient bien tout le disque', () => {
  const centre = { lat: 45.523, lon: -73.58 };
  const b = bbox(centre, 900);
  for (const cap of [0, 45, 90, 135, 180, 225, 270, 315]) {
    // Un point à 899 m dans n'importe quelle direction doit être dedans.
    const t = cap * Math.PI / 180;
    const p = { lat: centre.lat + Math.cos(t) * 899 / 111320,
                lon: centre.lon + Math.sin(t) * 899 / (111320 * Math.cos(centre.lat * Math.PI / 180)) };
    assert.ok(p.lat >= b.sud && p.lat <= b.nord && p.lon >= b.ouest && p.lon <= b.est,
      `le point à ${cap}° tombe hors de la boîte`);
  }
});

test('une zone mémorisée sert à tout disque qu’elle contient', () => {
  const zone = { lat: 45.5230, lon: -73.5800, rayon: 1059 };
  assert.ok(zoneCouvre(zone, { lat: 45.5230, lon: -73.5800 }, 909), 'le disque exact');
  assert.ok(zoneCouvre(zone, { lat: 45.5235, lon: -73.5805 }, 909), 'un départ 60 m plus loin');
  assert.ok(!zoneCouvre(zone, { lat: 45.5230, lon: -73.5800 }, 1200), 'un disque plus large');
  assert.ok(!zoneCouvre(zone, { lat: 45.5400, lon: -73.5800 }, 909), 'un quartier voisin');
  assert.ok(!zoneCouvre(null, { lat: 45.523, lon: -73.58 }, 909));
  assert.ok(!zoneCouvre({ lat: 45.523, lon: -73.58 }, { lat: 45.523, lon: -73.58 }, 909),
    'une entrée sans rayon ne couvre rien');
});

test('le tremblement du GPS ne fait plus jamais retélécharger', () => {
  // ⚠️ Une clé arrondie faisait basculer 27 relèves sur 40 quand le point
  // tombait près d'une frontière de la maille : arrondir ne supprime pas les
  // frontières, il les déplace. L'inclusion géométrique n'en a aucune.
  const p = { lat: 45.5235, lon: -73.5805 };
  const zone = { lat: p.lat, lon: p.lon, rayon: 909 + MARGE_ZONE };
  for (let i = 0; i < 200; i++) {
    const bruit = { lat: p.lat + (Math.random() - 0.5) * 30 / 111320,
                    lon: p.lon + (Math.random() - 0.5) * 30 / 78000 };
    assert.ok(zoneCouvre(zone, bruit, 909), 'une relève est tombée hors de la zone');
  }
});

test('le poids estimé tient debout', () => {
  // 650 Ko par km², mesuré sur Montréal (589) et Paris (718).
  const b = bbox({ lat: 45.523, lon: -73.58 }, 909);
  const mo = poidsEstime(b) / 1e6;
  assert.ok(mo > 1.5 && mo < 3.5, `${mo.toFixed(1)} Mo estimés pour un quartier de 30 min`);
  assert.equal(poidsEstime(b), aireKm2(b) * OCTETS_PAR_KM2);
});

test('la requête exclut les voies rapides et demande un délai serveur', () => {
  const q = requete({ sud: 45.5, ouest: -73.6, nord: 45.52, est: -73.58 });
  assert.match(q, /\[timeout:90\]/);
  assert.match(q, /motorway\|motorway_link\|trunk/);
  assert.match(q, /traffic_signals\|crossing/);
  // Les noeuds de géométrie sortent en `skel`, sans leurs tags : c'est ce qui
  // divise le poids de la réponse.
  assert.match(q, /out skel qt;/);
});

test('la requête ramène le contour des parcs, et seulement des parcs', () => {
  /* `lib/parc.js` a besoin du contour pour faire le tour d'un parc. Sans
     cette ligne, la carte « Au parc » ne s'afficherait jamais, sans que rien
     ne le signale. */
  const q = requete({ sud: 45.5, ouest: -73.6, nord: 45.52, est: -73.58 });
  assert.match(q, /way\["leisure"="park"\]\["name"\]\([^)]*\);\s*out tags geom qt;/);
  /* Et la géométrie ne vaut QUE pour les parcs : la demander pour les
     commerces ou les stations alourdirait la réponse pour rien. */
  assert.equal((q.match(/out tags geom/g) || []).length, 1);
});
