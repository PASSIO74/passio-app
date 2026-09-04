const { chromium } = require('/home/user/passio-app/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { sessionStorage.setItem('passio_gate_v1','67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f'); });
  await page.goto('http://localhost:8120/');
  await page.waitForFunction(() => window.state && document.querySelector('#feedList .post-card, #feedList [data-post-id], #feedList .post-action'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    visiteur: window.PassioFirstRun && PassioFirstRun.estVisiteur ? PassioFirstRun.estVisiteur() : 'n/a',
    myUid: typeof MY_UID === 'undefined' ? 'undefined' : MY_UID,
    rootClass: document.documentElement.className,
    onboarded: !!(state && state.onboarded),
    nbShare: document.querySelectorAll('#feedList .post-action[title="Partager"]').length,
  }));
  console.log('AVANT', JSON.stringify(info));
  const btn = page.locator('#feedList .post-action[title="Partager"]').first();
  await btn.click();
  await page.waitForSelector('#_shareInFeedBtn', { timeout: 5000 });
  await page.locator('#_shareInFeedBtn').click();
  await page.waitForTimeout(800);
  const apres = await page.evaluate(() => ({
    toasts: Array.from(document.querySelectorAll('.toast, #toast, [class*="toast"]')).map(e => e.textContent.trim()).filter(Boolean),
    gateTitle: (document.querySelector('.fr-gate-title') || {}).textContent || null,
    modalOpen: !!document.querySelector('.modal-backdrop.open, .modal.open, #modalBackdrop.open'),
    modalText: (document.querySelector('.modal-title') || {}).textContent || null,
  }));
  console.log('APRES', JSON.stringify(apres));
  await page.screenshot({ path: __dirname + '/apres-partage.jpg', quality: 50 });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
