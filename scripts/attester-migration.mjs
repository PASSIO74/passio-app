#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ATTESTER LA REVUE PRÉALABLE D'UNE MIGRATION — ASTRA-33 ②
//
//   node scripts/attester-migration.mjs migrations/<f>.sql --cible <ref> \
//        --pr '#451' --commit <sha40> --revue <id de la revue GitHub> \
//        --relecteur '<login GitHub>' --source '<url de la revue>' \
//        [--revue-le AAAA-MM-JJ] [--remplacer]
//
// ⚠️ ASTRA-51 (cinquième contre-revue, 15/09/2026) — L'ATTESTATION NE SE TAPE
// PLUS, ELLE SE VÉRIFIE. Avant : quatre champs libres, validés par leur seule
// présence ; une PR fictive, l'auteur comme relecteur et « aucune revue » en
// source rendaient « envoyable ». Désormais l'attestation DÉSIGNE une revue
// GitHub (`--commit`, `--revue`) et cet outil la LIT avant d'écrire quoi que
// ce soit (`gh api`) : revue présente, ancrée sur ce commit, portant le
// marqueur « Contre-revue technique indépendante », le chemin du fichier et
// `cible: <ref>`, signée par `--relecteur`, et fichier à ce commit identique à
// celui du disque. Sans `gh`, ou si une seule de ces conditions manque, RIEN
// n'est inscrit — une attestation non vérifiable n'atteste rien.
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
const GH = createRequire(import.meta.url)("./lib/github-revue.js");

const args = process.argv.slice(2);
const val = (nom) => { const i = args.indexOf("--" + nom); return i >= 0 ? args[i + 1] : null; };
function echec(m) { console.error("❌ " + m); process.exit(2); }

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const fichier = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--remplacer"));
if (!fichier) echec("usage : node scripts/attester-migration.mjs migrations/<f>.sql --cible <ref> --pr '#N' --relecteur '<nom>' --source '<où lire la revue>'");

const rel = relative(racine, resolve(fichier)).split(sep).join("/");
if (!rel.startsWith("migrations/") || !rel.endsWith(".sql")) echec("fichier de migration attendu sous migrations/ (reçu : " + rel + ")");
if (!existsSync(resolve(fichier))) echec("fichier introuvable : " + rel);

const cible = val("cible"), pr = val("pr"), relecteur = val("relecteur"), source = val("source"), commit = val("commit"), revueId = val("revue");
const aujourdhui = new Date().toISOString().slice(0, 10);
const revueLe = val("revue-le") || aujourdhui;
if (!/^\d{4}-\d{2}-\d{2}$/.test(revueLe)) echec("`--revue-le` attend AAAA-MM-JJ (reçu : " + revueLe + ").");
if (revueLe > aujourdhui) echec("`--revue-le` est dans le futur (" + revueLe + ") : une revue à venir n'atteste rien.");
for (const [n, v] of [["cible", cible], ["pr", pr], ["relecteur", relecteur], ["source", source], ["commit", commit], ["revue", revueId]]) {
  if (!v) echec("`--" + n + "` est obligatoire : une attestation sans " + n + " n'atteste rien (ASTRA-51 : la revue GitHub doit être désignée, pas décrite).");
}
if (!/^[0-9a-f]{40}$/.test(commit)) echec("`--commit` attend un SHA complet (40 hexadécimaux).");
if (!/^\d+$/.test(revueId)) echec("`--revue` attend l'identifiant numérique de la revue GitHub (`gh api repos/<o>/<r>/pulls/<n>/reviews --jq '.[].id'`).");
try { BAR.choisirCible({ argProjet: cible }); } catch (e) { echec(e.message); }

const sql = readFileSync(resolve(fichier), "utf8");
const emp = BAR.empreinte(sql);

// ── LA PREUVE EST LUE AVANT D'ÉCRIRE (ASTRA-51) ────────────────────────────
const revues = GH.lireRevues(pr, racine);
if (!revues) echec("les revues de la PR " + pr + " n'ont pas pu être lues (`gh api` — connecté ? dépôt `" + (GH.depot(racine) || "?") + "`) : preuve NON VÉRIFIABLE, rien n'est inscrit.");
const contenuCommit = GH.lireContenuAuCommit(rel, commit, racine);
if (contenuCommit === null) echec("`" + rel + "` n'a pas pu être lu au commit " + commit.slice(0, 12) + "… : preuve NON VÉRIFIABLE, rien n'est inscrit.");
const auteurPr = GH.lireAuteurPr(pr, racine);
let preuve;
try {
  preuve = BAR.verifierPreuveRevue({ attestation: { pr, commit, revue_id: revueId, relecteur, empreinte: emp }, fichier: rel, empreinteAttendue: emp, cible: { ref: cible }, revues, contenuAuCommit: contenuCommit, auteurPr });
} catch (e) { echec(e.message); }
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

const entree = { fichier: rel, empreinte: emp, cibles: [cible], pr, commit, revue_id: Number(revueId), relecteur, revue_le: revueLe, consigne_le: aujourdhui, source,
  revue: { etat: preuve.revue.etat, soumise_le: preuve.revue.soumise_le, meme_auteur_que_la_pr: preuve.memeAuteurQueLaPr } };
if (revueLe !== aujourdhui) { entree.retroactif = true; entree.note = "consignée le " + aujourdhui + " pour une revue revendiquée le " + revueLe + " — reconstruction, jamais une revue préalable"; }
const gardees = liste.filter((a) => !(a.fichier === rel && (a.cibles || []).includes(cible)));
const remplacees = liste.length - gardees.length;
gardees.push(entree);
mkdirSync(dirname(chemin), { recursive: true });
writeFileSync(chemin, JSON.stringify(gardees, null, 2) + "\n", "utf8");
console.log("✅ attestation inscrite" + (remplacees ? " (" + remplacees + " remplacée(s))" : "") + " :");
console.log("   " + rel + "\n   " + emp + "\n   cible " + cible + " · " + pr + " · revue n°" + revueId + " (" + preuve.revue.etat + ", " + (preuve.revue.soumise_le || "date inconnue") + ") ancrée sur " + commit.slice(0, 12) + "… · " + relecteur + " · revendiquée le " + entree.revue_le + " · consignée le " + entree.consigne_le + "\n   source : " + source);
if (preuve.memeAuteurQueLaPr) console.log("   ⚠️ le relecteur est aussi l'AUTEUR de la PR : la preuve établit un geste public ancré sur un SHA, pas une revue par un tiers.");
if (entree.retroactif) console.log("   ⚠️ RÉTROACTIVE : " + entree.note);
console.log("\n⚠️ Toute modification ultérieure du fichier invalide cette attestation : la barrière recalcule l'empreinte à chaque envoi.");
