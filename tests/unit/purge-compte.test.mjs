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
import { purgerCompte, marquerSupprime, listerObjetsDuCompte, TABLES_COMPTE, DOSSIERS_CONTENU, RPC_OBJETS, RPC_RECLAMER, RPC_TERMINER, RPC_ATTENDRE, PAGE } from "../../supabase/functions/_shared/purge-compte.js";

import { fauxAdmin, baseComplete, U, AUTRE } from "./lib/faux-admin-purge.mjs";

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

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-25 — la barrière de suppression côté serveur (v2 depuis la cinquième
// contre-revue : ASTRA-39 / 40 / 41 / 42).
//
// Le défaut d'origine : effacer, relire, ré-effacer est une PASSE DE PLUS, pas
// une barrière. Ce que ces tests mesurent, c'est ce que purge-compte.js FAIT :
// l'ORDRE (réclamer, attendre, puis seulement relever), le JETON transmis à
// chaque fonction, et l'ARRÊT sur chaque réponse défavorable. La règle SQL
// elle-même (sérialisation, jeton, xids en vol) est mesurée sur PostgreSQL réel
// par `tests/sql/migration-barriere-suppression.test.sh` (52 contrôles) et
// `tests/sql/ecriture-en-vol-suppression.test.sh` (11 contrôles, deux connexions).
// ═══════════════════════════════════════════════════════════════════════════

const JETON = "12345678-1234-4123-8123-123456789abc";

test("ASTRA-25 ① réclamer, attendre, PUIS relever : l'ordre est la propriété", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }], profiles: [{ id: U }] } });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.barriere, "posee");
  assert.equal(r.jeton, JETON);
  // ⚠️ C'EST LA POSITION QUI EST LA PROPRIÉTÉ. Les deux premiers gestes adressés
  // à la base sont la réclamation puis l'attente ; le premier relevé vient après.
  assert.deepEqual(admin._j.slice(0, 3), ["rpc:" + RPC_RECLAMER, "rpc:" + RPC_ATTENDRE, "rpc:" + RPC_OBJETS],
    "réclamer → attendre → relever ; journal : " + admin._j.join(" → "));
  // Le jeton part dans la réclamation ET dans la fin d'opération.
  assert.equal(admin._a[0].args.p_jeton, JETON);
  const fin = admin._a[admin._a.length - 1];
  assert.equal(fin.nom, RPC_TERMINER);
  assert.equal(fin.args.p_jeton, JETON, "la fin d'opération porte le MÊME jeton que la réclamation");
  assert.equal(fin.args.p_statut, "purgee", "sur un succès la protection est CONSERVÉE (purgee), jamais levée");
  assert.equal(admin._t.comptes_en_suppression[0].statut, "purgee");
  // Et JAMAIS d'écriture directe du marqueur (régression v1).
  assert.ok(!admin._j.some((g) => g.startsWith("comptes_en_suppression:")), "aucun accès direct au marqueur : " + admin._j.join(" → "));
});

test("ASTRA-25 ① bis un ÉCHEC de réclamation arrête la purge AVANT le premier relevé", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "refus" });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, false);
  assert.equal(r.code, "barriere");
  assert.deepEqual(admin._j, ["rpc:" + RPC_RECLAMER], "aucun autre geste ne doit avoir eu lieu — journal : " + admin._j.join(" → "));
  assert.deepEqual(admin._t.user_state, [{ user_id: U }], "rien n'a été effacé");
});

test("ASTRA-42 ② migration non appliquée : la purge NE PART PAS, et le code le nomme", async () => {
  // La v1 continuait « en le disant » ; le handler jetait la note et répondait
  // 200 `ok:true`. Une purge qui ne peut pas prouver qu'elle a fini n'a pas fini.
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "absente" });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, false, "sans barrière, pas de succès");
  assert.equal(r.code, "infrastructure_absente");
  assert.equal(r.barriere, "absente");
  assert.ok(r.notes.some((n) => /infrastructure de suppression ABSENTE/.test(n)));
  assert.deepEqual(admin._j, ["rpc:" + RPC_RECLAMER], "aucun geste après : rien n'est effacé sans barrière");
  assert.deepEqual(admin._t.user_state, [{ user_id: U }]);
});

