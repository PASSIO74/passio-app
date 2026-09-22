// ═══════════════════════════════════════════════════════════════════════════
// SUIVRE UN COMPTE PRIVÉ — l'écran mentait sur l'état de la demande (2026-09-22)
//
// Rapport d'usage réel, capture à l'appui : « quand je clique sur Suivre il le met
// en évidence, puis quand je clique dessus il ne se passe rien ». MESURÉ en
// production (`telemetry_events`, 22/09 14:01, compte `812aee2b` vers le compte
// PRIVÉ `6b0a8694`) : tap → `POST /rest/v1/follows` **201**, puis 2,4 s plus tard
// second tap → `DELETE /rest/v1/follows` **204**. Les deux écritures partent, le
// mécanisme est INTACT — et la table `follows` ne porte aucune ligne vers ce
// compte, parce que le second tap avait détruit la demande.
//
// Le défaut n'était donc pas « rien ne se passe », c'était « l'écran ne dit pas
// ce qui se passe » :
//   ① l'optimiste peignait « ✓ Suivi » en violet PLEIN — un abonnement acquis —
//      alors que le client SAIT que le compte est privé (il peint le 🔒 et le bloc
//      « Ce compte est privé » deux centimètres plus bas) ;
//   ② « Demande envoyée » était peint comme l'état neutre, donc indiscernable
//      d'un « Suivre » qui n'aurait rien fait ;
//   ③ rien n'annonçait qu'un second appui ANNULE la demande ;
//   ④ le bloc « Ce compte est privé » continuait d'écrire « Abonne-toi pour voir
//      ses publications » à quelqu'un dont la demande était déjà partie.
//
// ⚠️ La détection échoue sur « public » : `_profileCache` ne porte pas
// `is_private`, seul `openUserProfile` le relit. Hors du profil visité, le
// comportement d'avant tient à l'octet près — ce que le cas ⑤ mesure, et ce qui
// garde `ouverture-publique` ⑦ vert.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Pose le profil visité que `_ciblePrivee` consulte, et un bouton de la surface
// réelle (le profil visité émet `followBtn_<uid>`).
function poserProfilVisite(page, prive) {
  return page.evaluate((prive) => {
    // ⚠️ LA FORME EXACTE QUE `openUserProfile` PRODUIT. La première rédaction
    // posait `{ user: { isPrivate } }`, une clé que le produit n'écrit NULLE PART :
    // `_ciblePrivee` rendait donc toujours `false`, la branche « compte privé »
    // était du code MORT, et SIX cas étaient verts dessus. Un banc qui fabrique
    // sa prémisse mesure la fonction, jamais le câblage (faute `_notifierMessage`).
    // Le cas ⑧ garde cette forme contre une dérive du producteur.
    window._visited = { authorId: "u_dodie", isPrivate: prive, posts: [], passionSel: new Set(), tabSel: new Set(), locked: prive };
    state.user.following = []; state.user.followingPending = [];
    document.body.insertAdjacentHTML("beforeend",
      '<button id="followBtn_u_dodie">Suivre</button>'
      + '<div data-prive-titre="1">Ce compte est privé</div>'
      + '<div data-prive-texte="Abonne-toi pour voir ses publications, photos, bobines et carnets.">Abonne-toi pour voir ses publications, photos, bobines et carnets.</div>');
  }, prive);
}

