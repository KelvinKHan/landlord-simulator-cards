// Parses card JavaScript as data. No eval, imports of card scripts, DOM, or network calls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, '.local/analysis-tools/package.json'));
const parser = localRequire('@babel/parser');
const { z } = localRequire('zod');
const cardBytes = fs.readFileSync(path.join(root, 'originals/房东模拟器Z5.20 (1).json'));
const card = JSON.parse(cardBytes).data;
const scripts = card.extensions.tavern_helper.scripts;
const regexes = card.extensions.regex_scripts;
const report = { scope: 'Offline syntax and bounded contract probes; no card scripts executed',
  versions: { node: process.version, babel: localRequire('@babel/parser/package.json').version,
    zod: localRequire('zod/package.json').version }, syntax: [], probes: [] };
function walk(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (node.type) callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(v => walk(v, callback));
    else if (value && typeof value === 'object') walk(value, callback);
  }
}
function constant(node) {
  if (['StringLiteral', 'BooleanLiteral', 'NumericLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'BinaryExpression' && node.operator === '+') return constant(node.left) + constant(node.right);
  if (node.type === 'ArrayExpression') return node.elements.map(constant);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(p => [p.key.name || p.key.value, constant(p.value)]));
  throw new Error('Not a constant: ' + node.type);
}
function syntax(name, source) {
  try { const ast = parser.parse(source, { sourceType: 'unambiguous' }); report.syntax.push({ name, ok: true }); return ast; }
  catch (e) { report.syntax.push({ name, ok: false, error: e.message }); return null; }
}
const asts = scripts.map((s, i) => syntax(`S${String(i).padStart(2, '0')}`, s.content));
for (const [i, r] of regexes.entries()) {
  for (const [j, match] of [...r.replaceString.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
    syntax(`R${String(i).padStart(2, '0')}.script${j}`, match[1]);
  }
}
// Fold only literal pieces of the generated phone document, replace runtime expressions with inert text.
let phoneExpr;
walk(asts[6], n => { if (n.type === 'VariableDeclarator' && n.id.name === 'iframeHTML') phoneExpr = n.init; });
function phoneText(n) {
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'BinaryExpression' && n.operator === '+') return phoneText(n.left) + phoneText(n.right);
  return 'AUDIT_PLACEHOLDER';
}
for (const [i, m] of [...phoneText(phoneExpr).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  syntax('S06.generatedIframe.script' + i, m[1]);
}
function probe(name, value) { report.probes.push({ name, ...value }); }
// Same regex parsing algorithm as the pinned SillyTavern utils.js; expressions are data.
function regexFromString(input) {
  const m = input.match(/(\/?)(.+)\1([a-z]*)/i);
  if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) return RegExp(input);
  return new RegExp(m[2], m[3]);
}
const compiled = regexes.map(r => regexFromString(r.findRegex));
probe('all_regex_compile', { count: compiled.length, flags: compiled.map(r => r.flags) });
probe('R00_dual_direction_flags', {
  display: Boolean((regexes[0].markdownOnly && true) || (regexes[0].promptOnly && false)),
  prompt: Boolean((regexes[0].markdownOnly && false) || (regexes[0].promptOnly && true))
});
const hidden = '前<UpdateVariable>一</UpdateVariable>中间正文<UpdateVariable>二</UpdateVariable>后'.replace(compiled[2], '');
assert.equal(hidden, '前后');
probe('R02_multiple_updates', { input: 'two update blocks separated by prose', actual: hidden, losesInterveningProse: true });
const clauses = ['<StatusPlaceHolderImpl/>', '<StatusPlaceHolderImpl/>'];
const stripped = clauses.join('').replace(compiled[0], '');
assert.equal(stripped, clauses[0]);
probe('R00_non_global', { remainingPlaceholdersAfterTwo: 1 });
const candidateField = new RegExp('名字' + ': "([^"]+)"');
probe('R03_candidate_field_contract', { ascii: candidateField.test('名字: "测试甲"'), chineseColon: candidateField.test('名字："测试甲"'), noSpace: candidateField.test('名字:"测试甲"') });
const keys = card.character_book.entries[13].keys;
probe('W13_travel_keywords', { cityMapTriggers: keys.some(k => '我前往了公园'.includes(k)), worldMapSoloTriggers: keys.some(k => '我独自前往了公园'.includes(k)), worldMapPartyTriggers: keys.some(k => '我带着测试甲一起前往了公园'.includes(k)) });
let presets;
walk(asts[3], n => { if (n.type === 'VariableDeclarator' && n.id.name === 'BUILTIN_PRESETS') presets = constant(n.init); });
for (const p of presets) {
  const selected = scripts.map((s, i) => ({ index: i, enabled: (p.rules.find(r => s.name.includes(r.match)) || { enabled: p.defaultEnabled }).enabled }));
  probe('preset_' + p.id, { enabledIndices: selected.filter(s => s.enabled).map(s => s.index), changesFromExport: selected.filter(s => s.enabled !== scripts[s.index].enabled), regexRuleCount: p.regexRules.length });
}
let aptObject;
walk(asts[25], n => {
  if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === 'AptSystem' && n.right.type === 'ObjectExpression') aptObject = n.right;
});
const aptMethods = aptObject.properties.map(p => p.key.name || p.key.value);
assert(!aptMethods.includes('initCentralState'));
probe('S25_missing_initCentralState', { called: scripts[25].content.includes('.initCentralState()'), definedOnAssignedObject: false, allCardOccurrences: scripts.reduce((n, s) => n + (s.content.match(/initCentralState/g) || []).length, 0) });
probe('S23_unused_worldview_autoinjection', { identifierOccurrences: (scripts[23].content.match(/wsAutoInjectWorldView/g) || []).length });
// Minimal independently written schemas verify Zod semantics, never evaluate S01.
const minimal = z.object({ name: z.string(), nested: z.object({ kept: z.string() }) }).superRefine((d, c) => { if (d.name !== 'valid') c.addIssue({ code: 'custom', message: 'cross-field restriction' }); });
const relaxed = z.looseObject(minimal.shape);
const specimen = { name: 'invalid', extraTop: true, nested: { kept: 'ok', extraNested: true } };
assert.equal(minimal.safeParse(specimen).success, false);
assert.equal(relaxed.safeParse(specimen).success, true);
const parsed = relaxed.parse(specimen);
assert.equal(parsed.extraTop, true);
assert.equal('extraNested' in parsed.nested, false);
probe('zod_top_object_reconstruction', { originalRefinementRejects: true, reconstructedObjectAccepts: true, unknownTopLevelPreserved: true, unknownNestedStripped: true });
const transactionSchema = z.object({ tenants: z.array(z.string()), rooms: z.record(z.string(), z.string()) }).superRefine((d, c) => {
  if (d.tenants.some(n => !Object.values(d.rooms).includes(n)) || Object.values(d.rooms).some(n => !d.tenants.includes(n))) {
    c.addIssue({ code: 'custom', message: 'both lists must agree' });
  }
});
const transactionCases = {
  tenantOnly: transactionSchema.safeParse({ tenants: ['test'], rooms: {} }).success,
  roomOnly: transactionSchema.safeParse({ tenants: [], rooms: { A: 'test' } }).success,
  bothTogether: transactionSchema.safeParse({ tenants: ['test'], rooms: { A: 'test' } }).success
};
assert.deepEqual(transactionCases, { tenantOnly: false, roomOnly: false, bothTogether: true });
probe('restored_cross_field_check_needs_transaction', transactionCases);
probe('weather_fantasy_year', { numeric: Number.isFinite(parseInt('神启元年')) });
const xml = /(?:<|&lt;)(content)(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/\1(?:>|&gt;)/gi;
probe('S26_default_context_tag', { untaggedNarrativeMatches: xml.test('测试甲走进客厅。'), taggedNarrativeMatches: xml.test('<content>测试甲走进客厅。</content>') });
const greetings = card.alternate_greetings.map((g, index) => {
  const patches = JSON.parse(g.match(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/)[1]);
  return { index, count: patches.length, operations: [...new Set(patches.map(p => p.op))], paths: patches.map(p => p.path) };
});
probe('greeting_patch_inventory', { greetings });
const initialFloorBlock = card.character_book.entries[0].content.match(/  楼层列表:\n([\s\S]*?)  房间列表:/)[1];
const floors = [...initialFloorBlock.matchAll(/^    - (.+)$/gm)].map(m => m[1]);
const secondGreetingPatches = JSON.parse(card.alternate_greetings[1].match(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/)[1]);
const appendedFloors = secondGreetingPatches.filter(p => p.path === '/公寓/楼层列表/-').map(p => p.value);
probe('greeting_duplicate_floor', { initialFloors: floors, appendedFloors, duplicates: appendedFloors.filter(n => floors.includes(n)) });
probe('component_identity', { counts: { worldbook: card.character_book.entries.length, regex: regexes.length, scripts: scripts.length }, uniqueIds: [card.character_book.entries, regexes, scripts].every(items => new Set(items.map(x => x.id)).size === items.length) });
probe('ejs_delimiters_in_export', { count: JSON.stringify(card).split('<%').length - 1 });
const out = path.join(root, '.local/analysis/contract-checks.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.syntax.some(s => !s.ok)) process.exitCode = 1;
