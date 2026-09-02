// EN-TÊTE DE PROFIL — la photo jusqu'au pseudo, un avatar plus grand, et des
// passions qui sont des PORTES (2026-09-01).
//
// Trois demandes de Benjamin, après essai réel sur son appareil :
//   ① « la photo de fond devrait prendre plus de place, elle devrait aller
//      jusqu'à juste au-dessus du nom de profil » ;
//   ② « la photo de profil plus grande » ;
//   ③ « je voudrais que les passions soient cliquables et que ça renvoie vers la
//      page de cette passion, pour que les utilisateurs puissent aller découvrir
//      les passions directement ».
//
// ⚠️ LE POINT ③ A ÉTÉ DÉFAIT LE LENDEMAIN, ET LA SECTION QUI LE COUVRAIT A ÉTÉ
// RETOURNÉE PLUTÔT QUE SUPPRIMÉE. Le 2026-09-02 le rail de passions du profil
// est devenu lui aussi une rangée de pastilles : les mêmes passions étaient
// nommées deux fois, à 5 px d'écart. « On va supprimer les titres de passion
// dans le profil sous le pseudo et garder seulement les bulles dessous. » Les
// tests vérifient désormais que la ligne NE REVIENT PAS, et ce que ③ avait
// acquis (44 px de cible, pas de chevauchement, aucune fuite d'archive) est
// mesuré sur le rail, où les passions vivent.
//
// ⚠️ ① ET ② SONT LIÉS, ET C'EST LE CŒUR DE LA SUITE. Ce qui rend la place à la
// photo n'est pas un plafond plus haut — c'est l'avatar, qui passe ENTIÈREMENT
// sur la couverture au lieu d'y déborder de moitié. Les trois nombres du CSS
// (taille de l'avatar, `margin-top` négatif, `margin-bottom`) tiennent ensemble :
// changer l'un sans les autres fait déborder l'avatar dans le corps blanc, ou le
// fait flotter au milieu de la photo. Les tests mesurent donc la RELATION
// (avatar dans la couverture, pseudo au ras du bord bas), jamais une constante
// isolée qui gèlerait le design.
//
// ⚠️ Ces tests mesurent des RECTANGLES : ils sont écrits en viewport fixe et
// tolérants de quelques pixels. Ce qu'ils verrouillent, ce sont des invariants
// (« dedans », « juste en dessous »), pas une maquette au pixel.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Benjamin, trois passions. Aucune écriture réseau.
async function poser(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};

    state.user.general = { username: "Benjamin", bio: "Passionné de tout" };
    state.user.name = "Benjamin";
    state.user.profiles = (o.profiles || [
      { id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 },
      { id: "pp_pod", name: "Benjamin", passion: "podcast", emoji: "🎙", color: "#7c3aed", createdAt: 2 },
      { id: "pp_voy", name: "Benjamin", passion: "voyage", emoji: "✈️", color: "#7c3aed", createdAt: 3 },
    ]);
    state.user.currentProfileId = state.user.profiles[0].id;
    state.userPosts = [];
    saveState();
    goTo("profiles");
  }, opts);
  await page.waitForTimeout(700);
}

function mesures(page) {
  return page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel);
      return e ? e.getBoundingClientRect() : null;
    };
    const c = r(".main-profile-cover");
    const a = r(".main-profile-avatar");
    const u = r(".main-profile-username");
    return {
      cover: { top: c.top, bottom: c.bottom, height: c.height },
      avatar: { top: a.top, bottom: a.bottom, width: a.width, height: a.height },
      usernameTop: u.top,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ① LA COUVERTURE DESCEND JUSQU'AU PSEUDO
// ══════════════════════════════════════════════════════════════════════════

test("① la couverture s'arrête juste AU-DESSUS du pseudo", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  // « Juste au-dessus » : le pseudo commence sous le bord bas de la photo, et
  // l'écart se compte en pixels, pas en dizaines. Avant ce lot il valait 45 px
  // — la moitié de l'avatar — plus la marge du bloc.
  const ecart = m.usernameTop - m.cover.bottom;
  expect(ecart, "le pseudo est SOUS la photo").toBeGreaterThanOrEqual(0);
  expect(ecart, "et juste en dessous, pas à distance").toBeLessThanOrEqual(12);
});

