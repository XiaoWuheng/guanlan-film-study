import {mkdir,readFile,writeFile,rename,readdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {mergeResult} from './dist/core.mjs';
import {emptyLearning,validateLearning,layoutKey} from './dist/study-tools.mjs';
import {readProjectBackup} from './dist/project-backup.mjs';
export const ROOT=dirname(fileURLToPath(import.meta.url)),DATA=resolve(ROOT,'data');
function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw Error('项目ID无效');return value;}
async function atomic(path,value){await mkdir(DATA,{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value),'utf8');await rename(tmp,path);}
export function revision(p){return createHash('sha256').update(JSON.stringify([p.id,p.meta.sourceStart,p.meta.duration,p.shots.map(s=>[s.id,s.start,s.end,s.human]),p.scriptText,p.focus,p.methodIds,p.subtitleEdits])).digest('hex').slice(0,24);}
let saveChain=Promise.resolve();
export function saveProject(input){const p=structuredClone(input);const run=async()=>{id(p.id);if(!p.meta||!Array.isArray(p.shots)||!p.shots.length||p.shots.length>500||!p.updated)throw Error('项目格式错误');if(p._expectedUpdated){const prior=await loadProject(p.id);if(prior.updated!==p._expectedUpdated)throw Error('项目已有其他更新，请重新打开后修改，避免覆盖');delete p._expectedUpdated;}await atomic(resolve(DATA,id(p.id)+'.json'),p);return p;};const result=saveChain.catch(()=>{}).then(run);saveChain=result;return result;}
export function restoreProjects(items){
  const {projects}=readProjectBackup(items?.length===1&&!items[0]?.series?{type:'guanlan-project',version:1,project:items[0]}:{type:'guanlan-series',version:1,projects:items});
  const result=saveChain.catch(()=>{}).then(async()=>{
    const staged=[],completed=[];
    await mkdir(DATA,{recursive:true});
    try{
      for(const project of projects){
        const dest=resolve(DATA,id(project.id)+'.json'),token=randomUUID(),file=dest+'.'+token+'.incoming',old=dest+'.'+token+'.previous';
        const entry={dest,file,old,hadPrior:false};staged.push(entry);
        try{const content=await readFile(dest);await writeFile(old,content);entry.hadPrior=true;}catch(error){if(error.code!=='ENOENT')throw error;}
        await writeFile(file,JSON.stringify(project),'utf8');
      }
      for(const entry of staged){await rename(entry.file,entry.dest);completed.push(entry);}
    }catch(error){
      const failures=[];
      for(const entry of completed.reverse()){
        try{if(entry.hadPrior)await rename(entry.old,entry.dest);else await unlink(entry.dest);}
        catch{entry.keepPrior=true;failures.push(entry.dest);}
      }
      if(failures.length)throw Error('恢复中断，部分原项目已留在数据目录的 .previous 文件中。');
      throw error;
    }finally{
      await Promise.allSettled(staged.flatMap(entry=>entry.keepPrior?[unlink(entry.file)]:[unlink(entry.file),unlink(entry.old)]));
    }
  });
  saveChain=result;return result;
}
export async function readLearning(){try{const library=validateLearning(JSON.parse(await readFile(resolve(DATA,'learning-library.json'),'utf8')));for(const m of library.methods){try{const source=await loadProject(m.projectId);if(layoutKey(source)!==m.sourceLayout){m.reviewed=false;m.reviewedAt=null;m.sourceChanged=true;}}catch(e){if(e.code!=='ENOENT')throw e;}}return library;}catch(e){if(e.code==='ENOENT')return emptyLearning();throw e;}}
export async function saveLearning(value){const valid=validateLearning(value);await atomic(resolve(DATA,'learning-library.json'),valid);return valid;}
export async function loadProject(projectId){return JSON.parse(await readFile(resolve(DATA,id(projectId)+'.json'),'utf8'));}
export async function listProjects(){await mkdir(DATA,{recursive:true});const files=(await readdir(DATA)).filter(f=>/^[\w-]+\.json$/.test(f)&&f!=='connection.json');const projects=[];for(const file of files){try{const p=JSON.parse(await readFile(resolve(DATA,file),'utf8'));if(p.id&&p.meta&&p.shots)projects.push(p);}catch{}}return projects.sort((a,b)=>b.updated.localeCompare(a.updated));}
export async function deleteProject(projectId){const p=await loadProject(projectId);await mkdir(resolve(DATA,'trash'),{recursive:true});await rename(resolve(DATA,id(projectId)+'.json'),resolve(DATA,'trash',id(projectId)+'_'+Date.now()+'.json'));return p.id;}
export async function connection(){try{return JSON.parse(await readFile(resolve(DATA,'connection.json'),'utf8'));}catch{return {lastSeen:null,client:null};}}
export async function touchConnection(client){await atomic(resolve(DATA,'connection.json'),{lastSeen:new Date().toISOString(),client:typeof client==='string'?client.slice(0,100):'MCP助手'});}
const selectionFile=resolve(DATA,'.analysis-selection.json');
export async function saveSelection(input){
  const project=await loadProject(input.projectId),{start,end}=input;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.meta.duration+.01)throw Error('分析区间无效');
  const selection={projectId:project.id,title:project.title,start,end:Math.min(end,project.meta.duration),updated:new Date().toISOString()};
  await atomic(selectionFile,selection);return selection;
}
export async function readSelection(){
  try{
    const selection=JSON.parse(await readFile(selectionFile,'utf8')),project=await loadProject(selection.projectId);
    const shotIds=project.shots.filter(shot=>shot.end>selection.start&&shot.start<selection.end).map(shot=>shot.id);
    return shotIds.length?{...selection,shotIds,revision:revision(project)}:null;
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function submitAnalysis(projectId,result,expectedRevision){const p=await loadProject(projectId);if(revision(p)!==expectedRevision)throw Error('素材或人工记录已更改，请重新读取项目后分析');const next=mergeResult(p,result);next._expectedUpdated=p.updated;next.analysisSource='助手直连';await mkdir(resolve(DATA,'history'),{recursive:true});await writeFile(resolve(DATA,'history',id(p.id)+'_'+Date.now()+'.json'),JSON.stringify(p),'utf8');await saveProject(next);return {projectId:p.id,status:next.status,updated:next.updated,shots:next.shots.length};}
