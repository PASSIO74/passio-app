// ═════════════════════════════════════════════════════════════════════
// GROUPE : CE QUI EST ANNONCÉ EST CE QUE LE SERVEUR A FAIT (audit du 2026-11-10)
//
// SRV-04 — « Description mise à jour » partait sans lire l'écriture : un membre que la
// policy n'autorise pas voyait sa description, qui revenait au rechargement.
// ETAT-04 — « Tu as quitté le groupe » partait sans lire le retrait de
// `conv_members` : sur un refus, la conversation était cachée alors que le compte en
// restait membre, et en recevait toujours les messages.
//
// Ce que la suite garde :
//   ① description refusée (0 ligne) → l'ancienne revient, pas de « mise à jour » ;
//   ② description acceptée → gardée et annoncée ;
//   ③ sortie refusée → la conversation reste, la personne est prévenue ;
//   ④ sortie acceptée → la conversation part, comme avant.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "2d3e4f50-6172-4839-9aab-bccddeeff001";
const CONV = "grp_banc_verdicts";

async function banc(page, verdict) {
  await page.addInitScript((uid) => { try { localStorage.setItem("passio_uid", uid); } catch (e) {} }, UID);
  await bootOnboarded(page);
  await page.evaluate(({ verdict, cid, uid }) => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window.confirm = () => true;
    window.__ecritures = [];
    const rendu = () => verdict === "ok" ? { data: [{ id: cid, conv_id: cid }], error: null } : { data: [], error: null };
    window.supabase = { createClient: () => ({
      from: (table) => {
        const q = {};
        q.update = (corps) => { q._op = "update:" + table; q._corps = corps; return q; };
        q.delete = () => { q._op = "delete:" + table; return q; };
        q._eq = {};
        q.eq = (col, v) => { q._eq[col] = v; return q; };
        q.select = () => {
          window.__ecritures.push(q._op);
          // Une sortie qui ne viserait pas MA ligne (tous les membres) est refusée par le banc.
          if (q._op === "delete:conv_members" && (q._eq.user_id !== uid || q._eq.conv_id !== cid)) {
            window.__ecritures.push("FILTRE_MANQUANT");
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve(rendu());
        };
        q.then = (ok) => ok({ data: null, error: null });
        return q;
      },
    }) };
    window._supaReal = false;
    _initRealSupa();
    window._supaReal = true;
    const convs = getConversations();
    convs.push({ id: cid, isGroup: true, group: true, groupName: "Rando", groupDesc: "Ancienne",
      members: [uid, "11111111-2222-4333-8444-555555555555"], messages: [], lastAt: Date.now(), unread: 0 });
    saveConversationsNow();
  }, { verdict, cid: CONV, uid: UID });
}

const lire = (page) => page.evaluate((cid) => {
  const c = getConversations().find((x) => x.id === cid);
  return { existe: !!c, desc: c ? c.groupDesc : null, toasts: window.__toasts.slice(), ecritures: window.__ecritures.slice() };
}, CONV);

test.describe("SRV-04 et ETAT-04 : description et sortie d'un groupe sous verdict", () => {
  test("① description refusée : l'ancienne revient, rien n'est annoncé comme fait", async ({ page }) => {
    await banc(page, "zero");
    await page.evaluate(async (cid) => { window.prompt = () => "Nouvelle"; try { await editGroupDescription(cid); } catch (e) {} }, CONV);
    const r = await lire(page);
    expect(r.ecritures).toEqual(["update:conversations"]);
    expect(r.desc).toBe("Ancienne");
    expect(r.toasts).not.toContain("Description mise à jour");
    expect(r.toasts.some((t) => /non modifiée/i.test(t)), JSON.stringify(r.toasts)).toBe(true);
  });

  test("② description acceptée : gardée et annoncée", async ({ page }) => {
    await banc(page, "ok");
    await page.evaluate(async (cid) => { window.prompt = () => "Nouvelle"; try { await editGroupDescription(cid); } catch (e) {} }, CONV);
    const r = await lire(page);
    expect(r.desc).toBe("Nouvelle");
    expect(r.toasts).toContain("Description mise à jour");
  });

  test("③ sortie refusée : la conversation reste, la personne est prévenue", async ({ page }) => {
    await banc(page, "zero");
    await page.evaluate(async (cid) => { await leaveGroup(cid); }, CONV);
    const r = await lire(page);
    expect(r.ecritures).toEqual(["delete:conv_members"]);
    expect(r.existe, "la conversation n'est pas cachée").toBe(true);
    expect(r.toasts).not.toContain("Tu as quitté le groupe");
  });

  test("④ sortie acceptée : la conversation part, comme avant", async ({ page }) => {
    await banc(page, "ok");
    await page.evaluate(async (cid) => { await leaveGroup(cid); }, CONV);
    const r = await lire(page);
    expect(r.existe).toBe(false);
    expect(r.toasts).toContain("Tu as quitté le groupe");
  });
});
