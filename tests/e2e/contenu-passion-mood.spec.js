// ============================================================================
// LE FIL DE DÉMONSTRATION DIT SA PASSION ET SON ENVIE (2026-09-02)
// ----------------------------------------------------------------------------
// Remarque d'un testeur, essai réel : « le contenu fake du fil n'est pas assez
// explicite par rapport à la passion et au mood, il faut que les testeurs
// comprennent bien la différence visuellement ».
//
// Deux causes distinctes, donc deux familles de contrôles ici.
//
// ① LA COULEUR. Les envies portaient bien leur libellé, mais toutes dans la
//    MÊME capsule grisée : deux cartes voisines ne se distinguaient qu'au mot
//    près. Chaque envie a désormais sa teinte (`data-mood` + le bloc « PASTILLE
//    DE MOOD » de styles.css). On vérifie que les trois fonds sont RÉELLEMENT
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
// ③ LE VOCABULAIRE MORT. « chill » et « actu » ne sont plus publiables ni
//    nommables. Une carte qui les porte ne doit plus rien afficher : les
//    ressusciter en pastille remettrait sous les yeux du testeur deux mots
//    qu'il ne trouvera nulle part ailleurs dans le produit.
//
// ⚠️ Ce fichier ne remplace pas `pastille-mood.spec.js`, qui tient l'autre bord :
// le neutre et le mood inconnu ne dessinent AUCUNE pastille. La couleur ne doit
// jamais ressusciter la capsule creuse corrigée le 2026-08-29.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ⚠️ TROIS, et pas cinq. « chill » et « actu » ont perdu leur libellé le
// 2026-09-02 : le produit n'a plus que quatre intentions (Explorer · Apprendre ·
// Idées · Rencontrer), dont trois seulement sont posées par l'AUTEUR.
// « Explorer » n'est pas ici et ne peut pas y être : elle se calcule côté
// lecteur (auteur non suivi, passion non cochée) et ne regarde jamais le mood.
const MOODS = ["creation", "learn", "irl"];

// Les valeurs léguées : plus de libellé, donc plus de pastille — mais toujours
// admises dans le fil, ce que `exploration-moods.spec.js` tient de son côté.
const MOODS_LEGUES = ["chill", "actu"];

// Sème une publication par envie, sur une passion que le compte suit — sinon le
// repli d'exploration écarte la carte et l'on mesurerait une absence de rendu au
// lieu d'une absence de couleur (piège documenté dans `pastille-mood.spec.js`).
async function semerLesEnvies(page, moods) {
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
  }, moods);
  await page.waitForTimeout(900);
}
const semerLesTroisEnvies = (page) => semerLesEnvies(page, MOODS);

