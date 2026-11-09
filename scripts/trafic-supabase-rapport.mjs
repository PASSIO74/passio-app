#!/usr/bin/env node
// Rapport de la sonde `scripts/trafic-supabase-tests.cjs` : ce que les suites
// Playwright ont réellement envoyé à un projet Supabase.
//
//   node scripts/trafic-supabase-rapport.mjs <dossier> [--json] [--suites N]
//
// « Parties » = requêtes arrivées au réseau (adresse de serveur non nulle, ou
// échec réseau autre qu'un abandon par route). « Servies » = répondues par une
// route (`fulfill`). « Abandonnées » = coupées par une route (`abort`).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dossier = args.find((a) => !a.startsWith("--"));
if (!dossier) {
  console.error("usage : node scripts/trafic-supabase-rapport.mjs <dossier> [--json] [--suites N]");
  process.exit(2);
}
const json = args.includes("--json");
const iSuites = args.indexOf("--suites");
const nSuites = iSuites !== -1 ? Number(args[iSuites + 1]) || 25 : 25;

const lignes = [];
for (const f of readdirSync(dossier).filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(path.join(dossier, f), "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { lignes.push(JSON.parse(l)); } catch (e) {}
  }
}

function famille(p) {
  if (p.startsWith("/rest/v1/rpc/")) return "rpc:" + p.split("/")[4];
  if (p.startsWith("/rest/v1/")) return "rest:" + (p.split("/")[3] || "");
  if (p.startsWith("/auth/v1/")) return "auth:" + (p.split("/")[3] || "");
  if (p.startsWith("/storage/v1/")) return "storage:" + (p.split("/")[3] || "");
  if (p.startsWith("/functions/v1/")) return "functions:" + (p.split("/")[3] || "");
  if (p.startsWith("/realtime/")) return "realtime";
  return "autre";
}

const http = lignes.filter((l) => l.m !== "WS");
const parties = http.filter((l) => l.net === true);
const abandonnees = http.filter((l) => l.net === false && l.echec);
const servies = http.filter((l) => l.net === false && !l.echec);
const ws = lignes.filter((l) => l.m === "WS");

function compter(liste, cle) {
  const m = new Map();
  for (const l of liste) m.set(cle(l), (m.get(cle(l)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const parFamille = compter(parties, (l) => famille(l.path) + " " + l.m);
const parSuite = compter(parties, (l) => l.f);
const parProjet = compter(parties, (l) => l.p || "?");

const rapport = {
  requetes: http.length,
  parties: parties.length,
  servies: servies.length,
  abandonnees: abandonnees.length,
  websockets: ws.length,
  parProjet: Object.fromEntries(parProjet),
  parFamille: Object.fromEntries(parFamille),
  parSuite: Object.fromEntries(parSuite.slice(0, nSuites)),
  suitesExposees: parSuite.length,
};

if (json) {
  console.log(JSON.stringify(rapport, null, 2));
} else {
  console.log(`Requêtes vers Supabase : ${rapport.requetes} — PARTIES au réseau : ${rapport.parties}, servies par une route : ${rapport.servies}, abandonnées : ${rapport.abandonnees} (WebSocket observés : ${rapport.websockets})`);
  if (!rapport.requetes) {
    console.log("⚠️  ZÉRO requête observée : la sonde est-elle chargée (NODE_OPTIONS) et TRAFIC_DIR posé ? Une suite démarre forcément le référentiel des passions.");
  }
  console.log(`\nPar projet Playwright : ${parProjet.map(([k, v]) => k + "=" + v).join(", ") || "—"}`);
  console.log("\nParties au réseau, par famille :");
  for (const [k, v] of parFamille.slice(0, 40)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  console.log(`\nSuites exposées : ${parSuite.length} (les ${Math.min(nSuites, parSuite.length)} premières)`);
  for (const [k, v] of parSuite.slice(0, nSuites)) console.log(`  ${String(v).padStart(6)}  ${k}`);
}
