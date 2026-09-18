// ═══════════════════════════════════════════════════════════════════════════
// POINTS DE SORTIE DES ALERTES — ce qui quitte le poste (2026-09-18).
//
// Jusqu'ici NOTIFY_SINKS (alerts.js) était un tableau vide et une boucle TODO :
// une alerte n'existait que dans le flux SSE et un JSON local. Sans navigateur
// ouvert — le cas nominal la nuit — une panne du poste (disque, session CLI
// tombée, base illisible, écriture impossible) n'atteignait personne.
//
// Deux canaux, tous deux facultatifs et lus dans l'environnement :
//   · `github_issue` (DASH_NOTIFY_GITHUB=true) : UNE issue `[POSTE] Le pilotage
//     a besoin de toi`, label `poste`, ouverte/actualisée par le CLI `gh` du
//     poste (donc au nom du compte connecté → e-mail GitHub), refermée par le
//     sink quand toutes les clés sont revenues `info`. Seules les clés du
//     POSTE y entrent (disk:, claudecli:, supervise:, storage:, obs:) : ce que
//     GitHub ne peut pas voir lui-même. Jamais le label `claude` : cette issue
//     est un message à un humain, pas une enquête.
//   · `webhook` (DASH_NOTIFY_WEBHOOK=<url>) : POST JSON, niveau ≥ high.
//
// Règles communes : aucun jeton dans le code (le `gh` du poste porte sa propre
// session), jamais un chemin ni un identifiant dans le corps (clé + raison +
// geste), un canal qui échoue ne remonte jamais dans `emit` (l'alerte primaire
// vit dans le JSON et le SSE), `gh` est appelé par `execFile` avec un tableau
// d'arguments — jamais par un shell — et le corps passe par un fichier.
// Les deux exécuteurs (execFile, fetch) sont injectables : aucun test ne lance
// `gh` ni ne sort sur le réseau.
// ═══════════════════════════════════════════════════════════════════════════
import { execFile as execFileNode } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonDb } from "./jsondb.js";

export const TITRE_POSTE = "[POSTE] Le pilotage a besoin de toi";
export const LABEL_POSTE = "poste";
const CLES_POSTE = /^(disk|claudecli|supervise|storage|obs):/;
const COOLDOWN_MS = 24 * 3_600_000;
const SEV = { critical: 4, high: 3, warn: 2, info: 1 };

// Le geste attendu, par famille de clé. Écrit ici une fois pour toutes : le
// corps de l'issue ne recopie jamais le message de l'alerte (qui peut porter
// un nom de fichier ou un identifiant), seulement la clé, le titre et le geste.
const GESTES = {
  disk: "Libérer de la place sur le disque du poste (le seuil est dans .env, DASH_DISK_WARN_GB) — l'alerte se referme seule au-dessus du seuil.",
  claudecli: "Relancer la connexion du CLI Claude sur le poste (Connecter-Claude.cmd). La reprise est automatique ensuite.",
  supervise: "Le superviseur relance le serveur en boucle : regarder le disque et le journal du superviseur (page Sources).",
  storage: "Le pilotage ne peut plus écrire ses fichiers de données : disque plein ou droits — rien n'est perdu tant que le processus vit.",
  obs: "L'observation de la production est coupée (base, canari, ingestion ou realtime) : vérifier Supabase et le réseau du poste (page Sources).",
};

export function estCleDuPoste(key) { return CLES_POSTE.test(String(key || "")); }

/** Corps de l'issue, pur : une ligne par clé encore active, jamais un chemin. */
export function composerCorpsPoste(cles, now = Date.now()) {
  const lignes = Object.entries(cles).sort((a, b) => (SEV[b[1].level] || 0) - (SEV[a[1].level] || 0)).map(([key, c]) => {
    const famille = key.split(":")[0];
    const depuis = c.since ? new Date(c.since).toISOString() : "?";
    return `- **${key}** (${c.level}) — ${String(c.title || "").slice(0, 120)} — depuis ${depuis}\n  Geste : ${GESTES[famille] || "Regarder la page Sources du pilotage."}`;
  });
  return [
    "Le centre de pilotage du poste signale une situation qu'il ne peut pas corriger seul.",
    "Cette issue est actualisée par le poste lui-même et se referme quand tout est revenu.",
    "",
    ...lignes,
    "",
    `Dernière actualisation : ${new Date(now).toISOString()}. Aucune donnée personnelle, aucun chemin : les détails sont sur le pilotage.`,
  ].join("\n");
}

function promesseExec(execFileImpl) {
  return (args, timeoutMs = 30_000) => new Promise((resolve) => {
    try {
      execFileImpl("gh", args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1_000_000 }, (err, stdout, stderr) => {
        resolve({ code: err ? (err.code ?? 1) : 0, out: String(stdout || ""), err: String(stderr || err?.message || "") });
      });
    } catch (e) { resolve({ code: -1, out: "", err: e && e.message ? e.message : String(e) }); }
  });
}

async function avecFichier(contenu, fn) {
  const f = path.join(os.tmpdir(), `passio-poste-${process.pid}-${Date.now().toString(36)}.md`);
  fs.writeFileSync(f, contenu, "utf8");
  try { return await fn(f); } finally { try { fs.rmSync(f, { force: true }); } catch {} }
}

