const { test, expect } = require("/home/user/passio-app/node_modules/@playwright/test");
const { bootVisiteur } = require("/home/user/passio-app/tests/e2e/first-run-helper");
test("CARTO-09 bis : effets du partage visiteur", async ({ page }) => {
  const reqs = [];
  page.on("request", r => { if (/supabase\.co/.test(r.url()) && r.method() !== "GET") reqs.push(r.method() + " " + r.url().replace(/\?.*/, "")); });
  await bootVisiteur(page);
  const r = await page.evaluate(async () => {
    const avant = state.userPosts.length;
    const p = allFeedPosts()[0];
    sharePost(p.id);
    document.getElementById("_shareInFeedBtn").click();
    await new Promise(r => setTimeout(r, 2500));
    return { avant, apres: state.userPosts.length, dernier: state.userPosts[0] && { id: state.userPosts[0].id, sharedPostId: state.userPosts[0].sharedPostId, author: state.userPosts[0].author, uid: state.userPosts[0].uid },
      outbox: Object.keys(localStorage).filter(k => /outbox/.test(k)).map(k => k + "=" + (localStorage.getItem(k) || "").length),
      supa: typeof supa !== "undefined" && !!supa, session: !!(window._supaReal) };
  });
  console.log(JSON.stringify({ r, reqs }, null, 1));
});
