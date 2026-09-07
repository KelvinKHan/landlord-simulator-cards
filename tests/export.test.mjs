import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pkg=JSON.parse(await fs.readFile('package.json'));
const original=JSON.parse(await fs.readFile('originals/房东模拟器Z5.20 (1).json'));
const exported=JSON.parse(await fs.readFile(`exports/房东模拟器Z${pkg.version}.json`));
const readChunks=buffer=>{
  const chunks=[];for(let p=8;p<buffer.length;){const len=buffer.readUInt32BE(p);chunks.push({type:buffer.toString('ascii',p+4,p+8),value:buffer.subarray(p+8,p+8+len),raw:buffer.subarray(p,p+12+len)});p+=12+len}return chunks;
};
test('single-entry export preserves all unrelated card fields and both playable greetings',async()=>{
  const copy=structuredClone(exported);
  const scripts=copy.data.extensions.tavern_helper.scripts;
  assert.equal(scripts.length,1);assert.equal(scripts[0].enabled,true);assert.equal(scripts[0].id,original.data.extensions.tavern_helper.scripts[0].id);
  assert.match(scripts[0].content,new RegExp(`@v${pkg.version.replaceAll('.','\\.')}/dist/bootstrap.js`));
  delete copy.data.extensions.landlord_release;
  copy.data.character_version=original.data.character_version;
  copy.data.extensions.tavern_helper.scripts=original.data.extensions.tavern_helper.scripts;
  assert.deepEqual(copy.data.character_book,JSON.parse(await fs.readFile('src/content/worldbook.json')));
  assert.equal(copy.first_mes,copy.data.first_mes);
  assert.equal(copy.data.first_mes,await fs.readFile('src/content/first-message.txt','utf8'));
  copy.data.character_book=original.data.character_book;
  copy.first_mes=original.first_mes;
  copy.data.first_mes=original.data.first_mes;
  assert.deepEqual(copy,original);
});
test('PNG and JSON contain the same new card while image and unrelated chunks stay byte-identical',async()=>{
  const before=readChunks(await fs.readFile('originals/房东模拟器Z5.20.png'));
  const after=readChunks(await fs.readFile(`exports/房东模拟器Z${pkg.version}.png`));
  const isMetadata=c=>c.type==='tEXt'&&/^(chara|ccv3)\0/.test(c.value.toString());
  assert.deepEqual(after.filter(c=>!isMetadata(c)).map(c=>c.raw),before.filter(c=>!isMetadata(c)).map(c=>c.raw));
  const metadata=after.filter(isMetadata);assert.equal(metadata.length,2);
  for(const c of metadata)assert.deepEqual(JSON.parse(Buffer.from(c.value.subarray(c.value.indexOf(0)+1).toString(),'base64')),exported);
});
