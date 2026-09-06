/* Un quartier en damier, fabriqué à la main.

   Tester le générateur sur une vraie extraction OSM ne prouverait pas
   grand-chose : on ne connaît pas la bonne réponse, donc on ne pourrait
   qu'observer que « ça a l'air correct ». Sur un damier régulier au pas de
   100 m, en revanche, la bonne réponse se calcule de tête : deux noeuds
   distants de 3 colonnes et 2 lignes sont à 500 m par la rue, et pas un
   mètre de moins.

   Les vraies données OSM servent ensuite, mais à autre chose : vérifier que
   le chargeur encaisse leurs bizarreries. Pas à vérifier un calcul. */

const R = 6371008.8, DEG = 180 / Math.PI;

/**
 * @param {object} [o]
 * @param {number} [o.cotes]      nombre de noeuds par côté
 * @param {number} [o.pasM]       espacement en mètres
 * @param {object} [o.tagsLigne]  tags par index de ligne, ex `{3: {highway:'primary'}}`
 * @param {object} [o.tagsCol]    idem par colonne
 * @param {number[]} [o.feux]     ids de noeuds à marquer highway=traffic_signals
 */
export function damier(o = {}) {
  const cotes = o.cotes ?? 21;
  const pas = o.pasM ?? 100;
  const lat0 = o.lat0 ?? 48.85;
  const lon0 = o.lon0 ?? 2.35;
  const feux = new Set(o.feux || []);

  const dLat = (pas / R) * DEG;
  const dLon = (pas / (R * Math.cos(lat0 * Math.PI / 180))) * DEG;

  const elements = [];
  const id = (r, c) => r * 1000 + c + 1;

  for (let r = 0; r < cotes; r++) {
    for (let c = 0; c < cotes; c++) {
      const n = {
        type: 'node', id: id(r, c),
        lat: lat0 + r * dLat, lon: lon0 + c * dLon
      };
      if (feux.has(n.id)) n.tags = { highway: 'traffic_signals' };
      elements.push(n);
    }
  }

  for (let r = 0; r < cotes; r++) {
    elements.push({
      type: 'way', id: 100000 + r,
      nodes: Array.from({ length: cotes }, (_, c) => id(r, c)),
      tags: { highway: 'residential', name: 'rue ' + r, ...(o.tagsLigne?.[r] || {}) }
    });
  }
  for (let c = 0; c < cotes; c++) {
    elements.push({
      type: 'way', id: 200000 + c,
      nodes: Array.from({ length: cotes }, (_, r) => id(r, c)),
      tags: { highway: 'residential', name: 'avenue ' + c, ...(o.tagsCol?.[c] || {}) }
    });
  }

  return {
    osm: { elements },
    id,
    pas,
    cotes,
    centre: { lat: lat0 + Math.floor(cotes / 2) * dLat, lon: lon0 + Math.floor(cotes / 2) * dLon },
    point: (r, c) => ({ lat: lat0 + r * dLat, lon: lon0 + c * dLon })
  };
}