test.describe("Suivre un compte privé", () => {
  test("① l'optimiste n'annonce JAMAIS « ✓ Suivi » sur un compte connu privé", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, true);
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => { await new Promise((r) => setTimeout(r, 40)); return { ok: true, status: "pending" }; };
      const btn = document.getElementById("followBtn_u_dodie");
      toggleFollowUser("u_dodie", "Dodie");
      const optimiste = { texte: btn.textContent, fond: btn.style.background, bord: btn.style.borderColor, couleur: btn.style.color };
      await new Promise((r) => setTimeout(r, 80));
      return { optimiste, apres: btn.textContent, attente: state.user.followingPending.slice(), suivi: state.user.following.slice() };
    });
    expect(r.optimiste.texte).toBe("Demande envoyée");
    expect(r.optimiste.fond).toBe("");                       // jamais le violet PLEIN du suivi acquis
    expect(r.optimiste.bord).toBe("var(--accent)");          // mais un contour : ce n'est pas l'état neutre
    expect(r.optimiste.couleur).toBe("var(--accent)");
    expect(r.apres).toBe("Demande envoyée");
    expect(r.attente).toEqual(["u_dodie"]);
    expect(r.suivi).toEqual([]);
  });

  test("② le bouton DIT ce qu'un second appui fera", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, true);
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => ({ ok: true, status: "pending" });
      const btn = document.getElementById("followBtn_u_dodie");
      const avant = btn.getAttribute("title");
      toggleFollowUser("u_dodie", "Dodie");
      await new Promise((r) => setTimeout(r, 30));
      return { avant, titre: btn.getAttribute("title"), aria: btn.getAttribute("aria-label"),
               table: [aideBoutonSuivi("u_dodie"), aideBoutonSuivi("u_inconnu")] };
    });
    expect(r.titre).toMatch(/annuler/i);
    expect(r.aria).toBe(r.titre);
    expect(r.table[0]).toMatch(/annuler/i);
    expect(r.table[1]).toBe("Suivre ce compte");
  });

  test("③ le bloc « Ce compte est privé » suit l'état de la demande, dans les deux sens", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, true);
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => ({ ok: true, status: "pending" });
      window.supaUnfollowUser = async () => true;
      const t = () => document.querySelector("[data-prive-titre]").textContent;
      const x = () => document.querySelector("[data-prive-texte]").textContent;
      const avant = { t: t(), x: x() };
      toggleFollowUser("u_dodie", "Dodie");
      await new Promise((r) => setTimeout(r, 30));
      const pendant = { t: t(), x: x() };
      toggleFollowUser("u_dodie", "Dodie");        // annulation
      await new Promise((r) => setTimeout(r, 10));
      return { avant, pendant, apres: { t: t(), x: x() } };
    });
    expect(r.avant.t).toBe("Ce compte est privé");
    expect(r.pendant.t).toBe("Demande envoyée");
    expect(r.pendant.x).toMatch(/accepté ta demande/i);
    expect(r.apres.t).toBe("Ce compte est privé");            // l'annulation rend le texte d'origine
    expect(r.apres.x).toBe(r.avant.x);
  });

  test("④ un compte repassé PUBLIC entre le chargement et le tap est corrigé vers « ✓ Suivi »", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, true);
    const r = await page.evaluate(async () => {
      // Le profil a été chargé « privé », le serveur répond 'accepted'.
      window.supaFollowUser = async () => ({ ok: true, status: "accepted" });
      const btn = document.getElementById("followBtn_u_dodie");
      toggleFollowUser("u_dodie", "Dodie");
      await new Promise((r) => setTimeout(r, 40));
      return { texte: btn.textContent, fond: btn.style.background,
               suivi: state.user.following.slice(), attente: state.user.followingPending.slice() };
    });
    expect(r.texte).toBe("✓ Suivi");
    expect(r.fond).toBe("var(--accent)");
    expect(r.suivi).toEqual(["u_dodie"]);
    expect(r.attente).toEqual([]);
  });

  test("⑤ hors profil visité, on ne SAIT pas : le comportement d'avant tient", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, false);                     // compte public connu
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => { await new Promise((r) => setTimeout(r, 40)); return { ok: true, status: "accepted" }; };
      const btn = document.getElementById("followBtn_u_dodie");
      toggleFollowUser("u_dodie", "Dodie");
      const optimiste = btn.textContent;
      // Et un compte dont on ne sait RIEN (aucun profil visité ouvert).
      window._visited = null;
      document.body.insertAdjacentHTML("beforeend", '<button data-follow-uid="u_muet">Suivre</button>');
      toggleFollowUser("u_muet", "Muet");
      const inconnu = document.querySelector('[data-follow-uid="u_muet"]').textContent;
      return { optimiste, inconnu, prive: _ciblePrivee("u_muet") };
    });
    expect(r.optimiste).toBe("✓ Suivi");
    expect(r.inconnu).toBe("✓ Suivi");
    expect(r.prive).toBe(false);
  });

  test("⑥ un refus serveur annule l'affichage, y compris depuis l'état « attente »", async ({ page }) => {
    await bootOnboarded(page);
    await poserProfilVisite(page, true);
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => ({ ok: false, status: null });
      const btn = document.getElementById("followBtn_u_dodie");
      toggleFollowUser("u_dodie", "Dodie");
      await new Promise((r) => setTimeout(r, 40));
      return { texte: btn.textContent, suivi: state.user.following.slice(), attente: state.user.followingPending.slice(),
               titre: document.querySelector("[data-prive-titre]").textContent };
    });
    expect(r.texte).toBe("Suivre");
    expect(r.suivi).toEqual([]);
    expect(r.attente).toEqual([]);                            // l'optimiste « attente » est retiré, pas seulement `following`
    expect(r.titre).toBe("Ce compte est privé");
  });
});

