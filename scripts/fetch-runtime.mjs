import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './public-files.mjs';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('此脚本仅下载 Windows x64 免安装包的运行组件。');
const nodeVersion='24.22.1',ytVersion='2026.10.26',ytHash='f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d';
async function fetchBytes(url){const response=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error(`下载失败：HTTP ${response.status} ${url}`);return Buffer.from(await response.arrayBuffer());}
async function save(path,bytes,hash){if(hash&&createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('运行组件 SHA256 校验失败：'+path);const target=resolve(root,path);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target+'.tmp',bytes);await rename(target+'.tmp',target);}
const sums=(await fetchBytes(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`)).toString('utf8'),nodeHash=sums.split(/\r?\n/).find(x=>x.trim().endsWith('win-x64/node.exe'))?.split(/\s+/)[0];if(!/^[a-f0-9]{64}$/.test(nodeHash||''))throw Error('官方 Node.js 校验清单未找到 Windows x64 node.exe');
await save('runtime/node.exe',await fetchBytes(`https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`),nodeHash);
await save('runtime/NODE-LICENSE.txt',await fetchBytes(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`));
await save('runtime/links/yt-dlp.exe',await fetchBytes(`https://github.com/yt-dlp/yt-dlp/releases/download/${ytVersion}/yt-dlp.exe`),ytHash);
for(const name of ['LICENSE','THIRD_PARTY_LICENSES.txt'])await save('runtime/links/'+(name==='LICENSE'?'LICENSE.txt':name),await fetchBytes(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${ytVersion}/${name}`));
await save('runtime/links/NOTICE.txt',Buffer.from(`Official yt-dlp ${ytVersion}\nSource: https://github.com/yt-dlp/yt-dlp/tree/${ytVersion}\nBinary SHA256: ${ytHash}\nOfficial Node.js ${nodeVersion}\nSource: https://github.com/nodejs/node/tree/v${nodeVersion}\nBinary SHA256: ${nodeHash}\nOriginal license texts retained alongside the components.\n`));
console.log('官方运行组件下载完成，二进制校验与原许可已保存。');
