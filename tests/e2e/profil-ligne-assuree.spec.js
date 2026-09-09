// ═══════════════════════════════════════════════════════════════════════════
// PROFIL — NE PAS RÉCLAMER UNE LIGNE QU'ON VIENT DE LIRE
//
// Défaut relevé par la sentinelle le 2026-09-09 sur la production (issue #312),
// famille « appels réseau refusés » (telemetry_events, type=api) :
//
//     HTTP 409 sur POST /rest/v1/profiles : conflit — la ligne existe déjà
//     9 appel(s) refusé(s), 3 compte(s) identifié(s).
//
// Le seul POST vers `profiles` du dépôt est `_insertProfilMinimalSiAbsent`
// (app-08), appelé par `supaEnsureProfileExists`. Le conflit de clé primaire y
// est correctement lu et traité comme « la ligne existe » : rien ne casse pour
// l'utilisateur, et c'est précisément ce qui rendait le défaut invisible.
//
// ⚠️ LA CAUSE N'EST PAS LE TRAITEMENT DU CONFLIT, C'EST L'APPEL LUI-MÊME.
// `boot()` LIT la ligne du compte quelques instants plus tôt
// (`select("username,…").eq("id", MY_UID)`), puis JETTE cette preuve : le cache
// `_profilAssureUid` n'était posé que par un aller-retour d'écriture. Le premier
// geste de la session — publier, commenter, envoyer un message, suivre — partait
// donc sur un INSERT voué au 409. Et la branche d'adoption exige `srv.username`
// ET un profil local : un compte au pseudo vide repassait par là à chaque
// session, ce qui explique un volume stable sur un petit nombre de comptes.
//
// Même famille que « newestWorker is null » (#304) : un appel d'arrière-plan
// sans effet pour l'utilisateur, qui pollue le tableau de bord servant à voir
// les vrais défauts. Un défaut périodique se compte en occurrences.
//
// Ce que ce banc garde — et il ÉCHOUE sur le code d'avant (réinjection) :
//   ① la preuve de lecture évite l'INSERT (avant : `_marquerProfilAssure`
//      n'existe pas, et l'insert part quand même) ;
//   ② sans preuve, l'INSERT part toujours : le correctif ne débranche PAS la
//      création d'une ligne réellement absente ;
//   ③ la preuve d'un AUTRE compte ne marque rien (sinon la ligne du compte
//      courant ne serait jamais créée, et cinq clés étrangères avec elle) ;
//   ④ contrat de source : dans `boot()`, la marque suit le `select` et PRÉCÈDE
//      la branche d'adoption — c'est le câblage, qu'aucun test de fonction ne
//      voit, et sa suppression laisserait ① ② ③ verts.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");

/**
 * Remplace `supa.from` par un compteur d'écritures sur `profiles`, et remet le
 * cache d'existence à zéro.
 *
 * ⚠️ On MUTE l'objet `supa` (le même que `window.supa`) au lieu de réaffecter
 * `window.supa` : `supa` est un `let` de portée script dans app-08, une
 * réaffectation de la propriété window ne changerait rien à ce que le code
 * appelle. C'est aussi ce qui garantit qu'AUCUNE écriture ne part vers la
 * production depuis ce banc.
 */
async function fauxSupaProfiles(page) {
  await page.evaluate(() => {
    window.__insertsProfiles = 0;
    window._resetProfilAssure();
    window.supa.from = function (table) {
      return {
        insert: function () {
          if (table === "profiles") window.__insertsProfiles++;
          // Le refus EXACT de PostgREST sur un conflit de clé primaire : c'est
          // lui que `_conflitClePrimaireProfiles` exige de prouver.
          return Promise.resolve({
            data: null,
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "profiles_pkey"',
              details: "Key (id)=(" + String(localStorage.getItem("passio_uid")) + ") already exists.",
            },
          });
        },
      };
    };
  });
}

const uidCourant = (page) =>
  page.evaluate(() => (typeof MY_UID !== "undefined" ? MY_UID : null));

test.describe("Profil — la ligne prouvée par une lecture ne se réinsère pas", () => {
  test("① la preuve de lecture évite l'INSERT (donc le 409)", async ({ page }) => {
    await bootOnboarded(page);
    await fauxSupaProfiles(page);

    const uid = await uidCourant(page);
    expect(uid).toBeTruthy();

    const ok = await page.evaluate(async (u) => {
      // Ce que `boot()` fait après avoir LU la ligne du compte.
      window._marquerProfilAssure(u);
      return await window.supaEnsureProfileExists();
    }, uid);

    expect(ok).toBe(true);
    expect(await page.evaluate(() => window.__insertsProfiles)).toBe(0);
  });

  test("② sans preuve, l'INSERT part toujours : la création n'est pas débranchée", async ({ page }) => {
    await bootOnboarded(page);
    await fauxSupaProfiles(page);

    const ok = await page.evaluate(async () => await window.supaEnsureProfileExists());

    // Le conflit de clé primaire vaut « la ligne existe » : l'appel réussit…
    expect(ok).toBe(true);
    // …mais il a bien été TENTÉ, une seule fois (le cache tient le reste).
    expect(await page.evaluate(() => window.__insertsProfiles)).toBe(1);
    await page.evaluate(async () => await window.supaEnsureProfileExists());
    expect(await page.evaluate(() => window.__insertsProfiles)).toBe(1);
  });

  test("③ la preuve d'un autre compte ne marque rien", async ({ page }) => {
    await bootOnboarded(page);
    await fauxSupaProfiles(page);

    const marque = await page.evaluate(() => window._marquerProfilAssure("u_un_autre_compte"));
    expect(marque).toBe(false);

    await page.evaluate(async () => await window.supaEnsureProfileExists());
    expect(await page.evaluate(() => window.__insertsProfiles)).toBe(1);
  });

  test("④ contrat de source : la marque suit le select et précède l'adoption", async () => {
    const src = fs.readFileSync(SOURCE_APP08, "utf8");

    // Le seul point de déclaration : deux `function _marquerProfilAssure`
    // top-level se remplaceraient en silence (17 scripts partagent `window`).
    expect(src.match(/function _marquerProfilAssure\s*\(/g).length).toBe(1);

    const iSelect = src.indexOf('.select("username,emoji,color,avatar_url,passion_id,bio")');
    expect(iSelect).toBeGreaterThan(-1);
    const apres = src.slice(iSelect);

    const iMarque = apres.indexOf("_marquerProfilAssure(MY_UID)");
    const iAdoption = apres.indexOf("if (srv && srv.username");
    expect(iMarque).toBeGreaterThan(-1);
    expect(iAdoption).toBeGreaterThan(-1);
    // AVANT la branche d'adoption : la preuve d'existence ne doit dépendre ni du
    // pseudo de la ligne, ni de l'existence d'un profil local.
    expect(iMarque).toBeLessThan(iAdoption);
  });
});
