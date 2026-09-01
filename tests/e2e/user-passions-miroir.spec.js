// ══════════════════════════════════════════════════════════════════════════
// MIROIR `user_passions` — la table normalisée, écrite en double (2026-09-01)
//
// `profiles.passions` (jsonb) RESTE la source de vérité : rien ne LIT encore
// `user_passions`. Ce miroir existe pour que la table soit peuplée le jour où la
// lecture basculera — basculer sur une table vide perdrait les passions de tout
// le monde.
//
// ⚠️ CE QUE CETTE SUITE DOIT PROUVER AVANT TOUT : que le miroir est INERTE ET
// SILENCIEUX tant que la migration n'est pas appliquée. C'est l'état de la
// production aujourd'hui. Sans son sondage, chaque enregistrement de passion
// produirait une erreur PostgREST, à chaque geste, sur tous les comptes.
//
// Le client Supabase est FACTICE ici : on n'écrit rien sur la vraie base, et on
// observe exactement ce que le code aurait envoyé.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Pose un faux client Supabase qui ENREGISTRE les appels au lieu de les faire.
// `reponse` décide de ce que rend `user_passions` : `null` = succès.
//
// ⚠️ ON AFFECTE L'IDENTIFIANT NU `supa`, JAMAIS `window.supa`. `supa` est un
// `let` de portée script (app-08) : il existe comme identifiant global mais
// n'est PAS une propriété de `window`, et `window.supa = …` n'est qu'un miroir
// que le code ne relit jamais. Écrire à côté rendait ce test vert-aveugle —
// aucun appel n'était intercepté et rien ne le disait. Même piège pour `MY_UID`.
async function poserFauxSupa(page, reponse) {
  await page.evaluate((rep) => {
    window.__appels = [];
    const journalise = (table, op) => (charge, opts) => {
      window.__appels.push({ table, op, charge: charge, opts: opts || null });
      return Promise.resolve({ data: null, error: table === "user_passions" ? rep : null });
    };
    // Le constructeur de requête PostgREST est chaînable : chaque filtre rend
    // `this`, et c'est l'attente de la promesse qui déclenche l'appel.
    function requete(table, op) {
      const q = {
        table, op, filtres: [],
        eq(c, v) { this.filtres.push(["eq", c, v]); return this; },
        not(c, o, v) { this.filtres.push(["not", c, o, v]); return this; },
        select() { return this; },
        then(res, rej) {
          window.__appels.push({ table: this.table, op: this.op, filtres: this.filtres });
          return Promise.resolve({ data: [], error: table === "user_passions" ? rep : null }).then(res, rej);
        },
      };
      return q;
    }
    supa = {
      from(table) {
        return {
          upsert: (rows, opts) => {
            window.__appels.push({ table, op: "upsert", rows, opts: opts || null });
            return Promise.resolve({ data: null, error: table === "user_passions" ? rep : null });
          },
          update: journalise(table, "update"),
          delete: () => requete(table, "delete"),
          select: () => requete(table, "select"),
        };
      },
    };
    window._supaReal = true;
  }, reponse || null);
}

// Trois passions dont une archivée et une hors référentiel serveur.
async function poserPassions(page) {
  await page.evaluate(() => {
    state.user.profiles = [
      { id: "p1", name: "Ben", passion: "musique", emoji: "🎵", color: "#8b5cf6", createdAt: 1 },
      { id: "p2", name: "Ben", passion: "photo", emoji: "📷", color: "#8b5cf6", createdAt: 2, archived: true },
      // ⚠️ Absente du référentiel SERVEUR tant que la migration n'est pas passée :
      // la clé étrangère de `user_passions.passion_id` la refuserait en 23503.
      { id: "p3", name: "Ben", passion: "moto-enduro", emoji: "🏍️", color: "#8b5cf6", createdAt: 3 },
    ];
    saveState();
  });
}

