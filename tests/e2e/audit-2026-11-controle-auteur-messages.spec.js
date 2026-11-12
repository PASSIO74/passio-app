// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-03 (revue) — UN MESSAGE DE CONTRÔLE N'AGIT QUE SUR CE QUI
// APPARTIENT À SON EXPÉDITEUR
//
// `{type:"del"}` (« Supprimer pour tous ») et `{type:"react"}` sont des lignes
// de `conv_messages` comme les autres : TOUT membre d'une conversation peut en
// insérer, avec la cible qu'il veut — la RLS d'INSERT n'impose que
// `from_id = auth.uid()` et l'appartenance. DÉFAUT trouvé en revue : le client
// appliquait la suppression SANS regarder qui la demandait. N'importe quel
// membre d'un groupe effaçait chez tous les autres le message d'un autre membre
// (le mien compris), et la persistance locale rendait l'effacement durable. Une
// réaction n'était qu'un compteur : un « add » répété le gonflait sans fin, un
// « remove » effaçait la réaction de quelqu'un d'autre.
//
// Ce que cette suite exige, aux DEUX points d'application (temps réel
// `_handleIncomingConvMessage`, rejeu `supaLoadMessages` → fusion à l'ouverture) :
//   ① une suppression ne s'applique que si l'auteur de la cible est le
//      `from_id` DE LA LIGNE de contrôle ; un auteur déclaré dans le JSON est
//      ignoré ; un message système ne se supprime pas ; une cible inconnue est
//      ignorée et le message qui arrive ENSUITE s'affiche ; la copie persistée
//      garde ce qui a été refusé ;
//   ② « Supprimer pour tous » sur MON message marche toujours (retrait local,
//      DELETE de la ligne, contrôle `del` envoyé sous MON `from_id`) ;
//   ③ une réaction est attribuée à l'expéditeur de la ligne : une par personne
//      et par emoji, retirée par elle seule ; ma réaction (`_toggleReaction`)
//      s'ajoute et part sous mon `from_id` ; l'emoji hostile reste refusé ;
//   ④ le rejeu au chargement applique les mêmes règles, et l'écran le montre ;
//   ⑤ sur le canal v2 (broadcast que tout MEMBRE peut émettre, `from_id` non
//      prouvé), aucun contrôle n'est appliqué — le rejeu serveur s'en charge ;
//   ⑥ ce rejeu atteint la COPIE LOCALE : la fusion à l'ouverture retire la
//      copie d'un message que son auteur a retiré pour tous (et rien d'autre).
//
// ISOLATION (projet local) : `supa` est un VRAI client et `_supaReal` vaut vrai.
// APRÈS `bootOnboarded`, toute requête REST/Functions/Storage est servie ici
// (fulfill, jamais continue) : les écritures sont capturées, les lectures de
// `conv_messages` rendent les lignes du banc, toutes les autres `[]`. Le temps
// réel est coupé par `bootOnboarded` ; les lignes « reçues » sont passées à
// `_handleIncomingConvMessage` exactement comme le canal les lui donne.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01";
const MARC = "cccccccc-2222-4ccc-8ccc-cccccccccc02";
const CID = "grp_ctrl_auteur";
const CID_REJEU = "grp_ctrl_rejeu";

