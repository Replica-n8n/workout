/* =========================================================================
   Runa · le chargement des rues

   Overpass est lent et sévèrement limité en débit. Les rues, elles, ne
   bougent quasiment pas. Tout ce qui est téléchargé est donc gardé par
   tuile fixe dans IndexedDB : le deuxième départ depuis le même quartier ne
   demande rien au réseau, et fonctionne hors ligne.
   ========================================================================= */

import { requete, tuilesPour, cleTuile, boiteDeTuile, fusionner } from '../lib/overpass.js';

const BASE = 'runa-osm';
const MAGASIN = 'tuiles';
const PEREMPTION = 30 * 24 * 3600 * 1000;   // 30 jours, comme la spec

/* Deux serveurs : le principal tombe régulièrement en limite de débit, et
   se retrouver bloqué en pleine ville sans deuxième porte serait bête. */
const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

/* Une SEULE connexion, réutilisée. En ouvrir une par lecture et par écriture
   marche, mais chaque connexion laissée ouverte bloque ensuite toute montée
   de version de la base : la mise à jour reste en attente indéfiniment, sans
   erreur, et l'app paraît figée au prochain déploiement du schéma. */
let connexion = null;

function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(MAGASIN)) r.result.createObjectStore(MAGASIN);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { connexion = null; ko(r.error); };
  });
  return connexion;
}

async function lire(cle) {
  const db = await ouvrir();
  return new Promise((ok) => {
    const t = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(cle);
    t.onsuccess = () => {
      const v = t.result;
      if (!v) return ok(null);
      if (Date.now() - v.date > PEREMPTION) return ok(null);
      ok(v.osm);
    };
    t.onerror = () => ok(null);
  });
}

async function ecrire(cle, osm) {
  const db = await ouvrir();
  return new Promise((ok) => {
    const t = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN);
    t.put({ osm, date: Date.now() }, cle);
    t.transaction.oncomplete = () => ok(true);
    t.transaction.onerror = () => ok(false);   // un cache plein ne doit rien casser
  });
}

/* Une requête Overpass saturée ne répond pas : elle attend, connexion
   ouverte, parfois plusieurs minutes. Sans limite de temps, l'app reste
   bloquée sur « téléchargement » sans que rien ne le dise. */
const DELAI_MAX = 45000;

async function telecharger(boite, signal) {
  const corps = requete(boite);
  let derniereErreur = null;

  for (const url of SERVEURS) {
    const minuteur = new AbortController();
    const stop = setTimeout(() => minuteur.abort(), DELAI_MAX);
    const annuler = () => minuteur.abort();
    signal && signal.addEventListener('abort', annuler);
    try {
      const rep = await fetch(url, { method: 'POST', body: corps, signal: minuteur.signal });
      if (rep.status === 429 || rep.status === 504) { derniereErreur = new Error('debit'); continue; }
      if (!rep.ok) { derniereErreur = new Error('http ' + rep.status); continue; }
      return await rep.json();
    } catch (e) {
      if (signal && signal.aborted) throw e;
      // Un abandon par expiration de délai n'est pas une panne du serveur
      // suivant : on tente l'autre porte.
      derniereErreur = e.name === 'AbortError' ? new Error('lent') : e;
    } finally {
      clearTimeout(stop);
      signal && signal.removeEventListener('abort', annuler);
    }
  }
  throw derniereErreur || new Error('reseau');
}

/**
 * Ce qui est déjà en mémoire pour cette boîte, sans jamais toucher au réseau.
 *
 * Sert à redessiner les rues quand l'app rouvre en pleine course : on veut
 * la carte tout de suite ou pas du tout, sûrement pas une minute d'attente
 * et un quota Overpass consommé au milieu d'une sortie.
 *
 * @returns {object|null} null dès qu'une seule tuile manque
 */
export async function chargerDuCache(boite) {
  const tuiles = tuilesPour(boite);
  const reponses = [];
  for (const t of tuiles) {
    const osm = await lire(cleTuile(t));
    if (!osm) return null;
    reponses.push(osm);
  }
  return fusionner(reponses);
}

/**
 * Les données OSM couvrant une boîte, cache d'abord.
 * @param {object} boite  {sud, ouest, nord, est}
 * @param {(fait:number, total:number, depuisLeCache:boolean) => void} [avance]
 */
export async function charger(boite, avance, signal) {
  const tuiles = tuilesPour(boite);
  const total = tuiles.length;
  const reponses = new Array(total);

  // Ce qui est déjà en mémoire ne coûte rien : on le sort d'abord, pour
  // n'annoncer un téléchargement que s'il y en a vraiment un.
  const aTelecharger = [];
  for (let k = 0; k < total; k++) {
    const osm = await lire(cleTuile(tuiles[k]));
    if (osm) reponses[k] = osm; else aTelecharger.push(k);
  }

  let faits = total - aTelecharger.length;
  avance && avance(faits, total, aTelecharger.length === 0);
  if (!aTelecharger.length) return fusionner(reponses);

  /* Overpass accorde deux créneaux simultanés par adresse. Les prendre tous
     les deux divise l'attente du premier quartier par deux ; en demander
     plus ferait mettre les requêtes en file d'attente côté serveur, ce qui
     ne gagne rien et consomme le quota. */
  let prochain = 0;
  async function ouvrier() {
    for (;;) {
      const k = prochain++;
      if (k >= aTelecharger.length) return;
      const i = aTelecharger[k];
      const osm = await telecharger(boiteDeTuile(tuiles[i]), signal);
      reponses[i] = osm;
      await ecrire(cleTuile(tuiles[i]), osm);
      avance && avance(++faits, total, false);
    }
  }
  await Promise.all([ouvrier(), ouvrier()]);

  return fusionner(reponses);
}

/** Combien de quartiers sont déjà en cache, pour le dire dans les réglages. */
export async function tuillesEnCache() {
  const db = await ouvrir();
  return new Promise(ok => {
    const t = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).count();
    t.onsuccess = () => ok(t.result);
    t.onerror = () => ok(0);
  });
}

export async function viderCache() {
  const db = await ouvrir();
  return new Promise(ok => {
    const t = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).clear();
    t.onsuccess = () => ok(true);
    t.onerror = () => ok(false);
  });
}
