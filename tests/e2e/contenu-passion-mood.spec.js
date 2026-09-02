// ============================================================================
// LE FIL DE DÉMONSTRATION DIT SA PASSION ET SON ENVIE (2026-09-02)
// ----------------------------------------------------------------------------
// Remarque d'un testeur, essai réel : « le contenu fake du fil n'est pas assez
// explicite par rapport à la passion et au mood, il faut que les testeurs
// comprennent bien la différence visuellement ».
//
// Deux causes distinctes, donc deux familles de contrôles ici.
//
// ① LA COULEUR. Les cinq envies portaient bien leur libellé, mais toutes dans la
//    MÊME capsule grisée : deux cartes voisines ne se distinguaient qu'au mot
//    près. Chaque envie a désormais sa teinte (`data-mood` + le bloc « PASTILLE
//    DE MOOD » de styles.css). On vérifie que les cinq fonds sont RÉELLEMENT
//    différents deux à deux — un jeton recopié par erreur rendrait deux envies
//    identiques sans casser quoi que ce soit d'autre — et que chaque pastille
//    tient l'AA, mesurée sur le fond opaque effectif.
//
// ② LE CONTENU. Une anecdote pouvait aussi bien porter « Chill » que « Idées ».
//    Les séries de démonstration (p401→p415 : Musique, Photo, Cuisine) sont
//    écrites comme des exemples types, une forme par envie. On tient ici la
//    forme de « Rencontrer », la seule qui soit vérifiable mécaniquement (📍 et
//    une date), et la COUVERTURE du tableau passion × envie : aucune case vide,
//    sans quoi un testeur qui coche une passion et une envie tombe sur un fil
//    vide et croit que la fonctionnalité est cassée.
//
// ⚠️ Ce fichier ne remplace pas `pastille-mood.spec.js`, qui tient l'autre bord :
// le neutre et le mood inconnu ne dessinent AUCUNE pastille. La couleur ne doit
// jamais ressusciter la capsule creuse corrigée le 2026-08-29.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOODS = ["creation", "learn", "irl", "chill", "actu"];

