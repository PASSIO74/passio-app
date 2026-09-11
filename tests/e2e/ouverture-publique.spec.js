// ═══════════════════════════════════════════════════════════════════════════
// OUVERTURE PUBLIQUE (2026-09-11) — le lot CLIENT de la migration
// `migration_ouverture_publique_2026-09-11.sql`, dont le banc SQL éprouve le serveur.
//
// Ce que ces cas verrouillent :
//   ① le rideau (code d'accès) est LEVÉ par défaut, et ne s'arme que sur adhésion ;
//   ② les bibliothèques sont AUTO-HÉBERGÉES (plus aucun CDN de scripts, ni dans
//      les loaders, ni dans la CSP) et présentes dans le dépôt ;
//   ③ `events.conv_id` n'est plus demandé par un visiteur (sinon PostgREST refuse
//      la requête ENTIÈRE et plus aucune rencontre ne s'affiche) ;
//   ④ pièces jointes : `cdnUrl` les laisse intactes, `pieceJointeChemin` reconnaît
//      les deux formes d'URL, `attrMediaSrc` pose `data-pj` sans `src`, et
//      `signerPiecesJointes` pose l'URL SIGNÉE — ou replie sur l'URL d'origine ;
//   ⑤ le CÂBLAGE : le rendu du fil de conversation appelle bien le signeur après
//      son innerHTML (un verrou qui n'appellerait que la fonction resterait vert si
//      l'appel disparaissait — défaut vécu sur `_notifierMessage`) ;
//   ⑥ canaux Realtime : `_callChannel` crée des canaux PRIVÉS, replie sur public
//      quand la sonde a mesuré un refus de policy, et seul un refus de POLICY
//      fait replier ;
//   ⑦ compte privé : le bouton « Suivre » a trois états, un verdict 'pending' du
//      serveur CORRIGE l'affichage optimiste, et la demande se tranche depuis la
//      notification (boutons, puis verdict écrit) ;
//   ⑧ la politique de confidentialité dit ce que la base fait (7 j / 30 j), et sa
//      version suit le texte.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");
const { poserGateSansPremiereVisite } = require("./gate-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const PJ_SUPA = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/attachments/attachments/conv_x9/1787_photo.jpg";
const PJ_CDN = "https://passio-app.netlify.app/media/attachments/attachments/conv_x9/1787_voice.webm";
const CONTENU = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u1/x.jpg";

test.describe("① le rideau est levé", () => {
  test("sans adhésion, aucun gate : l'application s'ouvre directement", async ({ page }) => {
    await sansDonneesDistantes(page);
    await page.addInitScript(() => localStorage.setItem("passio_first_run_experience_v1", "0"));
    await page.goto("/index.html");
    await expect(page.locator("#passioGate")).toHaveCount(0);
    const verrou = await page.evaluate(() => document.documentElement.classList.contains("passio-locked"));
    expect(verrou).toBe(false);
    await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  });

  test("avec `passio_gate_actif = 1`, le rideau se REFERME (le mécanisme survit)", async ({ page }) => {
    await sansDonneesDistantes(page);
    await page.addInitScript(() => {
      localStorage.setItem("passio_first_run_experience_v1", "0");
      localStorage.setItem("passio_gate_actif", "1");
    });
    await page.goto("/index.html");
    await expect(page.locator("#passioGate")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();
  });

  test("un jeton de gate posé par un ancien appareil ne gêne pas : l'app s'ouvre quand même", async ({ page }) => {
    await sansDonneesDistantes(page);
    await poserGateSansPremiereVisite(page);
    await page.goto("/index.html");
    await expect(page.locator("#passioGate")).toHaveCount(0);
    await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("② bibliothèques auto-hébergées", () => {
  test("les loaders pointent vers js/vendor/, et les fichiers existent", async () => {
    const supaLoader = lire("js/supabase-loader.js");
    const mapLoader = lire("js/map-loader.js");
    const m1 = supaLoader.match(/s\.src = "(js\/vendor\/supabase-js-[0-9.]+\.js)"/);
    expect(m1, "le loader Supabase doit charger un fichier local ÉPINGLÉ").not.toBeNull();
    expect(fs.existsSync(path.join(RACINE, m1[1])), m1[1] + " doit exister").toBe(true);
    const m2 = mapLoader.match(/MAPLIBRE_JS = "(js\/vendor\/maplibre-gl-[0-9.]+\.js)"/);
    const m3 = mapLoader.match(/MAPLIBRE_CSS = "(js\/vendor\/maplibre-gl-[0-9.]+\.css)"/);
    expect(m2).not.toBeNull(); expect(m3).not.toBeNull();
    expect(fs.existsSync(path.join(RACINE, m2[1]))).toBe(true);
    expect(fs.existsSync(path.join(RACINE, m3[1]))).toBe(true);
    // Plus aucun CDN de scripts nulle part dans le code livré.
    for (const f of ["js/supabase-loader.js", "js/map-loader.js", "index.html"]) {
      expect(lire(f), f).not.toMatch(/cdn\.jsdelivr\.net|unpkg\.com/);
    }
  });

  test("la CSP n'autorise plus aucun hôte de scripts tiers, et le build copie js/vendor", async () => {
    const toml = lire("netlify.toml");
    const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1] || "";
    const scriptSrc = (csp.match(/script-src ([^;]+);/) || [])[1] || "";
    expect(scriptSrc.trim()).toBe("'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/jsdelivr|unpkg/);
    expect(lire("scripts/build.js")).toMatch(/js", "vendor"/);
  });

  test("le SDK vendu est bien celui que l'app construit (global `supabase`)", async ({ page }) => {
    await bootOnboarded(page);
    // La page de test coupe le SDK (isolation) ; on vérifie la SOURCE du fichier vendu.
    const src = lire("js/vendor/supabase-js-2.116.0.js");
    expect(src.slice(0, 60)).toMatch(/^var supabase=/);
    expect(src).toContain("2.116.0");
  });
});

test.describe("③ colonnes des rencontres", () => {
  test("`conv_id` a quitté la liste PUBLIQUE et vit dans la liste PRIVÉE", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({
      pub: _EVENT_COLS_PUBLIC.split(","),
      prive: _EVENT_COLS_PRIVE.split(","),
    }));
    expect(r.pub).not.toContain("conv_id");
    expect(r.pub).not.toContain("address");
    expect(r.pub).not.toContain("contact");
    expect(r.prive).toContain("conv_id");
    expect(r.prive).toContain("address");
    expect(r.prive).toContain("contact");
    expect(r.pub).toContain("title");
    expect(r.pub).toContain("lat");
  });
});

test.describe("④ pièces jointes signées", () => {
  test("`cdnUrl` laisse les pièces jointes intactes et réécrit toujours le contenu public", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(([pj, contenu]) => ({
      base: window.PASSIO_CDN_BASE, pj: cdnUrl(pj), contenu: cdnUrl(contenu),
    }), [PJ_SUPA, CONTENU]);
    expect(r.pj).toBe(PJ_SUPA);
    if (r.base) expect(r.contenu).toBe(r.base + "/content/photos/u1/x.jpg");
    else expect(r.contenu).toBe(CONTENU);
  });

  test("`pieceJointeChemin` reconnaît les DEUX formes d'URL, et rien d'autre", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(([supa, cdn, contenu]) => ({
      supa: pieceJointeChemin(supa),
      cdn: pieceJointeChemin(cdn),
      signee: pieceJointeChemin("https://x.supabase.co/storage/v1/object/sign/attachments/attachments/conv_a/f.pdf?token=abc"),
      contenu: pieceJointeChemin(contenu),
      gif: pieceJointeChemin("https://media.tenor.com/x.gif"),
      data: pieceJointeChemin("data:image/png;base64,AAAA"),
      nul: pieceJointeChemin(null),
    }), [PJ_SUPA, PJ_CDN, CONTENU]);
    expect(r.supa).toBe("attachments/conv_x9/1787_photo.jpg");
    expect(r.cdn).toBe("attachments/conv_x9/1787_voice.webm");
    expect(r.signee).toBe("attachments/conv_a/f.pdf");
    expect(r.contenu).toBeNull();
    expect(r.gif).toBeNull();
    expect(r.data).toBeNull();
    expect(r.nul).toBeNull();
  });

  test("`attrMediaSrc` : une pièce jointe porte data-pj SANS src ; un autre média garde src", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(([pj]) => ({
      pj: attrMediaSrc(pj),
      pjHref: attrMediaSrc(pj, "href"),
      gif: attrMediaSrc("https://media.tenor.com/x.gif"),
      danger: attrMediaSrc("javascript:alert(1)"),
    }), [PJ_SUPA]);
    expect(r.pj).toBe('data-pj="' + PJ_SUPA + '"');
    expect(r.pj).not.toMatch(/\bsrc=/);
    expect(r.pjHref).toBe('data-pj="' + PJ_SUPA + '"');
    expect(r.gif).toBe('src="https://media.tenor.com/x.gif"');
    expect(r.danger).toBe('src="#"');
  });

  test("`signerPiecesJointes` pose l'URL SIGNÉE rendue par Storage, et laisse le reste", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async ([pj]) => {
      const appels = [];
      // ⚠️ On MUTE le client (let de portée script), on ne remplace pas le binding.
      supa.storage = { from: (seau) => ({ createSignedUrl: async (chemin, ttl) => {
        appels.push({ seau, chemin, ttl });
        return { data: { signedUrl: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/sign/" + seau + "/" + chemin + "?token=SIGNE" }, error: null };
      } }) };
      document.body.insertAdjacentHTML("beforeend",
        '<div id="pjTest"><img id="pj1" ' + attrMediaSrc(pj) + '><a id="pj2" ' + attrMediaSrc(pj, "href") + '>f</a><img id="gif1" ' + attrMediaSrc("https://media.tenor.com/x.gif") + '></div>');
      signerPiecesJointes(document.getElementById("pjTest"));
      await new Promise((res) => setTimeout(res, 50));
      const img = document.getElementById("pj1"), a = document.getElementById("pj2"), gif = document.getElementById("gif1");
      return {
        appels, img: img.getAttribute("src"), a: a.getAttribute("href"), gif: gif.getAttribute("src"),
        restePj: document.querySelectorAll("#pjTest [data-pj]").length,
      };
    }, [PJ_SUPA]);
    expect(r.appels.length, "UNE signature par objet distinct (cache mémoire)").toBe(1);
    expect(r.appels[0].seau).toBe("attachments");
    expect(r.appels[0].chemin).toBe("attachments/conv_x9/1787_photo.jpg");
    expect(r.appels[0].ttl).toBe(7 * 24 * 3600);
    expect(r.img).toContain("/object/sign/attachments/attachments/conv_x9/1787_photo.jpg?token=SIGNE");
    expect(r.a).toContain("?token=SIGNE");
    expect(r.gif).toBe("https://media.tenor.com/x.gif");
    expect(r.restePj, "l'attribut est consommé").toBe(0);
  });

  test("…et REPLIE sur l'URL d'origine quand la signature échoue (hors ligne, non-membre)", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async ([pj]) => {
      supa.storage = { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: "Object not found" } }) }) };
      document.body.insertAdjacentHTML("beforeend", '<div id="pjTest2"><img id="pj3" ' + attrMediaSrc(pj) + '></div>');
      signerPiecesJointes(document.getElementById("pjTest2"));
      await new Promise((res) => setTimeout(res, 50));
      return document.getElementById("pj3").getAttribute("src");
    }, [PJ_SUPA]);
    expect(r).toBe(PJ_SUPA);
  });

  test("⑤ CÂBLAGE : le fil de conversation et le panneau Médias appellent le signeur APRÈS leur innerHTML", async () => {
    const app04 = lire("js/app-04-comments-shop.js");
    const i1 = app04.indexOf("thread.innerHTML = parts.join('');");
    expect(i1).toBeGreaterThan(0);
    const suite = app04.slice(i1, i1 + 300);
    expect(suite).toMatch(/signerPiecesJointes\(thread\)/);
    const app09 = lire("js/app-09-boot-pwa.js");
    const i2 = app09.indexOf("content.innerHTML = html;");
    expect(i2).toBeGreaterThan(0);
    expect(app09.slice(i2, i2 + 200)).toMatch(/signerPiecesJointes\(content\)/);
    // Les trois branches média de la bulle passent par attrMediaSrc, plus aucun src direct.
    const bulle = app04.slice(app04.indexOf("if (m.gif) {"), app04.indexOf("} else if (m.location) {"));
    expect(bulle).toMatch(/<video ' \+ attrMediaSrc\(m\.video\)/);
    expect(bulle).toMatch(/attrMediaSrc\(m\.img\)/);
    expect(bulle).toMatch(/attrMediaSrc\(m\.fileUrl, "href"\)/);
    expect(bulle).not.toMatch(/src="' \+ safeUrlAttr\(m\.(img|video)\)/);
    // Le lecteur vocal résout l'URL signée au premier tap.
    expect(app04).toMatch(/function _playVoiceById[\s\S]{0,900}urlPieceJointeSignee\(src\)/);
  });
});

