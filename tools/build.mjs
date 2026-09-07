import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';
import traverseImport from '@babel/traverse';
import { build } from 'esbuild';
import { inlineIconUrls } from './inline-icons.mjs';
const traverse = traverseImport.default || traverseImport;
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const components = JSON.parse(await fs.readFile('src/content/components.json', 'utf8'));
const generated = '.local/build';
await fs.mkdir(generated, { recursive: true });
await fs.mkdir('dist', { recursive: true });
const globals = new Set(['window','self','globalThis','parent','top','document','console','fetch','XMLHttpRequest','MutationObserver','ResizeObserver','setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame','$','jQuery','landlord','SillyTavern','Mvu','eventSource','getContext']);
const excluded = new Set(['undefined','NaN','Infinity','Math','JSON','Object','Array','String','Number','Boolean','Date','RegExp','Promise','Map','Set','WeakMap','WeakSet','Error','TypeError','RangeError','Symbol','BigInt','Intl','Reflect','Proxy','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','escape','unescape']);
const imports = [];
for (const item of components) {
  const source = inlineIconUrls(await fs.readFile(item.file, 'utf8'));
  const ast = parse(source, { sourceType: 'module' });
  const free = new Set();
  const importNodes = [];
  const edits = new Map();
  traverse(ast, {
    ImportDeclaration(p) { importNodes.push(p.node); },
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (!p.scope.hasBinding(name) && (globals.has(name) || !excluded.has(name))) {
        free.add(name);
        const call = `__landlordScope.value(${JSON.stringify(name)})`;
        const access = p.parent.type === 'NewExpression' && p.key === 'callee' ? `(${call})` : call;
        const value = p.parent.type === 'ObjectProperty' && p.parent.shorthand ? `${name}: ${access}` : access;
        edits.set(p.node.start, { start:p.node.start, end:p.node.end, value });
      }
    },
  });
  let body = source;
  for (const node of importNodes) edits.set(node.start,{start:node.start,end:node.end,value:''});
  for (const edit of [...edits.values()].sort((a,b)=>b.start-a.start)) body = body.slice(0,edit.start) + edit.value + body.slice(edit.end);
  const header = importNodes.map(n => source.slice(n.start,n.end)).join('\n');
  const names = [...free].sort();
  const wrapper = `${header}\nexport async function mount(__landlordScope) {\n${body}\nawait __landlordScope.flushReady();\n}\n`;
  await fs.writeFile(`${generated}/${item.key}.js`, wrapper);
  imports.push(`import {mount as ${item.key}} from './${item.key}.js';`);
}
await fs.writeFile(`${generated}/modules.js`, `${imports.join('\n')}\nexport const modules = {${components.map(c => c.key).join(',')}};\n`);
const options = { bundle: true, format: 'esm', target: 'es2022', sourcemap: true, external: ['https://*'], define: { __APP_VERSION__: JSON.stringify(pkg.version) }, logLevel: 'warning' };
await build({ ...options, entryPoints: ['src/runtime/entry.js'], outfile: 'dist/runtime.js' });
await build({ ...options, entryPoints: ['src/updater/bootstrap.js'], outfile: 'dist/bootstrap.js' });
const content = { version: pkg.version, worldbook: JSON.parse(await fs.readFile('src/content/worldbook.json','utf8')), regex: JSON.parse(await fs.readFile('src/content/regex.json','utf8')) };
await fs.writeFile('dist/content.json', JSON.stringify(content,null,2)+'\n');
const files = {};
for (const name of ['runtime.js','content.json']) {
  const data = await fs.readFile(`dist/${name}`);
  files[name] = { sha256: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length };
}
await fs.writeFile('dist/release.json', JSON.stringify({ format: 1, version: pkg.version, tag: `v${pkg.version}`, files },null,2)+'\n');
console.log(`Built ${pkg.version}: ${components.length} internal modules; one player entry script.`);
execFileSync('python3',['tools/export_card.py'],{stdio:'inherit'});
