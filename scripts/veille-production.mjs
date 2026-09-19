#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// VEILLE DE PRODUCTION — voir les pannes SILENCIEUSES (2026-09-18)
//
// La sentinelle autonome ne voit que ce qui lève une erreur JavaScript. Or
// mesuré sur 14 jours : une journée à 310 lignes de télémétrie et 0 compte
// identifié (le 09-17) n'a fait sonner personne ; les inscriptions jamais
// confirmées (SMTP) ne lèvent rien ; un déploiement bloqué, un cron GitHub
// désactivé, un jeton expiré, une base qui grossit — zéro ligne, et ça
// ressemble au calme. Ce script est l'œil qui regarde ce que le silence cache.
//
// ⚠️ IL NE CORRIGE RIEN ET N'ÉCRIT NULLE PART. Il lit (API de gestion Supabase
// en SELECT SEULEMENT — des agrégats —, PostgREST avec la clé anon PUBLIQUE,
// API GitHub, release.json de prod ; jamais la clé service_role), assemble des
// MESURES, et `verdictVeille()` — fonction PURE, testée seule — les transforme
// en signaux `ok | warn | alert | unknown`. Le workflow
// `.github/workflows/veille-production.yml` en fait une issue `[VEILLE]`.
//
// ⚠️ VIE PRIVÉE : le dépôt est PUBLIC. La sortie ne porte JAMAIS un e-mail, un
// identifiant, un pseudo : des COMPTAGES et des libellés d'endpoints seulement.
// Les requêtes SQL ne sélectionnent d'ailleurs que des agrégats.
//
// ⚠️ UN CRON GITHUB EST UNE DEMANDE, PAS UNE GARANTIE : mesuré du 09-15 au
// 09-18, un cron « toutes les 10 min » est servi ~4 % des créneaux, un cron
// horaire ~25 %, un cron 4 h ~75 % — écarts de 2 à 5 h. Tous les seuils
// temporels ci-dessous tolèrent donc un trou de plusieurs heures : une alarme
// qui crie à tort finit par ne plus être lue.
//
//   node scripts/veille-production.mjs            → verdict lisible
//   node scripts/veille-production.mjs --json     → même verdict en JSON (workflow)
//   variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN,
//               SUPABASE_PROJECT_REF, GH_TOKEN, GITHUB_REPOSITORY,
//               SENTINELLE_TOKEN, NETLIFY_AUTH_TOKEN, PASSIO_PROD_URL
//   codes de sortie : 0 rien à signaler, 3 alerte, autre = panne du lecteur.
// ═══════════════════════════════════════════════════════════════════════════

// ── Constantes de calibrage (mesures de la carte mesures-prod, 2026-09-18) ──
// Heures actives réelles du trafic humain : 09h–21h Paris (F10). Rien n'est
// évalué la nuit : un silence nocturne est la normale, pas un signal.
export const HEURE_DEBUT = 9;
export const HEURE_FIN = 21;
// Silence en heures actives : 4 h consécutives = warn (observé 1 fois/7 j,
// samedi inclus → 6 h le week-end), 8 h = alert (le 09-17 : 10h→18h).
export const SILENCE_WARN_H = 4;
export const SILENCE_WARN_WEEKEND_H = 6;
export const SILENCE_ALERT_H = 8;
// Journée ouvrée < 100 lignes alors que la médiane des jours ouvrés > 500 :
// médiane mesurée ≈ 2 081, minimum 310.
export const JOURNEE_MIN_LIGNES = 100;
export const JOURNEE_MEDIANE_MIN = 500;
// Déploiement : main HEAD plus récent que le commit servi depuis > 90 min sans
// run en cours (un run main dure 12 min, 62 min au pire mesuré).
export const DEPLOIEMENT_RETARD_MIN = 90;
// Crons : âge du dernier run terminé, en heures (warn, alert). Les tolérances
// absorbent la desserte réelle (cron 10 min servi ~4 %, écarts jusqu'à 5,5 h).
export const SEUILS_CRONS = {
  "sentinelle-autonome": { warn: 8, alert: 24 },
  "sentinelle-distante": { warn: 12, alert: 36 },
  "disponibilite": { warn: 6, alert: 24 },
  "sauvegarde": { warn: 30, alert: 54 },
  "moderation-alerte": { warn: 30, alert: 54 },
};
// Base : plan Pro 8 Go.
export const BASE_WARN_GO = 6;
export const BASE_ALERT_GO = 7.5;
// Jetons : jours restants.
export const JETON_WARN_J = 14;
export const JETON_ALERT_J = 3;

const H = 3600_000;
const ORDRE = { alert: 3, warn: 2, unknown: 1, ok: 0 };

// ── Temps de Paris, sans dépendance ────────────────────────────────────────
const FMT_PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short",
});
const JOURS = { "dim.": 0, "lun.": 1, "mar.": 2, "mer.": 3, "jeu.": 4, "ven.": 5, "sam.": 6 };

/**
 * L'heure de Paris d'un instant : { heure (0-23), jour (0 = dimanche), date "AAAA-MM-JJ",
 * cle "AAAA-MM-JJTHH" } — la clé est celle des histogrammes horaires rendus par SQL.
 */
