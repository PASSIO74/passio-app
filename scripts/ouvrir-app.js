#!/usr/bin/env node
/* ============================================================
   PASSIO · ouvrir-app.js — « créer le jeton, ouvrir la fenêtre »
   ------------------------------------------------------------
   Fait en une commande ce qu'on refaisait à la main à chaque
   vérification visuelle :
     1. CRÉE le jeton du gate  (sha256("passio-gate-v1::" + code))
     2. LANCE le serveur local si le port ne répond pas
     3. OUVRE une vraie fenêtre Chromium DÉJÀ déverrouillée
        (jeton posé en sessionStorage AVANT le premier script)
     4. REND LA MAIN en direct : erreurs console et requêtes
        en échec sont imprimées dans le terminal, en continu.

   Usage :
     node scripts/ouvrir-app.js                  # local :8080, fenêtre visible
     node scripts/ouvrir-app.js --prod           # https://passio-app.netlify.app
     node scripts/ouvrir-app.js --url <url>      # n'importe quelle URL
     node scripts/ouvrir-app.js --code 4807      # autre code d'accès
     node scripts/ouvrir-app.js --jeton          # imprime SEULEMENT le jeton
                                                 # + le collage console navigateur
     node scripts/ouvrir-app.js --mobile         # viewport 390x844
     node scripts/ouvrir-app.js --ecran feed     # goTo() après le boot
     node scripts/ouvrir-app.js --headless --capture preuve.png
     node scripts/ouvrir-app.js --chromium /chemin/chrome   # binaire imposé

   Le jeton n'est PAS codé en dur : il est recalculé depuis le code
   d'accès, puis comparé au GATE_HASH réellement embarqué dans
   js/access-gate.js. Un code qui ne correspond pas est signalé
   AVANT d'ouvrir la fenêtre (sinon le gate reste fermé sans
   qu'on sache pourquoi).
   ============================================================ */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GATE_FILE = path.join(ROOT, "js", "access-gate.js");
const PROD_URL = "https://passio-app.netlify.app";
const DEFAULT_PORT = 8080;

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const o = {
    code: "2125", url: null, prod: false, port: DEFAULT_PORT,
    jetonOnly: false, headless: null, mobile: false, ecran: null,
    capture: null, timeout: 0, chromium: process.env.PASSIO_CHROMIUM || null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--code") o.code = String(next() || "").trim();
    else if (a === "--url") o.url = next();
    else if (a === "--prod") o.prod = true;
    else if (a === "--port") o.port = Number(next()) || DEFAULT_PORT;
    else if (a === "--jeton" || a === "--token") o.jetonOnly = true;
    else if (a === "--headless") o.headless = true;
    else if (a === "--fenetre" || a === "--headed") o.headless = false;
    else if (a === "--mobile") o.mobile = true;
    else if (a === "--ecran") o.ecran = next();
    else if (a === "--capture") o.capture = next();
    else if (a === "--timeout") o.timeout = Number(next()) || 0;
    else if (a === "--chromium") o.chromium = next();
    else if (a === "--aide" || a === "--help" || a === "-h") o.help = true;
    else console.warn(`… option ignorée : ${a}`);
  }
  return o;
}

// ------------------------------------------------------------------- jeton
// Lit le sel, le hash et la clé RÉELLEMENT embarqués dans l'app : si le code
// d'accès change un jour, ce script suit sans qu'on ait à le modifier.
function lireGate() {
  const src = fs.readFileSync(GATE_FILE, "utf8");
  const pick = (name, def) => {
    const m = src.match(new RegExp('var\\s+' + name + '\\s*=\\s*"([^"]*)"'));
    return m ? m[1] : def;
  };
  return {
    salt: pick("GATE_SALT", "passio-gate-v1::"),
    hash: pick("GATE_HASH", ""),
    key: pick("GATE_KEY", "passio_gate_v1"),
  };
}

