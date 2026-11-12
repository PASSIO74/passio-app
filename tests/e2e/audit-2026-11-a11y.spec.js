// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D (frontend, accessibilité, fluidité)
// Capture systématique des écrans et des modales au gabarit 390×844, et
// relevés mécaniques : erreurs console, débordement horizontal, cibles
// tactiles < 44 px, champs < 16 px (zoom iOS), boutons-icônes sans nom
// accessible, images sans `alt`, contraste AA des paires texte/fond les plus
// fréquentes, focus visible au clavier, piège de focus et Échap des modales,
// `aria-live` des toasts, ordre des titres.
//
// ⚠️ CE SPEC MESURE ET ÉCRIT UN RAPPORT ; il n'échoue que sur ce qui est un
// invariant déjà tenu par le dépôt (aria-live des toasts, Échap ferme une
// modale, aucune erreur JS au démarrage). Les autres relevés sont consignés
// dans `PASSIO_AUDIT_DIR/a11y-releves.json` et lus par le rapport D.
// Captures PNG : `PASSIO_AUDIT_DIR/screens/*.png` (hors dépôt).
// Stub local (bootOnboarded) : aucune écriture en production.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUDIT_DIR = process.env.PASSIO_AUDIT_DIR || path.join(__dirname, "..", "..", "test-results", "audit-2026-11");
const SCREENS_DIR = path.join(AUDIT_DIR, "screens");
fs.mkdirSync(SCREENS_DIR, { recursive: true });

