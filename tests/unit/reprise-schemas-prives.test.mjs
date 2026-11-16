import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const P = require("../../scripts/lib/reprise-schemas-prives.js");
const JE = require("../../scripts/lib/json-exact.js");
const R = require("../../scripts/restaurer-donnees.js"), { comparerLignes } = R;
const REF = "abcdefghijabcdefghij", URL = `https://${REF}.supabase.co`, JETON = "sbp_fixture";
const cfg = { url: URL, ref: REF, jeton: JETON };
const ddl = () => Object.keys(P.TABLES).map((n) => `create table rencontres_prive.${n}(id text);`).join("\n")
  + "\ncreate table passio_realtime_budget.compteurs(compte text);";

function monde({ absent = false, lisible = true, lectureSeule = true, taille = 1, videPage = false, mutation = false } = {}) {
  const appels = [], data = Object.fromEntries(Object.keys(P.TABLES).map((n) => [n, []]));
  for (let i = 0; i < taille; i++) data.coorganisations_anterieures.push('{"event_id":"ev_' + String(i).padStart(5, "0")
    + '","valeur":{"nombre":9007199254740993,"texte":"apostrophe \' et $1"},"created_at":"2026-01-01T00:00:00Z"}');
  if (taille) {
    data.identifiants_retires = ['{"event_id":"ev_retire"}'];
    data.accords = ['{"event_id":"ev_00000","user_id":"u_fixture"}'];
    data.inscriptions = ['{"id":"inscription_fixture","event_id":"ev_00000","user_id":"u_fixture"}'];
    data.decisions = ['{"id":"decision_fixture","event_id":"ev_00000","user_id":"u_fixture","accepter":false}'];
  }
  const fetchFn = async (url, init) => {
    const b = JSON.parse(init.body); appels.push({ url, ...b });
    assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url, `https://api.supabase.com/v1/projects/${REF}/database/query`);
    assert.equal(b.read_only, true); assert.ok(Array.isArray(b.parameters));
    let reponse;
    if (b.query === P.SQL_INVENTAIRE) {
      assert.deepEqual(b.parameters, [P.SCHEMA, P.BUDGET]);
      reponse = { lecture_seule: lectureSeule, rencontres: !absent, budget: !absent, tables: absent ? [] : [
        ...Object.entries(P.TABLES).map(([nom, pk]) => ({ schema: P.SCHEMA, nom, pk, lisible, genre: "r" })),
        { schema: P.BUDGET, nom: "compteurs", pk: ["compte", "fenetre"], lisible, genre: "r" },
      ] };
    } else if (b.query.includes("from passio_realtime_budget.compteurs")) reponse = { lecture_seule: lectureSeule, lisible, total: "0" };
    else {
      const nom = /from "rencontres_prive"\."([a-z_]+)"/.exec(b.query)?.[1];
      assert.ok(Object.hasOwn(P.TABLES, nom));
      const [limite, ...curseur] = b.parameters;
      assert.equal(limite, P.PAGE); assert.ok(b.query.includes("order by"));
      const apres = (ligne) => {
        if (!curseur.length) return true;
        const o = JSON.parse(ligne);
        for (let k = 0; k < curseur.length; k++) {
          const v = o[P.TABLES[nom][k]];
          if (v !== curseur[k]) return v > curseur[k];
        }
        return false;
      };
      reponse = { lecture_seule: lectureSeule, lisible, total: String(data[nom].length),
        lignes: videPage ? [] : data[nom].filter(apres).slice(0, limite) };
      if (mutation && nom === "coorganisations_anterieures" && !curseur.length) {
        data[nom].shift(); data[nom].push('{"event_id":"ev_99999","valeur":[]}');
      }
    }
    return new Response(JSON.stringify([reponse]), { status: 201 });
  };
  return { data, appels, lire: P.lecteur({ ...cfg, fetchFn }) };
}

async function archive(options) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "passio-prives-")), m = monde(options);
  fs.writeFileSync(path.join(dossier, "schema.sql"), ddl());
  const man = await P.exporter({ ...cfg, dossier, lire: m.lire });
  return { dossier, man, m };
}

test("export réel du helper : cinq tables privées, pagination PK, nombres exacts et exclusion éphémère", async () => {
  const a = await archive({ taille: P.PAGE + 1 });
  assert.equal(a.man.version, 1); assert.equal(a.man.projet, REF);
  assert.equal(Object.keys(a.man.schemas.rencontres_prive.tables).length, 5);
  assert.equal(a.man.schemas.rencontres_prive.tables.coorganisations_anterieures.exporte, P.PAGE + 1);
  const texte = fs.readFileSync(path.join(a.dossier, "_prive", P.SCHEMA, "coorganisations_anterieures.ndjson"), "utf8");
  assert.match(texte, /9007199254740993/);
  assert.equal(a.m.appels.filter((x) => /coorganisations_anterieures/.test(x.query)).length, 2);
  assert.deepEqual(a.man.schemas.passio_realtime_budget, { present: true, ephemere: true, restauration: "vide" });
  assert.equal(P.valider(a.dossier, a.man).ok, true);
  assert.equal((await P.verifier({ ...a, lire: a.m.lire, comparer: comparerLignes })).ok, true);
});

