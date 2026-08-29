// ============================================================================
// LA PASSION ACTIVE N'EST JAMAIS UNE PASSION ARCHIVÉE (2026-08-29)
// ----------------------------------------------------------------------------
// Le lot UI-8 pose une règle : `currentProfileId` désigne toujours une passion
// VIVANTE. `currentProfile()` (app-06) rend `null` pour une passion archivée et
// son commentaire dit pourquoi il ne réécrit rien — « c'est `archiverPassion`
// qui nettoie, une fois ». Le nettoyage appartient donc aux points d'ÉCRITURE.
//
// `archiverPassion` refuse d'archiver la passion active, et `deleteProfile`
// retombe sur la première vivante. Mais `supaLoadUserState` (app-02) restaurait
// `currentProfileId` sur le seul test « il est toujours dans la liste fusionnée » :
// or une passion archivée sur un AUTRE appareil reste dans `profiles`, avec
// `archived:true`.
//
// Mesuré avant correctif :
//   currentProfileId  → "p_b"  (archivée)
//   écran Profil      → « Passion active : 🍳 Cuisine »
//   passionsVivantes  → ["p_a"]  — le Fil ne la connaissait plus
//
// L'utilisateur voyait donc comme active une passion qu'il avait rangée, et le
// Studio publiait dedans.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ⚠️ Ce test appelle la FONCTION RÉELLE `restaurerPassionActiveApresFusion`
// (app-02), celle que `supaLoadUserState` invoque après avoir fusionné la
// liste du serveur. Une première version de ce fichier RECOPIAIT sa logique
// dans le test : elle n'aurait prouvé que sa propre cohérence, et serait
// restée verte si le code de production avait changé. C'est exactement le
// « test creux » que `scripts/audit-tests-creux.js` traque — la normalisation
// a donc été extraite en fonction nommée pour être exerçable de l'extérieur.
async function restaurerApresFusion(page, { profils, localCurrentId, serveurCurrentId }) {
  return page.evaluate(({ profils, localCurrentId, serveurCurrentId }) => {
    state.user.profiles = profils;
    state.user.currentProfileId = serveurCurrentId;

    restaurerPassionActiveApresFusion(localCurrentId);

    saveState();
    const active = (state.user.profiles || []).find((p) => p.id === state.user.currentProfileId);
    return {
      currentProfileId: state.user.currentProfileId,
      active_est_archivee: !!(active && active.archived),
      vivantes: passionsVivantes().map((p) => p.id),
    };
  }, { profils, localCurrentId, serveurCurrentId });
}

const DEUX = [
  { id: "p_a", passion: "musique", name: "Ben", bio: "" },
  { id: "p_b", passion: "cuisine", name: "Ben", bio: "", archived: true },
];

test.describe("après une synchronisation, la passion active", () => {
  test("n'est pas la passion locale si elle a été archivée ailleurs", async ({ page }) => {
    await bootOnboarded(page);
    const r = await restaurerApresFusion(page, {
      profils: DEUX, localCurrentId: "p_b", serveurCurrentId: "p_a",
    });
    expect(r.active_est_archivee).toBe(false);
    expect(r.currentProfileId).toBe("p_a");
  });

  test("n'est pas non plus une passion archivée reçue du serveur", async ({ page }) => {
    await bootOnboarded(page);
    const r = await restaurerApresFusion(page, {
      profils: DEUX, localCurrentId: null, serveurCurrentId: "p_b",
    });
    expect(r.active_est_archivee).toBe(false);
    expect(r.currentProfileId).toBe("p_a");
  });

  // Garde anti-creux : sans elle, ce fichier passerait aussi si la restauration
  // locale avait entièrement cessé de fonctionner.
  test("reste la passion locale quand celle-ci est bien vivante", async ({ page }) => {
    await bootOnboarded(page);
    const r = await restaurerApresFusion(page, {
      profils: [
        { id: "p_a", passion: "musique", name: "Ben", bio: "" },
        { id: "p_c", passion: "photo", name: "Ben", bio: "" },
      ],
      localCurrentId: "p_c", serveurCurrentId: "p_a",
    });
    expect(r.currentProfileId).toBe("p_c");
    expect(r.active_est_archivee).toBe(false);
  });
});
