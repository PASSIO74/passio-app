const { test, expect } = require('@playwright/test');
const { bootOnboarded } = require('./app-helper');

test('une notification synchronisée ne gagne aucun droit HTML avec ses indicateurs', async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__socialXss = 0;
    _applyUserState({ notifications: [
      { id:'hostile_html', kind:'system', html:true, text:'<img src=x onerror="window.__socialXss++"><b onclick="window.__socialXss++">texte</b>', unread:true, createdAt:Date.now() },
      { id:'hostile_local', kind:'local', text:'<svg onload="window.__socialXss++"></svg>', unread:true, createdAt:Date.now() }
    ] });
    openNotifications();
  });
  await expect(page.locator('.notif-row')).toHaveCount(2);
  await expect(page.locator('.notif-text img, .notif-text svg, .notif-text [onclick]')).toHaveCount(0);
  await expect(page.locator('.notif-text').first()).toContainText('<img');
  expect(await page.evaluate(() => window.__socialXss)).toBe(0);
});

test('les notifications locales gardent le gras sans attribut et les apostrophes', async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    state.notifications = [];
    pushNotification("<b>Ben&#39;j</b> te rejoint", '✨');
    openNotifications();
  });
  await expect(page.locator('.notif-text b')).toHaveText("Ben'j");
});

test('le libellé et l’emoji du référentiel restent du texte sur la fiche activité', async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__socialXss = 0;
    const original = passionById;
    passionById = function (id) {
      return Object.assign({}, original(id), {label:'<img src=x onerror="window.__socialXss++">', emoji:'<svg onload="window.__socialXss++"></svg>'});
    };
    const ev = state.seed.events[0];
    openEventDetails(ev.id);
  });
  const badge = page.locator('.event-detail-passion-badge');
  await expect(badge).toContainText('<img');
  await expect(badge.locator('img,svg')).toHaveCount(0);
  expect(await page.evaluate(() => window.__socialXss)).toBe(0);
});
