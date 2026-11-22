import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function panneau() {
  const source = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
  const debutFix = source.indexOf("async function fixWithClaude("), finFix = source.indexOf("window.__fixWithClaude", debutFix);
  const debutResultat = source.indexOf("function renderFixResult("), finResultat = source.indexOf("//  VUES", debutResultat);
  assert.ok(debutFix >= 0 && finFix > debutFix && debutResultat >= 0 && finResultat > debutResultat);
  const constante = source.match(/^const FIX_NOTE_SUSPENDUE = .*;$/m)?.[0] || "";
  const appels = [], chargements = [], corps = { outerHTML: "" }, relancer = {}, approfondir = {}, note = { value: "precision_synthetique" };
  let autorise = true, avertissements = 0;
  const fn = runInNewContext(constante + "\n" + source.slice(debutFix, finFix) + source.slice(debutResultat, finResultat) + "\nfixWithClaude;", {
    api: { post: async (route, payload) => { appels.push({ route, payload }); return { prompt: "fixture", via: "cli" }; } },
    hasCap: () => autorise, toast: () => { avertissements++; },
    icon: () => "", esc: v => String(v ?? ""), escJsArg: v => JSON.stringify(v), mdToHtml: () => "",
    openDrawer: (_titre, html) => chargements.push(html),
    $: selecteur => selecteur === "#fixBody" ? corps : selecteur === "#fixRelaunch" ? relancer
      : selecteur === "#fixDeep" ? approfondir : selecteur === "#fixNote" ? note : null,
  });
  return { fn, appels, chargements, corps, relancer, approfondir,
    interdire: () => { autorise = false; }, avertissements: () => avertissements };
}

test("le vrai panneau annonce la suspension avant/après attente et rend le champ inactif", async () => {
  const p = panneau();
  await p.fn({ event: { message: "fixture" }, note: "precision_synthetique" }, "fixture");
  assert.match(p.chargements[0], /Les précisions libres sont temporairement indisponibles ici/);
  assert.match(p.corps.outerHTML, /<input\b[^>]*id="fixNote"[^>]*\bdisabled\b/);
  assert.match(p.corps.outerHTML, /chat de développement/);
  assert.doesNotMatch(p.corps.outerHTML, /Ajouter une précision/);
  assert.equal(Object.hasOwn(p.appels[0].payload, "note"), false);
});

test("la relance et le mode approfondi restent actifs, sans réenvoyer de note silencieusement", async () => {
  const p = panneau(); await p.fn({ bugId: "fixture" }, "fixture");
  await p.relancer.onclick(); await p.approfondir.onclick();
  assert.equal(p.appels.length, 3); assert.equal(p.appels.every(a => a.route === "/claude/quickfix"), true);
  assert.equal(p.appels.every(a => !Object.hasOwn(a.payload, "note")), true);
  assert.equal(p.appels[2].payload.deep, true);
});

test("la capacité Claude reste requise et les droits serveur ne changent pas", async () => {
  const p = panneau(); p.interdire(); await p.fn({ bugId: "fixture" }, "fixture");
  assert.equal(p.appels.length, 0); assert.equal(p.avertissements(), 1);
  const routes = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(routes, /api\.post\("\/reconcile\/prompt", auth\.requireCap\("db"\)/);
  assert.match(routes, /api\.post\("\/claude\/quickfix", auth\.requireCap\("claude"\)/);
});
