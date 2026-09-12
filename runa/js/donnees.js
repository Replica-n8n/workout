/* =========================================================================
   Runa · le chargement des rues

   Overpass est lent et sévèrement limité en débit. Les rues, elles, ne
   bougent quasiment pas. Tout ce qui est téléchargé est donc gardé par
   rectangle fixe dans IndexedDB : le deuxième départ depuis le même quartier
   ne demande rien au réseau, et fonctionne hors ligne.

   ⚠️ Deux erreurs de conception corrigées après un échec sur un vrai
   téléphone, en Brave, sur un vrai réseau :

   1. On téléchargeait TUILE PAR TUILE, sur une grille fixe. Une boîte à
      cheval sur la grille touche quatre tuiles : quatre requêtes de deux
      mégaoctets, quatre attentes, quatre occasions d'échouer. Groupées en
      une seule requête sur le rectangle englobant, elles couvraient encore
      jusqu'à quatre fois le disque utile. On demande désormais exactement le
      disque, et on arrondit seulement la clé de cache.

   2. Le délai était un PLAFOND TOTAL de 45 secondes. Un téléchargement lent
      mais qui progresse se faisait tuer à mi-chemin, et l'app annonçait un
      serveur qui ne répond pas alors qu'il répondait très bien. Le délai
      porte maintenant sur l'ABSENCE de progrès : tant que des octets
      arrivent, on attend.
   ========================================================================= */

import { requete, zoneCouvre, poidsEstime, MARGE_ZONE } from '../lib/overpass.js';

const BASE = 'runa-osm';
const MAGASIN = 'tuiles';
const PEREMPTION = 30 * 24 * 3600 * 1000;   // 30 jours, comme la spec

/* Trois serveurs : le principal tombe régulièrement en limite de débit, et
   se retrouver bloqué en pleine ville sans autre porte serait bête.

   ⚠️ Deux ne suffisaient pas. Le 2026-09-12, « saturé » à répétition sur
   son téléphone : le principal rendait 504 après 16 s sur la vraie requête
   de Villeray, et kumi ne répondait plus du tout (40 s sans un octet). Le
   miroir de VK (maps.mail.ru) a rendu la même zone en 3,6 s : 3,75 Mo,
   données de la minute, 17 parcs avec leur contour, en-tête CORS ouvert. */
const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

/* Combien de temps sans le MOINDRE octet avant d'abandonner. Overpass met
   parfois trente secondes à préparer sa réponse avant d'en envoyer le
   premier octet : ce silence initial est normal, deux minutes ne le sont
   pas. */
const SILENCE_MAX = 75000;

/* Une SEULE connexion, réutilisée. En ouvrir une par lecture et par écriture
   marche, mais chaque connexion laissée ouverte bloque ensuite toute montée
   de version de la base : la mise à jour reste en attente indéfiniment, sans
   erreur, et l'app paraît figée au prochain déploiement du schéma. */
let connexion = null;

/**
 * La connexion à la base, ou `null` si elle est indisponible.
 *
 * ⚠️ Ne rejette JAMAIS et ne reste JAMAIS en suspens. Une base bloquée ou
 * refusée prive l'app de sa mémoire, elle ne doit pas l'empêcher de
 * chercher : sans base, on télécharge, comme au premier lancement.
 *
 * Trouvé par la revue de la 1.13.0 : monter la base en version 3 déclenche
 * une mise à niveau, et si une autre page de Runa garde la version 2
 * ouverte, le navigateur la met en ATTENTE sans succès ni erreur. `ouvrir`
 * ne se résolvait donc jamais, et la recherche restait figée sur « Calcul
 * des boucles… », sans un mot.
 */
function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise(ok => {
    let regle = false;
    const finir = db => {
      /* Une ouverture débloquée APRÈS qu'on a renoncé : on la referme, sinon
         c'est elle qui bloquerait la prochaine montée de version. */
      if (regle) { if (db) db.close(); return; }
      regle = true;
      if (!db) connexion = null;   // on retentera au prochain appel
      ok(db);
    };
    /* Version 2 : les zones de la version 1 ont été téléchargées sans les
       points d'intérêt. Les garder donnerait des cartes partagées sans
       aucun repère, sans que rien ne le signale. On repart de zéro : c'est
       un téléchargement de plus, une fois.

       Version 3, même raison : les zones de la version 2 n'ont pas le
       CONTOUR des parcs. Les garder, c'était ne jamais proposer le tour du
       parc à qui avait déjà ouvert l'app dans son quartier, sans rien qui
       dise pourquoi, jusqu'à ce que la zone périme d'elle-même. */
    let r;
    try {
      r = indexedDB.open(BASE, 3);
    } catch (e) {
      finir(null);   // navigation privée, stockage refusé
      return;
    }
    r.onupgradeneeded = () => {
      if (r.result.objectStoreNames.contains(MAGASIN)) r.result.deleteObjectStore(MAGASIN);
      r.result.createObjectStore(MAGASIN);
    };
    r.onsuccess = () => {
      const db = r.result;
      /* À la PROCHAINE montée de version, c'est cette page-ci qui gênerait
         la nouvelle : elle rend la main au lieu de la bloquer. */
      db.onversionchange = () => { db.close(); connexion = null; };
      finir(db);
    };
    r.onerror = () => finir(null);
    /* Une autre page garde l'ancienne version ouverte. */
    r.onblocked = () => finir(null);
  });
  return connexion;
}

/**
 * Cherche une zone mémorisée qui contient entièrement le disque demandé.
 * On parcourt : il y a une poignée de quartiers, pas des milliers, et une
 * recherche par inclusion ne peut pas s'indexer par clé.
 */