export function heureParis(ms) {
  const p = {};
  for (const x of FMT_PARIS.formatToParts(new Date(ms))) p[x.type] = x.value;
  // Intl rend « 24 » pour minuit dans certaines versions : on le ramène à 0.
  const heure = Number(p.hour) % 24;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { heure, jour: JOURS[p.weekday] ?? new Date(ms).getUTCDay(), date, cle: `${date}T${String(heure).padStart(2, "0")}` };
}

export function mediane(valeurs) {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const estWeekend = (jour) => jour === 0 || jour === 6;
const estActive = (heure) => heure >= HEURE_DEBUT && heure < HEURE_FIN;

// ── Signaux (chacun : mesure → { etat, texte, geste? }) ─────────────────────
// Une mesure absente ou en erreur rend `unknown` avec sa raison : un lecteur
// muet ne doit jamais passer pour « tout va bien ».
function inconnu(m, quoi) {
  if (!m) return { etat: "unknown", texte: `${quoi} : non mesuré` };
  if (m.erreur) return { etat: "unknown", texte: `${quoi} : lecture en échec (${String(m.erreur).slice(0, 120)})` };
  return null;
}

/**
 * Flux de télémétrie humaine (production, hors canari et hors synthétique).
 * @param {{heures:Array<{h:string,n:number}>, canaris2h?:number}} m
 */
export function signalFlux(m, now) {
  const ko = inconnu(m, "flux");
  if (ko) return ko;
  const parCle = new Map((m.heures || []).map((x) => [String(x.h).slice(0, 13), Number(x.n) || 0]));
  const p = heureParis(now);
  const lignes = [];

  // Canari : la chaîne publique → base doit battre toutes les 15 min, jour et
  // nuit (le poste l'émet). 0 en 2 h = le poste est éteint ou Supabase refuse.
  let etat = "ok";
  if (Number.isFinite(m.canaris2h) && m.canaris2h === 0) {
    etat = "alert";
    lignes.push("0 canari en 2 h : chaîne d'ingestion (le poste de pilotage est éteint ou Supabase refuse les écritures)");
  } else if (Number.isFinite(m.canaris2h)) {
    lignes.push(`${m.canaris2h} canari(s) en 2 h`);
  }

  // Heures actives consécutives VIDES, en remontant depuis la dernière heure
  // pleine — ou, la nuit (22h-08h), depuis la dernière heure active écoulée.
  // Un silence de 8 h vu à 18 h doit rester une alerte à 22 h 30 et à 07 h :
  // sinon l'issue se referme seule dans la nuit et rien ne revient le matin
  // (constat B-02). Les heures de nuit ne comptent jamais comme silence, et
  // la première heure inactive (avant 09h) arrête la série : un silence
  // d'hier soir ne s'ajoute jamais à celui de ce matin.
  const jugeMaintenant = estActive(heureParis(now - H).heure);
  let t = now - H;
  while (!estActive(heureParis(t).heure)) t -= H;
  const finSerie = heureParis(t);
  let vides = 0;
  for (; ; t -= H) {
    const q = heureParis(t);
    if (!estActive(q.heure)) break;
    if ((parCle.get(q.cle) || 0) > 0) break;
    vides++;
  }
  const seuilWarn = estWeekend(finSerie.jour) ? SILENCE_WARN_WEEKEND_H : SILENCE_WARN_H;
  const plage = jugeMaintenant ? "" : ` (fin de la dernière plage active, le ${finSerie.date})`;
  if (vides >= SILENCE_ALERT_H) {
    etat = "alert";
    lignes.push(`${vides} h actives consécutives sans aucune ligne humaine${plage}`);
  } else if (vides >= seuilWarn) {
    if (etat !== "alert") etat = "warn";
    lignes.push(`${vides} h actives consécutives sans aucune ligne humaine (seuil ${seuilWarn} h)${plage}`);
  }

  // 3 dernières heures vs la même tranche les 7 jours précédents (contexte,
  // en heures actives seulement : la nuit est vide, c'est la normale).
  if (jugeMaintenant) {
    const somme = (base, decalJours) => {
      let s = 0;
      for (let k = 1; k <= 3; k++) s += parCle.get(heureParis(base - k * H - decalJours * 24 * H).cle) || 0;
      return s;
    };
    const derniere3h = somme(now, 0);
    const med3h = mediane([1, 2, 3, 4, 5, 6, 7].map((j) => somme(now, j)));
    lignes.push(`3 dernières heures : ${derniere3h} ligne(s) (médiane 7 j même tranche : ${med3h})`);
  } else {
    lignes.push(`trafic courant non évalué (nuit ${HEURE_FIN + 1}h-${HEURE_DEBUT}h Paris)`);
  }

  // Journée : une journée OUVRÉE < 100 lignes alors que la médiane des jours
  // ouvrés dépasse 500 est une panne de télémétrie ou d'usage. Jugée sur TOUTE
  // la nuit qui suit (dès 21 h : la journée ; avant 09 h : la veille), pas sur
  // la seule heure 21 — un cron servi toutes les 2 à 5 h la manquerait un soir
  // sur deux, et une alerte de 21 h se refermerait seule à 23 h (constat B-02).
  const refJour = p.heure >= HEURE_FIN ? now : (p.heure < HEURE_DEBUT ? now - 24 * H : null);
  if (refJour !== null) {
    const pj = heureParis(refJour);
    const totalJour = (date) => {
      let s = 0;
      for (const [cle, n] of parCle) if (cle.startsWith(date)) s += n;
      return s;
    };
    const total = totalJour(pj.date);
    const ouvres = [];
    for (let j = 1; j <= 7; j++) {
      const q = heureParis(refJour - j * 24 * H);
      if (!estWeekend(q.jour)) ouvres.push(totalJour(q.date));
    }
    const medOuvres = mediane(ouvres);
    lignes.push(`journée du ${pj.date} : ${total} ligne(s) (médiane jours ouvrés : ${medOuvres})`);
    if (!estWeekend(pj.jour) && total < JOURNEE_MIN_LIGNES && medOuvres > JOURNEE_MEDIANE_MIN) {
      etat = "alert";
      lignes.push(`journée ouvrée quasi vide (< ${JOURNEE_MIN_LIGNES} lignes)`);
    }
  }
  return { etat, texte: lignes.join(" ; "), geste: etat === "alert"
    ? "Ouvre le Centre de pilotage (page Sources : canari, Realtime, ingestion) puis status.supabase.com ; si tout est vert, la télémétrie côté client ne part plus — regarde le dernier déploiement."
    : undefined };
}

/**
 * Entonnoir inscription → confirmation (auth.users hors comptes e2e).
 * @param {{crees24h:number,confirmes24h:number,crees7j:number,confirmes7j:number,nonConfirmesAnciens:number}} m
 */
export function signalInscriptions(m) {
  const ko = inconnu(m, "inscriptions");
  if (ko) return ko;
  const n = (k) => Number(m[k]) || 0;
  const lignes = [`24 h : ${n("crees24h")} créé(s), ${n("confirmes24h")} confirmé(s)`,
    `7 j : ${n("crees7j")} créé(s), ${n("confirmes7j")} confirmé(s)`];
  let etat = "ok";
  if (n("crees24h") >= 3 && n("confirmes24h") === 0) {
    etat = "alert";
    lignes.push("aucune confirmation sur ≥ 3 inscriptions en 24 h : l'e-mail de confirmation ne part plus (SMTP, quota Brevo, lien)");
  } else if (n("crees7j") >= 3 && n("confirmes7j") / n("crees7j") < 0.5) {
    etat = "warn";
    lignes.push("moins d'une inscription sur deux confirmée sur 7 j");
  }
  if (n("nonConfirmesAnciens") > 0) lignes.push(`${n("nonConfirmesAnciens")} compte(s) créé(s) depuis plus de 24 h jamais confirmé(s)`);
  return { etat, texte: lignes.join(" ; "), geste: etat === "alert"
    ? "Tableau Brevo (envoyés/300 du jour, clé SMTP valide) puis Supabase > Authentication > SMTP ; teste une inscription avec une adresse à toi."
    : undefined };
}

/**
 * Erreurs client (client_errors + télémétrie type=error) : dernière heure vs
 * médiane horaire sur 7 j.
 * @param {{heures:Array<{h:string,n:number,appareils:number}>, derniereHeure:number, appareils:number}} m
 */
export function signalErreurs(m) {
  const ko = inconnu(m, "erreurs");
  if (ko) return ko;
  // Médiane sur les 168 heures, celles à zéro comprises : au trafic actuel
  // (≤ 2 erreurs/jour) elle vaut 0, et « ≥ 5 × 0 » ne dit rien — d'où le
  // plancher absolu de 10.
  const parHeure = (m.heures || []).map((x) => Number(x.n) || 0);
  while (parHeure.length < 168) parHeure.push(0);
  const med = mediane(parHeure);
  const n = Number(m.derniereHeure) || 0;
  const app = Number(m.appareils) || 0;
  let etat = "ok";
  const lignes = [`dernière heure : ${n} erreur(s) sur ${app} appareil(s) (médiane horaire 7 j : ${med})`];
  if (n >= 10 && n >= 5 * med && app >= 2) {
    etat = "warn";
    lignes.push("pic d'erreurs client sur plusieurs appareils");
  }
  return { etat, texte: lignes.join(" ; ") };
}

/**
 * API vue par les clients : 5xx et refus 401/403 hors auth, dernière heure.
 * @param {{n5xx:number,app5xx:number,nRefus:number,appRefus:number}} m
 */
export function signalApi(m) {
  const ko = inconnu(m, "api");
  if (ko) return ko;
  const n = (k) => Number(m[k]) || 0;
  let etat = "ok";
  const lignes = [`dernière heure : ${n("n5xx")} réponse(s) ≥ 500 sur ${n("app5xx")} appareil(s), ${n("nRefus")} refus 401/403 hors auth sur ${n("appRefus")} appareil(s)`];
  if (n("n5xx") >= 5 && n("app5xx") >= 2) {
    etat = "alert";
    lignes.push("Supabase répond en erreur serveur à plusieurs appareils");
  } else if (n("nRefus") >= 20 && n("appRefus") >= 3) {
    etat = "warn";
    lignes.push("refus d'accès groupés : jeton mort collectif ou policy RLS changée");
  }
  return { etat, texte: lignes.join(" ; "), geste: etat === "alert"
    ? "status.supabase.com puis Supabase > Logs (API) ; si l'incident est côté PASSIO, la sentinelle autonome ouvrira l'enquête — ne double pas."
    : undefined };
}

/**
 * Déploiement : release.json servi vs main et dernier run deploy.yml sur main.
 * @param {{commitServi:string|null, mainHead:string|null, mainHeadDate:string|null,
 *          dernierRun:{status:string,conclusion:string|null,head_sha:string,updated_at:string,html_url:string}|null,
 *          enCours:boolean}} m
 */
export function signalDeploiement(m, now) {
  const ko = inconnu(m, "déploiement");
  if (ko) return ko;
  const court = (s) => (s ? String(s).slice(0, 8) : "?");
  const lignes = [`servi ${court(m.commitServi)}, main ${court(m.mainHead)}`];
  if (m.dernierRun && m.dernierRun.conclusion === "failure") {
    return { etat: "alert", texte: `${lignes[0]} ; dernier run main en ÉCHEC : ${m.dernierRun.html_url || "?"}`,
      geste: "Ouvre le run rouge, lis le job en échec ; la prod reste sur l'ancien commit tant que main n'est pas vert." };
  }
  if (m.enCours) return { etat: "ok", texte: `${lignes[0]} ; un run de déploiement est en cours` };
  if (m.commitServi && m.mainHead && m.commitServi === m.mainHead) return { etat: "ok", texte: `${lignes[0]} ; à jour` };
  if (!m.commitServi || !m.mainHead) return { etat: "unknown", texte: `${lignes[0]} ; comparaison impossible` };
  const ageMin = m.mainHeadDate ? (now - Date.parse(m.mainHeadDate)) / 60_000 : NaN;
  if (Number.isFinite(ageMin) && ageMin > DEPLOIEMENT_RETARD_MIN) {
    return { etat: "alert", texte: `${lignes[0]} ; main est en avance depuis ${Math.round(ageMin)} min sans run en cours : déploiement bloqué`,
      // deploy.yml n'a pas de `workflow_dispatch` : `gh workflow run deploy.yml`
      // est refusé (constat B-03). Ce qui marche : rejouer le dernier run, ou
      // un commit vide sur main pour en déclencher un.
      geste: "Actions > CI & Deploy > dernier run main > « Re-run all jobs » (`gh run rerun <id>`) ; s'il n'y a aucun run pour ce commit, pousse un commit vide sur main (`git commit --allow-empty -m \"Redéploiement\" && git push`) ; si le build est vert mais Netlify sert encore l'ancien, app.netlify.com > Deploys." };
  }
  return { etat: "ok", texte: `${lignes[0]} ; main en avance depuis ${Number.isFinite(ageMin) ? Math.round(ageMin) : "?"} min (délai normal)` };
}

/**
 * Crons GitHub : âge du dernier run terminé + état du workflow.
 * @param {Record<string,{dernierRunFin:string|null,state:string|null}>} m
 */
export function signalCrons(m, now) {
  const ko = inconnu(m, "crons");
  if (ko) return ko;
  let etat = "ok";
  const lignes = [];
  let geste;
  for (const [nom, seuil] of Object.entries(SEUILS_CRONS)) {
    const x = m[nom];
    if (!x) { lignes.push(`${nom} : non mesuré`); if (etat === "ok") etat = "unknown"; continue; }
    // Une lecture refusée (403 sans `actions: read`, 404) doit se lire telle
    // quelle : « aucun run terminé » cacherait le code HTTP (constat B-01).
    if (x.erreur) { lignes.push(`${nom} : lecture en échec (${String(x.erreur).slice(0, 120)})`); if (etat === "ok") etat = "unknown"; continue; }
    if (x.state && /^disabled/.test(x.state)) {
      etat = "alert";
      lignes.push(`${nom} : DÉSACTIVÉ (${x.state})`);
      geste = "Actions > le workflow nommé > « Enable workflow » (GitHub coupe les crons après 60 j sans commit).";
      continue;
    }
    const age = x.dernierRunFin ? (now - Date.parse(x.dernierRunFin)) / H : NaN;
    if (!Number.isFinite(age)) { lignes.push(`${nom} : aucun run terminé`); if (etat !== "alert") etat = etat === "ok" ? "unknown" : etat; continue; }
    const ageTxt = `${Math.round(age * 10) / 10} h`;
    if (age > seuil.alert) {
      etat = "alert";
      lignes.push(`${nom} : dernier run il y a ${ageTxt} (> ${seuil.alert} h)`);
      geste = geste || "Actions > le workflow nommé : est-il désactivé ou en échec ? `gh workflow run <fichier>.yml` pour le relancer à la main.";
    } else if (age > seuil.warn) {
      if (etat !== "alert") etat = "warn";
      lignes.push(`${nom} : dernier run il y a ${ageTxt} (> ${seuil.warn} h)`);
    } else {
      lignes.push(`${nom} : ${ageTxt}`);
    }
  }
  return { etat, texte: lignes.join(" ; "), geste };
}

/**
 * Base : réponse anon sur /rest/v1, taille, purge planifiée.
 * @param {{anonStatus:number|null, octets:number|null, purgePlanifiee:boolean|null}} m
 */
export function signalBase(m) {
  const ko = inconnu(m, "base");
  if (ko) return ko;
  let etat = "ok";
  const lignes = [];
  let geste;
  if (m.anonStatus !== 200) {
    etat = "alert";
    lignes.push(`GET /rest/v1/passions avec la clé anon : HTTP ${m.anonStatus ?? "?"} (200 attendu)`);
    geste = "status.supabase.com puis Supabase > Project settings (projet en pause ? clé anon régénérée ?).";
  } else lignes.push("API anon : 200");
  if (Number.isFinite(m.octets)) {
    const go = m.octets / 1024 ** 3;
    const goTxt = `${Math.round(go * 100) / 100} Go`;
    if (go > BASE_ALERT_GO) { etat = "alert"; lignes.push(`base ${goTxt} (> ${BASE_ALERT_GO} Go, plan 8 Go)`); geste = geste || "Supabase > Database > purge : `select purge_telemetry(7)` puis vacuum, ou passer au palier supérieur."; }
    else if (go > BASE_WARN_GO) { if (etat !== "alert") etat = "warn"; lignes.push(`base ${goTxt} (> ${BASE_WARN_GO} Go)`); }
    else lignes.push(`base ${goTxt}`);
  } else { lignes.push("taille non mesurée"); if (etat === "ok") etat = "unknown"; }
  if (m.purgePlanifiee === false) { if (etat === "ok" || etat === "unknown") etat = "warn"; lignes.push("aucune purge telemetry planifiée dans cron.job"); }
  else if (m.purgePlanifiee === true) lignes.push("purge planifiée");
  return { etat, texte: lignes.join(" ; "), geste };
}

/**
 * Jetons : jours restants (GitHub) et validité (Supabase, Netlify).
 * @param {{github:{statut:number,joursRestants:number|null}, supabase:{statut:number}, netlify:{statut:number}}} m
 */
export function signalJetons(m) {
  const ko = inconnu(m, "jetons");
  if (ko) return ko;
  let etat = "ok";
  const lignes = [];
  const gestes = [];
  // Trois états par jeton : 401/403 = refusé (alerte) ; 2xx = ok ; tout le
  // reste (statut 0 posé par un `catch` réseau, 5xx, 429, absent) = NON LU.
  // Un jeton non lu n'est pas un jeton valide (constat B-04) : le signal
  // passe `unknown`, jamais « ok », sauf si une alerte l'emporte.
  const mort = (x) => !!x && (x.statut === 401 || x.statut === 403);
  const lu = (x) => !!x && x.statut >= 200 && x.statut < 300;
  const nonLu = (nom, x) => { lignes.push(`${nom} : non lisible (HTTP ${x && Number.isFinite(x.statut) ? x.statut : "?"})`); if (etat === "ok") etat = "unknown"; };
  if (mort(m.github)) { etat = "alert"; lignes.push("SENTINELLE_TOKEN refusé par GitHub"); gestes.push("github.com/settings/tokens → régénérer, puis Settings > Secrets > SENTINELLE_TOKEN"); }
  else if (!lu(m.github)) nonLu("SENTINELLE_TOKEN", m.github);
  else if (Number.isFinite(m.github.joursRestants)) {
    const j = m.github.joursRestants;
    if (j < JETON_ALERT_J) { etat = "alert"; lignes.push(`SENTINELLE_TOKEN expire dans ${j} j`); gestes.push("github.com/settings/tokens → régénérer, puis Settings > Secrets > SENTINELLE_TOKEN"); }
    else if (j < JETON_WARN_J) { if (etat !== "alert") etat = "warn"; lignes.push(`SENTINELLE_TOKEN expire dans ${j} j`); }
    else lignes.push(`SENTINELLE_TOKEN : ${j} j`);
  } else lignes.push("SENTINELLE_TOKEN : sans date d'expiration lisible");
  if (mort(m.supabase)) { etat = "alert"; lignes.push("SUPABASE_ACCESS_TOKEN refusé"); gestes.push("supabase.com/dashboard/account/tokens → nouveau jeton, puis Settings > Secrets > SUPABASE_ACCESS_TOKEN"); }
  else if (!lu(m.supabase)) nonLu("SUPABASE_ACCESS_TOKEN", m.supabase);
  else lignes.push("SUPABASE_ACCESS_TOKEN : ok");
  if (mort(m.netlify)) { etat = "alert"; lignes.push("NETLIFY_AUTH_TOKEN refusé"); gestes.push("app.netlify.com/user/applications → nouveau jeton, puis Settings > Secrets > NETLIFY_AUTH_TOKEN"); }
  else if (!lu(m.netlify)) nonLu("NETLIFY_AUTH_TOKEN", m.netlify);
  else lignes.push("NETLIFY_AUTH_TOKEN : ok");
  return { etat, texte: lignes.join(" ; "), geste: gestes.length ? gestes.join(" ; ") : undefined };
}

const SYMBOLE = { alert: "[ALERTE]", warn: "[ATTENTION]", ok: "[ok]", unknown: "[?]" };

/**
 * Fonction PURE : mesures → verdict. Testée seule (tests/unit/veille-production.test.mjs).
 * @returns {{signaux:Array<{cle:string,etat:string,texte:string,geste?:string}>, alerte:boolean, titre:string, corps:string, resume:string}}
 */
export function verdictVeille(mesures, now) {
  const m = mesures || {};
  const t = Number.isFinite(now) ? now : Date.now();
  const signaux = [
    { cle: "flux", ...signalFlux(m.flux, t) },
    { cle: "inscriptions", ...signalInscriptions(m.inscriptions) },
    { cle: "erreurs", ...signalErreurs(m.erreurs) },
    { cle: "api", ...signalApi(m.api) },
    { cle: "deploiement", ...signalDeploiement(m.deploiement, t) },
    { cle: "crons", ...signalCrons(m.crons, t) },
    { cle: "base", ...signalBase(m.base) },
    { cle: "jetons", ...signalJetons(m.jetons) },
  ];
  const enAlerte = signaux.filter((s) => s.etat === "alert");
  const alerte = enAlerte.length > 0;
  const titre = alerte ? `[VEILLE] ${enAlerte.length} alerte(s) : ${enAlerte.map((s) => s.cle).join(", ")}` : "";
  const tri = [...signaux].sort((a, b) => ORDRE[b.etat] - ORDRE[a.etat]);
  const resume = tri.map((s) => `${SYMBOLE[s.etat]} ${s.cle} — ${s.texte}`).join("\n");
  const corps = alerte ? [
    `**${enAlerte.length} signal(aux) en alerte** au passage du ${new Date(t).toISOString()}.`,
    "",
    "## Ce que tu fais",
    ...enAlerte.map((s) => `- **${s.cle}** : ${s.geste || "lis le détail ci-dessous et le RUNBOOK (docs/RUNBOOK_MOIS_DE_TEST.md)."}`),
    "",
    "## Tous les signaux",
    ...tri.map((s) => `- ${SYMBOLE[s.etat]} **${s.cle}** — ${s.texte}`),
    "",
    "Cette issue est ouverte par `.github/workflows/veille-production.yml` et se referme",
    "d'elle-même quand plus aucun signal n'est en alerte. Un cron GitHub est servi toutes",
    "les 2 à 5 h en pratique : un retour au vert peut mettre quelques heures à se voir.",
    "Aucun identifiant, aucun e-mail n'y figure : le dépôt est public.",
  ].join("\n") : "";
  return { signaux, alerte, titre, corps, resume };
}

// ── Garde : l'API de gestion n'exécute que du SELECT ────────────────────────
// ADR-012 : jamais de DDL/DML depuis la CI. Une requête qui n'est pas un
// SELECT (ou un WITH … SELECT) unique est REFUSÉE avant d'être envoyée.
// Les commentaires SQL sont refusés d'emblée (aucune requête du script n'en
// porte) : retirer `-- …` avant `/* … */` masquait un `;` que PostgreSQL
// exécute bel et bien (`select 1 /* -- */ ; drop table …`, constat B-T01).
// Le `;` est contrôlé sur la chaîne BRUTE, après retrait du seul `;` final.
export function estSelectSeul(sql) {
  const s = String(sql || "").trim().replace(/;\s*$/, "");
  if (!s || s.includes(";") || s.includes("--") || s.includes("/*")) return false;
  if (!/^(select|with)\b/i.test(s)) return false;
  return !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do|set|lock|refresh|reindex|cluster|execute|prepare|listen|notify)\b/i.test(s);
}

