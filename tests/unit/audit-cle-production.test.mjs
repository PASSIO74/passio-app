// EXP-11 — la clé de service de la PRODUCTION n'est jamais à portée d'une PR.
//
// ASTRA-52 (cinquième contre-revue, 15/09/2026) : la gate ligne à ligne
// acceptait six formes à tort. Chacune est REJOUÉE ici (cas ①–⑥) : elle doit
// ROUGIR. Puis les workflows RÉELS du dépôt sont lus (⑦), et la réinjection du
// défaut mesuré sur `deploy.yml` (⑧) — par l'ARBRE lu, plus par une ligne.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RACINE = path.join(import.meta.dirname, "..", "..");
const { auditerTexte, auditer, gardeAcceptee, referencesCle } = require(path.join(RACINE, "scripts/audit-cle-production.js"));
const { lireYaml } = require(path.join(RACINE, "scripts/lib/yaml-workflow.js"));

const ETAPE_CLE = (indent, iff) => [
  `${indent}- name: Barrière RLS de la production`,
  ...(iff ? [`${indent}  if: ${iff}`] : []),
  `${indent}  env:`,
  `${indent}    SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}`,
  `${indent}  run: npx playwright test --project=prod`,
];
const WF = (on, etapes, jobIf) => ["name: x", on, "jobs:", "  a:", "    runs-on: ubuntu-latest", ...(jobIf ? ["    if: " + jobIf] : []), "    steps:", ...etapes].join("\n") + "\n";
const manques = (texte) => auditerTexte("t.yml", texte).manques.length;

test("ASTRA-52 ① `on` en TABLEAU ou en SCALAIRE déclenche bien sur pull_request — la gate d'avant ne le voyait pas", () => {
  const sansGarde = ETAPE_CLE("      ", null);
  assert.equal(manques(WF("on: [push, pull_request]", sansGarde)), 1, "tableau en ligne");
  assert.equal(manques(WF("on:\n  - push\n  - pull_request", sansGarde)), 1, "tableau en bloc");
  assert.equal(manques(WF("on: pull_request", sansGarde)), 1, "scalaire");
  assert.equal(manques(WF("on: push", sansGarde)), 0, "push seul : pas concerné");
});

test("ASTRA-52 ② une indentation de QUATRE espaces est lue comme celle de deux", () => {
  const y = ["name: x", "on:", "    pull_request:", "jobs:", "    a:", "        runs-on: ubuntu-latest", "        steps:", ...ETAPE_CLE("            ", null)].join("\n") + "\n";
  assert.equal(manques(y), 1);
  const g = ["name: x", "on:", "    pull_request:", "jobs:", "    a:", "        runs-on: ubuntu-latest", "        steps:", ...ETAPE_CLE("            ", "github.event_name == 'push'")].join("\n") + "\n";
  assert.equal(manques(g), 0);
});

test("ASTRA-52 ③ `secrets['SUPABASE_SERVICE_ROLE_KEY']`, `secrets[\"…\"]`, `toJSON(secrets)` et `${{ secrets }}` sont des références", () => {
  assert.equal(referencesCle("${{ secrets['SUPABASE_SERVICE_ROLE_KEY'] }}").length, 1);
  assert.equal(referencesCle('${{ secrets["SUPABASE_SERVICE_ROLE_KEY"] }}').length, 1);
  assert.equal(referencesCle("${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}").length, 1);
  assert.equal(referencesCle("${{ toJSON(secrets) }}")[0].forme, "contexte entier");
  assert.equal(referencesCle("${{ secrets }}")[0].forme, "contexte entier");
  assert.equal(referencesCle("${{ secrets[matrix.cle] }}")[0].forme, "indexation dynamique");
  assert.equal(referencesCle("${{ secrets.STAGING_SERVICE_ROLE_KEY }}").length, 0, "le staging n'est pas la production");
  assert.equal(referencesCle("${{ vars.SUPABASE_SERVICE_ROLE_KEY }}").length, 0, "`vars.` n'est pas un secret (et l'en-tête le dit)");
  const y = WF("on:\n  pull_request:", ["      - name: x", "        env:", "          K: ${{ secrets['SUPABASE_SERVICE_ROLE_KEY'] }}", "        run: x"]);
  assert.equal(manques(y), 1);
});

