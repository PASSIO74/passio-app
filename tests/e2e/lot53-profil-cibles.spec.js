// ═══════════════════════════════════════════════════════════════════════════
// LOT-53 (audit UX/UI du 2026-11-10) — DERNIERS CONSTATS
//   ① PRO-C23 : « Réactiver » et le curseur du recadreur à 44 px ;
//   ② ENT-C19 : les champs d'après Google (année, nom) sont équipés comme ceux
//      du formulaire e-mail (même clavier, même autocomplétion, même libellé).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① PRO-C23 : cibles du profil à 44 px", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = '<button type="button" class="v8-switch-go">Réactiver</button><input id="pcropZoom" type="range" min="1" max="4" step="0.01" value="1" style="flex:1;">';
    document.body.appendChild(box);
    const go = box.querySelector(".v8-switch-go").getBoundingClientRect().height;
    const zoom = box.querySelector("#pcropZoom").getBoundingClientRect().height;
    box.remove();
    return { go, zoom };
  });
  expect(r.go).toBeGreaterThanOrEqual(44);
  expect(r.zoom).toBeGreaterThanOrEqual(44);
});

test("② ENT-C19 : les champs d'après Google sont ceux du formulaire e-mail", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const a = (id) => { const e = document.getElementById(id); return e ? { mode: e.getAttribute("inputmode"), auto: e.getAttribute("autocomplete") } : null; };
    const libelle = (id) => { const e = document.getElementById(id); const l = e && e.closest("label"); return l ? (l.querySelector("span") || {}).textContent : null; };
    return { annee: a("birthYear"), anneeEmail: a("authBirthYear"), nom: libelle("userName") };
  });
  expect(r.annee).toEqual(r.anneeEmail);
  expect(r.annee).toEqual({ mode: "numeric", auto: "bday-year" });
  if (r.nom !== null) expect(r.nom).toBe("Nom d'utilisateur");
});
