// ═══════════════════════════════════════════════════════════════════════════
// export-account EXÉCUTÉE : chaque chemin du gestionnaire, de bout en bout
// (2026-11-09). Le gabarit de notify-call-chemins.test.mjs — une variable jamais
// déclarée y rendait 500 à toute push sociale, de #753 au 09/11, et seul un banc
// qui exécute le gestionnaire pouvait le voir — appliqué à la portabilité RGPD :
// tout le dossier d'une personne sort ici. Le VRAI index.ts, chargé par
// tests/unit/lib/executer-fonction.mjs ; l'export, le plafond et la preuve de
// connexion récente (qui ont leurs suites : export-compte, plafond,
// connexion-recente) sont des doublures qui notent ce qu'on leur demande.
// Lu ici, le code de la fonction fait tourner ce banc avant « Déployer »
// (edge-functions-verrous.test.mjs ②).
// ═══════════════════════════════════════════════════════════════════════════
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerFonction, requete } from "./lib/executer-fonction.mjs";

const SOURCE = fs.readFileSync("supabase/functions/export-account/index.ts", "utf8");
const URL_FN = "https://banc.example/functions/v1/export-account";
const MOI = "11111111-1111-4111-8111-111111111111";
const LUI = "22222222-2222-4222-8222-222222222222";
const REAUTH = { error: "Reconnecte-toi pour confirmer.", code: "reauth_requise" };
const UTILISATEUR = {
  id: MOI, email: "moi@banc.example", created_at: "2026-01-02T03:04:05Z", last_sign_in_at: "2026-11-09T08:00:00Z",
  user_metadata: { pseudo: "moi" },
};

const banc = { user: null, env: {}, clients: [], appels: [], recente: true, verdict: { ok: true }, dossier: null };

const MODULES = {
  "https://esm.sh/@supabase/supabase-js@2.118.0": {
    createClient: (url, cle, options) => {
      const c = {
        url, cle, options,
        auth: { getUser: async () => (banc.user ? { data: { user: banc.user }, error: null } : { data: { user: null }, error: { message: "jeton" } }) },
      };
      banc.clients.push(c);
      return c;
    },
  },
  "../_shared/export-compte.js": {
    exporterCompte: async (admin, uid, identite) => { banc.appels.push({ quoi: "exporterCompte", admin, uid, identite }); return banc.dossier; },
  },
  "../_shared/connexion-recente.js": {
    connexionRecente: (auth, secondes) => { banc.appels.push({ quoi: "connexionRecente", auth, secondes }); return banc.recente; },
    REPONSE_REAUTH: REAUTH,
  },
  "../_shared/plafond.js": {
    verifierPlafondEnBase: async (admin, cle, nom, plafond) => { banc.appels.push({ quoi: "plafond", admin, cle, nom, plafond }); return banc.verdict; },
    reponsePlafond: (verdict, cors) => new Response(JSON.stringify({ error: "plafond" }), { status: 429, headers: cors }),
  },
  "../_shared/revision.js": { REVISION: "revision-du-banc" },
};

let gestionnaire;
before(async () => { gestionnaire = await chargerFonction(SOURCE, { modules: MODULES, env: (n) => banc.env[n] }); });

function remettre({ user = UTILISATEUR, recente = true, verdict = { ok: true } } = {}) {
  banc.user = user;
  banc.env = { SUPABASE_URL: "https://banc.supabase.co", SUPABASE_ANON_KEY: "cle-anon", SUPABASE_SERVICE_ROLE_KEY: "cle-service" };
  banc.clients = [];
  banc.appels = [];
  banc.recente = recente;
  banc.verdict = verdict;
  banc.dossier = { version: 1, tables: { posts: [{ id: "p1" }] } };
}
async function appeler(corps, options) {
  const r = await gestionnaire(requete(URL_FN, corps, options));
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* « ok » d'un OPTIONS */ }
  return { status: r.status, entetes: r.headers, texte, corps: json };
}
const exportes = () => banc.appels.filter((a) => a.quoi === "exporterCompte");

test("① OPTIONS : 200, CORS et révision servie ; toute autre méthode que POST : 405, rien n'est lu", async () => {
  remettre();
  const o = await appeler(null, { methode: "OPTIONS" });
  assert.equal(o.status, 200);
  assert.equal(o.texte, "ok");
  assert.equal(o.entetes.get("X-Passio-Revision"), "revision-du-banc");
  assert.equal(o.entetes.get("Access-Control-Allow-Origin"), "*");
  const g = await appeler(null, { methode: "GET" });
  assert.equal(g.status, 405);
  assert.deepEqual(g.corps, { error: "Method not allowed" });
  assert.equal(banc.clients.length, 0);
  assert.equal(banc.appels.length, 0);
});

test("② sans session : 401 — rien n'est lu ni exporté", async () => {
  remettre({ user: null });
  const r = await appeler({}, { jeton: null });
  assert.equal(r.status, 401);
  assert.deepEqual(r.corps, { error: "Non authentifié" });
  assert.deepEqual(banc.clients.map((c) => c.cle), ["cle-anon"]);
  assert.equal(banc.appels.length, 0);
});

test("③ connexion de plus d'une heure : 403 « reauth_requise » — ni plafond, ni export", async () => {
  remettre({ recente: false });
  const r = await appeler({});
  assert.equal(r.status, 403);
  assert.deepEqual(r.corps, REAUTH);
  assert.deepEqual(banc.appels, [{ quoi: "connexionRecente", auth: "Bearer jeton-du-banc", secondes: 60 * 60 }]);
});

test("④ plafond dépassé : 429, compté sur l'appelant authentifié sous la clé de service — rien n'est exporté", async () => {
  remettre({ verdict: { ok: false } });
  const r = await appeler({ uid: LUI });
  assert.equal(r.status, 429);
  assert.equal(r.entetes.get("X-Passio-Revision"), "revision-du-banc");
  const [p] = banc.appels.filter((a) => a.quoi === "plafond");
  assert.equal(p.cle, MOI);
  assert.equal(p.nom, "export-account");
  assert.deepEqual(p.plafond, { parMinute: 2, parHeure: 10 });
  assert.equal(p.admin.cle, "cle-service");
  assert.equal(exportes().length, 0);
});

test("⑤ export : le dossier de l'appelant authentifié — jamais d'un identifiant du corps —, son identité Auth, en pièce jointe nommée", async () => {
  remettre();
  const r = await appeler({ uid: LUI, user_id: LUI });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, banc.dossier);
  assert.equal(r.entetes.get("Content-Disposition"), 'attachment; filename="passio-export-11111111.json"');
  assert.equal(r.entetes.get("Content-Type"), "application/json");
  assert.deepEqual(banc.appels.map((a) => a.quoi), ["connexionRecente", "plafond", "exporterCompte"], "la preuve, puis le plafond, AVANT toute lecture");
  const [e] = exportes();
  assert.equal(e.uid, MOI);
  assert.equal(e.admin.cle, "cle-service");
  assert.deepEqual(e.identite, {
    id: MOI, email: "moi@banc.example", cree_le: "2026-01-02T03:04:05Z", derniere_connexion: "2026-11-09T08:00:00Z", metadonnees: { pseudo: "moi" },
  });
});

test("⑥ un compte sans e-mail ni métadonnées (session anonyme) : des null, jamais une exception", async () => {
  remettre({ user: { id: MOI } });
  const r = await appeler({});
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.deepEqual(exportes()[0].identite, { id: MOI, email: null, cree_le: null, derniere_connexion: null, metadonnees: null });
});