test("ASTRA-40 ③ réclamation NON acquise (autre tentative vivante, ou compte déjà supprimé) : on s'arrête sans rien toucher", async () => {
  const occ = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "occupee" });
  const r1 = await purgerCompte(occ, U, { jeton: JETON });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, "deja_en_cours");
  assert.deepEqual(occ._j, ["rpc:" + RPC_RECLAMER]);
  assert.ok(!occ._a.some((a) => a.nom === RPC_TERMINER), "on ne TERMINE pas une tentative qu'on n'a pas acquise");
  const sup = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "supprimee" });
  const r2 = await purgerCompte(sup, U, { jeton: JETON });
  assert.equal(r2.code, "deja_supprimee");
  assert.deepEqual(sup._t.user_state, [{ user_id: U }]);
});

test("ASTRA-40 ④ purge INACHEVÉE : la fin d'opération est `echec`, AVEC le jeton — jamais un delete du marqueur", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, pannesDelete: ["user_state"] });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, false);
  assert.equal(r.code, "incomplete");
  const fin = admin._a.filter((a) => a.nom === RPC_TERMINER);
  assert.equal(fin.length, 1);
  assert.equal(fin[0].args.p_jeton, JETON, "le retrait est CONDITIONNEL au jeton : c'est SQL qui décide, mais il faut le lui donner");
  assert.equal(fin[0].args.p_statut, "echec");
  assert.ok(fin[0].args.p_detail && fin[0].args.p_detail.echecs.length >= 1, "l'erreur est transmise pour être conservée");
  assert.equal(admin._t.comptes_en_suppression[0].statut, "echec", "la ligne reste (état durable) ; c'est le statut qui lève la protection");
  assert.ok(!admin._j.includes("comptes_en_suppression:delete"), "aucun delete direct du marqueur (v1)");
});

test("ASTRA-40 ⑤ la reproduction d'Astra : A échoue TARD, après que B a repris le compte — A ne retire rien, et le dit", async () => {
  // Chronologie : A réclame (J_A), échoue lentement ; B réclame (J_B) et compte ;
  // A termine en `echec` → SQL répond jeton_perime (la ligne est à B) ; B finit.
  // Ici le faux répond jeton_perime à la fin d'A : ce qu'on prouve, c'est qu'A
  // ne considère PAS sa purge comme la sienne, et que B n'est pas affecté.
  const adminA = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, pannesDelete: ["user_state"], terminerRefuse: true });
  const rA = await purgerCompte(adminA, U, { jeton: "aaaaaaaa-0000-4000-8000-000000000001" });
  assert.equal(rA.ok, false);
  assert.equal(rA.code, "jeton_perdu");
  assert.ok(rA.echecs.some((e) => /barrière:fin \(jeton_perime/.test(e)), JSON.stringify(rA.echecs));
  // Et surtout : une purge dont on n'a plus la garde n'est JAMAIS `ok`, même si
  // elle n'avait aucun reste — sinon delete-account supprimerait le compte Auth
  // sur la foi d'une relecture qui ne vaut plus rien.
  const adminA2 = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, terminerRefuse: true });
  const rA2 = await purgerCompte(adminA2, U, { jeton: "aaaaaaaa-0000-4000-8000-000000000001" });
  assert.equal(rA2.echecs.length, 1, "aucun reste, aucun échec de purge…");
  assert.equal(rA2.ok, false, "…et pourtant PAS ok : la tentative n'est plus la nôtre");
  assert.equal(rA2.code, "jeton_perdu");
});