test.describe("⑥ canaux Realtime privés", () => {
  test("`_callChannel` crée un canal PRIVÉ, et replie sur public après un refus de policy mesuré", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const configs = [];
      supa.channel = (name, cfg) => { configs.push({ name, cfg }); return { on() { return this; }, subscribe() {}, send() {} }; };
      delete window._rtPriveIndisponible;
      _callChannel("ring:u1");
      window._rtPriveIndisponible = true;
      _callChannel("call:c1");
      delete window._rtPriveIndisponible;
      return {
        configs,
        refusPolicy: _rtRefusDePolicy({ message: "You do not have permissions to read from this Channel topic: ring:u1" }),
        refusUnauthorized: _rtRefusDePolicy("Unauthorized"),
        coupure: _rtRefusDePolicy({ message: "WebSocket connection lost" }),
        vide: _rtRefusDePolicy(undefined),
      };
    });
    expect(r.configs[0].cfg.config.private).toBe(true);
    expect(r.configs[0].cfg.config.broadcast.self).toBe(false);
    expect(r.configs[1].cfg.config.private).toBe(false);
    expect(r.refusPolicy).toBe(true);
    expect(r.refusUnauthorized).toBe(true);
    expect(r.coupure, "une coupure réseau ne fait PAS replier").toBe(false);
    expect(r.vide).toBe(false);
  });

  test("à la SOURCE : frappe et live sont privés eux aussi, la sonnerie porte la sonde", async () => {
    const app04 = lire("js/app-04-comments-shop.js");
    const app05 = lire("js/app-05-config-profil.js");
    expect(app04).toMatch(/supa\.channel\("typing:" \+ convId, \{ config: \{ private: window\._rtPriveIndisponible !== true \} \}\)/);
    expect((app05.match(/supa\.channel\("vlive:" \+ [a-zA-Z]+, \{ config: \{[^}]*private: window\._rtPriveIndisponible !== true \}/g) || []).length).toBe(2);
    expect(app05).toMatch(/function _subscribeCallRing[\s\S]{0,1200}window\._rtPriveIndisponible = true/);
    // Un seul point crée ring:/call: — sinon la sonde ne protège pas tout.
    expect((app05.match(/supa\.channel\("(ring|call):/g) || []).length).toBe(0);
  });
});

test.describe("⑦ compte privé : abonnement sur demande", () => {
  test("`libelleBoutonSuivi` a trois états, tirés de l'état du compte", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      state.user.following = ["u_suivi"];
      state.user.followingPending = ["u_attente"];
      return { suivi: libelleBoutonSuivi("u_suivi"), attente: libelleBoutonSuivi("u_attente"), aucun: libelleBoutonSuivi("u_autre"),
               etats: [etatSuivi("u_suivi"), etatSuivi("u_attente"), etatSuivi("u_autre")] };
    });
    expect(r.suivi).toBe("✓ Suivi");
    expect(r.attente).toBe("Demande envoyée");
    expect(r.aucun).toBe("Suivre");
    expect(r.etats).toEqual(["suivi", "attente", "aucun"]);
  });

  test("un verdict 'pending' du serveur CORRIGE l'affichage optimiste, et un second tap annule la demande", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const appels = [];
      window.supaFollowUser = async (uid) => { appels.push(["follow", uid]); return { ok: true, status: "pending" }; };
      window.supaUnfollowUser = async (uid) => { appels.push(["unfollow", uid]); return true; };
      state.user.following = []; state.user.followingPending = [];
      document.body.insertAdjacentHTML("beforeend", '<button id="fbt" data-follow-uid="u_prive">Suivre</button>');
      const btn = document.getElementById("fbt");
      toggleFollowUser("u_prive", "Camille");
      const optimiste = btn.textContent;
      await new Promise((res) => setTimeout(res, 30));
      const apres = { texte: btn.textContent, following: state.user.following.slice(), attente: state.user.followingPending.slice(), attr: btn.getAttribute("data-suivi-attente") };
      toggleFollowUser("u_prive", "Camille");
      await new Promise((res) => setTimeout(res, 10));
      return { optimiste, apres, annule: { texte: btn.textContent, attente: state.user.followingPending.slice(), following: state.user.following.slice() }, appels };
    });
    expect(r.optimiste).toBe("✓ Suivi");
    expect(r.apres.texte).toBe("Demande envoyée");
    expect(r.apres.following).toEqual([]);
    expect(r.apres.attente).toEqual(["u_prive"]);
    expect(r.apres.attr).toBe("1");
    expect(r.annule.texte).toBe("Suivre");
    expect(r.annule.attente).toEqual([]);
    expect(r.appels).toEqual([["follow", "u_prive"], ["unfollow", "u_prive"]]);
  });

  test("un verdict 'accepted' (compte public) laisse l'abonnement tel quel", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      window.supaFollowUser = async () => ({ ok: true, status: "accepted" });
      state.user.following = []; state.user.followingPending = [];
      document.body.insertAdjacentHTML("beforeend", '<button data-follow-uid="u_pub">Suivre</button>');
      toggleFollowUser("u_pub", "Jo");
      await new Promise((res) => setTimeout(res, 30));
      return { texte: document.querySelector('[data-follow-uid="u_pub"]').textContent, following: state.user.following.slice(), attente: state.user.followingPending.slice() };
    });
    expect(r.texte).toBe("✓ Suivi");
    expect(r.following).toEqual(["u_pub"]);
    expect(r.attente).toEqual([]);
  });

  test("la notification `follow_request` porte Accepter/Refuser, puis le verdict en toutes lettres", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      state.user.demandesAbonnementTraitees = {};
      const n = { id: "n_req_1", kind: "follow_request", fromId: "u_dem", text: "Camille souhaite s'abonner à ton compte privé", createdAt: Date.now(), unread: true, fromSupabase: true };
      state.notifications = [n];
      const avant = _notifListHtml([n]);
      _demandeAbonnementTraitee("n_req_1", "acceptée");
      const apres = _notifListHtml(state.notifications);
      return { avant, apres, emoji: _notifEmoji("follow_request"), unread: state.notifications[0].unread, memo: state.user.demandesAbonnementTraitees };
    });
    expect(r.avant).toContain("Accepter");
    expect(r.avant).toContain("Refuser");
    expect(r.avant).toMatch(/accepterDemandeAbonnement\('u_dem','n_req_1'\)/);
    expect(r.avant).toMatch(/refuserDemandeAbonnement\('u_dem','n_req_1'\)/);
    expect(r.avant).toMatch(/event\.stopPropagation\(\)/);
    expect(r.apres).not.toContain("Accepter");
    expect(r.apres).toContain("Demande acceptée");
    expect(r.emoji).toBe("🔒");
    expect(r.unread).toBe(false);
    expect(r.memo).toEqual({ n_req_1: "acceptée" });
  });

  test("accepter lit le verdict serveur : 0 ligne = « n'existe plus », erreur = rien n'est marqué", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const toasts = [];
      window.toast = (t) => toasts.push(t);
      state.user.demandesAbonnementTraitees = {};
      state.notifications = [{ id: "n_a", kind: "follow_request", fromId: "u_dem", text: "x", createdAt: Date.now(), unread: true }];
      const notifs = [];
      window.supaInsertNotif = async (to, kind) => { notifs.push([to, kind]); };
      let reponse;
      supa.from = () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: async () => reponse }) }) }),
                          delete: () => ({ eq: () => ({ eq: async () => reponse }) }) });
      reponse = { data: [], error: null };
      const r0 = await accepterDemandeAbonnement("u_dem", "n_a");
      const memo0 = Object.assign({}, state.user.demandesAbonnementTraitees);
      state.user.demandesAbonnementTraitees = {};
      reponse = { data: null, error: { code: "42501", message: "refus" } };
      const r1 = await accepterDemandeAbonnement("u_dem", "n_a");
      const memo1 = Object.assign({}, state.user.demandesAbonnementTraitees);
      reponse = { data: [{ status: "accepted" }], error: null };
      const r2 = await accepterDemandeAbonnement("u_dem", "n_a");
      return { r0, memo0, r1, memo1, r2, memo2: state.user.demandesAbonnementTraitees, notifs, toasts };
    });
    expect(r.r0).toBe(false);
    expect(r.memo0).toEqual({ n_a: "expirée" });
    expect(r.r1).toBe(false);
    expect(r.memo1, "un refus ne marque RIEN").toEqual({});
    expect(r.r2).toBe(true);
    expect(r.memo2).toEqual({ n_a: "acceptée" });
    expect(r.notifs).toEqual([["u_dem", "follow"]]);
    expect(r.toasts).toContain("Demande acceptée");
  });

  test("`supaLoadFollowing` sépare acceptés et en attente, et replie sans la colonne", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      delete window._followsSansStatut;
      let appels = [];
      supa.from = () => ({ select: (cols) => ({ eq: async () => {
        appels.push(cols);
        if (cols.includes("status")) return { data: [{ following_id: "u_ok", status: "accepted" }, { following_id: "u_att", status: "pending" }], error: null };
        return { data: [{ following_id: "u_ok" }], error: null };
      } }) });
      const avec = await supaLoadFollowing();
      const attente = state.user.followingPending.slice();
      // Puis une base SANS la colonne (migration pas appliquée) : 42703 → repli.
      delete window._followsSansStatut;
      appels = [];
      supa.from = () => ({ select: (cols) => ({ eq: async () => {
        appels.push(cols);
        if (cols.includes("status")) return { data: null, error: { code: "42703", message: 'column follows.status does not exist' } };
        return { data: [{ following_id: "u_ok" }], error: null };
      } }) });
      const sans = await supaLoadFollowing();
      return { avec, attente, sans, appels, memo: window._followsSansStatut };
    });
    expect(r.avec).toEqual(["u_ok"]);
    expect(r.attente).toEqual(["u_att"]);
    expect(r.sans).toEqual(["u_ok"]);
    expect(r.appels).toEqual(["following_id,status", "following_id"]);
    expect(r.memo, "le repli est mémorisé pour la session").toBe(true);
  });

  test("le texte de la case « Compte privé » dit désormais ce que le serveur fait", async () => {
    const app06 = lire("js/app-06-reels-partage.js");
    expect(app06).toMatch(/Seuls les abonnés que tu as <b>acceptés<\/b> voient/);
    expect(app06).not.toMatch(/Seuls tes abonnés peuvent voir tes publications, photos, bobines et carnets\./);
  });
});