test.describe("le fil dit sa passion et son envie", () => {
  // ── ① La couleur : cinq envies, cinq fonds ────────────────────────────────
  test("chaque envie porte une couleur qui n'appartient qu'à elle", async ({ page }) => {
    await bootOnboarded(page);
    await semerLesTroisEnvies(page);

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
    await semerLesTroisEnvies(page);

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

  // ── ① ter. La PASSION doit se voir autant que l'envie ────────────────────
  // La remarque du testeur visait « la passion ET le mood ». La carte ne nomme
  // la passion qu'une fois (fiche 11) et cette mention partageait le gris
  // `--muted` avec l'heure : invisible. Elle est enrobée dans
  // `.post-passion-tag`, en accent et graisse 700.
  //
  // ⚠️ Ce test tient TROIS bords à la fois, parce que le volet est fragile aux
  // deux extrêmes : l'enrobage doit exister, il ne doit pas devenir une SECONDE
  // mention (un nettoyage « une seule mention » retirerait le span sans rien
  // casser d'autre), et le texte rendu doit rester identique à ce que deux
  // autres suites assertent déjà.
  test("la passion de la publication est lisible, et nommée une seule fois", async ({ page }) => {
    await bootOnboarded(page);

    const vu = await page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = renderPostHTML({
        id: "p_pass", authorId: "me", passion: "moto", type: "text",
        text: "Contrôle.", mood: "creation", createdAt: Date.now(),
        likes: 0, comments: [], _source: "me",
      });
      document.body.appendChild(box);
      const meta = box.querySelector(".post-author-meta");
      const tag = box.querySelector(".post-passion-tag");
      const csTag = tag ? getComputedStyle(tag) : null;
      const csMeta = meta ? getComputedStyle(meta) : null;
      const r = {
        tags: box.querySelectorAll(".post-passion-tag").length,
        identites: box.querySelectorAll(".ident-passions").length,
        texteTag: tag ? tag.textContent.trim() : "",
        texteMeta: meta ? meta.textContent.trim() : "",
        couleurTag: csTag ? csTag.color : "",
        couleurMeta: csMeta ? csMeta.color : "",
        graisse: csTag ? csTag.fontWeight : "",
      };
      box.remove();
      return r;
    });

    expect(vu.tags, "une seule mention, enrobée").toBe(1);
    expect(vu.identites, "et toujours pas de ligne d'identité sur une carte").toBe(0);
    expect(vu.texteTag, "l'enrobage porte bien la passion de la PUBLICATION").toContain("Moto");
    expect(vu.texteMeta, "le texte de la ligne est inchangé : passion puis heure").toContain("Moto ·");
    // Le point du lot : la passion ne se lit plus dans le gris de l'heure.
    expect(vu.couleurTag, `passion ${vu.couleurTag} vs heure ${vu.couleurMeta}`).not.toBe(vu.couleurMeta);
    expect(Number(vu.graisse), "et elle est en gras").toBeGreaterThanOrEqual(700);
  });

  // ── ③ Le vocabulaire mort ne revient pas par la couleur ──────────────────
  // `data-mood` colore la pastille : si « chill » ou « actu » retrouvait un
  // libellé, il retrouverait AUSSI une couleur, et le testeur relirait deux mots
  // que le Studio ne propose plus. Le test sème les deux valeurs et exige zéro
  // pastille — la publication, elle, doit rester rendue.
  test("les valeurs léguées ne dessinent plus aucune pastille", async ({ page }) => {
    await bootOnboarded(page);
    await semerLesEnvies(page, MOODS_LEGUES);

    const vu = await page.evaluate(() => ({
      cartes: document.querySelectorAll("#feedList article.post").length,
      pastilles: document.querySelectorAll("#feedList .post-mood-tag").length,
    }));
    expect(vu.cartes, "les publications léguées restent rendues").toBeGreaterThanOrEqual(MOODS_LEGUES.length);
    expect(vu.pastilles, "…mais muettes, comme le neutre").toBe(0);
  });

  // ── ② La couverture : aucune case vide du tableau passion × envie ─────────
  // Un testeur qui coche une passion et une envie et ne voit RIEN conclut que
  // l'application est cassée, pas que le contenu manque.
  test("chaque passion du catalogue a du contenu dans les trois envies", async ({ page }) => {
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
  // (ce sont les plus fraîches de leur passion). Chaque série tient la même
  // partition, et c'est elle qui donne au testeur le dégradé du haut du fil :
  //
  //     💡 Idées · 📚 Apprendre · 🤝 Rencontrer · 🤝 Rencontrer (avec activité) · neutre
  //
  // ⚠️ QUATRE cartes portent une pastille, la cinquième AUCUNE — et c'est le
  // produit qui l'impose, pas un choix de mise en scène : il n'y a plus que
  // trois envies d'auteur depuis le 2026-09-02. La quatrième intention du rail,
  // « Explorer », ne peut pas apparaître ici : elle se calcule côté lecteur.
  // Une série qui redeviendrait « cinq envies distinctes » signifierait que le
  // vocabulaire mort est revenu.
  test("les trois séries de démonstration tiennent la partition des envies", async ({ page }) => {
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
      expect(lot.map((p) => p.mood), `série ${passion} : la partition`)
        .toEqual(["creation", "learn", "irl", "irl", "all"]);
      // Exactement UNE carte de la série est reliée à une activité réelle : elle
      // porte « Voir l'activité » au lieu de « Trouver une activité ».
      const reliees = lot.filter((p) => p.eventId);
      expect(reliees.length, `série ${passion} : une seule carte reliée`).toBe(1);
      expect(reliees[0].mood, "et c'est une « Rencontrer »").toBe("irl");
    }
  });

  // ── ② quater. « Voir l'activité » a besoin d'une activité qui EXISTE ──────
  // `refEvenement` accepte l'`eventId`, mais `decorerActivite` ne pose le lien
  // que si `trouverEvenement` retrouve la fiche : un identifiant fantaisiste ne
  // casse rien — il ne peint simplement RIEN, et le défaut est invisible.
  // C'est le pire cas pour du contenu de démonstration, d'où ce contrôle.
  test("chaque publication reliée pointe vers une activité réellement présente", async ({ page }) => {
    await bootOnboarded(page);

    const r = await page.evaluate(() => {
      const ids = new Set((typeof allEvents === "function" ? allEvents() : []).map((e) => e && e.id));
      const reliees = (state.seed.posts || []).filter((p) => p.eventId);
      return {
        combien: reliees.length,
        orphelines: reliees.filter((p) => !ids.has(String(p.eventId))).map((p) => p.id + "→" + p.eventId),
        // Une publication reliée qui ne serait pas « Rencontrer » afficherait un
        // rendez-vous sous une étiquette qui ne l'annonce pas.
        malEtiquetees: reliees.filter((p) => p.mood !== "irl").map((p) => p.id + " (" + p.mood + ")"),
      };
    });

    expect(r.combien, "le socle propose bien des rencontres reliées").toBeGreaterThan(0);
    expect(r.orphelines, `activités introuvables : ${r.orphelines.join(", ")}`).toEqual([]);
    expect(r.malEtiquetees, `reliées sans être « Rencontrer » : ${r.malEtiquetees.join(", ")}`).toEqual([]);
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
