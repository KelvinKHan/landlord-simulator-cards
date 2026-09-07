import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await fs.readFile('dist/release.json'));
const tag=process.argv[2] || manifest.tag;
assert.match(tag,/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/);assert.equal(tag,manifest.tag);
const base=`https://cdn.jsdelivr.net/gh/KelvinKHan/landlord-simulator-cards@${tag}/`;
const report={date:new Date().toISOString(),tag,files:[]};
for(const file of ['dist/release.json','dist/bootstrap.js','dist/runtime.js','dist/content.json',`exports/房东模拟器Z${manifest.version}.json`,`exports/房东模拟器Z${manifest.version}.png`]){
  const url=base+file.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
  assert.equal(response.status,200,`${file} must be available`);
  assert.equal(response.headers.get('access-control-allow-origin'),'*',`${file} must allow browser imports`);
  const remote=Buffer.from(await response.arrayBuffer()),local=await fs.readFile(file);
  assert.ok(remote.equals(local),`${file} must match the checked build`);
  report.files.push({file,status:response.status,bytes:remote.length,sha256:crypto.createHash('sha256').update(remote).digest('hex')});
}
report.result='passed';
await fs.mkdir('docs/testing',{recursive:true});await fs.writeFile('docs/testing/cdn.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