test("absence explicitement relevée ; PAT ou cible mélangée refusés, jamais saut silencieux", async () => {
  const a = await archive({ absent: true });
  assert.equal(a.man.schemas.rencontres_prive.present, false);
  assert.deepEqual(a.man.schemas.rencontres_prive.tables, {});
  assert.throws(() => P.lecteur({ ...cfg, jeton: undefined }), /jeton/);
  assert.throws(() => P.lecteur({ ...cfg, ref: "zzzzzzzzzzzzzzzzzzzz" }), /coïncider/);
});

test("une lecture RLS filtrée ou une transaction non readonly ne produit jamais un faux export vide", async () => {
  for (const opts of [{ lisible: false, taille: 0 }, { lectureSeule: false }, { videPage: true }]) {
    await assert.rejects(archive(opts), /intégrale|lecture seule|incomplète/);
  }
});

test("archive modifiée ou manifeste hors allowlist refusés avant la moindre écriture", async () => {
  const a = await archive();
  const f = path.join(a.dossier, "_prive", P.SCHEMA, "decisions.ndjson");
  fs.appendFileSync(f, '{"id":"intrus"}\n');
  let ecritures = 0;
  await assert.rejects(P.restaurer({ ...a, lire: a.m.lire, ecrire: async () => ecritures++ }), /invalides/);
  assert.equal(ecritures, 0);
  a.man.schemas.rencontres_prive.tables["../../hors"] = {};
  assert.equal(P.valider(a.dossier, a.man).ok, false);
});

test("rechargement privé : JSON uniquement paramétré, parents publics préexistants, compteur remis vide", async () => {
  const a = await archive(); const ecrits = [], cible = monde({ taille: 0 });
  const r = await P.restaurer({ ...a, lire: cible.lire, ecrire: async (query, parameters) => {
    ecrits.push({ query, parameters });
    const nom = /^insert into "rencontres_prive"\."([a-z_]+)"/.exec(query)?.[1];
    if (nom) cible.data[nom] = JE.decouperLignes(parameters[0]);
  } });
  assert.equal(r.ok, true); assert.equal(ecrits.length, 6);
  for (const e of ecrits.slice(0, 5)) {
    assert.match(e.query, /json_populate_recordset.*\$1::json/);
    assert.doesNotMatch(e.query, /apostrophe|9007199254740993/);
    assert.ok(Array.isArray(e.parameters));
  }
  assert.match(ecrits[0].parameters[0], /9007199254740993/);
  assert.match(ecrits.at(-1).query, /^truncate table "passio_realtime_budget"\."compteurs"$/);
  assert.equal((await P.verifier({ ...a, lire: cible.lire, comparer: comparerLignes })).ok, true);
  cible.data.decisions[0] = cible.data.decisions[0].replace('"accepter":false', '"accepter":true');
  assert.equal((await P.verifier({ ...a, lire: cible.lire, comparer: comparerLignes })).ok, false, "même compte, autre autorisation : divergence");
});

test("ancienne archive : couverture privée inconnue, refus de preuve sur cible portant du privé", async () => {
  assert.equal(P.valider("aucune-lecture-disque", undefined).historique, true);
  const v = await P.verifier({ man: undefined, lire: monde().lire });
  assert.equal(v.ok, false); assert.match(v.notes.join(" "), /non attesté/);
  let mutations = 0;
  await assert.rejects(P.restaurer({ man: undefined, lire: monde().lire, ecrire: async () => mutations++ }), /état privé non couvert/);
  assert.equal(mutations, 0);
});

test("erreurs Management : aucune valeur serveur ni corps de réponse dans le diagnostic", async () => {
  const lire = P.lecteur({ ...cfg, fetchFn: async () => new Response("DONNEE_PRIVEE_FIXTURE", { status: 403 }) });
  await assert.rejects(P.inventaire(lire), (e) => /HTTP 403/.test(e.message) && !e.message.includes("DONNEE_PRIVEE"));
});

