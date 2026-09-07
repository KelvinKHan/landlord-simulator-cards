import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__APP_VERSION__='5.21.0-rc.2';
const {REPO,sha256,isInstallableTag,listReleases,latestTag,downloadRelease,validateRelease}=await import('../src/updater/release.js');

const response=value=>new Response(JSON.stringify(value));
async function fixture(tag='v5.21.0-rc.2') {
  const files={};
  const release={tag,'runtime.js':'export const label="中文版本";',
    'content.json':JSON.stringify({version:tag.slice(1),worldbook:{entries:[{id:1,content:'测试世界书'}]}})};
  for (const file of ['runtime.js','content.json']) files[file]={bytes:new TextEncoder().encode(release[file]).length,sha256:await sha256(release[file])};
  release.manifest={format:1,tag,version:tag.slice(1),files};
  return release;
}
async function replaceContent(release,content) {
  release['content.json']=JSON.stringify(content);
  release.manifest.files['content.json']={bytes:new TextEncoder().encode(release['content.json']).length,sha256:await sha256(release['content.json'])};
}

test('installable tags reject path injection, whitespace and unsupported version forms',()=>{
  for (const tag of ['v5.21.0','v5.21.0-rc.2']) assert.equal(isInstallableTag(tag),true,tag);
  for (const tag of ['../v5.21.0','v5.21.0?x=1','v5.21.0\n',' v5.21.0','v5.21.0/evil','v5.21.0-beta.1','v5.21.0+build','main','5.21.0',null,{},1]) assert.equal(isInstallableTag(tag),false,String(tag));
});

test('release catalog excludes drafts and unsafe tags, includes manual RC choices and sorts versions across pages',async()=>{
  const first=[
    {tag_name:'v5.21.0-rc.2',name:'候选版',prerelease:false,published_at:'2026-09-07T00:00:00Z'},
    {tag_name:'v5.21.0',name:'正式版'},
    {tag_name:'v5.21.0-rc.10',prerelease:true},
    {tag_name:'v5.22.0',draft:true},
    {tag_name:'../../evil'},
    {tag_name:'v5.21.0\n'},
    {tag_name:'v5.99.0-beta.1'},null,
  ];
  while(first.length<100) first.push({tag_name:'v99.0.0',draft:true});
  const second=[{tag_name:'v5.21.0-rc.2',name:'duplicate'},{tag_name:'v6.0.0',prerelease:true},{tag_name:'v5.20.0',name:'   '}];
  const urls=[];
  const catalog=await listReleases(async url=>{urls.push(url);return response(urls.length===1?first:second)});
  assert.deepEqual(urls,[1,2].map(page=>`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`));
  assert.deepEqual(catalog.map(item=>item.tag),['v6.0.0','v5.21.0','v5.21.0-rc.10','v5.21.0-rc.2','v5.20.0']);
  assert.deepEqual(catalog[3],{tag:'v5.21.0-rc.2',version:'5.21.0-rc.2',name:'候选版',prerelease:true,publishedAt:'2026-09-07T00:00:00Z'});
  assert.equal(catalog[0].prerelease,true);
  assert.equal(catalog[1].prerelease,false);
  assert.equal(catalog[4].name,'v5.20.0');
  assert.equal(catalog[4].publishedAt,null);
});

test('catalog requests at most five pages and stops after a short page',async()=>{
  let requests=0;
  const catalog=await listReleases(async()=>{requests++;return response(Array.from({length:100},(_,i)=>({tag_name:`v1.${requests}.${i}`})))});
  assert.equal(requests,5);assert.equal(catalog.length,500);
  assert.equal(catalog[0].tag,'v1.5.99');assert.equal(catalog.at(-1).tag,'v1.1.0');
  requests=0;
  assert.deepEqual(await listReleases(async()=>{requests++;return response([])}),[]);
  assert.equal(requests,1);
});

test('catalog failures remain visible instead of looking like an empty release list',async()=>{
  await assert.rejects(listReleases(async()=>new Response('rate limited',{status:403})),/HTTP 403/);
  await assert.rejects(listReleases(async()=>response({message:'unexpected'})),/版本目录/);
  await assert.rejects(listReleases(async()=>new Response('not json')),SyntaxError);
});

test('automatic latest still rejects candidates, drafts and unsafe tags',async()=>{
  for (const entry of [{tag_name:'v5.22.0-rc.1'},{tag_name:'v5.22.0',prerelease:true},{tag_name:'v5.22.0',draft:true},{tag_name:'v5.22.0\n'}]) await assert.rejects(latestTag(async()=>response(entry)),/没有可用正式版本/);
  assert.equal(await latestTag(async()=>response({tag_name:'v5.22.0'})),'v5.22.0');
});

test('cache validation accepts complete releases and checks UTF-8 byte lengths',async()=>{
  const release=await fixture();
  assert.equal(await validateRelease(release),true);
  assert.ok(release.manifest.files['runtime.js'].bytes>release['runtime.js'].length);
  release.manifest.files['runtime.js'].bytes=release['runtime.js'].length;
  assert.equal(await validateRelease(release),false);
});

test('cache validation rejects mismatched manifests, damaged files and missing metadata',async()=>{
  const valid=await fixture();
  const changes=[
    r=>r.tag='../../evil',r=>r.manifest.format=2,r=>r.manifest.tag='v5.21.0',
    r=>r.manifest.version='5.21.0',r=>r['runtime.js']+='bad',r=>r['content.json']+='bad',
    r=>r.manifest.files['content.json'].bytes++,r=>r.manifest.files['runtime.js'].bytes='30',
    r=>r.manifest.files['runtime.js'].sha256='a'.repeat(64),r=>delete r.manifest.files,
    r=>delete r['runtime.js'],r=>r['runtime.js']={},r=>r.manifest=null,
  ];
  for (const change of changes) {const broken=structuredClone(valid);change(broken);assert.equal(await validateRelease(broken),false,String(change))}
  for (const broken of [undefined,null,{},[],'bad']) assert.equal(await validateRelease(broken),false);
});

test('matching checksums cannot hide a content version or worldbook shape mismatch',async()=>{
  for (const content of [null,{version:'5.21.0',worldbook:{entries:[]}},{version:'5.21.0-rc.2'},
    {version:'5.21.0-rc.2',worldbook:{entries:{}}}]) {
    const release=await fixture();await replaceContent(release,content);
    assert.equal(await validateRelease(release),false);
    const download=async url=>new Response(url.endsWith('release.json')?JSON.stringify(release.manifest):release[url.split('/').at(-1)]);
    await assert.rejects(downloadRelease(release.tag,download),/内容包版本/);
  }
});
