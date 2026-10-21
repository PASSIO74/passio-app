// ═══════════════════════════════════════════════════════════
// GARDE TRUST & SAFETY IRL — EN BASE RÉELLE, À PLUSIEURS COMPTES (#69, #136)
//
// `irl-trust-safety.spec.js` prouve le CLIENT : la garde du CTA, son échec
// fermé, la localisation — avec une RPC simulée. Ce qui manquait au solde de
// l'onboarding V2 (#69, P0 ②), c'est la RÈGLE SERVEUR elle-même, jouée par de
// vrais comptes : `irl_interaction_allowed(_other)` ne doit dire « oui » que si
// les DEUX comptes sont majeurs déclarés, qu'aucun ne bloque l'autre, et que ce
// n'est pas soi-même. C'est elle que le drapeau `irl_proposal_v1` interroge
// avant d'afficher la proposition, et à nouveau au clic.
//
// ⚠️ La majorité n'est jamais AVANCÉE : `declare_birth_year` n'écrit une date
// de majorité que si elle est plus TARDIVE que l'actuelle. Un compte qui s'est
// déclaré mineur ne devient pas majeur en redéclarant 1990 — sinon la garde
// tiendrait jusqu'au premier mensonge. Le cas ③ le vérifie, et le cas ⑦ que le
// client ne peut pas écrire `user_safety` en direct pour contourner la RPC.
//
// Écrit en base réelle (staging en CI, SUP-04) : 3 comptes jetables, leurs
// lignes `user_safety`, 1 blocage. Nettoyé en fin de test ; les comptes le
// sont par le teardown global (`…@passio-e2e.test`).
// ═══════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { viserCibleSupabase } = require("./cible-supabase");
const { creerCompteE2E } = require("./compte-e2e");

test.describe("Trust & Safety IRL — règle serveur, comptes réels", () => {
  test("la proposition IRL n'est permise qu'entre deux majeurs déclarés qui ne se bloquent pas", async ({ page }) => {
    test.setTimeout(150000);
    const log = (m) => console.log(`[ts-reel] ${m}`);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await viserCibleSupabase(page);
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof supa !== "undefined" && !!supa && !!window.PASSIO_SUPABASE, null, { timeout: 30000 });

    const rest = (token, path, init = {}) =>
      page.evaluate(async ([tok, p, i]) => {
        const cfg = window.PASSIO_SUPABASE;
        const res = await fetch(cfg.url + "/rest/v1/" + p, {
          ...i,
          headers: {
            apikey: cfg.anon, Authorization: "Bearer " + (tok || cfg.anon),
            "Content-Type": "application/json", Prefer: "return=representation",
            ...(i.headers || {}),
          },
        });
        let body = null; try { body = await res.json(); } catch (e) {}
        return { status: res.status, body };
      }, [token, path, init]);
    const rpc = (token, nom, args) => rest(token, "rpc/" + nom, { method: "POST", body: JSON.stringify(args) });
    const permis = async (de, vers) => {
      const r = await rpc(de.token, "irl_interaction_allowed", { _other: vers.uid });
      expect(r.status, `irl_interaction_allowed répond (${r.status})`).toBe(200);
      return r.body;
    };
    const declarer = async (qui, annee) => {
      const r = await rpc(qui.token, "declare_birth_year", { _birth_year: annee });
      expect(r.status, `declare_birth_year répond (${r.status})`).toBe(200);
      return r.body;
    };
    const anneeMineure = new Date().getFullYear() - 12;

    const A = await creerCompteE2E(page, "ts_a");
    const B = await creerCompteE2E(page, "ts_b");
    const C = await creerCompteE2E(page, "ts_c");
    log(`A=${A.uid} B=${B.uid} C=${C.uid}`);

    try {
      // ① Personne n'a déclaré son âge : fermé, dans les deux sens.
      expect(await permis(A, B), "① aucun âge déclaré → refus").toBe(false);
      expect(await permis(B, A), "① aucun âge déclaré (sens inverse) → refus").toBe(false);

      // ② Un seul majeur déclaré ne suffit pas : il en faut deux.
      expect(await declarer(A, 1990), "A se déclare né en 1990").toBe(true);
      expect(await permis(A, B), "② A majeur, B non déclaré → refus").toBe(false);

      // ③ Mineur déclaré, puis tentative d'avancer sa majorité : refusée.
      expect(await declarer(B, anneeMineure), "B se déclare mineur").toBe(true);
      expect(await permis(A, B), "③ B mineur → refus").toBe(false);
      expect(await declarer(B, 1990), "③ B redéclare 1990 : la majorité n'est pas avancée").toBe(false);
      expect(await permis(A, B), "③ B reste mineur après sa redéclaration → refus").toBe(false);
      expect(await permis(B, A), "③ sens inverse → refus").toBe(false);

      // ④ Deux majeurs déclarés, sans blocage : permis, dans les deux sens.
      expect(await declarer(C, 1988), "C se déclare né en 1988").toBe(true);
      expect(await permis(A, C), "④ A et C majeurs → permis").toBe(true);
      expect(await permis(C, A), "④ sens inverse → permis").toBe(true);
      log("précondition : A ↔ C permis avant blocage");

      // Le même verdict, par la VRAIE garde du client (`irlProposalServerVerdict`,
      // celle qu'interroge le CTA). La page tourne sous C, créé en dernier.
      const verdictClient = (cible) => page.evaluate(async ([moi, cible]) => {
        localStorage.setItem("passio_irl_proposal_v1", "1");
        delete window.PASSIO_IRL_PROPOSAL_V1;
        window._supaReal = true;
        MY_UID = moi; window.MY_UID = moi;
        state.user = state.user || {}; state.user.birthYear = 1988;
        return irlProposalServerVerdict(cible);
      }, [C.uid, cible]);
      expect((await verdictClient(A.uid)).reason, "④ garde du client, C → A : permis").toBe("ok");

      // ⑤ A bloque C : refus dans les DEUX sens (C n'a rien bloqué).
      const bloc = await rest(A.token, "blocks", { method: "POST", body: JSON.stringify({ blocker_id: A.uid, blocked_id: C.uid }) });
      expect(bloc.status, "A bloque C").toBeLessThan(300);
      expect(await permis(A, C), "⑤ A a bloqué C → refus").toBe(false);
      expect(await permis(C, A), "⑤ C bloqué par A → refus aussi").toBe(false);
      // C ignore localement qu'il est bloqué : seul le serveur peut le savoir.
      expect((await verdictClient(A.uid)).reason, "⑤ garde du client, C → A : refusé par le serveur").toBe("server_denied");

      // ⑥ Soi-même et sans session : refus.
      expect(await permis(A, A), "⑥ soi-même → refus").toBe(false);
      const anonyme = await rpc(null, "irl_interaction_allowed", { _other: C.uid });
      expect(anonyme.status === 200 ? anonyme.body : false, "⑥ sans session → refus").toBe(false);

      // ⑦ Le client ne peut pas écrire sa majorité en direct pour contourner la RPC.
      await rest(B.token, "user_safety", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: B.uid, majority_at: "2000-01-01" }),
      });
      await rest(B.token, `user_safety?user_id=eq.${B.uid}`, { method: "PATCH", body: JSON.stringify({ majority_at: "2000-01-01" }) });
      expect(await permis(A, B), "⑦ écriture directe de user_safety sans effet → refus").toBe(false);
      log("règle serveur tenue sur les sept cas");
    } finally {
      await rest(A.token, `blocks?blocker_id=eq.${A.uid}&blocked_id=eq.${C.uid}`, { method: "DELETE" }).catch(() => {});
    }
  });
});
