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

test("① Supabase disponible : le référentiel SERVEUR fait autorité", async ({ page }) => {
  // Le serveur ne connaît que trois passions : c'est lui qui doit décider.
  await boot(page, { serveur: ["moto", "yoga", "cuisine"] });

  const vu = await page.evaluate(() => ({
    lu: window.__refLu,
    moto: estPassionCanonique("moto"),
    // « musique » est dans PASSIONS mais PAS dans ce référentiel serveur :
    // si le serveur fait autorité, elle doit être refusée.
    musique: estPassionCanonique("musique"),
  }));
  expect(vu.lu).toBeGreaterThan(0);
  expect(vu.moto).toBe(true);
  expect(vu.musique, "le serveur prime sur la liste locale").toBe(false);
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
