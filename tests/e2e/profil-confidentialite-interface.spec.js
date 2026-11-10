// LE CONTRÔLE DE CONFIDENTIALITÉ, EXERCÉ PAR L'INTERFACE  (2026-08-31)
//
// Les tests d'API prouvent que `supaSavePublicProfile` refuse d'écrire
// `is_private` sans preuve de choix. Ils ne prouvent PAS que l'écran permet de
// donner cette preuve — et c'est là qu'un défaut d'interface se cache.
//
// LE DÉFAUT QUE CETTE SUITE FERME. `openEditMainProfile` rendait la case depuis
// l'état LOCAL (`g.isPrivate`), et l'application ne relisait JAMAIS `is_private`
// depuis le serveur : aucune de ses requêtes `profiles` ne sélectionnait cette
// colonne. Depuis que `ensure` crée une ligne PRIVÉE, un appareil neuf affichait
// donc une case DÉCOCHÉE sur un compte privé — mensonge à l'écran — et rendre le
// compte réellement public aurait demandé DEUX allers-retours (cocher,
// enregistrer, décocher, enregistrer) au lieu d'un seul geste.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, ligneServeur = null) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((serveur) => {
    window.__rows = [];
    window.__updates = [];
    window.__selects = [];
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supabase = {
      createClient: () => ({
        from: () => ({
          insert: async (row) => {
            if (window.__rows.some((r) => r.id === row.id)) {
              return { error: { code: "23505",
                message: 'duplicate key value violates unique constraint "profiles_pkey"',
                details: 'Key (id)=(' + row.id + ') already exists.' } };
            }
            window.__rows.push(JSON.parse(JSON.stringify(row)));
            return { error: null };
          },
          update: (corps) => {
            const q = { eq: () => q, select: async () => {
              window.__updates.push(JSON.parse(JSON.stringify(corps)));
              // Refus du serveur, à la demande d'un cas (ETAT-03, 2026-11-10).
              if (window.__updateRefus) return { data: null, error: { code: "42501", message: "refus du banc" } };
              const cible = window.__rows.find((r) => r.id === window.__uid);
              if (!cible) return { data: [], error: null };
              Object.assign(cible, JSON.parse(JSON.stringify(corps)));
              return { data: [{ id: cible.id }], error: null };
            } };
            return q;
          },
          // La lecture d'hydratation : elle DOIT servir la valeur serveur.
          select: (cols) => {
            window.__selects.push(String(cols || ""));
            return { eq: () => ({ maybeSingle: async () => {
              // Lecture d'hydratation en panne, à la demande d'un cas (ETAT-03, 2026-11-10).
              if (window.__selectRefus) return { data: null, error: { message: "réseau du banc" } };
              const l = window.__rows.find((r) => r.id === window.__uid);
              return { data: l ? { is_private: !!l.is_private } : null, error: null };
            } }) };
          },
          upsert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        }),
      }),
    };
    // ⚠️ `_initRealSupa` sort sur `if (window._supaReal) return true;` — poser le
    // drapeau AVANT l'appel empêche l'installation du faux SDK, et tout se met à
    // « passer » par panne silencieuse plutôt que par garde. On l'arme donc à
    // `false` pour laisser l'injection se faire, puis à `true` parce que
    // `supaHydraterConfidentialite` l'exige.
    window._supaReal = false;
    _initRealSupa();
    window._supaReal = true;
    window.__uid = MY_UID;
    // ⚠️ `saveMainProfile` vérifie l'unicité du pseudo AVANT d'enregistrer et
    // SORT si le pseudo est pris. Sans ce stub, le test n'exercerait jamais
    // l'écriture — il « passerait » sans rien prouver.
    window.supaUsernameTaken = async () => null;
    if (serveur) window.__rows.push(Object.assign({}, serveur, { id: MY_UID }));
    if (typeof _resetProfilAssure === "function") _resetProfilAssure();
  }, ligneServeur);
}

const laLigne = (page) => page.evaluate(() => window.__rows.find((r) => r.id === window.__uid) || null);

