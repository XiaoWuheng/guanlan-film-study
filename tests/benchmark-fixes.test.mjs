import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captionSegments,prepareModelDraft} from '../dist/core.mjs';
import {updateSubtitle,displayProject,editCuts,collectLegacyNotes} from '../dist/study-tools.mjs';
import {projectBackup,readProjectBackup} from '../dist/project-backup.mjs';
import {cleanProfile,groupStudies} from '../dist/project-library.mjs';
import {seriesWorkbookModel,exportSeriesXlsx} from '../dist/spreadsheet-export.mjs';

const project=(episode=1,mediaKind='episode')=>({schemaVersion:1,id:`${mediaKind}-${episode}`,title:`样本 ${episode}`,status:'已有分析',updated:'2026-11-13',mediaKind,series:{id:'qa-series',title:'样本剧',episode},meta:{duration:4,sourceStart:0,sourceDuration:4,sourceName:'qa.mp4'},shots:[{id:'S001',start:0,end:2,duration:2,images:[]},{id:'S002',start:2,end:4,duration:2,images:[]}],screenplay:{segments:[{id:'P0001',start:.5,end:2.3,text:'Original',translation:'原译'}],alignments:[]},lessons:{}});

test('a rejected first model call permits another model while completed batches are protected',()=>{
 const draft=prepareModelDraft(null,'http://localhost:8786','first');
 assert.doesNotThrow(()=>prepareModelDraft(draft,'http://localhost:8786','second'));
 draft.captionBatches[0]=[];
 assert.throws(()=>prepareModelDraft(draft,'http://localhost:8786','second'),/生成的批次/);
});

test('captions retain the source, translation, speaker and sorted ranges across batches',()=>{
 const rows=captionSegments({0:[{start:2,end:3,text:'Next',translation:'下一句',speaker:'旁白'}],1:[{start:0,end:.5,text:'Hello'},{start:.5,end:1,text:'Hello',translation:'你好'}]},3);
 assert.deepEqual(rows.map(({start,end,text,translation,speaker})=>[start,end,text,translation,speaker]),[[0,1,'Hello','你好',''],[2,3,'Next','下一句','旁白']]);
});

test('segment edits remain separate from recognition and reverting restores the original',()=>{
 const p=project(),next=updateSubtitle(p,'P0001',{text:'Revised',translation:'核对稿',speaker:'旁白'});
 assert.equal(p.screenplay.segments[0].text,'Original');
 assert.equal(displayProject(next).screenplay.segments[0].text,'Revised');
 assert.equal(displayProject(next).screenplay.segments[0].originalText,'Original');
 assert.equal(displayProject(updateSubtitle(next,'P0001',null)).screenplay.segments[0].translation,'原译');
});

test('a merged cue points back to its original time and asks for review',()=>{
 const p=project();p.cues=[{episode:1,shotId:'S002',label:'停点'}];
 const changed=editCuts(p,{type:'merge',shotId:'S001'}).project;
 assert.deepEqual(changed.cues[0],{episode:1,shotId:'S001',label:'停点',time:2,needsReview:true});
});

test('one series backup round-trips episodes, a material, tags and interval notes',()=>{
 const first=project(),second=project(2),material=project(1,'material'),notes=[{id:'note',start:.2,end:1.6,text:'看视线'}];
 const values=new Map([[`guanlan-study:${first.id}:ranges`,JSON.stringify(notes)]]),storage={getItem:key=>values.get(key)};
 const profile=cleanProfile({themes:['A,B','C'],units:[{title:'前两集',from:1,to:2,time:.3,text:'承诺与兑现'}]});
 const backup=projectBackup([first,second,material],profile,p=>collectLegacyNotes(p,storage));
 const parsed=readProjectBackup(JSON.parse(JSON.stringify(backup)));
 assert.equal(groupStudies(parsed.projects).length,1);
 assert.equal(parsed.projects.length,3);assert.deepEqual(parsed.projects[0].rangeNotes,notes);
 assert.deepEqual(parsed.profile.themes,['A,B','C']);
 assert.throws(()=>readProjectBackup({...backup,projects:[{...first,screenplay:{segments:{}}},second]}),/字幕格式/);
 assert.throws(()=>readProjectBackup({...backup,projects:[first,{...first,id:'different'}]}),/重复/);
});

test('combined Excel has navigable episode sheets with namespaced internal references',async()=>{
 const model=seriesWorkbookModel('样本剧',[project(),project(2),project(1,'material')]);
 assert.equal(model.sheets[0].rows.length,3);
 assert.ok(model.sheets.some(sheet=>sheet.name==='M1 逐镜表'));
 assert.equal(model.sheets.find(sheet=>sheet.name==='E2 逐镜表').rows[0].at(-1).location,"'E2 拍法详解'!A6");
 assert.match(model.sheets.find(sheet=>sheet.name==='E2 使用与范围').rows[5][1].formula,/E2 逐镜表/);
 const bytes=new Uint8Array(await exportSeriesXlsx('样本剧',[project(),project(2)]).arrayBuffer());
 assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,3,4]);
});
