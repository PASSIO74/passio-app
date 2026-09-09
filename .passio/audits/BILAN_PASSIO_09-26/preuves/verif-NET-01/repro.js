const { chromium } = require('/home/user/passio-app/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // gate + bloquer l'Edge Function (indisponible)
  await page.addInitScript(() => { sessionStorage.setItem('passio_gate_v1','67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f'); });
  await page.route(/functions\/v1\/ask-ai/, r => r.abort());
  await page.goto('http://127.0.0.1:8120/index.html');
  await page.waitForFunction(() => typeof aiGenerateResponse === 'function' && typeof state !== 'undefined' && state && state.seed, null, { timeout: 30000 });
  const direct = await page.evaluate(() => ({
    intentVoyage: aiDetectIntent('je pars en voyage'),
    intentLive: aiDetectIntent('live'),
    html: aiGenerateResponse('je pars en voyage')
  }));
  console.log('DIRECT', JSON.stringify(direct));
  // parcours UI : Explorer → Assistant IA → saisie
  await page.evaluate(() => { goTo('explore'); switchExploreTab('ai'); });
  await page.fill('#aiInput', 'je pars en voyage');
  await page.evaluate(() => sendAIQuery());
  await page.waitForFunction(() => { const c = document.querySelector('#aiResultContent'); return c && !c.querySelector('.ai-loading') && c.textContent.length > 20; }, null, { timeout: 15000 });
  const txt = await page.evaluate(() => document.querySelector('#aiResultContent').innerText);
  console.log('UI_TEXT', JSON.stringify(txt));
  console.log('MATCH_CDV', /carnet|CDV/i.test(txt));
  await page.screenshot({ path: process.argv[2], fullPage: false });
  await b.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