/** Toutes les mesures en échec : ce n'est pas un verdict, c'est un lecteur muet. */
export function tousInconnus(verdict) {
  const signaux = (verdict && verdict.signaux) || [];
  return signaux.length > 0 && signaux.every((s) => s.etat === "unknown");
}

// ── Lectures (réseau) ───────────────────────────────────────────────────────
// Chaque erreur est ramenée à un code HTTP ou un message COURT, sans corps de
// réponse : ces textes finissent dans une issue publique.
async function lireJson(url, options, quoi) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${quoi}`);
  return r.json();
}

export function filtreHumain() {
  return "env = 'production' and (action is null or action <> 'sentinel_observation_canary') and (meta->>'synthetic') is null";
}

export const SQL = {
  // ⚠️ ON COMPTE LE POIDS, PAS LES LIGNES — sinon ce signal MESURE
  // L'ÉCHANTILLONNAGE au lieu de l'usage. Depuis le 2026-09-19, `telemetry.js`
  // ne garde qu'une lecture `api` en HTTP 200 sur dix et l'estampille
  // `meta.ech` : une journée d'usage IDENTIQUE rend ~30 % de lignes en moins au
  // total, et jusqu'à dix fois moins sur la famille dominante. Avec un
  // `count(*)`, le seuil « journée ouvrée quasi vide » (< 100 lignes, médiane
  // des jours ouvrés > 500) pouvait donc se déclencher sur une production
  // parfaitement saine — pendant les 7 jours où la médiane porte encore des
  // journées d'avant le déploiement. **Une alarme qui crie à tort finit par ne
  // plus être lue** : elle aurait remplacé une panne silencieuse par une panne
  // ignorée, ce que ce fichier écrit lui-même à propos du seuil des crons.
  // ⚠️ MÊME CONTRAT QUE `poidsEvenement` (dashboard/server/store.js), et c'est
  // délibéré : deux lecteurs de la même table qui pondèrent différemment
  // finissent par se contredire. Une valeur absurde retombe à 1 et le poids est
  // borné à 1000 — une donnée venue du client ne décide jamais d'un
  // multiplicateur. L'historique d'avant le 19/09 n'a pas de `ech` : il pèse 1,
  // donc il compte pour lui-même et la médiane reste comparable.
  fluxHeures: `select to_char(date_trunc('hour', received_at at time zone 'Europe/Paris'), 'YYYY-MM-DD"T"HH24') as h,
      sum(case when meta->>'ech' ~ '^[0-9]{1,4}$' then least((meta->>'ech')::int, 1000) else 1 end)::int as n
    from telemetry_events where ${filtreHumain()} and received_at > now() - interval '9 days' group by 1 order by 1`,
  canaris2h: `select count(*)::int as n from telemetry_events where env = 'production' and action = 'sentinel_observation_canary' and received_at > now() - interval '2 hours'`,
  inscriptions: `select
      count(*) filter (where created_at > now() - interval '24 hours')::int as crees24h,
      count(*) filter (where created_at > now() - interval '24 hours' and email_confirmed_at is not null)::int as confirmes24h,
      count(*) filter (where created_at > now() - interval '7 days')::int as crees7j,
      count(*) filter (where created_at > now() - interval '7 days' and email_confirmed_at is not null)::int as confirmes7j,
      count(*) filter (where email_confirmed_at is null and created_at < now() - interval '24 hours' and created_at > now() - interval '30 days')::int as "nonConfirmesAnciens"
    from auth.users where deleted_at is null and coalesce(email, '') not like '%@passio-e2e.test'`,
  erreursHeures: `select to_char(date_trunc('hour', t), 'YYYY-MM-DD"T"HH24') as h, count(*)::int as n, count(distinct d)::int as appareils
    from (select received_at as t, device_id as d from telemetry_events where env = 'production' and type = 'error' and (meta->>'synthetic') is null and received_at > now() - interval '7 days'
          union all select created_at, uid from client_errors where created_at > now() - interval '7 days') x
    group by 1 order by 1`,
  erreursDerniereHeure: `select (select count(*) from telemetry_events where env = 'production' and type = 'error' and (meta->>'synthetic') is null and received_at > now() - interval '1 hour')::int
      + (select count(*) from client_errors where created_at > now() - interval '1 hour')::int as "derniereHeure",
      (select count(distinct device_id) from telemetry_events where env = 'production' and type = 'error' and (meta->>'synthetic') is null and received_at > now() - interval '1 hour')::int
      + (select count(distinct uid) from client_errors where created_at > now() - interval '1 hour')::int as appareils`,
  api: `select
      count(*) filter (where http_status >= 500)::int as "n5xx",
      count(distinct device_id) filter (where http_status >= 500)::int as "app5xx",
      count(*) filter (where http_status in (401, 403) and coalesce(endpoint, '') not like '%/auth/v1%')::int as "nRefus",
      count(distinct device_id) filter (where http_status in (401, 403) and coalesce(endpoint, '') not like '%/auth/v1%')::int as "appRefus"
    from telemetry_events where env = 'production' and type = 'api' and received_at > now() - interval '1 hour'`,
  tailleBase: `select pg_database_size(current_database())::bigint as octets`,
  purgePlanifiee: `select exists(select 1 from cron.job where jobname like 'purge_telemetry%' and active) as purge`,
  usage7j: `select count(distinct device_id)::int as "appareils7j" from telemetry_events where ${filtreHumain()} and received_at > now() - interval '7 days'`,
  erreurs24h: `select (select count(*) from telemetry_events where env = 'production' and type = 'error' and (meta->>'synthetic') is null and received_at > now() - interval '24 hours')::int
      + (select count(*) from client_errors where created_at > now() - interval '24 hours')::int as "erreurs24h"`,
};

for (const [k, q] of Object.entries(SQL)) if (!estSelectSeul(q)) throw new Error(`SQL.${k} n'est pas un SELECT seul`);

