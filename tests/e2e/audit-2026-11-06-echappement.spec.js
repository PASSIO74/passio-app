// ═════════════════════════════════════════════════
// AUDIT DE SÉCURITÉ 2026-11-06 — ÉCHAPPEMENT DES CHAMPS LIBRES D'AUTRUI
//
// Chaque cas part d'une valeur qu'un AUTRE compte peut écrire (`profiles.emoji`,
// `profiles.color`, `post_comments.id`, `events.emoji`, nom de profil, URL de
// couverture) et vérifie ce que le navigateur en fait, pas la façon dont le code
// s'y prend : aucun élément ni attribut ne doit naître de la donnée, et aucune
// déclaration CSS ne doit sortir de la valeur prévue.
// Stub local (bootOnboarded) : aucune écriture en production.
// ═════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const BALISE = '<img src=x onerror=window.__xss=1 data-hostile=1>';
const SORTIE_ATTRIBUT = 'x"><img src=x onerror=window.__xss=2 data-hostile=1>';

test.describe("Audit 2026-11-06 — champs libres d'autrui rendus en HTML", () => {
  test("① rail des stories : `profiles.emoji` reste du texte", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((v) => {
      const t = document.createElement("template");
      t.innerHTML = _storyBubbleInner({ stories: [], emoji: v, name: "Autre" });
      return { elements: t.content.querySelectorAll("*").length, texte: t.content.textContent };
    }, BALISE);
    expect(r.elements).toBe(0);
    expect(r.texte).toBe(BALISE);
  });

  test("② réponses d'un commentaire : un identifiant choisi par le client ne sort pas de l'attribut", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((id) => {
      const auteur = "88881111-2222-4333-8444-555566667777";
      const html = _renderCommentsList([{
        id, authorId: auteur, authorName: "Autre", text: "bonjour", content: "bonjour", createdAt: Date.now(),
        replies: [{ id: "r1", authorId: auteur, authorName: "Autre", text: "réponse", createdAt: Date.now() }],
      }], "post1");
      const t = document.createElement("template");
      t.innerHTML = html;
      const bloc = t.content.querySelector(".comment-replies");
      return {
        hostile: t.content.querySelectorAll("[data-hostile]").length,
        idBloc: bloc ? bloc.id : null,
        reponse: !!t.content.querySelector(".comment-reply"),
      };
    }, SORTIE_ATTRIBUT);
    expect(r.hostile).toBe(0);
    expect(r.reponse).toBe(true);
    expect(r.idBloc).toBe("replies-" + SORTIE_ATTRIBUT);
  });

  test("③ fiche d'activité : couverture en échec, `events.emoji` reste du texte dans le repli", async ({ page }) => {
    await bootOnboarded(page);
    await page.route("https://exemple.invalid/**", (route) => route.abort());
    const r = await page.evaluate(async (emoji) => {
      const ev = {
        id: "xaudit1106ev", title: "Rencontre", emoji, coverUrl: "https://exemple.invalid/absente.png",
        passion: "musique", authorId: "88881111-2222-4333-8444-555566667777", dateAt: new Date(Date.now() + 864e5).toISOString(),
        city: "Lyon", attendees: [], comments: [],
      };
      window.allEvents = () => [ev];
      try { openEventDetails(ev.id); } catch (e) { /* le rendu aval ne fait pas l'objet de ce cas */ }
      const hote = document.getElementById("eventDetailCover");
      const fin = Date.now() + 4000;
      while (Date.now() < fin && hote && hote.querySelector("img")) await new Promise((res) => setTimeout(res, 50));
      await new Promise((res) => setTimeout(res, 100));
      const repli = hote && hote.querySelector(".event-detail-cover-placeholder");
      return {
        hostile: document.querySelectorAll("[data-hostile]").length,
        execute: window.__xss === undefined ? null : window.__xss,
        repli: repli ? repli.textContent : null,
      };
    }, BALISE);
    expect(r.execute).toBeNull();
    expect(r.hostile).toBe(0);
    expect(r.repli).toBe(BALISE);
  });

  test("④ mentions, mots-dièse, liens : un nom de compte ne se réécrit jamais dans le HTML déjà généré", async ({ page }) => {
    await bootOnboarded(page);
    const noms = [
      "x https://a/onpointerover=window.__xss=3//",
      "y #balise",
    ];
    const r = await page.evaluate((listeNoms) => {
      window._cmtKnownNames = () => listeNoms;
      const analyse = (texte) => {
        const t = document.createElement("template");
        t.innerHTML = _commentBodyHtml(texte);
        const elements = [...t.content.querySelectorAll("*")];
        return {
          balises: elements.map((e) => e.tagName + (e.className ? "." + e.className : "")),
          attributs: elements.flatMap((e) => [...e.attributes].map((a) => a.name)),
          onclick: elements.map((e) => e.getAttribute("onclick")).filter(Boolean),
          texte: t.content.textContent,
        };
      };
      const lien = analyse("voir https://exemple.test/a?b=1&c=2.");
      const lienA = (() => {
        const t = document.createElement("template");
        t.innerHTML = _commentBodyHtml("voir https://exemple.test/a?b=1&c=2.");
        return t.content.querySelector("a").getAttribute("href");
      })();
      return {
        url: analyse("@" + listeNoms[0] + " fin"),
        dieze: analyse("@" + listeNoms[1] + " fin"),
        mixte: analyse("@alice voit #velo et https://exemple.test/a."),
        lien, lienA,
      };
    }, noms);

    // Un seul élément : la mention. Aucun attribut hors de ce que le rendu pose.
    for (const cas of [r.url, r.dieze]) {
      expect(cas.balises).toEqual(["SPAN.cmt-mention"]);
      expect(cas.attributs.sort()).toEqual(["class", "onclick"]);
      expect(cas.onclick[0]).toMatch(/^return _openMentionProfile\('.*', event\)$/);
    }
    expect(r.url.texte).toBe("@" + noms[0] + " fin");

    // Le comportement ordinaire tient : mention, mot-dièse et lien dans le même texte.
    expect(r.mixte.balises).toEqual(["SPAN.cmt-mention", "SPAN.cmt-hashtag", "A.cmt-link"]);
    expect(r.mixte.texte).toBe("@alice voit #velo et https://exemple.test/a.");
    // La ponctuation finale reste hors du lien, et l'esperluette revient décodée.
    expect(r.lienA).toBe("https://exemple.test/a?b=1&c=2");
    expect(r.lien.texte).toBe("voir https://exemple.test/a?b=1&c=2.");
  });

  test("⑤ style : une valeur ne sort pas de sa déclaration, même par une référence sans point-virgule", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const posee = (decl) => {
        const d = document.createElement("div");
        d.innerHTML = '<div style="' + decl + '"></div>';
        return d.firstChild.style;
      };
      const couleur = "red&#59position:fixed&#59inset:0";
      const adresse = "https://exemple.invalid/a&#39&#41&#59position:fixed&#59inset:0";
      const parAvatar = posee("background:" + avatarBg({ avatar: couleur }) + ";cursor:pointer;");
      const parPhoto = posee("background:" + avatarBg({ photoUrl: adresse, avatarPhoto: adresse }) + ";cursor:pointer;");
      const parUrl = posee("background:url('" + _cssUrl(adresse) + "') center/cover;");
      return {
        positions: [parAvatar.position, parPhoto.position, parUrl.position],
        couleurGardee: _cssColor("#7c3aed"),
        varGardee: _cssColor("var(--accent)"),
        requeteGardee: _cssUrl("https://exemple.test/a.png?width=192&quality=75"),
      };
    });
    expect(r.positions).toEqual(["", "", ""]);
    expect(r.couleurGardee).toBe("#7c3aed");
    expect(r.varGardee).toBe("var(--accent)");
    expect(r.requeteGardee).toBe("https://exemple.test/a.png?width=192&quality=75");
  });

  test("⑥ aucune `url(` CSS n'est construite avec `safeUrlAttr` (le contexte de `_cssUrl`)", async () => {
    const dossier = path.join(__dirname, "..", "..", "js");
    const sites = [];
    for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith(".js"))) {
      fs.readFileSync(path.join(dossier, nom), "utf8").split("\n").forEach((ligne, i) => {
        if (/url\(["'`]?\s*(?:\+\s*|\$\{\s*)safeUrlAttr/.test(ligne)) sites.push(nom + ":" + (i + 1));
      });
    }
    expect(sites).toEqual([]);
  });

  test("⑦ couverture d'un profil visité : l'URL hostile reste dans sa valeur CSS", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const hostile = "https://exemple.invalid/c);position:fixed;inset:0;x:(";
      const autre = "88881111-2222-4333-8444-555566667777";
      const origine = window.userById;
      window.userById = (id) => (id === autre
        ? { id: autre, name: "Autre", profileEmoji: "🙂", avatar: "#8b5cf6", passion: "musique", passions: [], coverUrl: hostile, bio: "" }
        : origine(id));
      await openUserProfile(autre, "seed");
      await new Promise((res) => setTimeout(res, 300));
      const places = [...document.querySelectorAll('[style*="exemple.invalid"]')];
      return { vus: places.length, positions: places.map((e) => e.style.position) };
    });
    expect(r.vus).toBeGreaterThan(0);
    expect(r.positions.filter((p) => p === "fixed")).toEqual([]);
  });
});
