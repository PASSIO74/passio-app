// ═══════════════════════════════════════════════════════════════════════════
// STUB SUPABASE HORS LIGNE — la promesse « offline-safe » doit être vérifiable.
//
// Le SDK Supabase vient d'un CDN (js/supabase-loader.js). Tant qu'il n'est pas
// arrivé — réseau coupé, CDN bloqué, ou simplement les premières secondes du
// démarrage — TOUT passe par le stub noop `_buildNoopSupa()` d'app-08, dont le
// commentaire promet que « tout appel retombe dessus sans casser ».
//
// Constat du 2026-08-22, dans un environnement où cdn.jsdelivr.net est bloqué :
// la promesse était fausse. `.not()`, `.or()`, `.update()`, `supa.storage` et
// `supa.functions` étaient appelés par l'app et absents du stub — un simple tour
// des écrans levait « supa.from(...).select(...).not is not a function », et une
// pièce jointe levait sur `supa.storage` undefined au lieu de retomber sur la
// data URL. Le défaut ne se voyait nulle part ailleurs : les autres tests
// tournent avec le CDN joignable, donc avec le VRAI SDK, jamais avec le stub.
//
// Ce test coupe explicitement le CDN et vérifie deux choses indissociables :
// ① le stub est bien celui qui travaille (sinon le test serait creux — vert en
//    prouvant seulement que le vrai SDK fonctionne) ;
// ② aucun écran ne lève de TypeError, c'est-à-dire la promesse elle-même.
//
// Le garde statique associé est `scripts/audit-supa-stub.js` (CI) : il attrape
// l'omission à l'écriture, celui-ci la constate à l'exécution.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];

test.describe("Stub Supabase — dégradation hors ligne", () => {
  test("CDN injoignable : le stub encaisse le tour des écrans sans TypeError", async ({ page }) => {
    test.setTimeout(90000);

    // Couper le SDK à la source. `abort` et non `fulfill` : on reproduit la
    // panne réelle (script jamais chargé), pas un script vide.
    await page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());

    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    // ① Sans cette garde, le test passerait au vert le jour où le CDN redevient
    // joignable — en ne prouvant plus rien du stub. Un test qui ne peut pas
    // échouer pour la bonne raison est pire que pas de test.
    const surStub = await page.evaluate(() => ({
      reel: !!window._supaReal,
      sdk: typeof window.supabase !== "undefined",
      aSupa: !!window.supa,
    }));
    expect(surStub.sdk, "le SDK ne doit PAS avoir été chargé").toBe(false);
    expect(surStub.reel, "le client RÉEL ne doit PAS avoir été construit").toBe(false);
    expect(surStub.aSupa, "`supa` doit tout de même exister (le stub)").toBe(true);

    // ② Le tour des écrans : c'est là que les chaînes de requêtes partent.
    for (const scr of SCREENS) {
      await page.evaluate((s) => goTo(s), scr);
      await page.waitForTimeout(400);
    }
    // Laisser retomber les traitements différés (rendus, chargements de listes).
    await page.waitForTimeout(2000);

    // Les erreurs RÉSEAU sont attendues et normales ici (c'est le but du test) —
    // seules les exceptions JS comptent.
    const fatales = errors.js.filter((e) =>
      /is not a function|Cannot read propert|undefined is not|null is not/i.test(e)
    );
    expect(fatales, "aucune exception JS ne doit survivre au mode hors ligne").toEqual([]);
    expect(errors.js, "aucune exception JS du tout pendant le tour hors ligne").toEqual([]);
  });

  test("CDN injoignable : la surface Supabase appelée par l'app répond toute", async ({ page }) => {
    test.setTimeout(60000);
    await page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());
    await bootOnboarded(page);

    // Exercer le stub sur les formes exactes que l'app utilise. Chaque entrée
    // ci-dessous correspond à un appel réel repéré dans js/*.js — c'est le
    // pendant dynamique de scripts/audit-supa-stub.js.
    const r = await page.evaluate(async () => {
      const out = { erreurs: [] };
      const essai = async (nom, fn) => {
        try { out[nom] = await fn(); }
        catch (e) { out.erreurs.push(nom + " → " + e.message); }
      };

      // Chaînes de requête, y compris les maillons qui manquaient.
      await essai("not", () => supa.from("event_reactions").select("rating").eq("event_id", "x").not("rating", "is", null));
      await essai("or", () => supa.from("profiles").select("id").or("id.eq.1,id.eq.2"));
      await essai("update", () => supa.from("notifications").update({ seen: true }).eq("id", "x"));
      await essai("delete", () => supa.from("conv_members").delete().eq("conv_id", "x"));
      await essai("insertSelect", () => supa.from("posts").insert([{ id: "x" }]).select());
      await essai("maybeSingle", () => supa.from("profiles").select("*").eq("id", "x").maybeSingle());
      await essai("orderLimit", () => supa.from("posts").select("*").order("created_at").limit(5));

      // Espaces de noms entiers qui manquaient.
      await essai("upload", () => supa.storage.from("content").upload("p", new Blob(["x"])));
      await essai("remove", () => supa.storage.from("content").remove(["p"]));
      await essai("invoke", () => supa.functions.invoke("notify-call", { body: {} }));

      // getPublicUrl est SYNCHRONE et déréférencé sans garde dans app-09
      // (`.getPublicUrl(p).data.publicUrl`) : la forme doit tenir.
      await essai("publicUrl", () => supa.storage.from("attachments").getPublicUrl("p").data.publicUrl);

      // Realtime : `.on(...).on(...).subscribe()` doit rester chaînable.
      await essai("canal", () => {
        const c = supa.channel("t").on("broadcast", { event: "x" }, () => {}).on("presence", {}, () => {});
        c.subscribe();
        supa.removeChannel(c);
        return "ok";
      });
      return out;
    });

    expect(r.erreurs, "aucun membre du stub ne doit lever").toEqual([]);

    // Un write DB hors ligne rend { data, error } — l'appelant lit `error`
    // (invariant maison) au lieu de recevoir le builder brut.
    expect(r.update, "un update doit rendre un résultat lisible").toHaveProperty("error");
    // Ce qui SORT de l'appareil échoue explicitement : un faux succès ferait
    // publier une URL distante inexistante au lieu de retomber sur la data URL.
    expect(r.upload.error, "un upload hors ligne doit ÉCHOUER explicitement").toBeTruthy();
    expect(r.invoke.error, "une fonction edge hors ligne doit ÉCHOUER explicitement").toBeTruthy();
    expect(typeof r.publicUrl, "getPublicUrl doit rendre une chaîne").toBe("string");
  });
});