// Sondes injectées dans la page : une seule définition, réutilisée par chaque écran.
const SONDES = function () {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    return true;
  };
  const nom = (el) => (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className || "").trim().split(/\s+/).slice(0, 2).join("."));
  const texte = (el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);

  // Parse rgb/rgba -> [r,g,b,a]
  const rgba = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  // Fond effectif : remonte jusqu'au premier fond opaque, en composant les alphas.
  // Un dégradé CSS n'a pas de backgroundColor : on prend la MOYENNE de ses
  // arrêts de couleur (approximation, notée comme telle dans le rapport).
  const couleurDegrade = (bi) => {
    if (!bi || bi === "none" || !/gradient\(/.test(bi)) return null;
    const stops = [...bi.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter(Boolean);
    if (!stops.length) return null;
    const m = [0, 0, 0, 0];
    stops.forEach((c) => { m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; m[3] += c[3]; });
    return [m[0] / stops.length, m[1] / stops.length, m[2] / stops.length, m[3] / stops.length];
  };
  const fondEffectif = (el) => {
    let acc = null; let n = el;
    while (n && n !== document.documentElement.parentNode) {
      const cs = getComputedStyle(n);
      const bg = couleurDegrade(cs.backgroundImage) || rgba(cs.backgroundColor);
      if (bg && bg[3] > 0) {
        if (!acc) acc = bg;
        else { const a = acc[3]; acc = [acc[0] * a + bg[0] * (1 - a), acc[1] * a + bg[1] * (1 - a), acc[2] * a + bg[2] * (1 - a), Math.min(1, a + bg[3] * (1 - a))]; }
        if (acc[3] >= 0.99) return acc;
      }
      n = n.parentElement;
    }
    const body = rgba(getComputedStyle(document.body).backgroundColor);
    const base = body && body[3] > 0 ? body : [255, 255, 255, 1];
    if (!acc) return base;
    const a = acc[3];
    return [acc[0] * a + base[0] * (1 - a), acc[1] * a + base[1] * (1 - a), acc[2] * a + base[2] * (1 - a), 1];
  };

  window.__audit = {
    debordement() {
      const out = [];
      const root = document.getElementById("appMain") || document.body;
      const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      const cands = [root, ...document.querySelectorAll(".screen.active, .screen.active *")];
      const dansRail = (el) => { let n = el; while (n && n !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true; n = n.parentElement; } return false; };
      for (const el of cands) {
        if (!visible(el)) continue;
        // Un conteneur qui défile horizontalement PAR DESSEIN (rail de bulles), et ses enfants, ne débordent pas.
        if (dansRail(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1 || r.left < -1) out.push({ el: nom(el), left: Math.round(r.left), right: Math.round(r.right), texte: texte(el) });
        if (out.length > 12) break;
      }
      return { pageScrollWidth: sw, clientWidth: cw, pageDeborde: sw > cw, elements: out };
    },
    cibles() {
      // Cliquables visibles : natifs + onclick + role=button + nav.
      const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [onclick], [role="button"], [tabindex]:not([tabindex="-1"]), label[for]';
      const petites = []; let total = 0;
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        // Le fond d'une modale et les conteneurs tabulables (data-clavier) ne sont pas des cibles.
        if (el.classList.contains("modal-backdrop") || el.hasAttribute("data-clavier")) continue;
        if (el.tagName === "INPUT" && /^(checkbox|radio)$/.test(el.type) && el.closest("label")) continue;
        total++;
        // Hors du champ (sous la barre du bas, hors du cadre de la modale), `elementFromPoint`
        // rend le voisin : on amène la cible au centre avant de mesurer (sonde du dépôt, ⑤).
        try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {}
        const r = el.getBoundingClientRect();
        // Zone réellement tapable : on part du centre et on cherche jusqu'à 44px autour.
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const touche = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
        if (!touche(cx, cy)) continue; // recouvert : mesuré ailleurs
        // On ne cherche que jusqu'à 44 px : au-delà la cible est « assez grande »,
        // et le relevé dit `>=44` plutôt qu'un nombre borné par la sonde.
        let g = cx, d = cx, h = cy, b = cy;
        while (d - g < 46 && touche(g - 1, cy)) g--;
        while (d - g < 46 && touche(d + 1, cy)) d++;
        while (b - h < 46 && touche(cx, h - 1)) h--;
        while (b - h < 46 && touche(cx, b + 1)) b++;
        const w = d - g + 1, hh = b - h + 1;
        if (w < 44 || hh < 44) petites.push({ el: nom(el), w: Math.round(w), h: Math.round(hh), visuel: Math.round(r.width) + "×" + Math.round(r.height), texte: texte(el) || el.getAttribute("aria-label") || "", borne: [nom(document.elementFromPoint(cx, h - 1) || el), nom(document.elementFromPoint(cx, b + 1) || el)] });
      }
      return { total, petites: petites.slice(0, 40), nbPetites: petites.length };
    },
    champs() {
      const out = [];
      for (const el of document.querySelectorAll("input, textarea, select")) {
        if (!visible(el)) continue;
        if (el.type === "hidden" || el.type === "file" || el.type === "checkbox" || el.type === "radio" || el.type === "range") continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) out.push({ el: nom(el), fontSize: fs, placeholder: el.placeholder || "" });
      }
      return out;
    },
    nomsAccessibles() {
      const out = [];
      for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
        if (!visible(el)) continue;
        const label = el.getAttribute("aria-label") || el.getAttribute("title");
        const labelledby = el.getAttribute("aria-labelledby");
        const t = (el.textContent || "").trim();
        const img = el.querySelector("img[alt]");
        const alt = img ? img.getAttribute("alt") : "";
        // Un texte fait seulement d'emoji/symboles n'est pas un nom.
        const texteUtile = t.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}‍️×⋯←→›‹+·•…\s]/gu, "");
        if (!label && !labelledby && !texteUtile && !alt) out.push({ el: nom(el), contenu: t.slice(0, 20), html: el.outerHTML.slice(0, 90) });
      }
      return out;
    },
    images() {
      const out = [];
      for (const img of document.querySelectorAll("img")) {
        if (!visible(img)) continue;
        if (!img.hasAttribute("alt")) out.push({ el: nom(img), src: (img.getAttribute("src") || "").slice(0, 60) });
      }
      return out;
    },
    // Candidats au contraste : éléments visibles portant du texte direct. Le FOND
    // est demandé au moteur (CDP `CSS.getBackgroundColors`, côté test) : un
    // compositeur maison se trompait sur les fonds translucides et les dégradés.
    contrastesCandidats() {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, vus = 0; const dejaVu = new Set();
      while ((n = walker.nextNode()) && vus < 1500) {
        const s = (n.nodeValue || "").trim(); if (s.length < 2) continue;
        const el = n.parentElement; if (!el || dejaVu.has(el) || !visible(el)) continue;
        dejaVu.add(el); vus++;
        const cs = getComputedStyle(el);
        const fg = rgba(cs.color); if (!fg) continue;
        el.setAttribute("data-audit-idx", String(out.length));
        out.push({ idx: out.length, fg, taille: parseFloat(cs.fontSize), gras: parseInt(cs.fontWeight, 10) >= 700, el: nom(el), texte: s.slice(0, 24) });
      }
      return out;
    },
    contrasteCalcul(fg, bgs) {
      // bgs : couleurs de fond rendues par le moteur (1 = uni, 2 = dégradé → le pire des deux).
      const fonds = (bgs || []).map(rgba).filter(Boolean);
      if (!fonds.length) return null;
      let pire = null;
      for (const bg of fonds) {
        const fgc = fg[3] < 1 ? [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3])] : fg;
        const r = ratio(fgc, bg);
        if (pire === null || r < pire.ratio) pire = { ratio: Math.round(r * 100) / 100, bg: "rgb(" + bg.slice(0, 3).map(Math.round).join(",") + ")" };
      }
      return pire;
    },
    titres() {
      return [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => h.tagName + ": " + texte(h));
    },
    focusables() {
      const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
      return [...document.querySelectorAll(sel)].filter(visible).length;
    },
  };
};

