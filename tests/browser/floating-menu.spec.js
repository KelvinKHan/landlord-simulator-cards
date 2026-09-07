import { test, expect } from '@playwright/test';

const names = ['小手机', '创意工坊', '掌上公寓'];

async function startMenu(page, viewport = { width: 633, height: 728 }) {
  await page.setViewportSize(viewport);
  await page.route('**/floating-menu-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  }));
  await page.goto('/floating-menu-fixture');
  await page.addScriptTag({ url: '/node_modules/jquery/dist/jquery.min.js' });
  await page.addScriptTag({ url: '/src/legacy/S02.js' });
  await page.evaluate(labels => {
    window.menuClicks = [];
    labels.forEach((label, index) => FloatingMenuManager.registerButton({
      id: `feature-${index}`, label, icon: String(index + 1), order: index + 1,
      onClick: () => menuClicks.push(label),
    }));
  }, names);
}

async function expectReachable(page, labels = names) {
  for (const label of labels) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    await button.click();
    expect(await page.evaluate(() => menuClicks.at(-1))).toBe(label);
  }
}

async function dragMain(page, x, y) {
  const main = page.getByRole('button', { name: '房东模拟器功能菜单' });
  const box = await main.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

test('default narrow Tavern view shows every feature below the main button and each works', async ({ page }) => {
  await startMenu(page);
  await page.getByRole('button', { name: '房东模拟器功能菜单' }).click();
  await expectReachable(page);
  const main = await page.getByRole('button', { name: '房东模拟器功能菜单' }).boundingBox();
  const apartment = await page.getByRole('button', { name: '掌上公寓' }).boundingBox();
  expect(apartment.y).toBeGreaterThan(main.y + main.height);
});

test('expanded features stay reachable when dragged to every small-screen edge and center', async ({ page }) => {
  await startMenu(page, { width: 320, height: 240 });
  await page.getByRole('button', { name: '房东模拟器功能菜单' }).click();
  for (const [x, y] of [[0, 0], [320, 0], [320, 240], [0, 240], [160, 120]]) {
    await dragMain(page, x, y);
    await expectReachable(page);
  }
});

test('resize recalculates the feature layout even when the main button remains in place', async ({ page }) => {
  await startMenu(page);
  await page.getByRole('button', { name: '房东模拟器功能菜单' }).click();
  const before = await page.evaluate(() => FloatingMenuManager.getState().position);
  await page.setViewportSize({ width: 320, height: 200 });
  await expectReachable(page);
  expect(await page.evaluate(() => FloatingMenuManager.getState().position)).toEqual(before);
});

test('late registration remains expanded and keyboard activation reaches new buttons', async ({ page }) => {
  await startMenu(page);
  const main = page.getByRole('button', { name: '房东模拟器功能菜单' });
  await main.focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => FloatingMenuManager.registerButton({
    id: 'late', label: '稍后加载的功能', icon: '+',
    onClick: () => menuClicks.push('稍后加载的功能'),
  }));
  const late = page.getByRole('button', { name: '稍后加载的功能' });
  await expect(late).toBeInViewport({ ratio: 1 });
  await late.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => menuClicks.at(-1))).toBe('稍后加载的功能');
  await page.keyboard.press('Escape');
  await expect(main).toHaveAttribute('aria-expanded', 'false');
  await expect(late).toBeHidden();
  await main.focus();
  await page.keyboard.press('Space');
  await expectReachable(page, [...names, '稍后加载的功能']);
});

test('very small viewport uses a scrollable menu without reducing button targets', async ({ page }) => {
  await startMenu(page, { width: 240, height: 180 });
  await dragMain(page, 120, 90);
  await page.getByRole('button', { name: '房东模拟器功能菜单' }).click();
  await expect(page.locator('.fmm-sub-container')).toHaveClass(/scrollable/);
  for (const label of names) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(button).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => menuClicks.at(-1))).toBe(label);
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
});

test('destroy and reinitialization remove old resize, pointer and keyboard handlers', async ({ page }) => {
  await startMenu(page);
  await page.evaluate(() => {
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    window.menuListeners = new Set();
    document.addEventListener = (type, callback, options) => {
      menuListeners.add(callback);
      originalAdd(type, callback, options);
    };
    document.removeEventListener = (type, callback, options) => {
      menuListeners.delete(callback);
      originalRemove(type, callback, options);
    };
    FloatingMenuManager.destroy();
    FloatingMenuManager.init();
    FloatingMenuManager.destroy();
  });
  expect(await page.evaluate(() => menuListeners.size)).toBe(0);
  await expect(page.locator('.fmm-main-fab, .fmm-sub-container')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 240 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => FloatingMenuManager.init());
  const main = page.getByRole('button', { name: '房东模拟器功能菜单' });
  await main.focus();
  await page.keyboard.press('Enter');
  await expect(main).toHaveAttribute('aria-expanded', 'true');
});
