// AUTH-05 / SUP-10 / ASTRA-11 / ASTRA-12 — la purge d'un compte est VÉRIFIÉE et
// ne supprime que ce qui lui APPARTIENT (supabase/functions/_shared/purge-compte.js).
//
// Le fichier testé est CELUI que Deno déploie dans `delete-account`. Le client
// Supabase est un FAUX en mémoire : tables = { nom: [lignes] }, seaux = { nom:
// { chemin: <uid du propriétaire> } }, une fonction `objets_stockage_du_compte`
// qui lit ce propriétaire (comme `storage.objects.owner` en production), avec
// des pannes scriptables. Assez pour prouver la RÈGLE :
//   ① tout ce qui porte l'uid part, médias et pièces jointes compris, et `ok`
//   ② un delete en erreur est un ÉCHEC nommé — jamais avalé
//   ③ ce qui subsiste après relecture est un RESTE nommé, `ok` faux
//   ④ ASTRA-11 (RÉINJECTION) : un message de A qui porte le chemin d'une pièce
//      jointe de B ne fait PAS supprimer l'objet de B — la propriété décide
//   ⑤ un seau illisible est un échec ; un dossier vide n'en est pas un
//   ⑥ la relecture illisible compte comme un reste (fail-closed)
//   ⑦ la liste des tables couvre bien celles que la base porte (schéma du 2026-09-14)
//   ⑧ ASTRA-12 : messages déjà supprimés (le client les a effacés) → les
//      fichiers partent quand même ; une première tentative refusée laisse une
//      seconde qui finit ; une relecture Storage en panne n'est pas « zéro reste »
//   ⑨ fonction absente = échec nommé, jamais une purge sans autorité
//   ⑩ plus de 1 000 objets : tout part (pagination)
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgerCompte, listerObjetsDuCompte, TABLES_COMPTE, DOSSIERS_CONTENU, RPC_OBJETS, PAGE } from "../../supabase/functions/_shared/purge-compte.js";

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTRE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fauxAdmin({ tables = {}, seaux = {}, pannesDelete = [], pannesCount = [], pannesList = [], pannesRemove = [], rpc = "ok", pannesListApres = [], ecrituresTardives = {} } = {}) {
  const t = JSON.parse(JSON.stringify(tables));
  // `ecrituresTardives` : { table: n } — à chaque relecture (count) de cette
  // table, tant que n > 0, une ligne du compte RÉAPPARAÎT avant le comptage
  // (le client a repoussé son état entre l'effacement et la relecture).
  const tardives = { ...ecrituresTardives };
  const s = JSON.parse(JSON.stringify(seaux));
  const compteurs = { remove: 0, list: {} };
  return {
    _t: t, _s: s, _n: compteurs,
    from(table) {
      const filtres = [];
      let mode = "select", head = false;
      const rows = () => (t[table] || []).filter((r) => filtres.every((f) => f(r)));
      const b = {
        select(_c, o) { mode = "select"; head = !!(o && o.head); return b; },
        delete() { mode = "delete"; return b; },
        eq(col, v) { filtres.push((r) => r[col] === v); return b; },
        then(res, rej) {
          let out;
          if (mode === "delete") {
            if (pannesDelete.includes(table)) out = { data: null, error: { message: "panne delete " + table } };
            else { t[table] = (t[table] || []).filter((r) => !filtres.every((f) => f(r))); out = { data: null, error: null }; }
          } else if (head) {
            if (tardives[table] > 0) { tardives[table]--; (t[table] = t[table] || []).push({ user_id: U, author_id: U, id: "tardif" }); }
            if (pannesCount.includes(table)) out = { data: null, count: null, error: { message: "panne count " + table } };
            else out = { data: null, count: rows().length, error: null };
          } else out = { data: rows(), error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    },
    // La fonction SQL : les objets dont `owner` = p_uid, tous seaux, paginés.
    rpc(nom, args) {
      let de = 0, a = Infinity;
      const b = {
        range(x, y) { de = x; a = y; return b; },
        then(res, rej) {
          let out;
          if (nom !== RPC_OBJETS || rpc === "absente") out = { data: null, error: { code: "PGRST202", message: "function " + nom + " not found" } };
          else if (rpc === "panne") out = { data: null, error: { message: "panne rpc" } };
          else {
            const tous = [];
            for (const seau of Object.keys(s)) for (const [name, owner] of Object.entries(s[seau])) if (owner === args.p_uid) tous.push({ bucket_id: seau, name });
            tous.sort((x, y) => (x.bucket_id + x.name).localeCompare(y.bucket_id + y.name));
            out = { data: tous.slice(de, a + 1), error: null };
          }
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from(seau) {
        return {
          list(prefixe, o) {
            compteurs.list[seau] = (compteurs.list[seau] || 0) + 1;
            if (pannesList.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne list" } });
            if (pannesListApres.includes(seau) && compteurs.remove > 0) return Promise.resolve({ data: null, error: { message: "panne relecture" } });
            const noms = Object.keys(s[seau] || {}).filter((k) => k.startsWith(prefixe + "/")).map((k) => ({ name: k.slice(prefixe.length + 1) }));
            const offset = (o && o.offset) || 0, limit = (o && o.limit) || 1000;
            return Promise.resolve({ data: noms.slice(offset, offset + limit), error: null });
          },
          remove(chemins) {
            compteurs.remove++;
            if (pannesRemove.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne remove" } });
            for (const c of chemins) delete (s[seau] || {})[c];
            return Promise.resolve({ data: chemins, error: null });
          },
        };
      },
    },
  };
}

function baseComplete() {
  const tables = {};
  for (const [table, col] of TABLES_COMPTE) {
    tables[table] = tables[table] || [];
    tables[table].push({ [col]: U, content: "x" }, { [col]: AUTRE, content: "y" });
  }
  tables.conv_messages = [
    { from_id: U, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/1_photo.jpg" }) },
    { from_id: U, content: JSON.stringify({ type: "audio", url: "https://passio-app.netlify.app/media/attachments/attachments/conv_1/2_voice.webm" }) },
    { from_id: U, content: "texte simple" },
    { from_id: AUTRE, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/3_autre.jpg" }) },
  ];
  // Le PROPRIÉTAIRE de chaque objet, comme `storage.objects.owner` en production.
  const seaux = { content: {}, attachments: {
    "attachments/conv_1/1_photo.jpg": U, "attachments/conv_1/2_voice.webm": U, "attachments/conv_1/3_autre.jpg": AUTRE,
  } };
  for (const d of DOSSIERS_CONTENU) { seaux.content[`${d}/${U}/a.jpg`] = U; seaux.content[`${d}/${AUTRE}/b.jpg`] = AUTRE; }
  return { tables, seaux };
}

test("① tout ce qui porte l'uid part — lignes, huit dossiers de médias, pièces jointes — et rien d'autre", async () => {
  const admin = fauxAdmin(baseComplete());
  const r = await purgerCompte(admin, U);
  assert.deepEqual(r.echecs, []);
  assert.deepEqual(r.restes, []);
  assert.equal(r.ok, true);
  assert.equal(r.objets, 2 + DOSSIERS_CONTENU.length, "2 pièces jointes + un média par dossier, relevés par propriété");
  for (const [table, col] of TABLES_COMPTE) {
    assert.equal(admin._t[table].some((x) => x[col] === U), false, table + ":" + col + " purgée");
    assert.equal(admin._t[table].some((x) => x[col] === AUTRE), true, table + " : l'autre compte est intact");
  }
  for (const d of DOSSIERS_CONTENU) {
    assert.equal(admin._s.content[`${d}/${U}/a.jpg`], undefined, d + " purgé");
    assert.equal(admin._s.content[`${d}/${AUTRE}/b.jpg`], AUTRE, d + " de l'autre intact");
  }
  assert.equal(admin._s.attachments["attachments/conv_1/1_photo.jpg"], undefined);
  assert.equal(admin._s.attachments["attachments/conv_1/2_voice.webm"], undefined);
  assert.equal(admin._s.attachments["attachments/conv_1/3_autre.jpg"], AUTRE, "la pièce jointe de l'autre reste");
});

test("② un delete en erreur est un échec NOMMÉ, et ok est faux", async () => {
  const r = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesDelete: ["user_state"] }), U);
  assert.equal(r.ok, false);
  assert.ok(r.echecs.some((e) => e.startsWith("user_state:user_id")), JSON.stringify(r.echecs));
  assert.ok(r.restes.some((e) => e.startsWith("user_state:user_id=1")), "…et la relecture le voit aussi");
});

test("③ ce qui subsiste après relecture est un reste nommé", async () => {
  // Un delete qui « réussit » sans rien retirer (policy, trigger) : la relecture le dit.
  const admin = fauxAdmin(baseComplete());
  const vraiFrom = admin.from.bind(admin);
  admin.from = (table) => {
    const b = vraiFrom(table);
    if (table !== "blocks") return b;
    b.delete = () => { b.select("*", { head: true }); return b; }; // ne supprime pas : compte seulement
    return b;
  };
  const r = await purgerCompte(admin, U);
  assert.equal(r.ok, false);
  assert.deepEqual(r.echecs, []);
  assert.ok(r.restes.includes("blocks:blocker_id=1") && r.restes.includes("blocks:blocked_id=1"), JSON.stringify(r.restes));
});

test("④ ASTRA-11 : un message de A qui porte le chemin d'une pièce jointe de B ne supprime PAS l'objet de B", async () => {
  const base = baseComplete();
  // A a écrit (ou fabriqué) un message dont l'URL vise la pièce jointe de B —
  // la contre-épreuve d'Astra. Sur le code du 14/09 : objet de B supprimé, ok:true.
  base.tables.conv_messages.push({ from_id: U, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_9/secret_de_B.jpg" }) });
  base.seaux.attachments["attachments/conv_9/secret_de_B.jpg"] = AUTRE;
  const admin = fauxAdmin(base);
  const r = await purgerCompte(admin, U);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(admin._s.attachments["attachments/conv_9/secret_de_B.jpg"], AUTRE, "l'objet de B est INTACT : le chemin d'un message n'est pas une autorisation");
  assert.equal(admin._s.attachments["attachments/conv_1/3_autre.jpg"], AUTRE);
  assert.equal(admin._s.attachments["attachments/conv_1/1_photo.jpg"], undefined, "ceux de A partent bien");
  // Et symétriquement : un objet de A qu'AUCUN message ne mentionne part quand même.
  const base2 = baseComplete();
  base2.seaux.attachments["attachments/conv_7/orphelin_de_A.jpg"] = U;
  const admin2 = fauxAdmin(base2);
  assert.equal((await purgerCompte(admin2, U)).ok, true);
  assert.equal(admin2._s.attachments["attachments/conv_7/orphelin_de_A.jpg"], undefined, "relevé par propriété, pas par les messages");
});

test("⑤ un seau illisible est un échec ; un dossier vide n'en est pas un", async () => {
  const r1 = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesList: ["content"] }), U);
  assert.equal(r1.ok, false);
  assert.ok(r1.echecs.some((e) => e.startsWith("content/photos")));
  const r2 = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesRemove: ["attachments"] }), U);
  assert.equal(r2.ok, false);
  assert.ok(r2.echecs.some((e) => e.startsWith("attachments")), JSON.stringify(r2.echecs));
  assert.ok(r2.restes.includes("objets=2"), "…et la relecture par propriété nomme les deux restés : " + JSON.stringify(r2.restes));
  const vide = baseComplete(); vide.seaux.content = {}; vide.seaux.attachments = {}; vide.tables.conv_messages = [];
  const r3 = await purgerCompte(fauxAdmin(vide), U);
  assert.equal(r3.ok, true, JSON.stringify(r3));
  assert.equal(r3.objets, 0);
});

test("⑥ une relecture illisible compte comme un reste (fail-closed)", async () => {
  const r = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesCount: ["profiles"] }), U);
  assert.equal(r.ok, false);
  assert.ok(r.restes.includes("profiles:id=illisible"), JSON.stringify(r.restes));
});

