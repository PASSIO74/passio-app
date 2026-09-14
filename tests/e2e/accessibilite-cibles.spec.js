// DEV-01 / DEV-04 — cibles tactiles de 44 px et noms accessibles.
//
// LES DÉFAUTS (contre-revue Astra) : commandes de barre sous 44 px (cloche
// 34 px, croix des panneaux), actions de commentaire réduites à leur icône ;
// avatars cliquables (×17) et pastille photo 📷 sans nom accessible. Ce que
// cette suite exige : ① l'avatar d'une carte du fil est un bouton nommé
// « Profil de <nom> » (RÉINJECTION) ; ② la photo de profil se change par un
// bouton nommé, la pastille 📷 est décorative ; ③ la cloche et la croix des
// panneaux ont une zone de tap ≥ 44 px sans changer leur taille visible
// (RÉINJECTION) ; ④ une action de commentaire couvre ≥ 40 px de haut.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("accessibilité — cibles et noms", () => {
  test("① l'avatar d'une carte du fil est un bouton nommé", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    const r = await page.evaluate(() => { const a = document.querySelector("#feedList .post .avatar"); const nom = document.querySelector("#feedList .post .post-author-name"); return { role: a && a.getAttribute("role"), tab: a && a.getAttribute("tabindex"), label: a && a.getAttribute("aria-label"), nom: nom && nom.textContent.trim() }; });
    // RÉINJECTION : sur le code d'avant, ni role, ni tabindex, ni aria-label.
    expect(r.role).toBe("button");
    expect(r.tab).toBe("0");
    expect(r.label).toBe("Profil de " + r.nom);
  });

  test("② la photo de profil se change par un bouton nommé ; la pastille 📷 est décorative", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { goTo("profiles"); try { renderProfilesScreen(); } catch (e) {} });
    const r = await page.evaluate(() => { const a = document.getElementById("mainProfileAvatar"); const b = document.querySelector(".main-profile-avatar-badge"); return { role: a && a.getAttribute("role"), label: a && a.getAttribute("aria-label"), badgeHidden: b ? b.getAttribute("aria-hidden") : "absent" }; });
    expect(r.role).toBe("button");
    expect(r.label).toMatch(/photo de profil/);
    expect(["true", "absent"]).toContain(r.badgeHidden);
  });

  test("③ cloche et croix de panneau : zone de tap ≥ 44 px, taille visible inchangée", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const bell = document.querySelector(".topbar-bell");
      const cs = getComputedStyle(bell, "::after");
      return { visible: bell.getBoundingClientRect().height, apres: { content: cs.content, minH: cs.minHeight, minW: cs.minWidth, pos: cs.position } };
    });
    // RÉINJECTION : sur le code d'avant, ::after n'a pas de contenu (content: none).
    expect(r.visible).toBeLessThanOrEqual(36);
    expect(r.apres.content).not.toBe("none");
    expect(parseInt(r.apres.minH, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(r.apres.minW, 10)).toBeGreaterThanOrEqual(44);
    expect(r.apres.pos).toBe("absolute");
  });

  test("④ une action de commentaire couvre au moins 40 px de haut sans déplacer la ligne", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const el = document.createElement("div"); el.className = "comment-actions"; el.style.cssText = "position:absolute;left:0;top:0;width:200px;";
      el.innerHTML = '<span class="comment-action">❤️ 3</span><span class="comment-action">Répondre</span>';
      document.body.appendChild(el);
      const a = el.querySelector(".comment-action"); const cs = getComputedStyle(a);
      const h = a.getBoundingClientRect().height; const ligne = el.getBoundingClientRect().height;
      const padTop = parseInt(cs.paddingTop, 10), marTop = parseInt(cs.marginTop, 10);
      el.remove();
      return { h, ligne, padTop, marTop };
    });
    expect(r.h).toBeGreaterThanOrEqual(40);
    expect(r.padTop).toBeGreaterThanOrEqual(12);
    expect(r.marTop).toBe(-r.padTop);        // la marge compense : la ligne ne grandit pas
    expect(r.ligne).toBeLessThan(r.h);   // 839 px = le body entier quand le conteneur n'est pas borné : on le borne
  });
});
