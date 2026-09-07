import { test, expect } from '@playwright/test';

async function mountControlsFixture(page) {
  await page.waitForFunction(() => fixtureReady);
  await page.evaluate(async () => {
    window.mountVersionControls = (await import('/src/updater/controls.js')).mountVersionControls;
    window.versionState = {
      currentTag: 'v5.21.0-rc.2', preference: { mode: 'latest' }, busy: false, status: '', error: null,
      releases: [
        { tag: 'v5.22.0', version: '5.22.0', name: '正式版', prerelease: false },
        { tag: 'v5.23.0-rc.1', version: '5.23.0-rc.1', name: '下一版', prerelease: true },
      ],
    };
    window.versionCalls = { refresh: 0, apply: [] };
    window.versionTimerIds = new Set();
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      const id = nativeSetInterval(callback, delay, ...args); versionTimerIds.add(id); return id;
    };
    window.clearInterval = id => { versionTimerIds.delete(id); return nativeClearInterval(id); };
    window.versionRefresh = async () => { versionCalls.refresh++; };
    window.versionApply = async preference => { versionCalls.apply.push(preference); versionState.preference = preference; };
    window.mountFixtureControls = () => mountVersionControls({
      host: window, getState: () => versionState,
      refresh: () => versionRefresh(), apply: preference => versionApply(preference),
    });
    window.versionControls = mountFixtureControls();
  });
}

async function dragVersionBall(page, x, y, { release = true } = {}) {
  const box = await page.locator('#landlord-version-controls summary').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  if (release) await page.mouse.up();
}

async function expectInsideViewport(locator, viewport) {
  // Resize and content measurements settle on the next animation frame.
  await expect(async () => {
    const rect = await locator.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
  }).toPass({ timeout: 2000, intervals: [16, 50, 100] });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/host.html');
  await mountControlsFixture(page);
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(0);
  await page.locator('#landlord-version-controls summary').click();
  await expect.poll(() => page.evaluate(() => versionCalls.refresh)).toBe(1);
  await expect(page.getByLabel('更新方式与版本')).toBeEnabled();
});

test('the panel lists automatic and pinned releases safely, preserves absent pins, and fits a narrow screen', async ({ page }) => {
  const choice = page.getByLabel('更新方式与版本');
  await expect(choice).toHaveValue('latest');
  await expect(choice.locator('option')).toHaveText(['跟随最新正式版', '正式版（v5.22.0）', '下一版（v5.23.0-rc.1） · 候选版']);
  await expect(page.locator('#landlord-version-controls summary')).toHaveText('版本与更新 · v5.21.0-rc.2');
  await expect(page.locator('#landlord-version-controls summary')).toHaveAttribute('aria-label', '版本与更新');
  await expect(page.locator('#landlord-version-controls summary')).toHaveAttribute('title', /v5\.21\.0-rc\.2/);
  await expect(page.locator('#landlord-version-warning')).toContainText('切换版本不会回退聊天记录或存档。');
  await page.evaluate(() => {
    versionState.preference = { mode: 'pinned', tag: 'v5.20.0' };
    versionState.releases[0].name = '<img src=x onerror="window.injected=true">';
    versionControls.render();
  });
  await expect(choice).toHaveValue('v5.20.0');
  await expect(choice.locator('option').last()).toHaveText('已选版本：v5.20.0（列表暂未提供）');
  await expect(choice.locator('option').nth(1)).toContainText('<img src=x');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('#landlord-version-controls img')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 640 });
  await expectInsideViewport(page.locator('#landlord-version-controls .landlord-version-body'), { width: 320, height: 640 });
  await page.locator('#landlord-version-controls summary').click();
  await page.locator('#landlord-version-controls summary').click();
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(1);
});

