// L'invitation : « Léa t'invite », et Léa suivie à l'inscription (2026-10-04).
//
// Mesuré en production : 10 comptes, aucun créé dans la semaine, et un lien
// partagé qui arrivait ANONYME — rien ne disait qui l'avait envoyé, et le compte
// créé au bout repartait sans un seul abonnement. Ce que cette suite prouve :
//   ① un lien partagé par un VRAI compte porte `inv=<son uuid>` (formes courte
//      et en hash), jamais celui d'un compte de démonstration, et la coupure
//      l'éteint ;
//   ② un visiteur arrivé par ce lien mémorise l'invitation, le paramètre quitte
//      la barre d'adresse, et un toast nomme l'invitant — touché, il ouvre la
//      création de compte, qui ANNONCE l'abonnement à venir ;
//   ③ `signUp` emporte l'invitation dans `user_metadata` (elle voyage avec le
//      compte), et rien quand il n'y en a pas ;
//   ④ au premier démarrage du compte, l'invitant ANNONCÉ à l'inscription est
//      suivi UNE fois — demande en attente vers un compte privé ; une invitation
//      de l'appareil seul est PROPOSÉE, jamais imposée ; rien pour un compte
//      existant, soi-même, un compte bloqué ou introuvable, ni avant que l'état
//      du compte ait parlé ;
//   ⑤ le CÂBLAGE : `boot` applique, `switchAuthTab` peint la ligne.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");
const { bootVisiteur, GATE_TOKEN, GATE_KEY } = require("./first-run-helper");

const INVITANT = "14c697ac-7958-41ea-8e23-8c00b4784a47";
const MOI = "9d3f1c2a-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

// Corps d'une fonction déclarée `function nom(` / `async function nom(`, jusqu'à
// son accolade fermante — jamais une tranche de taille fixe.
function corps(source, nom) {
  const i = source.search(new RegExp("(?:async\\s+)?function\\s+" + nom + "\\s*\\("));
  if (i < 0) throw new Error("fonction introuvable : " + nom);
  let j = source.indexOf("{", i), n = 0;
  for (let k = j; k < source.length; k++) {
    if (source[k] === "{") n++;
    else if (source[k] === "}") { n--; if (n === 0) return source.slice(i, k + 1); }
  }
  throw new Error("accolade fermante introuvable : " + nom);
}

// Le banc d'application : faux suivi, faux lecteur de profil, tout espionné.
async function bancApplication(page, { suivi = { ok: true, status: "accepted" }, auteur = { nom: "Léa" } } = {}) {
  await bootOnboarded(page);
  await page.evaluate(([s, a]) => {
    window.__suivis = [];
    window.supaFollowUser = async (uid) => { window.__suivis.push(uid); return s; };
    window._invitationLireAuteur = async () => a;
    window.__telCap = [];
    window.tel = window.tel || {};
    window.tel.action = (name, meta) => { window.__telCap.push({ name, meta }); };
    state.user.following = [];
    state.user.followingPending = [];
    delete state.user.invitationTraitee;
    delete state.user.invitationEssais;
  }, [suivi, auteur]);
}

const sessionNeuve = (meta) => ({
  user: { id: MOI, created_at: new Date().toISOString(), user_metadata: meta || {} },
});

test.describe("Invitation — le lien porte l'invitant", () => {
  test("① un vrai compte signe ses liens ; une démonstration et la coupure, non", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(([moi]) => {
      const avant = MY_UID;
      MY_UID = moi;
      const out = {
        hash: lienPartageDe("event", "ev1"),
        court: lienPartageDe("post", "pa1", "passio-app.netlify.app"),
        profil: lienPartageDe("user", moi, "passio-app.netlify.app"),
        suivi: tel.tagUrl(lienPartageDe("post", "pa1", "passio-app.netlify.app"), "lnk_1"),
      };
      localStorage.setItem("passio_invitations_v1", "0");
      out.coupe = lienPartageDe("post", "pa1", "passio-app.netlify.app");
      localStorage.removeItem("passio_invitations_v1");
      MY_UID = "u_demo";
      out.demo = lienPartageDe("post", "pa1", "passio-app.netlify.app");
      MY_UID = avant;
      return out;
    }, [MOI]);
    expect(r.hash).toMatch(new RegExp("\\?inv=" + MOI + "#irl-event-ev1$"));
    expect(r.court).toMatch(new RegExp("/p/pa1\\?inv=" + MOI + "$"));
    expect(r.profil).toMatch(new RegExp("/u/" + MOI + "\\?inv=" + MOI + "$"));
    // Le suivi de partage s'AJOUTE à l'invitation, il ne la remplace pas.
    expect(new URL(r.suivi).searchParams.get("inv")).toBe(MOI);
    expect(new URL(r.suivi).searchParams.get("plk")).toBe("lnk_1");
    expect(r.coupe).toMatch(/\/p\/pa1$/);
    expect(r.demo).toMatch(/\/p\/pa1$/);
  });
});

