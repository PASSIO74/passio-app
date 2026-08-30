// Démarrage d'un vrai serveur de pilotage pour les tests qui en ont besoin
// (gardes HTTP, navigateur). Port éphémère, dossier de données jetable, aucun
// accès à Supabase, mutations coupées : un test ne doit jamais pouvoir toucher
// la production ni le dépôt, même si une garde du code venait à sauter.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MDP = "mot-de-passe-de-test";
const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function demarrerServeur({ port = 4700 + Math.floor(Math.random() * 250) } = {}) {
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
    if (i === 79) throw new Error("le serveur de test n'a pas démarré");
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