test('refresh disables operations, reports errors, and keeps an unsaved selection', async ({ page }) => {
  const choice = page.getByLabel('更新方式与版本');
  await choice.selectOption('v5.23.0-rc.1');
  await page.evaluate(() => {
    window.versionRefresh = () => { versionCalls.refresh++; return new Promise((resolve, reject) => { window.rejectVersionRefresh = reject; }); };
  });
  await page.getByRole('button', { name: '刷新版本列表' }).click();
  await expect(choice).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存选择并刷新' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('正在刷新版本列表…');
  await page.evaluate(() => rejectVersionRefresh(Error('暂时无法获取版本，请稍后再试。')));
  await expect(page.getByRole('alert')).toHaveText('暂时无法获取版本，请稍后再试。');
  await expect(choice).toBeEnabled(); await expect(choice).toHaveValue('v5.23.0-rc.1');
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(2);
  await page.evaluate(() => { versionState.busy = true; versionControls.render(); });
  await expect(choice).toBeDisabled();
  await expect(page.getByRole('button', { name: '刷新版本列表' })).toBeDisabled();
});

test('save passes the selected preference and surfaces guarded save failures', async ({ page }) => {
  const choice = page.getByLabel('更新方式与版本');
  await choice.selectOption('v5.23.0-rc.1');
  await page.getByRole('button', { name: '保存选择并刷新' }).click();
  await expect.poll(() => page.evaluate(() => versionCalls.apply)).toEqual([{ mode: 'pinned', tag: 'v5.23.0-rc.1' }]);
  await choice.selectOption('latest');
  await page.getByRole('button', { name: '保存选择并刷新' }).click();
  await expect.poll(() => page.evaluate(() => versionCalls.apply.length)).toBe(2);
  expect(await page.evaluate(() => versionCalls.apply[1])).toEqual({ mode: 'latest' });
  await page.evaluate(() => { versionApply = async () => { throw Error('正在生成消息，请完成后再切换版本。'); }; });
  await page.getByRole('button', { name: '保存选择并刷新' }).click();
  await expect(page.getByRole('alert')).toHaveText('正在生成消息，请完成后再切换版本。');
  await expect(choice).toBeEnabled();
});

test('generation ending re-enables an open panel without rebuilding unchanged controls', async ({ page }) => {
  const choice = page.getByLabel('更新方式与版本');
  await page.evaluate(() => {
    versionState.busy = true; versionControls.render();
    window.unchangedVersionOption = document.querySelector('#landlord-version-choice option');
  });
  await expect(choice).toBeDisabled();
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => unchangedVersionOption === document.querySelector('#landlord-version-choice option'))).toBe(true);
  await page.evaluate(() => { versionState.busy = false; });
  await expect(choice).toBeEnabled();
  await expect(page.getByRole('button', { name: '保存选择并刷新' })).toBeEnabled();
  await expect(page.locator('#landlord-version-controls')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(1);
});

test('the floating ball distinguishes dragging, a small click movement, and keyboard activation', async ({ page }) => {
  const panel = page.locator('#landlord-version-controls');
  const ball = panel.locator('summary');
  await ball.click();
  await expect(panel).not.toHaveAttribute('open', '');
  const before = await ball.boundingBox();
  expect(before.width).toBeGreaterThanOrEqual(44);
  expect(before.height).toBeCloseTo(before.width, 0);
  await dragVersionBall(page, 440, 220);
  await expect(panel).not.toHaveAttribute('open', '');
  const after = await ball.boundingBox();
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(100);
  await ball.click();
  await expect(panel).toHaveAttribute('open', '');
  await dragVersionBall(page, 880, 500);
  await expect(panel).toHaveAttribute('open', '');
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
  const box = await ball.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1);
  await page.mouse.up();
  await expect(panel).not.toHaveAttribute('open', '');
  await ball.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(panel).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(1);
});

test('the dragged ball position survives remounting and browser refresh', async ({ page }) => {
  const ball = page.locator('#landlord-version-controls summary');
  await dragVersionBall(page, 570, 390);
  const before = await ball.boundingBox();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('landlord:version-controls:position')));
  expect(saved.x).toBeCloseTo(before.x, 0);
  expect(saved.y).toBeCloseTo(before.y, 0);
  await page.evaluate(() => { versionControls = mountFixtureControls(); });
  const remounted = await ball.boundingBox();
  expect(remounted.x).toBeCloseTo(before.x, 0);
  expect(remounted.y).toBeCloseTo(before.y, 0);
  await page.reload();
  await mountControlsFixture(page);
  const reloaded = await ball.boundingBox();
  expect(reloaded.x).toBeCloseTo(before.x, 0);
  expect(reloaded.y).toBeCloseTo(before.y, 0);
  await ball.click();
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
});

