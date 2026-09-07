import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { z } from 'zod';
import { IDBFactory } from 'fake-indexeddb';
import { UpdateStore } from '../src/updater/store.js';
import { normalizeEntry, updateContent } from '../src/updater/content.js';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const pkg = await read('package.json');
const baseline = await read('src/content/baseline-5.20.json');
const worldbook = await read('src/content/worldbook.json');
const original = await read('originals/房东模拟器Z5.20 (1).json');
const card = await read(`exports/房东模拟器Z${pkg.version}.json`);
const retired = /大富翁|分基地|monopoly/i;

test('new schema initializes only the remaining apartment gameplay', async () => {
  let schema;
  const source = (await fs.readFile('src/legacy/S01.js', 'utf8')).replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(source, {
    z, registerMvuSchema: () => {}, $: ready => ready(), console: { log() {} },
    landlord: { registerSchema: (_, value) => { schema = value; } },
  });
  const state = schema.parse({});
  assert.deepEqual(Object.keys(state).sort(), ['世界', '公寓', '租客列表'].sort());
  assert.deepEqual(state.公寓, { 楼层列表: [], 房间列表: {} });
  assert.deepEqual(state.租客列表, {});
  assert.doesNotMatch(source, retired);
});

test('exports remove only retired worldbook sections and opening instructions', async () => {
  assert.deepEqual(baseline, original.data.character_book, 'keep the immutable upgrade baseline');
  const changed = worldbook.entries.filter((entry, i) => entry.content !== baseline.entries[i].content);
  assert.deepEqual(changed.map(e => e.id), [0, 1, 3]);
  const restored = structuredClone(worldbook);
  for (const entry of restored.entries) entry.content = baseline.entries.find(e => e.id === entry.id).content;
  assert.deepEqual(restored, baseline, 'IDs, activation and all trigger metadata must stay intact');
  assert.equal(worldbook.entries[0].content, baseline.entries[0].content.split('\n\n大富翁:')[0] + '\n');
  assert.equal(worldbook.entries[1].content, baseline.entries[1].content.split('\n\n  分基地:')[0]);
  assert.equal(worldbook.entries[3].content, baseline.entries[3].content
    .replace('# 注意：大富翁 由脚本自行管理，不在此列出\n', '')
    .replace(",\n  '分基地': {{get_message_variable::stat_data.分基地}}", ''));
  assert.equal(card.data.first_mes, original.data.first_mes.replace(/^###大富翁[^\r\n]*\r\n\r\n/m, ''));
  assert.equal(card.first_mes, card.data.first_mes);
  assert.doesNotMatch(JSON.stringify(card), retired);
  assert.doesNotMatch(await fs.readFile('dist/runtime.js', 'utf8'), retired);
  assert.doesNotMatch(await fs.readFile('dist/content.json', 'utf8'), retired);
});

test('both original and rc.1 worldbooks retire the old mode without losing preferences or custom entries', async () => {
  for (const previous of ['5.20', '5.21.0-rc.1']) {
    const store = new UpdateStore(new IDBFactory());
    const before = baseline.entries.map(normalizeEntry);
    const custom = { uid: 9001, name: '玩家自己的规则', enabled: true, content: '保留我的设定' };
    let entries = [...structuredClone(before), custom];
    entries.find(e => e.uid === 3).enabled = false;
    if (previous !== '5.20') await store.set('content:card:book', { version: previous, entries: before });
    const api = { getCharWorldbookNames: () => ({ primary: 'book' }), updateWorldbookWith: async (_, fn) => { entries = await fn(structuredClone(entries)); } };
    const tx = await updateContent({ api, store, content: { version: pkg.version, worldbook }, baseline: { worldbook: baseline }, identity: 'card', isCurrent: () => true });
    assert.deepEqual(tx.conflicts, []);
    assert.doesNotMatch(JSON.stringify(entries), retired);
    for (const expected of worldbook.entries.map(normalizeEntry)) {
      if (expected.uid === 3) expected.enabled = false;
      assert.deepEqual(entries.find(e => e.uid === expected.uid), expected);
    }
    assert.deepEqual(entries.at(-1), custom);
    await tx.commit();
    assert.equal((await store.get('content:card:book')).version, pkg.version);
  }
});

test('retirement does not overwrite a player-edited rule or erase chat memories', async () => {
  const store = new UpdateStore(new IDBFactory());
  const entries = baseline.entries.map(normalizeEntry);
  entries.find(e => e.uid === 1).content += '\n玩家自己的入住规则';
  const edited = entries.find(e => e.uid === 1).content;
  const books = { book: entries, chat: [{ uid: 1, name: '租客记忆', content: '保留聊天记录' }] };
  const api = { getCharWorldbookNames: () => ({ primary: 'book' }), updateWorldbookWith: async (name, fn) => { books[name] = await fn(structuredClone(books[name])); } };
  const tx = await updateContent({ api, store, content: { version: pkg.version, worldbook }, baseline: { worldbook: baseline }, identity: 'card', isCurrent: () => true });
  assert.ok(tx.conflicts.some(path => path.endsWith('.content')));
  assert.equal(books.book.find(e => e.uid === 1).content, edited);
  assert.doesNotMatch(books.book.find(e => e.uid === 0).content, retired);
  assert.doesNotMatch(books.book.find(e => e.uid === 3).content, retired);
  assert.deepEqual(books.chat, [{ uid: 1, name: '租客记忆', content: '保留聊天记录' }]);
  await tx.commit();
});