test("ASTRA-52 ④ `|| true`, une parenthèse, une négation ne sont PAS des gardes", () => {
  assert.equal(gardeAcceptee("github.event_name == 'push' || true", ["pull_request"]).acceptee, false);
  assert.equal(gardeAcceptee("(github.event_name == 'push')", ["pull_request"]).acceptee, false);
  assert.equal(gardeAcceptee("!cancelled() && github.event_name == 'push'", ["pull_request"]).acceptee, false);
  assert.equal(gardeAcceptee("github.event_name == 'push'", ["pull_request"]).acceptee, true);
  assert.equal(gardeAcceptee("${{ github.event_name == 'push' }}", ["pull_request"]).acceptee, true);
  assert.equal(gardeAcceptee("github.event_name != 'pull_request' && steps.pause.outputs.actif == 'true'", ["pull_request"]).acceptee, true, "une conjonction ne fait que restreindre");
  assert.equal(gardeAcceptee("steps.pause.outputs.actif == 'true'", ["pull_request"]).acceptee, false, "aucun atome accepté");
  assert.equal(gardeAcceptee("github.event_name == \"push\"", ["pull_request"]).acceptee, true, "guillemets doubles");
  assert.equal(manques(WF("on:\n  pull_request:", ETAPE_CLE("      ", "github.event_name == 'push' || true"))), 1);
});

test("ASTRA-52 ⑤ un commentaire n'est pas une garde, et un `if:` est lu dans l'ARBRE", () => {
  const y = WF("on:\n  pull_request:", [
    "      - name: x   # if: github.event_name == 'push'",
    "        # if: github.event_name == 'push'",
    "        env:",
    "          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "        run: x",
  ]);
  assert.equal(manques(y), 1, "les commentaires ne gardent rien");
  // Un `if:` de JOB couvre ses étapes.
  assert.equal(manques(WF("on:\n  pull_request:", ETAPE_CLE("      ", null), "github.event_name == 'push'")), 0);
  // Un `if:` d'une AUTRE étape ne couvre pas celle-ci.
  assert.equal(manques(WF("on:\n  pull_request:", ["      - name: autre", "        if: github.event_name == 'push'", "        run: x", ...ETAPE_CLE("      ", null)])), 1);
});

test("ASTRA-52 ⑥ `!= 'pull_request'` n'exclut pas `pull_request_target`", () => {
  const cible = "on:\n  pull_request_target:";
  assert.equal(manques(WF(cible, ETAPE_CLE("      ", "github.event_name != 'pull_request'"))), 1, "pull_request_target passe encore");
  assert.equal(manques(WF(cible, ETAPE_CLE("      ", "github.event_name != 'pull_request' && github.event_name != 'pull_request_target'"))), 0);
  assert.equal(manques(WF("on:\n  pull_request:", ETAPE_CLE("      ", "github.event_name != 'pull_request'"))), 0, "sans pull_request_target, l'exclusion simple suffit");
});

test("ASTRA-52 ⑦ une forme YAML inconnue n'est JAMAIS certifiée sûre : ancre, alias, documents multiples → erreur, rouge", () => {
  for (const y of ["on: &a\n  pull_request:\njobs: *a\n", "---\non:\n  push:\n---\non:\n  pull_request:\n", "on: !!map\n  pull_request:\n"]) {
    const r = auditerTexte("t.yml", y);
    assert.ok(r.erreurs.length >= 1, "erreur attendue pour : " + JSON.stringify(y));
    assert.equal(r.concerne, true, "…et le workflow est traité comme concerné");
  }
  const { manques: m, erreurs } = auditer([{ nom: "t.yml", texte: "on: &a\n  pull_request:\n" }]);
  assert.ok(erreurs.length >= 1 || m.length >= 1);
});

