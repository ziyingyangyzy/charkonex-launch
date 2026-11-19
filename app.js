{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const WS={o:{n:'Clinic partnerships',c:'#F59E0B'},m:{n:'Digital marketing',c:'#60A5FA'},r:{n:'Regulatory path',c:'#C4B5FD'},a:{n:'Sleep algorithm',c:'#5EEAD4'},f:{n:'Fundraising',c:'#F9A8D4'},e:{n:'Events',c:'#BEF264'}};
const STN={todo:'To do',doing:'In progress',blocked:'Blocked',done:'Done'};
const NEXT={todo:'doing',doing:'done',done:'blocked',blocked:'todo'};
const CFG=window.CKX_CONFIG||{};
const REMOTE=!!(CFG.supabaseUrl&&CFG.supabaseAnonKey);
const SEED=JSON.parse($('#seed').textContent);
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

// ---------- state ----------
let S={tasks:[],people:[],ws:{},config:{launch:SEED.launch,from:SEED.from,to:SEED.to}};
let rev=-1,pass=store.get('ckx-pass')||'',me=store.get('ckx-me')||'',hist=[],fws='',fp='',editing=null,wsEdit=null,busy=0;
function fromSeed(){return{tasks:SEED.tasks,people:SEED.people,ws:SEED.ws,config:{launch:SEED.launch,from:SEED.from,to:SEED.to}}}
function norm(){
  if(!S.people||!S.people.length)S.people=SEED.people;
  S.ws=S.ws||{};for(const k in WS)S.ws[k]=S.ws[k]||{lead:S.people[0].id,sup:[]};
  S.config=Object.assign({launch:SEED.launch,from:SEED.from,to:SEED.to},S.config||{});
  for(const t of S.tasks){if(!t.lead)t.lead=S.ws[t.ws]?.lead||S.people[0].id;if(!Array.isArray(t.sup))t.sup=[]}
}

// ---------- backend ----------
async function rpc(fn,args){
  const r=await fetch(`${CFG.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${fn}`,{method:'POST',headers:Object.assign({'Content-Type':'application/json',apikey:CFG.supabaseAnonKey},/^eyJ/.test(CFG.supabaseAnonKey)?{Authorization:'Bearer '+CFG.supabaseAnonKey}:{}),body:JSON.stringify(args)});
  const txt=await r.text();let body=null;try{body=txt?JSON.parse(txt):null}catch(e){body=txt}
  if(!r.ok){const err=new Error((body&&body.message)||r.statusText);err.code=body&&body.code;throw err}
  return body;
}
const isAuth=e=>e&&(e.code=='28P01'||/bad password/i.test(e.message));
async function load(){
  if(!REMOTE){
    try{const l=JSON.parse(store.get('ckx-local'));S=l&&l.tasks?l:fromSeed()}catch(e){S=fromSeed()}
    norm();render();setSync('Local mode: not connected to a database yet, edits stay in this browser');return;
  }
  if(!pass){gate();return}
  try{
    let d=await rpc('board_get',{pass});
    if(!d.tasks.length&&!Object.keys(d.meta).length){
      const s=fromSeed();await rpc('board_seed',{pass,tasks:s.tasks,meta:{people:s.people,ws:s.ws,config:s.config}});
      d=await rpc('board_get',{pass});
    }
    S={tasks:d.tasks,people:d.meta.people,ws:d.meta.ws,config:d.meta.config};rev=d.rev;norm();render();
    setSync('Synced · updates every few seconds');
  }catch(e){if(isAuth(e)){pass='';store.set('ckx-pass','');gate('Wrong password, try again.')}else if(e.code=='PGRST202')setSync('Database not set up yet: run the setup SQL in Supabase, then refresh.');else setSync('Can’t reach the database: '+e.message)}
}
async function write(fn,args){
  if(!REMOTE){store.set('ckx-local',JSON.stringify(S));setSync('Saved in this browser');return}
  busy++;setSync('Saving…');
  try{await rpc(fn,Object.assign({pass},args));setSync('Saved · everyone sees this')}
  catch(e){if(isAuth(e)){gate('Password changed, enter the new one.')}else setSync('Not saved: '+e.message+'. Refresh and try again.')}
  finally{busy--;if(!busy)poll(true)}
}
async function poll(force){
  if(!REMOTE||!pass||busy||document.hidden)return;
  try{const r=await rpc('board_rev',{pass});if(force||r!=rev){const d=await rpc('board_get',{pass});if(busy)return;S={tasks:d.tasks,people:d.meta.people,ws:d.meta.ws,config:d.meta.config};rev=d.rev;norm();render()}}catch(e){}
}
setInterval(poll,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});