test("① bis — l'avatar tient ENTIÈREMENT sur la couverture", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  // C'est CE déplacement qui rend la place à la photo : l'avatar ne déborde
  // plus dans le corps blanc, donc la photo occupe toute la hauteur jusqu'au
  // pseudo. Un `margin-top` mal accordé à la taille de l'avatar casse ici.
  expect(m.avatar.top, "bord haut de l'avatar sous le bord haut de la photo")
    .toBeGreaterThanOrEqual(m.cover.top);
  expect(m.avatar.bottom, "bord bas de l'avatar au-dessus du bord bas de la photo")
    .toBeLessThanOrEqual(m.cover.bottom);
  // Et il respire : collé au bord, il se lirait comme un débordement raté.
  expect(m.cover.bottom - m.avatar.bottom, "garde sous l'avatar")
    .toBeGreaterThanOrEqual(6);
});

test("② la photo de profil est nettement plus grande qu'avant (90 px)", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  expect(m.avatar.width, "largeur de l'avatar").toBeGreaterThan(100);
  expect(Math.round(m.avatar.width), "avatar carré")
    .toBe(Math.round(m.avatar.height));
});

test("① ter — la carte d'identité reste sous les deux tiers de l'écran", async ({ page }) => {
  await poser(page);
  // ⚠️ CONTRE-MESURE, et elle a une histoire : le 2026-08-31 Benjamin avait
  // demandé l'INVERSE (« le grand carré avec photo prend trop de place »). Les
  // deux demandes ne se contredisent pas — l'une visait la carte entière,
  // l'autre la seule photo — mais rien ne garantit tout seul que la carte ne
  // regonfle pas. Ce test est le garde-fou de la demande précédente.
  const part = await page.evaluate(() => {
    const carte = document.querySelector(".main-profile-card").getBoundingClientRect().height;
    const zone = document.querySelector(".app-main").getBoundingClientRect().height;
    return carte / zone;
  });
  expect(part).toBeLessThan(0.66);
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LES PASSIONS SONT DES PORTES
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// ③ LES PASSIONS DU PROFIL — UNE SEULE RANGÉE, CELLE DU RAIL
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ ASSERTIONS RETOURNÉES LE 2026-09-02, JAMAIS VIDÉES. Cette section exigeait
// une rangée de pastilles-portes sous le pseudo (demande du 2026-09-01). Le
// lendemain, le rail de passions du profil est devenu lui aussi une rangée de
// pastilles de texte : le profil nommait les mêmes passions DEUX fois, à 5 px
// d'écart. Arbitrage de Benjamin : « on va supprimer les titres de passion dans
// le profil sous le pseudo et garder seulement les bulles dessous. »
//
// Ce que ces tests garantissent maintenant : la ligne NE REVIENT PAS, et tout ce
// que le lot du 2026-09-01 avait acquis (cible tactile de 44 px, deux rangées qui
// ne se chevauchent pas, une passion archivée qui ne fuite pas) est vérifié là où
// les passions vivent désormais — le rail `#v9ProfilePassions`.
// ══════════════════════════════════════════════════════════════════════════

test("③ aucune ligne de passions sous le pseudo — le rail en dessous les porte", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    const carte = document.querySelector("#screen-profiles .main-profile-card");
    const rail = document.getElementById("v9ProfilePassions");
    return {
      ligneIdent: !!document.getElementById("mainProfileIdent"),
      dansLaCarte: carte ? carte.querySelectorAll(".ident-passions, .ident-passion-lien").length : -1,
      pastilles: rail
        ? [...rail.querySelectorAll(".v9-passion-chip[data-passion-tile]")]
            .map((c) => c.getAttribute("data-passion-tile"))
        : [],
    };
  });
  expect(vu.ligneIdent, "la ligne sous le pseudo ne doit pas revenir").toBe(false);
  expect(vu.dansLaCarte, "aucune passion nommée dans la carte d'identité").toBe(0);
  // Elles sont bien quelque part : le rail, avec la porte d'ajout au bout.
  expect(vu.pastilles).toEqual(["pp_moto", "pp_pod", "pp_voy", "__ajouter__"]);
});

test("③ bis — toucher une passion du rail FILTRE, elle ne quitte plus le profil", async ({ page }) => {
  // ⚠️ RETOURNEMENT ASSUMÉ. Ce test exigeait qu'un tap OUVRE la page de la
  // passion ; la seule rangée qui reste est le rail, dont le geste est le
  // filtre. Un tap qui ferait les deux est exclu par construction : une
  // pastille, une destination.
  await poser(page);
  await page.evaluate(() => {
    window.__ouvert = [];
    const vrai = window.openPassionExplorer;
    window.openPassionExplorer = function () { window.__ouvert.push([...arguments]); return vrai.apply(this, arguments); };
  });
  await page.click('#v9ProfilePassions [data-passion-tile="pp_pod"]');
  await page.waitForTimeout(500);
  const vu = await page.evaluate(() => ({
    appels: window.__ouvert,
    filtre: state.user.profilePassionIds,
    modaleOuverte: !!document.querySelector("#modalBackdrop.active"),
  }));
  expect(vu.filtre, "le tap coche la passion").toEqual(["pp_pod"]);
  expect(vu.appels, "et n'ouvre aucune page de passion").toEqual([]);
  expect(vu.modaleOuverte, "on reste sur le profil").toBe(false);
});

