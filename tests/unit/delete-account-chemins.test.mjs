// ═══════════════════════════════════════════════════════════════════════════
// delete-account EXÉCUTÉE : chaque chemin du gestionnaire, de bout en bout
// (2026-11-09). Le gabarit de notify-call-chemins.test.mjs — une variable jamais
// déclarée y rendait 500 à toute push sociale, de #753 au 09/11, et seul un banc
// qui exécute le gestionnaire pouvait le voir — appliqué au geste le plus grave
// de l'app : supprimer un compte. Le VRAI index.ts, chargé par
// tests/unit/lib/executer-fonction.mjs ; la purge et la preuve de connexion
// récente (qui ont leurs suites : suppression-compte, suppression-entrelacement,
// connexion-recente) sont des doublures qui notent ce qu'on leur demande.
// Lu ici, le code de la fonction fait tourner ce banc avant « Déployer »
// (edge-functions-verrous.test.mjs ②).
// ═══════════════════════════════════════════════════════════════════════════
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerFonction, requete } from "./lib/executer-fonction.mjs";

const SOURCE = fs.readFileSync("supabase/functions/delete-account/index.ts", "utf8");
const URL_FN = "https://banc.example/functions/v1/delete-account";
const MOI = "11111111-1111-4111-8111-111111111111";
const LUI = "22222222-2222-4222-8222-222222222222";
const REAUTH = { error: "Reconnecte-toi pour confirmer.", code: "reauth_requise" };

const banc = { user: null, env: {}, clients: [], appels: [], recente: true, suppression: null };

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
  "../_shared/suppression-compte.js": {
    traiterSuppression: async (admin, uid) => { banc.appels.push({ quoi: "traiterSuppression", admin, uid }); return banc.suppression; },
  },
  "../_shared/connexion-recente.js": {
    connexionRecente: (auth, secondes) => { banc.appels.push({ quoi: "connexionRecente", auth, secondes }); return banc.recente; },
    REPONSE_REAUTH: REAUTH,
  },
  "../_shared/revision.js": { REVISION: "revision-du-banc" },
};

let gestionnaire;
before(async () => { gestionnaire = await chargerFonction(SOURCE, { modules: MODULES, env: (n) => banc.env[n] }); });

function remettre({ user = { id: MOI }, recente = true, suppression = { status: 200, body: { ok: true } } } = {}) {
  banc.user = user;
  banc.env = { SUPABASE_URL: "https://banc.supabase.co", SUPABASE_ANON_KEY: "cle-anon", SUPABASE_SERVICE_ROLE_KEY: "cle-service" };
  banc.clients = [];
  banc.appels = [];
  banc.recente = recente;
  banc.suppression = suppression;
}
async function appeler(corps, options) {
  const r = await gestionnaire(requete(URL_FN, corps, options));
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* « ok » d'un OPTIONS */ }
  return { status: r.status, entetes: r.headers, texte, corps: json };
}
const supprime = () => banc.appels.filter((a) => a.quoi === "traiterSuppression");

test("① OPTIONS : 200, CORS et révision servie ; toute autre méthode que POST : 405, rien n'est lu", async () => {
  remettre();
  const o = await appeler(null, { methode: "OPTIONS" });
  assert.equal(o.status, 200);
  assert.equal(o.texte, "ok");
  assert.equal(o.entetes.get("X-Passio-Revision"), "revision-du-banc");
  assert.equal(o.entetes.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  const g = await appeler(null, { methode: "GET" });
  assert.equal(g.status, 405);
  assert.deepEqual(g.corps, { error: "Method not allowed" });
  assert.equal(banc.clients.length, 0);
  assert.equal(banc.appels.length, 0);
});

test("② sans session : 401 — ni preuve de connexion, ni client de service, ni purge", async () => {
  remettre({ user: null });
  const r = await appeler({}, { jeton: null });
  assert.equal(r.status, 401);
  assert.deepEqual(r.corps, { error: "Non authentifié" });
  assert.deepEqual(banc.clients.map((c) => c.cle), ["cle-anon"], "seul le client anonyme, porteur du jeton, est construit");
  assert.equal(banc.appels.length, 0);
});

test("③ connexion trop ancienne : 403 « reauth_requise », jugée sur le jeton de la requête à 15 minutes — rien n'est purgé", async () => {
  remettre({ recente: false });
  const r = await appeler({});
  assert.equal(r.status, 403);
  assert.deepEqual(r.corps, REAUTH);
  assert.deepEqual(banc.appels, [{ quoi: "connexionRecente", auth: "Bearer jeton-du-banc", secondes: 15 * 60 }]);
  assert.deepEqual(banc.clients.map((c) => c.cle), ["cle-anon"], "le client de service n'est pas construit");
});

test("④ suppression : la purge reçoit le client de SERVICE et l'appelant authentifié — jamais un identifiant du corps", async () => {
  remettre();
  const r = await appeler({ uid: LUI, user_id: LUI });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, { ok: true });
  assert.deepEqual(banc.appels.map((a) => a.quoi), ["connexionRecente", "traiterSuppression"], "la preuve AVANT la purge");
  const [s] = supprime();
  assert.equal(s.uid, MOI);
  assert.equal(s.admin.cle, "cle-service");
  assert.equal(s.admin.url, "https://banc.supabase.co");
  assert.equal(r.entetes.get("X-Passio-Revision"), "revision-du-banc");
});

test("⑤ le contrat de réponse vit dans la purge : statut et corps rendus tels quels (503 infrastructure absente, 500 purge inachevée)", async () => {
  for (const suppression of [
    { status: 503, body: { ok: false, code: "infrastructure_absente" } },
    { status: 500, body: { ok: false, code: "purge_incomplete", restantes: ["posts"] } },
    { status: 200, body: { ok: true, deja: true } },
  ]) {
    remettre({ suppression });
    const r = await appeler({});
    assert.equal(r.status, suppression.status, JSON.stringify(suppression));
    assert.deepEqual(r.corps, suppression.body);
    assert.equal(r.entetes.get("Content-Type"), "application/json");
  }
});
