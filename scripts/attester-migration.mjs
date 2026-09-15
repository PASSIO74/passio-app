#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ATTESTER LA REVUE PRÉALABLE D'UNE MIGRATION — ASTRA-33 ②
//
//   node scripts/attester-migration.mjs migrations/<f>.sql --cible <ref> \
//        --pr '#451' --relecteur '<nom>' --source '<url ou chemin>' \
//        [--revue-le AAAA-MM-JJ] [--remplacer]
//
// ⚠️ DATE REVENDIQUÉE ET DATE DE CONSIGNATION SONT DEUX CHAMPS. `revue_le` est
// la date que l'on REVENDIQUE pour la revue ; `consigne_le` est la date à
// laquelle cette ligne a été écrite. Quand elles diffèrent, l'entrée porte
// `retroactif: true` et la barrière le DIT à chaque envoi. Une reconstruction
// après coup reste une reconstruction : elle ne devient jamais « préalable ».
//
// Il calcule l'empreinte SHA-256 du fichier TEL QU'IL EST sur le disque et
// l'inscrit dans `.passio/migrations/attestations.json`. Il n'applique rien, ne
// parle à aucun projet, n'a besoin d'aucun jeton.
//
// ⚠️ CE QU'IL N'EST PAS : une revue. Il enregistre qu'une revue a eu lieu sur un
// contenu précis, pour une cible précise. Poser l'attestation AVANT la revue,
// ou après avoir retouché le fichier, c'est exactement le geste que la barrière
// existe pour empêcher — et elle le verra, puisqu'elle recalcule l'empreinte.
//
// ⚠️ IL REFUSE D'ÉCRASER sans `--remplacer` : une réattestation est un geste
// délibéré (le contenu a changé, donc la revue précédente ne vaut plus), jamais
// un effet de bord d'une commande relancée.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, relative, sep, dirname } from "node:path";
import { createRequire } from "node:module";
const BAR = createRequire(import.meta.url)("./lib/barriere-migration.js");

const args = process.argv.slice(2);
const val = (nom) => { const i = args.indexOf("--" + nom); return i >= 0 ? args[i + 1] : null; };
function echec(m) { console.error("❌ " + m); process.exit(2); }

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const fichier = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--remplacer"));
if (!fichier) echec("usage : node scripts/attester-migration.mjs migrations/<f>.sql --cible <ref> --pr '#N' --relecteur '<nom>' --source '<où lire la revue>'");

const rel = relative(racine, resolve(fichier)).split(sep).join("/");
if (!rel.startsWith("migrations/") || !rel.endsWith(".sql")) echec("fichier de migration attendu sous migrations/ (reçu : " + rel + ")");
if (!existsSync(resolve(fichier))) echec("fichier introuvable : " + rel);

const cible = val("cible"), pr = val("pr"), relecteur = val("relecteur"), source = val("source");
const aujourdhui = new Date().toISOString().slice(0, 10);
const revueLe = val("revue-le") || aujourdhui;
if (!/^\d{4}-\d{2}-\d{2}$/.test(revueLe)) echec("`--revue-le` attend AAAA-MM-JJ (reçu : " + revueLe + ").");
if (revueLe > aujourdhui) echec("`--revue-le` est dans le futur (" + revueLe + ") : une revue à venir n'atteste rien.");
for (const [n, v] of [["cible", cible], ["pr", pr], ["relecteur", relecteur], ["source", source]]) {
  if (!v) echec("`--" + n + "` est obligatoire : une attestation sans " + n + " n'atteste rien.");
}
try { BAR.choisirCible({ argProjet: cible }); } catch (e) { echec(e.message); }

const sql = readFileSync(resolve(fichier), "utf8");
const emp = BAR.empreinte(sql);
const chemin = resolve(racine, ".passio", "migrations", "attestations.json");
let liste = [];
if (existsSync(chemin)) { try { liste = JSON.parse(readFileSync(chemin, "utf8")); } catch (e) { echec("attestations.json illisible : " + e.message); } }
if (!Array.isArray(liste)) echec("attestations.json doit être un tableau.");

const memeFichierCible = liste.filter((a) => a.fichier === rel && (a.cibles || []).includes(cible));
if (memeFichierCible.length && !args.includes("--remplacer")) {
  const a = memeFichierCible[0];
  if (a.empreinte === emp) { console.log("déjà attesté à l'identique (" + emp.slice(0, 12) + "… · " + a.pr + " · " + a.relecteur + " · " + a.revue_le + "). Rien à faire."); process.exit(0); }
  echec("une attestation existe pour `" + rel + "` sur `" + cible + "`, mais sur un AUTRE contenu :\n" +
        "   attestée : " + a.empreinte + " (" + a.pr + " · " + a.relecteur + " · " + a.revue_le + ")\n" +
        "   sur le disque : " + emp + "\n" +
        "   Le fichier a changé depuis cette revue. Faire revoir le contenu exact, puis `--remplacer`.");
}

const entree = { fichier: rel, empreinte: emp, cibles: [cible], pr, relecteur, revue_le: revueLe, consigne_le: aujourdhui, source };
if (revueLe !== aujourdhui) { entree.retroactif = true; entree.note = "consignée le " + aujourdhui + " pour une revue revendiquée le " + revueLe + " — reconstruction, jamais une revue préalable"; }
const gardees = liste.filter((a) => !(a.fichier === rel && (a.cibles || []).includes(cible)));
const remplacees = liste.length - gardees.length;
gardees.push(entree);
mkdirSync(dirname(chemin), { recursive: true });
writeFileSync(chemin, JSON.stringify(gardees, null, 2) + "\n", "utf8");
console.log("✅ attestation inscrite" + (remplacees ? " (" + remplacees + " remplacée(s))" : "") + " :");
console.log("   " + rel + "\n   " + emp + "\n   cible " + cible + " · " + pr + " · " + relecteur + " · revue revendiquée le " + entree.revue_le + " · consignée le " + entree.consigne_le + "\n   source : " + source);
if (entree.retroactif) console.log("   ⚠️ RÉTROACTIVE : " + entree.note);
console.log("\n⚠️ Toute modification ultérieure du fichier invalide cette attestation : la barrière recalcule l'empreinte à chaque envoi.");
