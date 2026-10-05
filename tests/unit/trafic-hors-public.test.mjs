// TRAFIC HORS PUBLIC (2026-10-05) — UNE définition, quatre endroits.
//
// Le client (js/telemetry.js) classe l'appareil et pose `meta.trafic` ; trois
// lecteurs l'écartent des chiffres d'audience : le dashboard
// (dashboard/server/trafic.js), le pilotage téléphone
// (supabase/functions/_shared/pilotage.js) et la veille / le digest
// (`filtrePublic()`, scripts/veille-production.mjs). Le dashboard n'importe rien
// hors de son dossier (Render le déploie seul) : la définition est donc COPIÉE,
// et deux copies finissent toujours par diverger sur celle qu'on oublie. Ce banc
// les confronte cas par cas, et fait tourner le VRAI telemetry.js dans une VM
// pour vérifier ce que le client produit.
//
// MUTATIONS qui le font rougir : changer une valeur dans une des trois listes
// (①) ; retirer le rattrapage iOS d'un seul lecteur (②) ; remplacer la liste de
// ROBOT_UA_RE par `bot\b` (③, téléphones CUBOT) ; retirer le test
// `navigator.connection` du client (③) ; inverser robot / équipe (③).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as dashboard from "../../dashboard/server/trafic.js";
import * as nuage from "../../supabase/functions/_shared/pilotage.js";
import { TRAFICS_HORS_PUBLIC as VALEURS_VEILLE, filtrePublic, SQL } from "../../scripts/veille-production.mjs";

test("① les trois lecteurs connaissent exactement les mêmes valeurs", () => {
  const attendu = ["robot", "emulation", "equipe"];
  assert.deepEqual([...dashboard.TRAFICS_HORS_PUBLIC], attendu);
  assert.deepEqual([...nuage.TRAFICS_HORS_PUBLIC], attendu);
  assert.deepEqual([...VALEURS_VEILLE], attendu);
  const sql = filtrePublic();
  for (const v of attendu) assert.ok(sql.includes(`'${v}'`), `filtrePublic() oublie ${v}`);
  assert.match(sql, /coalesce\(platform, ''\) = 'ios' and coalesce\(connection, ''\) <> ''/, "rattrapage iOS + connexion, NULL compris");
  assert.ok(SQL.usage7j.includes(filtrePublic()), "les appareils actifs 7 j du digest sont le public");
  assert.ok(!SQL.fluxHeures.includes("trafic"), "le flux (silence) n'est pas une audience : il garde tout");
});

test("② dashboard et téléphone classent chaque ligne de la même façon", () => {
  const cas = [
    [{ meta: { trafic: "robot" } }, "robot"],
    [{ meta: { trafic: "emulation" } }, "emulation"],
    [{ meta: { trafic: "equipe" } }, "equipe"],
    [{ meta: { trafic: "admin" } }, null],
    [{ meta: { trafic: 3 } }, null],
    [{ trafic: "robot" }, "robot"],                                  // select meta->>trafic
    [{ trafic: null, platform: "ios", connection: "4g" }, "emulation"],
    [{ platform: "ios", connection: "4g", meta: {} }, "emulation"],  // ligne d'avant ce lot
    [{ platform: "ios", connection: "" }, null],                     // vrai iPhone
    [{ platform: "ios", connection: null }, null],
    [{ platform: "android", connection: "4g" }, null],
    [{ meta: { trafic: "robot" }, platform: "ios", connection: "" }, "robot"],
    [{}, null],
    [null, null],
  ];
  for (const [ligne, attendu] of cas) {
    const quoi = JSON.stringify(ligne);
    assert.equal(dashboard.traficHorsPublic(ligne), attendu, "dashboard " + quoi);
    assert.equal(nuage.traficHorsPublic(ligne), attendu, "téléphone " + quoi);
  }
});

// Le VRAI telemetry.js, chargé dans une VM avec la mesure REFUSÉE (« 0 ») : il
// s'arrête juste après avoir exposé `window.tel`, sans hook ni réseau — et le
// classement, lui, a lieu avant, quel que soit le consentement.
const SOURCE = fs.readFileSync("js/telemetry.js", "utf8");
function classerClient({ ua, webdriver = false, connection, userAgentData, search = "", stocke = null }) {
  const memoire = new Map([["passio_telemetry", "0"]]);
  if (stocke) memoire.set("passio_trafic", stocke);
  const stockage = {
    getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
    setItem: (k, v) => memoire.set(k, String(v)),
    removeItem: (k) => memoire.delete(k),
  };
  const remplacements = [];
  const ctx = {
    navigator: { userAgent: ua, webdriver, connection, userAgentData, onLine: true },
    location: { search, hostname: "passio-app.netlify.app", pathname: "/", hash: "", href: "https://passio-app.netlify.app/" + search },
    localStorage: stockage, sessionStorage: stockage,
    history: { state: null, replaceState: (_s, _t, url) => remplacements.push(url) },
    document: { referrer: "", hidden: false, addEventListener() {} },
    screen: { width: 390, height: 844 },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, console,
  };
  ctx.window = ctx;
  vm.runInNewContext(SOURCE, ctx, { filename: "telemetry.js" });
  return { trafic: ctx.tel.trafic, memoire, remplacements };
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 400.0.0.0 (iPhone16,1; iOS 18_6; fr_FR; fr; scale=3.00; 1179x2556)",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone16,1;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBCR/;FBID/phone;FBLC/fr_FR;FBOP/5]",
  android: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  cubot: "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  bureau: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  // Navigateurs INTÉGRÉS d'applications : des humains (mêmes agents que tests/unit/apercu-liens.test.mjs).
  snapchat: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.80.0.33 (like Safari/8618.1.15.10.15, panda)",
  tiktok: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store",
  linkedin: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6",
  telegramAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.1.3",
  // Robot d'INDEXATION (Siri, Spotlight) : pas un robot d'aperçu, mais pas une personne non plus.
  applebot: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
};