test("⑧ sur les workflows RÉELS : tous se lisent, la gate est verte, et les chemins non certifiés sont nommés", () => {
  const dossier = path.join(RACINE, ".github", "workflows");
  const liste = fs.readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ nom: f, texte: fs.readFileSync(path.join(dossier, f), "utf8") }));
  for (const w of liste) assert.doesNotThrow(() => lireYaml(w.texte), w.nom + " doit se lire");
  const r = auditer(liste);
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.manques, [], JSON.stringify(r.manques));
  const deploy = r.rapports.find((x) => x.nom === "deploy.yml");
  assert.equal(deploy.concerne, true);
  assert.ok(deploy.occurrences.length >= 2, "les deux étapes de la production sont vues : " + deploy.occurrences.length);
  assert.ok(deploy.occurrences.every((o) => o.garde), "…et gardées");
  // Les chemins que la gate ne certifie pas sont listés (actions composites du dépôt).
  const composites = r.rapports.flatMap((x) => x.chemins.actionsComposites);
  assert.ok(composites.some((c) => /claude-auth-guard/.test(c.uses)), "l'action composite du dépôt est nommée");
});

test("⑨ RÉINJECTION sur deploy.yml RÉEL : retirer les deux `if:` fait rougir la gate ; les remplacer par `|| true` aussi", () => {
  // CRLF (poste Windows, autocrlf) → LF : le test d'avant échouait ici, pas sur la gate.
  const texte = fs.readFileSync(path.join(RACINE, ".github", "workflows", "deploy.yml"), "utf8").split("\r\n").join("\n");
  // On retire TOUTES les gardes « push » du fichier (celle du job de déploiement
  // n'emporte aucune clé : seules les deux étapes de la production doivent rougir).
  const sans = texte.replace(/^\s+if: github\.event_name == 'push'\n/gm, "");
  assert.notEqual(sans, texte, "le défaut a bien été réinjecté (la garde existe et se trouve là où on la cherche)");
  const r = auditerTexte("deploy.yml", sans);
  assert.equal(r.manques.length, 2, JSON.stringify(r.manques.map((m) => m.chemin)));
  const ouTrue = texte.replace(/if: github\.event_name == 'push'\n/g, "if: github.event_name == 'push' || true\n");
  assert.notEqual(ouTrue, texte);
  assert.equal(auditerTexte("deploy.yml", ouTrue).manques.length, 2, "`|| true` n'est pas une garde");
});

// ═══ ASTRA-62 (sixième contre-revue, 16/09/2026) : trois faux verts synthétiques ═══
const rouge = (texte) => { const r = auditerTexte("t.yml", texte); return r.manques.length + r.erreurs.length; };

test("ASTRA-62 ① le nom du secret en MINUSCULES est le même secret pour GitHub : référence vue, garde exigée", () => {
  const etape = (nom) => ["      - name: x", "        env:", `          K: \${{ secrets.${nom} }}`, "        run: echo"];
  assert.equal(manques(WF("on: [pull_request]", etape("supabase_service_role_key"))), 1, "minuscules");
  assert.equal(manques(WF("on: [pull_request]", etape("Supabase_Service_Role_Key"))), 1, "casse mixte");
  assert.equal(manques(WF("on: [pull_request]", ["      - name: x", "        env:", "          K: ${{ secrets['supabase_service_role_key'] }}", "        run: echo"])), 1, "indexation, minuscules");
  assert.equal(referencesCle("${{ secrets.supabase_service_role_key }}").length, 1);
  assert.equal(manques(WF("on: [pull_request]", etape("supabase_service_role_key"), "github.event_name == 'push'")), 0, "gardée : accepté");
});