test('scrolling a transformed root preserves the dragged screen position across remounts', async ({ page }) => {
  await page.setViewportSize({ width: 633, height: 728 });
  const ball = page.locator('#landlord-version-controls summary');
  const layer = page.locator('#landlord-version-controls-viewport');
  await page.evaluate(() => {
    // Force genuine root scrolling, as ST can do when focusing native controls.
    document.documentElement.style.cssText = 'transform:translateZ(0);perspective:1000px;height:1600px;overflow:auto;';
    document.body.style.cssText = 'position:fixed;top:0;margin:0;width:100%;height:100dvh;overflow:hidden;';
    window.scrollTo(0, 151);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(151);
  await expect(async () => {
    const rect = await layer.boundingBox();
    expect(rect.x).toBeCloseTo(0, 0);
    expect(rect.y).toBeCloseTo(0, 0);
  }).toPass({ timeout: 2000 });
  await expectInsideViewport(page.locator('#landlord-version-controls'), { width: 633, height: 728 });
  await dragVersionBall(page, 230, 390);
  const before = await ball.boundingBox();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('landlord:version-controls:position')));
  expect(saved.x).toBeCloseTo(before.x, 0);
  expect(saved.y).toBeCloseTo(before.y, 0);
  await page.evaluate(() => { versionControls = mountFixtureControls(); });
  const remounted = await ball.boundingBox();
  expect(remounted.x).toBeCloseTo(before.x, 0);
  expect(remounted.y).toBeCloseTo(before.y, 0);
  await page.evaluate(() => window.scrollTo(0, 340));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(340);
  await expect(async () => {
    const scrolled = await ball.boundingBox();
    expect(scrolled.x).toBeCloseTo(before.x, 0);
    expect(scrolled.y).toBeCloseTo(before.y, 0);
  }).toPass({ timeout: 2000 });
  await ball.click();
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
  await expectInsideViewport(page.locator('#landlord-version-controls .landlord-version-body'), { width: 633, height: 728 });
});

test('pointer cancellation and lost capture end a drag without swallowing the next click', async ({ page }) => {
  const panel = page.locator('#landlord-version-controls');
  const ball = panel.locator('summary');
  for (const reason of ['pointercancel', 'lostpointercapture']) {
    const wasOpen = await panel.evaluate(element => element.open);
    await ball.evaluate(element => element.addEventListener('pointerdown', event => {
      window.dragPointerId = event.pointerId;
    }, { once: true }));
    await dragVersionBall(page, reason === 'pointercancel' ? 500 : 620, 350, { release: false });
    await expect(panel).toHaveClass(/is-dragging/);
    const stopped = await ball.boundingBox();
    if (reason === 'pointercancel') {
      await ball.dispatchEvent('pointercancel', { pointerId: await page.evaluate(() => dragPointerId), bubbles: true });
    } else {
      // A real capture loss is dispatched before the next pointer movement.
      await ball.evaluate(element => element.releasePointerCapture(window.dragPointerId));
    }
    await page.mouse.move(800, 600, { steps: 4 });
    await expect(panel).not.toHaveClass(/is-dragging/);
    const after = await ball.boundingBox();
    expect(after.x).toBeCloseTo(stopped.x, 0);
    expect(after.y).toBeCloseTo(stopped.y, 0);
    await page.mouse.up();
    expect(await panel.evaluate(element => element.open)).toBe(wasOpen);
    await ball.click();
    await expect.poll(() => panel.evaluate(element => element.open)).toBe(!wasOpen);
  }
});

