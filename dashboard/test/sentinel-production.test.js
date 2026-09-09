// Verrous de la MISE EN LIGNE AUTOMATIQUE. Ce module publie du code vers la
// production sans humain : chacune de ses portes est mesurée, et deux cas
// éprouvent la faute qui a été commise puis corrigée pendant l'écriture.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRemote, perimetreSur, productionState } from "../server/sentinel-production.js";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BRUT = fs.readFileSync(path.join(ICI, "..", "server", "sentinel-production.js"), "utf8");

// ⚠️ ON MESURE LE CODE, PAS LA PROSE. Premier jet de ce fichier : les deux
// verrous ci-dessous tombaient sur les COMMENTAIRES qui expliquent justement
// la faute à ne pas commettre (« on n'appelle jamais PUT /pulls/:n/merge »,
// « aucun contournement »). Un verrou qui interdit de DOCUMENTER le danger
// qu'il surveille pousse à retirer l'explication pour faire passer le test :
// il rend le fichier moins sûr, pas plus. On retire donc les commentaires
// avant de chercher.
// ⚠️⚠️ ET LE NETTOYEUR NE DOIT RIEN AVALER D'AUTRE. Deuxième faute du même
// fichier, trouvée par RÉINJECTION : un `/\*[\s\S]*?\*\/` naïf part au
// premier `/*` VENU, or le corps de la PR contient la chaîne « js/*.js » (le
// périmètre du patch, écrit en toutes lettres). Le stripper ouvrait donc un
// faux bloc à cet endroit et mangeait tout jusqu'au `*/` suivant — emportant
// les appels d'API. Le verrou ne voyait plus rien et restait VERT sur le
// défaut réinjecté : un verrou aveugle est pire qu'un verrou absent, il donne
// une garantie qu'il ne tient pas.
// On ne retire donc que les commentaires qui COMMENCENT une ligne, ce qui est
// le style du fichier et ne peut pas être déclenché par une chaîne.
const SOURCE = BRUT.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("le dépôt distant est lu correctement, sinon rien ne part", () => {
  assert.deepEqual(parseRemote("https://github.com/PASSIO74/passio-app.git"), { owner: "PASSIO74", repo: "passio-app" });
  assert.deepEqual(parseRemote("git@github.com:PASSIO74/passio-app.git"), { owner: "PASSIO74", repo: "passio-app" });
  assert.deepEqual(parseRemote("https://github.com/PASSIO74/passio-app"), { owner: "PASSIO74", repo: "passio-app" });
  // ⚠️ Une URL non-GitHub ne doit pas être « devinée » : on préfère ne rien
  // publier plutôt que d'ouvrir une PR sur un dépôt qu'on n'a pas identifié.
  assert.equal(parseRemote("https://gitlab.com/x/y.git"), null);
  assert.equal(parseRemote(""), null);
  assert.equal(parseRemote(null), null);
});

test("le périmètre est re-vérifié ici, indépendamment de repair.js", () => {
  assert.equal(perimetreSur(["js/app-02-state-utils.js"]), true);
  assert.equal(perimetreSur(["styles.css", "index.html", "sw.js"]), true);
  // Les chemins qui feraient d'une publication automatique un danger.
  assert.equal(perimetreSur(["tests/e2e/first-run.spec.js"]), false, "un patch ne se rend jamais vert en réécrivant un test");
  assert.equal(perimetreSur([".github/workflows/deploy.yml"]), false, "jamais la CI");
  assert.equal(perimetreSur(["migrations/x.sql"]), false, "jamais une migration");
  assert.equal(perimetreSur(["dashboard/server/repair.js"]), false, "jamais le réparateur lui-même");
  assert.equal(perimetreSur(["js/app.js", "tests/x.spec.js"]), false, "un seul fichier hors liste suffit à tout refuser");
  // Une liste VIDE n'est pas un périmètre sûr, c'est un patch qui ne dit rien.
  assert.equal(perimetreSur([]), false);
  assert.equal(perimetreSur(null), false);
});

