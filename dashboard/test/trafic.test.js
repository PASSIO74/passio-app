// TRAFIC HORS PUBLIC (2026-10-05) — robots, émulations, équipe.
//
// Mesuré la semaine du 28/09 : 15 des 19 « visiteurs » sans compte étaient nos
// propres vérifications d'après déploiement. Ce banc prouve que le pilotage les
// écarte des chiffres d'AUDIENCE (visiteurs, entonnoir des liens, en ligne)…
// sans les cacher (ils restent listés, marqués) et sans rien perdre de ce qui
// est un défaut de la production (une erreur vue par un robot reste un bug).
//
// MUTATIONS qui le font rougir : `d.trafic = …` retiré de _touchDevice (②④⑤) ;
// la branche « hors public » retirée de _touchLink (③) ; le filtre `!d.trafic`
// retiré d'overview (⑤) ; l'heuristique iOS + connexion retirée de trafic.js (①②③).
// Tous vérifiés le 2026-10-05 : chaque mutation rougit exactement ces tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";
import { traficHorsPublic, ventilerTrafic, TRAFICS_HORS_PUBLIC } from "../server/trafic.js";

let n = 0;
function ev(over = {}) {
  n++;
  return normalize({
    event_id: "trf-e" + n, received_at: new Date().toISOString(),
    type: "nav", action: "screen_view", screen: "feed", user_id: null, user_label: null,
    session_id: "trf-s" + n, device_id: "trf-d" + n, platform: "android", browser: "chrome",
    app_version: "1.0", env: "production", status: "ok", severity: "info",
    ...over,
  });
}

test("① classement : la valeur du client, puis le rattrapage iOS + connexion, sinon public", () => {
  assert.deepEqual([...TRAFICS_HORS_PUBLIC], ["robot", "emulation", "equipe"]);
  assert.equal(traficHorsPublic({ meta: { trafic: "robot" } }), "robot");
  assert.equal(traficHorsPublic({ meta: { trafic: "equipe" }, platform: "android" }), "equipe");
  assert.equal(traficHorsPublic({ trafic: "emulation" }), "emulation", "ligne aplatie (select meta->>trafic)");
  assert.equal(traficHorsPublic({ meta: { trafic: "admin" } }), null, "valeur inconnue = public");
  assert.equal(traficHorsPublic({ meta: { trafic: 1 } }), null);
  // Le rattrapage : un « iPhone » qui déclare une connexion n'en est pas un.
  assert.equal(traficHorsPublic({ platform: "ios", connection: "4g", meta: {} }), "emulation");
  assert.equal(traficHorsPublic({ platform: "ios", connection: "", meta: {} }), null, "vrai iPhone : connexion vide");
  assert.equal(traficHorsPublic({ platform: "ios", connection: null }), null);
  assert.equal(traficHorsPublic({ platform: "android", connection: "4g" }), null, "Android expose la connexion pour de vrai");
  assert.equal(traficHorsPublic(null), null);
  assert.deepEqual(ventilerTrafic(["robot", null, "equipe", "robot", "inconnu", "total"]), { total: 3, robot: 2, emulation: 0, equipe: 1 });
});

test("② visiteurs : robots, émulations et équipe sortent des chiffres, restent dans la liste", () => {
  const avant = store.visitorFunnel();
  store.add(ev({ device_id: "trf-robot", meta: { trafic: "robot" } }));
  store.add(ev({ device_id: "trf-emul", platform: "ios", connection: "4g" }));   // client d'avant ce lot
  store.add(ev({ device_id: "trf-equipe", meta: { trafic: "equipe" }, user_id: "u-trf-ben" }));
  store.add(ev({ device_id: "trf-public", platform: "ios", connection: "" }));
  const f = store.visitorFunnel();
  assert.equal(f.total, avant.total + 1, "seul le visiteur public compte");
  assert.equal(f.signedUp, avant.signedUp, "le compte de l'équipe n'est pas une conversion");
  assert.equal(f.horsPublic.total, avant.horsPublic.total + 3);
  assert.equal(f.horsPublic.robot, avant.horsPublic.robot + 1);
  assert.equal(f.horsPublic.emulation, avant.horsPublic.emulation + 1);
  assert.equal(f.horsPublic.equipe, avant.horsPublic.equipe + 1);
  const liste = store.visitorList();
  assert.equal(liste.find((v) => v.deviceId === "trf-robot").trafic, "robot", "montré, marqué");
  assert.equal(liste.find((v) => v.deviceId === "trf-emul").trafic, "emulation");
  assert.equal(liste.find((v) => v.deviceId === "trf-public").trafic, null);
});