function creerJeton(salt, code) {
  return crypto.createHash("sha256").update(salt + String(code)).digest("hex");
}

// ------------------------------------------------------------------ serveur
function portOuvert(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const s = net.connect({ port, host });
    const fin = (ok) => { s.destroy(); res(ok); };
    s.setTimeout(700);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
  });
}

async function attendrePort(port, msMax = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < msMax) {
    if (await portOuvert(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function demarrerServeur(port) {
  if (await portOuvert(port)) {
    console.log(`• serveur déjà en écoute sur :${port} (réutilisé)`);
    return null;
  }
  console.log(`• démarrage du serveur local sur :${port}…`);
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "http-server", "bin", "http-server"), "-p", String(port), "-c-1", "--silent", "."],
    { cwd: ROOT, stdio: "ignore", detached: false }
  );
  child.on("error", (e) => console.error("✗ serveur :", e.message));
  if (!(await attendrePort(port))) {
    throw new Error(`le serveur n'a pas répondu sur :${port} (lancer « npm run serve » à part ?)`);
  }
  console.log(`✓ serveur prêt sur http://127.0.0.1:${port}`);
  return child;
}

// ------------------------------------------------------------------- écran
// Sans DISPLAY sous Linux, une fenêtre « visible » ne s'affiche nulle part :
// on bascule alors en headless au lieu d'échouer au lancement.
function peutAfficher() {
  if (process.platform === "win32" || process.platform === "darwin") return true;
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

// Un Chromium peut manquer (Playwright mis à jour sans « playwright install »)
// ou vivre ailleurs (image CI, PLAYWRIGHT_BROWSERS_PATH). Plutôt que d'échouer,
// on retente sur les binaires réellement présents sur la machine.
async function lancerNavigateur(chromium, opts, force) {
  const candidats = [];
  if (force) candidats.push({ executablePath: force });
  candidats.push({});
  for (const p of ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (fs.existsSync(p)) candidats.push({ executablePath: p });
  }
  candidats.push({ channel: "chrome" }, { channel: "msedge" });
  let derniere;
  for (const c of candidats) {
    try {
      const nav = await chromium.launch({ ...opts, ...c });
      if (c.executablePath) console.log(`• Chromium : ${c.executablePath}`);
      else if (c.channel) console.log(`• Chromium : canal ${c.channel}`);
      return nav;
    } catch (e) { derniere = e; }
  }
  throw new Error("aucun Chromium lançable — " + String(derniere && derniere.message).split("\n")[0]);
}

// -------------------------------------------------------------------- main
// Le serveur lancé par ce script ne doit jamais SURVIVRE au script : un
// http-server orphelin sur :8080 est ensuite « réutilisé » par la session
// suivante (et par les tests, reuseExistingServer:true) sur du vieux code.
let serveurLance = null;
function arreterServeur() { if (serveurLance) { try { serveurLance.kill(); } catch (e) {} serveurLance = null; } }
process.on("exit", arreterServeur);

(async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?Usage :/, "Usage :"));
    return;
  }

  const gate = lireGate();
  const jeton = creerJeton(gate.salt, o.code);
  const conforme = jeton === gate.hash;

  console.log("");
  console.log("── Jeton d'accès PASSIO ───────────────────────────────");
  console.log(`  code       : ${o.code}`);
  console.log(`  clé        : sessionStorage["${gate.key}"]`);
  console.log(`  jeton      : ${jeton}`);
  console.log(`  conforme   : ${conforme ? "✓ correspond au GATE_HASH de js/access-gate.js" : "✗ NE correspond PAS au GATE_HASH — le gate restera fermé"}`);
  console.log("");
  console.log("  À coller dans la console d'un navigateur, sur la page PASSIO :");
  console.log(`    sessionStorage.setItem(${JSON.stringify(gate.key)}, ${JSON.stringify(jeton)}); location.reload();`);
  console.log("───────────────────────────────────────────────────────");
  console.log("");

  if (o.jetonOnly) return;
  if (!conforme) {
    console.error("✗ Jeton non conforme : rien n'est ouvert. Vérifier --code (défaut 2125) ou GATE_HASH.");
    process.exitCode = 1;
    return;
  }

  const url = o.url || (o.prod ? PROD_URL : `http://127.0.0.1:${o.port}/index.html`);
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url);

  if (local && !o.url) serveurLance = await demarrerServeur(o.port);

  let chromium;
  try { ({ chromium } = require("@playwright/test")); }
  catch (e) { throw new Error("Playwright absent : lancer « npm install » (et « npx playwright install chromium »)."); }

  const headless = o.headless === null ? !peutAfficher() : o.headless;
  if (headless && o.headless === null) {
    console.log("• aucun écran détecté (DISPLAY vide) → fenêtre headless, utiliser --capture pour une preuve");
  }

  const browser = await lancerNavigateur(chromium, { headless, args: headless ? [] : ["--start-maximized"] }, o.chromium);
  const ctx = await browser.newContext({
    viewport: o.mobile ? { width: 390, height: 844 } : (headless ? { width: 1280, height: 900 } : null),
    locale: "fr-FR",
    ...(o.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });

  // Le jeton est posé AVANT tout script de la page : access-gate.js le lit dès
  // le <head> et ne construit même pas l'écran de code.
  await ctx.addInitScript(([k, t]) => {
    try {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
    } catch (e) {}
  }, [gate.key, jeton]);

  const page = await ctx.newPage();

  // « Prendre la main » : tout ce qui casse est rapporté ici, en direct.
  const erreurs = [];
  page.on("console", (m) => {
    if (m.type() === "error") { erreurs.push(m.text()); console.log(`  ⚠ console: ${m.text().slice(0, 300)}`); }
  });
  page.on("pageerror", (e) => { erreurs.push(String(e)); console.log(`  ⚠ pageerror: ${String(e).slice(0, 300)}`); });
  page.on("requestfailed", (r) => console.log(`  ⚠ réseau échoué: ${r.method()} ${r.url().slice(0, 160)} — ${(r.failure() || {}).errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) console.log(`  ⚠ HTTP ${r.status()}: ${r.url().slice(0, 160)}`); });

  console.log(`• ouverture de ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const verrouille = await page.evaluate(() => ({
    gateVisible: !!document.getElementById("passioGate"),
    locked: document.documentElement.classList.contains("passio-locked"),
    titre: document.title,
  }));
  console.log(verrouille.gateVisible || verrouille.locked
    ? "✗ le gate est encore affiché — jeton non pris en compte"
    : `✓ gate franchi sans saisie — page « ${verrouille.titre} »`);

  if (o.ecran) {
    await page.evaluate((s) => { try { goTo(s); } catch (e) {} }, o.ecran);
    await page.waitForTimeout(1200);
    console.log(`• écran → ${o.ecran}`);
  }

  if (o.capture) {
    const dest = path.isAbsolute(o.capture) ? o.capture : path.join(ROOT, o.capture);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`✓ capture : ${dest}`);
  }

  console.log(`\n${erreurs.length ? `⚠ ${erreurs.length} erreur(s) JS` : "✓ 0 erreur JS"} au chargement.`);

  const fermer = async () => {
    try { await browser.close(); } catch (e) {}
    arreterServeur();
  };

  if (headless || o.timeout) {
    if (o.timeout) await page.waitForTimeout(o.timeout);
    await fermer();
    return;
  }

  console.log("\nFenêtre ouverte. Ctrl+C ici, ou fermer la fenêtre, pour tout arrêter.");
  process.on("SIGINT", async () => { await fermer(); process.exit(0); });
  await new Promise((res) => { page.on("close", res); browser.on("disconnected", res); });
  await fermer();
})().catch((e) => {
  console.error("✗", e.message);
  arreterServeur();
  process.exit(1);
});