test.describe("Invitation — l'arrivée d'un visiteur", () => {
  test("② l'invitation est mémorisée, l'URL nettoyée, l'invitant nommé, l'inscription annoncée", async ({ page }) => {
    await bootVisiteur(page, { query: "?inv=" + INVITANT.toUpperCase(), sansBienvenue: true });
    const avant = await page.evaluate(() => ({
      inv: JSON.parse(localStorage.getItem("passio_invitation_v1") || "null"),
      url: location.search,
    }));
    expect(avant.inv && avant.inv.de).toBe(INVITANT);
    expect(avant.url).not.toContain("inv=");
    await page.evaluate(() => {
      window.__telCap = [];
      window.tel.action = (name) => { window.__telCap.push(name); };
      window._invitationLireAuteur = async () => ({ nom: "Léa" });
      accueillirInvitation();
    });
    const t = page.locator("#toastStack .toast", { hasText: "Léa t'invite sur PASSIO" });
    await expect(t).toHaveCount(1);
    expect(await page.evaluate(() => window.__telCap)).toContain("invitation_accueil");
    // Une seule fois : un second passage ne renomme personne.
    await page.evaluate(() => accueillirInvitation());
    await page.waitForTimeout(300);
    await expect(page.locator("#toastStack .toast", { hasText: "t'invite sur PASSIO" })).toHaveCount(1);

    // Touché, le toast ouvre la CRÉATION de compte, qui annonce l'abonnement.
    await t.click();
    await expect(page.locator("#onboarding")).toHaveClass(/active/);
    await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
    const ligne = page.locator("#authInvite");
    await expect(ligne).toBeVisible();
    await expect(ligne).toContainText("Léa t'invite sur PASSIO");
    await expect(ligne).toContainText("tu suivras automatiquement Léa");
    // En connexion, il n'y a rien à annoncer. (Par la fonction de l'onglet : le
    // bouton « ← Continuer à explorer » recouvre la rangée d'onglets au banc.)
    await page.evaluate(() => switchAuthTab("signin"));
    await expect(ligne).toBeHidden();
  });

  test("② bis un `inv` hors forme n'est pas mémorisé, mais quitte quand même l'URL", async ({ page }) => {
    await bootVisiteur(page, { query: "?inv=u_lea" });
    const r = await page.evaluate(() => ({
      inv: localStorage.getItem("passio_invitation_v1"), url: location.search,
    }));
    expect(r).toEqual({ inv: null, url: "" });
  });

  test("② ter un appareil qui porte déjà un compte n'est pas un invité", async ({ page }) => {
    await page.addInitScript((moi) => { localStorage.setItem("passio_uid", moi); }, MOI);
    await bootVisiteur(page, { query: "?inv=" + INVITANT });
    expect(await page.evaluate(() => localStorage.getItem("passio_invitation_v1"))).toBeNull();
  });

  test("② quater la coupure : rien de mémorisé", async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem("passio_invitations_v1", "0"); });
    await bootVisiteur(page, { query: "?inv=" + INVITANT });
    const r = await page.evaluate(() => ({ inv: localStorage.getItem("passio_invitation_v1"), url: location.search }));
    expect(r).toEqual({ inv: null, url: "" });
  });
});

