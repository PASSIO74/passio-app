// ══════════════════════════════════════════
// ENVOI PUSH — une adresse écrite par un client n'est pas une destination libre (audit 2026-11-06).
// Le fichier éprouvé est celui que Deno charge. Aucun réseau.
// ══════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { endpointPushSur, envoyerPushBorne, avecDelai, DELAI_PUSH_MS } from "../../supabase/functions/_shared/push-sur.js";

const sub = (endpoint) => ({ endpoint, keys: { p256dh: "x", auth: "y" } });

test("① les services push des navigateurs sont admis", () => {
  for (const e of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QAbc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ]) assert.equal(endpointPushSur(sub(e)), true, e);
});

test("② tout le reste est refusé : autre hôte, sous-domaine piégé, port, identifiants, http, adresse IP, forme", () => {
  for (const e of [
    "https://collecteur.exemple.test/a",
    "https://fcm.googleapis.com.exemple.test/a",
    "https://exemple.test/fcm.googleapis.com/",
    "https://fcm.googleapis.com:8443/a",
    "https://user:mdp@fcm.googleapis.com/a",
    "http://fcm.googleapis.com/a",
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/a",
    "https://notify.windows.com/a",
    "https://a.b.notify.windows.com/a",
    "file:///etc/passwd",
    "",
    "https://fcm.googleapis.com/" + "a".repeat(1100),
  ]) assert.equal(endpointPushSur(sub(e)), false, e);
  for (const v of [null, undefined, {}, { endpoint: 1 }]) assert.equal(endpointPushSur(v), false);
});

test("③ un envoi vers une adresse hors liste ne part pas, et ne se fait pas passer pour un abonnement expiré", async () => {
  let appels = 0;
  await assert.rejects(envoyerPushBorne(async () => { appels++; }, sub("https://collecteur.exemple.test/a"), "{}"),
    (e) => e.statusCode === undefined);
  assert.equal(appels, 0);
});

test("④ l'envoi porte le délai de la bibliothèque, sans perdre les options de l'appelant", async () => {
  let vu = null;
  await envoyerPushBorne(async (_s, _c, o) => { vu = o; }, sub("https://fcm.googleapis.com/a"), "{}", { TTL: 60, urgency: "high" });
  assert.deepEqual(vu, { TTL: 60, urgency: "high", timeout: DELAI_PUSH_MS });
});

test("⑤ un service muet rend la main sous le délai", async () => {
  const debut = Date.now();
  await assert.rejects(envoyerPushBorne(() => new Promise(() => {}), sub("https://fcm.googleapis.com/a"), "{}", {}, 30),
    /muet/);
  assert.ok(Date.now() - debut < 3000);
});

test("⑥ le code d'erreur du service passe tel quel : un 410 reste un abonnement expiré", async () => {
  const e410 = Object.assign(new Error("parti"), { statusCode: 410 });
  await assert.rejects(envoyerPushBorne(async () => { throw e410; }, sub("https://fcm.googleapis.com/a"), "{}"),
    (e) => e.statusCode === 410);
});

test("⑦ avecDelai : la valeur de repli au-delà du délai, la vraie valeur sinon", async () => {
  assert.equal(await avecDelai(new Promise(() => {}), 10, "repli"), "repli");
  assert.equal(await avecDelai(Promise.resolve("ok"), 1000, "repli"), "ok");
});