test("le parcours complet : ligne créée privée → l'écran le reflète → un seul décochage → public en base", async ({ page }) => {
  // ── ① aucune ligne profiles, ② état local incomplet ────────────────────
  await boot(page, null);
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "moto", emoji: "🏍", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = { username: "Benjamin" };   // ni bio, ni isPrivate, ni privacyChoisi
    saveState();
  });

  // ── ③ `ensure` crée une ligne PRIVÉE ───────────────────────────────────
  await page.evaluate(() => supaEnsureProfileExists());
  let ligne = await laLigne(page);
  expect(ligne, "la ligne doit exister").not.toBeNull();
  expect(ligne.is_private, "créée privée, faute de choix prouvé").toBe(true);

  // ── ④ ouverture de l'écran Profil ──────────────────────────────────────
  await page.evaluate(() => openEditMainProfile());
  await page.waitForTimeout(500);              // laisse l'hydratation répondre

  // ── ⑤ le contrôle doit refléter l'état SERVEUR ─────────────────────────
  const vuOuverture = await page.evaluate(() => ({
    coche: !!document.getElementById("editIsPrivate")?.checked,
    localApres: state.user.general.isPrivate,
    aLuLaColonne: window.__selects.some((c) => c.indexOf("is_private") >= 0),
    touche: window._privacyTouched,
  }));
  expect(vuOuverture.aLuLaColonne, "l'écran interroge réellement le serveur").toBe(true);
  // ⚠️ LE point : sans hydratation, la case serait décochée sur un compte privé.
  expect(vuOuverture.coche, "la case reflète l'état serveur, pas l'état local vide").toBe(true);
  expect(vuOuverture.localApres, "et l'état local a convergé").toBe(true);
  expect(vuOuverture.touche, "aucune interaction pour l'instant").toBe(false);

  // ── ⑥ l'utilisateur décoche UNE SEULE FOIS ─────────────────────────────
  await page.evaluate(() => {
    const el = document.getElementById("editIsPrivate");
    el.checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));   // vrai geste
  });

  // ── ⑦ il enregistre ────────────────────────────────────────────────────
  await page.evaluate(() => saveMainProfile());
  await page.waitForTimeout(600);

  // ── ⑧ `privacyChoisi` devient vrai · ⑨ `is_private` passe à false en base ─
  const fin = await page.evaluate(() => ({
    choisi: state.user.general.privacyChoisi,
    ligne: window.__rows.find((r) => r.id === window.__uid),
    updates: window.__updates,
  }));
  expect(fin.choisi, "le geste sur le contrôle est la preuve").toBe(true);
  expect(fin.ligne.is_private, "UN SEUL geste suffit à rendre le compte public").toBe(false);
  expect(fin.updates.some((u) => "is_private" in u), "`is_private` est bien parti").toBe(true);
});

test("complémentaire : la bio seule est modifiée, le contrôle n'est pas touché → reste privé", async ({ page }) => {
  await boot(page, null);
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "moto", emoji: "🏍", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = { username: "Benjamin" };
    saveState();
  });
  await page.evaluate(() => supaEnsureProfileExists());

  await page.evaluate(() => openEditMainProfile());
  await page.waitForTimeout(500);

  // La personne écrit sa bio, et ne touche PAS au contrôle.
  await page.evaluate(() => {
    const b = document.getElementById("editBio");
    b.value = "Motard du dimanche";
    b.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => saveMainProfile());
  await page.waitForTimeout(600);

  const fin = await page.evaluate(() => ({
    choisi: state.user.general.privacyChoisi,
    ligne: window.__rows.find((r) => r.id === window.__uid),
    updates: window.__updates,
  }));
  expect(fin.ligne.bio, "la bio est bien enregistrée").toBe("Motard du dimanche");
  expect(fin.choisi, "aucun geste sur le contrôle : aucune preuve").toBe(undefined);
  expect(fin.ligne.is_private, "le compte reste privé").toBe(true);
  expect(fin.updates.some((u) => "is_private" in u), "`is_private` n'est même pas envoyé").toBe(false);
});

test("la preuve vient du GESTE, pas de la valeur finale", async ({ page }) => {
  // ⚠️ Le cœur de l'arbitrage. Deux situations donnent la MÊME valeur finale
  // (case décochée) et n'autorisent PAS la même écriture : « j'ai décoché » et
  // « je n'y ai pas touché ». Déduire le choix de la valeur au moment de la
  // soumission confondrait les deux.
  await boot(page, { username: "Benjamin", is_private: true });
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "moto", emoji: "🏍", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = { username: "Benjamin" };
    saveState();
  });

  await page.evaluate(() => openEditMainProfile());
  await page.waitForTimeout(500);

  // On force la case à `false` SANS émettre d'événement : la valeur finale sera
  // identique à celle d'un vrai décochage, mais aucun geste n'a eu lieu.
  const vu = await page.evaluate(async () => {
    document.getElementById("editIsPrivate").checked = false;
    const toucheAvant = window._privacyTouched;
    await saveMainProfile();
    return {
      toucheAvant,
      choisi: state.user.general.privacyChoisi,
      ligne: window.__rows.find((r) => r.id === window.__uid),
      updates: window.__updates,
    };
  });
  await page.waitForTimeout(400);

  expect(vu.toucheAvant, "aucun `change` n'a été émis").toBe(false);
  expect(vu.choisi, "donc aucune preuve de choix").toBe(undefined);
  expect(vu.ligne.is_private, "et le compte reste privé, malgré la case décochée").toBe(true);
  // ⚠️ PRÉMISSE VÉRIFIÉE. Sans elle, ce test resterait vert sur un SDK en panne :
  // `is_private` serait resté `true` faute d'écriture, pas grâce au garde.
  // On exige donc qu'une écriture ait bien eu lieu, et qu'elle ait porté sur
  // les autres champs SANS emporter `is_private`.
  expect(vu.updates.length, "le chemin d'écriture a bien été exercé").toBeGreaterThan(0);
  expect(vu.updates.some((u) => "is_private" in u), "`is_private` n'y figure pas").toBe(false);
  expect(vu.updates.some((u) => "username" in u || "bio" in u), "mais les champs édités, oui").toBe(true);
});

