// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS CRITIQUES — CHAQUE FLUX SE FERME AU VERDICT DE LA BASE (2026-11-06)
//
// Le pilotage du nuage juge désormais les parcours (contrats-actions.js,
// parcours.js). Il ne peut juger que ce que l'app lui dit, et trois parcours
// lui mentaient par omission :
//   · `cint` (réaction à un commentaire) et `comment_post` ouvraient un flux
//     puis JETAIENT son identifiant : aucun verdict ne le fermait jamais —
//     mesuré en production le 2026-11-03, une réaction enregistrée en base, son
//     flux réduit à son début ;
//   · l'envoi d'un message TEXTE n'avait aucun flux (seul le média en avait) ;
//   · un signalement n'en avait aucun.
// Et un défaut de fond, le cas 07 de la consigne : un envoi écrit en base dont
// la RÉPONSE se perd reçoit, au renvoi du même identifiant, un 23505 — le
// message (ou le commentaire) restait « non envoyé » et repartait en file pour
// toujours. Il n'est dit envoyé que sur PREUVE : conflit sur la clé primaire,
// ligne relue avec le bon auteur.
//
// Le backend est remplacé par un faux client (rien ne part en production) ;
// `?telemetry=1` est OBLIGATOIRE : sans lui `flowStart` rend null.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function preparer(page) {
  await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await page.evaluate(() => {
    window.__flow = [];
    const vraiStart = window.tel.flowStart;
    window.tel.flowStart = function (action, meta) {
      const cid = vraiStart.call(window.tel, action, meta);
      window.__flow.push({ etape: "start", cid, action, meta: meta || {} });
      return cid;
    };
    // `settle` appelle `this.step` puis `this.flowEnd` : les remplacer l'intercepte aussi.
    window.tel.step = function (cid, key, status, meta) { window.__flow.push({ etape: "step", cid, key, status, meta: meta || null }); };
    window.tel.flowEnd = function (cid, status) { window.__flow.push({ etape: "end", cid, status }); };
    window._supaReal = true;
    window.__envois = []; window.__lectures = []; window.__reponses = {}; window.__notifs = [];
    // bootOnboarded neutralise l'écriture des commentaires et garde la vraie
    // fonction de côté : ce banc exerce le VRAI chemin, contre le faux client.
    window.supaAddComment = window.__vraiSupa.addComment;
    window.supaEnsureProfileExists = async () => true;
    window._notifierMessage = (convId, msgId) => { window.__notifs.push(msgId); };
    window._mentionnerApresEnvoi = () => {};
    window._notifyCommentMentions = () => {};
    // ⚠️ On MUTE `window.supa` (même objet que le `supa` lexical d'app-08), on
    // ne le remplace pas — voir message-refus-definitif.spec.js.
    Object.defineProperty(window.supa, "from", {
      configurable: true, writable: true,
      value: function (table) {
        const r = window.__reponses[table] || {};
        return {
          insert: function (row) { window.__envois.push({ table, row }); return Promise.resolve(r.insert || { error: null }); },
          select: function (cols) {
            const q = {
              eq: function (c, v) { window.__lectures.push({ table, cols, c, v }); return q; },
              maybeSingle: function () { return Promise.resolve(typeof r.select === "function" ? r.select() : (r.select || { data: null, error: null })); },
            };
            return q;
          },
        };
      },
    });
    window.__poserConv = function (convId, msgId) {
      const convs = getConversations();
      convs.push({ id: convId, userName: "Léane", messages: [{ id: msgId, text: "coucou", mine: true, status: "sending" }] });
      saveConversations();
    };
    window.__statut = function (convId, msgId) {
      const c = getConversations().find((x) => x.id === convId);
      const m = c && (c.messages || []).find((x) => x.id === msgId);
      return m ? m.status : null;
    };
  });
}

const flux = (page) => page.evaluate(() => window.__flow);
const attendre = (page, ms = 80) => page.evaluate((d) => new Promise((r) => setTimeout(r, d)), ms);

// start → … → step saved → end, TOUS sur le même identifiant.
function chaine(evs, action, verdict) {
  expect(evs[0]).toMatchObject({ etape: "start", action });
  expect(evs[0].cid).toMatch(/^fl_/);
  for (const e of evs) expect(e.cid).toBe(evs[0].cid);
  const saved = evs.find((e) => e.etape === "step" && e.key === "saved");
  expect(saved, "étape de confirmation").toBeTruthy();
  expect(saved.status).toBe(verdict);
  expect(evs[evs.length - 1]).toMatchObject({ etape: "end", status: verdict });
  return saved;
}