test("réseau, délai et redirection : diagnostic générique sans secret ni valeur distante", async () => {
  for (const erreur of [new Error("sbp_fixture DONNEE_PRIVEE_FIXTURE"), new DOMException("DONNEE_PRIVEE_FIXTURE", "AbortError")]) {
    const lire = P.lecteur({ ...cfg, fetchFn: async (_url, init) => {
      assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
      throw erreur;
    } });
    await assert.rejects(P.inventaire(lire), (e) => /indisponible ou interrompue/.test(e.message)
      && !/sbp_|DONNEE_PRIVEE/.test(e.message));
  }
});

test("réinjection : suppression avant le curseur et insertion en fin à compte constant ne sautent plus une clé persistante", async () => {
  await assert.rejects(archive({ taille: P.PAGE + 1, mutation: true }), /Comptage privé instable/);
});

test("clé composite : la page suivante utilise les deux composantes paramétrées, jamais OFFSET", async () => {
  const m = monde({ taille: 0 }), dossier = fs.mkdtempSync(path.join(os.tmpdir(), "passio-prives-tuple-"));
  m.data.accords = Array.from({ length: P.PAGE + 1 }, (_, i) => JSON.stringify({ event_id: "ev", user_id: "u" + String(i).padStart(5, "0") }));
  fs.writeFileSync(path.join(dossier, "schema.sql"), ddl());
  const man = await P.exporter({ ...cfg, dossier, lire: m.lire });
  assert.equal(man.schemas.rencontres_prive.tables.accords.exporte, P.PAGE + 1);
  const suite = m.appels.find((a) => a.query.includes('from "rencontres_prive"."accords"') && a.parameters.length === 3);
  assert.ok(suite); assert.deepEqual(suite.parameters, [P.PAGE, "ev", "u00499"]);
  assert.match(suite.query, /ROW\("event_id","user_id"\) > ROW\(\$2,\$3\)/);
  assert.doesNotMatch(suite.query, /offset/i);
});

test("vrai CLI --tables : refus avant import privé ou remise à zéro des compteurs", async () => {
  const a = await archive(), script = require.resolve("../../scripts/restaurer-donnees.js");
  fs.writeFileSync(path.join(a.dossier, "manifeste.json"), JSON.stringify({ projet: URL, tables: {}, schemas_prives: a.man }));
  const trace = path.join(a.dossier, "requetes-fixtures.ndjson"), preload = path.join(a.dossier, "fetch-fixture.cjs");
  fs.writeFileSync(preload, `const fs=require('node:fs'); globalThis.fetch=async(url,init={})=>{fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({method:init.method||'GET'})+'\\n'); return new Response(JSON.stringify(String(url).includes('/api-keys')?[{name:'service_role',api_key:'service_fixture'}]:{status:'ACTIVE_HEALTHY',name:'fixture'}),{status:200});};`);
  const r = spawnSync(process.execPath, ["--require", preload, script, "--archive", a.dossier, "--projet", "klmnopqrstklmnopqrst", "--tables", "passions,passion_relations"], {
    encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: JETON, GITHUB_ACTIONS: "", CI: "" },
  });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Mode --tables refusé/);
  assert.ok(fs.readFileSync(trace, "utf8").trim().split("\n").every((l) => JSON.parse(l).method === "GET"), "aucune mutation ni requête SQL privée");
});

test("empreinte DDL privée : archive modifiée et --schema étranger refusés avant application", async () => {
  const a = await archive(), ddlSource = fs.readFileSync(path.join(a.dossier, "schema.sql"), "utf8");
  const ctx = { ...cfg, archive: a.dossier, man: { projet: URL, tables: {}, schemas_prives: a.man,
    schema_sha256: createHash("sha256").update(ddlSource).digest("hex") } };
  fs.appendFileSync(path.join(a.dossier, "schema.sql"), "\n-- changement");
  assert.equal(R._phases.validerArchive(ctx).ok, false);
  fs.writeFileSync(path.join(a.dossier, "schema.sql"), ddlSource);
  const autre = path.join(a.dossier, "autre.sql"); fs.writeFileSync(autre, "begin; select 1; commit;");
  const ancienFetch = globalThis.fetch, ancienArgv = process.argv, cibleVide = monde({ absent: true });
  let mutations = 0;
  globalThis.fetch = async (url, init) => {
    const q = JSON.parse(init.body).query;
    if (q.startsWith("select table_name from information_schema.tables")) return new Response("[]");
    if (!q.startsWith("select")) mutations++;
    return await cibleVide.lire(q, JSON.parse(init.body).parameters).then((ligne) => new Response(JSON.stringify([ligne])));
  };
  process.argv = [...ancienArgv, "--schema", autre];
  try { await assert.rejects(R._phases.schema(ctx), /Empreinte DDL différente/); }
  finally { globalThis.fetch = ancienFetch; process.argv = ancienArgv; }
  assert.equal(mutations, 0);
});