test("⑦ la liste couvre les tables à identifiant de compte du schéma du 2026-09-14, profiles en dernier", () => {
  const attendues = ["analytics_events", "blocks", "client_errors", "comment_interactions", "comment_likes", "conv_members",
    "conv_messages", "conv_reads", "event_attendees", "event_comments", "event_reactions", "events", "follows", "notifications",
    "passion_quotas", "passion_requests", "post_collaborators", "post_comments", "post_likes", "posts", "profiles",
    "push_subscriptions", "step_interactions", "stories", "story_views", "telemetry_events", "user_passions", "user_safety",
    "user_state", "video_lives"];
  const couvertes = new Set(TABLES_COMPTE.map(([t]) => t));
  for (const t of attendues) assert.ok(couvertes.has(t), t + " manque à TABLES_COMPTE");
  assert.deepEqual(TABLES_COMPTE[TABLES_COMPTE.length - 1], ["profiles", "id"]);
  assert.ok(TABLES_COMPTE.some(([t, c]) => t === "notifications" && c === "from_id"), "les notifications ENVOYÉES aussi (elles portent le nom)");
});

test("⑧ ASTRA-12 : messages déjà effacés → les fichiers partent quand même ; refus puis reprise ; relecture en panne ≠ zéro reste", async () => {
  // Le client a déjà supprimé ses messages avant d'appeler la fonction.
  const sans = baseComplete(); sans.tables.conv_messages = [];
  const admin = fauxAdmin(sans);
  const r = await purgerCompte(admin, U);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(admin._s.attachments["attachments/conv_1/1_photo.jpg"], undefined, "relevé par propriété : les messages ne sont plus nécessaires");
  // Première tentative : le Storage refuse. Seconde : il répond. Le fichier doit être parti.
  const base = baseComplete();
  let refuser = true;
  const admin2 = fauxAdmin(base);
  const vraiStorageFrom = admin2.storage.from.bind(admin2.storage);
  admin2.storage.from = (seau) => {
    const s = vraiStorageFrom(seau);
    const vraiRemove = s.remove;
    s.remove = (noms) => refuser && seau === "attachments" ? Promise.resolve({ data: null, error: { message: "503" } }) : vraiRemove(noms);
    return s;
  };
  const r1 = await purgerCompte(admin2, U);
  assert.equal(r1.ok, false, "première tentative : refusée, compte conservé");
  refuser = false;
  const r2 = await purgerCompte(admin2, U);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(admin2._s.attachments["attachments/conv_1/2_voice.webm"], undefined, "la seconde tentative a bien purgé");
  // Relecture d'un dossier en panne APRÈS suppression : « illisible », jamais « 0 ».
  const r3 = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesListApres: ["content"] }), U);
  assert.equal(r3.ok, false);
  assert.ok(r3.restes.some((x) => /^content\/photos\/.*=illisible$/.test(x)), JSON.stringify(r3.restes));
});