test.describe("miroir user_passions", () => {
  test("la table absente désarme le miroir, une seule fois, sans bruit", async ({ page }) => {
    // ⚠️ C'EST L'ÉTAT DE LA PRODUCTION AUJOURD'HUI. PGRST205 = PostgREST ne
    // connaît pas la table. Se réarmer à chaque geste produirait une erreur par
    // enregistrement, sur tous les comptes, pour rien.
    await bootOnboarded(page, null, 1);
    await poserFauxSupa(page, { code: "PGRST205", message: "Could not find the table 'public.user_passions' in the schema cache" });
    await poserPassions(page);

    const r = await page.evaluate(async () => {
      const un = await supaMiroirUserPassions();
      const apresPremier = window.__appels.filter((a) => a.table === "user_passions").length;
      const deux = await supaMiroirUserPassions();
      const apresSecond = window.__appels.filter((a) => a.table === "user_passions").length;
      return { un, deux, apresPremier, apresSecond };
    });
    expect(r.un).toBe(false);
    expect(r.deux).toBe(false);
    expect(r.apresPremier, "le miroir n'a pas tenté d'écrire").toBeGreaterThan(0);
    expect(r.apresSecond, "le miroir se réarme à chaque appel : bruit garanti en production")
      .toBe(r.apresPremier);
  });

  test("un identifiant hors référentiel serveur n'est jamais envoyé", async ({ page }) => {
    // ⚠️ `user_passions.passion_id` porte une clé étrangère vers `public.passions`.
    // Envoyer « moto-enduro » avant la migration ferait rejeter TOUTE l'écriture
    // en 23503 — les deux passions valides seraient perdues avec elle.
    await bootOnboarded(page, null, 1);
    await poserFauxSupa(page, null);
    await poserPassions(page);

    const envoye = await page.evaluate(async () => {
      await supaMiroirUserPassions();
      const up = window.__appels.find((a) => a.table === "user_passions" && a.op === "upsert");
      return up ? up.rows : null;
    });
    expect(envoye).not.toBeNull();
    const ids = envoye.map((r) => r.passion_id);
    expect(ids).toContain("musique");
    expect(ids).toContain("photo");
    expect(ids, "une passion absente du référentiel serveur a été envoyée").not.toContain("moto-enduro");
  });

  test("l'archivage voyage, et la position aussi", async ({ page }) => {
    // Le miroir doit transporter l'état, pas seulement la liste : sinon la
    // bascule future ferait réapparaître chez tout le monde ce qui a été rangé.
    await bootOnboarded(page, null, 1);
    await poserFauxSupa(page, null);
    await poserPassions(page);

    const rows = await page.evaluate(async () => {
      await supaMiroirUserPassions();
      const up = window.__appels.find((a) => a.table === "user_passions" && a.op === "upsert");
      return up ? up.rows : [];
    });
    const parId = Object.fromEntries(rows.map((r) => [r.passion_id, r]));
    expect(parId["musique"].archived).toBe(false);
    expect(parId["photo"].archived, "l'archivage n'est pas transporté").toBe(true);
    expect(parId["musique"].position).toBe(0);
    expect(parId["photo"].position).toBe(1);
    // Et chaque ligne est bornée au compte : la RLS l'exige, le client aussi.
    for (const r of rows) expect(r.user_id).toBeTruthy();
  });

  test("ce qui a disparu localement est retiré du miroir", async ({ page }) => {
    // Sans cette passe, une passion supprimée sur cet appareil survivrait
    // indéfiniment dans la table normalisée.
    await bootOnboarded(page, null, 1);
    await poserFauxSupa(page, null);
    await poserPassions(page);

    const suppr = await page.evaluate(async () => {
      await supaMiroirUserPassions();
      const d = window.__appels.find((a) => a.table === "user_passions" && a.op === "delete");
      return d ? d.filtres : null;
    });
    expect(suppr, "aucune passe de retrait").not.toBeNull();
    const asTexte = JSON.stringify(suppr);
    expect(asTexte).toContain("user_id");
    // Le retrait épargne ce qu'on vient d'écrire, et lui seul.
    expect(asTexte).toContain("musique");
    expect(asTexte).toContain("photo");
    expect(asTexte, "la passion refusée par le référentiel est protégée du retrait")
      .not.toContain("moto-enduro");
  });

  test("aucune écriture ne part sans compte authentifié", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await poserFauxSupa(page, null);
    await poserPassions(page);
    const n = await page.evaluate(async () => {
      const vrai = MY_UID;
      MY_UID = "";                         // identifiant nu : voir la note plus haut
      const r = await supaMiroirUserPassions();
      MY_UID = vrai;
      return { r, appels: window.__appels.filter((a) => a.table === "user_passions").length };
    });
    expect(n.r).toBe(false);
    expect(n.appels).toBe(0);
  });
});