// ═════════════════════════════════════════════════════════════════════
// ETAT-03 (audit de stabilisation du 2026-11-10) — CE QUI EST ANNONCÉ EST CE QUI EST GARDÉ
//
// ① `saveMainProfile` jetait le verdict de `supaSavePublicProfile` et disait toujours
//    « Profil mis à jour » : hors ligne, ou sur un refus, la personne se croyait passée
//    en compte privé alors que sa ligne restait publique.
// ② `privacyChoisi`, une fois posé, vaut pour TOUS les enregistrements suivants, sur tous
//    les appareils (il voyage par `user_state`) : `is_private` repartait avec la valeur
//    affichée par la case, même sans geste — et si la lecture d'hydratation était lente
//    ou en panne, cette valeur était celle de l'état LOCAL, périmé. Un compte rendu privé
//    ailleurs redevenait public en enregistrant une bio.
// La preuve d'un choix est le geste de CETTE ouverture (`_privacyTouched`), pas un
// marqueur hérité.
// ═════════════════════════════════════════════════════════════════════
test("ETAT-03 ① un refus du serveur ne dit pas « Profil mis à jour », rend l'état d'avant et garde l'écran ouvert", async ({ page }) => {
  // Un COMPTE réel (identifiant de la forme d'un uuid) : pour un visiteur, le refus serveur
  // attendu (aucune ligne) n'est pas un échec — son profil vit sur l'appareil.
  await page.addInitScript(() => { try { localStorage.setItem("passio_uid", "7a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b"); } catch (e) {} });
  await boot(page, { username: "Benjamin", is_private: false });
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "moto", emoji: "🏍", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = { username: "Benjamin", isPrivate: false, privacyChoisi: true };
    saveState();
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
  });
  await page.evaluate(() => openEditMainProfile());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = document.getElementById("editIsPrivate");
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    window.__updateRefus = true;
  });
  await page.evaluate(() => saveMainProfile());
  await page.waitForTimeout(400);
  const fin = await page.evaluate(() => ({
    toasts: window.__toasts.slice(),
    prive: state.user.general.isPrivate,
    ouvert: !!document.getElementById("editIsPrivate"),
    ligne: window.__rows.find((r) => r.id === window.__uid),
  }));
  expect(fin.toasts, "aucun succès annoncé sur un refus").not.toContain("Profil mis à jour");
  expect(fin.toasts.some((t) => /non enregistr/i.test(t)), "toasts : " + JSON.stringify(fin.toasts)).toBe(true);
  expect(fin.prive, "l'état local revient à ce que la base a gardé").toBe(false);
  expect(fin.ligne.is_private).toBe(false);
  expect(fin.ouvert, "l'écran reste ouvert : rien n'est perdu de la saisie").toBe(true);
});

test("ETAT-03 ② un marqueur hérité ne fait pas repartir `is_private` sans geste — même quand la relecture serveur est en panne", async ({ page }) => {
  // La base dit PRIVÉ (rendu privé sur un autre appareil) ; l'état local, périmé, dit public.
  await boot(page, { username: "Benjamin", is_private: true });
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "moto", emoji: "🏍", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = { username: "Benjamin", isPrivate: false, privacyChoisi: true };
    saveState();
    window.__selectRefus = true;
  });
  await page.evaluate(() => openEditMainProfile());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = document.getElementById("editBio");
    b.value = "Nouvelle bio";
    b.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => saveMainProfile());
  await page.waitForTimeout(400);
  const fin = await page.evaluate(() => ({ updates: window.__updates, ligne: window.__rows.find((r) => r.id === window.__uid) }));
  expect(fin.updates.some((u) => "is_private" in u), "aucun geste sur le contrôle : `is_private` ne part pas").toBe(false);
  expect(fin.ligne.is_private, "le compte reste privé").toBe(true);
  expect(fin.ligne.bio, "la bio, elle, est bien enregistrée").toBe("Nouvelle bio");
});
