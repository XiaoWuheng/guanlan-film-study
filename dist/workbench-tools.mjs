import {
 displayProject,collectLegacyNotes,restoreLegacyNotes,layoutKey,updateHuman,updateSubtitle,editCuts,emptyLearning,
 validateLearning,newMethod,methodContext,deriveLearningMethods,projectFilmType,resolveLearningCategory,
 learningCategories,learningCategoryLabel,setLearningCategory,mergeLearningBackup
} from './study-tools.mjs';
import {groupStudies,mediaLabel,profileKey} from './project-library.mjs';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls='')=>{const b=node('button',label,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(e=>alert(e.message));return b;};
const now=()=>new Date().toISOString();
export function installWorkbench(api){
 const {$}=api;let cached=null,libraryDB=null,learningSave=Promise.resolve(),mutation=Promise.resolve(),undo=null;
 async function localLibrary(){return libraryDB??=new Promise((resolve,reject)=>{const r=indexedDB.open('guanlan-learning-library',1);r.onupgradeneeded=()=>r.result.createObjectStore('library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function learning(refresh=false){
  if(cached&&!refresh)return cached;
  if(api.desktop()){
   cached=validateLearning(await api.request('/api/learning'));
  }else{
   const db=await localLibrary();
   const value=await new Promise((resolve,reject)=>{
    const request=db.transaction('library').objectStore('library').get('main');
    request.onsuccess=()=>resolve(request.result||emptyLearning());request.onerror=()=>reject(request.error);
   });
   cached=validateLearning(value);
  }
  const projects=new Map((await api.all()).map(project=>[project.id,project]));
  for(const method of cached.methods){
   const source=projects.get(method.projectId);
   if(source&&method.sourceLayout!==layoutKey(source)){method.reviewed=false;method.reviewedAt=null;method.sourceChanged=true;}
  }
  return cached;
 }
 function saveLearning(input){
  const value=validateLearning(input),expected=input.updated||'';
  value.updated=new Date(Math.max(Date.now(),(Date.parse(expected)||0)+1)).toISOString();
  async function save(){
   if(api.desktop()){
    await api.request('/api/learning',{...value,_expectedUpdated:expected});
   }else{
    const db=await localLibrary();
    await new Promise((resolve,reject)=>{
     const tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),request=store.get('main');
     request.onsuccess=()=>{
      if((request.result?.updated||'')!==expected){reject(Error('学习库已在另一页面更新，请再试一次。'));tx.abort();return;}
      store.put(value,'main');
     };
     tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('学习库保存中断'));
    });
   }
   cached=value;
  }
  learningSave=learningSave.catch(()=>{}).then(save);return learningSave;
 }
 function modal(title){
  const dialog=node('dialog',null,'learning-dialog'),head=node('div',null,'learning-heading');
  dialog.setAttribute('aria-label',title);
  head.append(node('h2',title),button('关闭 ×',()=>dialog.close(),'quiet'));
  dialog.append(head);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();return dialog;
 }
 function field(parent,label,value='',rows=3){const wrap=node('label',label),input=node(rows===1?'input':'textarea');if(rows!==1)input.rows=rows;input.value=value;wrap.append(input);parent.append(wrap);return input;}
 function download(name,data){api.download(name,new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));}
 function alive(p,key){if(!api.getActive()||api.getActive().id!==p.id||layoutKey(api.getActive())!==key)throw Error('项目或镜头已变更，请重新操作');}
 async function saveProject(p){p.updated=now();await api.save(p);api.setActive(p);await api.library();api.showPrepared();}
 async function getProject(){let p=api.getActive();if(!p)throw Error('请先打开一份拉片');if(api.desktop())p=await api.request('/api/project?id='+encodeURIComponent(p.id));if(api.desktop())p._expectedUpdated=p.updated;return collectLegacyNotes(p,localStorage);}
 async function capture(p,ids,src){if(!src)throw Error('请先在报告播放器选择对应原片，再调整镜头');const v=document.createElement('video');v.muted=true;v.preload='auto';v.src=src;const wait=(event,trigger)=>new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);v.removeEventListener(event,ok);v.removeEventListener('error',bad);},ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(Error('无法解码对应原片'));},timer=setTimeout(()=>{cleanup();reject(Error('视频定位超时，请重新选择原片'));},20000);v.addEventListener(event,ok,{once:true});v.addEventListener('error',bad,{once:true});trigger();});try{await wait('loadeddata',()=>v.load());if(Math.abs(v.duration-p.meta.sourceDuration)>.5)throw Error('当前视频时长不匹配，请选择对应原片');const canvas=document.createElement('canvas');canvas.height=576;canvas.width=Math.round(576*v.videoWidth/v.videoHeight);const ctx=canvas.getContext('2d');for(const s of p.shots.filter(s=>ids.includes(s.id))){s.images=[];s.frames=[];s.sampleTimes=[];for(const f of [.15,.5,.85]){const t=p.meta.sourceStart+s.start+s.duration*f;if(Math.abs(v.currentTime-t)>.001)await wait('seeked',()=>v.currentTime=t);ctx.drawImage(v,0,0,canvas.width,canvas.height);s.images.push(canvas.toDataURL('image/jpeg',.8));s.frames.push(t);s.sampleTimes.push(t);}}}finally{v.pause();v.removeAttribute('src');v.load();}}
 function answer(data,ok,error){$('viewer').contentWindow?.postMessage({type:'guanlan-response',requestId:data.requestId,ok,error},location.origin);}
 window.addEventListener('message',e=>{if(e.source!==$('viewer').contentWindow||e.origin!==location.origin||!e.data||e.data.type!=='guanlan-action')return;const data=e.data;if(!['save-human','save-subtitle','cut','save-method'].includes(data.action))return;mutation=mutation.catch(()=>{}).then(async()=>{if(api.busy())throw Error('当前正在处理素材，请完成后再修改');let p=await getProject();alive(p,data.layout);if(p.id!==data.projectId)throw Error('项目已切换');if(data.action==='save-human'){p=updateHuman(p,data.shotId,data.human,data.reviews);await saveProject(p);undo=null;$('undo-cut').hidden=true;answer(data,displayProject(p));return;}
 if(data.action==='save-subtitle'){
   p=updateSubtitle(p,data.segmentId,data.edit);await saveProject(p);undo=null;$('undo-cut').hidden=true;
   answer(data,displayProject(p).screenplay.segments);return;
 }
 if(data.action==='save-method'){const s=p.shots.find(s=>s.id===data.shotId);if(!s)throw Error('镜头不存在');const lib=await learning(true),card=newMethod(p,s,data.method);lib.methods.unshift(card);await saveLearning(lib);answer(data,{message:card.reviewed?'方法已保存到学习库，可明确选用于其他项目':'方法草稿已保存，复核后才能用于项目'});return;}
 const source=$('viewer').contentDocument?.querySelector('video')?.getAttribute('src'),before=structuredClone(p);const result=editCuts(p,{type:data.cutType,shotId:data.shotId,time:data.time});api.setBusy(true);try{api.status('正在重抽受影响镜头，其他镜头与人工记录保留…');await capture(result.project,result.affected,source);alive(p,data.layout);api.backup(before);await saveProject(result.project);const lib=await learning(true);let invalidated=false;for(const m of lib.methods)if(m.projectId===p.id&&m.reviewed&&m.sourceLayout!==layoutKey(result.project)){m.reviewed=false;m.reviewedAt=null;m.sourceChanged=true;invalidated=true;}if(invalidated)await saveLearning(lib);undo={projectId:p.id,before,after:result.project.updated};$('undo-cut').hidden=false;await api.openReport(false,{time:data.time??result.project.shots.find(s=>s.id===result.selected).start});api.status('镜头已局部调整；受影响的旧记录存入项目历史，并已下载调整前备份。');}finally{api.setBusy(false);}}).catch(err=>{answer(data,null,err.message);api.status(err.message,true);});});

 let libraryRequest=0,learningView=null;
 async function showLibrary(source='',preserve=false){
  const filters=preserve?learningView?.snapshot():null;
  const request=++libraryRequest,page=$('learning-page'),heading=node('h1','学习库');
  const state=node('p','正在整理本机学习记录…','learning-count');state.setAttribute('role','status');
  page.replaceChildren(heading,state);
  let initial,projects;
  try{[initial,projects]=await Promise.all([learning(true),api.all()]);}
  catch(error){if(request===libraryRequest)state.textContent='学习库读取未成功。'+error.message;return;}
  if(request!==libraryRequest)return;
  let lib=initial,tab=filters?.tab||'methods';
  const byId=new Map(projects.map(project=>[project.id,project]));
  const profile=project=>api.getProfile(profileKey(project));
  const derived=projects.filter(project=>!project.demo).flatMap(project=>deriveLearningMethods(project,profile(project)));
  const latest=new Set(derived.map(method=>method.id));
  const sourceGroups=groupStudies(projects.filter(project=>!project.demo)).map(group=>[group.key,group.title]);
  const select=(label,entries)=>{
   const input=node('select');input.setAttribute('aria-label',label);
   for(const [value,text] of entries)input.add(new Option(text,value));
   return input;
  };
  const tabs=node('nav',null,'learning-page-tabs');tabs.setAttribute('aria-label','学习库内容');
  const tools=node('div',null,'learning-page-tools'),bar=node('div',null,'learning-page-controls'),body=node('div',null,'learning-results');
  bar.append(tabs,tools);
  const filterBar=node('div',null,'learning-filters'),methodFilters=node('div',null,'learning-method-filters'),search=node('input');
  search.type='search';search.placeholder='搜索方法、片名或证据';search.setAttribute('aria-label','搜索学习库');
  const rawFilmType=method=>{
   const project=byId.get(method.projectId);
   return method.filmTypeOverride??(project?projectFilmType(project,profile(project)):method.filmType);
  };
  const rawTopic=method=>Object.hasOwn(method,'topic')?method.topic:'intent';
  const category=(kind,value)=>resolveLearningCategory(lib,kind,value);
  const categoryValues=kind=>learningCategories(lib,kind,kind==='film'
   ?[...projects.filter(project=>!project.demo).map(project=>projectFilmType(project,profile(project))),...lib.methods.map(rawFilmType)]
   :[...derived,...lib.methods].map(rawTopic));
  const noCategory='__uncategorized__';
  const film=select('片型',[]),topic=select('学习主题',[]);
  const categorySelects={film,topic};
  function updateCategories(selected={film:film.value,topic:topic.value}){
   for(const [kind,control] of Object.entries(categorySelects)){
    const title=kind==='film'?'片型':'学习主题',names=categoryValues(kind);
    control.replaceChildren(new Option('全部'+title,''),...names.map(name=>new Option(name,name)),new Option(kind==='film'?'未标注片型':'未分类',noCategory));
    control.value=[...control.options].some(option=>option.value===selected[kind])?selected[kind]:'';
   }
  }
  updateCategories(filters||{});
  const origin=select('来源项目',[['','全部来源项目'],...sourceGroups]);
  const review=select('复核状态',[['','全部状态'],['reviewed','已复核'],['draft','待复核']]);
  if(sourceGroups.some(([key])=>key===source))origin.value=source;
  for(const [control,value] of [[film,filters?.film],[topic,filters?.topic],[origin,filters?.origin],[review,filters?.review]]){
   if([...control.options].some(option=>option.value===value))control.value=value;
  }
  search.value=filters?.query||'';
  methodFilters.append(film,topic,origin,review);filterBar.append(search,methodFilters);
  page.replaceChildren(heading,bar,filterBar,state,body);
  learningView={snapshot:()=>({tab,query:search.value,film:film.value,topic:topic.value,origin:origin.value,review:review.value})};
  const restore=node('input');restore.type='file';restore.accept='.json';restore.hidden=true;
  async function changeLibrary(update){
   const next=mutation.catch(()=>{}).then(async()=>{
    const current=await learning(true);update(current);await saveLearning(current);return current;
   });
   mutation=next;
   await next;lib=cached;updateCategories();updateTools();render();
  }
  async function remove(kind,item){
   await changeLibrary(current=>{
    const index=current[kind].findIndex(entry=>entry.id===item.id);
    const [value]=index<0?[]:current[kind].splice(index,1);
    if(kind==='methods'&&!current.removedMethods.includes(item.id))current.removedMethods.push(item.id);
    current.trash=[...(current.trash||[]),{kind,id:item.id,value:value||null}].slice(-20);
   });
  }
  restore.onchange=async()=>{
   try{
    const file=restore.files[0];if(!file)return;
    if(file.size>28e6)throw Error('备份文件过大');
    const incoming=validateLearning(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
    await changeLibrary(current=>mergeLearningBackup(current,incoming));
   }catch(error){alert(error.message);}finally{restore.value='';}
  };
  const row=(parent,label,value)=>{
   if(!value)return;
   const entry=node('div',null,'method-row');entry.append(node('dt',label),node('dd',value));parent.append(entry);
  };
  function allMethods(){
   const saved=new Set(lib.methods.map(method=>method.id));
   const removed=new Set(lib.removedMethods);
   return [...lib.methods,...derived.filter(method=>!saved.has(method.id))].filter(method=>!removed.has(method.id)).map(method=>{
    const project=byId.get(method.projectId),changed=Boolean(project&&method.sourceLayout!==layoutKey(project));
    const superseded=Boolean(project&&method.origin&&!method.reviewed&&!latest.has(method.id));
    return {...method,filmType:category('film',rawFilmType(method)),topic:category('topic',rawTopic(method)),
     seriesId:project?profileKey(project):method.seriesId,changed:changed||superseded,reviewed:method.reviewed&&!changed};
   });
  }
  async function openMethod(method){
   const project=(await api.all()).find(item=>item.id===method.projectId);
   if(!project)throw Error('来源项目不在当前设备，可恢复项目备份后回看。');
   const time=Math.max(0,Math.min(project.meta.duration,(method.sourceStart||0)+method.start-(project.meta.sourceStart||0)));
   await api.openSource(project,{time,detail:'explain',pane:'player'});
   if(method.changed||layoutKey(project)!==method.sourceLayout)api.status('已定位原片时间，请重新核对来源证据。');
  }
  function editMethod(method=null){
   const adding=!method;
   const entry=method||{id:crypto.randomUUID(),shotIds:[],reviewed:false,created:now(),topic:topic.value===noCategory?'':topic.value,filmType:film.value===noCategory?'':film.value};
   const dialog=modal(adding?'新增方法':'编辑与复核'),form=node('div',null,'learning-editor');
   const inputs={};
   for(const [key,label,rows] of [['title','方法名称',1],['method','怎样复用',3],['evidence','原片证据',3],['reason','作用与意图推断',3],['when','适用情境',2],['limits','边界与制作取舍',2],['practice','练习',2],['tags','标签',1]]){
    inputs[key]=field(form,label,entry[key]||'',rows);
   }
   inputs.title.required=inputs.method.required=true;
   const classifications=node('div',null,'method-editor-classifications');
   const filmInput=field(classifications,'片型',entry.filmType||'',1),topicInput=field(classifications,'学习主题',entry.topic||'',1);
   for(const [kind,input] of [['film',filmInput],['topic',topicInput]]){
    const list=node('datalist');list.id='method-category-'+kind;input.setAttribute('list',list.id);input.maxLength=80;
    input.placeholder=kind==='film'?'可选择或输入新片型':'可选择或输入新主题';
    for(const name of categoryValues(kind))list.append(new Option(name));
    classifications.append(list);
   }
   form.prepend(classifications);
   let source,shotSelect;
   if(adding){
    source=select('来源项目或片段',[['','无关联项目'],...projects.filter(project=>!project.demo).map(project=>[project.id,project.title])]);
    if(origin.value){
     const match=projects.find(project=>!project.demo&&profileKey(project)===origin.value);
     if(match)source.value=match.id;
    }
    shotSelect=select('来源镜头',[]);
    const sourceLabel=node('label','来源项目或片段'),shotLabel=node('label','来源镜头');
    sourceLabel.append(source);shotLabel.append(shotSelect);classifications.append(sourceLabel,shotLabel);
    source.onchange=()=>{
     const project=byId.get(source.value);
     shotSelect.replaceChildren(...(project?.shots||[]).map((shot,index)=>new Option(`镜头 ${index+1} · ${shot.start.toFixed(2)}秒`,shot.id)));
     shotLabel.hidden=!project;
     if(project&&!filmInput.value)filmInput.value=category('film',projectFilmType(project,profile(project)));
    };
    source.onchange();
   }
   const label=node('label',null,'check'),check=node('input');check.type='checkbox';check.checked=entry.reviewed;
   label.append(check,node('span','已回看对应镜头，核对证据、做法与边界'));form.append(label);
   const error=node('p','','warning');error.hidden=true;error.setAttribute('role','status');
   dialog.append(form,error,button('保存方法',async()=>{
    try{
     const {changed,...record}=entry;
     const sourceId=source?source.value:record.projectId;
     const project=sourceId&&(await api.all()).find(item=>item.id===sourceId);
     if(adding&&sourceId){
      const shot=project?.shots.find(item=>item.id===shotSelect.value);
      if(!shot)throw Error('来源镜头已变化，请重新选择');
      Object.assign(record,{projectId:project.id,projectTitle:project.series?.title||project.title,seriesId:profileKey(project),
       sourceStart:project.meta.sourceStart||0,sourceLayout:layoutKey(project),start:shot.start,end:shot.end,shotIds:[shot.id]});
     }
     for(const [key,input] of Object.entries(inputs))record[key]=input.value.trim();
     if(check.checked&&(!record.evidence||!record.when||!record.limits||(record.projectId&&!project)))throw Error('请填写核对依据、适用情境和边界，再标记复核。');
     if(project&&layoutKey(project)!==record.sourceLayout){
      const shift=(record.sourceStart||0)-(project.meta.sourceStart||0);
      const start=Math.max(0,record.start+shift),end=Math.min(project.meta.duration,record.end+shift);
      const cited=project.shots.filter(shot=>shot.start<end&&shot.end>start);
      if(check.checked&&!cited.length)throw Error('原片范围已调整，当前项目没有对应镜头。');
      if(cited.length)Object.assign(record,{sourceLayout:layoutKey(project),sourceStart:project.meta.sourceStart||0,start,end,shotIds:cited.map(shot=>shot.id)});
     }
     const enteredFilm=learningCategoryLabel(filmInput.value,'film'),enteredTopic=learningCategoryLabel(topicInput.value,'topic');
     Object.assign(record,{reviewed:check.checked,reviewedAt:check.checked?now():null});
     await changeLibrary(current=>{
      for(const [kind,value] of [['film',enteredFilm],['topic',enteredTopic]]){
       if(value&&!resolveLearningCategory(current,kind,value))setLearningCategory(current,kind,'',value);
      }
      record.filmType=resolveLearningCategory(current,'film',enteredFilm);
      record.topic=resolveLearningCategory(current,'topic',enteredTopic);
      if(adding||record.filmType!==entry.filmType)record.filmTypeOverride=record.filmType;
      const index=current.methods.findIndex(item=>item.id===record.id);
      if(index<0)current.methods.unshift(record);else current.methods[index]=record;
     });
     dialog.close();
    }catch(err){error.textContent=err.message;error.hidden=false;}
   },'primary'));
  }
  function methodCard(method){
   const project=byId.get(method.projectId),card=node('article',null,'method-card'),head=node('div',null,'method-card-heading'),labels=node('div',null,'method-labels');
   if(method.filmType)labels.append(node('span',method.filmType));
   const status=method.changed?'来源待重核':method.reviewed?'已复核':method.origin==='summary'?'原总结提取 · 待复核':'待复核';
   head.append(labels,node('span',status,'method-status'));
   const time=method.projectId?`${method.start.toFixed(2)}–${method.end.toFixed(2)} 秒`:'';
   const ids=method.shotIds.length>5?method.shotIds.slice(0,5).join('、')+` 等 ${method.shotIds.length} 镜`:method.shotIds.join('、');
   const sourceLabel=[project?.series?.title||method.projectTitle,project?.series?mediaLabel(project):'',time,ids].filter(Boolean).join(' · ')||'人工整理';
   card.append(head,node('h3',method.title),node('p',sourceLabel,'method-source'));
   const main=node('dl',null,'method-main');row(main,'怎样复用',method.method);row(main,'适用情境',method.when);card.append(main);
   const details=node('details',null,'method-details'),list=node('dl');
   details.append(node('summary','证据、边界与练习'));
   row(list,'原片证据',method.evidence);row(list,'作用与意图推断',method.reason);
   row(list,'边界与制作取舍',method.limits);row(list,'练习',method.practice);row(list,'标签',method.tags);
   details.append(list);card.append(details);
   const actions=node('div',null,'method-card-actions');
   if(method.projectId)actions.append(button('回看来源',()=>openMethod(method)));
   actions.append(button('编辑与复核',()=>editMethod(method),'quiet'));
   const p=api.getActive(),stored=lib.methods.some(item=>item.id===method.id),selected=p?.methodIds?.includes(method.id);
   if(p&&stored&&(method.reviewed||selected)&&p.id!==method.projectId){
    actions.append(button(selected?'移除学习参考':'用于当前项目',async()=>{
     const current=await getProject();
     current.methodIds=selected?(current.methodIds||[]).filter(id=>id!==method.id):[...new Set([...(current.methodIds||[]),method.id])];
     await saveProject(current);render();
    },'quiet'));
   }
   actions.append(button('移除',()=>remove('methods',method),'quiet'));
   card.append(actions);return card;
  }
  function resourceCard(item){
   const card=node('article',null,'method-card');
   card.append(node('p',[item.kind,item.tags,item.projectTitle].filter(Boolean).join(' · '),'method-source'),node('h3',item.title));
   if(item.text)card.append(node('pre',item.text));
   if(item.dataUrl?.startsWith('data:image/')){
    const img=node('img');img.src=item.dataUrl;img.alt=item.title;card.append(img);
   }else if(item.dataUrl)card.append(button('下载 PDF',()=>{
    const bytes=Uint8Array.from(atob(item.dataUrl.split(',')[1]),char=>char.charCodeAt(0));
    api.download(item.title.endsWith('.pdf')?item.title:item.title+'.pdf',new Blob([bytes],{type:'application/pdf'}));
   }));
   const actions=node('div',null,'method-card-actions');
   actions.append(button('修改资料',()=>addResource(item)),button('移除',()=>remove('resources',item),'quiet'));
   if(byId.has(item.projectId))actions.prepend(button('打开关联拉片',()=>api.openSource(byId.get(item.projectId))));
   card.append(actions);return card;
  }
  function manageCategories(){
   const dialog=modal('管理分类'),grid=node('div',null,'category-manager');
   dialog.classList.add('category-dialog');
   const notice=node('p','','category-notice');notice.setAttribute('role','status');
   dialog.append(node('p','移除分类后，相关方法会显示在未分类中。','category-help'));
   dialog.append(grid,notice);
   async function update(operation){
    notice.textContent='';
    try{await changeLibrary(operation);renderCategories();}
    catch(error){notice.textContent=error.message;}
   }
   function renderCategories(){
    grid.replaceChildren();
    for(const [kind,title] of [['film','片型'],['topic','学习主题']]){
     const section=node('section',null,'category-section'),add=node('form',null,'category-row'),name=node('input');
     name.placeholder='输入新'+title;name.setAttribute('aria-label','新'+title);name.maxLength=80;name.required=true;
     const submit=node('button','新增','primary');submit.type='submit';add.append(name,submit);
     add.onsubmit=event=>{
      event.preventDefault();
      const label=learningCategoryLabel(name.value,kind);
      return update(current=>{
       if(categoryValues(kind).includes(label))throw Error('已存在同名分类');
       setLearningCategory(current,kind,'',label);
      });
     };
     section.append(node('h3',title),add);
     for(const old of categoryValues(kind)){
      const row=node('form',null,'category-row'),input=node('input');
      input.value=old;input.maxLength=80;input.required=true;input.setAttribute('aria-label','编辑'+title+' '+old);
      const save=node('button','改名');save.type='submit';
      row.append(input,save,button('移除',()=>update(current=>setLearningCategory(current,kind,old,'')),'quiet'));
      row.onsubmit=event=>{
       event.preventDefault();const label=learningCategoryLabel(input.value,kind);
       return update(current=>{
        if(!label)throw Error('请填写分类名称');
        if(label!==old&&categoryValues(kind).includes(label))throw Error('已存在同名分类');
        setLearningCategory(current,kind,old,label);
       });
      };
      section.append(row);
     }
     for(const rule of (lib.categories?.[kind]||[]).filter(item=>item.removed)){
      const row=node('div',null,'category-row category-removed');
      row.append(node('span',rule.name),button('恢复',()=>update(current=>setLearningCategory(current,kind,'',rule.name))));
      section.append(row);
     }
     grid.append(section);
    }
   }
   renderCategories();
  }
  let displayedMethods=[];
  const exportMethods=button('导出方法论',async()=>{
   if(!displayedMethods.length)return;
   const rows=displayedMethods;
   const {exportMethodsXlsx}=await import('./spreadsheet-export.mjs');
   const sources=new Map(projects.map(project=>[project.id,{title:project.series?.title||project.title,label:project.series?mediaLabel(project):''}]));
   api.download('观澜_方法论.xlsx',exportMethodsXlsx(rows,sources));
  });
  function render(){
   if(request!==libraryRequest)return;
   const query=search.value.trim().toLocaleLowerCase();
   methodFilters.hidden=tab!=='methods';
   for(const control of tabs.children)control.setAttribute('aria-pressed',String(control.dataset.view===tab));
   body.replaceChildren();body.dataset.view=tab;
   if(tab==='resources'){
    const items=lib.resources.filter(item=>[item.title,item.tags,item.text,item.kind].join(' ').toLocaleLowerCase().includes(query));
    state.textContent=items.length+' 份参考资料';
    body.append(...items.map(resourceCard));
    if(!items.length)body.append(node('p',query?'没有匹配的参考资料。':'可添加剧本、拍剪图、作者分析和表格摘要。','learning-empty'));
    return;
   }
   const items=allMethods().filter(method=>{
    if(film.value&&(method.filmType||noCategory)!==film.value)return false;
    if(topic.value&&(method.topic||noCategory)!==topic.value)return false;
    if(origin.value&&method.seriesId!==origin.value)return false;
    if(review.value&&method.reviewed!==(review.value==='reviewed'))return false;
    return [method.title,method.projectTitle,method.filmType,method.topic,method.tags,method.method,method.evidence,method.practice].join(' ').toLocaleLowerCase().includes(query);
   });
   displayedMethods=items;exportMethods.disabled=!items.length;
   const count=new Set(items.map(item=>item.seriesId||item.projectId).filter(Boolean)).size;
   state.textContent=items.length+' 条方法'+(count?' · '+count+' 个来源项目':'');
   for(const key of [...categoryValues('topic'),'']){
    const rows=items.filter(item=>item.topic===key);if(!rows.length)continue;
    const group=node('section',null,'method-topic'),title=node('h2',key||'未分类'),grid=node('div',null,'method-grid');
    title.append(node('span',String(rows.length)));
    grid.append(...rows.map(methodCard));group.append(title,grid);body.append(group);
   }
   if(!items.length)body.append(node('p',query||film.value||topic.value||origin.value||review.value?'没有符合当前筛选的学习方法。':'可以自己新增方法，也可以从完成的拉片中归纳。','learning-empty'));
  }
  for(const [id,label] of [['methods','学习方法'],['resources','参考资料']]){
   const control=button(label,()=>{tab=id;updateTools();render();});
   control.dataset.view=id;tabs.append(control);
  }
  function updateTools(){
   const more=node('details',null,'learning-more'),menu=node('div',null,'learning-more-menu');
   more.append(node('summary','更多'),menu);
   menu.append(restore,button('备份学习库',()=>download('观澜学习库.json',lib)),button('恢复备份',()=>restore.click()));
   tools.replaceChildren(more);
   if(tab==='resources')tools.prepend(button('添加资料',()=>addResource(),'primary'));
   else tools.prepend(button('新增方法',()=>editMethod(),'primary'),button('管理分类',manageCategories),exportMethods);
   if(lib.trash?.length)tools.insertBefore(button('撤销移除',()=>changeLibrary(current=>{
    const item=current.trash?.pop();
    if(!item||!['methods','resources'].includes(item.kind))return;
    const id=item.id||item.value?.id;
    if(item.kind==='methods')current.removedMethods=current.removedMethods.filter(removed=>removed!==id);
    if(item.value&&!current[item.kind].some(entry=>entry.id===id))current[item.kind].unshift(item.value);
   })),more);
  }
  search.oninput=render;
  for(const input of [film,topic,origin,review])input.onchange=render;
  updateTools();render();

 async function addResource(old=null){const edit=modal(old?'修改参考资料':'添加参考资料'),title=field(edit,'资料名称',old?.title||'',1),tags=field(edit,'分类与标签',old?.tags||'',1),kind=node('select');for(const x of ['作者分析','剧本','拍剪图','方法图','表格摘要','其他']){const o=node('option',x);o.value=x;kind.append(o);}kind.value=old?.kind||'作者分析';const kindLabel=node('label','资料类型');kindLabel.append(kind);edit.append(kindLabel);const text=field(edit,'文字内容 / 表格摘要',old?.text||'',6),file=node('input');file.type='file';file.accept='.txt,.md,.srt,.vtt,.png,.jpg,.jpeg,.webp,.pdf';let attachment=old?.dataUrl||'';const fileLabel=node('label','导入文字、图片或 PDF（单附件最多4MB）');fileLabel.append(file);edit.append(fileLabel);file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>4e6)throw Error('附件最多4MB，请压缩图片或摘取资料');if(!title.value)title.value=f.name;if(/\.(txt|md|srt|vtt)$/i.test(f.name)){text.value=await f.text();attachment='';}else{attachment=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(f);});}}catch(e){alert(e.message);file.value='';}};const select=node('select');const none=node('option','暂不关联项目');none.value='';select.append(none);for(const p of projects){const o=node('option',p.title);o.value=p.id;select.append(o);}select.value=old?.projectId||api.getActive()?.id||'';const pl=node('label','关联拉片项目');pl.append(select);edit.append(pl,button('保存资料',async()=>{const p=projects.find(p=>p.id===select.value),resource={id:old?.id||crypto.randomUUID(),title:title.value.trim(),tags:tags.value,kind:kind.value,text:text.value,dataUrl:attachment,projectId:p?.id||'',projectTitle:p?.title||'',updated:now()};await changeLibrary(current=>{const index=current.resources.findIndex(x=>x.id===resource.id);if(index>=0)current.resources[index]=resource;else current.resources.unshift(resource);});edit.close();},'primary'));}
 }
 $('undo-cut').onclick=async()=>{try{const current=await getProject();if(!undo||current.id!==undo.projectId||current.updated!==undo.after)throw Error('没有可立即撤销的调整，或已有后续修改。可使用调整前项目备份恢复。');api.backup(current);undo.before._expectedUpdated=current.updated;await saveProject(undo.before);undo=null;$('undo-cut').hidden=true;await api.openReport();api.status('已撤销上次局部镜头调整。');}catch(e){api.status(e.message,true);}};
 $('import-link').onclick=async()=>{if(!api.desktop())return api.status('公开链接导入由电脑端提供。请下载并启动 Windows 版；网页版仍可导入本机视频。',true);const value=$('source-link').value.trim();if(!value)return api.status('请先粘贴公开视频链接。',true);const b=$('import-link');b.disabled=true;api.setBusy(true);const abort=new AbortController();$('stop').onclick=()=>abort.abort();try{api.status('正在获取公开视频，下载与解析期间可以停止…');const r=await fetch('/api/import-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:abort.signal});const result=await r.json();if(!r.ok)throw Error(result.error||'链接导入失败');const response=await fetch(result.url,{signal:abort.signal});if(!response.ok)throw Error('读取已导入视频失败');await api.loadVideo(new File([await response.blob()],result.name,{type:result.mime}),true);api.setMedia({url:result.url,name:result.name,size:result.size,duration:null});api.status('公开视频已导入。核对画面与时长后准备镜头；来源链接随项目保存。');}catch(e){api.status(e.name==='AbortError'?'已停止链接导入。':e.message,true);}finally{b.disabled=false;api.setBusy(false);api.restoreStop();}};
 return {learning,saveLearning,showLibrary,refreshLibrary:()=>showLibrary('',true),displayProject,collectLegacyNotes,restoreLegacyNotes,referenceContext:async p=>methodContext(p,await learning(true)),
  categoryHints:async()=>{
   const [lib,projects]=await Promise.all([learning(true),api.all()]);
   const film=learningCategories(lib,'film',projects.filter(p=>!p.demo).map(p=>projectFilmType(p,api.getProfile(profileKey(p)))));
   return {film,topic:learningCategories(lib,'topic',lib.methods.map(method=>method.topic))};
  }};
}