test.describe("Parcours critiques : les flux se ferment au verdict", () => {
  test("① une réaction à un commentaire ferme son flux — succès puis refus", async ({ page }) => {
    await preparer(page);
    const ok = await page.evaluate(() => supaEcrireInteraction("c_1", "p_1", "like", null));
    expect(ok.ok).toBe(true);
    chaine(await flux(page), "cint", "ok");
    await page.evaluate(() => { window.__flow = []; window.__reponses.comment_interactions = { insert: { error: { code: "42501", message: "new row violates row-level security policy" } } }; });
    const ko = await page.evaluate(() => supaEcrireInteraction("c_1", "p_1", "like", null));
    expect(ko.ok).toBe(false);
    const saved = chaine(await flux(page), "cint", "error");
    expect(saved.meta.rc).toBe("42501");
  });

  test("② un commentaire ferme son flux à l'écriture réelle", async ({ page }) => {
    await preparer(page);
    expect(await page.evaluate(() => supaAddComment("p_1", "bravo", "c_a1"))).toBe(true);
    chaine(await flux(page), "comment_post", "ok");
  });

  test("③ commentaire dont la réponse s'est perdue : prouvé en base, il est confirmé, pas rejoué", async ({ page }) => {
    await preparer(page);
    const res = await page.evaluate(async () => {
      window.__reponses.post_comments = {
        insert: { error: { code: "23505", message: 'duplicate key value violates unique constraint "post_comments_pkey"' } },
        select: { data: { author_id: MY_UID }, error: null },
      };
      return { ok: await supaAddComment("p_1", "bravo", "c_a2"), lectures: window.__lectures };
    });
    expect(res.ok).toBe(true);
    expect(res.lectures).toEqual([expect.objectContaining({ table: "post_comments", c: "id", v: "c_a2" })]);
    const evs = await flux(page);
    chaine(evs, "comment_post", "ok");
    expect(evs.some((e) => e.key === "deja_en_base")).toBe(true);
  });

  test("④ un 23505 sur une AUTRE contrainte, ou d'un autre auteur, reste un échec", async ({ page }) => {
    await preparer(page);
    const autreContrainte = await page.evaluate(async () => {
      window.__reponses.post_comments = { insert: { error: { code: "23505", message: 'duplicate key value violates unique constraint "post_comments_unique_author_post"' } }, select: { data: { author_id: MY_UID } } };
      return supaAddComment("p_1", "bravo", "c_a3");
    });
    expect(autreContrainte).toBe(false);
    chaine(await flux(page), "comment_post", "error");
    await page.evaluate(() => { window.__flow = []; });
    const autreAuteur = await page.evaluate(async () => {
      window.__reponses.post_comments = { insert: { error: { code: "23505", message: 'duplicate key value violates unique constraint "post_comments_pkey"' } }, select: { data: { author_id: "quelqu_un_d_autre" } } };
      return supaAddComment("p_1", "bravo", "c_a4");
    });
    expect(autreAuteur).toBe(false);
    chaine(await flux(page), "comment_post", "error");
  });

  test("⑤ un message texte ouvre et ferme son flux ; le message passe « envoyé »", async ({ page }) => {
    await preparer(page);
    const st = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p1", "msg_p1");
      _sendTextToSupa("conv_p1", "msg_p1", "coucou");
      await new Promise((r) => setTimeout(r, 80));
      return { statut: window.__statut("conv_p1", "msg_p1"), notifs: window.__notifs };
    });
    expect(st.statut).toBe("sent");
    expect(st.notifs).toEqual(["msg_p1"]);
    const evs = await flux(page);
    chaine(evs, "send_message", "ok");
    expect(evs[0].meta).toMatchObject({ kind: "text" });
  });

  test("⑥ message dont la réponse s'est perdue : prouvé en base, « envoyé », sorti de la file", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p2", "msg_p2");
      window.__reponses.conv_messages = {
        insert: { status: 409, error: { code: "23505", message: 'duplicate key value violates unique constraint "conv_messages_pkey"' } },
        select: { data: { from_id: MY_UID }, error: null },
      };
      _sendTextToSupa("conv_p2", "msg_p2", "coucou");
      await new Promise((res) => setTimeout(res, 120));
      return { statut: window.__statut("conv_p2", "msg_p2"), file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]"), notifs: window.__notifs };
    });
    // RÉINJECTION : sur le code d'avant, « failed » et une entrée en file.
    expect(r.statut).toBe("sent");
    expect(r.file).toHaveLength(0);
    expect(r.notifs).toEqual(["msg_p2"]);
    const evs = await flux(page);
    chaine(evs, "send_message", "ok");
    expect(evs.some((e) => e.key === "deja_en_base")).toBe(true);
  });

  test("⑦ 23505 sur un message d'un AUTRE auteur : pas de faux succès", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p3", "msg_p3");
      window.__reponses.conv_messages = {
        insert: { status: 409, error: { code: "23505", message: 'duplicate key value violates unique constraint "conv_messages_pkey"' } },
        select: { data: { from_id: "un_autre_compte" }, error: null },
      };
      _sendTextToSupa("conv_p3", "msg_p3", "coucou");
      await new Promise((res) => setTimeout(res, 120));
      return { statut: window.__statut("conv_p3", "msg_p3"), notifs: window.__notifs };
    });
    expect(r.statut).toBe("failed");
    expect(r.notifs).toEqual([]);
    const saved = chaine(await flux(page), "send_message", "error");
    expect(saved.meta.rc).toBe("23505");
  });

  test("⑧ hors ligne : une ATTENTE annoncée, jamais un échec", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p4", "msg_p4");
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      _sendTextToSupa("conv_p4", "msg_p4", "coucou");
      await new Promise((res) => setTimeout(res, 40));
      return { envois: window.__envois.length, file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]") };
    });
    expect(r.envois).toBe(0);
    expect(r.file).toHaveLength(1);
    const evs = await flux(page);
    expect(evs.map((e) => e.etape)).toEqual(["start", "step", "end"]);
    expect(evs[1]).toMatchObject({ key: "queued", meta: { rc: "hors_ligne" } });
    expect(evs[2]).toMatchObject({ etape: "end", status: "pending" });
  });

  test("⑨ un signalement ferme son flux, sans jamais porter le motif", async ({ page }) => {
    await preparer(page);
    expect(await page.evaluate(() => supaReport("post", "p_9", "motif privé de la personne"))).toBe(true);
    const evs = await flux(page);
    chaine(evs, "report_content", "ok");
    expect(evs[0].meta).toEqual({ cible: "post" });
    expect(JSON.stringify(evs)).not.toContain("motif privé");
    await page.evaluate(() => { window.__flow = []; window.__reponses.reports = { insert: { error: { code: "42501", message: "new row violates row-level security policy" } } }; });
    expect(await page.evaluate(() => supaReport("post", "p_9", "x"))).toBe(false);
    chaine(await flux(page), "report_content", "error");
  });
});

