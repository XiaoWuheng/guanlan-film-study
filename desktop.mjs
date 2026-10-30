import {importVideoLink,mediaFile} from './link-import.mjs';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname,extname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {endpoint} from './dist/core.mjs';
import {listProjects,saveProject,loadProject,deleteProject,connection,ROOT,readLearning,saveLearning} from './project-store.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'dist');
const port=Number(process.env.GUANLAN_PORT||8780),origin=`http://127.0.0.1:${port}`;
function open(){if(!process.argv.includes('--no-open'))spawn('rundll32.exe',['url.dll,FileProtocolHandler',origin],{windowsHide:true,detached:true,stdio:'ignore'}).unref();}
async function body(req,max=24e6){const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max)throw Error('请求内容过大，请减少单批画面');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data));}
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'仅本机工作台可访问'});
 const url=new URL(req.url,origin);
 if(url.pathname==='/desktop-health'&&req.method==='GET')return json(res,200,{app:'guanlan-desktop',version:'0.3.0'});
 if(url.pathname==='/api/connection'&&req.method==='GET'){const command=resolve(ROOT,'runtime','node.exe'),script=resolve(ROOT,'assistant-mcp.mjs');return json(res,200,{...await connection(),config:{mcpServers:{guanlan:{command,args:[script]}}},codex:`[mcp_servers.guanlan]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(script)}]\n`});}
 if(url.pathname==='/api/learning'&&req.method==='GET')return json(res,200,await readLearning());
 if(url.pathname.startsWith('/media/')&&(req.method==='GET'||req.method==='HEAD')){const m=await mediaFile(url.pathname),range=req.headers.range;let start=0,end=m.size-1;if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2]){res.writeHead(416,{'Content-Range':`bytes */${m.size}`}).end();return;}if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}else start=Math.max(0,m.size-Number(match[2]));if(start>end||start>=m.size){res.writeHead(416,{'Content-Range':`bytes */${m.size}`}).end();return;}}res.writeHead(range?206:200,{'Content-Type':m.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${m.size}`}:{})});if(req.method==='HEAD')return res.end();const stream=createReadStream(m.file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return;}
 if(url.pathname==='/api/projects'&&req.method==='GET'){const p=await listProjects();return json(res,200,p.map(({id,title,updated,status})=>({id,title,updated,status})));}
 if(url.pathname==='/api/project'&&req.method==='GET')return json(res,200,await loadProject(url.searchParams.get('id')));
 if(req.method==='POST'){
  if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'请从本机工作台发起请求'});
  if(url.pathname==='/shutdown'){json(res,200,{ok:true});server.close(()=>process.exit(0));return;}
  if(url.pathname==='/api/learning'){await saveLearning(await body(req,28e6));return json(res,200,{ok:true});}
  if(url.pathname==='/api/import-link'){const input=await body(req),controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});try{const value=await importVideoLink(input.url,{signal:controller.signal});return json(res,200,value);}catch(e){return json(res,400,{error:e.name==='AbortError'?'已停止链接导入':e.message});}}
  if(url.pathname==='/api/project'){const p=await body(req,180e6);await saveProject(p);return json(res,200,{ok:true});}
  if(url.pathname==='/api/delete-project'){const input=await body(req);await deleteProject(input.id);return json(res,200,{ok:true});}
  if(url.pathname!=='/api/model')return json(res,404,{error:'不存在'});
  const input=await body(req),urlString=endpoint(input.endpoint);
  if(typeof input.key!=='string'||!input.key||input.key.length>4096||!input.body||typeof input.body.model!=='string'||!Array.isArray(input.body.messages))return json(res,400,{error:'模型配置不完整'});
  const controller=new AbortController();res.on('close',()=>controller.abort());
  const upstream=await fetch(urlString,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+input.key},body:JSON.stringify(input.body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(240000)])});
  if(!upstream.ok){await upstream.body?.cancel();return json(res,upstream.status,{error:'模型请求未成功，请检查服务商配置或额度'});}
  const reply=await upstream.text();if(reply.length>16e6)return json(res,502,{error:'模型返回过大'});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(reply);return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'方法无效'});
 const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)),rel=relative(root,path);
 if(rel.startsWith('..')||isAbsolute(rel))return json(res,403,{error:'不可访问'});
 const allowed={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.zip':'application/zip','.part':'application/octet-stream','.json':'application/json; charset=utf-8'};
 const mime=allowed[extname(path)];if(!mime)return json(res,404,{error:'不存在'});
 let info;try{info=await stat(path);}catch{return json(res,404,{error:'不存在'});}if(!info.isFile())return json(res,404,{error:'不存在'});
 res.writeHead(200,{'Content-Type':mime,'Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});if(req.method==='HEAD')return res.end();const stream=createReadStream(path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(e){if(!res.headersSent)json(res,502,{error:e.message?.slice(0,500)||'连接或处理未成功，请重试'});else res.destroy();}});
server.on('error',async e=>{if(e.code==='EADDRINUSE'){try{const r=await fetch(origin+'/desktop-health');if((await r.json()).app==='guanlan-desktop'){open();return;}}catch{}}console.error('工作台启动失败：'+e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>{console.log('观澜工作台 '+origin);open();});
