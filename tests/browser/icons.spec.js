import { test, expect } from '@playwright/test';

test('every bundled icon decodes while all external image services are blocked', async ({ page }) => {
  const externalRequests = [];
  await page.route('https://**', route => { externalRequests.push(route.request().url()); return route.abort(); });
  await page.goto('/tests/browser/host.html');
  const result = await page.evaluate(async () => {
    const { default: icons } = await import('/src/runtime/icons.json', { with: { type: 'json' } });
    const { iconUrl } = await import('/src/runtime/icons.js');
    const failed = [];
    for (const name of Object.keys(icons)) {
      const image = new Image();
      image.src = iconUrl(name, 'white');
      try { await image.decode(); if (image.naturalWidth <= 0) failed.push(name); }
      catch { failed.push(name); }
    }
    return { count: Object.keys(icons).length, failed };
  });
  expect(result.count).toBeGreaterThan(80);
  expect(result.failed).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('original menus and phone use bundled artwork when external services fail', async ({ page }) => {
  const iconRequests = [];
  await page.route('https://**', route => {
    const url = route.request().url();
    if (url.includes('mvu_zod.js')) return route.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export function registerMvuSchema() {}' });
    if (url.includes('api.iconify.design')) iconRequests.push(url);
    return route.abort();
  });
  await page.goto('/tests/browser/host.html');
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(() => fixtureStart('original'));
  const pictures = page.locator('img[src^="data:image/svg+xml,"]');
  expect(await pictures.count()).toBeGreaterThan(8);
  const failures = await pictures.evaluateAll(async images => {
    await Promise.all(images.map(img => img.decode().catch(() => {})));
    return images.filter(img => !img.naturalWidth).map(img => img.outerHTML);
  });
  expect(failures).toEqual([]);
  expect(iconRequests).toEqual([]);
});
