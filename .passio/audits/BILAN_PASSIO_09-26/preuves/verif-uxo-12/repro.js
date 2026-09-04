const { chromium } = require('/home/user/passio-app/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/supabase\.co|unsplash|unpkg|jsdelivr|cdnjs|openfreemap/, r => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem("passio_gate_v1", "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f");
    localStorage.setItem("passio_pwa_dismissed", "1");
  });
  await page.goto('http://127.0.0.1:8120/index.html');
  await page.waitForFunction(() => document.querySelector('#screen-feed.active'), null, { timeout: 15000 });
  const nav = () => page.evaluate(() => ({
    ecran: (document.querySelector('.screen.active') || {}).id,
    navActifs: [...document.querySelectorAll('.app-nav-v2 .nav-item.active')].map(n => n.textContent.trim()),
    tousNav: [...document.querySelectorAll('.nav-item')].map(n => ({ ds: n.getAttribute('data-screen'), active: n.classList.contains('active'), cur: n.getAttribute('aria-current'), visible: !!n.offsetParent })),
    exploreBack: !!document.querySelector('#screen-explore [aria-label*="etour" i], #screen-explore .back, #screen-explore button.btn-back'),
    exploreHeader: (document.querySelector('#screen-explore .topbar, #screen-explore header') || {}).textContent
  }));
  console.log('FEED', JSON.stringify(await nav()));
  // loupe du bandeau
  const loupe = await page.$('[onclick*="goTo(\'explore\')"], [data-screen="explore"], .topbar-search, [aria-label*="Recherch"]');
  console.log('loupe trouvée', !!loupe, loupe ? await loupe.evaluate(e => e.outerHTML.slice(0, 200)) : '');
  await page.evaluate(() => goTo('explore'));
  await page.waitForTimeout(500);
  console.log('EXPLORE', JSON.stringify(await nav()));
  await page.screenshot({ path: __dirname + '/explore-nav.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