test("③ ter — la cible tactile fait 44 px, la pastille visible reste discrète", async ({ page }) => {
  await poser(page);
  const m = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#v9ProfilePassions .v9-passion-chip")];
    // La cible se mesure sur la BOÎTE ; la pilule est peinte par un ::before,
    // qui ne satisferait pas la mesure s'il portait seul la hauteur.
    const boites = chips.map((c) => c.getBoundingClientRect().height);
    const st = getComputedStyle(chips[0], "::before");
    return { min: Math.min(...boites), peinte: st.getPropertyValue("inset-block-start"),
             bord: st.borderTopWidth };
  });
  expect(m.min, "cible tactile d'une passion").toBeGreaterThanOrEqual(44);
  // La pilule est peinte à 7 px des bords de la boîte : 44 - 2 × 7 = 30 px visibles.
  expect(m.peinte).toBe("7px");
  // Et elle se voit : un contour, sans quoi la pastille décochée n'existerait pas.
  expect(parseFloat(m.bord)).toBeGreaterThan(0);
});

test("③ quater — deux rangées de pastilles ne se chevauchent PAS", async ({ page }) => {
  // Six passions : la rangée passe forcément à la ligne en 390 px. Les boîtes
  // font 44 px pour 30 px peints : sans `row-gap`, un tap entre deux lignes
  // atteindrait la pastille du dessous.
  await poser(page, {
    profiles: ["moto", "podcast", "voyage", "cuisine", "musique", "sport"].map((p, i) => ({
      id: "pp_" + p, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  const vu = await page.evaluate(() => {
    const chips = [...document.querySelectorAll("#v9ProfilePassions .v9-passion-chip")];
    const rects = chips.map((c) => c.getBoundingClientRect());
    let chevauche = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) chevauche = true;
      }
    }
    // Le test ne vaut que si la rangée est réellement passée à la ligne.
    const lignes = new Set(rects.map((r) => Math.round(r.top))).size;
    return { chevauche, lignes };
  });
  expect(vu.lignes, "six passions doivent tenir sur au moins deux rangées").toBeGreaterThan(1);
  expect(vu.chevauche, "aucune paire de pastilles ne se recouvre").toBe(false);
});

test("③ quinquies — une passion ARCHIVÉE ne réapparaît pas dans le rail", async ({ page }) => {
  // ⚠️ PORTE DÉROBÉE DÉJÀ FERMÉE UNE FOIS (lot UI-8, ②). Le jsonb
  // `profiles.passions` garde les passions archivées — c'est voulu, la colonne
  // sert de sauvegarde. Aucune surface ne doit les rendre : ranger une passion
  // la ferait sinon réapparaître chez tout le monde.
  await poser(page);
  const vu = await page.evaluate(() => {
    archiverPassion("pp_pod");
    renderMainProfile();
    renderProfilePassionRail();
    return {
      rail: [...document.querySelectorAll("#v9ProfilePassions .v9-passion-chip[data-passion-tile]")]
        .map((c) => c.getAttribute("data-passion-tile")),
      // Et l'identité TEXTE des surfaces denses ne la laisse pas fuir non plus.
      texte: identitePassionsTexte({ id: MY_UID, passions: state.user.profiles }),
    };
  });
  expect(vu.rail).not.toContain("pp_pod");
  expect(vu.rail).toContain("pp_moto");
  expect(vu.texte, "une passion archivée ne s'affiche chez personne").not.toContain("Podcast");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ SUR LE PROFIL D'UN AUTRE — la même règle, et le retour resté disponible
// ══════════════════════════════════════════════════════════════════════════

async function ouvrirProfilVisite(page) {
  await page.evaluate(() => {
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_lea2");
    state.seed.users.push({
      id: "u_lea2", name: "Léa", profileEmoji: "🍳", avatar: "#8b5cf6",
      passion: "cuisine",
      passions: [{ id: "cuisine", emoji: "🍳" }, { id: "jardinage", emoji: "🌱" }],
    });
    window._supaReal = false;
    openUserProfile("u_lea2");
  });
  await page.waitForTimeout(900);
}

test("③ sexies — un profil visité suit la même règle : une seule rangée", async ({ page }) => {
  await poser(page);
  await ouvrirProfilVisite(page);
  // ⚠️ La requête est bornée à la MODALE : mon propre profil est toujours dans
  // le document derrière elle. Un sélecteur global ramasserait les deux et
  // ferait passer ce test pour la mauvaise raison.
  const vu = await page.evaluate(() => ({
    sousLePseudo: document.querySelectorAll(".modal .main-profile-body .ident-passions").length,
    rail: [...document.querySelectorAll(".modal #visitedPassions .v9-passion-chip")]
      .map((c) => c.getAttribute("data-passion-tile")),
  }));
  expect(vu.sousLePseudo, "aucune ligne de passions sous son pseudo").toBe(0);
  expect(vu.rail, "ses passions sont dans le rail, une seule fois").toEqual(["cuisine", "jardinage"]);
});

test("③ septies — le RETOUR de la page de passion reste servi (chemin dormant)", async ({ page }) => {
  // ⚠️ CE TEST GARDE UN CHEMIN SANS APPELANT, ET C'EST DÉLIBÉRÉ. Le second
  // argument d'`openPassionExplorer` peint « ← Retour au profil » ; plus aucune
  // surface ne le passe depuis le retrait des pastilles-portes (2026-09-02). Il
  // est conservé parce que `openModal` N'EMPILE PAS : le jour où une porte vers
  // une page de passion réapparaît dans une modale, l'oublier ferait perdre la
  // personne par qui on l'a découverte, sans aucun chemin de retour. On
  // l'appelle donc directement, au lieu de compter sur une porte disparue.
  await poser(page);
  await ouvrirProfilVisite(page);
  await page.evaluate(() => openPassionExplorer("cuisine", "u_lea2"));
  await page.waitForTimeout(500);
  const surLaPassion = await page.evaluate(() => ({
    retour: !!document.querySelector(".passion-explorer-retour"),
    texte: (document.querySelector(".modal") || {}).innerText || "",
  }));
  expect(surLaPassion.retour, "le lien de retour est là").toBe(true);
  expect(surLaPassion.texte).toContain("Créateurs");

  await page.click(".passion-explorer-retour .link");
  await page.waitForTimeout(900);
  const revenu = await page.evaluate(() =>
    (document.querySelector(".modal") || {}).innerText || "");
  expect(revenu, "on est bien revenu sur le profil de Léa").toContain("Léa");
});

test("③ octies — ouverte depuis un ÉCRAN, la page de passion n'invente pas de retour", async ({ page }) => {
  // Les appels historiques (Explorer, tuiles de tendance, IA, passerelle UI-3)
  // ne passent pas de second argument : ils viennent d'un écran, pas d'une
  // modale, et n'ont rien à restituer. Un lien « Retour au profil » y mentirait.
  await poser(page);
  await page.evaluate(() => openPassionExplorer("voyage"));
  await page.waitForTimeout(400);
  const retour = await page.evaluate(() => !!document.querySelector(".passion-explorer-retour"));
  expect(retour).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════
// LES SURFACES DENSES NE BOUGENT PAS
// ══════════════════════════════════════════════════════════════════════════

test("une carte de publication ne nomme la passion QU'UNE FOIS", async ({ page }) => {
  // ⚠️ ASSERTION RETOURNÉE LE 2026-09-02, jamais vidée. Ce test exigeait la
  // ligne d'identité sur la carte, en TEXTE inerte ; Benjamin l'a fait retirer
  // après essai réel : « sur un post dans le fil tu écris deux fois la passion
  // concernée, je veux qu'il n'y en ait qu'une, celle avec l'heure du post. »
  // Les deux lignes se suivaient et, sur un compte mono-passion, répétaient
  // littéralement le même mot.
  //
  // Ce qui reste garanti, et c'est le vrai périmètre : la carte nomme la passion
  // DE LA PUBLICATION, une seule fois, à côté de l'heure — et aucune pastille
  // cliquable n'y apparaît (une carte a déjà son geste ; un bouton imbriqué y
  // donnerait deux destinations pour un tap).
  await poser(page);
  const vu = await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML({
      id: "p_x", authorId: "me", passion: "moto", type: "text", text: "Coucou",
      mood: "all", createdAt: Date.now(), likes: 0, comments: [], _source: "me",
    });
    const meta = box.querySelector(".post-author-meta");
    return {
      lignesIdentite: box.querySelectorAll(".ident-passions").length,
      meta: meta ? meta.textContent.trim() : "",
      boutons: box.querySelectorAll(".ident-passion-lien").length,
    };
  });
  expect(vu.lignesIdentite, "plus de ligne d'identité sur une carte du fil").toBe(0);
  expect(vu.meta, "la seule mention de la passion est celle de la publication").toContain("Moto");
  expect(vu.boutons, "aucune pastille cliquable dans une carte de publication").toBe(0);
});
