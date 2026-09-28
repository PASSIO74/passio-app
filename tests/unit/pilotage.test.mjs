// Pilotage dans le nuage (2026-09-28) — la logique pure de la fonction
// `supabase/functions/pilotage`. Le fichier éprouvé est CELUI que Deno déploie.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { autorise, COMPTE_PILOTE, RELANCES, erreursFrequentes, resumerIssue, verdict } from "../../supabase/functions/_shared/pilotage.js";

const confirme = (email) => ({ email, email_confirmed_at: "2026-09-01T00:00:00Z" });

test("① seul le compte de l'éditeur, CONFIRMÉ, pilote — échec fermé", () => {
  assert.equal(autorise(confirme(COMPTE_PILOTE)), true);
  assert.equal(autorise(confirme(" PassioAdmin@Gmail.com ")), true, "casse et blancs");
  assert.equal(autorise(confirme("quelquun@exemple.fr")), false);
  assert.equal(autorise({ email: COMPTE_PILOTE }), false, "adresse non confirmée");
  assert.equal(autorise(null), false);
  assert.equal(autorise({}), false);
  assert.equal(autorise(confirme("aide@exemple.fr"), "aide@exemple.fr, autre@x.fr"), true, "PILOTAGE_EMAILS ajoute");
  assert.equal(autorise(confirme("x@y.fr"), ",, ,"), false, "une liste vide n'ouvre rien");
});

test("② le compte piloté est bien l'éditeur des mentions légales", () => {
  const src = fs.readFileSync("js/legal-textes.js", "utf8");
  assert.ok(src.includes(COMPTE_PILOTE), "PASSIO_EDITEUR.email et COMPTE_PILOTE ont divergé");
});

test("③ relances : liste blanche de trois workflows qui acceptent workflow_dispatch", () => {
  assert.deepEqual(Object.keys(RELANCES).sort(), ["digest", "sentinelle", "veille"]);
  for (const r of Object.values(RELANCES)) {
    const y = fs.readFileSync(".github/workflows/" + r.fichier, "utf8");
    assert.match(y, /workflow_dispatch:/, r.fichier);
  }
  assert.equal(Object.hasOwn(RELANCES, "constructor"), false);
});

test("④ erreurs regroupées par message, bornées, comptes distincts", () => {
  const l = [
    { message: "A", uid: "u1", created_at: "2026-09-28T10:00:00Z" },
    { message: "A", uid: "u2", created_at: "2026-09-28T11:00:00Z" },
    { message: "A", uid: "u1", created_at: "2026-09-28T09:00:00Z" },
    { message: "B".repeat(500), uid: "u3", created_at: "2026-09-28T12:00:00Z" },
  ];
  const r = erreursFrequentes(l);
  assert.equal(r[0].message, "A"); assert.equal(r[0].n, 3); assert.equal(r[0].comptes, 2);
  assert.equal(r[0].dernier, "2026-09-28T11:00:00.000Z");
  assert.ok(r[1].message.length <= 161);
});

test("⑤ une issue résumée ne porte ni corps ni auteur, et le lien doit être github.com", () => {
  const r = resumerIssue({ number: 7, title: "x", body: "secret", user: { login: "z" }, labels: [{ name: "sentinelle" }], html_url: "javascript:alert(1)" });
  assert.deepEqual(Object.keys(r).sort(), ["depuis", "labels", "numero", "pr", "titre", "url"]);
  assert.equal(r.url, null);
  assert.deepEqual(r.labels, ["sentinelle"]);
});

test("⑥ verdict : vert, orange, rouge, gris", () => {
  const recent = new Date().toISOString();
  const base = { sante: { erreursJs15: 0, api5xx15: 0 }, github: { issues: [], runs: { sentinelle: { le: recent } } }, signalements: { ouverts: 0 } };
  assert.equal(verdict(base).couleur, "vert");
  assert.equal(verdict({ ...base, sante: { erreursJs15: 2, api5xx15: 0 } }).couleur, "orange");
  assert.equal(verdict({ ...base, sante: { erreursJs15: 12, api5xx15: 0 } }).couleur, "rouge");
  assert.equal(verdict({ ...base, github: { issues: [{ labels: ["humain"], pr: false }], runs: {} } }).couleur, "rouge");
  assert.equal(verdict({ ...base, github: { issues: [], runs: { deploy: { conclusion: "failure" } } } }).couleur, "rouge");
  assert.equal(verdict({ ...base, github: { issues: [], runs: { sentinelle: { le: "2020-01-01T00:00:00Z" } } } }).couleur, "orange", "Sentinelle muette");
  assert.equal(verdict({ github: null }).couleur, "gris");
});
