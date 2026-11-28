// Rencontrer — CHOIX D'ÉCRAN arbitrés le 2026-11-28 (dossier ECR, sujets 112,
// 123, 124). Navigateur seul (état local, bootOnboarded), AUCUNE écriture réelle.
//
// Défauts fermés, chacun ROUGE sur le code d'avant :
//   ①  112 — seuls des exemples : le pied annonçait « Afficher 35 résultats »,
//            les tuiles un compteur, le calendrier 15 jours pointés.
//   ②  112 — réel + exemples : le compteur mêlait les deux ; il compte le réel
//            et ajoute les exemples à part (« 3 activités · 2 exemples »).
//   ③  124 — les pastilles du calendrier ignoraient les autres filtres.
//   ④  124 — le ✕ efface TOUTES les dates : il le dit ; retoucher le jour
//            choisi le désélectionne seul (il le re-sélectionnait).
//   ⑤  123 — la ville de référence choisie à la main ne survivait pas au
//            rechargement ; effacée, elle ne revient pas ; un autre compte ne
//            la voit pas.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ serviceWorkers: "block" });

async function boot(page) {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204, body: "" }));
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}
const ouvrirIrl = async (page) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => document.getElementById("screen-irl")?.classList.contains("active"));
};
const ouvrirFiltres = async (page) => {
  await page.locator("#irlToolsBtn").click();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-v4a5-vue") === "filtres", null, { timeout: 8000 });
};
const pied = (page) => page.evaluate(() => {
  const d = document.getElementById("v4a5Done");
  return d ? { texte: d.textContent, off: d.disabled } : null;
});

// Activités RÉELLES (identifiant long, jamais « e<N> ») ajoutées au décor.
const REELS = (j) => j.map(([id, passion, jours]) => ({
  id, title: "Réelle " + id, passion, emoji: "🎸", city: "Annecy", lat: 45.9, lng: 6.12,
  date: Date.now() + jours * 86400000, time: "18:00", desc: "", attendees: [], maybes: [],
  waitlist: [], checkedIn: [], organizerId: "quelqu_un", status: "active",
}));