test("ASTRA-41 ⑥ des écritures en vol qui ne finissent pas : la purge ÉCHOUE avant tout effacement", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, enVol: { en_vol_initial: 2, restantes: 1, attendu_ms: 5000 } });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, false);
  assert.equal(r.code, "en_vol");
  assert.ok(r.echecs.some((e) => /écritures en vol non terminées \(1\)/.test(e)), JSON.stringify(r.echecs));
  assert.deepEqual(admin._j, ["rpc:" + RPC_RECLAMER, "rpc:" + RPC_ATTENDRE, "rpc:" + RPC_TERMINER], "rien n'est relevé ni effacé : " + admin._j.join(" → "));
  assert.deepEqual(admin._t.user_state, [{ user_id: U }]);
  assert.equal(admin._a[2].args.p_statut, "echec", "la protection est levée : purge relançable");
  // Attente absente (migration partielle) ou illisible : même fail-closed.
  const abs = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, enVol: "absente" });
  const r2 = await purgerCompte(abs, U, { jeton: JETON });
  assert.equal(r2.ok, false); assert.equal(r2.code, "en_vol");
  const ill = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, enVol: { bidon: true } });
  const r3 = await purgerCompte(ill, U, { jeton: JETON });
  assert.equal(r3.ok, false, "une réponse sans `restantes` numérique n'est pas « zéro en vol »");
  // Des écritures en vol qui FINISSENT : la purge continue et le note.
  const okv = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, enVol: { en_vol_initial: 3, restantes: 0, attendu_ms: 120 } });
  const r4 = await purgerCompte(okv, U, { jeton: JETON });
  assert.equal(r4.ok, true, JSON.stringify(r4));
  assert.ok(r4.notes.some((n) => /3 transaction\(s\) en vol attendue\(s\) pendant 120 ms/.test(n)));
});

test("ASTRA-25 ⑦ la reproduction de la 4e passe : une écriture tardive ne rend plus un `ok` mensonger", async () => {
  // `ecrituresTardives` fait REVENIR une ligne à chaque relecture. Le faux ne
  // connaît pas le trigger SQL : il ne peut pas la REFUSER. Ce qu'on vérifie ici
  // est que le client ne MENT pas quand elle survient ; ce que la barrière
  // empêche VRAIMENT se mesure en SQL (banc ③ et ④).
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, ecrituresTardives: { user_state: 2 } });
  const r = await purgerCompte(admin, U, { jeton: JETON });
  assert.equal(r.ok, false, "une ligne qui subsiste ne peut pas rendre `ok`");
  assert.ok(r.restes.some((x) => /^user_state:/.test(x)), JSON.stringify(r.restes));
});

test("ASTRA-39 ⑧ COUVERTURE : la liste de la migration est EXACTEMENT TABLES_COMPTE (contrôle indépendant de la migration)", async () => {
  // La migration porte une copie SQL de la liste ; ce test lit les DEUX et les
  // compare, paire par paire. Une table ajoutée à la purge et oubliée de la
  // barrière (ASTRA-39 : passion_quotas, client_errors, analytics_events,
  // telemetry_events) rougit ici avant tout banc.
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../migrations/migration_barriere_suppression_2026-09-15.sql", import.meta.url), "utf8");
  const bloc = sql.slice(sql.indexOf("insert into _colonnes_compte values"), sql.indexOf(";", sql.indexOf("insert into _colonnes_compte values")));
  const paires = [...bloc.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => m[1] + ":" + m[2]);
  const attendues = TABLES_COMPTE.map(([t, c]) => t + ":" + c);
  assert.deepEqual(paires.filter((p) => !attendues.includes(p)), [], "paires dans la migration mais pas dans la purge");
  assert.deepEqual(attendues.filter((p) => !paires.includes(p)), [], "paires de la purge ABSENTES de la barrière");
  assert.equal(paires.length, attendues.length);
  for (const t of ["passion_quotas", "client_errors", "analytics_events", "telemetry_events"]) assert.ok(paires.some((p) => p.startsWith(t + ":")), t + " : la table omise par la v1 est couverte");
});

test("marquerSupprime transmet le jeton et le statut `supprimee`", async () => {
  const admin = fauxAdmin({});
  await purgerCompte(admin, U, { jeton: JETON });
  const r = await marquerSupprime(admin, U, JETON);
  assert.equal(r.ok, true);
  const dernier = admin._a[admin._a.length - 1];
  assert.deepEqual([dernier.nom, dernier.args.p_jeton, dernier.args.p_statut], [RPC_TERMINER, JETON, "supprimee"]);
  const refus = fauxAdmin({ terminerRefuse: true });
  assert.equal((await marquerSupprime(refus, U, JETON)).ok, false, "un refus est rendu tel quel, jamais avalé");
});
