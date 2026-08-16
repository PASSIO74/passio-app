#!/usr/bin/env node
/**
 * scripts/chatgpt.js — canal de collaboration Claude Code ↔ ChatGPT.
 *
 * Remplace le pilotage du DOM de chatgpt.com (fragile : composeur contenteditable,
 * flux d'affichage qui casse, onglet irrécupérable au-delà de ~60 000 caractères)
 * par un appel direct. Aucune dépendance : fetch natif (Node >= 18).
 *
 * Trois transports, du plus fiable au moins fiable :
 *   1. api    — OPENAI_API_KEY (facturation au jeton, indépendante de l'abonnement)
 *   2. codex  — CLI `codex exec` (réutilise l'abonnement ChatGPT ; non vérifié ici)
 *   3. chrome — Claude-in-Chrome, hors de ce script (voir la skill /chatgpt)
 *
 * Les fils sont persistés dans .passio/chatgpt/<fil>.json (+ transcription .md).
 *
 * GARDE SECRETS : rien ne part vers un tiers sans passer par detecterSecrets().
 * Refus par défaut, --redacter pour masquer et envoyer quand même.
 *
 *   node scripts/chatgpt.js etat
 *   node scripts/chatgpt.js "ta question" --fil archi
 *   node scripts/chatgpt.js "challenge ce dossier" --fichier .passio/reviews/x/DOSSIER-COMPLET.md
 *   node scripts/chatgpt.js fils | historique --fil archi | oublier --fil archi
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const DOSSIER_FILS = path.join(RACINE, ".passio", "chatgpt");
const MODELE_DEFAUT = process.env.OPENAI_MODEL || "gpt-5";
// Surchargeable pour un proxy/Azure — et c'est ce qui permet de tester le chemin
// réseau complet contre un serveur local, sans clé ni facturation.
const BASE_API = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const DELAI_MS = Number(process.env.CHATGPT_TIMEOUT_MS || 300000);

const SYSTEME_DEFAUT = [
  "Tu collabores avec Claude Code sur PASSIO, un réseau social PWA en JavaScript vanilla",
  "(aucun framework, aucun bundler, scripts classiques chargés dans l'ordre, dépendances par hoisting)",
  "adossé à Supabase (RLS par propriétaire = seule frontière de sécurité).",
  "Tu n'as AUCUN accès au dépôt, à la prod, ni aux tests : tout ce que tu sais vient du dossier transmis.",
  "Ton rôle n'est pas de valider : c'est de CHALLENGER. Dis ce qui pourrait être faux dans le raisonnement",
  "présenté, ce qui a été oublié, ce que la correction proposée risque de casser, et ce que tu NE ferais PAS.",
  "Ne propose jamais de changer de stack (framework, bundler, TypeScript) : c'est hors périmètre.",
  "Quand tu n'es pas sûr, dis-le explicitement et formule la vérification à faire dans le dépôt,",
  "plutôt que d'affirmer. Sois direct et dense, pas de préambule."
].join(" ");

/* ------------------------------------------------------------------ */
/* Garde-fou secrets                                                   */
/* ------------------------------------------------------------------ */

