import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parse } from '@babel/parser';
import icons from '../src/runtime/icons.json' with { type: 'json' };
import { hasBuiltinIcon, iconUrl } from '../src/runtime/icons.js';
import { inlineIconUrls } from '../tools/inline-icons.mjs';

const decode = url => decodeURIComponent(url.slice('data:image/svg+xml,'.length));

test('bundled icons are self-contained SVG images and retain requested colors', () => {
  for (const name of Object.keys(icons)) {
    const svg = decode(iconUrl(name, '%23ffffff'));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/);
    assert.doesNotMatch(svg, /currentColor|<script|\bon\w+=|(?:href|src)=/i, name);
    assert.match(svg, /#ffffff/, name);
  }
  assert.match(decode(iconUrl('lucide:smartphone', 'white')), /stroke="white"/);
  assert.match(decode(iconUrl('mdi:home-city', '#123456')), /fill="#123456"/);
});

test('unknown icons and malformed colors stay local without injecting SVG attributes', () => {
  assert.equal(iconUrl('unavailable:future-icon'), iconUrl('lucide:circle-help'));
  assert.equal(iconUrl('mdi:home-city', '%not-encoded'), iconUrl('mdi:home-city'));
  const malformed = decode(iconUrl('mdi:home-city', 'red" onload="alert(1)'));
  assert.doesNotMatch(malformed, /onload|alert/);
  assert.match(malformed, /fill="black"/);
});

test('all current legacy modules build without external Iconify requests or broken JS strings', async () => {
  const components = JSON.parse(await fs.readFile(new URL('../src/content/components.json', import.meta.url), 'utf8'));
  for (const component of components) {
    const source = await fs.readFile(new URL(`../${component.file}`, import.meta.url), 'utf8');
    const result = inlineIconUrls(source);
    assert.doesNotMatch(result, /https:\/\/api\.iconify\.design\//, component.file);
    assert.doesNotThrow(() => parse(result, { sourceType: 'module' }), component.file);
    for (const match of source.matchAll(/(?:ri|mdi):[a-z0-9-]+/g)) assert.ok(hasBuiltinIcon(match[0]), match[0]);
  }
  assert.throws(() => inlineIconUrls('<img src="https://api.iconify.design/mdi:not-bundled.svg">'), /请先打包新增图标/);
});

test('workshop icons, including aliases and category fallbacks, are all bundled', async () => {
  const source = await fs.readFile(new URL('../src/legacy/S23.js', import.meta.url), 'utf8');
  const map = Object.fromEntries([...source.match(/const WS_ICON_MAP = \{([\s\S]*?)\};/)[1].matchAll(/(\w+): '([a-z0-9-]+)'/g)].map(m => [m[1],m[2]]));
  for (const name of [...Object.values(map), 'user', 'home', 'globe', 'smile', 'star']) assert.ok(hasBuiltinIcon(`lucide:${name}`), name);
  for (const match of source.matchAll(/wsIcon\('([A-Za-z0-9-]+)'/g)) assert.ok(hasBuiltinIcon(`lucide:${map[match[1]] || match[1]}`), match[1]);
});