/**
 * Sink « issue GitHub [POSTE] ». `execFileImpl` injectable (tests) ; l'état
 * (numéro d'issue, clés actives, dernière notification par clé) est persisté
 * pour survivre aux redémarrages du serveur, sinon chaque relance rouvrirait
 * une issue de plus.
 */
export function sinkGithubPoste({ execFileImpl = execFileNode, db = null, now = () => Date.now() } = {}) {
  const gh = promesseExec(execFileImpl);
  const etat = db || new JsonDb("notify-poste", { issue: null, cles: {}, labelOk: false });

  async function assurerLabel() {
    if (etat.get().labelOk) return;
    await gh(["label", "create", LABEL_POSTE, "--force", "--color", "5319e7", "--description", "Le poste de pilotage a besoin d'un geste humain"]);
    etat.update((d) => { d.labelOk = true; });
  }

  async function trouverIssue() {
    const n = etat.get().issue;
    if (n) {
      // Refermée à la main entre-temps ? Éditer une issue close n'envoie aucun
      // e-mail : on l'oublie et on en ouvre une nouvelle. Réponse illisible
      // (gh absent, réseau) : on garde le numéro connu, sans inventer.
      const v = await gh(["issue", "view", String(n), "--json", "state"]);
      let s = null;
      try { s = v.code === 0 ? JSON.parse(v.out || "null") : null; } catch { s = null; }
      if (s && s.state && String(s.state).toUpperCase() !== "OPEN") etat.update((d) => { d.issue = null; });
      else return n;
    }
    const r = await gh(["issue", "list", "--label", LABEL_POSTE, "--state", "open", "--limit", "5", "--json", "number,title"]);
    if (r.code !== 0) return null;
    let liste = [];
    try { liste = JSON.parse(r.out || "[]"); } catch { liste = []; }
    const trouvee = (Array.isArray(liste) ? liste : []).find((i) => i && i.title === TITRE_POSTE);
    if (trouvee) etat.update((d) => { d.issue = trouvee.number; });
    return trouvee ? trouvee.number : null;
  }

  async function publier() {
    const d = etat.get();
    const corps = composerCorpsPoste(d.cles, now());
    await assurerLabel();
    const existante = await trouverIssue();
    if (existante) {
      await avecFichier(corps, (f) => gh(["issue", "edit", String(existante), "--body-file", f]));
      return existante;
    }
    const r = await avecFichier(corps, (f) => gh(["issue", "create", "--title", TITRE_POSTE, "--label", LABEL_POSTE, "--body-file", f]));
    const m = /\/issues\/(\d+)/.exec(r.out || "");
    const numero = m ? Number(m[1]) : null;
    if (numero) etat.update((x) => { x.issue = numero; });
    return numero;
  }

  async function refermer() {
    const n = await trouverIssue();
    if (!n) return;
    await gh(["issue", "close", String(n), "--comment", "Tout est revenu : le poste referme cette issue lui-même."]);
    etat.update((d) => { d.issue = null; });
  }

  return {
    type: "github_issue",
    enabled: true,
    accepte(alert) {
      if (!estCleDuPoste(alert.key)) return false;
      if (alert.level === "info") return Boolean(etat.get().cles[alert.key]);
      return true;
    },
    async envoyer(alert) {
      const t = now();
      if (alert.level === "info") {
        etat.update((d) => { delete d.cles[alert.key]; });
        if (Object.keys(etat.get().cles).length === 0) await refermer();
        else await publier();
        return { action: "retour" };
      }
      const prec = etat.get().cles[alert.key];
      const recent = prec && prec.notifiedAt && t - prec.notifiedAt < COOLDOWN_MS;
      etat.update((d) => {
        d.cles[alert.key] = { level: alert.level, title: String(alert.title || "").slice(0, 120), since: prec?.since || alert.ts || t, notifiedAt: recent ? prec.notifiedAt : t };
      });
      if (recent) return { action: "dedup" };
      const numero = await publier();
      return { action: "publie", issue: numero };
    },
    _etat: () => JSON.parse(JSON.stringify(etat.get())),
  };
}

/** Sink webhook JSON : niveau ≥ minLevel, délai 5 s, jamais de secret dans le corps. */
export function sinkWebhook(url, { fetchImpl = globalThis.fetch, minLevel = "high" } = {}) {
  return {
    type: "webhook",
    enabled: Boolean(url),
    accepte(alert) { return (SEV[alert.level] || 0) >= (SEV[minLevel] || 3); },
    async envoyer(alert) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetchImpl(url, {
          method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: alert.id, ts: alert.ts, key: alert.key, level: alert.level, title: alert.title, message: alert.message, incidentId: alert.incidentId || null }),
        });
      } finally { clearTimeout(t); }
      return { action: "poste" };
    },
  };
}

/** Les sinks réellement actifs, d'après l'environnement. Aucun réseau ici. */
export function construireSinks(env = process.env, deps = {}) {
  const sinks = [];
  if (env.DASH_NOTIFY_GITHUB === "true") sinks.push(sinkGithubPoste(deps));
  if (env.DASH_NOTIFY_WEBHOOK) sinks.push(sinkWebhook(env.DASH_NOTIFY_WEBHOOK, { fetchImpl: deps.fetchImpl, minLevel: env.DASH_NOTIFY_MIN_LEVEL || "high" }));
  return sinks;
}
