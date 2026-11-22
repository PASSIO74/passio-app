// ═══════════════════════════════════════════════════════════════════════════
// LOT-22 (audit UX/UI du 2026-11-10) — CE QUE L'AUDIT CROYAIT SERVEUR, SANS MIGRATION
//   ① MSG-C06 : la recherche de personnes envoie un motif `imatch` qui accepte
//      les accents (« lea » → Léa) ; la saisie ne peut y glisser aucun
//      métacaractère. (Mesuré en production, en lecture anonyme : `ilike`
//      « lea » rend [], le motif rend « Léa ».)
//   ② IRL-C51 : publier une activité crée sa discussion tout de suite, par le
//      chemin existant (`_joinEventConversation`), réservé à l'organisation.
// Aucune écriture réseau : le client Supabase est remplacé par un relevé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① MSG-C06 : motif sans accents, sûr, et réellement envoyé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const motifs = {
      lea: _motifSansAccents("lea"),
      Lea: _motifSansAccents("Léa"),
      tiret: _motifSansAccents("jean-paul"),
      hostile: _motifSansAccents("a.b,c(d)*e\\f[g]^$|?+{}"),
      vide: _motifSansAccents("(),*"),
    };
    // Ce que la requête envoie vraiment.
    let envoye = null;
    const fauxSupa = { from() { const q = { select() { return q; }, or(f) { envoye = f; return q; }, limit() { return Promise.resolve({ data: [], error: null }); } }; return q; } };
    const ancien = window.supa;
    try { supa = fauxSupa; } catch (e) {}
    window.supa = fauxSupa;
    await supaSearchUsers("lea");
    try { supa = ancien; } catch (e) {}
    return { motifs, envoye };
  });
  expect(r.motifs.lea).toBe("l[eéèêë][aàâäáãå]");
  expect(r.motifs.Lea).toBe(r.motifs.lea);
  expect(r.motifs.tiret).toBe("j[eéèêë][aàâäáãå][nñ][-]p[aàâäáãå][uùûüú]l");
  expect(r.motifs.hostile).toBe("[aàâäáãå]b[cç]d[eéèêë]fg");
  expect(r.motifs.vide).toBe("");
  expect(r.envoye).toBe("username.imatch.l[eéèêë][aàâäáãå],bio.imatch.l[eéèêë][aàâäáãå]");
});

test("② IRL-C51 : publier une activité ouvre sa discussion, tout de suite", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLoadEvents", "supaLoadMyRsvps", "supaLoadEventCommentCounts",
      "supaJoinEventConversation"].forEach((fn) => { window[fn] = async () => true; });
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    window._supaReal = true;
    window.supaPublishEvent = async () => true;
    const creees = [];
    window.supaCreateEventConversation = async (ev) => { creees.push(ev.id); return "evgrp_" + ev.id; };
    state.userEvents = [];
    goTo("irl");
    openCreateEvent();
    document.getElementById("evTitle").value = "Atelier L22";
    document.getElementById("evCity").value = "Paris";
    await submitEvent();
    await new Promise((res) => setTimeout(res, 300));
    window._supaReal = false;
    const ev = (state.userEvents || []).find((e) => e.title === "Atelier L22");
    return { creees: creees.length, convId: ev && ev.convId };
  });
  expect(r.creees, "la discussion est créée à la publication").toBe(1);
  expect(r.convId).toMatch(/^evgrp_/);
});