/** API de gestion Supabase, SELECT seulement (scripts/schema-executable.js fait de même). */
export async function lireSql(env, sql) {
  if (!estSelectSeul(sql)) throw new Error("requête refusée : SELECT seul");
  const ref = env.SUPABASE_PROJECT_REF || "njkiyoklssvefstljemx";
  return lireJson(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  }, "api.supabase.com/database/query");
}

async function lireGitHub(env, chemin, { entetes = false } = {}) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "passio-veille" },
  });
  if (entetes) return { statut: r.status, entetes: r.headers };
  if (!r.ok) throw new Error(`HTTP ${r.status} sur api.github.com/${chemin.split("?")[0]}`);
  return r.json();
}

const enErreur = (e) => ({ erreur: String((e && e.message) || e).slice(0, 160) });
const mesure = async (f) => { try { return await f(); } catch (e) { return enErreur(e); } };

export async function mesurerFlux(env) {
  const heures = await lireSql(env, SQL.fluxHeures);
  const c = await lireSql(env, SQL.canaris2h);
  return { heures, canaris2h: Number(c[0] && c[0].n) };
}
export async function mesurerInscriptions(env) { return (await lireSql(env, SQL.inscriptions))[0]; }
export async function mesurerErreurs(env) {
  const heures = await lireSql(env, SQL.erreursHeures);
  const d = (await lireSql(env, SQL.erreursDerniereHeure))[0] || {};
  return { heures, derniereHeure: d.derniereHeure, appareils: d.appareils };
}
export async function mesurerApi(env) { return (await lireSql(env, SQL.api))[0]; }

