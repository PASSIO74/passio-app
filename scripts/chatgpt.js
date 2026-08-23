#!/usr/bin/env node
/**
 * scripts/chatgpt.js — canal de collaboration Claude Code ↔ ChatGPT.
 *
 * Remplace le pilotage du DOM de chatgpt.com (fragile : composeur contenteditable,
 * flux d'affichage qui casse, onglet irrécupérable au-delà de ~60 000 caractères)
 * par un appel direct. Aucune dépendance : fetch natif (Node >= 18).
 *
 * Trois transports, dans l'ordre de préférence (le moins cher d'abord) :
 *   1. codex  — CLI `codex exec`, lancé avec le compte ChatGPT. Choisi le
 *               2026-08-16. ⚠️ Rectifié le 2026-08-23 : ce n'est PAS gratuit —
 *               l'usage tire sur un pool de crédits d'espace de travail, qui
 *               peut être vide (« Your workspace is out of credits »).
 *   2. api    — OPENAI_API_KEY, facturée au jeton. Repli seulement.
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

/**
 * Sur Windows, `codex` installé par npm est un **script .cmd**, que `spawn` sans
 * shell ne sait pas exécuter (ENOENT — mesuré le 2026-08-16 : l'état annonçait
 * « CLI absent » alors que le binaire répondait en ligne de commande). On résout
 * le chemin réel, puis on passe par cmd.exe en guillemetant nous-mêmes : même
 * piège que le `C:\Program Files\nodejs\node.exe` coupé en deux côté Sentinelle.
 */
function cheminCodex() {
  const ou = require("child_process").spawnSync(
    process.platform === "win32" ? "where" : "which", ["codex"], { encoding: "utf8" });
  if (ou.status !== 0) return null;
  const chemins = (ou.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!chemins.length) return null;
  // `where` liste d'abord le shim sans extension, inexécutable par spawn : préférer .cmd/.exe.
  return chemins.find((c) => /\.(cmd|exe|bat)$/i.test(c)) || chemins[0];
}

function argsCodex(exe, args) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    const ligne = [exe].concat(args).map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
    return { commande: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", ligne], verbatim: true };
  }
  return { commande: exe, args, verbatim: false };
}

/**
 * L'enfant hérite sinon de TOUT l'environnement. La garde `detecterSecrets` ne
 * lit que l'invite : un secret présent en variable d'environnement lui échappe
 * complètement. On ne transmet donc que le strict nécessaire au lancement et à
 * l'authentification — même principe que l'env filtré de la Sentinelle.
 * Signalé par ChatGPT lui-même le 2026-08-17, vérifié, retenu.
 */
