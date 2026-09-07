import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(version||''))throw Error('用法：npm run release:prepare -- 5.21.0');
try{execFileSync('git',['rev-parse','--verify',`refs/tags/v${version}`],{stdio:'ignore'});throw Error('这个版本标签已经存在，禁止覆盖已发布版本');}catch(e){if(e.status===undefined)throw e;}
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));pkg.version=version;
await fs.writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit'});
execFileSync('npm',['run','check'],{stdio:'inherit'});
console.log(`版本 ${version} 已构建并通过检查。提交产物后创建 v${version} 标签；GitHub 正式 Release 发布后玩家才会自动发现该版本。`);
