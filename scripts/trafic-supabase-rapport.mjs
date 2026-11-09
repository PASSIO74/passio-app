#!/usr/bin/env node
// Rapport de la sonde `scripts/trafic-supabase-tests.cjs` : ce que les suites
// Playwright ont réellement envoyé à un projet Supabase.
//
//   node scripts/trafic-supabase-rapport.mjs <dossier> [--json] [--suites N]
//
// « Parties » = requêtes arrivées au réseau : une ADRESSE DE SERVEUR non nulle,
// seule preuve d'un départ. « Servies » = répondues par une route (`fulfill`).
// « Échouées » = jamais répondues — abandon par une route (`abort`, y compris une
// coupure simulée avec un code de panne) ou vraie panne : le libellé ne permet pas
// de trancher, le rapport les compte par code et signale ceux qui ressemblent à
// une vraie tentative (DNS, tunnel du proxy).
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
// Un échec n'est jamais une partie, même dans un journal écrit par une version
// antérieure de la sonde (qui le marquait `net: true`).
const parties = http.filter((l) => l.net === true && !l.echec);
const echouees = http.filter((l) => !!l.echec);
const servies = http.filter((l) => !l.echec && l.net !== true);
const ws = lignes.filter((l) => l.m === "WS");
// Les libellés d'une VRAIE tentative (le DNS, le tunnel du proxy) — à vérifier :
// une route peut aussi les simuler, mais une suite le fait rarement.
const TENTATIVE = /ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED/;
const suspectes = echouees.filter((l) => TENTATIVE.test(l.echec));

function compter(liste, cle) {
  const m = new Map();
  for (const l of liste) m.set(cle(l), (m.get(cle(l)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const parFamille = compter(parties, (l) => famille(l.path) + " " + l.m);
const parSuite = compter(parties, (l) => l.f);
const parProjet = compter(parties, (l) => l.p || "?");

const parEchec = compter(echouees, (l) => l.echec);

const rapport = {
  requetes: http.length,
  parties: parties.length,
  servies: servies.length,
  echouees: echouees.length,
  echoueesParCode: Object.fromEntries(parEchec),
  tentativesProbables: Object.fromEntries(compter(suspectes, (l) => l.f + " · " + l.echec)),
  websockets: ws.length,
  parProjet: Object.fromEntries(parProjet),
  parFamille: Object.fromEntries(parFamille),
  parSuite: Object.fromEntries(parSuite.slice(0, nSuites)),
  suitesExposees: parSuite.length,
};

if (json) {
  console.log(JSON.stringify(rapport, null, 2));
} else {
  console.log(`Requêtes vers Supabase : ${rapport.requetes} — PARTIES au réseau : ${rapport.parties}, servies par une route : ${rapport.servies}, échouées : ${rapport.echouees} (WebSocket observés : ${rapport.websockets})`);
  if (!rapport.requetes) {
    console.log("⚠️  ZÉRO requête observée : la sonde est-elle chargée (NODE_OPTIONS) et TRAFIC_DIR posé ? Une suite démarre forcément le référentiel des passions.");
  }
  if (parEchec.length) {
    console.log("\nÉchouées, par code (abandon par une route ou vraie panne — le libellé ne tranche pas) :");
    for (const [k, v] of parEchec.slice(0, 10)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  }
  if (suspectes.length) {
    console.log(`\n⚠️  ${suspectes.length} échec(s) au libellé d'une VRAIE tentative (DNS, proxy) — à vérifier :`);
    for (const [k, v] of compter(suspectes, (l) => l.f + " · " + l.echec).slice(0, 10)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  }
  console.log(`\nPar projet Playwright : ${parProjet.map(([k, v]) => k + "=" + v).join(", ") || "—"}`);
  console.log("\nParties au réseau, par famille :");
  for (const [k, v] of parFamille.slice(0, 40)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  console.log(`\nSuites exposées : ${parSuite.length} (les ${Math.min(nSuites, parSuite.length)} premières)`);
  for (const [k, v] of parSuite.slice(0, nSuites)) console.log(`  ${String(v).padStart(6)}  ${k}`);
}