// ─── Audit du 2026-11-06 : codes fermés et garde « en vol » pendant la preuve ───
test.describe("Parcours critiques : codes fermés et preuve en vol", () => {
  test("⑩ un signalement en double est un refus de RÈGLE (« doublon »), jamais une panne", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window.__reponses.reports = { insert: { error: { code: "23505", message: 'duplicate key value violates unique constraint "reports_passion_unique_par_personne"' } } }; });
    expect(await page.evaluate(() => supaReport("passion", "cuisine", ""))).toBe(false);
    const saved = chaine(await flux(page), "report_content", "error");
    expect(saved.meta.rc).toBe("doublon");
  });

  test("⑪ coupure réseau : « reseau » pour une réaction ; ATTENTE pour un commentaire, que la file rejouera", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window.__reponses.comment_interactions = { insert: { error: { message: "TypeError: Failed to fetch" } } }; });
    await page.evaluate(() => supaEcrireInteraction("c_1", "p_1", "like", null));
    const saved = chaine(await flux(page), "cint", "error");
    expect(saved.meta.rc).toBe("reseau");
    await page.evaluate(() => { window.__flow = []; window.__reponses.post_comments = { insert: { error: { message: "TypeError: Failed to fetch" } } }; });
    expect(await page.evaluate(() => supaAddComment("p_1", "bravo", "c_r1"))).toBe(false);
    const evs = await flux(page);
    expect(evs.map((e) => e.etape)).toEqual(["start", "step", "end"]);
    expect(evs[1]).toMatchObject({ key: "queued", meta: { rc: "hors_ligne" } });
    expect(evs[2]).toMatchObject({ status: "pending" });
  });

  test("⑫ ROB-06 : pendant la relecture de la preuve, le message reste EN VOL — un second envoi ne part pas", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_v1", "msg_v1");
      let relache;
      const relecture = new Promise((res) => { relache = res; });
      window.__reponses.conv_messages = {
        insert: { status: 409, error: { code: "23505", message: 'duplicate key value violates unique constraint "conv_messages_pkey"' } },
        select: () => relecture.then(() => ({ data: { from_id: MY_UID }, error: null })),
      };
      _sendTextToSupa("conv_v1", "msg_v1", "coucou");
      await new Promise((res) => setTimeout(res, 40));
      const enVolPendant = _msgEstEnVol("msg_v1");
      _sendTextToSupa("conv_v1", "msg_v1", "coucou");   // un vidage concurrent (online, démarrage)
      const envoisPendant = window.__envois.length;
      relache();
      await new Promise((res) => setTimeout(res, 60));
      return { enVolPendant, envoisPendant, enVolApres: _msgEstEnVol("msg_v1"), statut: window.__statut("conv_v1", "msg_v1"), notifs: window.__notifs.length };
    });
    // RÉINJECTION : sans la garde pendant la preuve, 2 envois et 2 notifications.
    expect(r.enVolPendant).toBe(true);
    expect(r.envoisPendant).toBe(1);
    expect(r.enVolApres).toBe(false);
    expect(r.statut).toBe("sent");
    expect(r.notifs).toBe(1);
  });
});
