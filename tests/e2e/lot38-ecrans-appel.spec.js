// ═══════════════════════════════════════════════════════════════════════════
// LOT-38 (audit UX/UI du 2026-11-10, MSG-C26) — ÉCRANS D'APPEL
//   ① appel entrant : dialogue nommé, focus dedans, commandes nommées et
//      légendées, Refuser et Répondre écartés (≥ 48 px) ;
//   ② appel sortant : « Ça sonne… », pas de minuteur avant la connexion, pas de
//      chiffres réseau, commandes nommées, état du micro annoncé ;
//   ③ avatar : la photo du profil quand elle existe ; une URL hostile n'en
//      devient jamais une.
// Écrans rendus directement (les appels sont coupés en production) : aucune
// écriture réseau, aucun média demandé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c838";

test("① appel entrant : un dialogue aux commandes nommées et écartées", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((lea) => {
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e" });
    _callRenderIncomingUI({ callId: "l38", from: lea, kind: "voice" });
    const el = document.getElementById("callOverlay");
    const [refus, rep] = el.querySelectorAll(".call-control-btn");
    const a = refus.getBoundingClientRect(), b = rep.getBoundingClientRect();
    return new Promise((res) => setTimeout(() => {
      const out = {
        role: el.getAttribute("role"), nom: el.getAttribute("aria-label"),
        labels: [refus.getAttribute("aria-label"), rep.getAttribute("aria-label")],
        legendes: [...el.querySelectorAll(".call-commande > span")].map((s) => s.textContent),
        ecart: b.left - a.right,
        focus: el.contains(document.activeElement),
      };
      _callCloseUI();
      res(out);
    }, 50));
  }, LEA);
  expect(r.role).toBe("dialog");
  expect(r.nom).toBe("Appel avec Léa");
  expect(r.labels).toEqual(["Refuser l'appel", "Répondre"]);
  expect(r.legendes).toEqual(["Refuser", "Répondre"]);
  expect(r.ecart).toBeGreaterThanOrEqual(48);
  expect(r.focus).toBe(true);
});

test("② appel sortant : « Ça sonne… », pas de minuteur ni de chiffres réseau", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    window._call = { kind: "voice", role: "caller", status: "calling", peer: { name: "Léa", emoji: "🌿" } };
    _callRenderActiveUI();
    const el = document.getElementById("callOverlay");
    const minuteur = document.getElementById("callTimer");
    const mute = el.querySelector(".call-control-btn.mute");
    const avant = { statut: document.getElementById("callStatusText").textContent, minuteurVisible: !!minuteur.offsetParent,
      stats: !!document.getElementById("callStats"), labels: [...el.querySelectorAll(".call-control-btn")].map((x) => x.getAttribute("aria-label")),
      couleurMinuteur: getComputedStyle(minuteur).color };
    window._call.localStream = { getAudioTracks: () => [{ enabled: true }] };
    toggleCallMute(mute);
    const apres = { pressed: mute.getAttribute("aria-pressed"), label: mute.getAttribute("aria-label") };
    window._call = null; _callCloseUI();
    return { avant, apres };
  });
  expect(r.avant.statut).toBe("Ça sonne…");
  expect(r.avant.minuteurVisible).toBe(false);
  expect(r.avant.stats).toBe(false);
  expect(r.avant.labels).toEqual(["Couper le micro", "Raccrocher"]);
  expect(r.avant.couleurMinuteur).toBe("rgb(255, 255, 255)");
  expect(r.apres).toEqual({ pressed: "true", label: "Réactiver le micro" });
});

test("③ avatar : la photo du profil, jamais une URL hostile", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = _callAvatarHtml({ photo: "https://cdn.example.test/lea.jpg", emoji: "🌿" });
    const photo = box.querySelector("img") && box.querySelector("img").getAttribute("src");
    box.innerHTML = _callAvatarHtml({ photo: "javascript:window.__x=1", emoji: "🌿" });
    const hostile = { imgs: box.querySelectorAll("img").length, texte: box.textContent };
    box.innerHTML = _callAvatarHtml({ photo: null, emoji: "🌿" });
    return { photo, hostile, sans: box.textContent };
  });
  expect(r.photo).toBe("https://cdn.example.test/lea.jpg");
  expect(r.hostile.imgs).toBe(0);
  expect(r.hostile.texte).toBe("🌿");
  expect(r.sans).toBe("🌿");
});
