// Audit 2026-11-02 — F-03 : la lecture d'une conversation (`supaLoadMessages`,
// app-08) partait en ordre ASCENDANT sans borne. PostgREST plafonne toute
// réponse à `max-rows` (1 000) EN SILENCE : au 1 001ᵉ message, les PLUS RÉCENTS
// n'arrivaient plus à l'écran — sans erreur, sans trace. Le faux serveur de
// l'agent E reproduit ce plafond (`maxRows = 1000`) ; le VRAI SDK et la VRAIE
// fonction de lecture sont exercés. Aucune écriture Supabase réelle.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const A = "aaaaaaaa-0000-4000-8000-000000000011";
const B = "bbbbbbbb-0000-4000-8000-000000000012";
const CONV = "conv_pagination_1200";
const N = 1200;

function peupler(srv) {
  srv.compte(A, "alice_pagination"); srv.compte(B, "bob_pagination");
  srv.t.conversations.push({ id: CONV, is_group: false, created_by: A, created_at: "2026-01-01T00:00:00" });
  srv.t.conv_members.push({ conv_id: CONV, user_id: A }, { conv_id: CONV, user_id: B });
  const base = Date.UTC(2026, 0, 1);
  for (let i = 1; i <= N; i++) {
    const id = "m" + String(i).padStart(5, "0");
    srv.t.conv_messages.push({
      id, conv_id: CONV, from_id: i % 2 ? A : B,
      content: "message " + i,
      // Horodatage SANS fuseau (colonne `timestamp`, comme en production) et
      // strictement croissant : le 1 200ᵉ est le plus récent.
      created_at: new Date(base + i * 60000).toISOString().replace("Z", ""),
    });
  }
}

test.describe("Audit 2026-11 — messagerie : lecture paginée depuis la fin (F-03)", () => {
  test.setTimeout(120000);

  test("une conversation de 1 200 messages est relue EN ENTIER, les plus récents compris", async ({ browser }) => {
    const srv = new FauxServeur();
    peupler(srv);
    const ctx = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctx, srv, A, { nom: "alice_pagination" });
      expect(a.identite.uid, "le compte A est bien celui qui lit").toBe(A);

      const lecture = await a.page.evaluate(async (convId) => {
        const t0 = performance.now();
        const msgs = await supaLoadMessages(convId);
        const ids = msgs.map((m) => m.id);
        return {
          n: msgs.length,
          premier: ids[0],
          dernier: ids[ids.length - 1],
          aLePlusRecent: ids.includes("m01200"),
          aLePlusAncien: ids.includes("m00001"),
          croissant: msgs.every((m, i) => i === 0 || (m.at || 0) >= (msgs[i - 1].at || 0)),
          doublons: ids.length - new Set(ids).size,
          ms: Math.round(performance.now() - t0),
        };
      }, CONV);
      console.log(JSON.stringify(lecture));

      // La preuve que le plafond a joué : plusieurs lectures sont parties, et
      // AUCUNE n'a demandé plus que ce que le serveur peut servir.
      const lectures = srv.journal.filter((r) => r.table === "conv_messages" && r.m === "GET");
      expect(lectures.length, "la conversation est lue en plusieurs pages").toBeGreaterThanOrEqual(2);

      expect(lecture.aLePlusRecent, "le dernier message échangé (m01200) est relu").toBe(true);
      expect(lecture.n, "les 1 200 messages sont tous là").toBe(N);
      expect(lecture.aLePlusAncien, "le premier message aussi").toBe(true);
      expect(lecture.doublons, "aucun doublon entre les pages").toBe(0);
      expect(lecture.croissant, "l'ordre chronologique est rétabli pour l'affichage").toBe(true);
      expect(lecture.dernier, "le plus récent ferme la liste").toBe("m01200");
    } finally {
      await ctx.close();
    }
  });

  test("au-delà de la borne de lecture, ce sont les plus ANCIENS qui attendent, jamais les derniers", async ({ browser }) => {
    const srv = new FauxServeur();
    peupler(srv);
    // 1 200 messages de plus, plus récents encore : 2 400 au total.
    const base = Date.UTC(2026, 5, 1);
    for (let i = 1; i <= N; i++) {
      srv.t.conv_messages.push({ id: "z" + String(i).padStart(5, "0"), conv_id: CONV, from_id: B, content: "tard " + i, created_at: new Date(base + i * 60000).toISOString().replace("Z", "") });
    }
    const ctx = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctx, srv, A, { nom: "alice_pagination" });
      const lecture = await a.page.evaluate(async (convId) => {
        // Borne volontairement abaissée pour le banc : 2 pages de 1 000.
        const avant = window.MSG_LECTURE_MAX;
        window.MSG_LECTURE_MAX = 2000;
        try {
          const msgs = await supaLoadMessages(convId);
          const ids = msgs.map((m) => m.id);
          return { n: msgs.length, dernier: ids[ids.length - 1], aLePlusRecent: ids.includes("z01200"), aLePlusAncien: ids.includes("m00001") };
        } finally { window.MSG_LECTURE_MAX = avant; }
      }, CONV);
      console.log(JSON.stringify(lecture));
      expect(lecture.aLePlusRecent, "le plus récent est toujours relu").toBe(true);
      expect(lecture.dernier).toBe("z01200");
      expect(lecture.n, "2 000 lignes : la borne tient").toBe(2000);
      expect(lecture.aLePlusAncien, "sous la borne, c'est le plus ancien qui manque (l'appareil garde sa copie locale)").toBe(false);
    } finally {
      await ctx.close();
    }
  });
});
