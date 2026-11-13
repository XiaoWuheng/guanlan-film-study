export const mediaKind = project => project.mediaKind === 'material' ? 'material' : 'episode';
export const mediaNumber = project => project.series?.episode || 1;
export const mediaLabel = project => mediaKind(project) === 'material' ? `素材 ${mediaNumber(project)}` : `第 ${mediaNumber(project)} 集`;
export const profileKey = project => project.series?.id || project.id;
export const splitTags = text => [...new Set((Array.isArray(text)?text:String(text||'').split(/[,，、\n]/)).filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean))];
export const paywallLabels = ['前置钩子', '卡点钩子', '卡点兑现', '下一钩子'];

export function groupStudies(projects) {
  const groups = new Map();
  for (const project of projects) {
    const key = profileKey(project);
    if (!groups.has(key)) groups.set(key, {key,title:project.series?.title || project.title,episodes:[]});
    groups.get(key).episodes.push(project);
  }
  return [...groups.values()].map(group => {
    group.episodes.sort((a,b) => mediaKind(a).localeCompare(mediaKind(b)) || mediaNumber(a) - mediaNumber(b));
    return group;
  });
}

export function cleanProfile(value={}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('剧目资料格式无效');
  const str = (text,max=4000) => typeof text === 'string' ? text.trim().slice(0,max) : '';
  const rows = (key,max,fn) => Array.isArray(value[key]) ? value[key].slice(0,max).filter(item => item && typeof item === 'object').map(fn) : [];
  const short = (text) => str(text,160);
  const int = value => Number.isInteger(value) && value > 0 ? value : null;
  const sec = value => Number.isFinite(value) && value >= 0 ? value : null;
  const profile = {
    type:short(value.type), language:short(value.language), date:short(value.date),
    themes:splitTags(value.themes).slice(0,24).map(short), plots:splitTags(value.plots).slice(0,24).map(short), roles:splitTags(value.roles).slice(0,24).map(short),
    framework:str(value.framework), world:str(value.world),
    units:rows('units',80,row => ({title:short(row.title),from:int(row.from),to:int(row.to),time:sec(row.time),text:str(row.text)})).filter(row => row.title && row.from && row.to>=row.from),
    materialLinks:rows('materialLinks',120,row => ({material:int(row.material),episode:int(row.episode),from:sec(row.from),to:sec(row.to),text:str(row.text)})).filter(row => row.material && row.episode && row.from!==null && row.to!==null),
    metrics:rows('metrics',250,row => ({kind:row.kind==='heat'?'heat':'spend',amount:sec(row.amount),date:short(row.date),source:short(row.source),unit:short(row.unit)})).filter(row => row.amount!==null && row.source && row.unit && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
  };
  if (value.paywall && typeof value.paywall==='object' && int(value.paywall.episode)) {
    profile.paywall={episode:int(value.paywall.episode),source:short(value.paywall.source),stages:paywallLabels.map((_,i)=>str(value.paywall.stages?.[i]))};
  }
  return profile;
}

export function installProjectLibrary({$,storage,open,prepare,backup,remove,changed,report,addMaterial,fail,busy}) {
  const read = (key,fallback) => {
    try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const write = (key,value) => storage.setItem(key,JSON.stringify(value));
  const profiles = 'guanlan-series-profiles', activity = 'guanlan-library-activity';
  const getProfile = key => {
    const saved=read(profiles,{}),fallback=groups.find(group=>group.key===key)?.episodes[0].series?.profile;
    return Object.hasOwn(saved,key)?saved[key]:fallback||{};
  };
  const setProfile = (key,profile) => write(profiles,{...read(profiles,{}),[key]:cleanProfile(profile)});
  const getActivity = () => read(activity,{recent:{},saved:{},shots:{}});
  function record(project) {
    const data=getActivity();
    data.recent[profileKey(project)]={at:Date.now(),id:project.id};
    try { write(activity,data); } catch {}
  }
  function toggleShot(project,shot) {
    const data=getActivity(),key=`${project.id}:${shot.id}`;
    const saved=!data.shots[key];
    if(saved)data.shots[key]={id:project.id,shotId:shot.id,time:shot.start,title:project.title,shot:shot.frame||'',at:Date.now()};
    else delete data.shots[key];
    write(activity,data);
    return saved;
  }
  const isShotSaved = (projectId,shotId) => Boolean(getActivity().shots[`${projectId}:${shotId}`]);
  const el = (tag,text,cls) => {
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  };
  const button = (text,action) => {
    const node=el('button',text);node.type='button';
    node.onclick=()=>{if(!busy())Promise.resolve().then(action).catch(fail);};
    return node;
  };
  const filters=['project-search','project-status','project-tag','project-order'];
  const pref = read('guanlan-library-filters',{});
  let groups=[],tab=['all','recent','saved','topics'].includes(pref.tab)?pref.tab:'all',period=0;
  function preferences() {
    try { write('guanlan-library-filters',{tab,...Object.fromEntries(filters.map(id=>[id,$(id).value]))}); } catch {}
  }
  for(const id of filters){
    if(id!=='project-tag'&&typeof pref[id]==='string')$(id).value=pref[id];
    $(id).addEventListener(id==='project-search'?'input':'change',()=>{preferences();render();});
  }
  for(const control of document.querySelectorAll('[data-library]'))control.onclick=()=>{tab=control.dataset.library;preferences();render();};
  function tags(profile){return [...new Set([...(profile.themes||[]),...(profile.plots||[]),...(profile.roles||[])])];}

  function update(next) {
    groups=next;
    const menu=$('project-tag'),selected=menu.value||read('guanlan-library-filters',{})['project-tag'];
    const values=[...new Set(groups.flatMap(group=>tags(getProfile(group.key))))].sort((a,b)=>a.localeCompare(b,'zh'));
    menu.replaceChildren(new Option('全部标签',''),...values.map(tag=>new Option(tag,tag)));
    if(values.includes(selected))menu.value=selected;
    render();
  }
  function render() {
    const box=$('projects'),search=$('project-search').value.trim().toLocaleLowerCase(),tag=$('project-tag').value,status=$('project-status').value,order=$('project-order').value;
    const data=getActivity();
    box.replaceChildren();
    document.querySelectorAll('[data-library]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.library===tab)));
    $('library-filters').hidden=tab==='topics';
    if(tab==='topics'){renderTopics(box);return;}
    const chosen=groups.filter(group=>{
      const profile=getProfile(group.key),labels=tags(profile);
      return (!search||[group.title,group.key,profile.type,profile.language,...labels].join(' ').toLocaleLowerCase().includes(search))
        &&(!tag||labels.includes(tag))&&(!status||group.episodes.some(project=>project.status===status))
        &&(tab!=='recent'||data.recent[group.key])&&(tab!=='saved'||data.saved[group.key]);
    });
    chosen.sort((a,b)=>{
      if(order==='title'&&tab!=='recent')return a.title.localeCompare(b.title,'zh');
      if(order!=='updated'||tab==='recent'){
        const delta=(data.recent[b.key]?.at||0)-(data.recent[a.key]?.at||0);
        if(delta)return delta;
      }
      return b.episodes.map(p=>p.updated).sort().at(-1).localeCompare(a.episodes.map(p=>p.updated).sort().at(-1));
    });
    let date;
    for(const group of chosen){
      if(tab==='recent'){
        const nextDate=new Date(data.recent[group.key].at).toLocaleDateString('zh-CN');
        if(nextDate!==date){date=nextDate;box.append(el('h3',date,'library-group'));}
      }
      const p=group.episodes[0],profile=getProfile(group.key),card=el('article',null,'project'),body=el('div',null,'project-body');
      const cover=p.shots[0]?.images?.[0];
      if(cover){const image=el('img',null,'project-cover');image.src=cover;image.alt='';image.loading='lazy';card.append(image);}
      const count=group.episodes.filter(item=>mediaKind(item)==='episode').length;
      const desc=[p.series?`${count} 集`:null,group.episodes.length>count?`${group.episodes.length-count} 素材`:null,`${group.episodes.reduce((n,item)=>n+item.shots.length,0)} 镜`,profile.type,profile.language].filter(Boolean).join(' · ');
      body.append(el('h3',group.title),el('p',desc,'muted'));
      const badges=el('div',null,'project-badges');
      for(const name of tags(profile).slice(0,6))badges.append(el('span',name));
      if(badges.children.length)body.append(badges);
      const actions=el('div',null,'actions');
      const saved=button(data.saved[group.key]?'已收藏':'收藏',()=>{
        const next=getActivity();if(next.saved[group.key])delete next.saved[group.key];else next.saved[group.key]=Date.now();write(activity,next);render();
      });
      saved.setAttribute('aria-pressed',String(Boolean(data.saved[group.key])));
      actions.append(button('打开学习',()=>open(group)),saved,button('资料',()=>editProfile(group)));
      if(p.series)actions.append(button('＋ 素材',()=>addMaterial(group)));
      if(!p.series)actions.append(button('继续分析',()=>prepare(p)),button('备份',()=>backup(p)),button('删除',()=>remove(p)));
      body.append(actions);card.append(body);box.append(card);
    }
    if(tab==='saved'&&!status&&!tag){
      const shots=Object.values(data.shots).filter(item=>!search||`${item.title} ${item.shot} ${item.shotId}`.toLocaleLowerCase().includes(search)).sort((a,b)=>b.at-a.at);
      if(shots.length)box.append(el('h3','收藏镜头','library-group'));
      for(const item of shots){
        const project=groups.flatMap(g=>g.episodes).find(p=>p.id===item.id);
        if(!project)continue;
        const card=el('article',null,'project project-body');
        card.append(el('h3',item.title),el('p',`${item.shotId} · ${item.shot}`),button('回看',()=>report(project,{time:item.time})),button('取消收藏',()=>{const next=getActivity();delete next.shots[`${item.id}:${item.shotId}`];write(activity,next);render();}));
        box.append(card);
      }
    }
    if(!box.children.length)box.append(el('p',search||tag||status?'没有匹配的项目。':tab==='saved'?'暂无收藏。':tab==='recent'?'暂无浏览记录。':'添加原片后，剧目会显示在这里。','empty'));
  }

  function renderTopics(box) {
    const tools=el('div',null,'topic-tools library-group');
    const label=el('label','记录范围 '),window=el('select');
    for(const [days,name] of [[0,'全部'],[7,'近 7 天'],[30,'近 30 天']])window.append(new Option(name,days));
    window.value=period;window.onchange=()=>{period=Number(window.value);render();};label.append(window);tools.append(label);box.append(tools);
    const rows=new Map(),sources={spend:new Set(),heat:new Set()};
    for(const group of groups){
      const profile=getProfile(group.key);
      for(const tag of profile.themes||[]){
        if(!rows.has(tag))rows.set(tag,{count:0,metrics:{heat:new Map(),spend:new Map()}});
        const row=rows.get(tag);row.count++;
        for(const metric of profile.metrics||[]){
          if(period&&Date.parse(metric.date)<Date.now()-period*86400000)continue;
          const key=metric.unit+' · '+metric.source,list=row.metrics[metric.kind];
          sources[metric.kind].add(key);
          list.set(key,(list.get(key)||0)+metric.amount);
        }
      }
    }
    if(!rows.size){box.append(el('p','在剧目资料里添加题材标签后，这里会显示题材分布。','empty'));return;}
    const table=el('table',null,'topic-table'),head=table.createTHead().insertRow();
    for(const name of ['题材','剧目','投放消耗','站外热度'])head.append(el('th',name));
    for(const [tag,row] of [...rows].sort((a,b)=>b[1].count-a[1].count)){
      const tr=table.insertRow();
      tr.insertCell().append(button(tag,()=>{tab='all';$('project-tag').value=tag;$('project-search').value='';$('project-status').value='';preferences();render();}));
      tr.insertCell().textContent=String(row.count);
      for(const kind of ['spend','heat'])tr.insertCell().textContent=[...row.metrics[kind]].map(([key,n])=>`${n.toLocaleString()} ${key}`).join('\n')||'—';
    }
    box.append(table);
    if(sources.spend.size===1&&sources.heat.size===1){
      const ranks={};
      for(const kind of ['spend','heat'])ranks[kind]=new Map([...rows].filter(([,row])=>row.metrics[kind].size).sort((a,b)=>[...b[1].metrics[kind].values()][0]-[...a[1].metrics[kind].values()][0]).map(([tag],index)=>[tag,index+1]));
      const gaps=[...rows.keys()].filter(tag=>ranks.spend.has(tag)&&ranks.heat.has(tag)).map(tag=>({tag,heat:ranks.heat.get(tag),spend:ranks.spend.get(tag)})).filter(row=>row.heat<row.spend).sort((a,b)=>(b.spend-b.heat)-(a.spend-a.heat));
      if(gaps.length){
        const rankTable=el('table',null,'topic-table'),caption=el('caption','站外热度排名领先于站内消耗');rankTable.append(caption);
        const head=rankTable.createTHead().insertRow();for(const title of ['题材','站外排名','站内排名'])head.append(el('th',title));
        for(const gap of gaps){const row=rankTable.insertRow();[gap.tag,gap.heat,gap.spend].forEach(value=>row.insertCell().textContent=value);}
        box.append(rankTable);
      }
    }
  }

  function editProfile(group) {
    const profile=getProfile(group.key),dialog=el('dialog',null,'learning-dialog study-profile');
    const title=el('div',null,'learning-heading');title.append(el('h2',group.title),button('关闭',()=>dialog.close()));dialog.append(title);
    function field(parent,label,value='',options={}){
      const wrapper=el('label',label),input=el(options.multiline?'textarea':'input');
      if(options.type)input.type=options.type;
      if(options.type==='number'){input.min=options.min??0;input.step=options.step||1;}
      if(options.multiline)input.rows=3;
      input.value=value??'';wrapper.append(input);parent.append(wrapper);return input;
    }
    function section(label){const fieldset=el('fieldset');fieldset.append(el('legend',label));dialog.append(fieldset);return fieldset;}
    const basics=section('剧目信息');
    const fields={type:field(basics,'类型',profile.type),language:field(basics,'语言',profile.language),date:field(basics,'上线日期',profile.date,{type:'date'}),themes:field(basics,'题材标签',profile.themes?.join('、')),plots:field(basics,'剧情标签',profile.plots?.join('、')),roles:field(basics,'角色标签',profile.roles?.join('、'))};
    const structure=section('整剧结构');
    fields.framework=field(structure,'故事框架',profile.framework,{multiline:true});
    fields.world=field(structure,'世界观与设定',profile.world,{multiline:true});
    function list(parent,label,records,make){
      const list=el('div',null,'profile-list'),entries=[];
      function add(value){const row=el('div',null,'profile-entry'),entry=make(row,value);entries.push({row,entry});row.append(button('移除',()=>row.remove()));list.append(row);}
      parent.append(list,button(label,()=>add({})));records?.forEach(add);
      return ()=>entries.filter(({row})=>row.isConnected).map(({entry})=>entry());
    }
    const integer={type:'number',min:1},seconds={type:'number',step:'.01'};
    const units=list(structure,'添加故事单元',profile.units,(row,value)=>{
      const name=field(row,'单元名',value.title),from=field(row,'起始集',value.from,integer),to=field(row,'结束集',value.to,integer),time=field(row,'起始集定位秒',value.time,seconds),text=field(row,'冲突与变化',value.text,{multiline:true});
      return ()=>({title:name.value,from:from.valueAsNumber,to:to.valueAsNumber||from.valueAsNumber,time:time.valueAsNumber||0,text:text.value});
    });
    const paywall=section('付费卡点');
    const payEpisode=field(paywall,'卡点集号',profile.paywall?.episode,integer),source=field(paywall,'卡点来源',profile.paywall?.source);
    const stages=paywallLabels.map((label,i)=>field(paywall,label,profile.paywall?.stages?.[i],{multiline:true}));
    const links=list(section('素材对应'),'添加素材对应',profile.materialLinks,(row,value)=>{
      const material=field(row,'素材编号',value.material,integer),from=field(row,'素材定位秒',value.from,seconds),episode=field(row,'正剧集号',value.episode,integer),to=field(row,'正剧定位秒',value.to,seconds),text=field(row,'匹配证据',value.text);
      return ()=>({material:material.valueAsNumber,episode:episode.valueAsNumber,from:from.valueAsNumber||0,to:to.valueAsNumber||0,text:text.value});
    });
    const metrics=list(section('题材数据'),'添加有来源的数据',profile.metrics,(row,value)=>{
      const kind=el('select');kind.setAttribute('aria-label','数据口径');kind.append(new Option('投放消耗','spend'),new Option('站外热度','heat'));kind.value=value.kind||'spend';row.append(kind);
      const amount=field(row,'数值',value.amount,seconds),unit=field(row,'单位',value.unit),date=field(row,'数据日期',value.date,{type:'date'}),source=field(row,'来源',value.source);
      return ()=>({kind:kind.value,amount:amount.valueAsNumber,unit:unit.value,date:date.value,source:source.value});
    });
    const message=el('p',null,'warning');message.hidden=true;dialog.append(message,button('保存资料',async()=>{
      try{
        const raw={...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value])),units:units(),materialLinks:links(),metrics:metrics(),paywall:{episode:payEpisode.valueAsNumber,source:source.value,stages:stages.map(input=>input.value)}};
        const checked=cleanProfile(raw);
        if(checked.units.length!==raw.units.length||checked.materialLinks.length!==raw.materialLinks.length||checked.metrics.length!==raw.metrics.length)throw Error('请补齐新增条目的集号、时间或数据来源。');
        for(const link of checked.materialLinks){
          const material=group.episodes.find(project=>mediaKind(project)==='material'&&mediaNumber(project)===link.material),episode=group.episodes.find(project=>mediaKind(project)==='episode'&&mediaNumber(project)===link.episode);
          if(!material||!episode||link.from>material.meta.duration||link.to>episode.meta.duration||!link.text)throw Error('素材对应需填写有效的两端时间和匹配证据。');
        }
        if(checked.paywall&&!checked.paywall.source)throw Error('请注明付费卡点来源。');
        setProfile(group.key,checked);dialog.close();update(groups);await changed(group.key);
      }catch(error){message.hidden=false;message.textContent=error.message;}
    }));
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  return {update,render,getProfile,setProfile,record,editProfile,isShotSaved,toggleShot};
}