test("⚠️ le module n'appelle JAMAIS la fusion immédiate de GitHub", () => {
  // Faute réellement commise dans le premier jet de ce fichier : un
  // `PUT /pulls/:n/merge` fusionnait la PR SANS attendre la CI, court-circuitant
  // exactement les contrôles qui rendent la publication sans humain défendable.
  // Ce verrou existe pour qu'elle ne puisse pas revenir par inadvertance.
  assert.equal(/pulls\/[^"'`\n]*\/merge/.test(SOURCE), false,
    "aucune route de fusion directe ne doit apparaître dans ce module");
  assert.match(SOURCE, /enablePullRequestAutoMerge/,
    "la seule fusion permise est l'auto-merge natif, honoré uniquement si les checks requis passent");
});

test("aucun contournement de protection de branche n'est possible", () => {
  assert.equal(/--admin|force[-_]?merge|bypass/i.test(SOURCE), false);
  // Le push ne vise QUE la branche du correctif, jamais la base.
  assert.match(SOURCE, /"push", "origin", repair\.branch/);
  assert.equal(/push[^\n]*origin[^\n]*main/.test(SOURCE), false, "jamais un push direct sur la base");
});

test("l'état ne se déclare jamais prêt sans jeton", () => {
  const st = productionState();
  // Dans l'environnement de test le mode est éteint : il doit le DIRE.
  assert.equal(st.possible, false);
  assert.equal(typeof st.raison, "string");
  assert.ok(st.raison.length > 0, "un mode indisponible doit toujours dire pourquoi");
  assert.equal(typeof st.maxPerDay, "number");
});

test("le bootstrap ne fait JAMAIS promotion locale et publication à la fois", async () => {
  const boot = await import("../server/sentinel-autopilot-bootstrap.js");
  const appels = { promote: 0, publish: 0 };
  const rep = {
    ok: true, branch: "sentinelle/2026-09-09-x", sha: "abc1234",
    files: ["js/app-02-state-utils.js"], changedLines: 3,
  };
  const repairer = boot.makeAutopilotRepairer({
    repair: async () => rep,
    promote: async () => { appels.promote++; return { status: "PROMOTED_LOCAL" }; },
    publish: async () => { appels.publish++; return { published: true, pr: 1 }; },
    productionReady: () => true,
    armRecurrence: () => {},
  });
  const out = await repairer({ id: "d1", key: "k", title: "t" }, null);
  // ⚠️ Faire les deux ferait diverger le `main` local (commit de fusion) et
  // `origin/main` (squash de la PR) : historique irrattrapable au `pull --ff-only`.
  assert.equal(appels.publish, 1);
  assert.equal(appels.promote, 0, "la publication REMPLACE la promotion locale");
  assert.equal(out.production.published, true);
  assert.equal(out.autopilot, undefined);
});

test("mode éteint : on retombe exactement sur le comportement d'avant", async () => {
  const boot = await import("../server/sentinel-autopilot-bootstrap.js");
  const appels = { promote: 0, publish: 0 };
  const repairer = boot.makeAutopilotRepairer({
    repair: async () => ({ ok: true, branch: "sentinelle/x", sha: "a", files: ["js/a.js"] }),
    promote: async () => { appels.promote++; return { status: "HOLD", blockers: [] }; },
    publish: async () => { appels.publish++; return { published: true }; },
    productionReady: () => false,
    armRecurrence: () => {},
  });
  const out = await repairer({ id: "d2" }, null);
  assert.equal(appels.publish, 0);
  assert.equal(appels.promote, 1);
  assert.ok(out.autopilot);
});

test("un correctif NON vérifié ne déclenche ni publication ni promotion", async () => {
  const boot = await import("../server/sentinel-autopilot-bootstrap.js");
  let touche = 0;
  const repairer = boot.makeAutopilotRepairer({
    repair: async () => ({ ok: false, raison: "tests rouges" }),
    promote: async () => { touche++; return {}; },
    publish: async () => { touche++; return {}; },
    productionReady: () => true,
    armRecurrence: () => {},
  });
  const out = await repairer({ id: "d3" }, null);
  assert.equal(touche, 0, "un patch rejeté ne va nulle part");
  assert.equal(out.ok, false);
});

test("une exception de publication n'annule pas le correctif ni la boucle", async () => {
  const boot = await import("../server/sentinel-autopilot-bootstrap.js");
  const repairer = boot.makeAutopilotRepairer({
    repair: async () => ({ ok: true, branch: "sentinelle/x", sha: "a", files: ["js/a.js"] }),
    publish: async () => { throw new Error("réseau coupé"); },
    productionReady: () => true,
    armRecurrence: () => {},
  });
  const out = await repairer({ id: "d4" }, null);
  assert.equal(out.ok, true, "le correctif vérifié survit");
  assert.equal(out.production.published, false);
  assert.equal(out.production.reason, "exception");
});
