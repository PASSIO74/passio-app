// ═══════════════════════════════════════════════════════════════════════════
// LOT-19 (audit UX/UI du 2026-11-10) — RENCONTRER (IRL)
//   ① IRL-C58 : adresse réservée → une seule ligne « Lieu », sans lien de carte.
//   ② IRL-C12 / C19 : une recherche vide ne parle pas de filtres ; le refus de
//      position nomme « Où ? ».
//   ③ IRL-C06 / C56 / C08 : la carte dit le prix, pas de « places restantes »
//      sur une activité finie ; l'emoji de la passion à la place de 📍.
//   ④ IRL-C53 / C55 / C66 / C57 : pied de l'organisation, de la liste
//      d'attente, d'un exemple ; bandeau d'annulation qui dit la suite.
//   ⑤ IRL-C63 / C54 : message groupé et note attendent leur verdict ; un refus
//      « complète » repeint le plein.
//   ⑥ IRL-C09 / C10 / C11 / C16 : cibles de 44 px, sortie nommée, rouge AA.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__t = [];
    const t0 = window.toast;
    window.toast = function (m, ty) { window.__t.push(String(m)); try { return t0.apply(this, arguments); } catch (e) { return null; } };
  });
}

function activite(extra) {
  return Object.assign({
    id: "ev_l19_" + Math.random().toString(36).slice(2), title: "Atelier L19", passion: "musique", emoji: "🎸",
    city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 864e5, time: "18:00",
    desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "org_autre", authorId: "org_autre", status: "active",
  }, extra || {});
}

test("① IRL-C58 : adresse réservée → une ligne « Lieu », sans lien de carte", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async (ev) => {
    state.userEvents = (state.userEvents || []).concat([ev]);
    openEventDetails(ev.id);
    await new Promise((res) => setTimeout(res, 150));
    const c = document.getElementById("eventDetailContent");
    const labels = Array.from(c.querySelectorAll(".event-detail-info-label")).map((x) => x.textContent.trim());
    return { texte: c.innerText, labels, lienCarte: !!c.querySelector('a[href*="maps.google.com"]') };
  }, activite({ fromSupabase: true, address: "", postalCode: "69001", venue: "Café L19" }));
  expect(r.labels).not.toContain("Adresse");
  expect(r.labels).not.toContain("Adresse exacte");
  expect(r.labels.filter((l) => l === "Lieu").length).toBe(1);
  expect(r.texte).toContain("Café L19 · 69001 Lyon");
  expect(r.texte).toContain("L'adresse exacte s'affiche ici dès que tu participes.");
  expect(r.lienCarte, "aucun lien de carte vers la ville entière").toBe(false);
});

test("② IRL-C12 / C19 : une recherche vide ne parle pas de filtres ; le refus de position nomme « Où ? »", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    clearAllIrlFilters();
    irlSearchQuery = "kitesurf";
    const html = _irlEmptyStateHtml();
    irlSearchQuery = "";
    return html;
  });
  expect(r).toContain("Aucune activité pour « kitesurf »");
  expect(r).toContain("Effacer la recherche");
  expect(r).not.toContain("Rien avec ces filtres");
  const src = await page.evaluate(() => requestUserLocation.toString() + (typeof _irlGeoRefus === "function" ? _irlGeoRefus.toString() : ""));
  expect(src).not.toContain("Filtre → Autour de moi");
});

test("③ IRL-C06 / C56 / C08 : prix sur la carte, rien de « restant » sur une activité finie, emoji de passion", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async ([payante, finie]) => {
    finie.date = Date.now() - 3 * 864e5;
    state.seed.events = [payante, finie];
    state.userEvents = [];
    irlShowPast = false;
    goTo("irl");
    renderIRL();
    await new Promise((res) => setTimeout(res, 300));
    const carte = document.querySelector('[data-event-id="' + payante.id + '"], .event-card[data-id="' + payante.id + '"]')
      || Array.from(document.querySelectorAll(".event-card")).find((n) => n.textContent.includes("Payante L19"));
    irlShowPast = true;
    renderIRL();
    await new Promise((res) => setTimeout(res, 300));
    const carteFinie = Array.from(document.querySelectorAll(".event-card")).find((n) => n.textContent.includes("Finie L19"));
    irlShowPast = false;
    // C08 : la lecture serveur pose l'emoji de la passion quand l'activité n'en a pas.
    const src = supaLoadEvents.toString();
    return {
      payante: carte ? carte.innerText : "(absente)",
      finie: carteFinie ? carteFinie.innerText : "(absente)",
      emojiPassion: /passionById\(r\.passion_id\)/.test(src),
    };
  }, [activite({ title: "Payante L19", price: 15, maxAttendees: 8 }), activite({ title: "Finie L19", maxAttendees: 10 })]);
  expect(r.payante).toMatch(/15\s€/);
  expect(r.finie).not.toMatch(/places? restantes?/);
  expect(r.emojiPassion, "l'emoji de la passion remplace 📍").toBe(true);
});

