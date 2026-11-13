export const STUDY_FIELDS={frame:'画面',evidence:'可见证据',sceneContext:'场景',cast:'人物外观与站位',props:'道具',size:'景别',angle:'机位',camera:'运镜',subjectMotion:'主体动作',performance:'表演与调度',lighting:'光影与构图',onscreenText:'画内文字',rhythm:'节奏作用',viewerChange:'观看变化',why:'为什么这样拍',alternative:'替代拍法',transfer:'借用方法',limits:'适用边界',audio:'人工声音记录'};
export const REVIEW_LABELS={boundary:'切点',subtitle:'字幕',motion:'完整动态',sound:'原声',interpretation:'拍法解释'};
export const METHOD_TOPICS={
 intent:'导演思维与意图',composition:'画面构图',camera:'景别与机位',motion:'运镜',
 lighting:'色彩与光影',performance:'表演与调度',hook:'开场与卡点',editing:'情绪与剪辑',
 sound:'声音设计',production:'制片与制作'
};
const copy=x=>structuredClone(x),now=()=>new Date().toISOString();
export const layoutKey=p=>JSON.stringify([p.id,p.meta.sourceStart,p.meta.duration,p.shots.map(s=>[s.id,s.start,s.end])]);
function digest(s){let hash=2166136261;for(const c of String(s)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
export function reviewStamp(p,s,kind){const human=s.human||{},base=[p.id,p.meta.sourceName,p.meta.sourceSize,p.meta.sourceStart,s.id,s.start,s.end];const fields={boundary:[s.frames,s.images?.map(x=>digest(x))],subtitle:[s.onscreenText,human.overrides?.onscreenText,p.screenplay?.segments,p.screenplay?.alignments?.filter(x=>x.shotIds?.includes(s.id))],motion:[s.camera,s.subjectMotion,s.performance,human.overrides?.camera,human.overrides?.performance],sound:[human.overrides?.audio,human.noAudio],interpretation:[s.why,s.rhythm,s.transfer,s.limits,human.overrides?.why,human.overrides?.rhythm,human.overrides?.transfer,human.overrides?.limits]};if(!(kind in fields))throw Error('未知复核类别');return digest(JSON.stringify([...base,fields[kind]]));}
export function reviewed(p,s,kind){const saved=s.human?.reviews?.[kind];if(saved)return saved.stamp===reviewStamp(p,s,kind);return kind==='boundary'&&!!s.boundaryVerified;}
export function cleanHuman(input={}){const human={observation:String(input.observation||'').slice(0,16000),overrides:{},reviews:{},noAudio:!!input.noAudio,notesMigrated:true,updated:now()};for(const k of Object.keys(STUDY_FIELDS))if(typeof input.overrides?.[k]==='string'&&input.overrides[k].trim())human.overrides[k]=input.overrides[k].trim().slice(0,16000);return human;}
export function updateHuman(project,shotId,input,checked={}){const p=copy(project),s=p.shots.find(x=>x.id===shotId);if(!s)throw Error('镜头已变更，请重新打开');s.human=cleanHuman(input);for(const k of Object.keys(REVIEW_LABELS)){if(!checked[k])continue;if(k==='sound'&&!s.human.noAudio&&!s.human.overrides.audio)throw Error('勾选原声已核前，请记录实际听到的内容，或确认原片没有音轨');s.human.reviews[k]={stamp:reviewStamp(p,s,k),at:now()};}s.boundaryVerified=!!checked.boundary;p.updated=now();return p;}
export function displayProject(project){const p=copy(project);for(const s of p.shots){const raw=copy(s);s.aiSuggestion=Object.fromEntries(Object.keys(STUDY_FIELDS).map(k=>[k,raw[k]||'']));Object.assign(s,s.human?.overrides||{});s.reviewState=Object.fromEntries(Object.keys(REVIEW_LABELS).map(k=>[k,reviewed(project,raw,k)]));s.boundaryVerified=s.reviewState.boundary;if(s.reviewState.sound){s.audioStatus=s.human?.noAudio?'无音轨':'已听核';s.audio=s.human?.noAudio?'人工确认原片无音轨':s.human?.overrides?.audio||s.audio;}else if(s.human?.overrides?.audio){s.audioStatus='人工记录，待复核';}if(s.reviewState.motion)s.motionStatus='已人工回看完整动态';}if(p.screenplay)p.screenplay.segments=p.screenplay.segments.map(segment=>applySubtitleEdit(segment,p.subtitleEdits?.[segment.id]));return p;}
export function applySubtitleEdit(segment,edit){
 if(!edit)return segment;
 const {text,translation,speaker}=edit;
 return {...segment,originalText:segment.text,originalTranslation:segment.translation,text,translation,speaker,recognitionStatus:edit.recognitionStatus||'人工修订'};
}
export function updateSubtitle(project,id,edit){
 const segment=project.screenplay?.segments.find(item=>item.id===id);
 if(!segment||!Number.isFinite(segment.start)||!Number.isFinite(segment.end))throw Error('找不到对应的时间字幕');
 const next=copy(project);next.subtitleEdits??={};
 if(edit===null){delete next.subtitleEdits[id];next.updated=now();return next;}
 const data={text:String(edit.text||'').trim().slice(0,3000),translation:String(edit.translation||'').trim().slice(0,3000),speaker:String(edit.speaker||'').trim().slice(0,160)};
 if(!data.text)throw Error('请填写字幕原文');
 if(data.text!==segment.text&&data.translation===(segment.translation||'')&&data.translation)data.recognitionStatus='原文已修订，译文待核';
 next.subtitleEdits[id]=data;next.updated=now();
 return next;
}
export function collectLegacyNotes(project,storage){
 const p=copy(project);
 try{
   const notes=JSON.parse(storage?.getItem(`guanlan-study:${p.id}`)||'{}');
   for(const shot of p.shots){
     const value=notes[`${shot.id}@${shot.start.toFixed(4)}-${shot.end.toFixed(4)}`];
     const current=typeof value==='string'?value:value?.text;
     if(typeof current==='string'&&(typeof value==='object'||!shot.human?.notesMigrated||!shot.human?.observation))shot.human={...shot.human,observation:current,notesMigrated:true};
   }
   const ranges=JSON.parse(storage?.getItem(`guanlan-study:${p.id}:ranges`)||'null');if(Array.isArray(ranges))p.rangeNotes=ranges;
 }catch{}
 return p;
}
export function restoreLegacyNotes(project,storage){
 const key=`guanlan-study:${project.id}`;
 try{
  const notes=Object.fromEntries(project.shots.filter(shot=>shot.human?.observation).map(shot=>[`${shot.id}@${shot.start.toFixed(4)}-${shot.end.toFixed(4)}`,shot.human.observation]));
  storage.setItem(key,JSON.stringify(notes));storage.setItem(key+':ranges',JSON.stringify(project.rangeNotes||[]));
 }catch{}
}
function clearAffected(s){for(const k of Object.keys(STUDY_FIELDS))s[k]='';s.people=[];s.motionEvidence='';s.images=[];s.frames=[];s.sampleTimes=[];s.boundaryVerified=false;s.motionStatus='切点调整，待重新观察';s.audioStatus='未听核';s.confidence='镜头范围已变，待重新分析';s.human={observation:'',overrides:{},reviews:{}};s.boundary='人工调整候选';return s;}
export function editCuts(project,{type,shotId,time}){const p=copy(project),index=p.shots.findIndex(s=>s.id===shotId),affected=[],removed=[];if(index<0)throw Error('镜头已变更');const s=p.shots[index];const stamp=now();p.cutHistory??=[];
 if(type==='split'){if(p.shots.length>=500)throw Error('最多500镜，请分段研究');if(!Number.isFinite(time)||time<=s.start+.04||time>=s.end-.04)throw Error('请把播放头放在本镜内部，距首尾至少0.04秒');const nextId='S'+String(Math.max(0,...p.shots.map(s=>Number(s.id.replace(/^S/,''))||0))+1).padStart(3,'0');p.cutHistory.push({at:stamp,type,shots:[copy(s)]});const end=s.end,newShot=clearAffected({...copy(s),id:nextId,start:time,end,duration:end-time});s.end=time;s.duration=time-s.start;clearAffected(s);p.shots.splice(index+1,0,newShot);affected.push(s.id,nextId);}
 else if(type==='merge'){const next=p.shots[index+1];if(!next)throw Error('已经是最后一镜');p.cutHistory.push({at:stamp,type,shots:[copy(s),copy(next)]});s.end=next.end;s.duration=s.end-s.start;clearAffected(s);p.shots.splice(index+1,1);affected.push(s.id);removed.push(next.id);}
 else throw Error('未知镜头操作');
 p.cutHistory=p.cutHistory.slice(-10);const changed=new Set([...affected,...removed]);for(const group of ['beats','groups','takeaways','exercises','methods'])for(const x of p.lessons?.[group]||[])if(x.shotIds?.some(id=>changed.has(id))){x.needsReview=true;x.shotIds=x.shotIds.filter(id=>!removed.includes(id));x.limits=[x.limits,'镜头范围已调整，本条关联与解释待重新核对。'].filter(Boolean).join('\n');}const hook=p.lessons?.hook;if(hook?.shotIds?.some(id=>changed.has(id))){hook.needsReview=true;hook.shotIds=hook.shotIds.filter(id=>!removed.includes(id));hook.limits=[hook.limits,'镜头范围已调整，待重新核对。'].filter(Boolean).join('\n');}for(const a of p.screenplay?.alignments||[])if(a.shotIds?.some(id=>changed.has(id))){a.shotIds=a.shotIds.filter(id=>!removed.includes(id));a.status='待核';a.verification='镜头范围已调整，请重新核对本组字幕或剧本关联。';}
 for(const cue of p.cues||[]){
   if(cue.episode!==(p.series?.episode||1)||!changed.has(cue.shotId))continue;
   const old=project.shots.find(shot=>shot.id===cue.shotId);
   cue.time=Number.isFinite(cue.time)?cue.time:old?.start;
   const match=p.shots.find(shot=>shot.start<=cue.time&&cue.time<shot.end);
   cue.shotId=match?.id||null;cue.needsReview=true;
 }
 p.draft={...(p.draft||{}),shotBatches:{}};p.updated=stamp;p.meta.coverage='局部镜头已调整；受影响镜头与结构关联待重新核对，其他记录保留';return {project:p,affected,selected:s.id};}
export function analyzeCuts(samples,{minimum=.18,minSeconds=.4,ratio=2.1}={}){const out=[];for(let i=1;i<samples.length;i++){const {time,score}=samples[i];if(!Number.isFinite(time)||!Number.isFinite(score)||score<minimum)continue;const nearby=samples.slice(Math.max(1,i-2),Math.min(samples.length,i+3)).filter((_,j)=>j+Math.max(1,i-2)!==i).map(x=>x.score).filter(Number.isFinite);const baseline=nearby.reduce((a,b)=>a+b,0)/Math.max(1,nearby.length),peak=score/Math.max(.025,baseline);if(peak<ratio&&!(score>=.34&&peak>=1.35))continue;if(out.length&&time-out.at(-1).time<minSeconds){if(score>out.at(-1).score)out.pop();else continue;}out.push({time,score,priority:peak<2.6||score<.22?'优先回看':'待回看',reason:'相邻画面变化峰值；不是逐帧精确切点'});}return out;}
export const emptyLearning=()=>({version:1,methods:[],resources:[],categories:{film:[],topic:[]},removedMethods:[],updated:''});
const methodText=(value,limit=4000)=>typeof value==='string'?value.trim().slice(0,limit):'';
export const learningCategoryLabel=(value,kind)=>{
 const text=methodText(value,80);
 return kind==='topic'&&Object.hasOwn(METHOD_TOPICS,text)?METHOD_TOPICS[text]:text;
};
export function resolveLearningCategory(library,kind,value){
 const label=learningCategoryLabel(value,kind);
 const rule=library.categories?.[kind]?.find(item=>item.name===label||item.aliases.includes(label));
 return rule?.removed?'':rule?.name??label;
}
export function learningCategories(library,kind,observed=[]){
 const values=kind==='topic'?[...Object.values(METHOD_TOPICS),...observed]:observed;
 const names=values.map(value=>resolveLearningCategory(library,kind,value));
 for(const category of library.categories?.[kind]||[])if(!category.removed)names.push(category.name);
 return [...new Set(names.filter(Boolean))];
}
export function setLearningCategory(library,kind,previous,value){
 if(!['film','topic'].includes(kind))throw Error('分类类型无效');
 const name=learningCategoryLabel(value,kind);
 if(!previous&&!name)throw Error('请填写分类名称');
 library.categories??={film:[],topic:[]};
 const rules=library.categories[kind];
 const prior=rules.find(rule=>rule.name===previous&&!rule.removed);
 const target=rules.find(rule=>rule.name===name||rule.aliases.includes(name));
 if(name&&name===previous)return;
 if(!previous&&target?.removed){
  target.removed=false;
  return;
 }
 const aliases=[...new Set([...(prior?.aliases||[]),previous].filter(label=>label&&label!==name))];
 const remaining=rules.filter(rule=>rule!==prior);
 if(name&&(name==='__uncategorized__'||remaining.some(rule=>rule.name===name||rule.aliases.includes(name))))throw Error('该名称已被使用，请换一个名称');
 library.categories[kind]=[...remaining,name?{name,aliases,removed:false}:{name:previous,aliases:prior?.aliases||[],removed:true}];
}
export function mergeLearningBackup(current,incoming){
 for(const key of ['methods','resources']){
  const ids=new Set(current[key].map(item=>item.id));
  current[key].push(...incoming[key].filter(item=>!ids.has(item.id)));
 }
 current.categories??={film:[],topic:[]};
 for(const kind of ['film','topic']){
  const used=new Set(current.categories[kind].flatMap(item=>[item.name,...item.aliases]));
  for(const rule of incoming.categories[kind]){
   const labels=[rule.name,...rule.aliases];
   if(labels.some(label=>used.has(label)))continue;
   current.categories[kind].push(rule);
   labels.forEach(label=>used.add(label));
  }
 }
 current.removedMethods=[...new Set([...(current.removedMethods||[]),...incoming.removedMethods])]
  .filter(id=>!current.methods.some(method=>method.id===id));
}
const inferMethodTopic=(text)=>{
 const topics=[
  ['production',/制片|预算|成本|工期|资源|实拍|AI.{0,4}生成/],['lighting',/色彩|冷暖|光影|色温|灯光|逆光|明暗/],
  ['motion',/运镜|推镜|拉镜|摇镜|跟拍|移动镜头/],['composition',/构图|留白|前景|后景|遮挡|纵深|画面中心/],
  ['camera',/机位|景别|特写|近景|全景|俯拍|仰拍|反打/],['sound',/音效|原声|配乐|静默|声画|音乐/],
  ['hook',/钩子|开场|卡点|集尾/],['editing',/剪辑|切点|节奏|跳切|反应镜头|节拍|停顿/],
  ['performance',/表演|调度|视线|目光|站位|反应/]
 ];
 return topics.find(([,pattern])=>pattern.test(text))?.[0]||'intent';
};
export function projectFilmType(project,profile={}){
 return methodText(profile.type,80)||methodText(project.series?.profile?.type,80)||methodText(project.lessons?.filmType,80);
}
export function deriveLearningMethods(project,profile={}){
 if(project.status==='候选素材'||!project.lessons?.overview)return [];
 const {lessons,shots,meta}=project,shotMap=new Map(shots.map(shot=>[shot.id,shot]));
 const filmType=projectFilmType(project,profile),sourceLayout=layoutKey(project),methods=new Map();
 const add=(item,origin,topic,evidence,reason,practice)=>{
  if(!item||item.needsReview||!Array.isArray(item.shotIds)||!item.shotIds.length||item.shotIds.some(id=>!shotMap.has(id)))return;
  const title=methodText(item.title,160),method=methodText(item.how)||methodText(item.method),proof=methodText(evidence);
  if(!title||!method||!proof)return;
  const cited=[...new Set(item.shotIds)].map(id=>shotMap.get(id)).sort((a,b)=>a.start-b.start);
  const id='study-method:'+digest(JSON.stringify([project.id,topic,title,method,proof,reason,cited.map(shot=>shot.id)]));
  if(methods.has(id))return;
  methods.set(id,{
   id,origin,topic,filmType,projectId:project.id,seriesId:project.series?.id||project.id,projectTitle:project.series?.title||project.title,
   sourceName:meta.sourceName,sourceStart:meta.sourceStart||0,start:cited[0].start,end:cited.at(-1).end,
   shotIds:cited.map(shot=>shot.id),sourceLayout,title,method,evidence:proof,reason:methodText(reason),
   when:methodText(item.when),limits:methodText(item.limits),practice:methodText(practice),
   tags:[...(Array.isArray(profile.themes)?profile.themes:[]),...(Array.isArray(item.tags)?item.tags:[])].map(tag=>methodText(tag,60)).filter(Boolean).slice(0,12).join(' · '),
   reviewed:false,reviewedAt:null,created:project.updated||''
  });
 };
 const exerciseFor=ids=>(Array.isArray(lessons.exercises)?lessons.exercises:[]).find(item=>!item.needsReview&&item.shotIds?.some(id=>ids.includes(id)))?.question;
 for(const row of Array.isArray(lessons.methods)?lessons.methods:[]){
  if(!row||!methodText(row.topic,80)||!methodText(row.when)||!methodText(row.limits)||!methodText(row.reason)||!methodText(row.practice))continue;
  add(row,'analysis',methodText(row.topic,80),row.evidence,row.reason,row.practice);
 }
 if(Array.isArray(lessons.methods)&&lessons.methods.length)return [...methods.values()];
 for(const row of Array.isArray(lessons.takeaways)?lessons.takeaways:[]){
  if(!Array.isArray(row?.shotIds))continue;
  const evidence=row.shotIds.map(id=>{const s=shotMap.get(id);const detail=methodText(s?.evidence)||methodText(s?.frame);return detail?`${id} · ${detail}`:'';}).filter(Boolean).join('\n');
  add(row,'summary',inferMethodTopic([row.title,row.method,row.how].join(' ')),evidence,row.method,exerciseFor(row.shotIds));
 }
 for(const row of Array.isArray(lessons.groups)?lessons.groups:[]){
  if(!Array.isArray(row?.shotIds))continue;
  add({...row,how:row.transfer},'summary','editing',row.evidence,row.reason,exerciseFor(row.shotIds));
 }
 const hook=lessons.hook;
 if(Array.isArray(hook?.shotIds))add({...hook,title:'入口的观看期待',method:hook.payoff},'summary','hook',hook.evidence,hook.question,exerciseFor(hook.shotIds));
 return [...methods.values()];
}
export function validateLearning(value){
 if(!value||value.version!==1||!Array.isArray(value.methods)||!Array.isArray(value.resources)||value.methods.length>1000||value.resources.length>200)throw Error('学习库格式或数量无效');
 if(JSON.stringify(value).length>28e6)throw Error('学习库过大，请减少附件或分批备份');
 const v=copy(value),ids=new Set();
 for(const method of v.methods){
  if(!method||typeof method.id!=='string'||ids.has(method.id))throw Error('方法卡编号无效或重复');
  ids.add(method.id);
  for(const key of ['title','method','when','limits','tags','evidence','reason','practice'])method[key]=methodText(method[key],key==='title'?160:16000);
  for(const key of ['filmType','filmTypeOverride','topic'])if(Object.hasOwn(method,key))method[key]=methodText(method[key],80);
  if(!method.title||!method.method)throw Error('请填写方法名称和具体做法');
  if(!Array.isArray(method.shotIds)||method.shotIds.some(id=>typeof id!=='string'))throw Error('方法卡镜号无效');
  if(method.projectId&&(typeof method.projectId!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(method.projectId)))throw Error('方法卡来源项目无效');
  if(method.projectId&&(!method.shotIds.length||!Number.isFinite(method.start)||!Number.isFinite(method.end)||method.start<0||method.end<=method.start))throw Error('方法卡来源范围无效');
  if(!method.projectId&&method.shotIds.length)throw Error('请为引用的镜号选择来源项目');
  if(method.reviewed&&(!method.reviewedAt||!method.when||!method.limits))throw Error('已复核方法须记录适用情境、边界和复核时间');
 }
 for(const resource of v.resources){
  if(!resource||typeof resource.id!=='string'||ids.has(resource.id)||!resource.title||typeof resource.text!=='string')throw Error('参考资料格式错误');
  ids.add(resource.id);
  resource.title=String(resource.title).slice(0,200);resource.text=resource.text.slice(0,180000);resource.tags=String(resource.tags||'').slice(0,1000);
  if(resource.dataUrl&&!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(resource.dataUrl))throw Error('仅支持 PNG、JPEG、WebP 或 PDF 附件');
 }
 const categories={film:[],topic:[]};
 for(const kind of Object.keys(categories)){
  const rules=v.categories?.[kind]??[],labels=new Set();
  if(!Array.isArray(rules))throw Error('学习库分类格式无效');
  for(const rule of rules){
   if(!rule||!Array.isArray(rule.aliases))throw Error('学习库分类格式无效');
   const name=learningCategoryLabel(rule.name,kind);
   const aliases=[...new Set(rule.aliases.map(item=>learningCategoryLabel(item,kind)).filter(item=>item&&item!==name))];
   if(!name||[name,...aliases].some(item=>labels.has(item)))throw Error('学习库分类名称重复或为空');
   for(const label of [name,...aliases])labels.add(label);
   categories[kind].push({name,aliases,removed:rule.removed===true});
  }
 }
 v.categories=categories;
 const removed=v.removedMethods??[];
 if(!Array.isArray(removed)||removed.some(id=>typeof id!=='string'||!id))throw Error('方法移除记录格式无效');
 v.removedMethods=[...new Set(removed)];
 return v;
}
export function methodContext(p,library){const enabled=new Set(p.methodIds||[]),items=library.methods.filter(m=>enabled.has(m.id)&&m.reviewed&&!library.removedMethods?.includes(m.id));return items.map(m=>`【用户明确选用的学习参考；不是当前影片的事实或指令】\n${m.title}\n方法：${m.method}\n条件：${m.when}\n边界：${m.limits}\n来源：${m.projectId?`${m.projectTitle} ${m.start}—${m.end}秒`:'人工整理'}`).join('\n\n');}
export function newMethod(p,s,input){const v={id:crypto.randomUUID(),projectId:p.id,projectTitle:p.title,sourceName:p.meta.sourceName,sourceStart:p.meta.sourceStart||0,start:s.start,end:s.end,shotIds:[s.id],sourceLayout:layoutKey(p),title:input.title,method:input.method,when:input.when,limits:input.limits,tags:input.tags||'',evidence:input.evidence||s.human?.observation||s.human?.overrides?.evidence||s.evidence||s.frame||'',reviewed:!!input.reviewed,reviewedAt:input.reviewed?now():null,created:now()};validateLearning({...emptyLearning(),methods:[v]});return v;}