// ⚠️ LE RENDU DU PROFIL VISITÉ SE MESURE À LA SOURCE. `profil-visite-options` est
// rouge EN LOCAL sur `origin/main` PUR (divergence d'environnement déjà écrite
// dans CLAUDE.md : `.modal.modal-fullscreen` n'y devient pas visible), donc aucun
// banc local n'ouvre cette modale — et c'est précisément la surface de la capture.
// Ce cas vérifie que son gabarit consulte les DEUX autorités : la table d'aide et
// l'état de suivi. Sans lui, le bouton du profil visité pouvait perdre son
// infobulle et son contour sans qu'un seul cas rougisse.
test("⑦ le gabarit du profil visité lit les deux autorités (câblage, à la source)", async ({ page }) => {
  const src = await page.request.get("/js/app-04-comments-shop.js").then((r) => r.text());
  const i = src.indexOf('id="followBtn_');
  expect(i).toBeGreaterThan(0);
  // ⚠️ PAS DE TRANCHE MAGIQUE : `slice(i, i + N)` cesse de couvrir le gabarit dès
  // qu'il grandit, SANS un rouge (piège nommé dans CLAUDE.md). On lit jusqu'à la
  // fermeture de la balise, qui est la vraie frontière.
  const bloc = src.slice(i, src.indexOf("</button>", i));
  expect(bloc.length).toBeGreaterThan(50);
  expect(bloc).toContain('title="' + "' + escapeHtml(aideBoutonSuivi(authorId))");
  expect(bloc).toContain('aria-label="' + "' + escapeHtml(aideBoutonSuivi(authorId))");
  expect(bloc).toContain('etatSuivi(authorId) === "attente"');
  expect(bloc).toContain("libelleBoutonSuivi(authorId)");
});

test("⑧ le PRODUCTEUR de `window._visited` publie bien la confidentialité (câblage, à la source)", async ({ page }) => {
  const src = await page.request.get("/js/app-04-comments-shop.js").then((r) => r.text());
  const i = src.indexOf("window._visited = {");
  expect(i).toBeGreaterThan(0);
  const ligne = src.slice(i, src.indexOf("\n", i));
  // C'est CETTE ligne qui a rendu la détection morte : le consommateur lisait une
  // clé que le producteur n'écrivait pas. On épingle les deux bouts.
  expect(ligne).toContain("isPrivate: !!user.isPrivate");
  expect(ligne).toContain("authorId: authorId");
  const j = src.indexOf("function _ciblePrivee(");
  const corps = src.slice(j, src.indexOf("\n}", j));
  expect(corps).toContain("v.isPrivate");
  expect(corps).not.toContain("v.user");          // la forme morte ne revient pas
});

test("⑨ une annulation REFUSÉE par le serveur ne se fait pas passer pour faite", async ({ page }) => {
  await bootOnboarded(page);
  await poserProfilVisite(page, true);
  const r = await page.evaluate(async () => {
    window.supaFollowUser = async () => ({ ok: true, status: "pending" });
    window.supaUnfollowUser = async () => ({ ok: false });
    const btn = document.getElementById("followBtn_u_dodie");
    toggleFollowUser("u_dodie", "Dodie");
    await new Promise((r) => setTimeout(r, 30));
    toggleFollowUser("u_dodie", "Dodie");                    // annulation refusée
    await new Promise((r) => setTimeout(r, 30));
    return { texte: btn.textContent, attente: state.user.followingPending.slice() };
  });
  expect(r.texte).toBe("Demande envoyée");                   // l'écran revient à la vérité serveur
  expect(r.attente).toEqual(["u_dodie"]);
});

test("⑩ un verdict sans `status` explicite ne promeut PAS en « ✓ Suivi »", async ({ page }) => {
  await bootOnboarded(page);
  await poserProfilVisite(page, true);
  const r = await page.evaluate(async () => {
    window.supaFollowUser = async () => true;                // faux client sans `status`
    const btn = document.getElementById("followBtn_u_dodie");
    toggleFollowUser("u_dodie", "Dodie");
    await new Promise((r) => setTimeout(r, 30));
    return { texte: btn.textContent, attente: state.user.followingPending.slice(), suivi: state.user.following.slice() };
  });
  expect(r.texte).toBe("Demande envoyée");
  expect(r.attente).toEqual(["u_dodie"]);
  expect(r.suivi).toEqual([]);
});

test("⑪ les QUATRE surfaces posent l'aide et l'aspect d'état dès le PREMIER rendu", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.user.following = []; state.user.followingPending = ["u_att"]; 
    const att = attrsBoutonSuivi("u_att"), suiv = (state.user.following.push("u_s"), attrsBoutonSuivi("u_s")), rien = attrsBoutonSuivi("u_r");
    return { att, suiv, rien };
  });
  expect(r.att).toContain('data-suivi-attente="1"');
  expect(r.att).toContain("border-color:var(--accent)");
  expect(r.att).not.toContain("background:var(--accent)");   // jamais le violet PLEIN du suivi acquis
  expect(r.att).toMatch(/title="[^"]*annuler/);
  expect(r.suiv).toContain("background:var(--accent)");
  expect(r.rien).not.toContain("style=");
  expect(r.rien).toMatch(/aria-label="Suivre ce compte"/);
  // Les trois gabarits qui ne sont PAS le profil visité doivent l'appeler.
  for (const f of ["/js/app-06-reels-partage.js", "/js/app-07-ia-explore-irl.js"]) {
    const src = await page.request.get(f).then((x) => x.text());
    expect(src).toContain("attrsBoutonSuivi(u.id)");
  }
});