// ---------- changes (each records its inverse for undo) ----------
const clone=x=>JSON.parse(JSON.stringify(x));
function stamp(t){t.by=me||'';t.at=new Date().toISOString().slice(0,10);return t}
function putTask(t,undoing){
  const i=S.tasks.findIndex(x=>x.id==t.id),prev=i<0?null:clone(S.tasks[i]);
  if(!undoing){stamp(t);hist.push(prev?{type:'task',v:prev}:{type:'del',id:t.id})}
  if(i<0)S.tasks.push(t);else S.tasks[i]=t;render();write('board_put_task',{t});
}
function delTask(id,undoing){
  const prev=S.tasks.find(x=>x.id==id);if(!prev)return;
  if(!undoing)hist.push({type:'task',v:clone(prev)});
  S.tasks=S.tasks.filter(x=>x.id!=id);render();write('board_del_task',{tid:id});
}
function putMeta(k,d,undoing){
  if(!undoing)hist.push({type:'meta',k,v:clone(S[k])});
  S[k]=d;render();write('board_put_meta',{k,d});
}
function undo(){const h=hist.pop();if(!h)return;
  if(h.type=='task')putTask(h.v,true);else if(h.type=='del')delTask(h.id,true);else putMeta(h.k,h.v,true)}

// ---------- rendering ----------
const day=d=>Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10));
const now=new Date(),TODAY=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt=d=>MON[+d.slice(5,7)-1]+' '+(+d.slice(8,10));
const range=(a,b)=>a==b?fmt(a):fmt(a)+' → '+fmt(b);
const pct=d=>Math.max(0,Math.min(100,((typeof d=='number'?d:day(d))-day(S.config.from))/(day(S.config.to)-day(S.config.from))*100));
const pname=id=>(S.people.find(p=>p.id==id)||{name:id}).name;
const badge=(id,lead)=>id?`<span class="pp${lead?' lead':''}" title="${lead?'Lead':'Support'}: ${esc(pname(id))}">${esc(pname(id))}</span>`:'';
const owners=(l,s)=>`<span class="own">${badge(l,1)}${(s||[]).map(x=>badge(x)).join('')}</span>`;
const ownText=(l,s)=>pname(l)+((s||[]).length?' + '+s.map(pname).join(', '):'');
function head(){
  const L=S.config.launch,left=Math.ceil((day(L)-TODAY)/864e5);
  const pre=S.tasks.filter(t=>day(t.due)<=day(L));
  const done=pre.filter(t=>t.status=='done').length,blk=pre.filter(t=>t.status=='blocked').length;
  $('#days').textContent=left>0?left:left==0?'Today':'Live';
  $('#dl').textContent=left>0?(left==1?'day':'days')+' to launch · '+fmt(L):left==0?'Launch day':'Launched '+fmt(L);
  $('#finding').innerHTML=`<b>${done} of ${pre.length}</b> pre-launch tasks done${blk?`, ${blk} blocked`:''}`;
}
function timeline(){
  const months=[];let y=+S.config.from.slice(0,4),m=+S.config.from.slice(5,7);
  for(;;){m++;if(m>12){m=1;y++}const d=`${y}-${String(m).padStart(2,'0')}-01`;if(day(d)>day(S.config.to))break;months.push(d)}
  const ticks=`<div class="ticks"><span></span><div class="trk">${months.map(d=>`<span style="left:${pct(d)}%">${+d.slice(5,7)==1?'Jan '+d.slice(0,4):MON[+d.slice(5,7)-1]}</span>`).join('')}</div></div>`;
  const lanes=Object.keys(WS).map(k=>{const ts=S.tasks.filter(t=>t.ws==k).sort((a,b)=>day(a.start)-day(b.start));
    return `<div class="lane"><div class="lname" style="--c:${WS[k].c}" data-wso="${k}" title="Edit workstream owners">${WS[k].n} ${owners(S.ws[k].lead,S.ws[k].sup)}</div>${ts.map(t=>{const l=pct(t.start),w=Math.max(pct(t.due)-l,1.2),ev=t.kind=='event';
      return `<div class="tr"><span class="tl">${esc(t.title)}<small>${range(t.start,t.due)} · ${esc(ownText(t.lead,t.sup))}</small></span><div class="trk"><i class="bar s-${t.status}${ev?' ev':''}" data-id="${t.id}" style="left:${l}%;width:${w}%;--c:${WS[k].c}" title="${esc(t.title)}: ${range(t.start,t.due)} · ${STN[t.status]}"></i>${ev?`<b class="evl" style="left:calc(${l+w}% + 8px);--c:${WS[k].c}">${esc(t.short||t.title)}</b>`:''}</div></div>`}).join('')}</div>`}).join('');
  const inR=TODAY>=day(S.config.from)&&TODAY<=day(S.config.to);
  const ov=`<div class="ov">${months.map(d=>`<i style="left:${pct(d)}%"></i>`).join('')}<i class="launch" style="left:${pct(S.config.launch)}%"><em>Launch ${fmt(S.config.launch)}</em></i>${inR?`<i class="today" style="left:${pct(TODAY)}%"><em>Today</em></i>`:''}</div>`;
  $('#tl').innerHTML='<div class="tlin">'+ticks+lanes+ov+'</div>';
}
function progress(){
  $('#prog').innerHTML=Object.keys(WS).map(k=>{const ts=S.tasks.filter(t=>t.ws==k),d=ts.filter(t=>t.status=='done').length,n=ts.length;
    const nx=ts.filter(t=>t.status!='done').sort((a,b)=>day(a.due)-day(b.due))[0];
    return `<div class="pc" style="--c:${WS[k].c}"><div class="t">${WS[k].n}<span>${d}/${n}</span></div><div class="meter"><i style="width:${n?d/n*100:0}%"></i></div><small>${nx?'Next due: '+esc(nx.title)+', '+fmt(nx.due):'All done'}</small><div class="ownrow">${owners(S.ws[k].lead,S.ws[k].sup)}<button class="mini" data-wso="${k}">Owners</button></div></div>`}).join('');
}
function list(){
  $('#chips').innerHTML=[['','All']].concat(Object.keys(WS).map(k=>[k,WS[k].n])).map(([k,n])=>`<button class="chip" data-ws="${k}" aria-pressed="${fws==k}">${n}</button>`).join('');
  $('#pchips').innerHTML='<span class="plabel">Person</span>'+[['','Everyone']].concat(S.people.map(p=>[p.id,p.name])).map(([k,n])=>`<button class="chip" data-p="${esc(k)}" aria-pressed="${fp==k}">${esc(n)}</button>`).join('');
  $('#me').innerHTML='<option value="">Choose…</option>'+S.people.map(p=>`<option value="${esc(p.id)}"${p.id==me?' selected':''}>${esc(p.name)}</option>`).join('');
  const q=$('#q').value.trim().toLowerCase(),fs=$('#fs').value;
  const ts=S.tasks.filter(t=>(!fws||t.ws==fws)&&(!fs||t.status==fs)&&(!fp||t.lead==fp||t.sup.includes(fp))&&(!q||(t.title+' '+ownText(t.lead,t.sup)+' '+t.note).toLowerCase().includes(q))).sort((a,b)=>day(a.due)-day(b.due));
  $('#list').innerHTML=ts.length?ts.map(t=>{const late=t.status!='done'&&day(t.due)<TODAY;
    const upd=t.at?`<small class="upd">Updated ${t.by?'by '+esc(pname(t.by))+' ':''}${fmt(t.at)}</small>`:'';
    return `<div class="row ${t.status=='done'?'is-done':''}" style="--c:${WS[t.ws].c}"><button class="st ${t.status}" data-cy="${t.id}" title="Click to change status">${STN[t.status]}</button>
    <div class="ttl"><span class="ws">${WS[t.ws].n}${t.kind=='event'?' · event':''}</span><br>${esc(t.title)}${t.note?`<small>${esc(t.note)}</small>`:''}${upd}</div>
    <div class="meta">${owners(t.lead,t.sup)}</div><div class="dt ${late?'late':''}">${range(t.start,t.due)}${late?' · overdue':''}</div>
    <div class="acts"><button data-ed="${t.id}">Edit</button></div></div>`}).join(''):'<div class="empty">No tasks match these filters</div>';
}
function render(){head();timeline();progress();list();$('#undo').disabled=!hist.length}
function setSync(s){$('#sync').textContent=s}

