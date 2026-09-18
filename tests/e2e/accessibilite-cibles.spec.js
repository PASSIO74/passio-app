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

  // ═════════════════════════════════════════════════════════════════════════
  // ⑤ / ⑥ — LES OPTIONS D'UNE PUBLICATION (2026-09-18)
  //
  // DEV-01 (ci-dessus) a élargi la cloche, les croix de panneau et les actions
  // de COMMENTAIRE — et s'est arrêté là. Les options d'une PUBLICATION, celles
  // qu'on touche le plus, sont restées sous la barre. Mesuré au navigateur, en
  // iPhone 12, sur le détail d'une publication : « ← » 18×22 (SEULE sortie de
  // la page), actions 55×27 / 46×27 / 31×27 / 35×31, tri des commentaires
  // 91×22, « ⋯ » d'un commentaire 24×24, « ⋯ » d'une publication 30×30.
  // Deux testeuses iPhone, 17/09 : « ça bloque quand j'appuie sur les
  // différentes options ». Corriger une surface, c'est corriger une surface.
  //
  // ⚠️ ON MESURE LA ZONE DE TAP RÉELLE PAR `elementFromPoint`, JAMAIS LE SEUL
  // `getComputedStyle(::after)` : un pseudo-élément correctement dimensionné
  // mais recouvert par un voisin ne reçoit aucun tap, et l'attribut serait vert
  // sur le défaut. C'est d'ailleurs ce qui a faussé la première mesure — les
  // bulles d'aide `.fr-tip` couvraient la rangée, d'où leur retrait ici.
  // ═════════════════════════════════════════════════════════════════════════

  // Hauteur/largeur réellement tapables : on part du CENTRE et on s'éloigne
  // tant que le point touche encore la cible (ou l'un de ses descendants).
  const SONDE = function () {
    window.__zoneTap = function (el) {
      // Hors de l'écran, `elementFromPoint` rend null et la sonde mesurerait 1 px
      // — un faux rouge indiscernable du vrai défaut.
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      const cx = Math.round(b.left + b.width / 2);
      const touche = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
      let haut = Math.round(b.top + b.height / 2), bas = haut;
      while (haut > b.top - 30 && touche(cx, haut - 1)) haut--;
      while (bas < b.bottom + 30 && touche(cx, bas + 1)) bas++;
      const cy = Math.round((haut + bas) / 2);
      let g = cx, d = cx;
      while (g > b.left - 30 && touche(g - 1, cy)) g--;
      while (d < b.right + 30 && touche(d + 1, cy)) d++;
      // Qui borne la zone : sans ça, un rouge dit « 29 au lieu de 44 » sans
      // dire QUI vole les pixels — et c'est toujours un voisin, jamais le CSS.
      const nom = (t) => t && t.tagName + "." + String(t.className).slice(0, 26);
      return { w: d - g + 1, h: bas - haut + 1, visuelW: Math.round(b.width), visuelH: Math.round(b.height),
               borneHaut: nom(document.elementFromPoint(cx, haut - 1)), borneBas: nom(document.elementFromPoint(cx, bas + 1)) };
    };
  };

  test("⑤ les options d'une publication sont tapables sur 44 px, fil ET détail", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    // ⚠️ LA PRÉMISSE EST POSÉE : la barre de tri n'est rendue qu'à partir de
    // DEUX commentaires (app-04). Prendre « la première carte » laissait
    // l'assertion sur `.cmt-sort` ne jamais s'exécuter (relevé par audit-passio).
    const id = await page.evaluate(() => {
      const p = (state.seed.posts || []).find((x) => Array.isArray(x.comments) && x.comments.length >= 2);
      return p ? p.id : null;
    });
    expect(id, "aucune publication de démonstration à deux commentaires — prémisse du tri").toBeTruthy();
    // ① LE FIL, page de détail FERMÉE — celle-ci est en `position:fixed;inset:0`
    // et recouvrirait la carte, donc la sonde n'y toucherait rien.
    const surFil = await page.evaluate(() => {
      // Les bulles d'aide se posent PAR-DESSUS la rangée : elles fausseraient
      // la sonde sans rien dire du défaut mesuré.
      document.querySelectorAll(".fr-tip").forEach((e) => e.remove());
      return [...document.querySelectorAll("#feedList article.post .post-actions .post-action")].map(window.__zoneTap);
    });
    // ② LE DÉTAIL — l'écran de la capture des testeuses.
    await page.evaluate((pid) => openPost(pid), id);
    await page.waitForTimeout(400);
    const surDetail = await page.evaluate(() => {
      document.querySelectorAll(".fr-tip").forEach((e) => e.remove());
      const tri = document.querySelector(".cmt-sort");
      return { zones: [...document.querySelectorAll("#postDetailContent .post-actions .post-action")].map(window.__zoneTap),
               tri: tri ? window.__zoneTap(tri) : null };
    });
    const r = { zones: surFil.concat(surDetail.zones), tri: surDetail.tri };
    expect(r.zones.length).toBeGreaterThanOrEqual(6);
    // RÉINJECTION : sur le code d'avant, chaque hauteur vaut 27 ou 31.
    for (const z of r.zones) {
      expect(z.h, "hauteur tapable d'une option (bornée par " + z.borneHaut + " / " + z.borneBas + ")").toBeGreaterThanOrEqual(44);
      expect(z.w, "largeur tapable d'une option de publication").toBeGreaterThanOrEqual(44);
    }
    // La zone s'élargit SANS grossir le bouton : la mise en page ne bouge pas.
    expect(Math.min(...r.zones.map((z) => z.visuelH))).toBeLessThanOrEqual(32);
    expect(r.tri, "la barre de tri doit être rendue (≥ 2 commentaires)").not.toBeNull();
    expect(r.tri.h, "hauteur tapable du tri des commentaires").toBeGreaterThanOrEqual(43);
  });

  test("⑥ le « ← » qui ferme une publication fait 44 px et porte un nom", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    const id = await page.evaluate(() => document.querySelector("#feedList article.post").dataset.postid);
    await page.evaluate((pid) => openPost(pid), id);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const b = document.querySelector("#postDetailPage button");
      const rect = b.getBoundingClientRect();
      const titre = document.querySelector("#postDetailPage span");
      return { w: Math.round(rect.width), h: Math.round(rect.height), label: b.getAttribute("aria-label"),
               titreX: Math.round(titre.getBoundingClientRect().left) };
    });
    // RÉINJECTION : sur le code d'avant, 18×22 et aucun nom accessible.
    expect(r.w).toBeGreaterThanOrEqual(44);
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.label).toBeTruthy();
    // Les marges négatives compensent : le titre « Post » n'a pas bougé.
    expect(r.titreX).toBe(44);
  });

  test("⑦ le « ⋯ » d'une publication et celui d'un commentaire sont tapables sur 44 px, RENDUS", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    // ⚠️ MESURÉ EN SITU, JAMAIS DANS UN BAC ISOLÉ (relevé par audit-passio) : dans
    // un conteneur à part, rien ne peut recouvrir la zone, et la sonde ne verrait
    // pas un voisin qui vole des pixels — l'angle mort même que ⑤ dénonce. Le
    // contenu de démonstration n'a pas de « ⋯ » (il n'appartient à personne) :
    // on publie une carte À SOI, comme le produit le ferait, et on la mesure là.
    await page.evaluate(() => {
      state.userPosts = state.userPosts || [];
      state.userPosts.unshift({ id: "p_a11y_menu", type: "text", authorId: MY_UID, authorName: "Moi", text: "Cible du ⋯",
        passion: (allPassions()[0] || {}).id, mood: "all", createdAt: Date.now(), timestamp: Date.now(), likes: 0, comments: [] });
      goTo("feed"); renderFeed();
    });
    // ⚠️ JAMAIS LA SONDE DANS LE MÊME TOUR QUE `renderFeed()` : la mise en page
    // n'est pas encore posée, `elementFromPoint` rend le voisin et la zone
    // mesure 1 px — un rouge qui ne dit rien du CSS (vécu en l'écrivant).
    await page.waitForSelector('#feedList article.post[data-postid="p_a11y_menu"] .post-menu-btn', { timeout: 5000 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      document.querySelectorAll(".fr-tip").forEach((e) => e.remove());
      const btn = document.querySelector('#feedList article.post[data-postid="p_a11y_menu"] .post-menu-btn');
      return btn ? window.__zoneTap(btn) : null;
    });
    expect(r, "le « ⋯ » de ma publication doit être rendu dans le fil").not.toBeNull();
    // RÉINJECTION : sur le code d'avant, 30×30.
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.w).toBeGreaterThanOrEqual(44);
    expect(r.visuelH).toBe(30);   // la taille VISIBLE n'a pas bougé

    // Le « ⋯ » d'un commentaire, dans le détail d'une publication commentée.
    const id = await page.evaluate(() => { const p = (state.seed.posts || []).find((x) => Array.isArray(x.comments) && x.comments.length >= 1); return p ? p.id : null; });
    expect(id).toBeTruthy();
    await page.evaluate((pid) => openPost(pid), id);
    await page.waitForTimeout(400);
    const c = await page.evaluate(() => {
      document.querySelectorAll(".fr-tip").forEach((e) => e.remove());
      const b = document.querySelector("#postDetailContent .comment-menu-btn");
      return b ? window.__zoneTap(b) : null;
    });
    expect(c, "le « ⋯ » d'un commentaire doit être rendu").not.toBeNull();
    // RÉINJECTION : sur le code d'avant, 24×24.
    expect(c.h).toBeGreaterThanOrEqual(44);
    expect(c.w).toBeGreaterThanOrEqual(44);
    expect(c.visuelH).toBe(24);
  });
});
