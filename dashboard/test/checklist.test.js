// ═══════════════════════════════════════════════════════════════════════════
// CHECKLIST FONCTIONNELLE & FEATURE FLAGS — deux objets écrits depuis le
// navigateur, donc deux surfaces où un champ non prévu peut entrer.
//
// `updateChecklistItem` et `updateFlag` reçoivent un objet JSON venu de la
// requête et le recopient dans un état persisté. Leur seule protection est une
// liste blanche de champs : sans elle, on pourrait réécrire l'identifiant d'une
// ligne, sa catégorie, ou glisser des clés arbitraires dans un fichier que le
// serveur relit à chaque démarrage.
//
// L'autre point, moins visible : la CRÉATION coerce ses types (`!!enabled`,
// `Number(rollout)`) alors que la MODIFICATION recopiait tel quel. Un formulaire
// envoie « 50 » et « false », pas 50 et false — un même drapeau finissait donc
// avec des données de forme différente selon le chemin emprunté, et la chaîne
// "false" est VRAIE.
//
// ⚠️ `DASH_DATA_DIR` est détourné avant tout import : sinon ce fichier écrirait
// dans la vraie checklist et les vrais drapeaux.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-checklist-test-"));
process.env.DASH_DATA_DIR = TMP;
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { listChecklist, updateChecklistItem, listFlags, createFlag, updateFlag } =
  await import("../server/checklist.js");
const { config } = await import("../server/config.js");
assert.equal(config.dataDir, TMP, "la checklist de test doit être isolée");

test("la checklist démarre remplie et chaque ligne est identifiée", () => {
  const items = listChecklist();
  assert.ok(items.length > 30, "la checklist par défaut doit couvrir l'app");
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, "identifiants uniques");
  assert.ok(items.every((i) => i.status === "non_teste"), "tout part de « non testé »");
  assert.ok(items.some((i) => i.category === "rgpd"), "y compris la suppression de compte");
});

test("mise à jour : seuls les champs prévus entrent", () => {
  const cible = listChecklist()[0];
  const avant = { id: cible.id, category: cible.category, name: cible.name };

  const apres = updateChecklistItem(cible.id, {
    status: "ok", tester: "benjamin", notes: "vu sur iPhone",
    // Champs NON prévus : ils ne doivent laisser aucune trace.
    id: "chk_pirate", category: "pirate", name: "renommé", updatedAt: 0, inconnu: "x",
  }, "benjamin");

  assert.equal(apres.status, "ok");
  assert.equal(apres.tester, "benjamin");
  assert.equal(apres.notes, "vu sur iPhone");
  assert.equal(apres.id, avant.id, "l'identifiant ne doit pas être réécrivable");
  assert.equal(apres.category, avant.category);
  assert.equal(apres.name, avant.name);
  assert.equal(apres.inconnu, undefined, "aucune clé arbitraire ne doit entrer");
  assert.ok(apres.updatedAt > 0, "l'horodatage est posé par le serveur, pas par l'appelant");

  // …et la ligne relue est bien celle qu'on a modifiée.
  assert.equal(listChecklist().find((i) => i.id === avant.id).status, "ok");
  assert.equal(listChecklist().some((i) => i.id === "chk_pirate"), false);
});

test("un identifiant inconnu rend null, sans rien créer", () => {
  const avant = listChecklist().length;
  assert.equal(updateChecklistItem("chk_inexistant", { status: "ok" }, "b"), null);
  assert.equal(listChecklist().length, avant);
});

test("drapeaux : création et modification donnent la MÊME forme de données", () => {
  // Un formulaire envoie des chaînes. Les deux chemins doivent converger.
  const cree = createFlag({ key: "essai", label: "Essai", enabled: "1", rollout: "50" }, "b");
  assert.equal(typeof cree.enabled, "boolean");
  assert.equal(typeof cree.rollout, "number");

  const modifie = updateFlag(cree.id, { enabled: "false", rollout: "80" }, "b");
  assert.equal(typeof modifie.enabled, "boolean");
  assert.equal(modifie.enabled, false, 'la CHAÎNE "false" est vraie en JavaScript');
  assert.equal(modifie.rollout, 80);

  assert.equal(updateFlag(cree.id, { rollout: 900 }, "b").rollout, 100, "borné à 100");
  assert.equal(updateFlag(cree.id, { rollout: -5 }, "b").rollout, 0, "borné à 0");
  assert.equal(updateFlag(cree.id, { rollout: "beaucoup" }, "b").rollout, 0, "valeur illisible → 0");
});

test("drapeaux : l'historique retient qui a changé quoi, et reste borné", () => {
  const f = createFlag({ key: "historique", enabled: false, rollout: 0 }, "benjamin");
  const apres = updateFlag(f.id, { enabled: true, rollout: 25 }, "lea");
  const dernier = apres.history.at(-1);
  assert.equal(dernier.actor, "lea");
  assert.deepEqual(dernier.before, { enabled: false, rollout: 0 });
  assert.deepEqual(dernier.after, { enabled: true, rollout: 25 });

  for (let i = 0; i < 60; i++) updateFlag(f.id, { rollout: i }, "b");
  const final = listFlags().find((x) => x.id === f.id);
  assert.ok(final.history.length <= 50, `historique non borné : ${final.history.length}`);
  assert.equal(final.history.at(-1).after.rollout, 59, "…et c'est la fin qui est conservée");
});

test("modifier un drapeau inconnu rend null, sans en créer un", () => {
  const avant = listFlags().length;
  assert.equal(updateFlag("ff_inexistant", { enabled: true }, "b"), null);
  assert.equal(listFlags().length, avant);
});