const MOTIFS_SECRET = [
  // La 3e section (signature) DOIT entrer dans le motif : sans elle, --redacter
  // laissait passer « …«SECRET RETIRÉ».zzzz » — mesuré le 2026-08-16.
  { nom: "JWT (jeton Supabase/auth)", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g },
  { nom: "clé secrète Supabase", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { nom: "jeton Supabase CLI", re: /\bsbp_[A-Za-z0-9]{20,}/g },
  { nom: "clé API (sk-…)", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g },
  { nom: "jeton GitHub", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { nom: "clé privée PEM", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----/g },
  { nom: "affectation de secret", re: /\b(?:SERVICE_ROLE_KEY|ANON_KEY|SESSION_SECRET|ADMIN_PASSWORD|API_KEY|ACCESS_TOKEN)\s*[=:]\s*["']?[^\s"'#]{16,}/gi },
  { nom: "mot de passe en clair", re: /\b(?:password|mot_de_passe|passwd)\s*[=:]\s*["']?[^\s"'#]{6,}/gi }
];

function detecterSecrets(texte) {
  const trouves = [];
  for (const motif of MOTIFS_SECRET) {
    motif.re.lastIndex = 0;
    let m;
    while ((m = motif.re.exec(texte)) !== null) {
      trouves.push({ nom: motif.nom, index: m.index, longueur: m[0].length, apercu: masquer(m[0]) });
      if (motif.re.lastIndex === m.index) motif.re.lastIndex++;
    }
  }
  return trouves;
}

function masquer(s) {
  if (s.length <= 12) return s.slice(0, 3) + "…";
  return s.slice(0, 8) + "…[" + (s.length - 12) + " car. masqués]…" + s.slice(-4);
}

function redacter(texte) {
  let out = texte;
  for (const motif of MOTIFS_SECRET) {
    out = out.replace(motif.re, "«SECRET RETIRÉ»");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Persistance des fils                                                */
/* ------------------------------------------------------------------ */

function slug(nom) {
  return String(nom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "defaut";
}

function cheminFil(nom) { return path.join(DOSSIER_FILS, slug(nom) + ".json"); }
function cheminTranscription(nom) { return path.join(DOSSIER_FILS, slug(nom) + ".md"); }

function chargerFil(nom) {
  const p = cheminFil(nom);
  if (!fs.existsSync(p)) {
    return { nom: slug(nom), titre: nom, cree: new Date().toISOString(), modele: null, messages: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`⚠️  Fil « ${nom} » illisible (${e.message}) — un fil neuf est ouvert.`);
    return { nom: slug(nom), titre: nom, cree: new Date().toISOString(), modele: null, messages: [] };
  }
}

function enregistrerFil(fil) {
  fs.mkdirSync(DOSSIER_FILS, { recursive: true });
  fil.maj = new Date().toISOString();
  fs.writeFileSync(cheminFil(fil.nom), JSON.stringify(fil, null, 2), "utf8");
  const md = [`# Fil ChatGPT — ${fil.titre}`, "",
    `Ouvert le ${fil.cree.slice(0, 10)} · modèle ${fil.modele || "?"} · ${fil.messages.length} messages`, ""];
  for (const m of fil.messages) {
    md.push(`## ${m.role === "user" ? "Claude Code" : "ChatGPT"} — ${(m.ts || "").slice(0, 19).replace("T", " ")}`, "", m.content, "");
  }
  fs.writeFileSync(cheminTranscription(fil.nom), md.join("\n"), "utf8");
}

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

async function appelApi(messages, options) {
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) throw new Error("OPENAI_API_KEY absente");

  const corps = { model: options.modele, messages };
  if (options.effort) corps.reasoning_effort = options.effort;

  const tentatives = 2;
  for (let i = 1; i <= tentatives; i++) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
    try {
      const r = await fetch(`${BASE_API}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
        body: JSON.stringify(corps),
        signal: ctrl.signal
      });
      clearTimeout(minuteur);
      const brut = await r.text();
      if (!r.ok) {
        let detail = brut.slice(0, 600);
        try { detail = JSON.parse(brut).error?.message || detail; } catch (_) {}
        if ((r.status === 429 || r.status >= 500) && i < tentatives) {
          console.error(`… ${r.status}, nouvelle tentative dans 5 s`);
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }
        const aide = r.status === 401 ? "\n   → clé refusée : vérifier OPENAI_API_KEY."
          : r.status === 404 ? `\n   → modèle « ${options.modele} » indisponible sur ce compte : poser OPENAI_MODEL (ex. gpt-5-mini, o4-mini).`
          : r.status === 429 ? "\n   → quota ou débit dépassé sur le compte OpenAI."
          : "";
        throw new Error(`HTTP ${r.status} — ${detail}${aide}`);
      }
      const data = JSON.parse(brut);
      const texte = data.choices?.[0]?.message?.content;
      if (!texte) throw new Error("réponse vide (finish_reason=" + (data.choices?.[0]?.finish_reason || "?") + ")");
      return { texte, usage: data.usage || null, modele: data.model || options.modele };
    } catch (e) {
      clearTimeout(minuteur);
      if (e.name === "AbortError") throw new Error(`délai dépassé (${DELAI_MS / 1000} s) — modèle de raisonnement lent, augmenter CHATGPT_TIMEOUT_MS`);
      if (i === tentatives) throw e;
    }
  }
}

function appelCodex(invite) {
  return new Promise((resolve, reject) => {
    // Non vérifié sur cette machine (codex absent) : les erreurs de CLI remontent telles quelles.
    const enfant = spawn("codex", ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"], {
      cwd: RACINE, shell: false
    });
    let sortie = "", erreur = "";
    enfant.stdout.on("data", (d) => { sortie += d; });
    enfant.stderr.on("data", (d) => { erreur += d; });
    enfant.on("error", (e) => reject(new Error(`codex injoignable : ${e.message}`)));
    enfant.on("close", (code) => {
      if (code !== 0) return reject(new Error(`codex a rendu ${code} — ${erreur.slice(0, 500)}`));
      resolve({ texte: sortie.trim(), usage: null, modele: "codex-cli" });
    });
    enfant.stdin.write(invite);
    enfant.stdin.end();
  });
}

function transportDisponible() {
  if (process.env.OPENAI_API_KEY) return "api";
  return null;
}

/* ------------------------------------------------------------------ */
/* Commandes                                                           */
/* ------------------------------------------------------------------ */

function cmdEtat() {
  const aCle = !!process.env.OPENAI_API_KEY;
  console.log("État du canal ChatGPT\n");
  console.log(`  api    ${aCle ? "✅ prête" : "❌ OPENAI_API_KEY absente"}`);
  if (aCle) console.log(`         modèle par défaut : ${MODELE_DEFAUT} (OPENAI_MODEL pour changer)`);
  console.log(`  codex  ${aExecutable("codex") ? "⚠️  CLI présent (jamais vérifié depuis ce script)" : "❌ CLI absent — npm i -g @openai/codex puis codex login"}`);
  console.log("  chrome ↪ hors script : Claude-in-Chrome, voir .claude/skills/chatgpt/references/navigateur.md");
  const fils = listerFils();
  console.log(`\n  fils enregistrés : ${fils.length}${fils.length ? " — " + fils.map((f) => f.nom).join(", ") : ""}`);
  if (!aCle) {
    console.log("\nPour activer le canal direct :");
    console.log("  1. clé sur https://platform.openai.com/api-keys (facturation au jeton, ≠ abonnement ChatGPT)");
    console.log("  2. setx OPENAI_API_KEY \"sk-…\"   puis rouvrir le terminal");
  }
}

function aExecutable(nom) {
  const res = require("child_process").spawnSync(process.platform === "win32" ? "where" : "which", [nom], { encoding: "utf8" });
  return res.status === 0;
}

function listerFils() {
  if (!fs.existsSync(DOSSIER_FILS)) return [];
  return fs.readdirSync(DOSSIER_FILS).filter((f) => f.endsWith(".json")).map((f) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DOSSIER_FILS, f), "utf8"));
      return { nom: d.nom, titre: d.titre, messages: d.messages.length, maj: d.maj || d.cree };
    } catch (_) { return { nom: f.replace(/\.json$/, ""), titre: "?", messages: 0, maj: "?" }; }
  }).sort((a, b) => String(b.maj).localeCompare(String(a.maj)));
}

function cmdFils() {
  const fils = listerFils();
  if (!fils.length) return console.log("Aucun fil. Le premier `node scripts/chatgpt.js \"…\" --fil <nom>` en crée un.");
  console.log("Fils ChatGPT\n");
  for (const f of fils) console.log(`  ${f.nom.padEnd(28)} ${String(f.messages).padStart(3)} msg   ${String(f.maj).slice(0, 16).replace("T", " ")}   ${f.titre}`);
  console.log(`\n  transcriptions lisibles : ${path.relative(RACINE, DOSSIER_FILS)}/<fil>.md`);
}

function cmdHistorique(nomFil) {
  const fil = chargerFil(nomFil);
  if (!fil.messages.length) return console.log(`Fil « ${nomFil} » vide.`);
  for (const m of fil.messages) {
    console.log(`\n─── ${m.role === "user" ? "Claude Code" : "ChatGPT"} · ${(m.ts || "").slice(0, 19).replace("T", " ")} ───\n`);
    console.log(m.content);
  }
}

function cmdOublier(nomFil) {
  let n = 0;
  for (const p of [cheminFil(nomFil), cheminTranscription(nomFil)]) {
    if (fs.existsSync(p)) { fs.unlinkSync(p); n++; }
  }
  console.log(n ? `Fil « ${nomFil} » supprimé.` : `Aucun fil « ${nomFil} ».`);
}

async function cmdDemander(question, opts) {
  const morceaux = [];
  for (const f of opts.fichiers) {
    const p = path.isAbsolute(f) ? f : path.join(RACINE, f);
    if (!fs.existsSync(p)) { console.error(`❌ Fichier introuvable : ${f}`); process.exit(2); }
    const rel = path.relative(RACINE, p).replace(/\\/g, "/");
    const etiquette = rel.startsWith("..") ? path.basename(p) : rel;  // ne pas exposer l'arborescence hors dépôt
    morceaux.push(`--- DÉBUT ${etiquette} ---\n${fs.readFileSync(p, "utf8")}\n--- FIN ---`);
  }
  if (question) morceaux.push(question);
  let contenu = morceaux.join("\n\n");
  if (!contenu.trim()) { console.error("❌ Rien à envoyer (ni question ni --fichier)."); process.exit(2); }

  // Garde secrets — avant toute sortie réseau.
  const secrets = detecterSecrets(contenu);
  if (secrets.length) {
    if (!opts.redacter) {
      console.error(`\n⛔ ENVOI BLOQUÉ — ${secrets.length} secret(s) détecté(s) dans le contenu :\n`);
      for (const s of secrets.slice(0, 12)) console.error(`   • ${s.nom} → ${s.apercu}`);
      console.error("\n   Rien n'est parti. Retirer ces valeurs, ou relancer avec --redacter");
      console.error("   (les segments détectés sont alors remplacés par «SECRET RETIRÉ»).\n");
      process.exit(3);
    }
    contenu = redacter(contenu);
    console.error(`⚠️  ${secrets.length} secret(s) masqué(s) avant envoi (--redacter).`);
  }

  const fil = chargerFil(opts.fil);
  const messages = [{ role: "system", content: opts.systeme || SYSTEME_DEFAUT }]
    .concat(fil.messages.map((m) => ({ role: m.role, content: m.content })))
    .concat([{ role: "user", content: contenu }]);

  const taille = messages.reduce((n, m) => n + m.content.length, 0);
  if (opts.sec) {
    console.log(`[--sec] Rien n'est envoyé. Fil « ${opts.fil} », ${messages.length} messages, ${taille} caractères (~${Math.round(taille / 4)} jetons).`);
    console.log(`[--sec] Transport ${opts.transport}, modèle ${opts.modele}.`);
    console.log("\n" + contenu.slice(0, 1200) + (contenu.length > 1200 ? `\n…[${contenu.length - 1200} caractères de plus]` : ""));
    return;
  }
  if (taille > 400000) console.error(`⚠️  ${taille} caractères envoyés : au-delà de la fenêtre de contexte utile, ouvrir un fil neuf.`);

  const t0 = Date.now();
  console.error(`… ${opts.transport}/${opts.modele}, fil « ${opts.fil} », ${taille} caractères`);
  const rep = opts.transport === "codex"
    ? await appelCodex(messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n"))
    : await appelApi(messages, opts);

  fil.titre = fil.titre || opts.fil;
  fil.modele = rep.modele;
  fil.messages.push({ role: "user", content: contenu, ts: new Date().toISOString() });
  fil.messages.push({ role: "assistant", content: rep.texte, ts: new Date().toISOString() });
  enregistrerFil(fil);

  console.log(rep.texte);
  const s = Math.round((Date.now() - t0) / 1000);
  const u = rep.usage ? ` · ${rep.usage.prompt_tokens} + ${rep.usage.completion_tokens} jetons` : "";
  console.error(`\n─── ${rep.modele} · ${s} s${u} · fil « ${fil.nom} » (${fil.messages.length} msg) ───`);
}

/* ------------------------------------------------------------------ */
/* Analyse des arguments                                               */
/* ------------------------------------------------------------------ */

function analyser(argv) {
  const opts = { fil: "courant", fichiers: [], modele: MODELE_DEFAUT, transport: null, sec: false, redacter: false, systeme: null, effort: null };
  const libres = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fil") opts.fil = argv[++i];
    else if (a === "--fichier") opts.fichiers.push(argv[++i]);
    else if (a === "--modele") opts.modele = argv[++i];
    else if (a === "--transport") opts.transport = argv[++i];
    else if (a === "--systeme") opts.systeme = argv[++i];
    else if (a === "--effort") opts.effort = argv[++i];
    else if (a === "--sec" || a === "--dry-run") opts.sec = true;
    else if (a === "--redacter") opts.redacter = true;
    else if (a === "-h" || a === "--aide" || a === "--help") opts.aide = true;
    else libres.push(a);
  }
  return { opts, libres };
}

const AIDE = `
scripts/chatgpt.js — canal Claude Code ↔ ChatGPT

  node scripts/chatgpt.js etat                        transports disponibles, fils, mise en route
  node scripts/chatgpt.js "question" [--fil <nom>]    poser une question (le fil garde le contexte)
  node scripts/chatgpt.js fils                        lister les fils
  node scripts/chatgpt.js historique --fil <nom>      relire un fil
  node scripts/chatgpt.js oublier --fil <nom>         supprimer un fil

Options
  --fichier <chemin>   joindre un fichier (répétable) — dossier de revue, diff, rapport
  --fil <nom>          fil de conversation persistant (défaut : « courant »)
  --modele <id>        surcharge OPENAI_MODEL (défaut : ${MODELE_DEFAUT})
  --effort <niveau>    reasoning_effort : minimal | low | medium | high
  --systeme <texte>    remplace le cadrage projet par défaut
  --transport api|codex
  --sec                montre ce qui partirait, n'envoie RIEN
  --redacter           masque les secrets détectés au lieu de bloquer l'envoi
`;

async function main() {
  const { opts, libres } = analyser(process.argv.slice(2));
  const cmd = libres[0];

  if (opts.aide || (!cmd && !opts.fichiers.length)) return console.log(AIDE);
  if (cmd === "etat") return cmdEtat();
  if (cmd === "fils") return cmdFils();
  if (cmd === "historique") return cmdHistorique(opts.fil);
  if (cmd === "oublier") return cmdOublier(opts.fil);

  if (!opts.transport) {
    opts.transport = transportDisponible();
    if (!opts.transport) {
      console.error("❌ Aucun transport direct disponible.\n");
      cmdEtat();
      console.error("\n   Repli immédiat : Claude-in-Chrome (skill /chatgpt, references/navigateur.md).");
      process.exit(4);
    }
  }
  await cmdDemander(libres.join(" "), opts);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
