import {cleanProfile,mediaKind,mediaNumber,profileKey} from './project-library.mjs';

const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
const imagePattern=/^data:image\/(jpeg|png);base64,[a-zA-Z0-9+/=]+$/;
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function validateProject(project) {
  const p=project,meta=p?.meta;
  if(p?.schemaVersion!==1||!idPattern.test(p.id||'')||typeof p.id!=='string'||typeof p.title!=='string'||!p.title.trim()||!meta
    ||!Number.isFinite(meta.duration)||meta.duration<=0||!Number.isFinite(meta.sourceDuration)||!Number.isFinite(meta.sourceStart)
    ||meta.sourceStart<0||meta.sourceStart+meta.duration>meta.sourceDuration+.05||!Array.isArray(p.shots)||!p.shots.length||p.shots.length>500)throw Error('项目备份格式无效');
  let end=0;
  const ids=new Set();
  for(const shot of p.shots){
    if(!shot||typeof shot.id!=='string'||!shot.id||ids.has(shot.id)||!Number.isFinite(shot.start)||!Number.isFinite(shot.end)||Math.abs(shot.start-end)>.001
      ||shot.end<=shot.start||!Number.isFinite(shot.duration)||Math.abs(shot.duration-(shot.end-shot.start))>.001||!Array.isArray(shot.images)||shot.images.some(src=>typeof src!=='string'||!imagePattern.test(src)))throw Error('项目镜头数据无效');
    ids.add(shot.id);end=shot.end;
  }
  if(Math.abs(end-meta.duration)>.02)throw Error('项目镜头没有覆盖研究段');
  if(p.series&&(!isObject(p.series)||typeof p.series.id!=='string'||!idPattern.test(p.series.id)||typeof p.series.title!=='string'||!Number.isInteger(p.series.episode)||p.series.episode<1
    ||(p.series.characters!=null&&(!Array.isArray(p.series.characters)||p.series.characters.some(item=>!Array.isArray(item))))))throw Error('剧目或集号无效');
  if(p.mediaKind!=null&&!['episode','material'].includes(p.mediaKind))throw Error('片源类型无效');
  if(p.screenplay){
    const {segments,alignments}=p.screenplay;
    if(!Array.isArray(segments)||(alignments!=null&&!Array.isArray(alignments)))throw Error('剧本或字幕格式无效');
    const segmentIds=new Set();
    for(const item of segments){
      if(!item||typeof item.id!=='string'||!item.id||segmentIds.has(item.id)||typeof item.text!=='string'
        ||((item.start!=null||item.end!=null)&&(!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<=item.start||item.end>meta.duration+.15)))throw Error('字幕文字或时间无效');
      segmentIds.add(item.id);
    }
    if(alignments?.some(item=>!item||!Array.isArray(item.segmentIds)||!Array.isArray(item.shotIds)))throw Error('剧本对照格式无效');
  }
  if(p.subtitleEdits!=null&&(!isObject(p.subtitleEdits)||Object.values(p.subtitleEdits).some(edit=>!isObject(edit)||typeof edit.text!=='string'||!edit.text.trim()||Object.values(edit).some(value=>typeof value!=='string'))))throw Error('字幕修订格式无效');
  if(p.cues!=null&&(!Array.isArray(p.cues)||p.cues.some(cue=>!isObject(cue))))throw Error('卡点格式无效');
  if(p.rangeNotes!=null&&(!Array.isArray(p.rangeNotes)||p.rangeNotes.some(item=>!item||typeof item.id!=='string'||typeof item.text!=='string'||!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<=item.start||item.end>meta.duration+.01||['image','baseImage'].some(key=>item[key]!=null&&(typeof item[key]!=='string'||!imagePattern.test(item[key])||item[key].length>600000)))))throw Error('片段笔记格式无效');
  p.lessons??={};
  if(!isObject(p.lessons)||['beats','groups','takeaways','exercises'].some(key=>p.lessons[key]!=null&&(!Array.isArray(p.lessons[key])||p.lessons[key].some(item=>!isObject(item)||(item.shotIds!=null&&!Array.isArray(item.shotIds))))))throw Error('分析内容格式无效');
  if(typeof p.updated!=='string')p.updated=new Date().toISOString();
  delete p._expectedUpdated;
  return p;
}

export function projectBackup(projects,profile,collect) {
  const copies=projects.map(project=>{
    const copy=collect(project);
    delete copy._expectedUpdated;
    return copy;
  });
  if(copies.length===1&&!copies[0].series)return {type:'guanlan-project',version:1,project:copies[0],profile};
  return {type:'guanlan-series',version:1,title:copies[0].series.title,projects:copies,profile};
}

export function readProjectBackup(data) {
  if(data?.version!==1||!['guanlan-project','guanlan-series'].includes(data.type))throw Error('请选择观澜的项目备份');
  const list=data.type==='guanlan-series'?data.projects:[data.project];
  if(!Array.isArray(list)||!list.length||list.length>500)throw Error('备份中没有有效项目');
  const projects=list.map(item=>validateProject(structuredClone(item)));
  const ids=new Set(),numbers=new Set(),key=profileKey(projects[0]);
  for(const project of projects){
    const number=mediaKind(project)+':'+mediaNumber(project);
    if(profileKey(project)!==key||ids.has(project.id)||numbers.has(number)||(data.type==='guanlan-series'&&!project.series))throw Error('备份中存在重复或不属于同剧的条目');
    ids.add(project.id);numbers.add(number);
  }
  return {key,projects,profile:data.profile?cleanProfile(data.profile):null};
}