async function banc(page) {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // ⚠️ APRÈS `bootOnboarded`, ET C'EST VOULU : Playwright évalue la DERNIÈRE
  // route enregistrée en premier, et celle de l'isolation laisse partir les
  // écritures (`route.continue()`). Celle-ci n'en laisse partir aucune.
  const ecritures = [];
  const lignesParConv = {};
  await page.route(/\/(rest|functions|storage)\/v1\//, (route) => {
    const req = route.request();
    const m = req.method();
    const url = req.url();
    if (m === "GET" || m === "HEAD") {
      const mc = /\/rest\/v1\/conv_messages\?.*conv_id=eq\.([^&]+)/.exec(url);
      if (mc) {
        const cid = decodeURIComponent(mc[1]);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lignesParConv[cid] || []) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    let corps = null;
    try { corps = req.postDataJSON(); } catch (e) { corps = req.postData(); }
    ecritures.push({ m, chemin: url.replace(/^.*\/v1\//, ""), corps });
    // Un DELETE accepté rend la ligne retirée (`.select("id")`), comme PostgREST :
    // « Supprimer pour tous » lit désormais ce verdict (ETAT-04).
    const del = m === "DELETE" && /\/rest\/v1\/conv_messages\?(?:[^#]*&)?id=eq\.([^&]+)/.exec(url);
    if (del) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: decodeURIComponent(del[1]) }]) });
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });

  await page.evaluate(async ([lea, marc, cid, cidRejeu]) => {
    window.__toasts = [];
    window.toast = (t, k) => { window.__toasts.push({ t: String(t), k: k || "" }); };
    // LOT-6 (TRA-C11) : plus de boîte native — le banc répond « oui » à la feuille de l'application.
    window.confirmerAction = async () => true;
    window.confirm = () => true;
    state.notifications = [];
    try { cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e" }); } catch (e) {}
    try { cacheRemoteProfile({ id: marc, username: "Marc", emoji: "🎸", color: "#0ea5e9" }); } catch (e) {}
    const now = Date.now();
    const convs = getConversations();
    convs.length = 0;
    convs.push({
      id: cid, isGroup: true, groupName: "Groupe du banc", userIds: [MY_UID, lea, marc],
      userId: "", userName: "Groupe du banc", unread: 0, lastAt: now,
      messages: [
        { id: "m_sys", text: "Léa a rejoint le groupe", system: true, at: now - 60000 },
        { id: "m_lea", from: lea, fromName: "Léa", text: "Message de Léa", at: now - 50000 },
        { id: "m_marc", from: marc, fromName: "Marc", text: "Message de Marc", at: now - 40000 },
        { id: "m_moi", from: "me", text: "Mon message", at: now - 30000 },
        { id: "m_moi2", from: "me", text: "Mon autre message", at: now - 20000 },
      ],
    });
    convs.push({
      id: cidRejeu, isGroup: true, groupName: "Groupe rejoué", userIds: [MY_UID, lea, marc],
      userId: "", userName: "Groupe rejoué", unread: 0, lastAt: now - 1000, messages: [],
    });
    saveConversationsNow();
    goTo("messages");
    renderMessages();
    await openConversation(cid);

    let n = 0;
    window.__b = {
      // Une ligne telle que la base l'a acceptée : `from_id` est celui de la LIGNE.
      ligne(from, charge) {
        n++;
        return { id: "ctl_" + n, conv_id: cid, from_id: from, content: JSON.stringify(charge),
          created_at: new Date(Date.now() - 1000 + n).toISOString().replace("Z", "") };
      },
      async recu(r) { await _handleIncomingConvMessage(r); },
      conv(id) { return getConversations().find((x) => x.id === (id || cid)) || null; },
      ids(id) { const c = this.conv(id); return c ? (c.messages || []).map((m) => m.id) : []; },
      msg(mid, id) { const c = this.conv(id); return c ? (c.messages || []).find((m) => m.id === mid) || null : null; },
      reactions(mid, id) { const m = this.msg(mid, id); return m ? Object.assign({}, m.reactions || {}) : null; },
      bulles() {
        return [...document.querySelectorAll("#convFpThread .conv-bubble-wrap")].map((w) => w.getAttribute("data-mid")).filter(Boolean);
      },
      stocke(id) {
        saveConversationsNow();
        const brut = JSON.parse(localStorage.getItem("passio_conversations_v1") || "[]");
        const c = brut.find((x) => x.id === (id || cid));
        return c ? (c.messages || []).map((m) => m.id) : null;
      },
    };
  }, [LEA, MARC, CID, CID_REJEU]);

  return { errors, ecritures, lignesParConv };
}

test.describe("Audit 2026-11 — messages de contrôle : la suppression et la réaction appartiennent à l'expéditeur de la ligne", () => {
  test.setTimeout(90000);

  test("① temps réel : un membre ne supprime pas le message d'un autre (ni par une charge forgée) ; l'auteur, si", async ({ page }) => {
    const { errors } = await banc(page);
    const r = await page.evaluate(async ([lea, marc, cid]) => {
      const B = window.__b, out = {};
      out.depart = B.ids();
      // Marc efface le message de Léa : refusé.
      await B.recu(B.ligne(marc, { type: "del", target: "m_lea", text: "🗑 Message supprimé" }));
      out.marcSurLea = B.ids();
      // Marc efface le MIEN, puis le message système : refusés.
      await B.recu(B.ligne(marc, { type: "del", target: "m_moi" }));
      await B.recu(B.ligne(marc, { type: "del", target: "m_sys" }));
      // Charge FORGÉE : l'auteur « déclaré » dans le JSON est ignoré.
      await B.recu(B.ligne(marc, { type: "del", target: "m_lea", from: lea, from_id: lea, user_id: lea }));
      out.apresForges = B.ids();
      out.bullesApresForges = B.bulles();
      out.stockeApresForges = B.stocke();
      // Léa retire SON message ; Marc retire le sien : appliqués.
      await B.recu(B.ligne(lea, { type: "del", target: "m_lea" }));
      out.apresLea = B.ids();
      await B.recu(B.ligne(marc, { type: "del", target: "m_marc" }));
      out.apresMarc = B.ids();
      out.bullesFin = B.bulles();
      // Cible INCONNUE : ignorée — le message qui arrive ensuite s'affiche.
      await B.recu(B.ligne(marc, { type: "del", target: "m_futur" }));
      await B.recu({ id: "m_futur", conv_id: cid, from_id: lea, content: "Arrivé après le contrôle",
        created_at: new Date().toISOString().replace("Z", "") });
      out.futur = B.ids().includes("m_futur");
      out.bullesFutur = B.bulles();
      out.stockeFin = B.stocke();
      return out;
    }, [LEA, MARC, CID]);

    expect(r.depart, "prémisse").toEqual(["m_sys", "m_lea", "m_marc", "m_moi", "m_moi2"]);
    expect(r.marcSurLea, "Marc ne supprime pas le message de Léa").toContain("m_lea");
    expect(r.apresForges, "ni le mien, ni le message système, ni par un auteur déclaré dans le JSON")
      .toEqual(["m_sys", "m_lea", "m_marc", "m_moi", "m_moi2"]);
    expect(r.bullesApresForges, "l'écran les montre toujours").toEqual(expect.arrayContaining(["m_lea", "m_moi"]));
    expect(r.stockeApresForges, "la copie persistée les garde").toEqual(["m_sys", "m_lea", "m_marc", "m_moi", "m_moi2"]);
    expect(r.apresLea, "Léa supprime SON message pour tous").toEqual(["m_sys", "m_marc", "m_moi", "m_moi2"]);
    expect(r.apresMarc, "Marc supprime le sien").toEqual(["m_sys", "m_moi", "m_moi2"]);
    expect(r.bullesFin).not.toContain("m_lea");
    expect(r.bullesFin).not.toContain("m_marc");
    expect(r.futur, "un contrôle sur une cible inconnue n'est pas mis en attente : le message arrivé ensuite reste").toBe(true);
    expect(r.bullesFutur).toContain("m_futur");
    expect(r.stockeFin).toEqual(["m_sys", "m_moi", "m_moi2", "m_futur"]);
    expect(errors.js, "aucune exception de page").toEqual([]);
  });

  test("② « Supprimer pour tous » sur MON message : retrait local, DELETE de la ligne, contrôle `del` sous MON from_id", async ({ page }) => {
    const { errors, ecritures } = await banc(page);
    const r = await page.evaluate(async (cid) => {
      const B = window.__b;
      // Un COMPTE (forme d'un uuid) : pour un visiteur, rien ne part au serveur (ETAT-04).
      MY_UID = "6b1d2c3e-4f50-4a61-8b72-9c83d4e5f601";
      await _deleteMsgForAll(cid, "m_moi2");
      // Défense en profondeur côté émetteur : jamais le message d'un autre.
      _deleteMsgForAll(cid, "m_lea");
      await new Promise((ok) => setTimeout(ok, 400));
      return { ids: B.ids(), bulles: B.bulles(), uid: MY_UID, tombe: convTombLoad()["msg:m_moi2"] !== undefined };
    }, CID);
    expect(r.ids, "mon message part, celui de Léa reste").toEqual(["m_sys", "m_lea", "m_marc", "m_moi"]);
    expect(r.bulles).not.toContain("m_moi2");
    expect(r.tombe, "pierre tombale locale (ADR-008)").toBe(true);
    const suppr = ecritures.filter((e) => e.m === "DELETE" && /^conv_messages\?/.test(e.chemin));
    expect(suppr.length, "un DELETE de la ligne").toBe(1);
    expect(decodeURIComponent(suppr[0].chemin)).toContain("id=eq.m_moi2");
    const ctl = ecritures.filter((e) => e.m === "POST" && /^conv_messages/.test(e.chemin));
    expect(ctl.length, "un seul contrôle envoyé").toBe(1);
    const ligne = Array.isArray(ctl[0].corps) ? ctl[0].corps[0] : ctl[0].corps;
    expect(ligne.from_id, "le contrôle part sous MON identifiant").toBe(r.uid);
    expect(ligne.conv_id).toBe(CID);
    expect(JSON.parse(ligne.content)).toMatchObject({ type: "del", target: "m_moi2" });
    expect(errors.js).toEqual([]);
  });

  test("② bis « Supprimer pour tous » REFUSÉ par la base : la bulle reste, aucune pierre tombale, aucun contrôle, et c'est dit (ETAT-04)", async ({ page }) => {
    const { errors, ecritures } = await banc(page);
    // La base touche 0 ligne (refus RLS, session morte) : PostgREST rend [] en 200.
    await page.route(/\/rest\/v1\/conv_messages\?/, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      ecritures.push({ m: "DELETE", chemin: route.request().url().replace(/^.*\/v1\//, ""), corps: null });
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    const r = await page.evaluate(async (cid) => {
      const B = window.__b;
      MY_UID = "6b1d2c3e-4f50-4a61-8b72-9c83d4e5f601";
      window.__toasts = [];
      const vrai = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
      await _deleteMsgForAll(cid, "m_moi2");
      await new Promise((ok) => setTimeout(ok, 300));
      return { ids: B.ids(), bulles: B.bulles(), tombe: convTombLoad()["msg:m_moi2"] !== undefined, toasts: window.__toasts.slice() };
    }, CID);
    expect(ecritures.filter((e) => e.m === "DELETE").length, "le DELETE est bien parti").toBe(1);
    expect(r.ids, "le message est toujours là").toContain("m_moi2");
    expect(r.bulles).toContain("m_moi2");
    expect(r.tombe, "aucune pierre tombale ne le cache").toBe(false);
    expect(ecritures.filter((e) => e.m === "POST" && /^conv_messages/.test(e.chemin)).length, "aucun contrôle `del` envoyé").toBe(0);
    expect(r.toasts.some((t) => /pas pu être supprimé|non supprimé/.test(t)), JSON.stringify(r.toasts)).toBe(true);
    expect(r.toasts).not.toContain("Message supprimé pour tous");
    expect(errors.js).toEqual([]);
  });

  test("② ter ligne DÉJÀ partie (0 ligne sous MA session) : c'est un succès, la bulle part, aucun contrôle inutile", async ({ page }) => {
    const { errors, ecritures } = await banc(page);
    await page.route(/\/rest\/v1\/conv_messages\?/, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      ecritures.push({ m: "DELETE", chemin: route.request().url().replace(/^.*\/v1\//, ""), corps: null });
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    const r = await page.evaluate(async (cid) => {
      const B = window.__b;
      MY_UID = "6b1d2c3e-4f50-4a61-8b72-9c83d4e5f601";
      window._sessionEstMoi = async () => true;   // la session de CE compte est vivante
      await _deleteMsgForAll(cid, "m_moi2");
      await new Promise((ok) => setTimeout(ok, 300));
      return { ids: B.ids(), tombe: convTombLoad()["msg:m_moi2"] !== undefined };
    }, CID);
    expect(r.ids).not.toContain("m_moi2");
    expect(r.tombe).toBe(true);
    expect(ecritures.filter((e) => e.m === "POST" && /^conv_messages/.test(e.chemin)).length, "rien à retirer chez l'autre : aucun contrôle").toBe(0);
    expect(errors.js).toEqual([]);
  });

  test("③ temps réel : une réaction par personne et par emoji, retirée par elle seule ; la mienne s'ajoute et part sous mon from_id", async ({ page }) => {
    const { errors, ecritures } = await banc(page);
    const r = await page.evaluate(async ([lea, marc, cid]) => {
      const B = window.__b, out = {};
      await B.recu(B.ligne(marc, { type: "react", target: "m_lea", emoji: "❤️", op: "add" }));
      out.r1 = B.reactions("m_lea");
      await B.recu(B.ligne(marc, { type: "react", target: "m_lea", emoji: "❤️", op: "add" }));
      out.doublon = B.reactions("m_lea");
      // Léa retire une réaction qu'elle n'a pas mise : rien ne bouge.
      await B.recu(B.ligne(lea, { type: "react", target: "m_lea", emoji: "❤️", op: "remove" }));
      out.retraitAutrui = B.reactions("m_lea");
      // Charge FORGÉE : un identifiant dans le JSON n'attribue rien.
      await B.recu(B.ligne(lea, { type: "react", target: "m_lea", emoji: "❤️", op: "remove", from: marc, from_id: marc, user_id: marc }));
      out.forge = B.reactions("m_lea");
      out.par = JSON.parse(JSON.stringify((B.msg("m_lea") || {}).reactBy || null));
      await B.recu(B.ligne(lea, { type: "react", target: "m_lea", emoji: "❤️", op: "add" }));
      out.deux = B.reactions("m_lea");
      // MA réaction, par le vrai geste : elle s'ajoute au total des autres.
      _toggleReaction(cid, "m_lea", "❤️");
      out.trois = B.reactions("m_lea");
      out.maReaction = !!((B.msg("m_lea") || {}).myReact || {})["❤️"];
      // Marc retire la SIENNE : la mienne et celle de Léa restent.
      await B.recu(B.ligne(marc, { type: "react", target: "m_lea", emoji: "❤️", op: "remove" }));
      out.retraitMarc = B.reactions("m_lea");
      out.maReactionGardee = !!((B.msg("m_lea") || {}).myReact || {})["❤️"];
      // L'emoji hostile reste refusé à l'entrée.
      await B.recu(B.ligne(marc, { type: "react", target: "m_lea", emoji: "<img src=x>", op: "add" }));
      out.hostile = B.reactions("m_lea");
      // Une réaction de Léa sur MON message.
      await B.recu(B.ligne(lea, { type: "react", target: "m_moi", emoji: "👍", op: "add" }));
      out.surLeMien = B.reactions("m_moi");
      await new Promise((ok) => setTimeout(ok, 300));
      out.uid = MY_UID;
      return out;
    }, [LEA, MARC, CID]);

    expect(r.r1).toEqual({ "❤️": 1 });
    expect(r.doublon, "un « add » répété par la même personne ne gonfle rien").toEqual({ "❤️": 1 });
    expect(r.retraitAutrui, "on ne retire pas la réaction d'un autre").toEqual({ "❤️": 1 });
    expect(r.forge, "ni par un identifiant glissé dans le JSON").toEqual({ "❤️": 1 });
    expect(r.par, "la réaction est attribuée à l'expéditeur de la ligne").toEqual({ "❤️": [MARC] });
    expect(r.deux).toEqual({ "❤️": 2 });
    expect(r.trois, "ma réaction s'ajoute").toEqual({ "❤️": 3 });
    expect(r.maReaction).toBe(true);
    expect(r.retraitMarc, "Marc retire la sienne, et seulement la sienne").toEqual({ "❤️": 2 });
    expect(r.maReactionGardee).toBe(true);
    expect(r.hostile, "clé hostile refusée").toEqual({ "❤️": 2 });
    expect(r.surLeMien).toEqual({ "👍": 1 });
    const envois = ecritures.filter((e) => e.m === "POST" && /^conv_messages/.test(e.chemin))
      .map((e) => (Array.isArray(e.corps) ? e.corps[0] : e.corps));
    expect(envois.length, "ma réaction part en base").toBe(1);
    expect(envois[0].from_id, "sous MON identifiant").toBe(r.uid);
    expect(JSON.parse(envois[0].content)).toEqual({ type: "react", target: "m_lea", emoji: "❤️", op: "add" });
    expect(errors.js).toEqual([]);
  });

  test("④ rejeu au chargement : mêmes règles pour la suppression et la réaction — l'écran le montre", async ({ page }) => {
    const { errors, lignesParConv } = await banc(page);
    const uid = await page.evaluate(() => MY_UID);
    const t0 = Date.now() - 3600000;
    let k = 0;
    const ts = () => new Date(t0 + (++k) * 1000).toISOString().replace("Z", "") + "123";
    const prof = { [LEA]: { username: "Léa", emoji: "🌿", color: "#22c55e" }, [MARC]: { username: "Marc", emoji: "🎸", color: "#0ea5e9" } };
    const ligne = (id, from, content) => ({ id, conv_id: CID_REJEU, from_id: from, content: typeof content === "string" ? content : JSON.stringify(content), created_at: ts(), profiles: prof[from] || null });
    const lignes = [
      ligne("r_lea", LEA, "Message de Léa"),
      ligne("r_marc", MARC, "Message de Marc"),
      ligne("r_moi", uid, "Mon message"),
      ligne("r_moi2", uid, "Mon autre message"),
      // Refusées : la cible n'est pas de l'expéditeur de la ligne.
      ligne("d1", MARC, { type: "del", target: "r_lea" }),
      ligne("d2", MARC, { type: "del", target: "r_moi" }),
      ligne("d3", MARC, { type: "del", target: "r_lea", from: LEA, from_id: LEA }),
      // Appliquées : chacun retire le sien.
      ligne("d4", uid, { type: "del", target: "r_moi2" }),
      ligne("d5", MARC, { type: "del", target: "r_marc" }),
      // Cible inconnue : ignorée.
      ligne("d6", LEA, { type: "del", target: "r_absent" }),
      // Réactions.
      ligne("x1", MARC, { type: "react", target: "r_lea", emoji: "❤️", op: "add" }),
      ligne("x2", MARC, { type: "react", target: "r_lea", emoji: "❤️", op: "add" }),
      ligne("x3", LEA, { type: "react", target: "r_lea", emoji: "❤️", op: "remove" }),
      ligne("x4", LEA, { type: "react", target: "r_lea", emoji: "❤️", op: "remove", from: MARC, user_id: MARC }),
      ligne("x5", LEA, { type: "react", target: "r_lea", emoji: "👍", op: "add" }),
      ligne("x6", LEA, { type: "react", target: "r_lea", emoji: "👍", op: "remove" }),
      ligne("x7", uid, { type: "react", target: "r_lea", emoji: "😂", op: "add" }),
      ligne("x8", MARC, { type: "react", target: "r_moi", emoji: "🔥", op: "add" }),
    ];
    // La base les sert du plus récent au plus ancien (`order created_at desc`).
    lignesParConv[CID_REJEU] = lignes.slice().reverse();

    const r = await page.evaluate(async (cid) => {
      const B = window.__b, out = {};
      const lus = await supaLoadMessages(cid);
      out.lus = lus.map((m) => m.id);
      const lea = lus.find((m) => m.id === "r_lea") || {};
      const moi = lus.find((m) => m.id === "r_moi") || {};
      out.reactLea = lea.reactions || null;
      out.parLea = lea.reactBy || null;
      out.reactMoi = moi.reactions || null;
      // Le VRAI chemin : ouverture de la conversation → fusion → rendu.
      await openConversation(cid);
      await new Promise((ok) => setTimeout(ok, 500));
      out.conv = B.ids(cid);
      out.bulles = B.bulles();
      out.stocke = B.stocke(cid);
      return out;
    }, CID_REJEU);

    expect(r.lus, "seuls les messages retirés PAR LEUR AUTEUR disparaissent").toEqual(["r_lea", "r_moi"]);
    expect(r.reactLea, "une réaction par personne ; un retrait ne touche que la sienne").toEqual({ "❤️": 1, "😂": 1 });
    expect(r.parLea).toEqual({ "❤️": [MARC], "😂": [uid] });
    expect(r.reactMoi).toEqual({ "🔥": 1 });
    expect(r.conv, "la conversation ouverte porte le résultat du rejeu").toEqual(["r_lea", "r_moi"]);
    expect(r.bulles).toEqual(expect.arrayContaining(["r_lea", "r_moi"]));
    expect(r.bulles).not.toContain("r_marc");
    expect(r.bulles).not.toContain("r_moi2");
    expect(r.stocke).toEqual(["r_lea", "r_moi"]);
    expect(errors.js).toEqual([]);
  });

  // ⑤ CANAL v2 (opt-in, `passio_realtime_v2 = "1"`) : `_subscribePrivateConv`
  // remet au gestionnaire la CHARGE d'un broadcast sur `conv:<id>` — et la
  // policy `passio_rt_emettre` laisse n'importe quel MEMBRE y diffuser ce qu'il
  // veut. Le `from_id` n'y est donc prouvé par personne : Marc, membre, écrit
  // `from_id = Léa` et la règle « l'expéditeur de la ligne » se croyait
  // satisfaite. Sur ce chemin, AUCUN contrôle n'est appliqué ; les messages
  // ordinaires passent ; le rejeu serveur (`supaLoadMessages`, `from_id` réel)
  // applique ceux qui existent vraiment.
  // Le canal est simulé au plus près : `supa.channel` rend un faux canal qui
  // capture le rappel `broadcast/INSERT` posé par le VRAI `_subscribePrivateConv`.
  test("⑤ canal v2 (broadcast de membre) : un contrôle à `from_id` forgé n'est jamais appliqué ; les messages passent ; le rejeu serveur applique les vrais", async ({ page }) => {
    const { errors, lignesParConv } = await banc(page);
    const uid = await page.evaluate(() => MY_UID);
    const r = await page.evaluate(async ([lea, marc, cid]) => {
      const B = window.__b, out = {};
      // Le VRAI abonnement v2, sur un faux canal qui garde le rappel.
      let rappel = null;
      const propre = Object.prototype.hasOwnProperty.call(supa, "channel");
      const vrai = supa.channel;
      supa.channel = function (nom, o) {
        out.sujet = nom; out.prive = !!(o && o.config && o.config.private);
        const ch = { on(type, filtre, cb) { if (type === "broadcast" && filtre && filtre.event === "INSERT") rappel = cb; return ch; }, subscribe() { return ch; }, unsubscribe() { return Promise.resolve(); } };
        return ch;
      };
      try { delete window._privateConvChans[cid]; _subscribePrivateConv(cid); }
      finally { if (propre) supa.channel = vrai; else delete supa.channel; }
      out.abonne = typeof rappel === "function";
      // Deux formes de charge que le rappel accepte (`p.record`, ou `p` lui-même).
      const diffuse = async (ligne, nue) => { rappel({ payload: nue ? ligne : { record: ligne } }); await new Promise((ok) => setTimeout(ok, 150)); };

      // Marc FORGE l'expéditeur : « Léa » efface le message de Léa…
      await diffuse(B.ligne(lea, { type: "del", target: "m_lea" }));
      // …« Léa » réagit à MON message…
      await diffuse(B.ligne(lea, { type: "react", target: "m_moi", emoji: "❤️", op: "add" }), true);
      // …et un contrôle à l'expéditeur VRAI (Marc retire le sien) attend lui aussi le rejeu.
      await diffuse(B.ligne(marc, { type: "del", target: "m_marc" }));
      out.ids = B.ids();
      out.reactMoi = B.reactions("m_moi");
      out.bulles = B.bulles();
      out.stocke = B.stocke();
      // Une charge ORDINAIRE à `conv_id` étranger : jetée — ni routée par
      // `from_id` vers mon fil privé avec Léa, ni nouvelle conversation.
      getConversations().push({ id: "dm_lea_banc", isGroup: false, userId: lea, userName: "Léa", unread: 0, lastAt: Date.now() - 5000, messages: [] });
      saveConversationsNow();
      await diffuse({ id: "m_injecte", conv_id: "conv_au_hasard", from_id: lea, content: "Je suis Léa (forgé)", created_at: new Date().toISOString().replace("Z", "") });
      await diffuse({ id: "m_injecte2", conv_id: "dm_lea_banc", from_id: lea, content: "Je suis Léa (forgé, autre fil)", created_at: new Date().toISOString().replace("Z", "") });
      await new Promise((ok) => setTimeout(ok, 300));
      out.injecte = getConversations().filter((c) => (c.messages || []).some((m) => m.id === "m_injecte" || m.id === "m_injecte2")).map((c) => c.id);
      out.convsInconnues = getConversations().filter((c) => c.id === "conv_au_hasard").length;
      // Un message ORDINAIRE diffusé continue de s'afficher.
      rappel({ payload: { record: { id: "m_v2", conv_id: cid, from_id: lea, content: "Bonjour par le canal v2",
        created_at: new Date().toISOString().replace("Z", "") } } });
      const t0 = Date.now();
      while (!B.ids().includes("m_v2") && Date.now() - t0 < 4000) await new Promise((ok) => setTimeout(ok, 50));
      out.ordinaire = B.ids().includes("m_v2");
      await new Promise((ok) => setTimeout(ok, 200));
      out.bullesOrdinaire = B.bulles();
      return out;
    }, [LEA, MARC, CID]);

    expect(r.abonne, "prémisse : le vrai `_subscribePrivateConv` a posé son rappel").toBe(true);
    expect(r.sujet, "prémisse : canal de la conversation").toBe("conv:" + CID);
    expect(r.prive, "prémisse : canal privé").toBe(true);
    expect(r.ids, "aucune suppression par diffusion — ni forgée, ni même vraie").toEqual(["m_sys", "m_lea", "m_marc", "m_moi", "m_moi2"]);
    expect(r.reactMoi, "aucune réaction par diffusion").toEqual({});
    expect(r.bulles, "les messages restent à l'écran").toEqual(expect.arrayContaining(["m_lea", "m_marc", "m_moi"]));
    expect(r.bulles.filter((id) => /^ctl_/.test(id)), "un contrôle n'est jamais peint en bulle").toEqual([]);
    expect(r.stocke, "la copie persistée garde tout").toEqual(["m_sys", "m_lea", "m_marc", "m_moi", "m_moi2"]);
    expect(r.injecte, "une charge v2 à conv_id étranger n'entre dans aucun fil").toEqual([]);
    expect(r.convsInconnues, "ni ne crée de conversation").toBe(0);
    expect(r.ordinaire, "un message ordinaire diffusé s'affiche").toBe(true);
    expect(r.bullesOrdinaire).toContain("m_v2");

    // Le rejeu serveur : la diffusion forgée n'a jamais existé en base ; le
    // retrait VRAI de Marc, si — il est appliqué, la réaction vraie de Léa aussi.
    const t0 = Date.now() - 3600000;
    let k = 0;
    const ts = () => new Date(t0 + (++k) * 1000).toISOString().replace("Z", "") + "123";
    const prof = { [LEA]: { username: "Léa", emoji: "🌿", color: "#22c55e" }, [MARC]: { username: "Marc", emoji: "🎸", color: "#0ea5e9" } };
    const ligne = (id, from, content) => ({ id, conv_id: CID, from_id: from, content: typeof content === "string" ? content : JSON.stringify(content), created_at: ts(), profiles: prof[from] || null });
    lignesParConv[CID] = [
      ligne("m_lea", LEA, "Message de Léa"),
      ligne("m_marc", MARC, "Message de Marc"),
      ligne("m_moi", uid, "Mon message"),
      ligne("s_del", MARC, { type: "del", target: "m_marc" }),
      ligne("s_react", LEA, { type: "react", target: "m_moi", emoji: "👍", op: "add" }),
    ].reverse();
    const rejeu = await page.evaluate(async (cid) => {
      const lus = await supaLoadMessages(cid);
      const moi = lus.find((m) => m.id === "m_moi") || {};
      return { ids: lus.map((m) => m.id), reactMoi: moi.reactions || null };
    }, CID);
    expect(rejeu.ids, "rejeu : le retrait vrai de Marc est appliqué, le message de Léa reste").toEqual(["m_lea", "m_moi"]);
    expect(rejeu.reactMoi, "rejeu : la réaction vraie de Léa est comptée").toEqual({ "👍": 1 });
    expect(errors.js, "aucune exception de page").toEqual([]);
  });

  // ⑥ LE RETRAIT REJOUÉ ATTEINT LA COPIE LOCALE. `_deleteMsgForAll` supprime la
  // LIGNE de la cible en plus d'envoyer le contrôle : le serveur ne rend donc
  // plus le message, et la fusion à l'ouverture (`_fusionnerMessagesServeur`)
  // gardait la copie locale — un retrait manqué en temps réel (hors ligne,
  // socket au repos, contrôle v2 laissé au rejeu) ne quittait jamais l'appareil.
  // Mêmes règles qu'ailleurs : seul l'auteur de la copie retire la sienne, un
  // message système ne se retire pas, et la version serveur d'un message encore
  // servi fait foi.
  test("⑥ rejeu → fusion : le retrait « pour tous » de son auteur efface la copie locale ; un retrait d'autrui, non", async ({ page }) => {
    const { errors, lignesParConv } = await banc(page);
    const uid = await page.evaluate(() => MY_UID);
    const t0 = Date.now() - 3600000;
    let k = 0;
    const ts = () => new Date(t0 + (++k) * 1000).toISOString().replace("Z", "") + "123";
    const prof = { [LEA]: { username: "Léa", emoji: "🌿", color: "#22c55e" }, [MARC]: { username: "Marc", emoji: "🎸", color: "#0ea5e9" } };
    const ligne = (id, from, content) => ({ id, conv_id: CID, from_id: from, content: typeof content === "string" ? content : JSON.stringify(content), created_at: ts(), profiles: prof[from] || null });
    // La ligne `m_marc` n'est plus en base : Marc l'a retirée pour tous.
    lignesParConv[CID] = [
      ligne("m_lea", LEA, "Message de Léa"),
      ligne("m_moi", uid, "Mon message"),
      ligne("s_del_marc", MARC, { type: "del", target: "m_marc" }),     // appliqué : Marc retire le sien
      ligne("s_del_lea", MARC, { type: "del", target: "m_lea" }),       // refusé : servi encore, et pas à Marc
      ligne("s_del_moi2", LEA, { type: "del", target: "m_moi2" }),      // refusé : la copie locale est à MOI
      ligne("s_del_sys", MARC, { type: "del", target: "m_sys" }),       // refusé : message système
      ligne("s_del_forge", LEA, { type: "del", target: "m_moi2", from: uid, from_id: uid }), // auteur du JSON ignoré
    ].reverse();
    const avant = await page.evaluate(() => window.__b.ids().slice().sort());
    expect(avant, "prémisse : la copie locale porte le message de Marc").toContain("m_marc");

    const r = await page.evaluate(async (cid) => {
      const B = window.__b, out = {};
      const lus = await supaLoadMessages(cid);
      out.retraits = (lus._retraitsPourTous || []).map((x) => x.target).sort();
      out.enumerable = Object.keys(lus).includes("_retraitsPourTous");
      await _fusionnerMessagesServeur(cid, "Groupe du banc", document.getElementById("convFpThread"));
      await new Promise((ok) => setTimeout(ok, 300));
      out.ids = B.ids().slice().sort();
      out.bulles = B.bulles();
      out.stocke = (B.stocke() || []).slice().sort();
      return out;
    }, CID);

    expect(r.retraits, "les retraits remis à la fusion : cibles absentes de la lecture, ou retirées par leur auteur").toEqual(["m_marc", "m_moi2", "m_moi2", "m_sys"]);
    expect(r.enumerable, "la propriété ne se voit pas d'un parcours ordinaire du tableau").toBe(false);
    expect(r.ids, "seule la copie de Marc, retirée par Marc, quitte l'appareil").toEqual(["m_lea", "m_moi", "m_moi2", "m_sys"]);
    expect(r.bulles).not.toContain("m_marc");
    expect(r.bulles).toEqual(expect.arrayContaining(["m_lea", "m_moi", "m_moi2"]));
    expect(r.stocke, "la copie persistée suit").toEqual(["m_lea", "m_moi", "m_moi2", "m_sys"]);
    expect(errors.js, "aucune exception de page").toEqual([]);
  });
});
