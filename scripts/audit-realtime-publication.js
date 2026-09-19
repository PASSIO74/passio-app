#!/usr/bin/env node
/**
 * GATE — la publication realtime et les souscriptions du dépôt disent-elles la
 * même chose ?
 *
 * POURQUOI ELLE EXISTE. Le 2026-09-19, la publication `supabase_realtime`
 * portait 25 tables pour 12 abonnées — dont six tables `cdv_*` d'une
 * fonctionnalité retirée par ADR-011 sept semaines plus tôt. Personne ne
 * pouvait le voir : une table publiée en trop ne lève rien, elle coûte.
 *
 * ⚠️ ET LE DÉFAUT SYMÉTRIQUE EST PIRE, parce qu'il est MUET DANS L'AUTRE SENS :
 * un `.on("postgres_changes", …, { table: "x" })` sur une table ABSENTE de la
 * publication ne lève aucune erreur, la souscription passe `SUBSCRIBED`, et elle
 * ne reçoit simplement jamais rien. C'est indiscernable de « il ne s'est rien
 * passé ». C'est CE sens-là que la gate garde en premier.
 *
 * ⚠️ L'INVENTAIRE SE FAIT SUR TOUT LE DÉPÔT, BACKEND COMPRIS. La première
 * analyse de ce lot avait classé `telemetry_events` « aucun abonné » en ne
 * lisant que `js/` : le Centre de pilotage s'y abonne depuis
 * `dashboard/server/ingest.js` et en tire tout son flux SSE. La retirer aurait
 * éteint le direct du tableau de bord sans une erreur (repli silencieux sur le
 * polling). D'où RACINES ci-dessous, et pas seulement `js/`.
 *
 * La gate ne lit PAS la base (la CI n'a pas d'accès en lecture à la prod) : elle
 * compare le CODE au fichier déclaratif. L'état réel en base se mesure au canal
 * ① d'ADR-012, comme tout interrupteur serveur.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINES = ["js", "dashboard/server"];
const DECLARE = path.join(__dirname, "realtime-publication.json");

// ⚠️ RÉCURSIF, ET C'EST LE CŒUR DE LA GATE. La première version ne lisait que
// le premier niveau de chaque racine : une souscription posée dans un
// sous-dossier n'était pas comptée, et l'oubli était MUET dans le sens ① —
// celui que l'en-tête déclare garder en premier parce qu'il ne lève rien.
// Une gate aveugle à un changement de rangement est une gate qui rend vert sur
// le défaut (relevé par `audit-passio`).
function fichiersJs(dir) {
  const abs = path.join(__dirname, "..", dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  (function descendre(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const complet = path.join(d, e.name);
      // `vendor/` est du code tiers épinglé : on n'y dépose pas de code maison
      // (règle du 2026-09-11), et `node_modules` n'a rien à faire ici.
      if (e.isDirectory()) { if (e.name !== "vendor" && e.name !== "node_modules") descendre(complet); }
      else if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) out.push(complet);
    }
  })(abs);
  return out;
}

// Une souscription s'écrit `.on("postgres_changes", { …, table: "x" }, cb)`.
// On repart de CHAQUE occurrence de `postgres_changes` et on prend le premier
// `table: "…"` dans la fenêtre qui suit — un `table:` isolé ailleurs dans le
// fichier (app-04 en a, pour choisir une table REST) ne doit pas compter.
const illisibles = [];
function souscriptions(fichier) {
  const src = fs.readFileSync(fichier, "utf8");
  const out = [];
  let i = 0;
  while ((i = src.indexOf("postgres_changes", i)) !== -1) {
    const fenetre = src.slice(i, i + 400);
    // ⚠️ LES TROIS FORMES DE GUILLEMETS. N'accepter que le double faisait
    // manquer une souscription écrite en simples ou en gabarit — sans le dire.
    const m = /table:\s*["'`]([a-z0-9_]+)["'`]/.exec(fenetre);
    if (m) { out.push({ table: m[1], fichier: path.relative(path.join(__dirname, ".."), fichier) }); }
    // ⚠️ ET UNE TABLE QU'ON NE SAIT PAS LIRE N'EST PAS UNE TABLE ABSENTE.
    // Un `table: LA_CONSTANTE` ou un nom calculé ne se résout pas ici : plutôt
    // que de l'ignorer en silence — le défaut exact que cette gate existe pour
    // empêcher — on le SIGNALE, à charge d'écrire le nom en clair.
    else if (/table:/.test(fenetre)) illisibles.push(path.relative(path.join(__dirname, ".."), fichier));
    i += "postgres_changes".length;
  }
  return out;
}

const declare = JSON.parse(fs.readFileSync(DECLARE, "utf8"));
const publiees = new Set(declare.publiees);
const tolerees = declare.publieesSansAbonne || {};

const trouvees = [];
for (const r of RACINES) for (const f of fichiersJs(r)) trouvees.push(...souscriptions(f));

const abonnees = new Map();
for (const s of trouvees) {
  if (!abonnees.has(s.table)) abonnees.set(s.table, new Set());
  abonnees.get(s.table).add(s.fichier);
}

const erreurs = [];

// ③ Ce que la gate n'a pas su lire : jamais en silence.
for (const f of [...new Set(illisibles)]) {
  erreurs.push(
    `dans ${f}, un \`postgres_changes\` désigne sa table autrement qu'en toutes lettres.\n` +
    `      → la gate ne peut pas la vérifier, donc elle ne garantit plus rien pour ce fichier.\n` +
    `      → écrire \`table: "nom_en_clair"\`.`
  );
}

// ① Le sens MUET : abonné sans être publié → ne recevra jamais rien.
for (const [t, fichiers] of abonnees) {
  if (!publiees.has(t)) {
    erreurs.push(
      `souscription à « ${t} » (${[...fichiers].join(", ")}) mais la table n'est PAS publiée.\n` +
      `      → elle ne recevra JAMAIS d'événement, et rien ne le dira.\n` +
      `      → republier : alter publication supabase_realtime add table public.${t};\n` +
      `      → puis l'ajouter à scripts/realtime-publication.json`
    );
  }
}

// ② Le sens COÛTEUX : publié sans abonné → du WAL décodé pour personne.
for (const t of publiees) {
  if (!abonnees.has(t) && !(t in tolerees)) {
    erreurs.push(
      `« ${t} » est publiée mais AUCUN postgres_changes ne l'écoute dans ${RACINES.join(" / ")}.\n` +
      `      → soit la retirer de la publication (et du fichier déclaratif),\n` +
      `      → soit l'inscrire dans "publieesSansAbonne" AVEC SA RAISON.`
    );
  }
}

if (erreurs.length) {
  console.error("❌ publication realtime et souscriptions divergent :\n");
  erreurs.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`));
  process.exit(1);
}

console.log(
  `OK — publication realtime cohérente : ${publiees.size} tables publiées, ` +
  `${abonnees.size} écoutées, ${Object.keys(tolerees).length} tolérée(s) sans abonné ` +
  `(${trouvees.length} souscriptions scannées dans ${RACINES.join(", ")}).`
);
