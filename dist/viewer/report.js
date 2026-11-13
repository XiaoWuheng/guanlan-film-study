(() => {
  'use strict';
  const D=JSON.parse(document.getElementById('study-data').textContent),shots=D.shots,$=id=>document.getElementById(id),video=$('video');
  const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const text=(node,value,fallback='待核 / 待补')=>{node.textContent=value||fallback;return node;};
  const fmt=t=>{const n=Math.round(Math.max(0,Number(t)||0)*100);return `${String(Math.floor(n/6000)).padStart(2,'0')}:${(n%6000/100).toFixed(2).padStart(5,'0')}`;};
  const clockTime=time=>fmt(Math.floor(time)).split('.')[0];
  const offset=D.meta.sourceStart||0,sourceLength=D.meta.sourceDuration,screenplay=D.screenplay,scriptSegments=new Map((screenplay?.segments||[]).map(s=>[s.id,s]));
  let current=0,pending=null,objectURL=null,sourceFile=null,hiddenExplanation=false,tickHandle=null,loopIndex=null,singleIndex=null,view='study',restoring=false;
  const directoryNodes=[],gridNodes=[],timelineNodes=[],alignmentNodes=[],frameGroups=[];
  const key=`guanlan-study:${D.id}`;let notes={},storageOk=true;
  function noteKey(s){return `${s.id}@${s.start.toFixed(4)}-${s.end.toFixed(4)}`;}
  function noteFor(shot){const note=notes[noteKey(shot)];return note?.text??(shot.human?.notesMigrated?shot.human.observation:note)??shot.human?.observation??'';}
  function writeNote(shot,value){notes[noteKey(shot)]={text:value};persist();}
  try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))notes=saved;}catch{storageOk=false;}
  const workspaceKey='guanlan-viewer-layout',rangeKey=key+':ranges';
  let settings={},rangeNotes=[];
  try{settings=JSON.parse(localStorage.getItem(workspaceKey)||'{}')||{};rangeNotes=JSON.parse(localStorage.getItem(rangeKey)||JSON.stringify(D.rangeNotes||[]));if(!Array.isArray(rangeNotes))rangeNotes=[];}catch{}
  rangeNotes=rangeNotes.filter(item=>item&&typeof item.id==='string'&&typeof item.text==='string'&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.start>=0&&item.end>item.start&&item.end<=D.meta.duration);
  function saveLayout(values){Object.assign(settings,values);try{localStorage.setItem(workspaceKey,JSON.stringify(settings));}catch{}}
  function storageWarning(){if(!storageOk){$('storage-warning').hidden=false;text($('storage-warning'),'当前浏览器不能保存笔记，请在关闭前备份。');}}
  function persist(){try{localStorage.setItem(key,JSON.stringify(notes));text($('note-state'),'已保存在当前浏览器，备份后可换设备。');}catch{storageOk=false;storageWarning();text($('note-state'),'仅本页暂存，请在关闭前备份。');}renderNoteTrack();}
  storageWarning();text($('title'),D.title);document.title=D.title+' · 观澜拉片学习';text($('scope'),`${fmt(offset)}–${fmt(offset+D.meta.duration)} · ${shots.length} 镜`);text($('origin'),[D.meta.origin,D.meta.coverage,D.meta.durationPrecision].filter(Boolean).join('\n'),'');text($('shot-count'),String(shots.length));
  text($('coverage'),`${shots.filter(s=>s.boundaryVerified).length}/${shots.length} 镜切点已核 · ${shots.filter(s=>s.audioStatus==='已听核'||s.audioStatus==='无音轨').length}/${shots.length} 镜声音已核或无音轨`);
  function field(parent,label,value,cls='field'){const box=el('div',cls);box.append(el('strong','',label),el('span','',value||'待核'));parent.append(box);return box;}
  function disclosure(parent,label,build){const d=el('details','secondary-details');d.append(el('summary','',label));const c=el('div','secondary-body');build(c);d.append(c);parent.append(d);return d;}
  function setView(name){view=name;document.querySelectorAll('[data-tab]').forEach(n=>{const selected=n.dataset.tab===name;n.classList.toggle('active',selected);n.setAttribute('aria-selected',String(selected));});$('tab-study').hidden=name!=='study';$('tab-structure').hidden=name!=='structure';$('catalog-toggle').hidden=name!=='study';$('directory-open').hidden=name!=='study';if(name==='structure')video.pause();if(!restoring)savePosition();}
  function setDetail(name){
    const tabs=[...document.querySelectorAll('[data-detail]')];
    if(!tabs.some(tab=>tab.dataset.detail===name&&!tab.hidden))name='explain';
    for(const tab of tabs){
      const key=tab.dataset.detail,panel=$('detail-'+key),selected=key===name;
      tab.id||='tab-detail-'+key;
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      tab.classList.toggle('active',selected);
      panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
      panel.hidden=!selected;
    }
    if(!restoring)savePosition();
  }
  $('review-tab').hidden=window.parent===window||D.demo;
  document.querySelector('.insight-tabs').onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...event.currentTarget.querySelectorAll('button:not([hidden])')];
    const currentTab=tabs.indexOf(event.target);
    if(currentTab<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(currentTab+tabs.length+(event.key==='ArrowRight'?1:-1))%tabs.length;
    tabs[next].click();tabs[next].focus();
  };
  function setPane(name){
    if(!['catalog','player','analysis'].includes(name))return;
    $('tab-study').dataset.pane=name;
    document.querySelectorAll('[data-pane-open]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.paneOpen===name)));
  }
  for(const button of document.querySelectorAll('[data-pane-open]'))button.onclick=()=>{setPane(button.dataset.paneOpen);savePosition();};
  function refs(parent,ids=[]){if(!ids?.length)return;const wrap=el('div','shot-links');for(const id of ids){const i=shots.findIndex(s=>s.id===id);if(i<0)continue;const b=el('button','',id);b.addEventListener('click',()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());setView('study');seek(i);});wrap.append(b);}parent.append(wrap);}
  function currentScript(){const box=$('detail-script');box.replaceChildren();const linked=(screenplay?.alignments||[]).filter(a=>(a.shotIds||[]).includes(shots[current].id));if(!screenplay){box.append(el('p','empty','本片尚未接入剧本。未提供独立剧本时，可识别片中字幕作为字幕剧本。'));return;}box.append(el('p','source-tag',screenplay.sourceType==='burned-subtitles'?'字幕剧本 · 识别原文，需回看':'独立剧本 · 对应版本需核对'));if(!linked.length)box.append(el('p','empty','当前镜头尚未建立剧本关联。'));for(const a of linked){const c=el('article','current-script');c.append(el('h3','',a.title||'文字如何转成画面'));for(const id of a.segmentIds||[]){const s=scriptSegments.get(id);if(!s)continue;const quote=el('blockquote','script-quote');quote.append(el('small','',s.locator||s.id),el('p','',s.text));if(s.translation)quote.append(el('p','translation',s.translation));c.append(quote);}field(c,'文字如何落成画面',a.reason||a.scriptIntent);disclosure(c,'对应依据与借用方法',n=>{field(n,'画面依据',a.filmEvidence);field(n,'戏剧任务',a.scriptIntent);field(n,screenplay.sourceType==='burned-subtitles'?'视听实现':'文字与成片的变化',[(a.differenceTypes||[]).join(' / '),a.difference].filter(Boolean).join('\n'));field(n,'可以怎样借用',a.lesson);field(n,'对应状态',a.status);field(n,'核验与局限',a.verification);});box.append(c);}const b=el('button','quiet full-script-button','查看完整剧本与对照');b.onclick=()=>$('script-dialog').showModal();box.append(b);}
  function shotField(parent,key,label,value,cls){
    const node=field(parent,label,value,cls);node.dataset.shotField=key;node.hidden=visibleFields[key]===false;return node;
  }
  function shotTime(shot){return `${fmt(shot.start)}–${fmt(shot.end)} · ${shot.duration.toFixed(2)} 秒`;}
  function shotDialogue(shot){
    return subtitles.filter(item=>item.start<shot.end&&item.end>shot.start)
      .map(item=>[item.speaker?`${item.speaker} · ${item.text}`:item.text,item.translation].filter(Boolean).join('\n')).join('\n\n');
  }
  const detailFields=[
    ['size','景别','size'],['angle','机位','angle'],['camera','运镜','camera'],
    ['sceneContext','场景','sceneContext'],['cast','人物外观','cast'],['performance','表演与调度','performance'],
    ['subjectMotion','主体动作','subjectMotion'],['props','道具','props'],['lighting','光影与构图','lighting']
  ];
  function detail(index){
    const shot=shots[index];
    $('detail-id').parentElement.hidden=!visibleFields.id;
    text($('detail-id'),`镜头 ${index+1}`);$('detail-id').title=shot.id;
    text($('detail-time'),shotTime(shot));updateDetailTitle(shot);
    const facts=$('detail-facts');facts.replaceChildren();
    shotField(facts,'frame','画面',shot.frame);
    if(shot.size)shotField(facts,'size','景别',shot.size);
    const explanation=$('explanation');explanation.replaceChildren();
    shotField(explanation,'why','为什么这样拍',shot.why,'field why-box');
    if(shot.viewerChange&&shot.viewerChange!==shot.rhythm)shotField(explanation,'rhythm','观看变化',shot.viewerChange);
    disclosure(explanation,'镜头细节',panel=>{
      if(shot.evidence&&shot.evidence!==shot.frame)shotField(panel,'frame','可见证据',shot.evidence);
      for(const [key,label,property] of detailFields)if(key!=='size'&&shot[property])shotField(panel,key,label,shot[property]);
      const cast=Array.isArray(shot.people)?shot.people:[];
      for(const person of cast)shotField(panel,'performance',person.name,[person.look,person.face,person.action].filter(Boolean).join('\n'));
      const dialogue=shotDialogue(shot);
      if(dialogue)shotField(panel,'dialogue','对白 / 旁白',dialogue);
      if(shot.onscreenText)shotField(panel,'dialogue','画内文字',shot.onscreenText);
      field(panel,`声音 · ${shot.audioStatus||'待核'}`,shot.audio);
      if(shot.motionEvidence)field(panel,'动态依据',shot.motionEvidence);
      field(panel,'核验',`${shot.boundaryVerified?'切点已回看':'候选切点'} · ${shot.motionStatus||'动态待核'}`);
    });
    disclosure(explanation,'借用与替代',panel=>{
      field(panel,'怎样借用',shot.transfer);field(panel,'替代拍法',shot.alternative);field(panel,'适用条件',shot.limits);
    });
    explanation.hidden=hiddenExplanation;
    $('note').value=noteFor(shot);
    text($('note-state'),storageOk?'笔记已在本机保存。':'当前笔记仅在本页暂存。');
    refreshFavorite();currentScript();window.dispatchEvent(new Event('guanlan-shot-change'));
  }
  function updateDetailTitle(shot=shots[current]){text($('detail-title'),visibleFields.rhythm?shot.rhythm:'本镜','本镜');}
  const favorites=new Set(D.shotFavorites||[]);
  function refreshFavorite(){const saved=favorites.has(shots[current].id);$('favorite-shot').setAttribute('aria-pressed',String(saved));$('favorite-shot').textContent=saved?'★':'☆';}
  $('favorite-shot').hidden=window.parent===window||D.demo;
  $('favorite-shot').onclick=()=>parent.postMessage({type:'guanlan-favorite',projectId:D.id,shotId:shots[current].id},new URL(document.baseURI).origin);
  function setFavorite(id,saved){if(saved)favorites.add(id);else favorites.delete(id);refreshFavorite();}
  $('note').addEventListener('input',()=>writeNote(shots[current],$('note').value));$('toggle-explanation').onclick=()=>{hiddenExplanation=!hiddenExplanation;$('explanation').hidden=hiddenExplanation;$('toggle-explanation').setAttribute('aria-pressed',String(hiddenExplanation));text($('toggle-explanation'),hiddenExplanation?'看讲解':'先自判');};
  function shotCard(s,i,grid=false){const b=el('button','shot-card shot-item');b.dataset.shot=s.id;b.setAttribute('aria-label',`跳转 ${s.id}，${s.duration.toFixed(2)}秒，${s.frame||'画面待补'}`);const src=s.images?.[1]||s.images?.[0];if(src){const img=el('img','shot-thumb');img.src=src;img.alt='';img.loading='lazy';b.append(img);}else b.append(el('span','shot-thumb shot-placeholder',s.id));const info=el('div','shot-card-info shot-meta'),meta=el('div','shot-card-meta');meta.append(el('strong','shot-number mono','镜 '+String(i+1).padStart(2,'0')),el('span','shot-duration mono',s.duration.toFixed(2)+'s'));info.append(meta,el('p','shot-card-title shot-summary',s.frame||'画面待补'),el('small','shot-size',s.size||'景别待核'));b.append(info);b.onclick=()=>{if(grid)$('directory-dialog').close();setView('study');seek(i);};return b;}
  function renderDirectory(){const query=$('search').value.trim().toLocaleLowerCase(),rhythm=$('rhythm-filter').value,box=$('shot-list');box.replaceChildren();directoryNodes.length=0;shots.forEach((s,i)=>{if(rhythm&&s.rhythm!==rhythm)return;if(query&&![s.id,s.frame,s.evidence,s.size,s.camera,s.why,s.onscreenText,s.rhythm].join(' ').toLocaleLowerCase().includes(query))return;const b=shotCard(s,i);box.append(b);directoryNodes.push(b);});$('no-results').hidden=directoryNodes.length>0;markCurrent(false);}
  for(const r of [...new Set(shots.map(s=>s.rhythm).filter(Boolean))]){const o=el('option','',r);o.value=r;$('rhythm-filter').append(o);}$('search').oninput=renderDirectory;$('rhythm-filter').onchange=renderDirectory;
  shots.forEach((shot,index)=>{
    const number=index+1,button=segmentButton(shot,''),image=shot.images?.[1]||shot.images?.[0];
    button.append(el('span','track-number mono',number));
    button.setAttribute('aria-label',`镜头 ${number} · ${shotTime(shot)}`);
    placeTrack(button,shot.start,shot.end);previewOn(button,shot,`镜头 ${number}`,shot.frame,image);
    $('timeline').append(button);timelineNodes.push(button);
    const card=shotCard(shot,index,true);$('directory-grid').append(card);gridNodes.push(card);
  });
  function markCurrent(follow){for(const list of [directoryNodes,gridNodes])for(const n of list){const active=n.dataset.shot===shots[current].id;n.classList.toggle('current',active);n.setAttribute('aria-current',String(active));}timelineNodes.forEach((n,i)=>{n.classList.toggle('current',i===current);n.setAttribute('aria-current',String(i===current));});alignmentNodes.forEach(({node,shotIds})=>node.classList.toggle('current',shotIds.includes(shots[current].id)));if(follow&&$('follow').checked&&view==='study'){const node=directoryNodes.find(n=>n.dataset.shot===shots[current].id);if(node){const container=$('shot-list'),r=node.getBoundingClientRect(),box=container.getBoundingClientRect();if(container.scrollWidth>container.clientWidth+2){if(r.left<box.left||r.right>box.right)container.scrollLeft+=r.left-box.left-(box.width-r.width)/2;}else if(r.top<box.top||r.bottom>box.bottom)container.scrollTop+=r.top-box.top-(box.height-r.height)/2;}}}
  function setCurrent(index,follow=true){
    if(index<0||index>=shots.length)return;
    const changed=current!==index,previousFrame=frameGroups[current];
    current=index;
    $('previous').disabled=index===0;$('next').disabled=index===shots.length-1;markCurrent(follow);
    if(changed){previousFrame?.classList.remove('current');detail(index);}
    const frames=frameGroups[index];
    if(frames){
      frames.classList.add('current');
      if(changed&&follow&&$('follow').checked&&!$('filmstrip').hidden&&!$('track-content').hidden){
        const strip=$('keyframes'),box=strip.getBoundingClientRect(),card=frames.getBoundingClientRect();
        if(card.left<box.left||card.right>box.right)strip.scrollLeft+=card.left-box.left;
      }
    }
  }
  function activeIndex(time){let lo=0,hi=shots.length-1;while(lo<hi){const m=Math.floor((lo+hi+1)/2);if(shots[m].start<=time+.001)lo=m;else hi=m-1;}return lo;}
  function applySeek(){if(pending!==null&&video.readyState>=1){video.currentTime=pending;pending=null;}}
  function seek(index){if(index>=0&&index<shots.length)seekTime(shots[index].start);}
  function seekTime(time){
    const local=Math.max(0,Math.min(D.meta.duration, time));
    const index=activeIndex(local);
    if(singleIndex!==null)singleIndex=index;
    setCurrent(index);
    if($('loop').checked)loopIndex=index;
    pending=offset+local;syncPosition(local);applySeek();
  }
  function warning(message){$('video-warning').hidden=!message;if(message)text($('video-warning'),message);}
  function stopTick(){if(tickHandle!==null){if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(tickHandle);else cancelAnimationFrame(tickHandle);tickHandle=null;}}
  function frame(){
    const local=video.currentTime-offset;
    if(!video.paused&&$('loop').checked&&loopIndex!==null){const shot=shots[loopIndex];if(local>=shot.end-.015||local<shot.start-.05){video.currentTime=offset+shot.start;return;}}
    if(!video.paused&&singleIndex!==null&&!$('loop').checked){
      const index=singleIndex,shot=shots[index];
      if(local>=shot.end-.02){singleIndex=null;video.pause();video.currentTime=offset+Math.max(shot.start,shot.end-.035);setCurrent(index);return;}
    }
    if(!video.paused&&local>=D.meta.duration){video.pause();setCurrent(shots.length-1);syncPosition(D.meta.duration);finishPlayback();return;}
    if(pending===null){setCurrent(activeIndex(Math.max(0,local)));syncPosition(local);}
  }
  function tick(){stopTick();if(video.paused)return;if(video.requestVideoFrameCallback)tickHandle=video.requestVideoFrameCallback(()=>{tickHandle=null;frame();tick();});else tickHandle=requestAnimationFrame(()=>{tickHandle=null;frame();tick();});}
  function play(){
    if(!video.getAttribute('src')){warning('请先选择对应原片。');return;}
    if(singleIndex===null&&position()>=D.meta.duration-.001)seek(loopIndex??0);
    applySeek();video.play().catch(error=>{if(error.name!=='AbortError')warning('暂时无法播放，请点击播放重试。');});
  }
  function togglePlayback(){
    if(video.paused){singleIndex=null;play();}else video.pause();
  }
  const screen=$('screen'),playerPosition=$('player-position'),playerPlay=$('player-play');
  const playerSettings=$('playback-settings'),settingsToggle=$('settings-toggle'),fullscreen=$('fullscreen');
  function setPlayerSettings(open){
    playerSettings.hidden=!open;
    settingsToggle.setAttribute('aria-expanded',String(open));
    if(open)playerSettings.scrollTop=0;
  }
  settingsToggle.onclick=()=>setPlayerSettings(playerSettings.hidden);
  document.addEventListener('click',event=>{
    if(!playerSettings.hidden&&!playerSettings.contains(event.target)&&!settingsToggle.contains(event.target))setPlayerSettings(false);
  });
  document.addEventListener('focusin',event=>{
    if(!playerSettings.hidden&&!playerSettings.contains(event.target)&&!settingsToggle.contains(event.target))setPlayerSettings(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(!playerSettings.hidden){event.preventDefault();setPlayerSettings(false);settingsToggle.focus();}
    else if(screen.classList.contains('player-expanded')){event.preventDefault();expandPlayer(false);fullscreen.focus();}
  });
  playerPosition.max=String(D.meta.duration);
  playerPosition.oninput=()=>seekTime(playerPosition.valueAsNumber);
  text($('player-duration'),clockTime(D.meta.duration));
  playerPlay.onclick=video.onclick=togglePlayback;
  function setPlayLabel(){
    const label=video.paused?'播放':'暂停';
    playerPlay.dataset.playing=String(!video.paused);
    playerPlay.setAttribute('aria-label',label);playerPlay.title=label;
  }
  $('previous').onclick=()=>seek(Math.max(0,current-1));$('next').onclick=()=>seek(Math.min(shots.length-1,current+1));
  $('play-shot').onclick=()=>{setPane('player');seek(current);singleIndex=current;play();};
  $('loop').onchange=()=>{
    loopIndex=$('loop').checked?current:null;
    if(loopIndex!==null)singleIndex=null;
  };
  $('auto-next').onchange=()=>saveLayout({autoNext:$('auto-next').checked});
  $('auto-next').checked=Boolean(settings.autoNext);
  $('speed').value=String(settings.speed||1);$('volume').value=String(settings.volume??1);
  function applyPlayback(){
    video.playbackRate=$('speed').valueAsNumber;
    video.volume=$('volume').valueAsNumber;
    text($('speed-value'),String(video.playbackRate)+(Number.isInteger(video.playbackRate)?'.0':'')+'×');
    text($('volume-value'),Math.round(video.volume*100)+'%');
    for(const id of ['volume','speed']){const input=$(id);input.style.setProperty('--fill',100*(input.valueAsNumber-Number(input.min))/(Number(input.max)-Number(input.min))+'%');}
  }
  applyPlayback();
  $('speed').oninput=$('volume').oninput=()=>{applyPlayback();saveLayout({speed:video.playbackRate,volume:video.volume});};
  function refreshFullscreen(){
    const active=document.fullscreenElement===screen||screen.classList.contains('player-expanded');
    fullscreen.setAttribute('aria-label',active?'退出全屏':'全屏播放');
    fullscreen.title=active?'退出全屏':'全屏播放';
    setPlayerSettings(false);
  }
  function expandPlayer(expanded){
    screen.classList.toggle('player-expanded',expanded);
    for(const node of [document.querySelector('.report-topbar'),...$('tab-study').children]){
      if(node!==screen.parentElement)node.inert=expanded;
    }
    if(window.parent!==window)parent.postMessage({type:'guanlan-player-expanded',projectId:D.id,expanded},new URL(document.baseURI).origin);
    refreshFullscreen();
  }
  fullscreen.onclick=async()=>{
    if(screen.classList.contains('player-expanded')){expandPlayer(false);return;}
    if(document.fullscreenElement===screen){await document.exitFullscreen();return;}
    if(document.fullscreenEnabled&&screen.requestFullscreen){
      try{await screen.requestFullscreen();return;}catch{}
    }
    expandPlayer(true);
  };
  document.addEventListener('fullscreenchange',refreshFullscreen);
  video.addEventListener('timeupdate',frame);video.addEventListener('seeked',frame);
  video.addEventListener('play',()=>{setPlayLabel();if(video.currentTime<offset||video.currentTime>=offset+D.meta.duration)video.currentTime=offset;tick();});
  video.addEventListener('pause',()=>{setPlayLabel();stopTick();if(!video.ended)singleIndex=null;});
  let advanced=false;
  video.addEventListener('play',()=>{advanced=false;});
  function finishPlayback(){if(!advanced&&$('auto-next').checked&&nextEpisode){advanced=true;openEpisode(nextEpisode,undefined,true);}}
  video.addEventListener('ended',()=>{
    setPlayLabel();stopTick();
    if(loopIndex!==null){seek(loopIndex);play();}
    else if(singleIndex!==null)singleIndex=null;
    else finishPlayback();
  });
  function setMediaReady(ready){
    playerPosition.disabled=playerPlay.disabled=!ready;
    $('video-empty').hidden=ready;
  }
  video.addEventListener('loadedmetadata',()=>{
    if(Number.isFinite(video.duration)&&Math.abs(video.duration-sourceLength)>.6){
      video.removeAttribute('src');sourceFile=null;video.load();setMediaReady(false);
      warning(`原片时长为 ${sourceLength.toFixed(2)} 秒，所选视频时长不符。`);return;
    }
    applySeek();setMediaReady(true);warning('');applyPlayback();
  });
  video.addEventListener('error',()=>{warning('原片暂时无法播放，请选择对应文件。');setMediaReady(false);});
  function openSource(src,file=null,owned=false){
    video.pause();singleIndex=null;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=owned?src:null;
    sourceFile=file;pending=offset+position();playerPosition.disabled=playerPlay.disabled=true;video.src=src;video.load();
  }
  $('video-empty').onclick=$('replace-video').onclick=()=>$('video-file').click();
  $('video-empty').title=$('replace-video').title=D.meta.sourceName||'选择对应原片';
  $('video-file').onchange=e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(D.meta.sourceSize&&file.size!==D.meta.sourceSize){warning(`文件大小与记录不符，请选择 ${D.meta.sourceName||'对应原片'}。`);e.target.value='';return;}
    setPlayerSettings(false);
    openSource(URL.createObjectURL(file),file,true);
  };
  if(window.parent===window&&['http:','https:'].includes(location.protocol)&&['127.0.0.1','localhost'].includes(location.hostname)){fetch('/source-media',{method:'HEAD'}).then(r=>{if(r.ok&&r.headers.get('content-type')?.startsWith('video/')&&!video.getAttribute('src')){pending=offset;video.src='/source-media';}}).catch(()=>{});}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setView(b.dataset.tab));document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>setDetail(b.dataset.detail));document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-chapter]').forEach(n=>{const selected=n===b;n.classList.toggle('active',selected);n.setAttribute('aria-selected',String(selected));});document.querySelectorAll('.chapter-panel').forEach(n=>n.hidden=n.id!=='chapter-'+b.dataset.chapter);});
  function cards(parent,items,build){if(!items?.length){parent.append(el('p','empty','这部分尚未补充分析。'));return;}items.forEach((x,i)=>{const c=el('article','lesson-card');if(x.title)c.append(el('h3','',x.title));build(c,x,i);refs(c,x.shotIds);parent.append(c);});}
  text($('overview'),D.lessons?.overview);text($('editing'),D.lessons?.editing);text($('sound'),D.lessons?.sound);const hook=D.lessons?.hook||{};for(const [label,value]of [['观众在等什么',hook.question],['具体依据',hook.evidence],['怎样兑现，或继续延迟',hook.payoff]])field($('hook'),label,value);if(hook.limits)disclosure($('hook'),'判断范围',n=>field(n,'局限',hook.limits));refs($('hook'),hook.shotIds);
  cards($('groups'),D.lessons?.groups,(c,x)=>{field(c,'镜头怎样组合',x.evidence);field(c,'为什么这样组合',x.reason);disclosure(c,'替代选择与借用条件',n=>{field(n,'换一种组织方式',x.alternative);field(n,'可以怎样借用',x.transfer);field(n,'条件与局限',x.limits);});});
  if(!D.lessons?.beats?.length)$('beats').append(el('p','empty','情绪与叙事节拍尚待补充。'));for(const x of D.lessons?.beats||[]){const b=el('article','beat');b.append(el('span','mono small',`${fmt(x.start)}—${fmt(x.end)}`),el('h3','',x.title));if(Number.isFinite(x.intensity)){const bar=el('div','bar');bar.style.width=String(Math.max(0,Math.min(5,x.intensity))/5*100)+'%';b.append(bar,el('small','',`推测投入 ${x.intensity}/5 · ${x.valence||'方向未标'}`));}field(b,'发生的变化',x.observation);field(b,'观看效果',x.effect);refs(b,x.shotIds);$('beats').append(b);}
  cards($('takeaways'),D.lessons?.takeaways,(c,x)=>{field(c,'可借用的方法',x.method);field(c,'怎样改成自己的拍法',x.how);disclosure(c,'适用条件',n=>{field(n,'什么戏里适用',x.when);field(n,'何时不适用',x.limits);});});cards($('exercises'),D.lessons?.exercises,(c,x,i)=>{c.classList.add('exercise');c.prepend(el('span','eyebrow',`练习 ${i+1}`));c.append(el('p','',x.question));disclosure(c,'想过之后，再看提示',n=>n.append(el('p','',x.hint||'回看相关镜头，用具体变化支持你的判断。')));});
  function renderScript(){if(!screenplay){text($('script-meta'),'本次尚未接入剧本文本。');text($('script-coverage'),'无可展示的对照记录。');$('script-originals').hidden=true;return;}text($('script-meta'),`${screenplay.title} · ${screenplay.version||'版本待核'} · ${screenplay.relation||''}\n${screenplay.scope||''}${screenplay.origin?'\n'+screenplay.origin:''}${screenplay.recognitionStatus?'\n'+screenplay.recognitionStatus:''}`);const linked=new Set((screenplay.alignments||[]).flatMap(a=>a.shotIds||[]));text($('script-coverage'),`${screenplay.segments.length} 段原文 · ${linked.size}/${shots.length} 镜有关联，不代表全部已核验`);for(const a of screenplay.alignments||[]){const c=el('details','script-alignment alignment-card');c.append(el('summary','',`${a.title||a.id} · ${a.status||'待核'}`));const body=el('div','secondary-body');for(const id of a.segmentIds||[]){const s=scriptSegments.get(id);if(s){const q=el('blockquote','script-quote');q.append(el('small','',`${id} · ${s.locator||''}`),el('p','',s.text));if(s.translation)q.append(el('p','translation',s.translation));body.append(q);}}for(const [label,value]of [['文字的戏剧任务',a.scriptIntent],['成片依据',a.filmEvidence],['文字的视听实现',[(a.differenceTypes||[]).join(' / '),a.difference].filter(Boolean).join('\n')],['为什么这样处理',a.reason],['可以怎样借用',a.lesson],['对应核验与局限',a.verification]])field(body,label,value);refs(body,a.shotIds);c.append(body);$('script-alignments').append(c);alignmentNodes.push({node:c,shotIds:a.shotIds||[]});}for(const s of screenplay.segments){const q=el('blockquote','script-quote');q.append(el('small','',`${s.id} · ${s.locator||''}`),el('p','',s.text));$('script-segments').append(q);}}
  renderScript();$('directory-open').onclick=()=>$('directory-dialog').showModal();$('directory-close').onclick=()=>$('directory-dialog').close();$('script-close').onclick=()=>$('script-dialog').close();$('evidence-close').onclick=()=>$('evidence-dialog').close();$('close-image').onclick=()=>$('image-dialog').close();$('evidence-open').onclick=()=>{const s=shots[current];text($('evidence-title'),`${s.id} · 首 / 中 / 尾`);const box=$('evidence-frames');box.replaceChildren();(s.images||[]).forEach((src,i)=>{if(!src)return;const b=el('button','evidence-frame'),img=el('img');img.src=src;img.alt=`${s.id} ${['起段','中段','末段'][i]}画面`;b.append(img,el('span','',['起段','中段','末段'][i]));b.onclick=()=>{$('large-image').src=src;$('image-dialog').showModal();};box.append(b);});if(!box.children.length)box.append(el('p','empty','本镜尚无关键帧。'));const fields=$('evidence-fields');fields.replaceChildren();field(fields,'静帧序列的范围',s.motionEvidence||s.motionStatus);field(fields,'切点',s.boundary||'候选切点');$('evidence-dialog').showModal();};
  function screenplayText(){if(!screenplay)return '';let md=`\n## 剧本与成片对照\n\n${screenplay.title}｜${screenplay.version||''}｜${screenplay.relation||''}\n\n${screenplay.scope||''}\n`;for(const a of screenplay.alignments||[]){md+=`\n### ${a.id} · ${a.status} · ${(a.shotIds||[]).join(' / ')}\n`;for(const id of a.segmentIds||[]){const s=scriptSegments.get(id);if(s)md+=`\n${s.id}｜${s.locator||''}\n\n${s.text}\n`;}for(const [label,value]of [['戏剧任务',a.scriptIntent],['成片依据',a.filmEvidence],['差异',a.difference],['拍法解释',a.reason],['借用',a.lesson],['核验与局限',a.verification]])md+=`\n${label}：${value||'待核 / 待补'}\n`;}md+='\n### 原文索引\n';for(const s of screenplay.segments)md+=`\n#### ${s.id}｜${s.locator||''}\n\n${s.text}\n`;return md;}
  function download(name,content,type){const u=URL.createObjectURL(new Blob([content],{type})),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}
  $('export-json').onclick=()=>download('观澜笔记.json',JSON.stringify({type:'guanlan-study-notes',version:2,studyId:D.id,title:D.title,notes:Object.fromEntries(shots.map(shot=>[noteKey(shot),noteFor(shot)]).filter(([,note])=>note.trim())),rangeNotes},null,2),'application/json');
  $('export-md').onclick=()=>{let md=`# ${D.title} · 我的拉片学习\n\n${D.lessons?.overview||''}\n`;for(const s of shots){md+=`\n## ${s.id} · ${fmt(s.start)}—${fmt(s.end)} · ${s.duration.toFixed(2)}秒\n`;for(const [label,value]of [['景别',s.size],['运镜',s.camera],['画面',s.frame],['可见证据',s.evidence],['表演与调度',s.performance],['光影',s.lighting],['机位',s.angle],['主体动作',s.subjectMotion],['画内文字',s.onscreenText],['声音状态',s.audioStatus],['声音依据',s.audio],['节奏作用',s.rhythm],['观看变化',s.viewerChange],['为什么这样拍',s.why],['替代拍法',s.alternative],['借用',s.transfer],['局限',s.limits],['我的笔记',noteFor(s)||'（尚未记录）']])md+=`\n${label}：${value||'待核 / 待补'}\n`;}md+=`\n## 开场钩子\n\n${hook.question||'待补'}\n\n${hook.evidence||''}\n\n${hook.payoff||''}\n\n${hook.limits||''}\n`;for(const x of D.lessons?.beats||[])md+=`\n### 节拍：${x.title} · ${fmt(x.start)}—${fmt(x.end)}\n\n${x.observation||''}\n\n${x.effect||''}\n`;md+=`\n## 剪辑与声音\n\n${D.lessons?.editing||'待补'}\n\n${D.lessons?.sound||'待补'}\n`;for(const x of D.lessons?.groups||[])md+=`\n### ${x.title}\n\n${x.evidence||''}\n\n${x.reason||''}\n\n${x.alternative||''}\n\n${x.transfer||''}\n\n${x.limits||''}\n`;for(const x of D.lessons?.takeaways||[])md+=`\n### 借用：${x.title}\n\n${x.method||''}\n\n${x.when||''}\n\n${x.how||''}\n\n${x.limits||''}\n`;for(const x of D.lessons?.exercises||[])md+=`\n### 练习：${x.title}\n\n${x.question||''}\n\n提示：${x.hint||''}\n`;if(rangeNotes.length){md+='\n## 片段笔记\n';for(const note of rangeNotes)md+=`\n### ${fmt(note.start)}–${fmt(note.end)}\n\n${note.text}\n`;}md+=screenplayText();download('拉片学习笔记.md',md,'text/markdown;charset=utf-8');};
  $('notes-file').onchange=async event=>{
    const input=event.target,file=input.files?.[0];
    if(!file)return;
    try{
      if(file.size>32e6)throw Error('笔记文件过大');
      const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
      if(data.type!=='guanlan-study-notes'||data.studyId!==D.id||![1,2].includes(data.version))throw Error('这份笔记不属于当前项目');
      if(!data.notes||typeof data.notes!=='object'||Array.isArray(data.notes))throw Error('笔记格式无效');
      const incoming=data.rangeNotes||[];
      const imagePattern=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
      if(!Array.isArray(incoming)||incoming.some(item=>!item||typeof item.id!=='string'||typeof item.text!=='string'||!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<=item.start||item.end>D.meta.duration+.01||['image','baseImage'].some(key=>item[key]!=null&&(typeof item[key]!=='string'||item[key].length>600000||!imagePattern.test(item[key])))))throw Error('片段笔记格式无效');
      let count=0;
      for(const shot of shots){const key=noteKey(shot);if(typeof data.notes[key]==='string'){notes[key]={text:data.notes[key].slice(0,16000)};count++;}}
      const merged=[...new Map([...rangeNotes,...incoming].map(item=>[item.id,item])).values()].sort((a,b)=>a.start-b.start);
      localStorage.setItem(rangeKey,JSON.stringify(merged));rangeNotes=merged;
      persist();renderRangeList();detail(current);warning('已恢复 '+count+' 条逐镜笔记、'+incoming.length+' 条片段笔记。');
    }catch(error){warning('恢复失败：'+error.message);}finally{input.value='';}
  };
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,summary,video')||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='a'){e.preventDefault();setView('study');seek(Math.max(0,current-1));}if(e.key.toLowerCase()==='d'){e.preventDefault();setView('study');seek(Math.min(shots.length-1,current+1));}if(e.code==='Space'){e.preventDefault();togglePlayback();}});
  window.addEventListener('pagehide',stopTick);window.addEventListener('pageshow',()=>{if(!video.paused)tick();});const scenes=(D.lessons?.beats||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start);
  const subtitles=(screenplay?.segments||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start);
  let transcriptRows=[],sceneRows=[],sceneTrackRows=[],subtitleTrackRows=[],activeSubtitle=null;
  function updateSubtitles(segments){
    if(!screenplay)return;
    screenplay.segments=segments;
    scriptSegments.clear();for(const item of segments)scriptSegments.set(item.id,item);
    subtitles.splice(0,subtitles.length,...segments.filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start));
    refreshCaptionControls();
    subtitleTrackRows=renderTrack(subtitles,'subtitle-track','暂无字幕');
    $('script-alignments').replaceChildren();$('script-segments').replaceChildren();alignmentNodes.length=0;renderScript();
    activeSubtitle=null;renderTranscript();detail(current);syncPosition(position());
  }
  function placeTrack(node,start,end){
    node.style.left=100*start/D.meta.duration+'%';
    node.style.width=100*(end-start)/D.meta.duration+'%';
  }
  function segmentButton(segment,label,seekAt=segment.start){
    const b=el('button','',label);
    b.title=fmt(segment.start)+'–'+fmt(segment.end)+' · '+label;
    b.onclick=()=>seekTime(seekAt);
    return b;
  }
  function previewOn(button,segment,label,description,image){
    button.removeAttribute('title');
    const show=()=>{
      const preview=$('track-preview');
      preview.replaceChildren();
      if(image){const thumb=el('img');thumb.src=image;thumb.alt='';preview.append(thumb);}
      const copy=el('div');copy.append(el('strong','',label),el('small','mono',fmt(segment.start)+'–'+fmt(segment.end)+' · '+(segment.end-segment.start).toFixed(2)+'秒'));
      if(description)copy.append(el('p','',description));
      if(segment.translation)copy.append(el('p','translation',segment.translation));
      preview.append(copy);preview.hidden=false;
      const anchor=button.getBoundingClientRect(),bounds=preview.getBoundingClientRect();
      preview.style.left=Math.max(8,Math.min(anchor.left+(anchor.width-bounds.width)/2,innerWidth-bounds.width-8))+'px';
      const above=anchor.top-bounds.height-8;
      preview.style.top=Math.max(8,above>=8?above:Math.min(anchor.bottom+8,innerHeight-bounds.height-8))+'px';
    };
    const hide=()=>$('track-preview').hidden=true;
    button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')show();});
    button.addEventListener('pointerleave',hide);
    button.addEventListener('focus',show);
    button.addEventListener('blur',hide);
    button.addEventListener('click',hide);
    button.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  }
  function renderTrack(items,target,empty){
    const track=$(target),isScene=target==='scene-track';
    track.replaceChildren();
    if(!items.length)track.append(el('span','track-empty',empty));
    return items.map((item,index)=>{
      const label=isScene?`场景 ${index+1}`:item.text;
      const title=isScene?[label,item.title].filter(Boolean).join(' · '):label;
      const node=segmentButton(item,isScene?label:'');
      node.setAttribute('aria-label',`${title} · ${fmt(item.start)}–${fmt(item.end)}`);
      placeTrack(node,item.start,item.end);
      previewOn(node,item,title,item.observation);
      track.append(node);
      return {item,node};
    });
  }
  function renderNoteTrack(){
    const track=$('note-track');track.replaceChildren();
    for(const item of rangeNotes){
      const button=segmentButton(item,'片段笔记');
      button.onclick=()=>{seekTime(item.start);setDetail('notes');editRange(item);};
      placeTrack(button,item.start,item.end);previewOn(button,item,'片段笔记',item.text);
      track.append(button);
    }
    for(const shot of shots){
      const note=noteFor(shot);
      if(!note?.trim())continue;
      const button=segmentButton(shot,'笔记');
      button.onclick=()=>{seekTime(shot.start);setDetail('notes');};
      placeTrack(button,shot.start,shot.end);previewOn(button,shot,shot.id+' · 笔记',note);
      track.append(button);
    }
    if(!track.children.length)track.append(el('span','track-empty','暂无笔记'));
  }
  function markRanges(container,time){
    for(const {item,node} of container){const active=time+.001>=item.start&&time+.001<item.end;node.classList.toggle('current',active);node.setAttribute('aria-current',String(active));}
  }
  function syncPosition(time){
    const bounded=Math.max(0,Math.min(D.meta.duration,time));
    if(Math.abs(bounded-lastSavedPosition)>=1||(video.paused&&bounded!==lastSavedPosition))savePosition(bounded);
    text($('clock'),clockTime(bounded));
    playerPosition.value=String(bounded);
    playerPosition.style.setProperty('--fill',100*bounded/D.meta.duration+'%');
    $('track-position').value=String(bounded);
    $('track-time').textContent=clockTime(bounded)+' / '+clockTime(D.meta.duration);
    $('playhead').style.left=100*bounded/D.meta.duration+'%';
    markRanges(sceneRows,bounded);markRanges(sceneTrackRows,bounded);
    const next=subtitles.find(s=>s.start<=bounded+.001&&bounded+.001<s.end);
    const overlay=$('subtitle-overlay');
    const original=captionOriginal.checked?next?.text||'':'';
    const translation=captionTranslation.checked?next?.translation||(!original&&/\p{Script=Han}/u.test(next?.text||'')?next.text:''):'';
    const chinese=translation===original?'':translation;
    overlay.hidden=!original&&!chinese;
    text($('overlay-en'),original,'');text($('overlay-zh'),chinese,'');
    $('overlay-speaker').textContent=next?.speaker||'';$('overlay-speaker').hidden=!next?.speaker;
    $('overlay-en').hidden=!original;$('overlay-zh').hidden=!chinese;
    if(next!==activeSubtitle){
      activeSubtitle=next;markRanges(transcriptRows,bounded);markRanges(subtitleTrackRows,bounded);
      const row=transcriptRows.find(r=>r.item===next)?.node;
      const panel=$('detail-transcript');
      if(row&&!panel.hidden&&$('follow').checked){
        const a=row.getBoundingClientRect(),b=panel.getBoundingClientRect();
        if(a.bottom>b.bottom||a.top<b.top)panel.scrollTop+=a.top-b.top-panel.clientHeight*.25;
      }
    }
    const strip=$('track-scroll');
    if($('follow').checked&&!$('track-body').hidden&&strip.clientWidth){
      const x=strip.scrollWidth*bounded/D.meta.duration;
      if(x<strip.scrollLeft||x>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=x-strip.clientWidth*.25;
    }
  }
  let lastSavedPosition=0;
  function position(){return Math.max(0,Math.min(D.meta.duration,(pending??video.currentTime)-offset));}
  function snapshot(){
    const detail=document.querySelector('[data-detail].active')?.dataset.detail||'explain';
    return {id:D.id,time:position(),detail,view,pane:$('tab-study').dataset.pane,chapter:document.querySelector('[data-chapter].active')?.dataset.chapter,
      query:$('transcript-search').value,scroll:$('detail-'+detail)?.scrollTop||0,timeline:$('track-scroll').scrollLeft,playing:!video.paused};
  }
  function savePosition(time=position()){
    if(restoring||!Number.isFinite(time))return;
    const state={...snapshot(),time:Math.max(0,Math.min(D.meta.duration,time)),playing:false};
    try{localStorage.setItem('guanlan-resume:'+(D.series?.id||D.id),JSON.stringify(state));lastSavedPosition=time;}catch{}
  }
  function restore(options={}){
    restoring=true;
    if(options.detail)setDetail(options.detail);
    if(options.view==='structure')setView('structure');
    if(options.chapter)Array.from(document.querySelectorAll('[data-chapter]')).find(button=>button.dataset.chapter===options.chapter&&!button.hidden)?.click();
    if(options.pane)setPane(options.pane);
    if(typeof options.query==='string'){$('transcript-search').value=options.query;renderTranscript();}
    if(Number.isFinite(options.time))seekTime(options.time);
    const panel=$('detail-'+options.detail);
    if(panel&&Number.isFinite(options.scroll))panel.scrollTop=options.scroll;
    if(Number.isFinite(options.timeline))$('track-scroll').scrollLeft=options.timeline;
    restoring=false;savePosition();
    if(options.playing&&video.getAttribute('src')){
      if(video.readyState>=1)play();else video.addEventListener('loadedmetadata',()=>{if(video.getAttribute('src'))play();},{once:true});
    }
  }
  video.addEventListener('pause',()=>savePosition());
  function renderTranscript(){
    const list=$('transcript-list'),query=$('transcript-search').value.trim().toLowerCase();
    list.replaceChildren();
    transcriptRows=subtitles.filter(s=>[s.text,s.translation,s.speaker,s.locator].join(' ').toLowerCase().includes(query)).map(item=>{
      const node=segmentButton(item,'');node.className='transcript-row';
      node.setAttribute('aria-label',fmt(item.start)+' '+item.text);
      const row=el('div','transcript-entry');
      const review=item.recognitionStatus?.includes('人工')||item.recognitionStatus?.includes('已修订')?item.recognitionStatus:item.recognitionStatus?.includes('待核')||item.recognitionStatus?.includes('待回看')?'待核':'';
      node.append(el('small','mono',`${fmt(item.start)}–${fmt(item.end)}${item.speaker?' · '+item.speaker:''}${review?' · '+review:''}`),el('span','',item.text));
      if(item.translation)node.append(el('span','translation',item.translation));
      row.append(node);
      if(window.parent!==window&&!D.demo){
        const edit=el('button','transcript-edit','✎');edit.title='修订本条字幕';edit.setAttribute('aria-label','修订 '+fmt(item.start)+' 的字幕');
        edit.onclick=()=>window.GuanlanStudy?.editSubtitle?.(item);row.append(edit);
      }
      list.append(row);return {item,node};
    });
    if(!transcriptRows.length)list.append(el('p','empty',query?'没有匹配字幕。':'本集暂无带时间的字幕。可在剧本页查看已导入文本。'));
    markRanges(transcriptRows,position());
  }
  function renderInlineFrames(shot,parent){
    const bar=el('div','inline-frames');
    (shot.images||[]).slice(0,3).forEach((src,i)=>{
      const recorded=shot.sampleTimes?.[i]??shot.frames?.[i];
      const time=Number.isFinite(recorded)&&recorded-offset>=shot.start-.02&&recorded-offset<=shot.end+.02?recorded-offset:shot.start+shot.duration*[.15,.5,.85][i];
      const b=segmentButton({start:time,end:time},'');
      b.setAttribute('aria-label',['起段','中段','末段'][i]+' '+fmt(time));
      b.title=['起段','中段','末段'][i]+' '+fmt(time);
      const img=el('img');img.src=src;img.alt='';img.loading='lazy';
      b.append(img,el('small','mono',fmt(time)));bar.append(b);
    });
    if(bar.children.length)parent.append(bar);
  }
  const catalog=D.series?.episodes||[],mediaType=D.mediaKind==='material'?'material':'episode';
  const isMaterial=mediaType==='material';
  const sameType=catalog.filter(item=>item.kind===mediaType);
  const mediaIndex=sameType.findIndex(item=>item.id===D.id);
  const nextEpisode=sameType[mediaIndex+1];
  function openEpisode(item,time,play=false,shotId){
    if(!item)return;
    setView('study');setPane('player');
    if(item.id===D.id){if(Number.isFinite(time))seekTime(time);return;}
    parent.postMessage({type:'guanlan-open-episode',id:item.id,series:D.series.id,time,shotId,play},new URL(document.baseURI).origin);
  }
  function renderStudyContext(){
    const plot=$('detail-plot');
    if(D.lessons?.overview)plot.append(el('p','plot-intro',D.lessons.overview));
    for(const item of scenes){
      const node=el('article','plot-scene');
      const jump=segmentButton(item,fmt(item.start)+'–'+fmt(item.end));
      node.append(jump,el('h3','',item.title));
      if(item.objective)field(node,'此段的戏剧任务',item.objective);
      field(node,'发生了什么',item.observation);
      field(node,'关键变化',item.effect);
      if(item.ending)field(node,'停在哪里',item.ending);
      plot.append(node);sceneRows.push({item,node});
    }
    if(!scenes.length)plot.append(el('p','empty','当前项目还没有场景拆解。'));
    const series=D.series;
    if(!series)return;
    const profile=D.profile||{},cuePanel=$('detail-cues');
    if(!isMaterial&&D.cues?.length){
      $('cue-tab').hidden=false;
      for(const cue of D.cues){
        const episode=catalog.find(item=>item.kind==='episode'&&item.episode===cue.episode);
        const shot=episode?.id===D.id?shots.find(item=>item.id===cue.shotId):null;
        const time=Number.isFinite(cue.time)?cue.time:shot?.start;
        const card=el('article','plot-scene');
        card.append(el('h3','',cue.label),el('p','',cue.title));
        if(cue.needsReview)card.append(el('small','muted','镜头范围已变，待复核'));
        if(episode&&(Number.isFinite(time)||episode.id!==D.id&&cue.shotId)){
          const jump=el('button','',episode.id===D.id?fmt(time):`EP ${cue.episode} · ${cue.shotId||fmt(time)}`);
          jump.onclick=()=>openEpisode(episode,time,false,cue.shotId);
          card.append(jump);
        }
        cuePanel.append(card);
      }
    }
    $('series-tab').hidden=false;
    const chapter=$('chapter-series');
    chapter.append(el('h2','',series.title));
    const info=[profile.type,profile.language,profile.date,...(profile.themes||[])].filter(Boolean).join(' · ');
    if(info)chapter.append(el('p','muted',info));
    if(series.premise)chapter.append(el('p','lead',series.premise));
    if(series.scope)chapter.append(el('p','muted',series.scope));
    if(series.handoff)field(chapter,'集间接续',series.handoff);
    if(profile.framework)field(chapter,'故事框架',profile.framework);
    if(profile.world)field(chapter,'世界观',profile.world);
    if(profile.units?.length){
      chapter.append(el('h3','','故事单元'));
      for(const unit of profile.units){
        const card=el('article','plot-scene'),target=catalog.find(item=>item.kind==='episode'&&item.episode===unit.from);
        card.append(el('h4','',unit.title),el('small','mono',`EP ${unit.from}${unit.to===unit.from?'':'–'+unit.to}`));
        if(unit.text)card.append(el('p','',unit.text));
        if(target){const jump=el('button','','回看');jump.onclick=()=>openEpisode(target,unit.time||0);card.append(jump);}
        chapter.append(card);
      }
    }
    if(profile.paywall?.episode){
      const card=el('article','plot-scene'),{episode,source,stages}=profile.paywall;
      card.append(el('h3','',`付费卡点 · EP ${episode} → ${episode+1}`),el('small','',source));
      ['前置钩子','卡点钩子','卡点兑现','下一钩子'].forEach((label,index)=>field(card,label,stages?.[index]));chapter.append(card);
    }
    for(const [name,look,role] of series.characters||[]){const card=el('article','plot-scene');card.append(el('h3','',name));field(card,'识别线索',look);field(card,'两集里的作用',role);chapter.append(card);}
    if(!catalog.length)return;
    const directory=$('episode-directory');directory.hidden=false;
    const hasMaterials=catalog.some(item=>item.kind==='material');
    const switches=el('div','episode-types');
    const list=el('div','episode-buttons');
    function showType(kind){
      list.replaceChildren();
      switches.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));
      for(const item of catalog.filter(item=>item.kind===kind)){
        const label=item.kind==='material'?`素材 ${item.episode}`:`第${item.episode}集`;
        const button=el('button','',String(item.episode));button.dataset.episode=item.id;
        button.setAttribute('aria-current',String(item.id===D.id));button.setAttribute('aria-label',label);
        button.title=item.kind==='material'?`${item.title} · ${fmt(item.duration)} · ${item.status}`:label;
        button.onclick=()=>openEpisode(item);list.append(button);
      }
    }
    if(hasMaterials){
      for(const [kind,label] of [['episode','正剧'],['material','素材']]){
        const button=el('button','',label);button.dataset.kind=kind;button.onclick=()=>showType(kind);switches.append(button);
      }
      directory.append(switches);
    }else directory.append(el('h2','','选集'));
    directory.append(list);showType(mediaType);
    const previous=sameType[mediaIndex-1];
    $('previous-episode').hidden=$('next-episode').hidden=$('auto-next-setting').hidden=sameType.length<2;
    $('previous-episode').disabled=!previous;$('next-episode').disabled=!nextEpisode;
    $('previous-episode').onclick=()=>openEpisode(previous);$('next-episode').onclick=()=>openEpisode(nextEpisode);
    if(isMaterial){
      $('previous-episode').title='上一个素材';$('previous-episode').setAttribute('aria-label','上一个素材');
      $('next-episode').title='下一个素材';$('next-episode').setAttribute('aria-label','下一个素材');
    }
    if(hasMaterials){
      const tab=el('button','','素材对应'),panel=el('div','insight-content');
      tab.dataset.detail='material';tab.setAttribute('aria-selected','false');tab.onclick=()=>setDetail('material');
      document.querySelector('.insight-tabs').append(tab);panel.id='detail-material';panel.hidden=true;document.querySelector('.insight-panel').append(panel);
      const links=(profile.materialLinks||[]).filter(link=>(isMaterial?link.material:link.episode)===series.episode);
      if(!links.length)panel.append(el('p','empty','暂无已核对的对应点。可在整剧资料中添加。'));
      for(const link of links){
        const target=catalog.find(item=>item.kind===(isMaterial?'episode':'material')&&item.episode===(isMaterial?link.episode:link.material));
        const time=isMaterial?link.to:link.from,card=el('article','plot-scene');
        card.append(segmentButton({start:isMaterial?link.from:link.to,end:(isMaterial?link.from:link.to)+.01},fmt(isMaterial?link.from:link.to)),el('p','',link.text||'对应点'));
        if(target){const jump=el('button','',`${isMaterial?'EP':'素材'} ${target.episode} · ${fmt(time)}`);jump.onclick=()=>openEpisode(target,time);card.append(jump);}
        panel.append(card);
      }
    }
  }
  let annotationImage='',annotationTime=null,annotationBase='',drawPointer=null;
  const canvas=$('range-canvas'),ctx=canvas.getContext('2d');
  function showAnnotation(){
    canvas.hidden=!annotationImage;$('range-clear').hidden=!annotationImage;$('range-remove-image').hidden=!annotationImage;
    if(annotationImage){const image=new Image();image.onload=()=>{canvas.width=image.width;canvas.height=image.height;ctx.drawImage(image,0,0);};image.src=annotationImage;}
  }
  function editRange(item){
    const dialog=$('range-note-dialog');
    dialog.dataset.noteId=item?.id||'';
    const position=Math.min(Math.max(0,video.currentTime-offset),D.meta.duration-.01);
    $('range-start').value=(item?.start??position).toFixed(2);
    $('range-end').value=(item?.end??Math.min(D.meta.duration,Math.max(position+.01,shots[current].end))).toFixed(2);
    $('range-text').value=item?.text||'';
    annotationImage=item?.image||'';annotationBase=item?.baseImage||annotationImage;annotationTime=item?.imageTime??null;showAnnotation();
    video.pause();
    $('range-error').hidden=true;
    dialog.showModal();
  }
  function renderRangeList(){
    const list=$('range-note-list');list.replaceChildren();
    for(const item of rangeNotes){
      const row=el('div','range-note-row');
      row.append(segmentButton(item,fmt(item.start)+'–'+fmt(item.end)),el('p','',item.text));
      if(item.image){const image=el('img','note-thumbnail');image.src=item.image;image.alt='笔记画面标注';row.append(image);}
      const edit=el('button','quiet','编辑');edit.setAttribute('aria-label','编辑片段笔记');edit.onclick=()=>editRange(item);row.append(edit);list.append(row);
    }
  }
  $('range-add').onclick=()=>editRange();
  $('range-cancel').onclick=()=>$('range-note-dialog').close();
  $('range-capture').onclick=()=>{
    const error=$('range-error');
    try{
      if(video.readyState<2||!video.videoWidth)throw Error('请先定位到要标注的画面。');
      const factor=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.round(video.videoWidth*factor);canvas.height=Math.round(video.videoHeight*factor);ctx.drawImage(video,0,0,canvas.width,canvas.height);
      annotationImage=annotationBase=canvas.toDataURL('image/jpeg',.8);annotationTime=position();error.hidden=true;showAnnotation();
    }catch(err){error.textContent=err.message;error.hidden=false;}
  };
  function canvasPoint(event){const rect=canvas.getBoundingClientRect();return [(event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height];}
  canvas.onpointerdown=event=>{
    if(event.button!==0)return;
    drawPointer=canvasPoint(event);canvas.setPointerCapture(event.pointerId);
    ctx.strokeStyle='#ffdb43';ctx.fillStyle='#ffdb43';ctx.lineWidth=4;ctx.lineJoin=ctx.lineCap='round';
    ctx.beginPath();ctx.arc(...drawPointer,2,0,2*Math.PI);ctx.fill();
  };
  canvas.onpointermove=event=>{
    if(!drawPointer||!canvas.hasPointerCapture(event.pointerId))return;
    const point=canvasPoint(event);ctx.beginPath();ctx.moveTo(...drawPointer);ctx.lineTo(...point);ctx.stroke();drawPointer=point;
  };
  canvas.onlostpointercapture=()=>{if(drawPointer)annotationImage=canvas.toDataURL('image/jpeg',.84);drawPointer=null;};
  $('range-clear').onclick=()=>{annotationImage=annotationBase;showAnnotation();};
  $('range-remove-image').onclick=()=>{annotationImage=annotationBase='';annotationTime=null;showAnnotation();};
  $('range-form').onsubmit=event=>{
    event.preventDefault();
    const start=Number($('range-start').value),end=Number($('range-end').value),body=$('range-text').value.trim();
    const error=$('range-error');
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>D.meta.duration+.005||!body){error.textContent='请填写片长内的起止时间和笔记。';error.hidden=false;return;}
    const id=$('range-note-dialog').dataset.noteId||(crypto.randomUUID?.()??String(Date.now()));
    const entry={id,start,end:Math.min(end,D.meta.duration),text:body};
    if(annotationImage)Object.assign(entry,{image:annotationImage,baseImage:annotationBase,imageTime:annotationTime});
    const next=[...rangeNotes.filter(n=>n.id!==id),entry].sort((a,b)=>a.start-b.start);
    try{localStorage.setItem(rangeKey,JSON.stringify(next));}catch{error.textContent='当前浏览器无法保存片段笔记。';error.hidden=false;return;}
    rangeNotes=next;renderRangeList();renderNoteTrack();$('range-note-dialog').close();
    visibleFields={...visibleFields,note:true};applyFields();saveLayout({fields:visibleFields});
  };
  const captionToggle=$('caption-toggle'),captionOriginal=$('caption-original'),captionTranslation=$('caption-translation');
  const captionSizes=[...document.querySelectorAll('[data-caption-size]')];
  function refreshCaptionControls(){
    const available=subtitles.length>0;
    const shown=available&&(captionOriginal.checked||captionTranslation.checked);
    captionToggle.disabled=captionOriginal.disabled=captionTranslation.disabled=!available;
    for(const button of captionSizes)button.disabled=!available;
    captionToggle.setAttribute('aria-pressed',String(shown));
    captionToggle.title=available?(shown?'隐藏字幕':'显示字幕'):'暂无悬浮字幕';
  }
  function setCaptionMode(mode){
    captionOriginal.checked=mode==='both'||mode==='en';
    captionTranslation.checked=mode==='both'||mode==='zh';
    refreshCaptionControls();
  }
  function saveCaptionMode(){
    const mode=captionOriginal.checked?(captionTranslation.checked?'both':'en'):(captionTranslation.checked?'zh':'off');
    saveLayout(mode==='off'?{subtitleLanguage:mode}:{subtitleLanguage:mode,subtitleLastLanguage:mode});
    refreshCaptionControls();syncPosition(position());
  }
  setCaptionMode(settings.subtitleLanguage||'both');
  captionOriginal.onchange=captionTranslation.onchange=saveCaptionMode;
  captionToggle.onclick=()=>{
    setCaptionMode(captionToggle.getAttribute('aria-pressed')==='true'?'off':settings.subtitleLastLanguage||'both');
    saveCaptionMode();
  };
  function setCaptionSize(size){
    $('subtitle-overlay').style.setProperty('--caption-size',size+'px');
    for(const button of captionSizes)button.setAttribute('aria-pressed',String(Number(button.dataset.captionSize)===size));
  }
  setCaptionSize([12,15,19].includes(Number(settings.subtitleSize))?Number(settings.subtitleSize):15);
  for(const button of captionSizes)button.onclick=()=>{
    const size=Number(button.dataset.captionSize);
    setCaptionSize(size);saveLayout({subtitleSize:size});
  };
  $('transcript-search').oninput=renderTranscript;
  $('track-position').max=String(D.meta.duration);
  $('track-position').oninput=e=>seekTime(Number(e.target.value));
  const ruler=$('time-ruler');
  function tickTime(time,interval){
    return interval<1?fmt(time):clockTime(time);
  }
  function renderRuler(){
    ruler.replaceChildren();
    const count=Math.max(2,Math.floor($('track-scroll').clientWidth/66))*zoom;
    const target=D.meta.duration/count;
    const interval=[.1,.25,.5,1,2,5,10,15,20,30,60,120].find(n=>n>=target)||Math.ceil(target/60)*60;
    for(let t=0;t<D.meta.duration;t+=interval){
      if(t>0&&D.meta.duration-t<interval*.35)break;
      const label=el('span','mono',tickTime(t,interval));
      label.style.left=100*t/D.meta.duration+'%';ruler.append(label);
    }
    const endLabel=tickTime(D.meta.duration,interval);
    if(ruler.lastElementChild?.textContent!==endLabel)ruler.append(el('span','mono ruler-end',endLabel));
  }
  let zoom=Math.max(1,Math.min(8,Number(settings.zoom)||1));
  function setZoom(value){
    zoom=Math.max(1,Math.min(8,value));$('track-canvas').style.width=100*zoom+'%';$('zoom-value').textContent=100*zoom+'%';
    $('zoom-in').disabled=zoom===8;$('zoom-out').disabled=zoom===1;
    saveLayout({zoom});renderRuler();
  }
  $('zoom-in').onclick=()=>{setZoom(zoom*2);syncPosition(position());};$('zoom-out').onclick=()=>{setZoom(zoom/2);syncPosition(position());};
  $('zoom-reset').onclick=()=>{setZoom(1);$('track-scroll').scrollLeft=0;syncPosition(position());};
  setZoom(zoom);
  function collapseTracks(collapsed){
    $('track-content').hidden=$('track-toolbar').hidden=$('track-split').hidden=collapsed;
    const toggle=$('tracks-toggle');
    toggle.textContent=collapsed?'展开分镜':'收起';toggle.setAttribute('aria-label',collapsed?'展开分镜':'收起分镜');
    toggle.setAttribute('aria-expanded',String(!collapsed));
    $('track-preview').hidden=true;
    if(!collapsed)renderRuler();
  }
  $('tracks-toggle').onclick=()=>collapseTracks(!$('track-content').hidden);
  const trackIds={time:'time-track',scene:'scene-track',shot:'timeline',subtitle:'subtitle-track',note:'note-track'};
  const fieldGroups=[
    ['时间轴',{time:'时间刻度',scene:'场景轨道',shot:'镜头轨道',subtitle:'字幕轨道',note:'笔记轨道'}],
    ['关键帧',{frames:'关键帧'}],
    ['镜头详情',{id:'镜号与时间',frame:'画面内容',...Object.fromEntries(detailFields.map(([key,label])=>[key,label])),dialogue:'对白 / 旁白',why:'为什么这样拍',rhythm:'节奏作用'}]
  ];
  const fieldLabels=Object.assign({},...fieldGroups.map(([,labels])=>labels));
  const fieldKeys=Object.keys(fieldLabels);
  const defaults=Object.fromEntries(fieldKeys.map(key=>[key,key!=='note']));
  let visibleFields={...defaults};
  for(const key of fieldKeys){
    const value=settings.fields?.[key]??settings[key];
    if(typeof value==='boolean')visibleFields[key]=value;
  }
  function applyFields(){
    for(const [key,id] of Object.entries(trackIds)){
      $(id).hidden=!visibleFields[key];$('label-'+key).hidden=!visibleFields[key];
    }
    $('playhead').hidden=!visibleFields.time;
    $('filmstrip').hidden=!visibleFields.frames;
    const hasTracks=Object.keys(trackIds).some(key=>visibleFields[key]);
    $('track-body').hidden=!hasTracks;$('tracks-empty').hidden=hasTracks||visibleFields.frames;
    document.querySelectorAll('[data-shot-field]').forEach(node=>node.hidden=visibleFields[node.dataset.shotField]===false);
    updateDetailTitle();renderRuler();
  }
  const fieldDialog=$('fields-dialog');
  let draftFields;
  function fieldSwitch(key,cls,label){
    const button=el('button',cls,label);
    button.type='button';button.dataset.fieldToggle=key;button.setAttribute('role','switch');
    button.setAttribute('aria-label',fieldLabels[key]);
    button.onclick=()=>{draftFields[key]=!draftFields[key];refreshFieldDraft();};
    return button;
  }
  for(const [group,labels] of fieldGroups){
    const row=el('div','field-group');
    row.append(el('span','',group));
    for(const [key,label] of Object.entries(labels))row.append(fieldSwitch(key,'field-chip',label));
    $('field-choices').append(row);
  }
  function refreshFieldDraft(){
    for(const button of fieldDialog.querySelectorAll('[data-field-toggle]')){
      const on=draftFields[button.dataset.fieldToggle];
      button.setAttribute('aria-checked',String(on));
      const state=button.querySelector('.field-visibility');
      if(state)state.textContent=on?'显示':'隐藏';
    }
    const count=fieldKeys.filter(key=>draftFields[key]).length;
    $('fields-count').textContent=`显示 ${count} / ${fieldKeys.length} 项`;
    $('fields-all').disabled=count===fieldKeys.length;
    $('fields-save').disabled=fieldKeys.every(key=>draftFields[key]===visibleFields[key]);
  }
  function fieldPreviewRow(key,label,content){
    const row=fieldSwitch(key,'field-preview-row','');
    row.append(el('strong','',label),content,el('span','field-visibility'));
    return row;
  }
  function fieldPreviewSection(title){
    const section=el('section','field-preview-section');
    section.append(el('h3','',title));$('field-previews').append(section);
    return section;
  }
  function renderFieldPreviews(){
    $('field-previews').replaceChildren();
    const previewTracks=fieldPreviewSection('时间轴');
    const previewRuler=el('span','field-preview-ruler');
    for(let i=0;i<=4;i++)previewRuler.append(el('span','mono',clockTime(D.meta.duration*i/4)));
    previewTracks.append(fieldPreviewRow('time','时间',previewRuler));
    for(const [key,label] of [['scene','场景'],['shot','镜头'],['subtitle','字幕'],['note','笔记']]){
      const track=el('span','field-mini-track');track.dataset.track=key;
      for(const item of $(trackIds[key]).querySelectorAll('button')){
        const block=el('span','field-mini-segment',key==='scene'||key==='shot'?item.textContent:'');
        block.style.left=item.style.left;block.style.width=item.style.width;
        block.classList.toggle('current',item.classList.contains('current'));track.append(block);
      }
      if(!track.children.length)track.append(el('span','track-empty',$(trackIds[key]).textContent));
      previewTracks.append(fieldPreviewRow(key,label,track));
    }
    const frames=el('span','field-preview-frames');
    const shot=shots[current];
    for(const src of shot.images||[]){
      const image=el('img');image.src=src;image.alt='';frames.append(image);
    }
    if(!frames.children.length)frames.append(el('span','empty','本镜暂无关键帧'));
    fieldPreviewSection('关键帧').append(fieldPreviewRow('frames','关键帧',frames));
    const details=fieldPreviewSection('镜头详情');
    const values={id:`镜头 ${current+1} · ${shotTime(shot)}`,frame:shot.frame,dialogue:shotDialogue(shot)||shot.onscreenText,why:shot.why,rhythm:shot.viewerChange||shot.rhythm};
    for(const [key,,property] of detailFields)values[key]=shot[property];
    for(const [key,label] of Object.entries(fieldGroups[2][1])){
      const value=values[key],sample=el('span','field-preview-sample',value||'本镜暂无');
      if(value)sample.title=value;
      details.append(fieldPreviewRow(key,label,sample));
    }
  }
  $('fields-open').onclick=()=>{
    draftFields={...visibleFields};renderFieldPreviews();refreshFieldDraft();fieldDialog.showModal();
    $('fields-open').setAttribute('aria-expanded','true');
  };
  $('fields-all').onclick=()=>{draftFields=Object.fromEntries(fieldKeys.map(key=>[key,true]));refreshFieldDraft();};
  $('fields-reset').onclick=()=>{draftFields={...defaults};refreshFieldDraft();};
  $('fields-close').onclick=$('fields-cancel').onclick=()=>fieldDialog.close();
  fieldDialog.onclose=()=>$('fields-open').setAttribute('aria-expanded','false');
  $('fields-form').onsubmit=event=>{
    event.preventDefault();visibleFields=draftFields;applyFields();saveLayout({fields:visibleFields});fieldDialog.close();
  };
  $('track-scroll').addEventListener('scroll',()=>$('track-preview').hidden=true);
  $('track-content').addEventListener('scroll',()=>$('track-preview').hidden=true);
  const split=$('player-split'),layout=document.querySelector('.study-layout');
  const catalogSplit=$('catalog-split');
  function setCatalogWidth(width){const value=Math.max(96,Math.min(256,Math.round(width)));layout.style.setProperty('--catalog-width',value+'px');catalogSplit.setAttribute('aria-valuenow',value);}
  setCatalogWidth(settings.catalogWidth||128);
  catalogSplit.onpointerdown=event=>{if(event.button===0)catalogSplit.setPointerCapture(event.pointerId);};
  catalogSplit.onpointermove=event=>{if(catalogSplit.hasPointerCapture(event.pointerId))setCatalogWidth(event.clientX-layout.getBoundingClientRect().left);};
  catalogSplit.onlostpointercapture=()=>saveLayout({catalogWidth:Number(catalogSplit.getAttribute('aria-valuenow'))});
  catalogSplit.onkeydown=event=>{
    if(!['Home','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();setCatalogWidth(event.key==='Home'?128:Number(catalogSplit.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?10:-10));catalogSplit.onlostpointercapture();
  };
  catalogSplit.ondblclick=()=>{setCatalogWidth(128);catalogSplit.onlostpointercapture();};
  function setInspector(percent){
    const width=Math.max(30,Math.min(61,percent));
    layout.style.setProperty('--inspector-width',width+'%');
    split.setAttribute('aria-valuenow',String(Math.round(width)));
  }
  setInspector(Number(settings.inspector)||42);
  split.onpointerdown=e=>{if(e.button===0)split.setPointerCapture(e.pointerId);};
  split.onpointermove=e=>{
    if(split.hasPointerCapture(e.pointerId)){
      const bounds=layout.getBoundingClientRect();setInspector((bounds.right-e.clientX)/bounds.width*100);
    }
  };
  split.onpointerup=()=>saveLayout({inspector:Number(split.getAttribute('aria-valuenow'))});
  split.onkeydown=e=>{
    const width=Number(split.getAttribute('aria-valuenow'));
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setInspector(width+(e.key==='ArrowLeft'?2:-2));}
    if(e.key==='Home'){e.preventDefault();setInspector(42);}
    saveLayout({inspector:Number(split.getAttribute('aria-valuenow'))});
  };
  split.ondblclick=()=>{setInspector(42);saveLayout({inspector:42});};
  const trackSplit=$('track-split');
  const initialTrackHeight=214;
  function setTrackHeight(height){
    const maximum=Math.max(112,Math.min(320,Math.floor(innerHeight*.41)));
    const value=Math.round(Math.max(92,Math.min(maximum,height)));
    trackSplit.setAttribute('aria-valuemax',String(maximum));
    layout.style.setProperty('--track-content-height',value+'px');trackSplit.setAttribute('aria-valuenow',String(value));
  }
  setTrackHeight(Number(settings.trackContentHeight)||initialTrackHeight);
  window.addEventListener('resize',()=>setTrackHeight(Number(settings.trackContentHeight)||initialTrackHeight));
  new ResizeObserver(renderRuler).observe($('track-scroll'));
  let trackDrag;
  trackSplit.onpointerdown=e=>{if(e.button===0){trackDrag={y:e.clientY,height:Number(trackSplit.getAttribute('aria-valuenow'))};trackSplit.setPointerCapture(e.pointerId);}};
  trackSplit.onpointermove=e=>{if(trackDrag&&trackSplit.hasPointerCapture(e.pointerId))setTrackHeight(trackDrag.height+trackDrag.y-e.clientY);};
  trackSplit.onlostpointercapture=()=>{trackDrag=null;saveLayout({trackContentHeight:Number(trackSplit.getAttribute('aria-valuenow'))});};
  trackSplit.onkeydown=e=>{
    if(!['ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();setTrackHeight(e.key==='Home'?initialTrackHeight:Number(trackSplit.getAttribute('aria-valuenow'))+(e.key==='ArrowUp'?8:-8));
    saveLayout({trackContentHeight:Number(trackSplit.getAttribute('aria-valuenow'))});
  };
  trackSplit.ondblclick=()=>{setTrackHeight(initialTrackHeight);saveLayout({trackContentHeight:initialTrackHeight});};
  $('catalog-toggle').onclick=()=>{
    const collapsed=document.querySelector('.study-layout').classList.toggle('catalog-collapsed');
    $('catalog-toggle').textContent='目录';$('catalog-toggle').setAttribute('aria-label',collapsed?'展开目录':'收起目录');$('catalog-toggle').title=collapsed?'展开目录':'收起目录';$('catalog-toggle').setAttribute('aria-expanded',String(!collapsed));
    saveLayout({catalogCollapsed:collapsed});
  };
  if(settings.catalogCollapsed)$('catalog-toggle').click();
  renderStudyContext();
  restoring=true;setDetail('explain');restoring=false;
  text($('track-shot-count'),`${shots.length} 个镜头`);
  sceneTrackRows=renderTrack(scenes,'scene-track','暂无场景拆解');subtitleTrackRows=renderTrack(subtitles,'subtitle-track','暂无字幕');
  shots.forEach((shot,index)=>{
    const group=el('div','filmstrip-shot');
    renderInlineFrames(shot,group);
    if(!group.children.length)return;
    group.prepend(el('strong','',`镜头 ${index+1}`));$('keyframes').append(group);frameGroups[index]=group;
  });
  if(!$('keyframes').children.length)$('keyframes').append(el('p','empty','暂无关键帧'));
  renderTranscript();renderRangeList();renderNoteTrack();renderRuler();applyFields();
  renderDirectory();detail(0);setCurrent(0,false);syncPosition(0);
  window.GuanlanStudy={project:D,shot:()=>shots[current],index:()=>current,seek,seekTime,setDetail,refresh:()=>detail(current),video,format:fmt,sourceFile:()=>sourceFile,openSource,snapshot,restore,savePosition,updateSubtitles,setFavorite,noteFor,writeNote};
})();