function envFiltre() {
  const garder = ["PATH", "Path", "PATHEXT", "SystemRoot", "windir", "ComSpec", "TEMP", "TMP",
    "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA",
    "CODEX_HOME", "LANG", "LC_ALL", "TERM", "NUMBER_OF_PROCESSORS", "OS", "PROCESSOR_ARCHITECTURE"];
  const env = {};
  for (const k of garder) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

/**
 * Transport codex — lancé avec le compte ChatGPT ; consomme des crédits d'espace
 * de travail, pas une facturation au jeton (mais pas gratuit pour autant).
 *
 * ⚠️ Codex n'est PAS ChatGPT dans un navigateur : c'est un agent qui dispose
 * d'outils de lecture. Deux conséquences, toutes deux voulues ici :
 *   ① on l'exécute avec un dossier de travail VIDE (jamais le dépôt) — sinon il
 *     part lire les fichiers, dont `dashboard/.env` et sa clé service_role, et
 *     le contenu remonte chez OpenAI hors de toute garde. Leçon Sentinelle du
 *     2026-08-16 : le cwd n'est pas une frontière de fichiers, c'est une
 *     réduction de surface, pas une preuve — la vraie garde reste de ne rien
 *     mettre de sensible dans l'invite.
 *   ② l'asymétrie qui fait la valeur du croisement (il n'a pas le dépôt, il
 *     challenge le dossier qu'on lui donne) n'est préservée que par ①.
 *
 * Flags vérifiés contre codex-cli 0.147.0 (`codex exec --help`).
 */
function appelCodex(invite, options) {
  return new Promise((resolve, reject) => {
    const bac = fs.mkdtempSync(path.join(require("os").tmpdir(), "chatgpt-codex-"));
    const sortieFichier = path.join(bac, "reponse.txt");
    const args = ["exec",
      "--sandbox", "read-only",        // aucune écriture, aucune commande mutante
      "--skip-git-repo-check",         // le bac vide n'est pas un dépôt git
      "--ephemeral",                   // pas de session persistée : notre fil fait foi
      "--ignore-user-config",          // ← voir ci-dessous : coupe MCP/hooks/instructions globales
      "--ignore-rules",
      "--color", "never",
      // Raisonnement au maximum : `--ignore-user-config` coupe aussi le réglage
      // global, le défaut retomberait sinon sur l'effort « medium ». Le croisement
      // ne vaut que si l'autre modèle réfléchit vraiment (2026-08-17).
      // Valeurs acceptées (mesurées contre l'API le 2026-08-17, un intrus renvoie
      // un 400 qui les énumère) : none|minimal|low|medium|high|xhigh|max.
      "-c", `model_reasoning_effort="${(options && options.effort) || "max"}"`,
      "-C", bac,                       // dossier de travail VIDE, surtout pas RACINE
      "-o", sortieFichier,
      "-"];                            // invite lue sur stdin
    if (options && options.modeleExplicite) args.splice(1, 0, "-m", options.modele);

    const exe = cheminCodex();
    if (!exe) { try { fs.rmSync(bac, { recursive: true, force: true }); } catch (_) {}
      return reject(new Error("codex introuvable — installer avec npm i -g @openai/codex")); }
    const lancement = argsCodex(exe, args);
    const enfant = spawn(lancement.commande, lancement.args,
      { cwd: bac, shell: false, windowsVerbatimArguments: lancement.verbatim, env: envFiltre() });
    let erreur = "", flux = "";
    enfant.stdout.on("data", (d) => { flux += d; });
    enfant.stderr.on("data", (d) => { erreur += d; });
    enfant.on("error", (e) => reject(new Error(`codex injoignable : ${e.message} — installer avec npm i -g @openai/codex`)));
    enfant.on("close", (code) => {
      let texte = "";
      try { texte = fs.readFileSync(sortieFichier, "utf8").trim(); } catch (_) {}
      try { fs.rmSync(bac, { recursive: true, force: true }); } catch (_) {}
      if (code !== 0 || !texte) {
        // Codex ré-imprime la bannière PUIS l'invite PUIS l'échec : la cause est à
        // la FIN du flux, jamais au début. Couper par la tête masquait l'erreur.
        const brut = (erreur + "\n" + flux).trim();
        const queue = brut.length > 700 ? "…" + brut.slice(-700) : brut;
        const aide = /not logged in|unauthor|401|credential|auth/i.test(brut)
          ? "\n   → session absente : lancer `codex login` (« Sign in with ChatGPT ») puis réessayer."
          : /usage limit|rate limit|quota/i.test(brut)
          ? "\n   → limite d'usage du plan ChatGPT atteinte : attendre la réinitialisation."
          : "";
        return reject(new Error(`codex a rendu ${code}${queue ? " — " + queue : " sans réponse"}${aide}`));
      }
      resolve({ texte, usage: null, modele: (options && options.modeleExplicite ? options.modele : "codex (plan ChatGPT)") });
    });
    enfant.stdin.write(invite);
    enfant.stdin.end();
  });
}

function codexConnecte() {
  const exe = cheminCodex();
  if (!exe) return null;                          // CLI absent
  const l = argsCodex(exe, ["login", "status"]);
  const r = require("child_process").spawnSync(l.commande, l.args,
    { encoding: "utf8", shell: false, windowsVerbatimArguments: l.verbatim });
  if (r.error) return null;
  return !/not logged in/i.test((r.stdout || "") + (r.stderr || ""));
}

// Priorité au moins cher : les crédits d'espace de travail passent avant la
// facturation au jeton de l'API.
function transportDisponible() {
  if (codexConnecte() === true) return "codex";
  if (process.env.OPENAI_API_KEY) return "api";
  return null;
}

/* ------------------------------------------------------------------ */
/* Commandes                                                           */
/* ------------------------------------------------------------------ */

function cmdEtat() {
  const aCle = !!process.env.OPENAI_API_KEY;
  const codex = codexConnecte();   // null = CLI absent, false = pas connecté, true = prêt
  console.log("État du canal ChatGPT\n");
  console.log(`  codex  ${codex === null ? "❌ CLI absent — npm i -g @openai/codex"
    : codex ? "✅ connecté — ⚠️ vérifie tes crédits d'espace de travail : « prêt » ne teste que la session"
    : "⚠️  CLI installé mais pas connecté — lancer `codex login`"}   ← préféré`);
  console.log(`  api    ${aCle ? `✅ prête — modèle ${MODELE_DEFAUT} (facturée au jeton)` : "❌ OPENAI_API_KEY absente (facturation au jeton — non retenue)"}`);
  console.log("  chrome ↪ hors script : Claude-in-Chrome, voir .claude/skills/chatgpt/references/navigateur.md");
  const fils = listerFils();
  console.log(`\n  fils enregistrés : ${fils.length}${fils.length ? " — " + fils.map((f) => f.nom).join(", ") : ""}`);
  if (codex === false) {
    console.log("\nDernière étape, à faire par Benjamin (l'authentification ne se délègue pas) :");
    console.log("  codex login          → « Sign in with ChatGPT », le compte déjà payé");
    console.log("  codex login status   → doit ne plus afficher « Not logged in »");
  } else if (codex === null) {
    console.log("\nPour activer le canal sans frais supplémentaires :");
    console.log("  npm i -g @openai/codex   puis   codex login");
  }
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
    ? await appelCodex(messages.map((m) => {
        const etiq = { system: "CADRAGE", user: "CLAUDE CODE", assistant: "TOI (tour précédent)" }[m.role];
        return `### ${etiq}\n${m.content}`;
      }).join("\n\n"), opts)
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
    else if (a === "--modele") { opts.modele = argv[++i]; opts.modeleExplicite = true; }
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