async function lire(centre, rayonM) {
  const db = await ouvrir();
  if (!db) return null;
  return new Promise((ok) => {
    let c;
    /* La connexion a pu être refermée entre-temps par une montée de
       version : `transaction` lève alors, et on fait comme sans mémoire. */
    try { c = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).openCursor(); }
    catch (e) { connexion = null; return ok(null); }
    c.onsuccess = () => {
      const curseur = c.result;
      if (!curseur) return ok(null);
      const v = curseur.value;
      if (v && Date.now() - v.date <= PEREMPTION && zoneCouvre(v, centre, rayonM)) {
        return ok(v.osm);
      }
      curseur.continue();
    };
    c.onerror = () => ok(null);
  });
}

async function ecrire(centre, rayonM, osm) {
  const db = await ouvrir();
  if (!db) return false;
  const cle = `z${centre.lat.toFixed(4)}:${centre.lon.toFixed(4)}:${Math.round(rayonM)}`;
  return new Promise((ok) => {
    let t;
    try { t = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN); }
    catch (e) { connexion = null; return ok(false); }
    t.put({ osm, lat: centre.lat, lon: centre.lon, rayon: rayonM, date: Date.now() }, cle);
    t.transaction.oncomplete = () => ok(true);
    t.transaction.onerror = () => ok(false);   // un cache plein ne doit rien casser
  });
}

/**
 * Lit la réponse en flux, en signalant chaque paquet d'octets.
 * C'est ce qui donne à la fois la barre de progression et le délai fondé sur
 * l'absence de progrès plutôt que sur la durée totale.
 */
async function lireLeFlux(rep, avance) {
  if (!rep.body || !rep.body.getReader) return rep.text();   // navigateur ancien

  const lecteur = rep.body.getReader();
  const morceaux = [];
  let recu = 0;
  let dernierOctet = Date.now();

  const veille = setInterval(() => {
    if (Date.now() - dernierOctet > SILENCE_MAX) lecteur.cancel().catch(() => {});
  }, 2000);

  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
      recu += value.length;
      dernierOctet = Date.now();
      avance && avance(recu);
    }
  } finally {
    clearInterval(veille);
  }

  const tout = new Uint8Array(recu);
  let n = 0;
  for (const m of morceaux) { tout.set(m, n); n += m.length; }
  return new TextDecoder().decode(tout);
}

async function telecharger(boite, avance, signal) {
  const corps = requete(boite);
  let derniere = null;

  for (const url of SERVEURS) {
    try {
      avance && avance({ etat: 'attente', octets: 0 });
      const rep = await fetch(url, {
        method: 'POST',
        /* Le navigateur pose lui-même un User-Agent, qu'Overpass EXIGE :
           sans lui il répond 406. Rien à faire côté page, mais ne jamais
           l'oublier dans un script Node qui reproduit cette requête, sous
           peine de diagnostiquer une panne qui n'existe pas. */
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: corps,
        signal
      });

      if (rep.status === 429 || rep.status === 504) { derniere = new Error('debit'); continue; }
      if (!rep.ok) { derniere = new Error('http ' + rep.status); continue; }

      const txt = await lireLeFlux(rep, octets => avance && avance({ etat: 'recoit', octets }));
      return JSON.parse(txt);

    } catch (e) {
      if (signal && signal.aborted) throw e;
      /* Un `TypeError` sur un fetch veut dire que la requête n'est jamais
         partie : pas de réseau, ou un bloqueur qui l'a coupée. Ce n'est pas
         la même chose qu'un serveur lent, et le message ne doit pas dire la
         même chose, sinon on cherche au mauvais endroit. */
      derniere = e.name === 'TypeError' ? new Error('bloque')
               : e.name === 'AbortError' ? new Error('silence')
               : e;
    }
  }
  throw derniere || new Error('reseau');
}

/**
 * Les données OSM autour d'un point, cache d'abord.
 * @param {{lat,lon}} centre
 * @param {number} rayonM
 * @param {{sud,ouest,nord,est}} boite  la boîte correspondante, déjà calculée
 * @param {(info:{phase:string, octets?:number, part?:number}) => void} [avance]
 */
export async function charger(centre, rayonM, boite, avance, signal) {
  const cache = await lire(centre, rayonM);
  if (cache) {
    avance && avance({ phase: 'memoire', part: 1 });
    return cache;
  }

  /* L'estimation vient de l'AIRE réellement demandée, pas d'une constante :
     une barre calée sur un quartier moyen se bloquait à 97 % pendant la
     moitié du téléchargement dès que la zone était plus grande que prévu. */
  const estime = poidsEstime(boite);

  const osm = await telecharger(boite, info => {
    if (!avance) return;
    if (info.etat === 'attente') return avance({ phase: 'attente', part: 0 });
    avance({
      phase: 'recoit',
      octets: info.octets,
      part: Math.min(0.97, info.octets / estime)
    });
  }, signal);

  avance && avance({ phase: 'range', part: 1 });
  await ecrire(centre, rayonM, osm);
  return osm;
}

/**
 * Ce qui est déjà en mémoire pour cette boîte, sans jamais toucher au réseau.
 *
 * Sert à redessiner les rues quand l'app rouvre en pleine course : on veut
 * la carte tout de suite ou pas du tout, sûrement pas une minute d'attente
 * et un quota Overpass consommé au milieu d'une sortie.
 */
export async function chargerDuCache(centre, rayonM) {
  return lire(centre, rayonM);
}
