(async()=>{
 'use strict';const api=window.GuanlanStudy;if(!api||window.parent===window)return;
 const {STUDY_FIELDS,REVIEW_LABELS,layoutKey}=await import('./study-tools.mjs'),parentOrigin=new URL(document.baseURI).origin;
 const $=id=>document.getElementById(id),el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(cls)n.className=cls;return n;},pending=new Map();let serial=0,viewShot=null,timer=null,dirty=false;
 function action(name,payload){return new Promise((resolve,reject)=>{const requestId='study-'+(++serial),timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('保存或处理尚未完成，请检查工作台状态后再试'));},45000);pending.set(requestId,{resolve,reject,timeout});window.parent.postMessage({type:'guanlan-action',action:name,requestId,projectId:api.project.id,layout:layoutKey(api.project),...payload},parentOrigin);});}
 window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==parentOrigin||e.data?.type!=='guanlan-response')return;const p=pending.get(e.data.requestId);if(!p)return;clearTimeout(p.timeout);pending.delete(e.data.requestId);if(e.data.error)p.reject(Error(e.data.error));else p.resolve(e.data.ok);});
 function button(label,fn,cls=''){const b=el('button',label,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(error=>{state.textContent=error.message;state.classList.add('warning');});return b;}
 function input(parent,label,rows=3){const wrap=el('label',label),i=el(rows===1?'input':'textarea');if(rows!==1)i.rows=rows;wrap.append(i);parent.append(wrap);return i;}
 const tab=button('修订与复核',()=>{api.setDetail('review');render();});tab.dataset.detail='review';tab.setAttribute('aria-selected','false');document.querySelector('.insight-tabs')?.append(tab);
 const panel=el('div',null,'insight-content review-editor');panel.id='detail-review';panel.hidden=true;panel.append(el('p','人工记录独立保存；AI 草稿保留供对照。','muted small'));const observation=input(panel,'我的观察',4);observation.id='human-observation';observation.placeholder='先记实际看见、听见的内容，再写自己的判断。';
 const edits=el('details',null,'secondary-details');edits.append(el('summary','修订镜头字段'));const fields=el('select');fields.id='human-field';fields.setAttribute('aria-label','要修订的内容');for(const [value,label]of Object.entries(STUDY_FIELDS)){const option=el('option',value==='onscreenText'?'画内文字':label);option.value=value;fields.append(option);}edits.append(fields);const suggestion=el('pre',null,'ai-suggestion');edits.append(el('small','既有分析','muted'),suggestion);const override=input(edits,'人工修订',4);override.id='human-override';edits.append(button('填入既有分析',()=>{if(override.value.trim())throw Error('已有人工内容，请手动修改');override.value=suggestion.textContent==='待补'?'':suggestion.textContent;change();},'quiet'));panel.append(edits);
 panel.append(button('修订本镜字幕',()=>{
   api.setDetail('transcript');
   const shot=api.shot(),items=(api.project.screenplay?.segments||[]).filter(item=>item.end>shot.start&&item.start<shot.end);
   if(items.length===1)api.editSubtitle(items[0]);
   else if(items.length>1){
     const d=el('dialog',null,'report-dialog');d.append(el('h2','选择字幕'),button('关闭',()=>d.close()));
     for(const item of items)d.append(button(`${api.format(item.start)} · ${item.text}`,()=>{d.close();api.editSubtitle(item);}));
     d.onclose=()=>d.remove();document.body.append(d);d.showModal();
   }else throw Error('本镜暂无可修订的时间字幕');
 },'quiet'));
 api.editSubtitle=item=>{
   api.video.pause();
   const dialog=el('dialog',null,'report-dialog subtitle-edit-dialog'),form=el('form');
   form.append(el('h2','修订字幕'),el('p',`${api.format(item.start)}–${api.format(item.end)}`,'muted small'));
   const text=input(form,'原文',3),translation=input(form,'中文',3),speaker=input(form,'说话者',1);
   text.value=item.text;translation.value=item.translation||'';speaker.value=item.speaker||'';text.required=true;
   text.maxLength=translation.maxLength=3000;speaker.maxLength=160;
   if(item.originalText!=null)form.append(el('p',`识别稿：${item.originalText}`,'muted small'));
   const actions=el('div',null,'dialog-actions'),message=el('p','','warning');message.hidden=true;
   const saveButton=el('button','保存','primary');saveButton.type='submit';
   async function submit(edit){
     try{saveButton.disabled=true;api.updateSubtitles(await action('save-subtitle',{segmentId:item.id,edit}));dialog.close();}
     catch(error){message.hidden=false;message.textContent=error.message;saveButton.disabled=false;}
   }
   if(item.originalText!=null)actions.append(button('恢复识别稿',()=>submit(null)));
   actions.append(saveButton,button('取消',()=>dialog.close()));form.append(message,actions);dialog.append(form);document.body.append(dialog);
   form.onsubmit=event=>{event.preventDefault();if(text.value.trim())void submit({text:text.value,translation:translation.value,speaker:speaker.value});};
   dialog.onclose=()=>dialog.remove();dialog.showModal();
 };
 const noAudioLabel=el('label',null,'check'),noAudio=el('input');noAudio.type='checkbox';noAudio.id='human-no-audio';noAudioLabel.append(noAudio,el('span','人工确认原片没有音轨'));panel.append(noAudioLabel);const cutEvidence=el('p',null,'muted small');panel.append(cutEvidence);const reviews=el('div',null,'review-checks'),checks={};for(const [kind,label]of Object.entries(REVIEW_LABELS)){const row=el('label',null,'check'),check=el('input');check.type='checkbox';check.id='review-'+kind;row.append(check,el('span',label+'已人工核对'));reviews.append(row);checks[kind]=check;check.onchange=change;}panel.append(reviews);const state=el('p','', 'small muted');state.id='human-save-state';panel.append(state,button('保存人工记录',()=>save(),'primary'));
 const filter=el('select');filter.setAttribute('aria-label','下一待核类别');for(const [kind,label]of Object.entries(REVIEW_LABELS)){const option=el('option',label+'待核');option.value=kind;filter.append(option);}const next=button('下一待核',async()=>{await save();const shots=api.project.shots,start=api.index();if(filter.value==='boundary'){const priority=shots.findIndex((s,i)=>i!==start&&!s.reviewState?.boundary&&s.cut?.priority==='优先回看');if(priority>=0){api.seek(priority);api.setDetail('review');return;}}for(let i=1;i<=shots.length;i++){const index=(start+i)%shots.length;if(!shots[index].reviewState?.[filter.value]){api.seek(index);api.setDetail('review');return;}}state.textContent='本类别已全部核对。';});const nav=el('div',null,'review-next');nav.append(filter,next);panel.append(nav,button('收藏为导演方法',()=>methodDialog(),'quiet'));document.querySelector('.detail-panel').append(panel);
 let draft={},selectedField='frame';function stash(){draft.overrides??={};draft.overrides[selectedField]=override.value;draft.observation=observation.value;draft.noAudio=noAudio.checked;}
 function fieldView(){selectedField=fields.value;suggestion.textContent=api.shot().aiSuggestion?.[selectedField]||api.shot()[selectedField]||'待补';override.value=draft.overrides?.[selectedField]||'';}
 function change(){stash();dirty=true;panel.dataset.dirty='true';state.textContent='尚未保存';state.classList.remove('warning');clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>{state.textContent=e.message;state.classList.add('warning');}),1100);}
 let saving=Promise.resolve();function save(){clearTimeout(timer);if(!dirty)return saving;stash();const shotId=viewShot,human=structuredClone(draft),checked=Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.checked])),version=JSON.stringify([human,checked]);saving=saving.catch(()=>{}).then(async()=>{state.textContent='正在保存…';const project=await action('save-human',{shotId,human,reviews:checked});for(const s of api.project.shots){const update=project.shots.find(x=>x.id===s.id);if(update)Object.assign(s,update);}if(viewShot===shotId&&version===JSON.stringify([draft,Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.checked]))])){dirty=false;panel.dataset.dirty='false';state.textContent='已保存。';api.writeNote(api.shot(),human.observation);api.refresh();}updateCoverage();});return saving;}
 api.flush=save;
 const ask=$('ask-analysis');ask.hidden=false;ask.onclick=()=>{
   const shot=api.shot(),dialog=el('dialog',null,'report-dialog'),heading=el('h2','AI 分析');dialog.append(heading);
   const start=input(dialog,'起点（秒）',1),end=input(dialog,'终点（秒）',1);
   start.type=end.type='number';start.step=end.step='.01';start.min=end.min='0';start.value=shot.start.toFixed(2);end.value=shot.end.toFixed(2);
   const hint=el('p','','muted small');
   const send=(direct)=>{
     const from=start.valueAsNumber,to=end.valueAsNumber;
     if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>api.project.meta.duration+.01){hint.textContent='请填写有效的起止时间。';return;}
     parent.postMessage({type:'guanlan-analysis-context',projectId:api.project.id,shotId:shot.id,start:from,end:to,direct},parentOrigin);dialog.close();
   };
   if(api.project.assistantDirect){
     hint.textContent='设为当前任务后，可以请已连接的助手分析观澜选段。';dialog.append(hint,button('交给助手',()=>send(true),'primary'),button('复制任务',()=>send(false)));
   }else dialog.append(hint,button('复制任务',()=>send(false),'primary'));
   dialog.append(button('关闭',()=>dialog.close()));
   dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
 };
 function render(){const s=api.shot();if(viewShot===s.id)return;if(dirty){save().catch(e=>state.textContent=e.message);}viewShot=s.id;cutEvidence.textContent=s.cut?`切点建议：${s.cut.priority||'待回看'}。依据：${s.cut.reason||'画面变化峰值'}；仍需对照原片确认。`:'切点范围请对照原片回看；人工勾选后才计入已核。';draft=structuredClone(s.human||{observation:'',overrides:{}});observation.value=api.noteFor(s);noAudio.checked=!!draft.noAudio;for(const [k,v]of Object.entries(checks))v.checked=!!s.reviewState?.[k];dirty=false;panel.dataset.dirty='false';fieldView();state.textContent='';}
 fields.onchange=()=>{stash();fieldView();};observation.oninput=change;$('note').addEventListener('input',()=>{observation.value=$('note').value;change();});override.oninput=change;noAudio.onchange=change;panel.addEventListener('focusin',()=>api.video.pause());
 function updateCoverage(){const shots=api.project.shots;const values=Object.entries(REVIEW_LABELS).map(([k,label])=>`${label} ${shots.filter(s=>s.reviewState?.[k]).length}/${shots.length}`);$('coverage').textContent=values.join(' · ');}
 const controls=el('details',null,'cut-tools');controls.append(el('summary','校正镜头'));const tools=el('div',null,'cut-tools-row'),fps=el('select');fps.id='step-fps';fps.setAttribute('aria-label','估算步进帧率');for(const n of [24,25,30,60]){const o=el('option',n+' fps');o.value=n;fps.append(o);}for(const [label,direction]of [['前一帧',-1],['后一帧',1]])tools.append(button(label,()=>{if(api.video.readyState<1)throw Error('请先选择对应原片');api.video.pause();api.video.currentTime=Math.max(api.project.meta.sourceStart,Math.min(api.project.meta.sourceStart+api.project.meta.duration-.01,api.video.currentTime+direction/Number(fps.value)));}));tools.append(fps,button('当前位置切镜',()=>cut('split')),button('与下一镜合并',()=>cut('merge')));controls.append(tools,el('p','帧步进按所选帧率估算。调整只重做受影响镜头；其他记录保留，调整前自动下载备份。','muted small'));panel.append(controls);
 function confirmCut(type,s,time){return new Promise(resolve=>{const d=el('dialog',null,'report-dialog method-dialog'),finish=value=>{d.close();d.remove();resolve(value);};d.append(el('h2',type==='split'?'确认局部切镜':'确认合并镜头'),el('p',type==='split'?`在 ${time.toFixed(3)} 秒切开 ${s.id}。两个新范围需重新分析，其他镜头保留。`:`将 ${s.id} 与下一镜合并。合并后的范围需重新分析，其他镜头保留。`),el('p','调整前会自动下载项目备份，旧记录也保留在调整历史中。','muted small'),button('取消',()=>finish(false)),button(type==='split'?'确认切开':'确认合并',()=>finish(true),'primary'));d.addEventListener('cancel',e=>{e.preventDefault();finish(false);});document.body.append(d);d.showModal();});}
 async function cut(type){await save();if(api.video.readyState<1)throw Error('请先选择对应原片');api.video.pause();const s=api.shot(),time=api.video.currentTime-api.project.meta.sourceStart;if(!await confirmCut(type,s,time))return;state.textContent='正在调整并重抽采样图…';await action('cut',{shotId:s.id,cutType:type,time});}
 function methodDialog(){const s=api.shot(),d=el('dialog',null,'report-dialog method-dialog'),head=el('div',null,'dialog-heading');head.append(el('h2','收藏导演方法'),button('关闭 ×',()=>{d.close();d.remove();}));d.append(head,el('p',`${api.project.title} · ${s.id} · ${s.start.toFixed(2)}—${s.end.toFixed(2)} 秒`,'muted small'));const title=input(d,'方法名称',1),method=input(d,'具体怎样拍',4),when=input(d,'适用条件',3),limits=input(d,'不适用情况与边界',3),tags=input(d,'标签（例如：开场钩子、身份反差）',1);method.value=s.transfer||s.why||'';limits.value=s.limits||'';const row=el('label',null,'check'),check=el('input');check.type='checkbox';check.id='method-reviewed';row.append(check,el('span','我已回看来源并核对方法；未勾选则保存为草稿'));d.append(row);const hint=el('p',null,'small muted');d.append(hint,button('保存到学习库',async()=>{try{await save();const result=await action('save-method',{shotId:s.id,method:{title:title.value.trim(),method:method.value.trim(),when:when.value.trim(),limits:limits.value.trim(),tags:tags.value.trim(),reviewed:check.checked,evidence:observation.value||s.evidence}});hint.textContent=result.message;}catch(e){hint.textContent=e.message;}},'primary'));document.body.append(d);d.showModal();}
 window.addEventListener('guanlan-shot-change',()=>render());updateCoverage();render();
})();