test("③ ce que le client produit : vrais téléphones publics, robots, émulations, équipe", () => {
  const c4g = { effectiveType: "4g" };
  // Le public — y compris les navigateurs intégrés d'Instagram et de Facebook.
  assert.equal(classerClient({ ua: UA.iphoneSafari }).trafic, null);
  assert.equal(classerClient({ ua: UA.iphoneChrome }).trafic, null, "Chrome sur iPhone est WebKit : pas de navigator.connection");
  assert.equal(classerClient({ ua: UA.iphoneInstagram }).trafic, null);
  assert.equal(classerClient({ ua: UA.iphoneFacebook }).trafic, null);
  for (const app of ["snapchat", "tiktok", "linkedin"]) assert.equal(classerClient({ ua: UA[app] }).trafic, null, app);
  assert.equal(classerClient({ ua: UA.telegramAndroid, connection: c4g, userAgentData: {} }).trafic, null, "vue web Android : un humain");
  assert.equal(classerClient({ ua: UA.android, connection: c4g, userAgentData: {} }).trafic, null);
  assert.equal(classerClient({ ua: UA.cubot, connection: c4g }).trafic, null, "un téléphone CUBOT n'est pas un robot");
  assert.equal(classerClient({ ua: UA.bureau, connection: c4g, userAgentData: {} }).trafic, null);
  // Émulation : un « iPhone » qui expose une API que seul Chromium a.
  assert.equal(classerClient({ ua: UA.iphoneChrome, connection: c4g }).trafic, "emulation");
  assert.equal(classerClient({ ua: UA.iphoneSafari, userAgentData: { mobile: true } }).trafic, "emulation");
  // Robots.
  assert.equal(classerClient({ ua: UA.bureau, webdriver: true }).trafic, "robot");
  assert.equal(classerClient({ ua: UA.headless }).trafic, "robot");
  assert.equal(classerClient({ ua: UA.googlebot, connection: c4g }).trafic, "robot");
  assert.equal(classerClient({ ua: UA.applebot }).trafic, "robot");
  // Équipe : posé par ?equipe=1, mémorisé, retiré par ?equipe=0 — et l'URL nettoyée.
  const pose = classerClient({ ua: UA.bureau, search: "?equipe=1&plk=lk_1" });
  assert.equal(pose.trafic, "equipe");
  assert.equal(pose.memoire.get("passio_trafic"), "equipe");
  assert.deepEqual(pose.remplacements, ["/?plk=lk_1"], "le marqueur quitte l'URL, le reste demeure");
  assert.equal(classerClient({ ua: UA.bureau, stocke: "equipe" }).trafic, "equipe");
  const retire = classerClient({ ua: UA.bureau, stocke: "equipe", search: "?equipe=0" });
  assert.equal(retire.trafic, null);
  assert.equal(retire.memoire.has("passio_trafic"), false);
  // Un fait mesuré passe avant une déclaration.
  assert.equal(classerClient({ ua: UA.bureau, webdriver: true, stocke: "equipe" }).trafic, "robot");
  // Chaque valeur produite est connue des trois lecteurs.
  for (const v of ["robot", "emulation", "equipe"]) assert.ok(dashboard.TRAFICS_HORS_PUBLIC.includes(v));
});

test("④ ROBOT_UA_RE reste lisible par un vieux Safari : ni lookbehind, ni groupe nommé, ni drapeau s/u", () => {
  const m = SOURCE.match(/var ROBOT_UA_RE = (\/.+\/([a-z]*));/);
  assert.ok(m, "ROBOT_UA_RE introuvable");
  assert.ok(!m[1].includes("(?<"), "lookbehind ou groupe nommé : Safari < 16.4 refuserait tout le fichier");
  assert.ok(!/[su]/.test(m[2]), "drapeau s ou u");
  assert.ok(!/\bbot\\b/.test(m[1]), "`bot\\b` attraperait les téléphones CUBOT");
});
