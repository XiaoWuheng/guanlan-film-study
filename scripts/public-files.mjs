import {readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
export const root=resolve(import.meta.dirname,'..');
export const rootFiles=['README.md','LICENSE','package.json','.gitignore','CONTRIBUTING.md','SECURITY.md','ROADMAP.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','desktop.mjs','stop.mjs','project-store.mjs','assistant-mcp.mjs','link-import.mjs','启动观澜.vbs','关闭观澜.vbs','开始使用.md','助手直连说明.md'];
export async function publicFiles(){const files=[...rootFiles];async function walk(dir){for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('公开目录不应包含符号链接：'+entry.name);const path=dir+'/'+entry.name;if(entry.isDirectory())await walk(path);else if(entry.isFile())files.push(path);}}for(const dir of ['dist','docs','examples','scripts','tests','.github'])await walk(dir);return files.sort();}