export async function mesurerDeploiement(env) {
  const repo = env.GITHUB_REPOSITORY;
  const prod = (env.PASSIO_PROD_URL || "https://passio-app.netlify.app").replace(/\/+$/, "");
  const release = await lireJson(`${prod}/release.json?veille=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } }, "release.json");
  const main = await lireGitHub(env, `repos/${repo}/commits/main`);
  const runs = await lireGitHub(env, `repos/${repo}/actions/workflows/deploy.yml/runs?branch=main&event=push&per_page=5`);
  const liste = (runs && runs.workflow_runs) || [];
  const enCours = liste.some((r) => r.status !== "completed");
  const dernier = liste.find((r) => r.status === "completed") || null;
  return {
    commitServi: release && release.commit ? String(release.commit) : null,
    mainHead: main && main.sha ? String(main.sha) : null,
    mainHeadDate: main && main.commit && main.commit.committer ? main.commit.committer.date : null,
    dernierRun: dernier ? { status: dernier.status, conclusion: dernier.conclusion, head_sha: dernier.head_sha, updated_at: dernier.updated_at, html_url: dernier.html_url } : null,
    enCours,
  };
}

export async function mesurerCrons(env) {
  const repo = env.GITHUB_REPOSITORY;
  const out = {};
  for (const nom of Object.keys(SEUILS_CRONS)) {
    try {
      const wf = await lireGitHub(env, `repos/${repo}/actions/workflows/${nom}.yml`);
      const runs = await lireGitHub(env, `repos/${repo}/actions/workflows/${nom}.yml/runs?status=completed&per_page=1&exclude_pull_requests=true`);
      const r = runs && runs.workflow_runs && runs.workflow_runs[0];
      out[nom] = { state: wf && wf.state, dernierRunFin: r ? r.updated_at : null };
    } catch (e) { out[nom] = enErreur(e); }
  }
  return out;
}

export async function mesurerBase(env) {
  const url = (env.SUPABASE_URL || "https://njkiyoklssvefstljemx.supabase.co").replace(/\/+$/, "");
  let anonStatus = null;
  try {
    const r = await fetch(`${url}/rest/v1/passions?select=id&limit=1`, { headers: { apikey: env.SUPABASE_ANON_KEY || "", Authorization: `Bearer ${env.SUPABASE_ANON_KEY || ""}` } });
    anonStatus = r.status;
  } catch { anonStatus = 0; }
  const taille = await mesure(() => lireSql(env, SQL.tailleBase));
  const purge = await mesure(() => lireSql(env, SQL.purgePlanifiee));
  return {
    anonStatus,
    octets: Array.isArray(taille) && taille[0] ? Number(taille[0].octets) : null,
    purgePlanifiee: Array.isArray(purge) && purge[0] ? purge[0].purge === true : null,
  };
}

export async function mesurerJetons(env) {
  const out = {};
  try {
    const r = await lireGitHub({ GH_TOKEN: env.SENTINELLE_TOKEN }, "user", { entetes: true });
    const exp = r.entetes.get("github-authentication-token-expiration");
    const ms = exp ? Date.parse(exp) : NaN;
    out.github = { statut: r.statut, joursRestants: Number.isFinite(ms) ? Math.floor((ms - Date.now()) / (24 * H)) : null };
  } catch (e) { out.github = { statut: 0 }; }
  try {
    const r = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
    out.supabase = { statut: r.status };
  } catch { out.supabase = { statut: 0 }; }
  try {
    const r = await fetch("https://api.netlify.com/api/v1/user", { headers: { Authorization: `Bearer ${env.NETLIFY_AUTH_TOKEN}` } });
    out.netlify = { statut: r.status };
  } catch { out.netlify = { statut: 0 }; }
  return out;
}

/** Les trois chiffres d'usage que le digest reprend (comptages seulement). */
export async function mesurerUsage(env) {
  const inscriptions = await mesure(() => mesurerInscriptions(env));
  const u = await mesure(() => lireSql(env, SQL.usage7j));
  const e = await mesure(() => lireSql(env, SQL.erreurs24h));
  return {
    inscriptions,
    appareils7j: Array.isArray(u) && u[0] ? Number(u[0].appareils7j) : null,
    erreurs24h: Array.isArray(e) && e[0] ? Number(e[0].erreurs24h) : null,
  };
}

export async function mesurer(env) {
  return {
    flux: await mesure(() => mesurerFlux(env)),
    inscriptions: await mesure(() => mesurerInscriptions(env)),
    erreurs: await mesure(() => mesurerErreurs(env)),
    api: await mesure(() => mesurerApi(env)),
    deploiement: await mesure(() => mesurerDeploiement(env)),
    crons: await mesure(() => mesurerCrons(env)),
    base: await mesure(() => mesurerBase(env)),
    jetons: await mesure(() => mesurerJetons(env)),
  };
}

const estPrincipal = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (estPrincipal) {
  const env = process.env;
  const manquants = ["SUPABASE_ACCESS_TOKEN", "GH_TOKEN", "GITHUB_REPOSITORY"].filter((k) => !env[k]);
  if (manquants.length) {
    console.error(`Variables absentes : ${manquants.join(", ")} — la veille est AVEUGLE, elle refuse de rendre « rien à signaler ».`);
    process.exit(2);
  }
  mesurer(env).then((mesures) => {
    const v = verdictVeille(mesures, Date.now());
    // Si TOUTES les lectures ont échoué, ce n'est pas un verdict, c'est une panne
    // du lecteur : on sort en erreur pour que l'issue [VEILLE MUETTE] parte.
    if (tousInconnus(v)) {
      console.error("Aucune mesure n'a pu être lue :\n" + v.resume);
      process.exit(2);
    }
    if (process.argv.includes("--json")) console.log(JSON.stringify(v));
    else console.log(v.resume + (v.alerte ? "\n\n" + v.titre + "\n\n" + v.corps : ""));
    process.exit(v.alerte ? 3 : 0);
  }).catch((e) => { console.error("Panne du lecteur : " + (e && e.message)); process.exit(2); });
}