test('dragging to every edge and resizing keep both the ball and scrollable panel reachable', async ({ page }) => {
  const panel = page.locator('#landlord-version-controls');
  const body = panel.locator('.landlord-version-body');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const [x, y] of [[0, 0], [320, 0], [320, 640], [0, 640]]) {
    await dragVersionBall(page, x, y);
    await expect(panel).toHaveAttribute('open', '');
    await expectInsideViewport(panel, { width: 320, height: 640 });
    await expectInsideViewport(body, { width: 320, height: 640 });
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await dragVersionBall(page, 1320, 920);
  await page.setViewportSize({ width: 320, height: 240 });
  await expectInsideViewport(panel, { width: 320, height: 240 });
  await expectInsideViewport(body, { width: 320, height: 240 });
  const refresh = page.getByRole('button', { name: '刷新版本列表' });
  await refresh.scrollIntoViewIfNeeded();
  await refresh.click();
  await expect.poll(() => page.evaluate(() => versionCalls.refresh)).toBe(2);
  await expectInsideViewport(panel, { width: 320, height: 240 });
});

test('generation locks version changes while leaving the floating ball usable', async ({ page }) => {
  const panel = page.locator('#landlord-version-controls');
  const ball = panel.locator('summary');
  await page.evaluate(() => { versionState.busy = true; versionControls.render(); });
  await expect(page.getByLabel('更新方式与版本')).toBeDisabled();
  await dragVersionBall(page, 620, 400);
  await expect(panel).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: '保存选择并刷新' })).toBeDisabled();
  await ball.click();
  await expect(panel).not.toHaveAttribute('open', '');
  await dragVersionBall(page, 880, 600);
  await expect(panel).not.toHaveAttribute('open', '');
  await ball.click();
  await expect(page.getByLabel('更新方式与版本')).toBeDisabled();
  expect(await page.evaluate(() => versionCalls.apply)).toEqual([]);
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(1);
});

test('invalid or unavailable position storage cannot prevent opening the controls', async ({ page }) => {
  const panel = page.locator('#landlord-version-controls');
  for (const value of ['{broken', '{"x":"NaN","y":null}', '{"x":99999,"y":-99999}']) {
    await page.evaluate(value => {
      localStorage.setItem('landlord:version-controls:position', value);
      versionControls = mountFixtureControls();
    }, value);
    await expectInsideViewport(panel, { width: 1400, height: 1000 });
    await panel.locator('summary').click();
    await expect(page.getByLabel('更新方式与版本')).toBeVisible();
  }
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    versionControls = mountFixtureControls();
  });
  await dragVersionBall(page, 500, 400);
  await panel.locator('summary').click();
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
});

test('disposing during a drag removes global listeners and leaves the next mount responsive', async ({ page }) => {
  await page.evaluate(() => {
    versionControls.dispose();
    window.versionGlobalListeners = [];
    for (const target of [window, document, window.visualViewport].filter(Boolean)) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (type, callback, options) => {
        versionGlobalListeners.push({ target, type, callback, capture: Boolean(typeof options === 'boolean' ? options : options?.capture) });
        add(type, callback, options);
      };
      target.removeEventListener = (type, callback, options) => {
        const capture = Boolean(typeof options === 'boolean' ? options : options?.capture);
        versionGlobalListeners = versionGlobalListeners.filter(item => !(item.target === target && item.type === type && item.callback === callback && item.capture === capture));
        remove(type, callback, options);
      };
    }
    versionControls = mountFixtureControls();
  });
  await dragVersionBall(page, 640, 350, { release: false });
  await page.evaluate(() => { versionControls.dispose(); });
  await page.mouse.up();
  expect(await page.evaluate(() => versionGlobalListeners.map(({ type }) => type))).toEqual([]);
  expect(await page.evaluate(() => versionTimerIds.size)).toBe(0);
  await expect(page.locator('#landlord-version-controls-viewport')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => { versionControls = mountFixtureControls(); });
  await page.locator('#landlord-version-controls summary').click();
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
  await page.evaluate(() => { versionControls.dispose(); });
  expect(await page.evaluate(() => versionGlobalListeners.map(({ type }) => type))).toEqual([]);
});