// ---------- dialogs ----------
const peopleOpts=sel=>S.people.map(p=>`<option value="${esc(p.id)}"${p.id==sel?' selected':''}>${esc(p.name)}</option>`).join('');
const peopleChecks=(name,sel)=>S.people.map(p=>`<label><input type="checkbox" name="${name}" value="${esc(p.id)}"${sel.includes(p.id)?' checked':''}>${esc(p.name)}</label>`).join('');
const checked=name=>[...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
const openM=id=>{$(id).classList.add('on');const f=$(id).querySelector('input,select');f&&f.focus()};
const closeAll=()=>{document.querySelectorAll('.modal:not(#gate)').forEach(m=>m.classList.remove('on'));editing=null;wsEdit=null};
function gate(msg){$('#g-msg').textContent=msg||'';$('#gate').classList.add('on');$('#g-pass').value='';$('#g-pass').focus()}
function setTaskOwners(l,s){$('#f-lead').innerHTML=peopleOpts(l);$('#f-sup').innerHTML=peopleChecks('fsup',s)}
function openEdit(t){
  editing=t;$('#mt').textContent=t?'Edit task':'New task';$('#f-del').style.display=t?'':'none';
  const w=fws||'o',d=t||{title:'',ws:w,status:'todo',lead:S.ws[w].lead,sup:S.ws[w].sup.slice(),start:new Date(TODAY).toISOString().slice(0,10),due:S.config.launch,note:''};
  ['title','ws','status','start','due','note'].forEach(k=>$('#f-'+k).value=d[k]);$('#f-event').checked=d.kind=='event';setTaskOwners(d.lead,d.sup);openM('#modal');
}
function openWs(k){wsEdit=k;$('#w-title').textContent=WS[k].n+' owners';$('#w-lead').innerHTML=peopleOpts(S.ws[k].lead);$('#w-sup').innerHTML=peopleChecks('wsup',S.ws[k].sup);openM('#wmodal')}
function teamRow(p){return `<label>${p?'Person '+esc(p.id):'New person'}<input data-pid="${p?esc(p.id):''}" value="${p?esc(p.name):''}" placeholder="Name"></label>`}
function openTeam(){$('#t-list').innerHTML=S.people.map(teamRow).join('');$('#t-launch').value=S.config.launch;openM('#tmodal')}
$('#f-ws').innerHTML=Object.keys(WS).map(k=>`<option value="${k}">${WS[k].n}</option>`).join('');
$('#f-ws').addEventListener('change',e=>{if(!editing){const w=S.ws[e.target.value];setTaskOwners(w.lead,w.sup)}});
$('#form').addEventListener('submit',e=>{e.preventDefault();
  const v={};['title','ws','status','start','due','note'].forEach(k=>v[k]=$('#f-'+k).value.trim());
  v.lead=$('#f-lead').value;v.sup=checked('fsup').filter(x=>x!=v.lead);
  if(day(v.due)<day(v.start))v.due=v.start;
  const base=editing?clone(editing):{id:Date.now()};
  if($('#f-event').checked){base.kind='event';if(!editing||base.short==null)base.short=''}else{delete base.kind;delete base.short}
  if(base.kind=='event'&&editing&&editing.title!=v.title)base.short='';
  putTask(Object.assign(base,v));closeAll()});
$('#wform').addEventListener('submit',e=>{e.preventDefault();const k=wsEdit,l=$('#w-lead').value,s=checked('wsup').filter(x=>x!=l);const ws=clone(S.ws);ws[k]={lead:l,sup:s};putMeta('ws',ws);closeAll()});
$('#t-add').onclick=()=>{$('#t-list').insertAdjacentHTML('beforeend',teamRow(null));$('#t-list').lastElementChild.querySelector('input').focus()};
$('#tform').addEventListener('submit',e=>{e.preventDefault();const ppl=clone(S.people);
  for(const i of document.querySelectorAll('#t-list input')){const n=i.value.trim();if(i.dataset.pid){const p=ppl.find(x=>x.id==i.dataset.pid);if(n)p.name=n}else if(n){let c=65;while(ppl.some(p=>p.id==String.fromCharCode(c)))c++;ppl.push({id:String.fromCharCode(c),name:n})}}
  if(JSON.stringify(ppl)!=JSON.stringify(S.people))putMeta('people',ppl);
  const L=$('#t-launch').value;if(L&&L!=S.config.launch)putMeta('config',Object.assign(clone(S.config),{launch:L}));
  closeAll()});
$('#gform').addEventListener('submit',e=>{e.preventDefault();pass=$('#g-pass').value;store.set('ckx-pass',pass);$('#gate').classList.remove('on');setSync('Connecting…');load()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeAll);
$('#f-del').onclick=()=>{delTask(editing.id);closeAll()};
document.querySelectorAll('.modal:not(#gate)').forEach(m=>m.addEventListener('click',e=>{if(e.target==m)closeAll()}));
document.addEventListener('keydown',e=>{if(e.key=='Escape')closeAll()});
$('#add').onclick=()=>openEdit(null);
$('#team').onclick=openTeam;
$('#undo').onclick=undo;
$('#me').addEventListener('change',e=>{me=e.target.value;store.set('ckx-me',me)});
$('#q').addEventListener('input',list);$('#fs').addEventListener('change',list);
document.addEventListener('click',e=>{const b=e.target.closest('[data-ws],[data-p],[data-cy],[data-ed],[data-wso],.bar');if(!b||b.closest('.modal'))return;
  if(b.dataset.cy){const t=clone(S.tasks.find(x=>x.id==+b.dataset.cy));t.status=NEXT[t.status];putTask(t)}
  else if(b.dataset.wso){openWs(b.dataset.wso)}
  else if(b.dataset.ed||b.classList.contains('bar')){openEdit(S.tasks.find(x=>x.id==+(b.dataset.ed||b.dataset.id)))}
  else if('ws' in b.dataset){fws=b.dataset.ws;list()}
  else if('p' in b.dataset){fp=b.dataset.p;list()}});
S=fromSeed();norm();render();load();
}