test("④ IRL-C53 / C55 / C66 / C57 : le pied dit qui je suis pour cette activité", async ({ page }) => {
  await boot(page);
  const cta = page.locator("#eventDetailCta");
  // Organisation
  await page.evaluate((ev) => {
    ev.organizerId = ev.authorId = (typeof MY_UID !== "undefined" && MY_UID) || "me";
    ev.attendees = ["u_a", "u_b"];
    state.userEvents = [ev];
    openEventDetails(ev.id);
  }, activite({ title: "Mon atelier" }));
  await expect(cta).toContainText("Tu organises · 2 participants");
  await expect(cta.getByRole("button", { name: "Gérer l'activité" })).toBeVisible();
  await expect(cta).not.toContainText("Je participe");
  await expect(cta).not.toContainText("Je ne peux plus venir");
  // Liste d'attente
  await page.evaluate((ev) => {
    state.userEvents = [ev];
    state.user.eventRsvp = state.user.eventRsvp || {};
    state.user.eventRsvp[ev.id] = "waitlist";
    ev.waitlist = [(typeof MY_UID !== "undefined" && MY_UID) || "me"];
    closeEventDetail();
    openEventDetails(ev.id);
  }, activite({ id: "ev_l19_attente", title: "Complet", maxAttendees: 1, attendees: ["u_x"] }));
  await expect(cta).toContainText("Tu es sur la liste d'attente");
  await expect(cta).toContainText("tu es inscrit·e automatiquement");
  await expect(cta.getByRole("button", { name: "Quitter la liste d'attente" })).toBeVisible();
  // Annulée, j'étais inscrit·e
  const bandeau = await page.evaluate((ev) => {
    state.userEvents = [ev];
    state.user.eventRsvp[ev.id] = "going";
    closeEventDetail();
    openEventDetails(ev.id);
    const b = document.querySelector("#eventDetailContent .event-detail-urgency.cancelled");
    return b ? { texte: b.textContent, couleur: getComputedStyle(b).color } : null;
  }, activite({ id: "ev_l19_annulee", title: "Annulée", status: "cancelled", attendees: ["me"] }));
  expect(bandeau && bandeau.texte).toContain("Ta participation est annulée, rien d'autre à faire.");
  expect(bandeau.couleur).toBe("rgb(180, 35, 24)");
});

test("⑤ IRL-C63 / C54 : verdicts lus — message groupé compté, note refusée dite, « complète » repeint le plein", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async (ev) => {
    const moi = (typeof MY_UID !== "undefined" && MY_UID) || "me";
    ev.organizerId = ev.authorId = moi;
    ev.attendees = [moi, "u_a", "u_b"];
    state.userEvents = [ev];
    // Message groupé : 1 écriture sur 2 réussit.
    window._supaReal = true;
    let n = 0;
    window.supaInsertNotif = async () => (n++ === 0);
    openModal('<textarea id="evBroadcast">On se retrouve à l\'entrée nord</textarea>');
    await _sendEventBroadcast(ev.id);
    const message = window.__t.slice(-1)[0];
    // Note : refusée par la base.
    window.supaRateEvent = async () => false;
    window._ratingDraft = 4;
    await submitEventFeedback(ev.id);
    const note = window.__t.slice(-1)[0];
    const noteGardee = !!((state.user.eventRatings || {})[ev.id]);
    window._supaReal = false;
    return { message, note, noteGardee };
  }, activite({ title: "Orga L19" }));
  expect(r.message).toContain("1 personne sur 2");
  expect(r.note).toContain("Retour non enregistré");
  expect(r.noteGardee, "une note refusée n'est pas gardée comme prise").toBe(false);

  const complet = await page.evaluate(async (ev) => {
    state.userEvents = [ev];
    state.user.eventRsvp = {};
    window._supaReal = true;
    window.supaSetEventRsvp = async () => { window._irlRefusMotif = "complete"; return false; };
    window.supaLireParticipants = async () => ({ comptesLus: false, countsByEvent: {} });
    const avant = _eventIsFull(ev);
    try { await setEventRsvp(ev.id, "going"); } catch (e) {}
    window._supaReal = false;
    return { avant, apres: _eventIsFull(_findCanonicalEvent(ev.id)), toast: window.__t.slice(-1)[0] };
  }, activite({ id: "ev_l19_complet", title: "Presque plein", maxAttendees: 5, attendees: ["a", "b", "c", "d"] }));
  expect(complet.avant).toBe(false);
  expect(complet.apres, "la base a dit « complète » : l'écran le dit aussi").toBe(true);
  expect(complet.toast).toContain("La dernière place vient d'être prise");
});

test("⑥ IRL-C09 / C10 / C16 : commandes de 44 px, sortie de la carte nommée", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    goTo("irl");
    const exp = document.getElementById("irlMapExpandBtn");
    const col = document.getElementById("irlMapCollapseBtn");
    const cal = document.createElement("button");
    cal.className = "irl-cal-nav";
    const hote = document.createElement("div");
    hote.style.cssText = "position:absolute;left:0;top:0;display:block;width:200px;";
    hote.appendChild(cal);
    document.body.appendChild(hote);
    const tailles = [exp, col, cal].map((b) => { const cs = getComputedStyle(b); return [parseFloat(cs.width), parseFloat(cs.height)]; });
    const wrap = document.getElementById("irlMapWrap");
    wrap.classList.add("fullscreen");
    majBoutonPleinEcranCarte();
    const plein = { nom: exp.getAttribute("aria-label"), texte: getComputedStyle(exp.querySelector(".irl-map-expand-txt")).display };
    wrap.classList.remove("fullscreen");
    majBoutonPleinEcranCarte();
    return { tailles, plein, apres: exp.getAttribute("aria-label") };
  });
  r.tailles.forEach(([w, h], i) => {
    expect(w, "commande " + ["plein écran", "replier", "mois"][i] + " : largeur").toBeGreaterThanOrEqual(44);
    expect(h, "commande " + ["plein écran", "replier", "mois"][i] + " : hauteur").toBeGreaterThanOrEqual(44);
  });
  expect(r.plein.nom).toBe("Fermer la carte");
  expect(r.plein.texte).not.toBe("none");
  expect(r.apres).toBe("Carte en plein écran");
});
