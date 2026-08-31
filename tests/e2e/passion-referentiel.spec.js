// ADR-010 — le référentiel Supabase décide, la liste locale sert de repli.
//
// SÉPARATION DES RÔLES, à ne pas confondre :
//   · la liste SERVEUR (`passions`) décide si un identifiant respecte la clé
//     étrangère — c'est elle qui autorise ou non une écriture ;
//   · la liste LOCALE (`PASSIONS`) décide ce que l'INTERFACE propose.
// Les deux sont synchrones aujourd'hui ; rien ne garantit qu'elles le restent.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LOCALES = ["musique","photo","voyage","cuisine","sport","litterature","cinema",
  "tech","art","jardinage","metier","jeuxvideo","yoga","mode","danse","podcast","moto","animaux","actu"];

// Installe un SDK factice qui sert le référentiel demandé, ou échoue.
async function boot(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.__refLu = 0;
    window.supabase = {
      createClient: () => ({
        from: (t) => ({
          select: () => {
            if (t === "passions") {
              window.__refLu++;
              const p = o.panne
                ? Promise.resolve({ data: null, error: { message: "réseau indisponible" } })
                : Promise.resolve({ data: (o.serveur || []).map(id => ({ id })), error: null });
              return Object.assign(p, { eq: () => ({ maybeSingle: async () => ({ data: null }) }) });
            }
            return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
          },
          upsert: async () => ({ error: null }),
          insert: async () => ({ error: null }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();                       // déclenche chargerReferentielPassions
  }, opts);
  await page.waitForTimeout(700);          // laisse la requête d'arrière-plan répondre
}

test("① le référentiel serveur AJOUTE ; une réponse partielle ne bloque rien", async ({ page }) => {
  // ⚠️ CE TEST A CHANGÉ DE SENS LE 2026-08-31, délibérément.
  //
  // Il exigeait auparavant que le serveur puisse RÉTRÉCIR la liste : avec un
  // référentiel de trois passions, « musique » devait être refusée. C'était
  // dangereux, parce que `_referentielPassions` est un cache à UN SEUL COUP —
  // une réponse serveur partielle (plafond `max-rows` de PostgREST, réponse
  // tronquée, panne à mi-parcours) s'installait pour TOUTE la session et
  // interdisait définitivement de publier dans une passion parfaitement
  // légitime. Un incident passager devenait un blocage permanent.
  //
  // La liste locale est donc un PLANCHER : la migration du 2026-08-15 a vérifié
  // que ces identifiants existent en production, et la clé étrangère empêche
  // d'en supprimer un qui soit référencé. Le serveur ne peut qu'en AJOUTER.
  await boot(page, { serveur: ["moto", "yoga", "cuisine"] });

  const vu = await page.evaluate(() => ({
    lu: window.__refLu,
    moto: estPassionCanonique("moto"),
    // « musique » est dans PASSIONS et absente de CE référentiel partiel :
    // elle doit rester publiable, sinon une réponse tronquée verrouille le compte.
    musique: estPassionCanonique("musique"),
    // Et la liste blanche reste une liste blanche : l'union n'ouvre rien d'autre.
    inconnue: estPassionCanonique("custom_tricot_ab12"),
    fantome: estPassionCanonique("autre"),
  }));
  expect(vu.lu).toBeGreaterThan(0);
  expect(vu.moto).toBe(true);
  expect(vu.musique, "une réponse serveur partielle ne retire jamais une passion du plancher local").toBe(true);
  expect(vu.inconnue).toBe(false);
  expect(vu.fantome).toBe(false);
});

test("① bis — un référentiel partiel n'interdit PAS de publier (le cas réel)", async ({ page }) => {
  // La conséquence concrète du test précédent, mesurée sur le vrai point
  // d'écriture plutôt que sur le prédicat seul : c'est la publication qui
  // compte, pas la valeur de retour d'une fonction.
  await boot(page, { serveur: ["moto"] });

  const vu = await page.evaluate(async () => {
    window.__envoye = [];
    // On observe l'insert sans passer par le SDK du helper de cette suite.
    const vraiSupa = supa;
    supa.from = (t) => ({
      insert: (p) => { window.__envoye.push({ t, p }); const r = Promise.resolve({ data: [{ id: "x" }], error: null }); r.select = () => Promise.resolve({ data: [{ id: "x" }], error: null }); return r; },
      upsert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    const ok = await window.__vraiSupa.publishPost({
      id: "p_musique", passion: "musique", mood: "all", text: "Concert",
      type: "text", createdAt: Date.now(),
    });
    return { ok, envoye: window.__envoye };
  });

  expect(vu.ok, "publier dans « musique » reste possible malgré un référentiel à une entrée").toBe(true);
  expect(vu.envoye.length).toBe(1);
  expect(vu.envoye[0].p.passion_id).toBe("musique");
});

test("② Supabase indisponible : les 19 passions locales restent utilisables", async ({ page }) => {
  await boot(page, { panne: true });

  const vu = await page.evaluate((ids) => {
    const res = {};
    ids.forEach((id) => { res[id] = estPassionCanonique(id); });
    return { res, inconnue: estPassionCanonique("custom_tricot_ab12"), autre: estPassionCanonique("autre") };
  }, LOCALES);

  // ⚠️ Un échec de chargement ne doit JAMAIS bloquer les passions existantes.
  const refusees = LOCALES.filter((id) => !vu.res[id]);
  expect(refusees, "aucune passion locale ne doit être refusée en cas de panne").toEqual([]);
  // Le repli reste une liste BLANCHE : il ne laisse pas passer n'importe quoi.
  expect(vu.inconnue).toBe(false);
  expect(vu.autre).toBe(false);
});

test("③ passion absente de PASSIONS mais présente en base : canonique, sans être proposée", async ({ page }) => {
  // Le serveur connaît une passion que le client ignore — le cas d'une liste
  // locale en retard. Elle doit être CANONIQUE (la FK l'accepterait)…
  await boot(page, { serveur: LOCALES.concat(["apiculture"]) });

  const vu = await page.evaluate(() => ({
    canonique: estPassionCanonique("apiculture"),
    // …et pourtant ABSENTE des grilles, qui sont bâties sur allPassions().
    dansLeCatalogueLocal: allPassions().some((p) => p.id === "apiculture"),
    classement: classerPassion("apiculture"),
  }));

  expect(vu.canonique, "la liste serveur décide de la validité").toBe(true);
  expect(vu.dansLeCatalogueLocal, "la liste locale décide de ce qui est proposé").toBe(false);
  expect(vu.classement).toBe("canonique");
});

test("les trois classements, et les deux politiques", async ({ page }) => {
  await boot(page, { serveur: LOCALES });
  const vu = await page.evaluate(() => ({
    classement: {
      canonique: classerPassion("moto"),
      nul: classerPassion(null),
      vide: classerPassion(""),
      inconnu: classerPassion("custom_x"),
      autre: classerPassion("autre"),
    },
    // OBLIGATOIRE : null et non canonique sont tous deux refusés.
    requis: {
      canonique: requiredCanonicalPassion("moto"),
      nul: requiredCanonicalPassion(null),
      inconnu: requiredCanonicalPassion("custom_x"),
    },
    // FACULTATIVE : null passe, le non canonique est normalisé en null.
    facultatif: {
      canonique: optionalCanonicalPassion("moto"),
      nul: optionalCanonicalPassion(null),
      inconnu: optionalCanonicalPassion("custom_x"),
      autre: optionalCanonicalPassion("autre"),
    },
  }));

  expect(vu.classement).toEqual({
    canonique: "canonique", nul: "null", vide: "null",
    inconnu: "non_canonique", autre: "non_canonique",
  });

  expect(vu.requis.canonique.ok).toBe(true);
  expect(vu.requis.nul.ok).toBe(false);
  expect(vu.requis.nul.motif).toBe("null");
  expect(vu.requis.inconnu.ok).toBe(false);
  expect(vu.requis.inconnu.motif).toBe("non_canonique");

  expect(vu.facultatif.canonique).toBe("moto");
  expect(vu.facultatif.nul).toBeNull();
  expect(vu.facultatif.inconnu, "un id non canonique devient null, il ne bloque pas").toBeNull();
  expect(vu.facultatif.autre, "la sentinelle « autre » est rejetée comme le reste").toBeNull();
});