test("ASTRA-62 ② un job nommé `__proto__` n'est plus invisible : il est lu, et sa clé sans garde rougit", () => {
  const wf = ["name: x", "on: [pull_request]", "jobs:", "  __proto__:", "    runs-on: ubuntu-latest", "    steps:", ...ETAPE_CLE("      ", null)].join("\n") + "\n";
  const doc = lireYaml(wf);
  assert.ok(Object.prototype.hasOwnProperty.call(doc.jobs, "__proto__"), "le job est une clé PROPRE, pas le prototype");
  assert.equal(Object.getPrototypeOf(doc.jobs), null, "les mappings n'ont pas de prototype");
  assert.equal(manques(wf), 1, "la clé sans garde dans le job __proto__ est un manque");
  // Et `constructor` / `prototype` / `hasOwnProperty` sont des clés comme les autres.
  const wf2 = ["name: x", "on: [pull_request]", "jobs:", "  constructor:", "    runs-on: ubuntu-latest", "    steps:", ...ETAPE_CLE("      ", null)].join("\n") + "\n";
  assert.equal(manques(wf2), 1);
  // Une clé en double (deux `if:` sur le même job — laquelle GitHub lit-il ?) n'est pas certifiée : erreur.
  const wf3 = ["name: x", "on: [pull_request]", "jobs:", "  a:", "    runs-on: ubuntu-latest", "    if: github.event_name == 'push'", "    if: true", "    steps:", ...ETAPE_CLE("      ", null)].join("\n") + "\n";
  assert.ok(rouge(wf3) >= 1, "clé en double → rouge");
  assert.throws(() => lireYaml("a: 1\na: 2\n"), /clé en double/);
});

test("ASTRA-62 ③ `pull_request` encodé par un échappement YAML n'est pas lu à moitié : forme non prise en charge → rouge ; déclencheur inconnu → concerné", () => {
  // `"pull_reque\u0073t"` : YAML le lit « pull_request », la gate d'avant lisait autre chose → pas concerné → vert.
  const env = (on) => WF(on, ETAPE_CLE("      ", null));
  assert.ok(rouge(env('on: ["pull_reque\\u0073t"]')) >= 1, "\\u0073 : rouge (erreur de lecture)");
  assert.ok(rouge(env('on:\n  "pull_reque\\x73t":\n    branches: [main]')) >= 1, "\\x73 en clé : rouge");
  assert.ok(rouge(env('on: ["pull\\_request"]')) >= 1, "\\_ (espace insécable YAML) : rouge");
  assert.throws(() => lireYaml('a: "\\u0073"\n'), /échappement YAML non pris en charge/);
  // Les échappements admis restent lus.
  assert.deepEqual(lireYaml('a: "x\\"y\\n"\n').a, 'x"y\n');
  // Un déclencheur que la gate ne connaît pas (faute, variante) : CONCERNÉ, fail-closed — la clé sans garde rougit.
  const r = auditerTexte("t.yml", env("on: [pull_requests]"));
  assert.equal(r.concerne, true);
  assert.ok(r.erreurs.some((e) => /déclencheur\(s\) inconnu\(s\)/.test(e)), JSON.stringify(r.erreurs));
  assert.equal(r.manques.length, 1);
  // Et `secrets: inherit` vers un workflow appelé, depuis une PR, est une référence au contexte entier.
  const appel = ["name: x", "on: [pull_request]", "jobs:", "  a:", "    uses: ./.github/workflows/autre.yml", "    secrets: inherit"].join("\n") + "\n";
  assert.equal(manques(appel), 1, "inherit sans garde : manque");
  const appelGarde = ["name: x", "on: [pull_request, push]", "jobs:", "  a:", "    if: github.event_name == 'push'", "    uses: ./.github/workflows/autre.yml", "    secrets: inherit"].join("\n") + "\n";
  assert.equal(manques(appelGarde), 0, "inherit gardé : accepté");
});
