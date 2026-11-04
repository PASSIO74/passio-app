// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D — XSS STOCKÉES À L'AFFICHAGE
//
// `scripts/audit-echappement.js` classe les interpolations par CONTEXTE et
// n'échoue (--ci) que sur les contextes url/on*/style hors socle. Ce qu'il ne
// voit pas : les affectations DOM (`el.src = …`, `style.backgroundImage`), les
// payloads décodés d'un JSON (`applyMsgContentData`), les chaînes qui passent
// par un helper NON désinfectant (`passioThumb`), et le contexte « texte » qu'il
// laisse hors --ci. Ce banc attaque donc par les DONNÉES : des contenus
// hostiles d'AUTRUI — publication, commentaire, réponse, réaction emoji/GIF,
// message (texte, GIF, média, fichier, réponse citée), nom de profil, bio,
// liens réseaux, événement (titre, description, adresse, contact, organisateur),
// notification — injectés dans l'état comme s'ils venaient du serveur, puis
// chaque surface est RENDUE et on vérifie :
//   · `window.__xss` reste indéfini (aucun onerror/onclick hostile n'a tourné) ;
//   · aucun `alert`/`confirm`/`prompt` n'est appelé (hook posé avant le boot) ;
//   · aucun attribut `href`/`src`/`poster`/`action` ne porte `javascript:` ;
//   · aucun `style` n'a intégré une `url(` venue d'un autre compte sans `_cssUrl`.
// Stub local (bootOnboarded) : aucune écriture en production.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "88881111-2222-4333-8444-555566667777";
const P_IMG = '"><img src=x onerror=window.__xss=1>';
const P_JS = "javascript:window.__xss=2";
const P_QUOTE = "');window.__xss=3;//";
const P_STYLE = "red;background:url(javascript:window.__xss=4)";
const P_SVG = '<svg onload=window.__xss=5>';
const P_DATA = "data:text/html,<script>window.__xss=6</script>";
const TOUS = [P_IMG, P_JS, P_QUOTE, P_STYLE, P_SVG, P_DATA];

// Hook AVANT le boot : alert/confirm/prompt et toute exécution hostile marquent.
const HOOK = () => {
  window.__alerts = [];
  ["alert", "confirm", "prompt"].forEach((f) => { window[f] = function (m) { window.__alerts.push(f + ":" + String(m)); return f === "confirm"; }; });
};

