// Garde des contrats d'action (2026-11-06) — éprouvée par RÉINJECTION : chaque
// cas rejoue une forme réellement vécue (le `flowStart("cint")` dont le retour
// était jeté jusqu'au 2026-11-06 ; celui du RSVP jusqu'au 2026-09-18).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyser, sansCommentaires } from "../../scripts/audit-contrats-actions.mjs";
import { CONTRATS } from "../../supabase/functions/_shared/contrats-actions.js";

const seul = (src, contrats = { cint: { ...CONTRATS.cint, emetteurs: ["js/x.js"] } }) => analyser({ "js/x.js": src }, contrats).fautes;

test("① le dépôt tel qu'il est passe la garde", () => {
  const sources = {};
  for (const nom of fs.readdirSync("js")) if (nom.endsWith(".js") && nom !== "telemetry.js") sources["js/" + nom] = fs.readFileSync("js/" + nom, "utf8");
  assert.deepEqual(analyser(sources).fautes, []);
});

test("② RÉINJECTION : le flux « cint » dont l'identifiant était jeté est refusé", () => {
  const avant = `try { window.tel && tel.flowStart && tel.flowStart("cint", { commentId: commentId, postId: postId || null }); } catch (e) {}`;
  const f = seul(avant);
  assert.equal(f.length, 1);
  assert.match(f[0], /js\/x\.js:1 : flux ouvert dont l'identifiant n'est pas gardé/);
  assert.deepEqual(seul(`let c = null; try { if (window.tel && tel.flowStart) c = tel.flowStart("cint", {}); } catch (e) {}`), []);
});

test("③ une comparaison n'est pas une affectation", () => {
  assert.equal(seul(`if (x == tel.flowStart("cint")) {}`).length, 1);
  assert.equal(seul(`if (x === tel.flowStart("cint")) {}`).length, 1);
  assert.equal(seul(`if (x != tel.flowStart("cint")) {}`).length, 1);
});

test("④ une action sans contrat, un ternaire à moitié couvert, une action non littérale", () => {
  assert.match(seul(`c = tel.flowStart("partage_inconnu", {});`).join(), /« partage_inconnu » sans contrat/);
  const t = seul(`c = tel.flowStart(ok ? "cint" : "cint_fantome", {});`);
  assert.equal(t.length, 1);
  assert.match(t[0], /cint_fantome/);
  assert.match(seul(`c = tel.flowStart(nomAction, {});`).join(), /action non littérale/);
  assert.deepEqual(seul(`c = window.tel.flowStart('cint');`), [], "guillemets simples, préfixe window.");
});

test("⑤ les commentaires ne comptent pas, les chaînes qui contiennent // non plus", () => {
  assert.deepEqual(seul(`// tel.flowStart("fantome") dans un commentaire\nc = tel.flowStart("cint", { u: "https://x.fr" }); // fin`), []);
  assert.equal(sansCommentaires(`a = "http://x"; // b`).trim(), `a = "http://x";`);
});

test("⑥ un émetteur déclaré sans flux, un contrat critique sans émetteur", () => {
  const contrats = { send_message: { ...CONTRATS.send_message, emetteurs: ["js/x.js"] } };
  const f = analyser({ "js/x.js": "rien ici" }, contrats).fautes;
  assert.ok(f.some((x) => /émetteur déclaré js\/x\.js ne porte aucun/.test(x)));
  assert.ok(f.some((x) => /send_message \(critique\) : aucun émetteur/.test(x)));
});

test("⑦ npm run verif porte la garde", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts.verif, /node scripts\/audit-contrats-actions\.mjs/);
  assert.match(pkg.scripts.verif, /node --test tests\/unit\/audit-contrats-actions\.test\.mjs/);
  assert.match(pkg.scripts.verif, /node --test tests\/unit\/parcours\.test\.mjs/);
});
