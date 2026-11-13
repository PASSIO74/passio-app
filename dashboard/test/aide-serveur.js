// Démarrage d'un vrai serveur de pilotage pour les tests qui en ont besoin
// (gardes HTTP, navigateur). Port donné par le système, dossier de données jetable,
// aucun accès à Supabase, mutations coupées : un test ne doit jamais pouvoir toucher
// la production ni le dépôt, même si une garde du code venait à sauter.
//
// Un serveur n'est PRÊT que lorsque SON processus a imprimé sa ligne d'écoute — jamais
// parce que /api/health répond. Le 12/11 (PR #866), deux serveurs tirés au sort sur le
// même port parmi 250 : le second mourait (EADDRINUSE), mais le premier répondait à sa
// place ; les neuf mots de passe faux du test F-02 bloquaient alors 5 minutes le serveur
// partagé de `audit-2026-11-06.test.js`, et sept tests tombaient en 429, sans rapport
// avec la PR. Verrou : `aide-serveur.test.js`.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MDP = "mot-de-passe-de-test";
const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ESSAIS_PORT = 5;
const DELAI_ECOUTE_MS = 20_000;

/** Un port que le système vient de trouver libre (écoute sur 0, refermée aussitôt). */
export function portLibre() {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.unref();
    s.on("error", ko);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

/**
 * Démarre un serveur de test. `port` impose un port : s'il est pris, c'est un refus, jamais la
 * poignée d'un autre serveur. Sinon `choisirPort` (par défaut : le système) en donne un, et un
 * port pris entre son choix et l'écoute fait reprendre un autre port, cinq fois au plus.
 */
export async function demarrerServeur({ port, choisirPort = portLibre } = {}) {
  for (let essai = 1; ; essai++) {
    try {
      return await lancer(port ?? await choisirPort());
    } catch (e) {
      if (port != null || !e.portPris || essai >= ESSAIS_PORT) throw e;
    }
  }
}

async function lancer(port) {
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), "passio-serveur-test-"));
  const proc = spawn(process.execPath, ["server/start.js"], {
    cwd: RACINE,
    env: {
      ...process.env,
      PORT: String(port),
      DASH_DATA_DIR: donnees,
      DASH_ENV: "development",
      DASH_ALLOW_MUTATIONS: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_URL: "",
      ANTHROPIC_API_KEY: "",
      DASH_ADMIN_USER: "admin_test",
      DASH_ADMIN_PASSWORD: MDP,
      DASH_SESSION_SECRET: "secret-de-test-suffisamment-long-pour-hmac-0123456789",
      DASH_EXTRA_USERS: `dev_test:${MDP}:developer,testeur_test:${MDP}:tester,obs_test:${MDP}:observer`,
      DASH_OPEN_BROWSER: "",
      // Aucun réseau depuis le serveur de test : minuteurs GitHub / observation /
      // incidents à zéro, lecture GitHub coupée, aucun `gh`, aucun relais.
      DASH_CHAINE_WATCH_MIN: "0",
      DASH_OBS_ALERTS_MIN: "0",
      DASH_INCIDENT_SWEEP_MIN: "0",
      DASH_ALERTS_AUTOACK_MIN: "0",
      DASH_GITHUB_READ: "off",
      DASH_NOTIFY_GITHUB: "false",
      DASH_NOTIFY_WEBHOOK: "",
      DASH_SENTINEL_RELAIS_GITHUB: "false",
      PASSIO_PUBLIC_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await ecouteDe(proc, port);
    // Le port est à CE processus : c'est lui qui répond.
    const r = await fetch(`${base}/api/health`);
    if (!r.ok) throw new Error(`le serveur de test écoute sur le port ${port}, mais /api/health rend ${r.status}`);
  } catch (e) {
    try { proc.kill(); } catch {}
    try { fs.rmSync(donnees, { recursive: true, force: true }); } catch {}
    throw e;
  }

  return {
    base, port, proc, donnees,
    async cookieDe(user) {
      const r = await fetch(`${base}/api/login`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password: MDP }),
      });
      if (r.status !== 200) throw new Error(`connexion refusée pour ${user} (${r.status})`);
      const set = r.headers.getSetCookie?.() || [];
      return set.map((c) => c.split(";")[0]).join("; ");
    },
    arreter() {
      try { proc.kill(); } catch {}
      try { fs.rmSync(donnees, { recursive: true, force: true }); } catch {}
    },
  };
}

// Attend la ligne d'écoute imprimée par CE processus (« ▸ http://localhost:<port> (écoute : …) »,
// `server/index.js`, rappel de `app.listen`). S'il sort avant, l'erreur dit pourquoi, et
// `portPris` si le port était occupé. Les sorties restent drainées ensuite (un tube plein bloque).
function ecouteDe(proc, port) {
  const ligne = `http://localhost:${port} `;
  return new Promise((ok, ko) => {
    let sortie = "", erreurs = "", fini = false;
    const finir = (e) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      sortie = "";
      if (e) ko(e); else ok();
    };
    const echec = (message, portPris = false) => finir(Object.assign(new Error(message), { portPris }));
    const minuteur = setTimeout(() => echec(`le serveur de test n'a pas écouté sur le port ${port} en ${DELAI_ECOUTE_MS / 1000} s`), DELAI_ECOUTE_MS);
    proc.stdout.on("data", (d) => { if (fini) return; sortie += d; if (sortie.includes(ligne)) finir(); });
    // Le DÉBUT de la sortie d'erreur (borné) : c'est là que Node écrit la cause d'un démarrage raté.
    proc.stderr.on("data", (d) => { if (erreurs.length < 16_000) erreurs += d; });
    proc.on("error", (e) => echec(`le serveur de test n'a pas pu démarrer : ${e.message}`));
    proc.on("close", (code) => {
      const lignes = erreurs.split("\n").map((l) => l.trim()).filter(Boolean);
      const cause = lignes.find((l) => /^\w*Error\b/.test(l)) || lignes.at(-1) || "aucune erreur imprimée";
      echec(`le serveur de test n'a pas pu écouter sur le port ${port} (sortie ${code}) : ${cause.slice(0, 300)}`, /EADDRINUSE/.test(erreurs));
    });
  });
}
