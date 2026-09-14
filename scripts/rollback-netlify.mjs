#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// REVENIR À UN DÉPLOIEMENT PRÉCÉDENT SUR NETLIFY — en secondes, pas en heures
//
//   node scripts/rollback-netlify.mjs                      # liste les déploiements de production
//   node scripts/rollback-netlify.mjs --restaurer precedent  # remet en ligne celui d'AVANT le courant
//   node scripts/rollback-netlify.mjs --restaurer <deployId>  # ou un déploiement précis
//
// EXP-03 (contre-revue Astra) : « rollback jamais exercé, délai réel ≥ 45–80
// min, aucun rollback Netlify documenté ni kill switch distant ». Le chemin
// existant (`.github/workflows/rollback.yml`) ouvre une PR de revert qui
// repasse par toute la CI : c'est le chemin PROPRE, et c'est le chemin LENT.
// Celui-ci est le chemin d'URGENCE : Netlify garde chaque déploiement de
// production en entier (HTML, app.js, styles, sw.js, release.json), et
// `POST /deploys/<id>/restore` le remet en ligne SANS RECONSTRUIRE. Mesuré le
// 2026-09-14 : voir docs/RECUPERATION.md. Le script ne déclare jamais
// « restauré » sur la foi de l'API : il relit `release.json` sur le site servi
// jusqu'à y lire le commit attendu, et rend le délai mesuré.
//
// ⚠️ CE QUE ÇA NE FAIT PAS : ni la base (une migration ne se « dé-déploie »
// pas — chaque migration porte sa propre section de retour arrière), ni les
// Edge Functions Supabase (`supabase functions deploy` d'une version
// antérieure), ni le service worker déjà installé chez quelqu'un — il prendra
// la version restaurée à son prochain démarrage, comme pour tout déploiement.
// ⚠️ ET C'EST UN GESTE QUI ÉCRASE LA PRODUCTION : un restore n'est pas un
// brouillon. Il est réversible par le même geste vers l'autre déploiement.
//
// Jeton : `NETLIFY_AUTH_TOKEN`, sinon celui de la CLI Netlify de ce poste
// (`%APPDATA%/netlify/Config/config.json`, posé par `netlify login`).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SITE = "eee53fe0-9fb2-41f4-ab70-0a4e2c3f01a1";   // passio-app.netlify.app (même id que deploy.yml)
const URL_SITE = "https://passio-app.netlify.app";
const API = "https://api.netlify.com/api/v1";

function echec(m) { console.error("❌ " + m); process.exit(2); }
if (process.env.GITHUB_ACTIONS) echec("un rollback d'urgence est un geste de poste, jamais de CI.");

function jeton() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN.trim();
  const candidats = [
    process.env.APPDATA ? join(process.env.APPDATA, "netlify", "Config", "config.json") : null,
    join(homedir(), ".config", "netlify", "config.json"),
    join(homedir(), "Library", "Preferences", "netlify", "config.json"),
  ].filter(Boolean);
  for (const p of candidats) {
    if (!existsSync(p)) continue;
    try { const c = JSON.parse(readFileSync(p, "utf8")); const u = Object.values(c.users || {})[0]; if (u && u.auth && u.auth.token) return u.auth.token; } catch (e) {}
  }
  return null;
}
const TOK = jeton();
if (!TOK) echec("aucun jeton Netlify : NETLIFY_AUTH_TOKEN, ou `netlify login` sur ce poste.");

async function api(chemin, options = {}) {
  const r = await fetch(API + chemin, { ...options, headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`Netlify ${chemin} : HTTP ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

async function deploiementsProduction() {
  const l = await api(`/sites/${SITE}/deploys?per_page=30`);
  return l.filter((d) => d.context === "production" && d.state === "ready");
}

async function releaseServie(base = URL_SITE) {
  const r = await fetch(`${base}/release.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

// Les déploiements sont poussés par la CLI (deploy.yml), pas par le lien git :
// `commit_ref` est vide. Le commit se lit dans le `release.json` que chaque
// déploiement sert sur sa propre adresse (`<id>--passio-app.netlify.app`).
async function commitDu(d) {
  try { const r = await releaseServie(d.deploy_ssl_url || `https://${d.id}--passio-app.netlify.app`); return r && r.commit ? r.commit : null; } catch (e) { return null; }
}

const args = process.argv.slice(2);
const iR = args.indexOf("--restaurer");

const prods = await deploiementsProduction();
const site = await api(`/sites/${SITE}`);
const courant = site.published_deploy && site.published_deploy.id;
console.log(`site ${site.name} — déploiements de production prêts : ${prods.length} (courant : ${courant})`);
for (const d of prods.slice(0, 8)) {
  const c = await commitDu(d);
  console.log(`  ${d.id === courant ? "▶" : " "} ${d.id}  ${(d.published_at || d.created_at || "").slice(0, 19)}  commit ${(c || "?").slice(0, 8)}`);
}

if (iR === -1) { console.log("\n(rien n'a été changé — `--restaurer precedent` ou `--restaurer <id>` pour agir)"); process.exit(0); }

let cible = args[iR + 1];
if (!cible) echec("--restaurer attend `precedent` ou un identifiant de déploiement.");
if (cible === "precedent") {
  const i = prods.findIndex((d) => d.id === courant);
  const prev = prods[i + 1];
  if (!prev) echec("aucun déploiement de production avant le courant.");
  cible = prev.id;
}
const d = prods.find((x) => x.id === cible);
if (!d) echec(`déploiement ${cible} introuvable parmi les déploiements de production prêts.`);
if (d.id === courant) echec("ce déploiement est DÉJÀ celui qui est en ligne.");

const attendu = await commitDu(d);
if (!attendu) echec(`impossible de lire le release.json du déploiement ${d.id} : on ne restaure pas ce qu'on ne sait pas vérifier.`);
const avant = await releaseServie();
console.log(`\nrestauration de ${d.id} (commit ${attendu.slice(0, 8)}) — servi avant : commit ${avant && avant.commit ? avant.commit.slice(0, 8) : "?"}`);
const t0 = Date.now();
await api(`/sites/${SITE}/deploys/${d.id}/restore`, { method: "POST" });
const tApi = Date.now();

// Le verdict est ce que le SITE sert, pas ce que l'API répond.
let servi = null;
for (let i = 0; i < 60; i++) {
  servi = await releaseServie();
  if (servi && servi.commit === attendu) break;
  await new Promise((r) => setTimeout(r, 2000));
}
const tServi = Date.now();
const ok = !!(servi && servi.commit === attendu);
console.log(`API : ${((tApi - t0) / 1000).toFixed(1)} s · site servi conforme : ${ok ? "OUI" : "NON"} après ${((tServi - t0) / 1000).toFixed(1)} s (release.json commit ${servi && servi.commit ? servi.commit.slice(0, 8) : "?"}, build ${servi && servi.buildId})`);
if (!ok) { console.log("❌ le site ne sert pas le commit attendu — ne pas conclure, lire le tableau de bord Netlify."); process.exit(1); }
console.log(`✅ en ligne : ${d.id}. Retour : node scripts/rollback-netlify.mjs --restaurer ${courant}`);
