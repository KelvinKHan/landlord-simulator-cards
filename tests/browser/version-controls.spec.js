import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/host.html');
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
  const rect = await page.locator('#landlord-version-controls').boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(320);
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
});