// Sème une publication par envie, sur une passion que le compte suit — sinon le
// repli d'exploration écarte la carte et l'on mesurerait une absence de rendu au
// lieu d'une absence de couleur (piège documenté dans `pastille-mood.spec.js`).
async function semerLesCinqEnvies(page) {
  await page.evaluate((moods) => {
    state.seed.posts = moods.map((m, i) => ({
      id: "p_env_" + m, authorId: "u_lea", passion: "cuisine", mood: m,
      text: "Publication de contrôle " + m + ".", createdAt: Date.now() - (i + 1) * 600000,
      likes: 0, comments: [],
    }));
    state.userPosts = []; state.supabasePosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` survit aux écrasements de
    // `supabasePosts`. Sans ce vidage, une publication réelle de production
    // ramenée par un rafraîchissement asynchrone se réinvite après le semis.
    window._feedExtraPosts = [];
    saveState(); goTo("feed"); renderFeed();
  }, MOODS);
  await page.waitForTimeout(900);
}

test.describe("le fil dit sa passion et son envie", () => {
  // ── ① La couleur : cinq envies, cinq fonds ────────────────────────────────
  test("chaque envie porte une couleur qui n'appartient qu'à elle", async ({ page }) => {
    await bootOnboarded(page);
    await semerLesCinqEnvies(page);

    const vues = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll("#feedList .post-mood-tag").forEach((el) => {
        const cs = getComputedStyle(el);
        out[el.dataset.mood] = { fond: cs.backgroundColor, encre: cs.color, texte: el.textContent.trim() };
      });
      return out;
    });

    // Les cinq sont rendues, chacune avec son libellé.
    for (const m of MOODS) {
      expect(vues[m], `l'envie « ${m} » doit porter une pastille`).toBeTruthy();
      expect(vues[m].texte.length, `« ${m} » : libellé non vide`).toBeGreaterThan(2);
    }
    // …et surtout : aucune couleur partagée. C'est TOUT l'objet du lot.
    const fonds = MOODS.map((m) => vues[m].fond);
    expect(new Set(fonds).size, `fonds relevés : ${fonds.join(" · ")}`).toBe(MOODS.length);
    const encres = MOODS.map((m) => vues[m].encre);
    expect(new Set(encres).size, `encres relevées : ${encres.join(" · ")}`).toBe(MOODS.length);
  });

  // ── ① bis. Une couleur illisible ne différencie rien ──────────────────────
  test("chaque pastille tient le contraste AA (4,5:1) sur son propre fond", async ({ page }) => {
    await bootOnboarded(page);
    await semerLesCinqEnvies(page);

    const mesures = await page.evaluate(() => {
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      // Fond EFFECTIF : on remonte jusqu'au premier fond opaque. Un `rgba` serait
      // pris pour une couleur pleine, alpha ignoré — d'où des jetons opaques.
      const fond = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          const v = parse(bg);
          if (v.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return v;
        }
        return [255, 255, 255];
      };
      const out = {};
      document.querySelectorAll("#feedList .post-mood-tag").forEach((el) => {
        const st = getComputedStyle(el);
        const c = lum(parse(st.color)), f = lum(fond(el));
        const hi = Math.max(c, f), lo = Math.min(c, f);
        out[el.dataset.mood] = { ratio: (hi + 0.05) / (lo + 0.05), couleur: st.color, taillePx: parseFloat(st.fontSize) };
      });
      return out;
    });

    for (const m of MOODS) {
      // 11 px reste du « texte normal » : le seuil des grands caractères (3:1)
      // ne s'applique qu'à partir de 18,66 px en gras.
      expect(mesures[m].taillePx, `« ${m} » : une pastille plus grande changerait le seuil`).toBeLessThan(18.66);
      expect(mesures[m].ratio, `« ${m} » : ${mesures[m].couleur} à ${mesures[m].ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  // ── ② La couverture : aucune case vide du tableau passion × envie ─────────
  // Un testeur qui coche une passion et une envie et ne voit RIEN conclut que
  // l'application est cassée, pas que le contenu manque.
  test("chaque passion du catalogue a du contenu dans les cinq envies", async ({ page }) => {
    await bootOnboarded(page);

    const trous = await page.evaluate((moods) => {
      const posts = state.seed.posts || [];
      const vides = [];
      PASSIONS.forEach((pa) => {
        moods.forEach((mo) => {
          if (!posts.some((p) => p.passion === pa.id && p.mood === mo)) vides.push(pa.id + "/" + mo);
        });
      });
      return vides;
    }, MOODS);

    expect(trous, `cases vides du tableau passion × envie : ${trous.join(", ")}`).toEqual([]);
  });

  // ── ② bis. Les séries de démonstration gardent leur forme ─────────────────
  // Les quinze publications p401→p415 sont les EXEMPLES TYPES montrés en premier
  // (ce sont les plus fraîches de leur passion). Si l'une change d'envie, le
  // dégradé de couleurs du haut du fil disparaît sans que rien ne casse.
  test("les trois séries de démonstration couvrent bien les cinq envies", async ({ page }) => {
    await bootOnboarded(page);

    const series = await page.evaluate(() => {
      const par = (id) => (state.seed.posts || []).find((p) => p.id === id) || null;
      const lot = (ids) => ids.map(par);
      return {
        musique: lot(["p401", "p402", "p403", "p404", "p405"]),
        photo: lot(["p406", "p407", "p408", "p409", "p410"]),
        cuisine: lot(["p411", "p412", "p413", "p414", "p415"]),
      };
    });

    for (const [passion, lot] of Object.entries(series)) {
      expect(lot.filter(Boolean).length, `série ${passion} : les 5 publications existent`).toBe(5);
      expect(lot.every((p) => p.passion === passion), `série ${passion} : toutes sur la même passion`).toBe(true);
      expect(new Set(lot.map((p) => p.mood)).size, `série ${passion} : cinq envies distinctes`).toBe(5);
      lot.forEach((p) => expect(MOODS, `${p.id} : envie connue de la table des libellés`).toContain(p.mood));
    }
  });

  // ── ② ter. « Rencontrer » se reconnaît sans lire la pastille ──────────────
  // La forme tenue par les séries : un lieu (📍) et un jour. C'est ce qui permet
  // au testeur de faire le lien entre l'envie affichée et ce qu'il lit.
  test("les exemples « Rencontrer » annoncent un lieu et une date", async ({ page }) => {
    await bootOnboarded(page);

    const rdv = await page.evaluate(() => {
      const jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
      return ["p403", "p408", "p413"].map((id) => {
        const p = (state.seed.posts || []).find((x) => x.id === id) || {};
        const t = String(p.text || "").toLowerCase();
        return { id, mood: p.mood, lieu: (p.text || "").indexOf("📍") > -1, jour: jours.some((j) => t.indexOf(j) > -1) };
      });
    });

    rdv.forEach((r) => {
      expect(r.mood, `${r.id} porte bien l'envie « Rencontrer »`).toBe("irl");
      expect(r.lieu, `${r.id} annonce un lieu (📍)`).toBe(true);
      expect(r.jour, `${r.id} annonce un jour`).toBe(true);
    });
  });
});