test.describe("Rencontrer — choix d'écran", () => {
  test("① 112 : avec les seuls exemples, aucun compteur ne compte un exemple", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const avant = await page.evaluate(() => {
      const ex = allEvents().filter((e) => PassioFirstRun.evenementDemo(e));
      // Toutes les passions des exemples sont « miennes » : leurs tuiles sont peintes.
      const ps = [...new Set(ex.map((e) => e.passion))];
      window._irlMyPassions = () => ps;
      renderIRL();
      return { exemples: ex.length, reels: allEvents().length - ex.length };
    });
    expect(avant.reels, "le décor doit être fait des seuls exemples").toBe(0);
    expect(avant.exemples).toBeGreaterThan(0);
    await ouvrirFiltres(page);
    const r = await page.evaluate(() => ({
      compte: window._irlResultCount,
      badges: document.querySelectorAll("[data-irlpassion] .msg-tile-badge").length,
      tuiles: document.querySelectorAll("[data-irlpassion]").length,
      jours: Object.keys(_irlEventDaySet()).length,
      listees: _filterIrlEvents(allEvents()).length,
    }));
    expect(r.tuiles).toBeGreaterThan(0);
    expect(r.compte).toBe(0);
    expect(r.badges).toBe(0);
    expect(r.jours).toBe(0);
    // La liste, elle, ne change pas : les exemples restent montrés…
    expect(r.listees).toBeGreaterThan(0);
    // …et le pied le DIT, sans se griser.
    const p = await pied(page);
    expect(p.texte).toBe("Aucune activité près de toi pour l'instant · " + r.listees + " exemples");
    expect(p.off).toBe(false);
    expect(await page.locator("#irlCalGrid .irl-cal-day.has-ev").count()).toBe(0);
  });

  test("② 112 : réel + exemples — le réel est compté, les exemples à part", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);
    const r = await page.evaluate((reels) => {
      state.seed.events = state.seed.events.concat(reels);
      window._irlMyPassions = () => ["musique"];
      renderIRL();
      const liste = _filterIrlEvents(allEvents());
      const ex = liste.filter((e) => PassioFirstRun.evenementDemo(e)).length;
      const tuile = document.querySelector('[data-irlpassion="musique"] .msg-tile-badge');
      const jours = Object.keys(_irlEventDaySet()).map(Number).sort();
      const attendus = reels.map((e) => { const d = new Date(e.date); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }).sort();
      return {
        ex, compte: window._irlResultCount, badge: tuile && tuile.textContent,
        jours, attendus, ordre: liste.slice(0, 3).map((e) => e.id),
        legacy: document.getElementById("irlFiltersDoneBtn").textContent,
      };
    }, REELS([["reel_a", "musique", 1], ["reel_b", "musique", 2], ["reel_c", "musique", 3]]));
    expect(r.ex).toBeGreaterThan(0);
    expect(r.compte).toBe(3);
    expect(r.badge).toBe("3");
    expect(r.jours).toEqual(r.attendus);
    expect(r.ordre.sort()).toEqual(["reel_a", "reel_b", "reel_c"]);   // réel d'abord, inchangé
    expect((await pied(page)).texte).toBe("Afficher 3 activités · " + r.ex + " exemples");
    expect(r.legacy).toBe("Voir 3 activités · " + r.ex + " exemples");
    // Sans exemple, le pied reprend son libellé de toujours.
    await page.evaluate(() => {
      state.seed.events = state.seed.events.filter((e) => !PassioFirstRun.evenementDemo(e));
      renderIRL();
    });
    await expect.poll(async () => (await pied(page)).texte).toBe("Afficher 3 résultats");
  });

  test("③ 124 : une pastille ne pointe que les jours d'une activité réelle qui passe les AUTRES filtres", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const r = await page.evaluate((reels) => {
      state.seed.events = reels;
      state.userEvents = [];
      const jour = (j) => { const d = new Date(Date.now() + j * 86400000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
      clearAllIrlFilters();
      irlPassionFilterSet().add("sport");
      renderIRL();
      const avecSport = _irlEventDaySet();
      // Un jour choisi au calendrier ne retire pas les AUTRES jours pointés.
      irlDateFilters.add("custom");
      irlCustomDate = { start: jour(4), end: jour(4) + 86399999 };
      const avecDate = _irlEventDaySet();
      const datesIntactes = irlDateFilters.has("custom");
      return {
        musique: !!avecSport[jour(2)], sport: !!avecSport[jour(4)],
        sportAvecDate: !!avecDate[jour(4)], datesIntactes,
      };
    }, REELS([["reel_m", "musique", 2], ["reel_s", "sport", 4]]));
    expect(r.musique, "le jour d'une activité filtrée par la passion est pointé").toBe(false);
    expect(r.sport).toBe(true);
    expect(r.sportAvecDate).toBe(true);
    expect(r.datesIntactes).toBe(true);
  });

  test("④ 124 : le ✕ dit qu'il efface les dates ; retoucher le jour choisi le désélectionne seul", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await page.evaluate((reels) => { state.seed.events = reels; state.userEvents = []; renderIRL(); },
      REELS([["reel_x", "musique", 3]]));
    await page.evaluate(() => openIrlFiltersPanel());
    const croix = page.locator("#irlDateClearBtn");

    const jourTs = await page.evaluate(() => {
      const d = new Date(Date.now() + 3 * 86400000);
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      irlDateFilters.add("today");
      const m = new Date(); if (d.getMonth() !== m.getMonth() || d.getFullYear() !== m.getFullYear()) irlCalNavMonth(1);
      else _renderIrlInlineCal();
      return ts;
    });
    const jour = page.locator(`#irlCalGrid button[onclick="irlCalPick(${jourTs})"]`);
    await jour.evaluate((b) => b.click());
    expect(await page.evaluate(() => [...irlDateFilters].sort())).toEqual(["custom", "today"]);
    await expect(page.locator(`#irlCalGrid button[onclick="irlCalPick(${jourTs})"]`)).toHaveClass(/sel/);
    // Retoucher le même jour : la date du calendrier part, « Aujourd'hui » reste.
    await page.locator(`#irlCalGrid button[onclick="irlCalPick(${jourTs})"]`).evaluate((b) => b.click());
    const apres = await page.evaluate(() => ({ dates: [...irlDateFilters], custom: irlCustomDate }));
    expect(apres.dates).toEqual(["today"]);
    expect(apres.custom).toBe(null);
    await expect(page.locator(`#irlCalGrid button[onclick="irlCalPick(${jourTs})"]`)).not.toHaveClass(/sel/);
    // Le ✕ garde son rôle — TOUTES les dates — et désormais le dit.
    await expect(croix).toHaveAttribute("aria-label", "Effacer les dates");
    await expect(croix).toHaveAttribute("title", "Effacer les dates");
    await page.evaluate(() => _syncIrlDateBtn());
    await croix.evaluate((b) => b.click());
    expect(await page.evaluate(() => irlDateFilters.size)).toBe(0);
  });

  test("⑤ 123 : la ville choisie survit au rechargement, part quand on l'efface, et reste au compte", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await page.evaluate(() => selectIrlCity("lyon", "Lyon"));
    await page.reload();
    await page.waitForFunction(() => typeof goTo === "function" && typeof irlLieuReference === "function");
    await ouvrirIrl(page);
    expect(await page.evaluate(() => irlLieuReference())).toEqual({ nom: "Lyon", sub: "Ville choisie" });
    expect(await page.evaluate(() => irlSelectedCity && irlSelectedCity.coords.map((c) => Math.round(c * 10) / 10))).toEqual([45.8, 4.8]);

    // La position GPS n'est jamais écrite : seule la ville l'est.
    await page.evaluate(() => { irlUserLocation = { lat: 43.60451, lng: 1.44195 }; irlUserLocationError = false; renderIRL(); });
    expect(await page.evaluate(() => JSON.stringify(localStorage)).then((s) => s.includes("43.60451"))).toBe(false);

    // Un AUTRE compte, dans la même session : la ville de Lyon ne le suit pas.
    const autre = await page.evaluate(() => {
      const moi = MY_UID;
      MY_UID = "11111111-2222-4333-8444-555555555555";
      renderIRL();
      const vu = irlLieuReference().nom;
      MY_UID = moi;
      return vu;
    });
    expect(autre).not.toBe("Lyon");

    // Effacer la ville l'efface aussi du stockage.
    await page.reload();
    await page.waitForFunction(() => typeof goTo === "function" && typeof irlLieuReference === "function");
    await ouvrirIrl(page);
    expect(await page.evaluate(() => irlLieuReference().nom)).toBe("Lyon");
    await page.evaluate(() => clearIrlCitySelection());
    await page.reload();
    await page.waitForFunction(() => typeof goTo === "function" && typeof irlLieuReference === "function");
    await ouvrirIrl(page);
    expect(await page.evaluate(() => irlLieuReference().nom)).toBe("Choisir une ville");

    // La déconnexion l'emporte avec le compte.
    await page.evaluate(() => selectIrlCity("lyon", "Lyon"));
    const purgee = await page.evaluate(() => {
      const avant = Object.keys(localStorage).filter((k) => localStorage.getItem(k).includes("Lyon") && k.indexOf("ville") > -1);
      purgeAccountScopedData();
      const apres = Object.keys(localStorage).filter((k) => (localStorage.getItem(k) || "").includes("Lyon"));
      return { avant: avant.length, apres };
    });
    expect(purgee.avant).toBeGreaterThan(0);
    expect(purgee.apres).toEqual([]);
  });
});