async function sondes(page) {
  return page.evaluate(() => {
    const out = { xss: window.__xss, alerts: window.__alerts || [], hrefJs: [], styleUrl: [], scriptsInjectes: 0 };
    document.querySelectorAll("[href],[src],[poster],[action],[formaction],[xlink\\:href]").forEach((el) => {
      for (const a of ["href", "src", "poster", "action", "formaction", "xlink:href"]) {
        const v = el.getAttribute(a);
        if (v && /^\s*(javascript|vbscript|data:text\/html)/i.test(v)) out.hrefJs.push(el.tagName + "[" + a + "]=" + v.slice(0, 60));
      }
    });
    document.querySelectorAll("[style]").forEach((el) => {
      const s = el.getAttribute("style") || "";
      if (/url\(\s*['"]?\s*javascript:/i.test(s) || /expression\(/i.test(s)) out.styleUrl.push(el.tagName + "." + el.className + " " + s.slice(0, 80));
    });
    out.scriptsInjectes = document.querySelectorAll("#feedList script, #modalContent script, #postDetailContent script, #eventDetailPage script, #convFpThread script, svg[onload]").length;
    return out;
  });
}

async function verifier(page, surface) {
  const s = await sondes(page);
  expect(s.xss, surface + " : window.__xss doit rester indéfini").toBeUndefined();
  expect(s.alerts, surface + " : aucune boîte native").toEqual([]);
  expect(s.hrefJs, surface + " : aucun attribut d'URL javascript:").toEqual([]);
  expect(s.styleUrl, surface + " : aucune url(javascript:) dans un style").toEqual([]);
  expect(s.scriptsInjectes, surface + " : aucun <script>/<svg onload> injecté").toBe(0);
}

async function bancHostile(page) {
  await page.addInitScript(HOOK);
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);
  await page.evaluate(([autre, P]) => {
    const [P_IMG, P_JS, P_QUOTE, P_STYLE, P_SVG, P_DATA] = P;
    const nomHostile = "Mallory" + P_IMG + P_QUOTE;
    // Profil hostile en cache (nom, emoji, couleur, photo, bio, liens).
    state.seed.users = state.seed.users || [];
    state.seed.users.push({ id: autre, name: nomHostile, profileEmoji: P_IMG, avatar: P_STYLE, photoUrl: P_JS, bio: P_IMG + P_SVG, distant: true, passions: [{ passion: "musique", label: P_IMG, emoji: P_SVG }] });
    try { cacheRemoteProfile({ id: autre, username: nomHostile, emoji: P_IMG, color: P_STYLE, avatar_url: P_JS, bio: P_IMG, rs_links: [{ platform: P_IMG, url: P_JS }], cover_url: P_DATA }); } catch (e) {}
    // Publication d'autrui : texte, image, vidéo, audio, overlays, repartage, événement lié.
    const base = { authorId: autre, authorName: nomHostile, authorEmoji: P_IMG, authorColor: P_STYLE, authorAvatar: P_JS, passion: "musique", mood: "all", createdAt: Date.now() - 1000, timestamp: Date.now() - 1000, likes: 1, liked: false, fromSupabase: true };
    state.supabasePosts = [
      Object.assign({}, base, { id: "px_text" + P_QUOTE, type: "text", text: "Texte " + P_IMG + " " + P_SVG + " https://exemple.test/a?x=\"onmouseover=\"window.__xss=7 @" + nomHostile + " #tag" + P_IMG,
        comments: [
          { id: "cx1" + P_QUOTE, authorId: autre, authorName: nomHostile, authorEmoji: P_IMG, text: "Commentaire " + P_IMG, content: "Commentaire " + P_IMG, createdAt: Date.now(), fromSupabase: true, likedBy: [autre], likes: 1,
            replies: [{ id: "rx1" + P_QUOTE, authorId: autre, authorName: nomHostile, text: "Réponse " + P_IMG, createdAt: Date.now(), type: "reply" }, { id: "ex1", authorId: autre, text: P_IMG, type: "emoji_reaction", createdAt: Date.now() }, { id: "gx1", authorId: autre, text: P_JS, type: "gif_reaction", createdAt: Date.now() }] },
          { id: "cx2", authorId: autre, authorName: nomHostile, text: "https://media.giphy.com/x.gif" + P_IMG, content: "https://media.giphy.com/x.gif" + P_IMG, createdAt: Date.now(), fromSupabase: true },
        ],
        reactions: [{ id: "semoji_1_" + autre, authorId: autre, text: P_IMG, type: "emoji_reaction", createdAt: Date.now() }, { id: "sgif_1_" + autre, authorId: autre, text: P_JS, type: "gif_reaction", createdAt: Date.now() }] }),
      Object.assign({}, base, { id: "px_photo", type: "photo", text: "Photo", image: P_JS, comments: [] }),
      Object.assign({}, base, { id: "px_video", type: "video", text: "Vidéo", video: P_DATA, comments: [], overlays: [{ t: P_IMG, x: 10, y: 10 }] }),
      Object.assign({}, base, { id: "px_audio", type: "audio", text: "Audio", audio: P_JS, comments: [] }),
      Object.assign({}, base, { id: "px_share", type: "text", text: "Repartage", sharedReel: "px_video", sharedReelData: { authorName: nomHostile, text: P_IMG, video: P_JS, cover: P_JS, passion: P_IMG }, comments: [] }),
      Object.assign({}, base, { id: "px_event", type: "text", text: "Lié", eventId: "evx_1", comments: [] }),
    ];
    // Événement d'autrui, avec commentaires et réactions d'événement.
    state.seed.events = state.seed.events || [];
    state.seed.events.unshift({ id: "evx_1", title: "Titre " + P_IMG, description: "Desc " + P_IMG + P_SVG, passion: "musique", date: Date.now() + 86400000, city: "Ville" + P_IMG, address: "Adresse " + P_IMG, contact: P_JS, organizerId: autre, authorId: autre, organizerName: nomHostile, attendees: [autre], maybes: [], waitlist: [], maxAttendees: 10, fromSupabase: true, lat: 45.9, lng: 6.12, eventType: P_IMG, duration: P_IMG, coverUrl: P_JS, cover: P_JS, price: P_IMG, link: P_JS, url: P_JS,
      comments: [{ id: "ecx1", authorId: autre, authorName: nomHostile, text: "Comm event " + P_IMG, createdAt: Date.now() }], reactions: [{ id: "erx1", authorId: autre, emoji: P_IMG, kind: "emoji", payload: P_IMG }] });
    // Notification serveur, non marquée de confiance.
    state.notifications = state.notifications || [];
    state.notifications.unshift({ id: "nx1", text: "Notif " + P_IMG, emoji: P_IMG, fromId: autre, fromName: nomHostile, kind: "like", at: Date.now(), read: false, html: false });
    // Conversation d'autrui : texte, GIF, média, fichier, position, vocal, réponse citée, réactions, nom de groupe.
    const convs = getConversations();
    const now = Date.now();
    convs.unshift({ id: "cx_conv" + P_QUOTE, userId: autre, userName: nomHostile, userEmoji: P_IMG, userColor: P_STYLE, userPhoto: P_JS, unread: 1, lastAt: now, messages: [
      { id: "mx1", from: autre, fromName: nomHostile, fromEmoji: P_IMG, text: "Texte " + P_IMG + " " + P_SVG, at: now - 9000 },
      { id: "mx2", from: autre, fromName: nomHostile, gif: P_JS, at: now - 8000 },
      { id: "mx3", from: autre, fromName: nomHostile, img: P_JS, at: now - 7000 },
      { id: "mx4", from: autre, fromName: nomHostile, video: P_DATA, at: now - 6000 },
      { id: "mx5", from: autre, fromName: nomHostile, fileUrl: P_JS, fileName: "f" + P_IMG, fileType: "doc" + P_IMG, at: now - 5000 },
      { id: "mx6", from: autre, fromName: nomHostile, location: { lat: P_IMG, lng: P_SVG, url: P_JS }, at: now - 4000 },
      { id: "mx7", from: autre, fromName: nomHostile, voiceData: P_JS, voiceDuration: 3, at: now - 3000 },
      { id: "mx8", from: autre, fromName: nomHostile, text: "Réponse", replyTo: { id: "mx1" + P_QUOTE, n: nomHostile, t: P_IMG }, reactions: { [P_IMG]: 2 }, at: now - 2000 },
      { id: "mx9", from: autre, fromName: nomHostile, text: "📍 Position: " + P_JS, at: now - 1000 },
    ] });
    convs.unshift({ id: "gx_conv", isGroup: true, groupName: "Groupe " + P_IMG, groupPhoto: P_JS, userIds: [autre, MY_UID], unread: 0, lastAt: now, messages: [{ id: "gm1", from: autre, fromName: nomHostile, text: "Hello " + P_IMG, at: now }] });
    saveConversationsNow();
    saveState();
  }, [AUTRE, TOUS]);
  return errors;
}

test.describe("AUDIT D — XSS stockées à l'affichage (payloads d'autrui)", () => {
  test.setTimeout(120000);

  test("① fil, détail de publication, discussion, réponses, réactions, repartage, publication liée à une activité", async ({ page }) => {
    await bancHostile(page);
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    await page.waitForTimeout(600);
    await verifier(page, "fil");
    const cartes = await page.evaluate(() => document.querySelectorAll("#feedList article.post").length);
    expect(cartes).toBeGreaterThanOrEqual(5);
    // Le texte hostile est bien AFFICHÉ (échappé), pas avalé.
    expect(await page.evaluate(() => document.getElementById("feedList").textContent.indexOf('<img src=x onerror=') >= 0)).toBe(true);
    for (const id of ["px_text');window.__xss=3;//", "px_photo", "px_video", "px_audio", "px_share", "px_event"]) {
      await page.evaluate((pid) => { try { openPost(pid); } catch (e) { window.__ouvertureErreur = String(e && e.message); } }, id);
      await page.waitForTimeout(400);
      await verifier(page, "détail " + id);
      await page.evaluate(() => { try { closePost(); } catch (e) {} });
    }
    await page.evaluate((pid) => openComments(pid), "px_text');window.__xss=3;//");
    await page.waitForTimeout(500);
    await verifier(page, "discussion");
    // Les commandes « voir qui a réagi » et « réagir » sur un commentaire hostile.
    await page.evaluate(() => { const chip = document.querySelector("#commentsBox .cmt-react-chip"); if (chip) chip.click(); });
    await page.waitForTimeout(200);
    await verifier(page, "liste des réacteurs");
    await page.evaluate(() => { const m = document.querySelector("#commentsBox .cmt-mention, #commentsBox .cmt-hashtag"); if (m) m.click(); });
    await page.waitForTimeout(300);
    await verifier(page, "mention/hashtag cliqués");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.evaluate((pid) => { try { openPostReactors(pid, null); } catch (e) {} }, "px_text');window.__xss=3;//");
    await page.waitForTimeout(200);
    await verifier(page, "réacteurs d'une publication");
  });

  test("② profil visité (nom, bio, liens réseaux, couverture, passions), menu ⋯, suggestions de mention", async ({ page }) => {
    await bancHostile(page);
    await page.evaluate((autre) => openUserProfile(autre, "seed"), AUTRE);
    await page.waitForTimeout(800);
    await verifier(page, "profil visité");
    const liens = await page.evaluate(() => [...document.querySelectorAll("#modalContent a[href]")].map((a) => a.getAttribute("href")));
    for (const h of liens) expect(h).not.toMatch(/^\s*javascript:/i);
    await page.evaluate(() => { const b = document.querySelector("#modalContent .profile-dots-btn"); if (b) b.click(); });
    await page.waitForTimeout(200);
    await verifier(page, "menu ⋯ du profil visité");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    // Boîte de suggestion de @mention nourrie par le nom hostile.
    await page.evaluate((pid) => openComments(pid), "px_photo");
    await page.waitForTimeout(300);
    await page.fill("#newComment", "@Mal");
    await page.evaluate(() => { const el = document.getElementById("newComment"); el.dispatchEvent(new Event("input", { bubbles: true })); try { _cmtMentionDetect(el); } catch (e) {} });
    await page.waitForTimeout(200);
    await verifier(page, "suggestions de mention");
    await page.evaluate(() => { const r = document.querySelector("#mention-box .mention-row"); if (r) r.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    await verifier(page, "mention choisie");
  });

  test("③ messagerie : liste, conversation (texte, GIF, média, fichier, position, vocal, citation, réactions), groupe hostile", async ({ page }) => {
    await bancHostile(page);
    await page.evaluate(() => { goTo("messages"); renderMessages(); });
    await page.waitForTimeout(400);
    await verifier(page, "liste des messages");
    await page.evaluate(() => openConversation("cx_conv');window.__xss=3;//"));
    await page.waitForTimeout(800);
    await verifier(page, "conversation 1:1");
    const srcs = await page.evaluate(() => [...document.querySelectorAll("#convFpThread img, #convFpThread video, #convFpThread a")].map((e) => (e.getAttribute("src") || e.getAttribute("href") || "")));
    for (const s of srcs) expect(s).not.toMatch(/^\s*(javascript:|data:text\/html)/i);
    // Appui long / menu d'un message hostile, citation en réponse.
    await page.evaluate(() => { const b = document.querySelector("#convFpThread .conv-bubble-wrap"); if (b && typeof _setReplyTo === "function") { try { _setReplyTo("cx_conv');window.__xss=3;//", "mx1"); } catch (e) {} } });
    await page.waitForTimeout(200);
    await verifier(page, "barre de réponse");
    await page.evaluate(() => { try { openConvSettings("cx_conv');window.__xss=3;//"); } catch (e) {} });
    await page.waitForTimeout(300);
    await verifier(page, "paramètres de conversation");
    await page.evaluate(() => { try { closeConvSettings(); closeConversation(); } catch (e) {} });
    await page.evaluate(() => openConversation("gx_conv"));
    await page.waitForTimeout(600);
    await verifier(page, "groupe hostile");
    await page.evaluate(() => { try { openConvSettings("gx_conv"); } catch (e) {} });
    await page.waitForTimeout(300);
    await verifier(page, "paramètres du groupe");
  });

  test("④ Rencontrer : carte d'activité, fiche détail, commentaires et réactions d'activité, participants, partage", async ({ page }) => {
    await bancHostile(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    await page.waitForTimeout(600);
    await verifier(page, "liste Rencontrer");
    await page.evaluate(() => openEventDetails("evx_1"));
    await page.waitForTimeout(800);
    await verifier(page, "fiche d'activité");
    const liens = await page.evaluate(() => [...document.querySelectorAll("#eventDetailPage a[href], #eventDetailPage img[src]")].map((a) => a.getAttribute("href") || a.getAttribute("src")));
    for (const h of liens) expect(h).not.toMatch(/^\s*javascript:/i);
    await page.evaluate(() => { try { openCommentSheet("evx_1", "Titre " + '"><img src=x onerror=window.__xss=1>'); } catch (e) {} });
    await page.waitForTimeout(400);
    await verifier(page, "feuille de commentaires d'activité");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.evaluate(() => { try { if (typeof openEventAttendees === "function") openEventAttendees("evx_1"); } catch (e) {} });
    await page.waitForTimeout(300);
    await verifier(page, "participants");
    await page.evaluate(() => { try { closeModal(); closeEventDetail(); } catch (e) {} });
  });

  test("⑤ notifications, bobines, Rechercher (créateurs), tri par passion hostile", async ({ page }) => {
    await bancHostile(page);
    await page.evaluate(() => openNotifications());
    await page.waitForTimeout(300);
    await verifier(page, "notifications");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.evaluate(() => { try { openReels(); } catch (e) {} });
    await page.waitForTimeout(700);
    await verifier(page, "bobines");
    await page.evaluate(() => { try { closeReels(); } catch (e) {} });
    await page.evaluate(() => { goTo("explore"); renderExplorer(); });
    await page.waitForTimeout(500);
    await verifier(page, "Rechercher");
    await page.evaluate(() => { try { document.getElementById("explorerSearch").value = "Mallory"; filterExplore(); } catch (e) {} });
    await page.waitForTimeout(300);
    await verifier(page, "Rechercher · résultat");
  });
});