test.describe("Invitation — l'inscription l'emporte", () => {
  async function ouvrirCreation(page, invitation) {
    await page.addInitScript(([k, t, inv]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      // Formulaire historique depuis un appareil vierge (convention du projet).
      localStorage.setItem("passio_first_run_experience_v1", "0");
      if (inv) localStorage.setItem("passio_invitation_v1", JSON.stringify(inv));
    }, [GATE_KEY, GATE_TOKEN, invitation]);
    await sansDonneesDistantes(page);
    await page.goto("/index.html");
    await page.waitForSelector("#landing.active", { timeout: 25000 });
    await page.getByRole("button", { name: "Créer un compte" }).first().click();
    await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
      null, { timeout: 25000 });
    await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
    await page.evaluate(() => {
      window.__auth = { signUp: [] };
      supa.auth.signUp = async (args) => {
        window.__auth.signUp.push(args);
        return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
      };
    });
    await page.locator("#authName").fill("Sam");
    await page.locator("#authEmail").fill("sam@exemple.com");
    await page.locator("#authPassword").fill("motdepasse123");
    await page.locator("#authPasswordConfirm").fill("motdepasse123");
    await page.locator("#authConsent").click();
  }

  test("③ `signUp` emporte l'invitant dans user_metadata", async ({ page }) => {
    await ouvrirCreation(page, { de: INVITANT, at: Date.now(), nom: "Léa", accueillie: true });
    await expect(page.locator("#authInvite")).toContainText("tu suivras automatiquement Léa");
    await page.locator("#authSubmitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
    const d = await page.evaluate(() => window.__auth.signUp[0].options.data);
    expect(d.invite_de).toBe(INVITANT);
    expect(d.name).toBe("Sam");
  });

  test("③ ter invitant jamais nommé : pas d'annonce, donc rien ne part", async ({ page }) => {
    await ouvrirCreation(page, { de: INVITANT, at: Date.now() });
    await expect(page.locator("#authInvite")).toBeHidden();
    await page.locator("#authSubmitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
    const d = await page.evaluate(() => window.__auth.signUp[0].options.data);
    expect("invite_de" in d).toBe(false);
  });

  test("③ quater « Ne pas suivre » retire l'annonce ET l'invitation", async ({ page }) => {
    await ouvrirCreation(page, { de: INVITANT, at: Date.now(), nom: "Léa", accueillie: true });
    await page.locator("#authInviteNon").click();
    await expect(page.locator("#authInvite")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("passio_invitation_v1"))).toBeNull();
    await page.locator("#authSubmitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
    const d = await page.evaluate(() => window.__auth.signUp[0].options.data);
    expect("invite_de" in d).toBe(false);
  });

  test("③ bis sans invitation, ni ligne ni clé", async ({ page }) => {
    await ouvrirCreation(page, null);
    await expect(page.locator("#authInvite")).toBeHidden();
    await page.locator("#authSubmitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
    const d = await page.evaluate(() => window.__auth.signUp[0].options.data);
    expect("invite_de" in d).toBe(false);
  });
});

test.describe("Invitation — le compte neuf suit son invitant", () => {
  test("④ métadonnée : suivi une fois, annoncé, puis plus jamais", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async ([inv, s]) => {
      const v1 = await appliquerInvitation(s);
      const v2 = await appliquerInvitation(s);
      return { v1, v2, suivis: window.__suivis, following: state.user.following.slice(),
        trace: state.user.invitationTraitee && state.user.invitationTraitee.verdict,
        tel: window.__telCap.map((e) => e.name) };
    }, [INVITANT, sessionNeuve({ invite_de: INVITANT })]);
    expect(r.v1).toBe("suivi");
    expect(r.v2).toBe("deja");
    expect(r.suivis).toEqual([INVITANT]);
    expect(r.following).toEqual([INVITANT]);
    expect(r.trace).toBe("suivi");
    expect(r.tel).toContain("invitation_suivie");
    await expect(page.locator("#toastStack .toast", { hasText: "Tu suis maintenant Léa" })).toHaveCount(1);
  });

  test("④ bis compte privé : la demande est en attente, pas un abonnement", async ({ page }) => {
    await bancApplication(page, { suivi: { ok: true, status: "pending" } });
    const r = await page.evaluate(async (s) => ({
      v: await appliquerInvitation(s), pending: state.user.followingPending.slice(), following: state.user.following.slice(),
    }), sessionNeuve({ invite_de: INVITANT }));
    expect(r).toEqual({ v: "demande", pending: [INVITANT], following: [] });
  });

  test("④ ter invitation de l'APPAREIL : on DEMANDE au compte neuf, jamais au compte existant", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async ([inv, moi]) => {
      localStorage.setItem("passio_invitation_v1", JSON.stringify({ de: inv, at: Date.now() - 60000 }));
      const ancien = await appliquerInvitation({ user: { id: moi, created_at: "2026-01-01T00:00:00Z", user_metadata: {} } });
      const resteApresAncien = localStorage.getItem("passio_invitation_v1");
      localStorage.setItem("passio_invitation_v1", JSON.stringify({ de: inv, at: Date.now() - 60000 }));
      const neuf = await appliquerInvitation({ user: { id: moi, created_at: new Date().toISOString(), user_metadata: {} } });
      return { ancien, resteApresAncien, neuf, suivisAvant: window.__suivis.length,
        trace: state.user.invitationTraitee && state.user.invitationTraitee.verdict };
    }, [INVITANT, MOI]);
    expect(r.ancien).toBe("compte_existant");
    expect(r.resteApresAncien).toBeNull();
    // Personne n'est suivi d'office : la question est posée, une seule fois.
    expect(r.neuf).toBe("proposee");
    expect(r.suivisAvant).toBe(0);
    expect(r.trace).toBe("proposee");
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Invitation de Léa");
    await page.locator("#_invSuivre").click();
    await expect.poll(() => page.evaluate(() => window.__suivis.slice())).toEqual([INVITANT]);
    const apres = await page.evaluate(async (s) => ({
      following: state.user.following.slice(),
      trace: state.user.invitationTraitee.verdict,
      tel: window.__telCap.filter((e) => e.name === "invitation_suivie").map((e) => e.meta),
      encore: await appliquerInvitation(s),
    }), { user: { id: MOI, created_at: new Date().toISOString(), user_metadata: {} } });
    expect(apres.following).toEqual([INVITANT]);
    expect(apres.trace).toBe("suivi");
    expect(apres.tel).toEqual([{ verdict: "suivi", source: "appareil" }]);
    expect(apres.encore).toBe("aucune");
    await expect(page.locator("#toastStack .toast", { hasText: "Tu suis maintenant Léa" })).toHaveCount(1);
  });

  test("④ ter bis « Plus tard » ne suit personne, et la question n'est pas reposée", async ({ page }) => {
    await bancApplication(page);
    const s = { user: { id: MOI, created_at: new Date().toISOString(), user_metadata: {} } };
    await page.evaluate(async ([inv, s]) => {
      localStorage.setItem("passio_invitation_v1", JSON.stringify({ de: inv, at: Date.now() - 60000 }));
      await appliquerInvitation(s);
    }, [INVITANT, s]);
    await page.locator("#_invPlusTard").click();
    const r = await page.evaluate(async ([inv, s]) => {
      localStorage.setItem("passio_invitation_v1", JSON.stringify({ de: inv, at: Date.now() - 60000 }));
      return { encore: await appliquerInvitation(s), suivis: window.__suivis.length,
        ouvert: !!document.querySelector("#modalBackdrop.active") };
    }, [INVITANT, s]);
    expect(r).toEqual({ encore: "deja", suivis: 0, ouvert: false });
  });

  test("④ ter ter une fenêtre déjà ouverte n'est jamais remplacée : on reposera plus tard", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async ([inv, moi]) => {
      openModal('<div class="modal-title" id="_autre">Autre chose</div>');
      localStorage.setItem("passio_invitation_v1", JSON.stringify({ de: inv, at: Date.now() - 60000 }));
      const v = await appliquerInvitation({ user: { id: moi, created_at: new Date().toISOString(), user_metadata: {} } });
      return { v, autre: !!document.getElementById("_autre"), trace: state.user.invitationTraitee || null,
        reste: !!localStorage.getItem("passio_invitation_v1") };
    }, [INVITANT, MOI]);
    expect(r).toEqual({ v: "attente", autre: true, trace: null, reste: true });
  });

  test("④ quater soi-même, bloqué, introuvable, déjà suivi : personne n'est suivi", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async ([inv, moi]) => {
      const out = {};
      out.soi = await appliquerInvitation({ user: { id: moi, created_at: new Date().toISOString(), user_metadata: { invite_de: moi } } });
      const neuve = { user: { id: moi, created_at: new Date().toISOString(), user_metadata: { invite_de: inv } } };
      state.user.blocked = [inv];
      out.bloque = await appliquerInvitation(neuve);
      state.user.blocked = [];
      delete state.user.invitationTraitee;
      window._invitationLireAuteur = async () => ({ absent: true });
      out.absent = await appliquerInvitation(neuve);
      delete state.user.invitationTraitee;
      window._invitationLireAuteur = async () => ({ nom: "Léa" });
      state.user.following = [inv];
      out.dejaSuivi = await appliquerInvitation(neuve);
      out.suivis = window.__suivis.slice();
      return out;
    }, [INVITANT, MOI]);
    expect(r).toEqual({ soi: "soi", bloque: "bloque", absent: "absent", dejaSuivi: "deja_suivi", suivis: [] });
  });

  test("④ quinquies tant que l'état du compte n'a pas parlé, on s'abstient (et on retentera)", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async (s) => {
      window._peutPousserEtat = () => false;
      const v = await appliquerInvitation(s);
      return { v, suivis: window.__suivis.slice(), trace: state.user.invitationTraitee || null };
    }, sessionNeuve({ invite_de: INVITANT }));
    expect(r).toEqual({ v: "attente", suivis: [], trace: null });
  });

  test("④ sexies un refus est retenté, puis abandonné au troisième — jamais en boucle", async ({ page }) => {
    await bancApplication(page, { suivi: { ok: false, status: null } });
    const r = await page.evaluate(async (s) => {
      const v = [];
      for (let i = 0; i < 4; i++) v.push(await appliquerInvitation(s));
      return { v, suivis: window.__suivis.length, trace: state.user.invitationTraitee.verdict };
    }, sessionNeuve({ invite_de: INVITANT }));
    expect(r).toEqual({ v: ["echec", "echec", "echec", "deja"], suivis: 3, trace: "echec" });
  });

  test("④ septies la coupure : rien n'est appliqué", async ({ page }) => {
    await bancApplication(page);
    const r = await page.evaluate(async (s) => {
      window.PASSIO_INVITATIONS = false;
      return { v: await appliquerInvitation(s), suivis: window.__suivis.length };
    }, sessionNeuve({ invite_de: INVITANT }));
    expect(r).toEqual({ v: "coupee", suivis: 0 });
  });
});