test("⑨ fonction SQL absente (migration non appliquée) ou en panne = échec nommé, aucune purge sans autorité", async () => {
  const r = await purgerCompte(fauxAdmin({ ...baseComplete(), rpc: "absente" }), U);
  assert.equal(r.ok, false);
  assert.ok(r.echecs.some((e) => e.startsWith("objets:rpc")), JSON.stringify(r.echecs));
  const r2 = await purgerCompte(fauxAdmin({ ...baseComplete(), rpc: "panne" }), U);
  assert.equal(r2.ok, false);
  assert.ok(r2.echecs.some((e) => e.startsWith("objets:rpc (panne rpc)")), JSON.stringify(r2.echecs));
  assert.deepEqual(await listerObjetsDuCompte(fauxAdmin({ rpc: "absente" }), U), { erreur: "function " + RPC_OBJETS + " not found" });
});

test("⑩ plus de 1 000 objets : tout part, la liste est paginée", async () => {
  const base = baseComplete();
  for (let i = 0; i < PAGE + 7; i++) base.seaux.attachments[`attachments/conv_x/${String(i).padStart(5, "0")}.jpg`] = U;
  for (let i = 0; i < PAGE + 3; i++) base.seaux.content[`photos/${U}/${String(i).padStart(5, "0")}.jpg`] = U;
  const admin = fauxAdmin(base);
  const r = await purgerCompte(admin, U);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(Object.values(admin._s.attachments).filter((o) => o === U).length, 0);
  assert.equal(Object.keys(admin._s.content).filter((k) => k.startsWith("photos/" + U + "/")).length, 0);
  assert.equal(Object.values(admin._s.attachments).filter((o) => o === AUTRE).length, 1, "l'autre est intact");
});

test("⑪ SUP-10 : une ligne repoussée par le client entre l'effacement et la relecture est effacée par la reprise ; une ligne qui revient encore est un reste nommé", async () => {
  const une = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, ecrituresTardives: { user_state: 1 } });
  const r1 = await purgerCompte(une, U);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(une._t.user_state, []);
  const boucle = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, ecrituresTardives: { user_state: 3 } });
  const r2 = await purgerCompte(boucle, U);
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.restes, ["user_state:user_id=1"]);
  assert.deepEqual(r2.echecs, []);
});
