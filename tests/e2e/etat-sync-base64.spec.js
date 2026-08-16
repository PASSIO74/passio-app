// ═══════════════════════════════════════════════════════════════════════════
// SYNCHRONISATION D'ÉTAT — aucune image base64 ne doit partir au serveur.
//
// Invariant projet (ADR-004, CLAUDE.md) : jamais de base64 en base, les médias
// vont dans Storage. `_syncableState()` expurgeait déjà les photos des profils
// passion — mais PAS celles du compte (`user.general`).
//
// Mesuré en production le 2026-08-16, c'est ce trou qui coûtait le plus cher :
//   user_state : 80 lignes, 10 Mo au total
//   état médian : 1 288 octets · plus gros état : 4 731 kB
//   dont avatarPhoto 2 352 kB + coverPhoto 2 352 kB en base64 (99,7 % du blob)
// Renvoyé à CHAQUE synchronisation, sur le 2ᵉ endpoint le plus appelé :
//   p95 = 2 844 ms, maximum observé 43 199 ms.
//
// Une seule ligne sur 80 était concernée — mais elle suffisait à porter toute la
// traîne. Ce spec vérifie les DEUX emplacements, pour que la prochaine photo
// ajoutée ailleurs ne recrée pas le trou.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const URL_STORAGE = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/avatars/moi.jpg";

test.describe("Synchronisation d'état — hygiène base64", () => {
  test("les photos base64 sont expurgées de l'état envoyé, les URL Storage conservées", async ({ page }) => {
    test.setTimeout(90000);
    await bootOnboarded(page);
    await page.waitForFunction(
      () => typeof _syncableState === "function" && typeof state !== "undefined" && !!state,
      null, { timeout: 20000 },
    );

    const r = await page.evaluate(([b64, url]) => {
      state.user = state.user || {};
      state.user.general = Object.assign({}, state.user.general, {
        avatarPhoto: b64, coverPhoto: b64, username: "ben123",
      });
      state.user.profiles = [
        { id: "p_b64", photo: b64, coverPhoto: b64 },
        { id: "p_url", photo: url, coverPhoto: url },
      ];
      const s = _syncableState();
      const prof = (id) => s.user.profiles.find((p) => p.id === id);
      return {
        // Ce qui part au serveur
        avatarEnvoye: s.user.general.avatarPhoto,
        coverEnvoye: s.user.general.coverPhoto,
        profB64Photo: prof("p_b64").photo,
        profUrlPhoto: prof("p_url").photo,
        profUrlCover: prof("p_url").coverPhoto,
        usernameEnvoye: s.user.general.username,
        // Ce qui doit rester intact EN MÉMOIRE
        avatarLocal: state.user.general.avatarPhoto,
        tailleCharge: JSON.stringify(s).length,
      };
    }, [B64, URL_STORAGE]);

    // ── Le base64 ne part pas ──────────────────────────────────────────────
    expect(r.avatarEnvoye, "avatarPhoto base64 du COMPTE doit être expurgée").toBeNull();
    expect(r.coverEnvoye, "coverPhoto base64 du COMPTE doit être expurgée").toBeNull();
    expect(r.profB64Photo, "photo base64 d'un profil passion doit être expurgée").toBeNull();

    // ── Les URL Storage, elles, PASSENT : ce sont elles qui portent la
    //    synchronisation cross-appareil. Les expurger casserait la feature.
    expect(r.profUrlPhoto, "une URL Storage doit être conservée").toBe(URL_STORAGE);
    expect(r.profUrlCover, "une couverture en URL Storage doit être conservée").toBe(URL_STORAGE);

    // ── Le reste de l'état n'est pas abîmé ─────────────────────────────────
    expect(r.usernameEnvoye, "les champs non-image ne doivent pas être touchés").toBe("ben123");

    // ── L'expurgation ne touche QUE la copie envoyée ───────────────────────
    expect(r.avatarLocal, "la photo doit rester intacte en mémoire (affichage local)").toBe(B64);

    // ── Et la charge reste petite ──────────────────────────────────────────
    // Sans ce garde, un futur champ image passerait inaperçu jusqu'à ce qu'un
    // utilisateur réel dépasse la limite de payload et bloque TOUTE sa synchro.
    expect(r.tailleCharge, `charge de synchronisation : ${r.tailleCharge} octets`).toBeLessThan(200000);
  });
});