test.describe("Invitation — le câblage", () => {
  test("⑤ boot applique l'invitation APRÈS l'hydratation, switchAuthTab peint la ligne", () => {
    const app08 = lire("js/app-08-ui-modals-tour.js");
    const boot = corps(app08, "boot");
    const iCharge = boot.indexOf("supaLoadUserState()");
    const iInit = boot.indexOf("supaInit()", iCharge);
    const iApplique = boot.indexOf("appliquerInvitation(session)");
    expect(iCharge).toBeGreaterThan(0);
    expect(iApplique).toBeGreaterThan(iInit);
    expect(iInit).toBeGreaterThan(iCharge);
    const app02 = lire("js/app-02-state-utils.js");
    expect(corps(app02, "switchAuthTab")).toContain("majInvitationAuth(mode)");
    expect(corps(app02, "onbDoAuth")).toContain("invitationPourInscription()");
    // Compte créé AVEC une session : l'onboarding continue sans redémarrage.
    expect(corps(app02, "onbFinish")).toContain("appliquerInvitation(s)");
    // L'invitation est une clé d'APPAREIL : la purge d'adoption ne doit pas l'emporter.
    const cles = app02.slice(app02.indexOf("var ACCOUNT_SCOPED_KEYS"), app02.indexOf("];", app02.indexOf("var ACCOUNT_SCOPED_KEYS")));
    expect(cles).not.toContain("passio_invitation_v1");
  });
});
