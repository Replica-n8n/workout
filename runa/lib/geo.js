/* =========================================================================
   Runa · géométrie de base

   Modules purs : aucune dépendance à `window`, aucune entrée-sortie. C'est
   ce qui permet de les tester avec `node --test` sans navigateur, et de les
   réutiliser tels quels si l'app finit un jour dans une coquille native.

   Un point est toujours `{ lat, lon }`, en degrés.
   ========================================================================= */

const R_TERRE = 6371008.8;   // rayon moyen, en mètres (IUGG)
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Distance en mètres entre deux points, formule de haversine. */
export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const lat1 = a.lat * RAD;
  const lat2 = b.lat * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cap initial de `a` vers `b`, en degrés, 0 = nord, sens horaire. */
export function capDeg(a, b) {
  const lat1 = a.lat * RAD, lat2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/** Le point atteint depuis `a` en parcourant `m` mètres au cap `cap`. */
export function destination(a, m, cap) {
  const d = m / R_TERRE;
  const t = cap * RAD;
  const lat1 = a.lat * RAD, lon1 = a.lon * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                         Math.cos(lat1) * Math.sin(d) * Math.cos(t));
  const lon2 = lon1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  // Ramener la longitude dans -180..180, sinon un point près de l'antiméridien
  // ressort à 190° et toutes les distances calculées ensuite sont fausses.
  return { lat: lat2 * DEG, lon: ((lon2 * DEG + 540) % 360) - 180 };
}

/**
 * Boîte englobante d'un disque, pour interroger Overpass.
 * La longitude se resserre avec la latitude : à Paris un degré de longitude
 * vaut environ 73 km, contre 111 km pour un degré de latitude. Diviser
 * naïvement par 111 320 dans les deux sens donnerait une boîte trop étroite
 * en est-ouest, et le graphe manquerait des rues au bord.
 */
export function bbox(centre, rayonM) {
  const dLat = (rayonM / R_TERRE) * DEG;
  const cos = Math.cos(centre.lat * RAD);
  const dLon = (rayonM / (R_TERRE * Math.max(cos, 1e-6))) * DEG;
  return {
    sud: centre.lat - dLat,
    ouest: centre.lon - dLon,
    nord: centre.lat + dLat,
    est: centre.lon + dLon
  };
}

/** Longueur cumulée d'une polyligne, en mètres. */
export function longueurM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

/**
 * Rayon du cercle sur lequel tirer les points intermédiaires d'une boucle de
 * `distanceM` mètres. Un cercle parfait de circonférence D a pour rayon
 * D / 2π, mais un itinéraire suit des rues et ne peut pas être un cercle : il
 * zigzague, donc il parcourt plus de mètres qu'il ne s'éloigne. Le facteur
 * corrige cette sinuosité ; il est ensuite ajusté par itération dans loop.js,
 * cette valeur n'est qu'un point de départ.
 */
export function rayonDepart(distanceM) {
  return (distanceM / (2 * Math.PI)) * 0.85;
}

/** Distance parcourue en `secondes` à l'allure `sParKm`. */
export function distancePour(secondes, sParKm) {
  return (secondes / sParKm) * 1000;
}