test('repeated mounts and disposal detach handlers and ignore an old pending completion', async ({ page }) => {
  await page.evaluate(() => {
    window.oldRefreshButton = document.querySelector('#landlord-version-controls button');
    versionRefresh = () => new Promise(resolve => { window.finishOldVersionRequest = resolve; });
  });
  await page.getByRole('button', { name: '刷新版本列表' }).click();
  await page.evaluate(() => {
    const previous = versionControls;
    versionControls = mountFixtureControls();
    previous.dispose();
    oldRefreshButton.click();
    finishOldVersionRequest();
    versionRefresh = async () => { versionCalls.refresh++; };
  });
  await expect(page.locator('#landlord-version-controls')).toHaveCount(1);
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  expect(await page.evaluate(() => versionTimerIds.size)).toBe(1);
  await page.locator('#landlord-version-controls summary').click();
  await expect.poll(() => page.evaluate(() => versionCalls.refresh)).toBe(2);
  await expect(page.getByRole('button', { name: '刷新版本列表' })).toBeEnabled();
  await expect(page.getByRole('status')).toBeHidden();
  await page.evaluate(() => {
    versionRefresh = async () => { versionCalls.refresh++; };
    oldRefreshButton.click();
  });
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(2);
  await page.getByRole('button', { name: '刷新版本列表' }).click();
  expect(await page.evaluate(() => versionCalls.refresh)).toBe(3);
  await page.evaluate(() => { versionControls.dispose(); versionControls.dispose(); versionControls.render(); });
  await expect(page.locator('#landlord-version-controls')).toHaveCount(0);
  expect(await page.evaluate(() => versionTimerIds.size)).toBe(0);
  await expect(page.locator('#landlord-version-controls-viewport')).toHaveCount(0);
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(0);
});

test('version and mode controls remain clickable with the real SillyTavern transformed root', async ({ page }) => {
  await page.route('https://**', route => {
    if (route.request().url().includes('mvu_zod.js')) return route.fulfill({contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'export function registerMvuSchema() {}'});
    return route.abort();
  });
  await page.evaluate(async () => {
    // Real ST html has a transform/perspective and no in-flow height; body is fixed.
    document.documentElement.style.cssText = 'transform:translateZ(0);perspective:1000px;';
    document.body.style.cssText = 'position:fixed;margin:0;width:100%;height:100dvh;overflow:hidden;';
    await fixtureStart('original');
  });
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  for (const viewport of [{width:633,height:696},{width:320,height:640},{width:1400,height:1000}]) {
    await page.setViewportSize(viewport);
    for (const id of ['landlord-version-controls','landlord-controls']) {
      await expectInsideViewport(page.locator(`#${id}`), viewport);
    }
    await page.locator('#landlord-version-controls summary').click();
    await page.locator('#landlord-version-controls summary').click();
    await expect(page.getByLabel('更新方式与版本')).toBeVisible();
    await expectInsideViewport(page.locator('#landlord-version-controls .landlord-version-body'), viewport);
    // Fullscreen layers must not swallow gameplay/input clicks outside the controls.
    await page.locator('#send_textarea').fill('输入仍然可用');
    await expect(page.locator('#send_textarea')).toHaveValue('输入仍然可用');
  }
  // Either owner can go away while the other retains the shared top-layer host.
  await page.evaluate(() => versionControls.dispose());
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  await page.locator('#landlord-controls summary').click();
  await page.getByRole('button', { name: '使用二改版', exact: true }).click();
  await expect(page.locator('#landlord-controls summary')).toContainText('二改版');
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  await page.evaluate(() => { versionControls = mountFixtureControls(); });
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  await page.evaluate(() => runtime.dispose());
  await expect(page.locator('#landlord-controls')).toHaveCount(0);
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(1);
  await page.locator('#landlord-version-controls summary').click();
  await expect(page.getByLabel('更新方式与版本')).toBeVisible();
  await page.evaluate(() => versionControls.dispose());
  await expect(page.locator('[id$="controls-viewport"]')).toHaveCount(0);
  await expect(page.locator('#landlord-controls-overlay')).toHaveCount(0);
});
