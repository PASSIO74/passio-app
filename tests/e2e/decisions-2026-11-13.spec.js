// ═══════════════════════════════════════════════════════════════════════════
// DÉCISIONS DE BENJAMIN DU 2026-11-13 (« 1 : a / 2 : a / 3 : b »)
//   ① CRE-C16 / FIL-C24 : le TEXTE d'une publication se corrige ; l'écran ne
//      change qu'après l'écriture confirmée ; la mention « modifié » s'affiche ;
//      un refus est dit et rien ne change.
//   ② CRE-C13 : la feuille « Ta bobine » dit « Publier dans » et ouvre le MÊME
//      sélecteur que le Studio, qui écrit dans son `<select>`.
//   ③ PRO-C20 : le profil d'un compte qui m'a bloqué est « Ce profil n'est pas
//      disponible » ; un compte que J'AI bloqué garde son profil (LOT-16).
// Aucune écriture réseau : le client Supabase est remplacé par un relevé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "b2c3d4e5-0000-4000-8000-0000000b10c1";

async function fauxSupa(page, rep) {
  await page.evaluate((r) => {
    window.__ecritures = []; window.__rpc = [];
    const faux = {
      from(table) {
        const e = { table, champs: null, filtres: [] };
        const q = {
          update(v) { e.champs = v; return q; }, eq(c, v) { e.filtres.push([c, v]); return q; },
          select() { if (e.champs) { window.__ecritures.push(e); return Promise.resolve(r.update); } return Promise.resolve({ data: [], error: null }); },
          order() { return q; }, limit() { return q; }, in() { return q; }, range() { return Promise.resolve({ data: [], error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); },
        };
        return q;
      },
      rpc(nom, args) { window.__rpc.push([nom, args]); return Promise.resolve(r.rpc || { data: false, error: null }); },
    };
    try { supa = faux; } catch (e) {}
    window.supa = faux;
    window._supaReal = true;
    window._uidEstUnCompte = () => true;
    window.__t = [];
    const t0 = window.toast;
    window.toast = function (m) { window.__t.push(String(m)); try { return t0.apply(this, arguments); } catch (e) { return null; } };
  }, rep);
}

test("① CRE-C16 / FIL-C24 : corriger le texte — après confirmation seulement, « modifié » affiché ; un refus ne change rien", async ({ page }) => {
  await bootOnboarded(page);
  await fauxSupa(page, { update: { data: [{ id: "p_dec_1", edited_at: new Date().toISOString() }], error: null } });
  const r = await page.evaluate(async () => {
    const p = { id: "p_dec_1", authorId: MY_UID, authorName: "Moi", passion: "musique", mood: "all", type: "text", text: "Concert samedi a 20h", createdAt: Date.now() - 60000, likes: 3, comments: [], fromSupabase: true };
    state.supabasePosts = [p];
    openPostOptions("p_dec_1");
    const menu = document.getElementById("modalContent").textContent;
    modifierTextePublication("p_dec_1");
    document.getElementById("pubTexteEdit").value = "Concert samedi à 20 h";
    await enregistrerTextePublication("p_dec_1");
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML(findPostAnywhere("p_dec_1"));
    return { menu, ecr: window.__ecritures, texte: findPostAnywhere("p_dec_1").text, carte: box.textContent, toast: window.__t.slice(-1)[0], moi: MY_UID };
  });
  expect(r.menu).toContain("Modifier le texte");
  expect(r.ecr.map((e) => [e.table, e.champs])).toEqual([["posts", { content: "Concert samedi à 20 h" }]]);
  expect(r.ecr[0].filtres).toEqual([["id", "p_dec_1"], ["author_id", r.moi]]);
  expect(r.texte).toBe("Concert samedi à 20 h");
  expect(r.carte).toContain("modifié");
  expect(r.toast).toBe("Publication modifiée");

  await fauxSupa(page, { update: { data: [], error: null } });
  const refus = await page.evaluate(async () => {
    modifierTextePublication("p_dec_1");
    document.getElementById("pubTexteEdit").value = "Texte refusé";
    await enregistrerTextePublication("p_dec_1");
    return { texte: findPostAnywhere("p_dec_1").text, toast: window.__t.slice(-1)[0] };
  });
  expect(refus.texte, "zéro ligne : rien ne change à l'écran").toBe("Concert samedi à 20 h");
  expect(refus.toast).toContain("non enregistrée");
});

test("② CRE-C13 : la bobine dit « Publier dans » et ouvre le sélecteur du Studio", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    let appel = null;
    const ancien = window.PassioFlatUI && PassioFlatUI.ouvrirChoixPassion;
    if (window.PassioFlatUI) PassioFlatUI.ouvrirChoixPassion = (sel) => { appel = sel && sel.id; return true; };
    meOpen("bobine"); meSetMedia("data:video/webm;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA", "video");
    await new Promise((res) => setTimeout(res, 500));
    PassioUIV7.openReelSheet();
    await new Promise((res) => setTimeout(res, 50));
    const feuille = document.getElementById("v7BobineTitre") && document.getElementById("v7BobineTitre").closest(".v7-sheet");
    const texte = feuille ? feuille.textContent : "";
    const bouton = document.getElementById("v7BobinePassionChoisir");
    if (bouton) bouton.click();
    if (window.PassioFlatUI && ancien) PassioFlatUI.ouvrirChoixPassion = ancien;
    return { texte, appel, existe: !!bouton };
  });
  expect(r.existe, "la feuille de bobine a son bouton de choix").toBe(true);
  expect(r.texte).toContain("Publier dans");
  expect(r.appel, "le sélecteur du Studio écrit dans le <select> de la bobine").toBe("v7BobinePassion");
});

test("③ PRO-C20 : un compte qui m'a bloqué → « Ce profil n'est pas disponible » ; un compte que j'ai bloqué garde son profil", async ({ page }) => {
  await bootOnboarded(page);
  await fauxSupa(page, { rpc: { data: true, error: null } });
  const subi = await page.evaluate(async (id) => {
    state.user.blocked = [];
    await openUserProfile(id, "seed");
    return { titre: (document.querySelector("#modalContent .modal-title") || {}).textContent, rpc: window.__rpc.slice() };
  }, AUTRE);
  expect(subi.titre).toBe("Ce profil n'est pas disponible");
  expect(subi.rpc).toEqual([["is_blocked_with", { _other: AUTRE }]]);

  const pose = await page.evaluate(async (id) => {
    closeModal();
    window.__rpc = [];
    state.user.blocked = [id];
    state.seed.users = (state.seed.users || []).concat([{ id, name: "Inès", profileEmoji: "🎻", avatar: "#7c3aed", passion: "musique", distant: true }]);
    await openUserProfile(id, "seed");
    await new Promise((res) => setTimeout(res, 300));
    const m = document.getElementById("modalContent");
    return { texte: m ? m.textContent : "", rpc: window.__rpc.slice() };
  }, AUTRE);
  expect(pose.texte).not.toContain("Ce profil n'est pas disponible");
  expect(pose.texte).toContain("Tu as bloqué ce compte");
  expect(pose.rpc, "le sens « moi » se lit dans ma liste, sans appel").toEqual([]);
});