test("③ liens : une ouverture ou une inscription hors public n'avance pas l'entonnoir", () => {
  const avant = store.linkFunnel();
  const lien = (action, device, over = {}) => ev({ type: "link", action, correlation_id: "lk_TRF", device_id: device, meta: { link_id: "lk_TRF", ...(over.meta || {}) }, ...over });
  store.add(lien("link_create", "trf-createur", { user_id: "u-trf-createur" }));
  store.add(lien("link_share", "trf-createur", { meta: { link_channel: "native" } }));
  store.add(lien("link_open", "trf-robot2", { meta: { trafic: "robot" } }));
  store.add(lien("link_open", "trf-emul2", { platform: "ios", connection: "4g" }));
  store.add(lien("link_signup", "trf-equipe2", { meta: { trafic: "equipe", voie: "email" } }));
  let l = store.link("lk_TRF");
  assert.equal(l.status, "shared", "personne du public ne l'a ouvert");
  assert.equal(l.openCount, 0);
  assert.equal(l.signupCount, 0);
  assert.equal(l.opensHorsPublic, 2);
  assert.equal(l.signupsHorsPublic, 1);
  const f = store.linkFunnel();
  assert.equal(f.totalOpens, avant.totalOpens, "aucune ouverture publique de plus");
  assert.equal(f.opensHorsPublic, avant.opensHorsPublic + 2);
  assert.equal(f.signupsHorsPublic, avant.signupsHorsPublic + 1);
  assert.equal(f.totalSignups, avant.totalSignups);
  // Une vraie personne l'ouvre : là, il avance.
  store.add(lien("link_open", "trf-lea"));
  l = store.link("lk_TRF");
  assert.equal(l.status, "opened");
  assert.equal(l.openCount, 1);
  assert.equal(store.visitorFunnel().viaLink >= 1, true);
});

test("④ ?equipe=0 rend le téléphone au public : le dernier événement décide", () => {
  store.add(ev({ device_id: "trf-tel", meta: { trafic: "equipe" } }));
  assert.equal(store.visitorList().find((v) => v.deviceId === "trf-tel").trafic, "equipe");
  const avant = store.visitorFunnel().total;
  store.add(ev({ device_id: "trf-tel", meta: { mode: "web" } }));
  assert.equal(store.visitorList().find((v) => v.deviceId === "trf-tel").trafic, null);
  assert.equal(store.visitorFunnel().total, avant + 1);
});

test("⑤ en ligne : un robot connecté n'est pas quelqu'un en ligne", () => {
  const avant = store.overview().totals.onlineDevices;
  store.add(ev({ device_id: "trf-robot-ligne", meta: { trafic: "robot" } }));
  assert.equal(store.overview().totals.onlineDevices, avant);
  store.add(ev({ device_id: "trf-humain-ligne" }));
  assert.equal(store.overview().totals.onlineDevices, avant + 1);
});

test("⑥ on ne jette rien : une erreur vue par un robot reste un problème de la production", () => {
  const avant = store.bugList().length;
  store.add(ev({ device_id: "trf-robot-err", type: "error", action: "js_error", severity: "error", status: "error",
    message: "TypeError: banc trafic — x is undefined", stack: "at f (https://passio-app.netlify.app/app.js:1:42)", meta: { trafic: "robot" } }));
  assert.equal(store.bugList().length, avant + 1, "le défaut est compté, robot ou pas");
});

test("⑦ un vrai iPhone (connexion vide) reste un visiteur", () => {
  const avant = store.visitorFunnel().total;
  store.add(ev({ device_id: "trf-iphone", platform: "ios", browser: "safari", connection: "" }));
  assert.equal(store.visitorFunnel().total, avant + 1);
  assert.equal(store.visitorList().find((v) => v.deviceId === "trf-iphone").trafic, null);
});