test.describe("⑧ la politique dit ce que la base fait", () => {
  test("§8 : 7 jours de mesure d'usage, 30 jours de rapports d'erreur — et la version suit", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({ version: PASSIO_CONFIDENTIALITE_VERSION }));
    expect(r.version).toBe("2026-09-11");
    const app02 = lire("js/app-02-state-utils.js");
    expect(app02).toMatch(/13 mois au maximum<\/strong> — en pratique la mesure d\\'usage détaillée est effacée après <strong[^>]*>7 jours<\/strong> et les rapports d\\'erreur après <strong[^>]*>30 jours/);
  });

  test("la migration serveur existe, son banc est branché en CI, et son verdict porte dix lignes", async () => {
    const mig = lire("migrations/migration_ouverture_publique_2026-09-11.sql");
    expect(mig).toMatch(/update storage\.buckets set public = false where id = 'attachments'/);
    expect(mig).toMatch(/create policy "passio_rt_recevoir" on realtime\.messages/);
    expect((mig.match(/union all select \d+,/g) || []).length).toBe(9);
    const ci = lire(".github/workflows/deploy.yml");
    expect(ci).toMatch(/bash tests\/sql\/migration-ouverture-publique\.test\.sh/);
    expect(ci).toMatch(/node --test tests\/unit\/moderation-alerte\.test\.mjs/);
    expect(fs.existsSync(path.join(RACINE, ".github/workflows/sauvegarde.yml"))).toBe(true);
    expect(fs.existsSync(path.join(RACINE, ".github/workflows/moderation-alerte.yml"))).toBe(true);
  });
});
