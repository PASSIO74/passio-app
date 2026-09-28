// Pilotage dans le nuage (2026-09-28) — la logique pure de la fonction
// `supabase/functions/pilotage`. Le fichier éprouvé est CELUI que Deno déploie.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { autorise, COMPTE_PILOTE, RELANCES, erreursFrequentes, resumerIssue, verdict, decideAlerte, plateforme, cheminPage, serieJours, detailsErreurs, jauges, estPause, TITRE_PAUSE, STATUTS_SIGNALEMENT } from "../../supabase/functions/_shared/pilotage.js";

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

test("⑦ l'alerte ne sonne que sur un changement qui compte", () => {
  const t = Date.parse("2026-09-28T12:00:00Z");
  const vert = { couleur: "vert", dispo: true, alerteLe: null };
  assert.equal(decideAlerte(vert, { couleur: "vert", dispo: true }, t).sonner, false);
  assert.equal(decideAlerte(vert, { couleur: "orange", dispo: true }, t).sonner, false, "l'orange ne sonne jamais");
  assert.equal(decideAlerte(null, { couleur: "orange", dispo: true }, t).sonner, false, "premier passage calme : silence");
  const r = decideAlerte(vert, { couleur: "rouge", dispo: true, raisons: ["12 erreurs"] }, t);
  assert.equal(r.sonner, true); assert.match(r.titre, /Problème/); assert.match(r.texte, /12 erreurs/);
  const rougeRecent = { couleur: "rouge", dispo: true, alerteLe: "2026-09-28T10:00:00Z" };
  assert.equal(decideAlerte(rougeRecent, { couleur: "rouge", dispo: true }, t).sonner, false, "pas de rappel avant 6 h");
  assert.equal(decideAlerte({ ...rougeRecent, alerteLe: "2026-09-28T05:00:00Z" }, { couleur: "rouge", dispo: true }, t).sonner, true, "rappel après 6 h");
  assert.match(decideAlerte(rougeRecent, { couleur: "vert", dispo: true }, t).titre, /résolu/);
  assert.match(decideAlerte(vert, { couleur: "vert", dispo: false }, t).titre, /ne répond plus/);
  assert.match(decideAlerte({ ...vert, dispo: false }, { couleur: "vert", dispo: true }, t).titre, /de nouveau/);
});

test("⑧ détails d'erreur : appareil, page SANS requête, série 7 j", () => {
  assert.equal(plateforme("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "iPhone/iPad");
  assert.equal(plateforme("Mozilla/5.0 (Linux; Android 14)"), "Android");
  assert.equal(plateforme(""), "Autre");
  assert.equal(cheminPage("https://passio-app.netlify.app/profil?token=secret#x"), "/profil");
  assert.equal(cheminPage("pas une url"), null);
  const t = Date.parse("2026-09-28T12:00:00Z");
  const s = serieJours(["2026-09-28T01:00:00Z", "2026-09-27T23:00:00Z", "2026-09-10T00:00:00Z", "n'importe quoi"], 7, t);
  assert.equal(s.length, 7); assert.equal(s[6].jour, "2026-09-28"); assert.equal(s[6].n, 1); assert.equal(s[5].n, 1);
  assert.equal(s.reduce((a, x) => a + x.n, 0), 2, "hors fenêtre et illisible ignorés");
  const d = detailsErreurs([
    { message: "E", uid: "a", ua: "iPhone", url: "https://x/fil?k=1", created_at: "2026-09-28T10:00:00Z" },
    { message: "E", uid: "b", ua: "Android", url: "https://x/fil", created_at: "2026-09-27T10:00:00Z" },
  ], 8, t);
  assert.equal(d[0].n, 2); assert.equal(d[0].comptes, 2);
  assert.deepEqual(d[0].pages, [{ nom: "/fil", n: 2 }]);
  assert.equal(d[0].premier, "2026-09-27T10:00:00.000Z");
});

test("⑨ jauges : pourcentage, couleurs 70/90, valeur absente = non mesuré", () => {
  const j = Object.fromEntries(jauges({ connexions: 360, emails: 280, base: 100 * 1024 ** 2, stockage: null }).map((x) => [x.cle, x]));
  assert.equal(j.connexions.pct, 72); assert.equal(j.connexions.couleur, "orange"); assert.equal(j.connexions.estimation, true);
  assert.equal(j.emails.couleur, "rouge");
  assert.equal(j.base.couleur, "vert");
  assert.equal(j.stockage.pct, null); assert.equal(j.stockage.couleur, "gris");
});

test("⑩ pause Sentinelle : même convention que sentinelle-autonome.yml", () => {
  assert.equal(estPause(TITRE_PAUSE), true);
  assert.equal(estPause("[SENTINELLE] erreur"), false);
  const y = fs.readFileSync(".github/workflows/sentinelle-autonome.yml", "utf8");
  assert.match(y, /SENTINELLE PAUSE/, "le workflow lit bien ce marqueur");
  assert.deepEqual(STATUTS_SIGNALEMENT, ["handled", "dismissed"]);
});

test("⑪ le service worker de l'app affiche l'alerte du pilotage et ouvre /pilotage/", () => {
  const sw = fs.readFileSync("sw.js", "utf8");
  assert.match(sw, /data\.type === "pilotage"/);
  assert.match(sw, /tag: "passio-pilotage"/);
  assert.match(sw, /e\.notification\.tag === "passio-pilotage"[\s\S]{0,400}openWindow\("\.\/pilotage\/"\)/);
  const fn = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(fn, /type: "pilotage"/, "la fonction envoie bien ce type");
});