// Écran courant : on capture, on relève, on consigne.
async function contrastesViaCdp(page) {
  const cands = await page.evaluate(() => window.__audit.contrastesCandidats());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  await cdp.send("DOM.getDocument", { depth: 0 });
  const paires = new Map();
  for (const c of cands) {
    let bgs = null;
    try {
      const { result } = await cdp.send("Runtime.evaluate", { expression: "document.querySelector('[data-audit-idx=\"" + c.idx + "\"]')" });
      if (!result.objectId) continue;
      const { nodeId } = await cdp.send("DOM.requestNode", { objectId: result.objectId });
      bgs = (await cdp.send("CSS.getBackgroundColors", { nodeId })).backgroundColors;
    } catch (e) { continue; }
    const calc = await page.evaluate(([fg, bgs]) => window.__audit.contrasteCalcul(fg, bgs), [c.fg, bgs]);
    if (!calc) continue;
    const grand = c.taille >= 24 || (c.taille >= 18.66 && c.gras);
    const seuil = grand ? 3 : 4.5;
    const key = c.fg.join(",") + "|" + calc.bg + "|" + Math.round(c.taille);
    const p = paires.get(key) || { fg: "rgb(" + c.fg.slice(0, 3).join(",") + ")" + (c.fg[3] < 1 ? " a=" + c.fg[3] : ""), bg: calc.bg, taille: c.taille, ratio: calc.ratio, seuil, n: 0, ex: [] };
    p.n++; if (p.ex.length < 3) p.ex.push(c.el + " « " + c.texte + " »");
    paires.set(key, p);
  }
  await cdp.detach().catch(() => {});
  await page.evaluate(() => document.querySelectorAll("[data-audit-idx]").forEach((e) => e.removeAttribute("data-audit-idx")));
  const liste = [...paires.values()].sort((a, b) => b.n - a.n);
  return { top: liste.slice(0, 25), echecs: liste.filter((p) => p.ratio < p.seuil).slice(0, 30), nbPaires: liste.length };
}

