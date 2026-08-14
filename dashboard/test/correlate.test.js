// Tests de la corrélation incident ↔ changements récents.
// L'enjeu n'est pas de « trouver un coupable » mais de ne JAMAIS en désigner un
// à tort : ces tests portent surtout sur ce que le module refuse d'affirmer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suspectsFor, suspectsPromptBlock } from "../server/correlate.js";

test("un incident non daté ne produit aucune hypothèse", async () => {
  const r = await suspectsFor(undefined, "feed");
  assert.equal(r.suspects.length, 0);
  assert.match(r.note, /non daté/i);
});

test("un incident très ancien ne se voit attribuer aucun commit récent", async () => {
  // Fenêtre de 24 h autour d'une date de 2020 : le dépôt n'a rien à cet endroit.
  const r = await suspectsFor(new Date("2020-01-01T00:00:00Z").getTime(), "feed");
  assert.equal(r.suspects.length, 0);
  assert.ok(r.note.length > 0, "une explication est toujours fournie");
});

test("les commits POSTÉRIEURS au début de l'incident sont exclus", async () => {
  // Un incident daté d'il y a 10 jours ne peut pas être causé par les commits
  // de cette semaine — le module ne doit remonter que ce qui le précède.
  const start = Date.now() - 10 * 86400_000;
  const r = await suspectsFor(start, "feed");
  for (const s of r.suspects) {
    assert.ok(s.at <= start, `commit ${s.hash} postérieur au début de l'incident`);
    assert.ok(s.minutesBefore >= 0, "minutesBefore ne peut pas être négatif");
  }
});

test("le bloc de prompt annonce toujours l'incertitude quand il y a des suspects", () => {
  const block = suspectsPromptBlock({
    suspects: [{ hash: "abc1234", subject: "fix(feed): tri", author: "B", at: Date.now(),
      minutesBefore: 12, files: ["js/app-03-posts-vlogs.js"], fileCount: 1, sameArea: true, confidence: "élevée" }],
    scanned: 3, window: "24 h", note: "",
  });
  assert.match(block, /Corrélation ≠ causalité/);
  assert.match(block, /abc1234/);
  assert.match(block, /12 min avant/);
  assert.match(block, /même zone fonctionnelle/);
});

test("sans suspect, le bloc le DIT au lieu de rester vide", () => {
  const block = suspectsPromptBlock({
    suspects: [], scanned: 5, window: "24 h",
    note: "Aucun changement proche : l'incident ne semble PAS lié à un déploiement récent.",
  });
  assert.match(block, /Aucun changement proche/);
  // Ne doit surtout pas laisser croire à une causalité inexistante.
  assert.ok(!/Corrélation ≠ causalité/.test(block));
});

test("un commit qui ne touche QUE le dashboard n'est jamais suspect d'un bug applicatif", async () => {
  // Le centre de pilotage est exclu du build (Netlify ignore dashboard/) : ces
  // commits ne peuvent pas casser l'app. Les 6 derniers commits du dépôt étant
  // précisément des commits `dashboard/`, ils doivent tous être écartés.
  const r = await suspectsFor(Date.now(), "feed");
  for (const s of r.suspects) {
    const onlyDash = s.files.length && s.files.every((f) => /^(dashboard|tests?|docs?)\//.test(f) || /\.md$/i.test(f));
    assert.ok(!onlyDash, `commit hors app retenu à tort : ${s.hash} (${s.files.join(", ")})`);
  }
});

test("la confiance est bornée aux niveaux prévus et « faible » est filtré", async () => {
  const r = await suspectsFor(Date.now(), "app");
  for (const s of r.suspects) {
    assert.ok(["élevée", "moyenne"].includes(s.confidence), "niveau inattendu : " + s.confidence);
  }
});