async function relever(page, nomEcran, releves, opts = {}) {
  await page.waitForTimeout(opts.delai || 350);
  const png = path.join(SCREENS_DIR, nomEcran + ".png");
  try { await page.screenshot({ path: png, fullPage: false }); } catch (e) { /* capture facultative */ }
  const r = await page.evaluate(() => ({
    debordement: window.__audit.debordement(),
    cibles: window.__audit.cibles(),
    champs: window.__audit.champs(),
    nomsAccessibles: window.__audit.nomsAccessibles(),
    images: window.__audit.images(),
    titres: window.__audit.titres(),
    focusables: window.__audit.focusables(),
    ecranActif: (document.querySelector(".screen.active") || {}).id || null,
    modaleOuverte: document.getElementById("modalBackdrop").classList.contains("active"),
  }));
  r.contrastes = await contrastesViaCdp(page);
  r.capture = path.relative(AUDIT_DIR, png);
  releves[nomEcran] = r;
  return r;
}

test.describe("AUDIT D — captures et relevés d'accessibilité", () => {
  test.setTimeout(180000);

  test("① les six écrans et les principales modales : captures + relevés (390×844)", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);
    await page.evaluate(SONDES);
    const releves = {};

    // ── Les écrans ────────────────────────────────────────────────────────
    for (const ecran of ["feed", "profiles", "studio", "explore", "irl", "messages"]) {
      await page.evaluate((e) => goTo(e), ecran);
      await relever(page, "ecran-" + ecran, releves);
    }
    // Onglets du profil (posts / événements) et page « Mes passions ».
    await page.evaluate(() => { goTo("profiles"); try { openPassionManager(); } catch (e) {} });
    await relever(page, "ecran-profiles-mes-passions", releves);
    await page.evaluate(() => { try { closePassionManager(); } catch (e) {} });

    // ── Les modales : chaque ouverture est mesurée, puis fermée par Échap ──
    const modales = [
      ["modal-notifications", "openNotifications()"],
      ["modal-parametres", "toggleDevPanel()", { panneau: true }],
      ["modal-editer-profil", "openEditMainProfile()"],
      ["modal-creer-activite", "openCreateEvent()"],
      ["modal-nouveau-message", "openNewMessage()"],
      ["modal-creer-groupe", "openCreateGroup()"],
      ["modal-apparence", "openConfigurator()"],
      ["modal-notif-reglages", "openNotifSettings()"],
      ["modal-confidentialite", "openPrivacySettings()"],
      ["modal-comptes-bloques", "openBlockedList()"],
      ["modal-contenu-feed", "openContentSettings()"],
      ["modal-feedback", "feedbackModal()"],
      ["modal-limites-pilote", "openLimitesPilote()"],
      ["modal-cgu", "openTermsOfService()"],
      ["modal-mentions-legales", "openLegalNotice()"],
      ["modal-a-propos", "openAbout()"],
      ["modal-changer-mdp", "openChangePassword()"],
      ["modal-deconnexion", "openLogoutConfirm()"],
      ["modal-supprimer-compte", "openDeleteAccountConfirm()"],
      ["modal-abonnes", "openFollowersList()"],
      ["modal-abonnements", "openFollowingList()"],
      ["modal-ajouter-passion", "openCreateProfile()"],
      ["modal-filtre-irl", "goTo('irl'); openIrlFiltersPanel()"],
    ];
    const echap = {};
    for (const [nomM, code, o] of modales) {
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
      const ok = await page.evaluate((c) => { try { eval(c); return true; } catch (e) { return "ERREUR " + e.message; } }, code);
      if (ok !== true) { releves[nomM] = { erreurOuverture: ok }; continue; }
      await relever(page, nomM, releves);
      // Fermeture par Échap : la modale doit disparaître.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      echap[nomM] = await page.evaluate(() => ({
        modale: document.getElementById("modalBackdrop").classList.contains("active"),
        devPanel: !!(document.getElementById("devPanel") && document.getElementById("devPanel").classList.contains("active")),
        filtres: (document.getElementById("irlFiltersPanel") || {}).style ? document.getElementById("irlFiltersPanel").style.display : null,
      }));
      if (o && o.panneau) await page.evaluate(() => { const p = document.getElementById("devPanel"); if (p && p.classList.contains("active")) toggleDevPanel(); });
      await page.evaluate(() => { try { closeModal(); } catch (e) {} try { if (typeof closeIrlFiltersPanel === "function") closeIrlFiltersPanel(); } catch (e) {} });
    }

    // ── Détail d'une publication, discussion, fiche d'activité, conversation ──
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    const postId = await page.evaluate(() => { const p = (state.seed.posts || []).find((x) => Array.isArray(x.comments) && x.comments.length >= 2); return p ? p.id : null; });
    if (postId) {
      await page.evaluate((id) => openPost(id), postId);
      await relever(page, "page-detail-publication", releves);
      await page.evaluate(() => closePost());
      await page.evaluate((id) => openComments(id), postId);
      await relever(page, "modal-discussion", releves);
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      echap["modal-discussion"] = await page.evaluate(() => ({ modale: document.getElementById("modalBackdrop").classList.contains("active") }));
    }
    const evId = await page.evaluate(() => { const e = (state.seed.events || [])[0]; return e ? e.id : null; });
    if (evId) {
      await page.evaluate((id) => { goTo("irl"); openEventDetails(id); }, evId);
      await relever(page, "page-detail-activite", releves);
      echap["page-detail-activite"] = await page.evaluate(() => {
        // Échap n'est pas câblé sur les pages plein écran : on note l'état avant/après.
        const avant = document.getElementById("eventDetailPage").style.display;
        return { avant };
      });
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      echap["page-detail-activite"].apres = await page.evaluate(() => document.getElementById("eventDetailPage").style.display);
      await page.evaluate(() => { try { closeEventDetail(); } catch (e) {} });
    }
    // Conversation : on sème une conversation réelle (non démo) et on l'ouvre.
    await page.evaluate(() => {
      const convs = getConversations();
      if (!convs.some((c) => c.id === "c_audit")) {
        convs.push({ id: "c_audit", userId: "11111111-2222-4333-8444-555555555555", userName: "Camille", userEmoji: "🎨", userColor: "#7c3aed", unread: 0,
          messages: [{ id: "m1", from: "11111111-2222-4333-8444-555555555555", text: "Salut, tu viens dimanche ?", at: Date.now() - 3600000 }, { id: "m2", from: "me", text: "Oui, à 10h.", at: Date.now() - 1800000 }] });
        saveConversationsNow();
      }
      goTo("messages"); renderMessages();
    });
    await page.evaluate(() => openConversation("c_audit"));
    await relever(page, "page-conversation", releves, { delai: 600 });
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    echap["page-conversation"] = await page.evaluate(() => ({ active: document.getElementById("conv-fullpage").classList.contains("active") }));
    await page.evaluate(() => { try { closeConversation(); } catch (e) {} });

    // Bobines (lecteur plein écran).
    await page.evaluate(() => { try { openReels(); } catch (e) {} });
    await relever(page, "page-bobines", releves, { delai: 700 });
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    echap["page-bobines"] = await page.evaluate(() => ({ open: !!(window.reelsState && reelsState.open) }));
    await page.evaluate(() => { try { closeReels(); } catch (e) {} });

    // ── Focus clavier : Tab sur les 12 premiers éléments depuis le fil ──
    await page.evaluate(() => { goTo("feed"); document.body.focus(); });
    await page.waitForTimeout(200);
    const focusTrace = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      focusTrace.push(await page.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return { el: "body" };
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { el: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className || "").split(/\s+/).slice(0, 2).join("."),
          outline: cs.outlineStyle + " " + cs.outlineWidth, boxShadow: cs.boxShadow !== "none", visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight, label: el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 25) };
      }));
    }

    // ── Piège de focus : Tab depuis l'intérieur d'une modale sort-il de la modale ? ──
    await page.evaluate(() => openNotifications());
    await page.waitForTimeout(150);
    const trap = await page.evaluate(() => {
      const m = document.getElementById("modalContent");
      const first = m.querySelector("button, [tabindex='0'], input, textarea");
      if (first) first.focus();
      return { focusInitialDansModale: m.contains(document.activeElement), activeAtOpen: document.activeElement && document.activeElement.className };
    });
    const sorties = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      sorties.push(await page.evaluate(() => { const m = document.getElementById("modalContent"); const a = document.activeElement; return { dans: m.contains(a), el: a ? a.tagName.toLowerCase() + "." + String(a.className || "").split(/\s+/)[0] : null }; }));
    }
    trap.tabSuite = sorties;
    trap.sortDeLaModale = sorties.some((s) => !s.dans);
    // Le fond est-il rendu inerte (aria-hidden / inert) pendant la modale ?
    trap.fondInerte = await page.evaluate(() => { const am = document.getElementById("appMain"); return { ariaHidden: am && am.getAttribute("aria-hidden"), inert: am && am.hasAttribute("inert") }; });
    await page.keyboard.press("Escape");
    // Retour du focus après fermeture.
    trap.focusApresFermeture = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") : null; });
    // Dialogue : attributs.
    trap.dialog = await page.evaluate(() => { const m = document.getElementById("modalContent"); return { role: m.getAttribute("role"), ariaModal: m.getAttribute("aria-modal"), ariaLabel: m.getAttribute("aria-label"), ariaLabelledby: m.getAttribute("aria-labelledby") }; });

    // ── Piège de focus sur une PETITE modale (3 commandes) : Tab en sort-il ? ──
    await page.evaluate(() => openLogoutConfirm());
    await page.waitForTimeout(150);
    await page.evaluate(() => { const b = document.querySelector("#modalContent .btn.primary"); if (b) b.focus(); });
    const petiteModale = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      petiteModale.push(await page.evaluate(() => { const m = document.getElementById("modalContent"); const a = document.activeElement; return { dans: m.contains(a), el: a ? a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") + "." + String(a.className || "").split(/\s+/)[0] : null }; }));
    }
    trap.petiteModale = petiteModale;
    trap.petiteModaleSort = petiteModale.some((s) => !s.dans);
    await page.keyboard.press("Escape");

    // ── aria-live des toasts, et le toast lui-même ──
    const toasts = await page.evaluate(() => {
      const s = document.getElementById("toastStack");
      toast("Message d'essai", "info");
      const t = s.querySelector(".toast");
      const cs = t ? getComputedStyle(t) : null;
      return { ariaLive: s.getAttribute("aria-live"), role: s.getAttribute("role"), toastRole: t && t.getAttribute("role"), fontSize: cs && cs.fontSize, dureeMs: 3000 };
    });

    const resume = {
      date: new Date().toISOString(), viewport: page.viewportSize(),
      erreurs: { js: errors.js, console: errors.console.slice(0, 10), nbReseau: errors.network.length },
      echap, focusTrace, trap, toasts, releves,
    };
    fs.writeFileSync(path.join(AUDIT_DIR, "a11y-releves.json"), JSON.stringify(resume, null, 1));

    // Invariants déjà tenus par le dépôt — ce qui doit rester vrai :
    expect(errors.js, "aucune erreur JS non rattrapée au démarrage ni pendant la visite").toEqual([]);
    expect(toasts.ariaLive, "la pile de toasts est une région live").toBe("polite");
    for (const [k, v] of Object.entries(echap)) {
      if (k.startsWith("modal-") && v && typeof v.modale === "boolean") expect(v.modale, "Échap ferme " + k).toBe(false);
    }
  });
});
