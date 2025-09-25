/* ============================================================
   Claro Vendas — app.js (FINAL)
   ============================================================ */
(function(){ 'use strict';

/* ====== Helpers DOM/UI ====== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const show = (el)=>el&&el.classList.remove('hide');
const hide = (el)=>el&&el.classList.add('hide');
const setText=(sel,t)=>{const el=$(sel); if(el) el.textContent=t;};
function toast(msg){ let box=$('#toasts'); if(!box){box=document.createElement('div');box.id='toasts';box.className='toasts';document.body.appendChild(box);} const t=document.createElement('div'); t.className='toast'; t.innerHTML=msg; box.appendChild(t); setTimeout(()=>t.remove(),4200); }
function popup(msg){
  let wrap = document.getElementById('popupWrap');
  if(!wrap){ wrap=document.createElement('div'); wrap.id='popupWrap'; wrap.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9999;background:rgba(0,0,0,.2)'; document.body.appendChild(wrap); }
  const box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);padding:18px 22px;max-width:560px;width:min(92vw,560px);border-left:6px solid #d40000;position:relative';
  box.innerHTML=`<button aria-label="Fechar" style="position:absolute;right:8px;top:8px;border:none;background:#eef2f7;border-radius:8px;padding:4px 8px;cursor:pointer">✕</button>
  <h3 style="margin-bottom:8px;color:#b30000">Aviso</h3><div>${msg}</div>`;
  wrap.appendChild(box); const close=()=>{ box.remove(); if(!wrap.childElementCount) wrap.remove(); }; box.querySelector('button').onclick=close; setTimeout(close,7000);
}

/* ====== Tema ====== */
const THEME={primary:'#d40000',primaryDark:'#b30000',ok:'#16a34a',warn:'#f59e0b',bad:'#dc2626',blue:'#2563eb'};
const DONUT_PALETTE=[THEME.primary,THEME.blue];

/* ====== Persistência ====== */
const APP_VERSION='1.7.0';
const K = {
  USERS:'cv_users', VENDAS:'cv_vendas',
  META:'cv_metas', METAV:'cv_metas_v',
  AUD:'cv_aud', AUDH:'cv_audit_hash',
  LOJAS:'cv_lojas', ROLES:'cv_roles', PLANS:'cv_plans',
  SCHEMA:'cv_schema_version', LAST:'cv_last_access',
  SESSION:'cv_session'
};
// IndexedDB com fallback em localStorage
const DB = {
  supported: !!window.indexedDB, _db:null,
  async open(){ if(!this.supported) return; if(this._db) return;
    this._db = await new Promise((res,rej)=>{ const r = indexedDB.open('claro_vendas',1);
      r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
      r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
    });
  },
  async get(key){ if(!this.supported) return JSON.parse(localStorage.getItem(key)||'null');
    await this.open(); return await new Promise((res,rej)=>{ const tx=this._db.transaction('kv','readonly').objectStore('kv').get(key);
      tx.onsuccess=()=>res(tx.result?JSON.parse(tx.result):null); tx.onerror=()=>rej(tx.error); });
  },
  async set(key,val){ if(!this.supported){ localStorage.setItem(key,JSON.stringify(val)); return; }
    await this.open(); await new Promise((res,rej)=>{ const tx=this._db.transaction('kv','readwrite').objectStore('kv').put(JSON.stringify(val),key);
      tx.onsuccess=()=>res(); tx.onerror=()=>rej(tx.error); });
  }
};
async function loadK(key, def){ const v = await DB.get(key); return v==null?def:v; }
async function saveK(key, val){ await DB.set(key,val); }

/* ====== Crypto / IDs ====== */
const uuid = ()=> (crypto.randomUUID?.() || ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
async function sha256(text){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function hashPass(username, pass){ return sha256(`cv:${APP_VERSION}:${username}:${pass}`); }

/* ====== Estado ====== */
let USERS=[], VENDAS=[], METAS={}, METASV={}, AUDIT=[], AUDIT_HASH='', LOJAS=[], ROLES=[], PLANS={}, LAST_ACCESS={}, SESSION=null;

/* ====== Datas úteis / Feriados ====== */
const feriados = (y)=> new Set([`${y}-01-01`,`${y}-04-21`,`${y}-05-01`,`${y}-09-07`,`${y}-10-12`,`${y}-11-02`,`${y}-11-15`,`${y}-12-25`]);
const isBiz=(d,set)=>d.getDay()>0 && d.getDay()<6 && !set.has(d.toISOString().slice(0,10));
const bizInMonth=(y,m)=>{const s=feriados(y);let c=0;for(let d=new Date(y,m,1);d.getMonth()===m;d.setDate(d.getDate()+1)) if(isBiz(d,s)) c++;return c;};
const bizUntil=(y,m,day)=>{const s=feriados(y);let c=0;for(let d=new Date(y,m,1);d.getMonth()===m && d.getDate()<=day;d.setDate(d.getDate()+1)) if(isBiz(d,s)) c++;return c;};
const bizBetween=(a,b)=>{const s=new Date(a),e=new Date(b),set=feriados(s.getFullYear());let c=0;for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)) if(isBiz(d,set)) c++;return c;};
const YM_NOW=new Date().toISOString().slice(0,7);

/* ====== Papéis / Permissões ====== */
const curUser=()=> SESSION? USERS.find(u=>u.username===SESSION.username)||null : null;
const isAdminLike=u=>u && ['admin','backoffice','dono'].includes(u.role);
const isGerente  =u=>u && u.role==='gerente';
const isVendedor =u=>u && u.role==='vendedor';
const within30Biz = v => bizBetween(v.data, new Date().toISOString().slice(0,10))<=30;

const POLICY = {
  'sales.view'  : (u,v)=> isAdminLike(u) || (isGerente(u)&&v.loja===u.loja) || (isVendedor(u)&&v.vendedor===u.username),
  'sales.edit'  : (u,v)=> isAdminLike(u) || (isGerente(u)&&v.loja===u.loja) || (isVendedor(u)&&v.vendedor===u.username && within30Biz(v)),
  'sales.delete': (u,v)=> isAdminLike(u) || (isGerente(u)&&v.loja===u.loja) || (isVendedor(u)&&v.vendedor===u.username && within30Biz(v)),
};
const can=(perm,u,v)=> (POLICY[perm]||(()=>false))(u,v);

/* ====== Auditoria encadeada ====== */
async function log(event, detail){
  const user = curUser()?.username || '-';
  const rec = { id: uuid(), ts: new Date().toISOString(), user, event, detail };
  const base = JSON.stringify(rec) + (AUDIT_HASH||'');
  const h = await sha256(base);
  AUDIT_HASH = h;
  AUDIT.unshift({...rec, h});
  await saveK(K.AUD, AUDIT);
  await saveK(K.AUDH, AUDIT_HASH);
}
function renderAudit(){
  const tb=$('#tbodyAudit'); if(tb) tb.innerHTML = AUDIT.length? AUDIT.map(a=>`<tr><td>${a.ts.replace('T',' ').slice(0,19)}</td><td>${a.user}</td><td>${a.event}</td><td>${a.detail}</td></tr>`).join('') : `<tr><td colspan="4" class="muted">Sem eventos.</td></tr>`;
  const ti=$('#tbodyInactive'); if(ti){
    const ina=USERS.filter(u=>u.status==='inativo');
    ti.innerHTML=ina.length? ina.map(u=>`<tr><td>${u.username}</td><td>${u.loja||''}</td><td>${u.role}</td><td>${u.lastLogin?u.lastLogin.replace('T',' ').slice(0,19):'-'}</td><td><button class="btn primary reativar" data-u="${u.username}">Reativar</button></td></tr>`).join('') : `<tr><td colspan="5" class="muted">Nenhum usuário inativo.</td></tr>`;
    $$('.reativar').forEach(b=>b.onclick=async()=>{const u=USERS.find(x=>x.username===b.dataset.u); if(!u) return; u.status='ativo'; await saveK(K.USERS,USERS); await log('reativar',u.username); renderAudit(); renderUsers(); toast('Usuário reativado.');});
  }
}

/* ====== Migração / Seed ====== */
async function migrateSchema(){
  let cur = await loadK(K.SCHEMA,'1.0.0');

  if(cur<'1.5.0'){
    let changed=false;
    VENDAS.forEach(v=>{ if(!v.id){ v.id=uuid(); changed=true; }});
    if(changed) await saveK(K.VENDAS,VENDAS);
    cur='1.5.0'; await saveK(K.SCHEMA,cur);
  }
  if(cur<'1.5.5'){
    let changed=false;
    VENDAS.forEach(v=>{ if(v.ged && !Array.isArray(v.ged)){ v.ged=String(v.ged).split(/[|,;\s]+/).filter(Boolean); changed=true; } if(!v.ged) v.ged=[]; });
    if(changed) await saveK(K.VENDAS,VENDAS);
    cur='1.5.5'; await saveK(K.SCHEMA,cur);
  }
  if(cur<APP_VERSION){ await saveK(K.SCHEMA,APP_VERSION); }
}
async function seed(){
  USERS = await loadK(K.USERS, []);
  if(!USERS.length){
    const passwordHash = await hashPass('admin','admin');
    USERS=[{username:'admin',passwordHash,role:'admin',loja:'Arcoverde',status:'ativo',lastLogin:null}];
    await saveK(K.USERS,USERS);
  }else{
    let adm=USERS.find(u=>u.username==='admin');
    if(!adm){ USERS.push({username:'admin',passwordHash:await hashPass('admin','admin'),role:'admin',loja:'Arcoverde',status:'ativo',lastLogin:null}); await saveK(K.USERS,USERS); }
    else if(adm.status==='inativo'){ adm.status='ativo'; await saveK(K.USERS,USERS); }
  }
  VENDAS  = await loadK(K.VENDAS,  []);
  METAS   = await loadK(K.META,    {});
  METASV  = await loadK(K.METAV,   {});
  AUDIT   = await loadK(K.AUD,     [{id:uuid(),ts:new Date().toISOString(),user:'sistema',event:'init',detail:'auditoria iniciada'}]);
  AUDIT_HASH = await loadK(K.AUDH, '');
  LOJAS   = await loadK(K.LOJAS,   ['Arcoverde','Pesqueira','Araripina','Petrolina','Petrolina2']);
  ROLES   = await loadK(K.ROLES,   ['vendedor','gerente','backoffice','admin','dono']);
  PLANS   = await loadK(K.PLANS,   {"Móvel":["Controle","Seguro","BL","Dependente Voz e Dados","Dependente Dados","Aparelho","Pos"],"Residencial":["Virtua","TV"]});
  LAST_ACCESS = await loadK(K.LAST, {});
  await migrateSchema();
}

/* ====== Layout / Navegação ====== */
function showApp(){ show($('#appTopbar')); show($('#appLayout')); hide($('#loginScreen')); }
function showLogin(){ hide($('#appTopbar')); hide($('#appLayout')); show($('#loginScreen')); }
function badge(u){ setText('#userInfo', `${u.username} (${u.role})`); }

function openView(id){
  const u = curUser();
  if (isVendedor(u)) {
    const allowed = new Set(['lancar','registros','meta','conta']);
    if (!allowed.has(id)) { toast('Acesso não permitido para seu perfil.'); id='lancar'; }
  }
  $$('.view').forEach(v=>v.classList.add('hide'));
  $('#'+id)?.classList.remove('hide');
  $$('.menu a').forEach(a=>a.classList.remove('active'));
  document.querySelector(`.menu a[data-view="${id}"]`)?.classList.add('active');

  if(id==='relatorios') renderRelatorios();
  if(id==='registros'){ hydrateRegistrosFiltroLoja(); hydrateRegistrosFiltroGed(); hydrateRegistrosFiltroMes(); renderRegistros(); }
  if(id==='meta'){ renderMetaLoja(); renderMetaVend(); renderHeatmap(); lockMetaForSeller(); }
  if(id==='admin'){ renderUsers(); renderLojasRoles(); renderPlans(); }
  if(id==='auditoria') renderAudit();
  if(id==='conta') fillAccount();
}
function bindMenu(){ $$('.menu a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); openView(a.dataset.view);})); }

/* ====== Login / Logout ====== */
async function doLogin(username, password){
  const u = USERS.find(x=>x.username?.toLowerCase()===username.toLowerCase());
  const lockKey = `lock_${username}`;
  const lock = await loadK(lockKey, null);
  if(lock && lock.until && Date.now() < lock.until) return toast('Muitas tentativas. Tente novamente em alguns minutos.');
  if(!u) return toast('Usuário não encontrado.');

  const hp = await hashPass(u.username, password);
  if(u.passwordHash !== hp){
    const tries=(lock?.tries||0)+1; let until=null;
    if(tries>=5) until=Date.now()+15*60*1000;
    await saveK(lockKey,{tries,until});
    return toast('Senha incorreta.');
  }
  await saveK(lockKey,null);

  if(!isAdminLike(u)){
    const last = LAST_ACCESS[u.username];
    if(last){
      const deltaDays = Math.floor((Date.now()-last)/(24*3600*1000));
      if(deltaDays>=2 && u.status!=='ativo'){ return toast('Usuário inativo. Solicite reativação.'); }
    }
  }

  u.lastLogin = new Date().toISOString(); await saveK(K.USERS,USERS);
  LAST_ACCESS[u.username] = Date.now(); await saveK(K.LAST, LAST_ACCESS);

  SESSION = { username:u.username, role:u.role, loja:u.loja, ts:Date.now() };
  await saveK(K.SESSION, SESSION);

  badge(u); showApp(); bootAfterLogin();
  await log('login','ok');
  showRoleWelcomePopups();
  resetIdle();
}
function logout(silent){
  SESSION=null; localStorage.removeItem(K.SESSION); showLogin(); if(!silent) toast('Sessão encerrada.');
}
$('#loginForm')?.addEventListener('submit',async(e)=>{e.preventDefault();await doLogin($('#loginUser').value.trim(), $('#loginPass').value.trim());});
$('#btnLogout')?.addEventListener('click',()=>logout(false));

/* Idle timeout 30 min */
let idleTimer=null; function resetIdle(){ clearTimeout(idleTimer); idleTimer=setTimeout(()=>logout(true), 30*60*1000); }
['click','keydown','mousemove','touchstart'].forEach(evt=>document.addEventListener(evt, resetIdle, {passive:true}));

/* ====== Lançar ====== */
const GED_MOV=['IC','CO','RC','SB'];
const GED_RES=['Pendente Instalação','Cancelado','Conectado'];

function hydrateSelects(){
  const sLoja=$('#vLoja'); const sVend=$('#vendedor'); const sCat=$('#vCat'); const sPlano=$('#vPlano'); const sGed=$('#vGed');
  if(sLoja) sLoja.innerHTML=LOJAS.map(l=>`<option>${l}</option>`).join('');
  if(sVend){ const set=new Set(USERS.filter(u=>u.role==='vendedor').map(u=>u.username)); VENDAS.forEach(v=>set.add(v.vendedor)); sVend.innerHTML=[...set].sort().map(v=>`<option>${v}</option>`).join(''); }
  if(sCat){ sCat.onchange=()=>{ const cat=sCat.value||'Móvel'; const planos=PLANS[cat]||[]; const geds=(cat==='Móvel'?GED_MOV:GED_RES); if(sPlano) sPlano.innerHTML=planos.map(p=>`<option>${p}</option>`).join(''); if(sGed) sGed.innerHTML=geds.map(g=>`<option>${g}</option>`).join(''); toggleAparelho(); }; sCat.dispatchEvent(new Event('change')); }
}
function toggleAparelho(){ const plano=$('#vPlano')?.value||''; if(plano==='Aparelho') show($('#wrapAparelho')); else hide($('#wrapAparelho')); }
$('#vPlano')?.addEventListener('change',toggleAparelho);

$('#vendaForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const u=curUser(); if(!u) return;
  const data=$('#vData')?.value||new Date().toISOString().slice(0,10);
  if(new Date(data) > new Date()) return toast('Data futura não permitida.');
  const loja=$('#vLoja')?.value||u?.loja||LOJAS[0]; const vendedor=$('#vendedor')?.value||u?.username||'';
  if(isVendedor(u)&&vendedor!==u.username) return toast('Vendedor só lança a própria venda.');
  if(isGerente(u)&&loja!==u.loja) return toast('Gerente só lança para sua loja.');
  const cat=$('#vCat')?.value||'Móvel'; const plano=$('#vPlano')?.value||''; const contrato=$('#vContrato')?.value||'';
  const gedSel=$('#vGed'); let ged=[]; if(gedSel){ if(gedSel.multiple) ged=[...gedSel.selectedOptions].map(o=>o.value); else ged=[gedSel.value]; }

  if(plano==='Aparelho'){
    const val = Number($('#vValor')?.value||0);
    const modelo = $('#vModelo')?.value.trim()||'';
    const imei = $('#vImei')?.value.trim()||'';
    if(val < 0) return toast('Valor do aparelho inválido.');
    if(!modelo) return toast('Informe o modelo do aparelho.');
    if(!imei) return toast('Informe o Nº do IMEI.');
  }

  const valor = plano==='Aparelho'?Number($('#vValor')?.value||0):null;
  const modelo = plano==='Aparelho'?($('#vModelo')?.value||''):null;
  const imei   = plano==='Aparelho'?($('#vImei')?.value||''):null;

  const v={id:uuid(),data,loja,vendedor,categoria:cat,plano,ged,contrato,valorAparelho:valor,modeloAparelho:modelo,imeiAparelho:imei};
  VENDAS.push(v); await saveK(K.VENDAS,VENDAS); await log('venda_lancada',`${v.vendedor} • ${v.loja} • ${v.plano}`);
  toast('Venda lançada.'); $('#vendaForm').reset(); $('#vCat')?.dispatchEvent(new Event('change'));
  renderRegistros(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); renderHeatmap();
});

/* ====== Registros ====== */
function hydrateRegistrosFiltroLoja(){
  const s = document.getElementById('regLoja');
  if (!s) return;
  s.innerHTML = `<option value="">Todas</option>` + LOJAS.map(l=>`<option>${l}</option>`).join('');
}
function hydrateRegistrosFiltroGed(){
  const box = document.getElementById('regGed');
  if(!box) return;
  const ALL = [...GED_MOV, ...GED_RES];
  box.innerHTML = ALL.map(g=>`<label><input type="checkbox" value="${g}" checked> ${g}</label>`).join('');
}
function hydrateRegistrosFiltroMes(){
  const m = document.getElementById('regMes');
  if(m && !m.value) m.value = new Date().toISOString().slice(0,7);
}
let REG_PAGE=1, REG_SIZE=100;
function paginate(arr, page, size){ const total=arr.length, pages=Math.max(1,Math.ceil(total/size)); const p=Math.min(Math.max(1,page),pages); return {page:p,pages,total,items:arr.slice((p-1)*size, p*size)}; }

function renderRegistros(){
  const u=curUser(); if(!u) return;
  const tb=$('#tbodyRegistros'); if(!tb) return;

  const lojaFiltro = $('#regLoja')?.value || '';
  const mesFiltro  = $('#regMes')?.value || '';
  const gedsSel    = $('#regGed') ? [...$('#regGed').querySelectorAll('input:checked')].map(i=>i.value) : [];

  const listAll = VENDAS.filter(v =>
    can('sales.view',u,v) &&
    (!lojaFiltro || v.loja === lojaFiltro) &&
    (!mesFiltro || (v.data||'').slice(0,7) === mesFiltro) &&
    (!gedsSel.length || (v.ged||[]).some(g => gedsSel.includes(g)))
  ).sort((a,b)=> (a.data||'').localeCompare(b.data||''));

  const {page,pages,total,items} = paginate(listAll, REG_PAGE, REG_SIZE);

  tb.innerHTML= items.length? items.map(v=>`<tr>
      <td>${v.data}</td><td>${v.loja}</td><td>${v.vendedor}</td><td>${v.categoria}</td>
      <td>${v.plano}</td><td>${(v.ged||[]).join('|')}</td><td>${v.contrato||''}</td>
      <td>${v.modeloAparelho||''}</td>
      <td>${v.valorAparelho!=null?Number(v.valorAparelho).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''}</td>
      <td>${v.imeiAparelho||''}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${can('sales.edit',u,v)?`<button class="btn ghost edit" data-id="${v.id}">Editar</button>`:''}
        ${can('sales.delete',u,v)?`<button class="btn danger del" data-id="${v.id}">Excluir</button>`:''}
        ${(!can('sales.edit',u,v) && !can('sales.delete',u,v))?'—':''}
      </td>
    </tr>`).join('') : `<tr><td colspan="11" class="muted">Sem registros.</td></tr>`;

  const pagEl=$('#regPag'); if(pagEl){ pagEl.innerHTML=`
    <div class="pager">
      <button class="btn ghost" ${page<=1?'disabled':''} id="regPrev">◀</button>
      <span>${page} / ${pages} • ${total} registros</span>
      <button class="btn ghost" ${page>=pages?'disabled':''} id="regNext">▶</button>
    </div>`;
    $('#regPrev')?.addEventListener('click',()=>{REG_PAGE=Math.max(1,REG_PAGE-1); renderRegistros();});
    $('#regNext')?.addEventListener('click',()=>{REG_PAGE+=1; renderRegistros();});
  }

  $$('.edit').forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
  $$('.del').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id; const i=VENDAS.findIndex(x=>x.id===id); if(i<0) return;
    const v=VENDAS[i]; if(!can('sales.delete',curUser(),v)) return toast('Sem permissão.');
    if(!confirm(`Excluir a venda de ${v.vendedor} em ${v.loja} (${v.data})?`)) return;
    VENDAS.splice(i,1); await saveK(K.VENDAS,VENDAS); await log('venda_excluida',`#${id}`);
    toast('Venda excluída.'); renderRegistros(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); renderHeatmap();
  });
}
$('#regLoja')?.addEventListener('change',()=>{REG_PAGE=1; renderRegistros();});
$('#regMes')?.addEventListener('change',()=>{REG_PAGE=1; renderRegistros();});
document.getElementById('regGed')?.addEventListener('change',()=>{REG_PAGE=1; renderRegistros();});

let EDIT_ID=null;
function openEdit(id){
  const u=curUser(); const v=VENDAS.find(x=>x.id===id); if(!v) return; if(!can('sales.edit',u,v)) return toast('Sem permissão.');
  EDIT_ID=id; $('#eData').value=v.data; $('#eLoja').value=v.loja; $('#eVendedor').value=v.vendedor; $('#eCategoria').value=v.categoria; $('#ePlano').value=v.plano;
  $('#eGED').value=(v.ged||[]).join('|'); $('#eContrato').value=v.contrato||''; $('#eValor').value=v.valorAparelho??''; $('#eModelo').value=v.modeloAparelho||''; $('#eImei').value=v.imeiAparelho||'';
  if(isVendedor(u)){ $('#eLoja').readOnly=true; $('#eVendedor').readOnly=true; }
  if(isGerente(u)){ $('#eLoja').readOnly=true; }
  show($('#modal'));
}
$('#btnCancel')?.addEventListener('click',()=>hide($('#modal')));
$('#editForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const i=VENDAS.findIndex(v=>v.id===EDIT_ID); if(i<0) return;
  const v=VENDAS[i];
  if(isVendedor(curUser()) && !within30Biz(v)) { toast('Edição permitida por 30 dias úteis.'); return; }
  VENDAS[i]={...v,
    data:$('#eData').value||v.data, loja:$('#eLoja').value||v.loja, vendedor:$('#eVendedor').value||v.vendedor,
    categoria:$('#eCategoria').value||v.categoria, plano:$('#ePlano').value||v.plano,
    ged:($('#eGED').value||'').split('|').map(s=>s.trim()).filter(Boolean),
    contrato:$('#eContrato').value||'', valorAparelho:$('#eValor').value?Number($('#eValor').value):null,
    modeloAparelho:$('#eModelo').value||'', imeiAparelho:$('#eImei').value||''
  };
  await saveK(K.VENDAS,VENDAS); hide($('#modal')); toast('Venda atualizada.'); await log('venda_editada','#'+EDIT_ID);
  renderRegistros(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); renderHeatmap();
});

/* CSV Registros */
$('#btnExportCSV')?.addEventListener('click',()=>{
  const u=curUser(); const lojaFiltro=$('#regLoja')?.value||''; const mesFiltro=$('#regMes')?.value||''; const gedsSel = $('#regGed')?[...$('#regGed').querySelectorAll('input:checked')].map(i=>i.value):[];
  const data=VENDAS.filter(v=>can('sales.view',u,v) && (!lojaFiltro || v.loja===lojaFiltro) && (!mesFiltro || (v.data||'').slice(0,7)===mesFiltro) && (!gedsSel.length || (v.ged||[]).some(g=>gedsSel.includes(g))));
  if(!data.length){toast('Nada para exportar.');return;}
  const head=['Data','Loja','Vendedor','Categoria','Plano','GED','Contrato','Modelo','Valor','IMEI'];
  const rows=data.map(v=>[v.data,v.loja,v.vendedor,v.categoria,v.plano,(v.ged||[]).join('|'),v.contrato||'',v.modeloAparelho||'',v.valorAparelho??'',v.imeiAparelho||'']);
  const csv=[head].concat(rows).map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='vendas.csv'; a.click(); URL.revokeObjectURL(a.href);
});

/* ====== Gráficos (canvas + tooltips HTML) ====== */
const tipEl = document.getElementById('chartTip') || (()=>{const d=document.createElement('div'); d.id='chartTip'; d.className='chart-tip hide'; document.body.appendChild(d); return d;})();
function tipShow(x,y,html){ if(!tipEl) return; tipEl.innerHTML=html; tipEl.style.left=(x+12)+'px'; tipEl.style.top=(y+12)+'px'; tipEl.classList.remove('hide'); }
function tipHide(){ tipEl&&tipEl.classList.add('hide'); }
function ctx(cv){ if(!cv) return null; const c=cv.getContext('2d'); cv.width=cv.clientWidth||800; return c; }
function pal(n,s=0){ return Array.from({length:n},(_,i)=>`hsl(${(s+i*360/n)%360} 75% 50%)`); }

/* Barras */
function bars(cv,labels,values,colors){
  const c=ctx(cv); if(!c) return; const w=cv.width,h=cv.height,pl=52,pr=18,pt=18,pb=30,iw=w-pl-pr,ih=h-pt-pb,max=Math.max(1,...values); const gap=12; const bw=Math.max(16,(iw-gap*(labels.length-1))/Math.max(1,labels.length));
  c.strokeStyle='#e5e7eb'; for(let i=0;i<=4;i++){const y=pt+ih-ih*(i/4); c.beginPath(); c.moveTo(pl,y); c.lineTo(w-pr,y); c.stroke();}
  const shapes=[]; c.font='11px system-ui';
  labels.forEach((lb,i)=>{const x=pl+i*(bw+gap),bh=ih*(values[i]/max),y=pt+ih-bh;c.fillStyle=colors[i%colors.length]; c.fillRect(x,y,bw,bh); shapes.push({x,y,w:bw,h:bh,label:lb,value:values[i]}); c.fillStyle='#111827'; const v=String(values[i]); c.fillText(v,x+bw/2-c.measureText(v).width/2,y-6); c.fillStyle='#475569'; const s=lb.length>14?lb.slice(0,13)+'…':lb; c.fillText(s,x+bw/2-c.measureText(s).width/2,h-8);});
  cv.onmousemove=(e)=>{ const r=cv.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const hit=shapes.find(s=>x>=s.x && x<=s.x+s.w && y>=s.y && y<=s.y+s.h); if(hit) tipShow(e.clientX,e.clientY,`<b>${hit.label}</b>: ${hit.value}`); else tipHide(); };
  cv.onmouseleave=tipHide;
}

/* Donut simples */
function donut(cv,labels,values,colors){
  const c=ctx(cv); if(!c) return; const w=cv.width,h=cv.height,tot=values.reduce((a,b)=>a+b,0)||1,cx=w/2,cy=h/2,r=Math.min(w,h)/2-18,ri=r*0.6; let a0=-Math.PI/2;
  const shapes=[]; values.forEach((v,i)=>{const a=(v/tot)*Math.PI*2;c.beginPath();c.moveTo(cx,cy);c.fillStyle=colors[i%colors.length];c.arc(cx,cy,r,a0,a0+a);c.fill(); shapes.push({i,from:a0,to:a0+a,label:labels[i],value:v}); a0+=a;});
  c.globalCompositeOperation='destination-out';c.beginPath();c.arc(cx,cy,ri,0,Math.PI*2);c.fill(); c.globalCompositeOperation='source-over';
  c.fillStyle='#0f172a'; c.font='bold 16px system-ui'; const txt=values.reduce((a,b)=>a+b,0)+' vendas'; c.fillText(txt,cx-c.measureText(txt).width/2,cy+6);
  cv.onmousemove=(e)=>{ const r=cv.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const dx=x-cx, dy=y-cy, ang=Math.atan2(dy,dx), dist=Math.sqrt(dx*dx+dy*dy); let A=ang< -Math.PI/2?ang+Math.PI*2:ang; const hit=dist<=r && dist>=ri && shapes.find(s=>A>=s.from && A<=s.to); if(hit) tipShow(e.clientX,e.clientY,`<b>${hit.label}</b>: ${hit.value}`); else tipHide(); };
  cv.onmouseleave=tipHide;
}

/* Donut com % central (Total Meta × Real) */
function donutPct(cv, meta, real, colors=['#94a3b8','#22c55e']){
  const c = ctx(cv); if(!c) return;
  const w=cv.width, h=cv.height, cx=w/2, cy=h/2;
  const r=Math.min(w,h)/2-18, ri=r*0.6;

  meta = Number(meta)||0; real = Number(real)||0;
  const tot = Math.max(1, meta);
  const pct = Math.round((real/tot)*100);

  let a0=-Math.PI/2;
  const values=[meta-real<0?0:meta-real, real];
  values.forEach((v,i)=>{
    const a=(v/tot)*Math.PI*2;
    c.beginPath(); c.moveTo(cx,cy);
    c.fillStyle = colors[i%colors.length];
    c.arc(cx,cy,r,a0,a0+a); c.fill(); a0+=a;
  });

  c.globalCompositeOperation='destination-out';
  c.beginPath(); c.arc(cx,cy,ri,0,Math.PI*2); c.fill();
  c.globalCompositeOperation='source-over';

  c.fillStyle='#0f172a';
  c.font='bold 22px system-ui';
  const t1=`${Math.max(0,Math.min(999,pct))}%`;
  c.fillText(t1, cx - c.measureText(t1).width/2, cy-2);

  c.font='12px system-ui';
  c.fillStyle='#475569';
  const t2=`${real}/${meta} (real/meta)`;
  c.fillText(t2, cx - c.measureText(t2).width/2, cy+16);

  cv.onmousemove=(e)=>{
    tipShow(e.clientX,e.clientY, `<b>Total Meta × Real</b><br>Meta: ${meta}<br>Real: ${real}<br><b>${pct}%</b>`);
  };
  cv.onmouseleave=tipHide;
}

/* ====== Relatórios ====== */
function ensureVendFiltro(){
  const box=$('#rVendedores'); if(!box) return;
  const u=curUser(); const set=new Set();
  if(isAdminLike(u)){ USERS.filter(x=>x.role==='vendedor').forEach(x=>set.add(x.username)); }
  else if(isGerente(u)){ USERS.filter(x=>x.role==='vendedor'&&x.loja===u.loja).forEach(x=>set.add(x.username)); set.add(u.username); }
  else { set.add(u.username); }
  VENDAS.forEach(v=>set.add(v.vendedor));
  box.innerHTML=[...set].sort().map(v=>`<label><input type="checkbox" value="${v}" checked> ${v}</label>`).join('');
}
function hydrateRelatorioFiltros(){
  $('#rMes')&&( $('#rMes').value=YM_NOW );
  $('#rLojas')&&( $('#rLojas').innerHTML=LOJAS.map(l=>`<label><input type="checkbox" value="${l}" checked> ${l}</label>`).join('') );
  const planos=[...PLANS['Móvel'],...PLANS['Residencial']];
  $('#rPlanos')&&( $('#rPlanos').innerHTML=planos.map(p=>`<label><input type="checkbox" value="${p}" checked> ${p}</label>`).join('') );
  const allGed=[...GED_MOV,...GED_RES];
  $('#rGeds')&&( $('#rGeds').innerHTML=allGed.map(g=>`<label><input type="checkbox" value="${g}" checked> ${g}</label>`).join('') );
  ensureVendFiltro();
}
function renderRelatorios(){
  const ym=$('#rMes')?.value||YM_NOW;
  const lojas=$('#rLojas')?[...$('#rLojas').querySelectorAll('input:checked')].map(i=>i.value):[];
  const vends=$('#rVendedores')?[...$('#rVendedores').querySelectorAll('input:checked')].map(i=>i.value):[];
  const planosSel=$('#rPlanos')?[...$('#rPlanos').querySelectorAll('input:checked')].map(i=>i.value):[];
  const geds=$('#rGeds')?[...$('#rGeds').querySelectorAll('input:checked')].map(i=>i.value):[];
  const u=curUser();

  const data=VENDAS.filter(v=>(v.data||'').slice(0,7)===ym &&
    (!lojas.length||lojas.includes(v.loja)) &&
    (!vends.length||vends.includes(v.vendedor)) &&
    (!planosSel.length||planosSel.includes(v.plano)) &&
    (!geds.length||(v.ged||[]).some(g=>geds.includes(g))) &&
    can('sales.view',u,v));

  setText('#kpiTotal',data.length);
  setText('#kpiMovel',data.filter(v=>v.categoria==='Móvel').length);
  setText('#kpiResid',data.filter(v=>v.categoria==='Residencial').length);
  const rec=data.filter(v=>v.plano==='Aparelho').reduce((s,v)=>s+(+v.valorAparelho||0),0);
  setText('#kpiRecVal', rec.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));

  const kpibox = $('#kpiPlanos');
  if(kpibox){
    const planosTodos=[...PLANS['Móvel'],...PLANS['Residencial']];
    kpibox.innerHTML = planosTodos.map(p => {
      const qtd = data.filter(v=>v.plano===p).length;
      return `<div class="card kpi"><div class="kpi__label">${p}</div><div class="kpi__value">${qtd}</div></div>`;
    }).join('');
  }

  const mL={},mP={},mV={};
  data.forEach(v=>{mL[v.loja]=(mL[v.loja]||0)+1; mP[v.plano]=(mP[v.plano]||0)+1; mV[v.vendedor]=(mV[v.vendedor]||0)+1;});
  donut($('#chDonut'), ['Móvel','Residencial'], [data.filter(x=>x.categoria==='Móvel').length,data.filter(x=>x.categoria==='Residencial').length], DONUT_PALETTE);
  bars($('#chLojas'), Object.keys(mL), Object.values(mL), pal(Object.keys(mL).length,20));
  bars($('#chPlano'), Object.keys(mP), Object.values(mP), pal(Object.keys(mP).length,200));
  bars($('#chVendedor'), Object.keys(mV), Object.values(mV), pal(Object.keys(mV).length,120));
}
['#rMes','#rLojas','#rVendedores','#rPlanos','#rGeds'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change',renderRelatorios); });
$('#btnPrint')?.addEventListener('click',()=>window.print());

/* ====== Metas ====== */
const metaPath=(ym,loja)=>(METAS[ym]=METAS[ym]||{}, METAS[ym][loja]=METAS[ym][loja]||{}, METAS[ym][loja]);
const metaGet=(ym,loja,pl)=>Number((METAS[ym]&&METAS[ym][loja]&&METAS[ym][loja][pl])||0);
const metaSet=async(ym,loja,pl,val)=>{metaPath(ym,loja)[pl]=Number(val||0); await saveK(K.META,METAS);};
const metaVPath=(ym,loja,v)=>(METASV[ym]=METASV[ym]||{}, METASV[ym][loja]=METASV[ym][loja]||{}, METASV[ym][loja][v]=METASV[ym][loja][v]||{}, METASV[ym][loja][v]);
const metaVGet=(ym,loja,v,pl)=>Number(((METASV[ym]||{})[loja]||{})[v]?.[pl]||0);
const metaVSet=async(ym,loja,v,pl,val)=>{metaVPath(ym,loja,v)[pl]=Number(val||0); await saveK(K.METAV,METASV);};
const okGED=(pl)=> (PLANS['Móvel'].includes(pl)?'CO':'Conectado');
const realizadosLoja=(ym,lojas,pl)=> VENDAS.filter(v=>(v.data||'').slice(0,7)===ym && lojas.includes(v.loja) && v.plano===pl && (v.ged||[]).includes(okGED(pl))).length;
const realizadosVend=(ym,loja,vend,pl)=> VENDAS.filter(v=>(v.data||'').slice(0,7)===ym && v.loja===loja && v.vendedor===vend && v.plano===pl && (v.ged||[]).includes(okGED(pl))).length;
const tendencia=(real,ym)=>{const [ys,ms]=ym.split('-');const y=+ys,m=+ms-1;const tot=bizInMonth(y,m);const today=new Date();const d=(today.getFullYear()===y&&today.getMonth()===m)?today.getDate():new Date(y,m+1,0).getDate();const perc=bizUntil(y,m,d);return perc?Math.round((real/perc)*tot):0;};

function renderMetaLoja(){
  const ym=$('#metaMes')?.value||YM_NOW; const cl=$('#clMetaLojas'); if(!cl) return;
  const lojas=[...cl.querySelectorAll('input:checked')].map(i=>i.value);
  const tb=$('#tbodyMeta'); if(!tb) return;
  if(!lojas.length){ tb.innerHTML='<tr><td colspan="5">Selecione ao menos uma loja.</td></tr>'; return; }
  const planos=[...PLANS['Móvel'],...PLANS['Residencial']]; const metas=[],reals=[],labels=[];
  tb.innerHTML = planos.map(pl=>{ const m=lojas.reduce((a,l)=>a+metaGet(ym,l,pl),0); const r=realizadosLoja(ym,lojas,pl); metas.push(m); reals.push(r); labels.push(pl);
    const pct=m>0?Math.round((r/m)*100):(r>0?100:0); const tend=tendencia(r,ym); const pctT=m>0?Math.round((tend/m)*100):(tend>0?100:0);
    const cls=pct>=100?'ok':(pct>=80?'warn':'bad'); const clsT=pctT>=100?'ok':(pctT>=80?'warn':'bad');
    return `<tr><td>${pl}</td><td>${m}</td><td>${r}</td><td><span class="pct ${cls}">${pct}%</span><div class="progress"><span style="width:${Math.min(pct,100)}%;background:${pct>=100?THEME.ok:(pct>=80?THEME.warn:THEME.bad)}"></span></div></td><td><span class="pct ${clsT}">${pctT}%</span></td></tr>`; }).join('');
  bars($('#chMetaLojaBar'), labels, metas.map((m,i)=>Math.max(m,reals[i])), pal(labels.length,0));
  const cv1=$('#chMetaLojaMxR'), cv2=$('#chMetaLojaDonut'); if(cv1){ const c=cv1.getContext('2d'); cv1.width=cv1.clientWidth||800; c.clearRect(0,0,cv1.width,cv1.height); bars(cv1, labels, metas, Array(labels.length).fill('#94a3b8')); bars(cv1, labels, reals, Array(labels.length).fill('#22c55e')); }
  if(cv2){ const metaTotal = metas.reduce((a,b)=>a+b,0); const realTotal = reals.reduce((a,b)=>a+b,0); donutPct(cv2, metaTotal, realTotal, ['#94a3b8','#22c55e']); }
}
$('#btnMetaSalvar')?.addEventListener('click',async()=>{
  const u=curUser(); if(!isAdminLike(u)&&!isGerente(u)) return toast('Sem permissão.');
  const ym=$('#metaMes')?.value||YM_NOW; const lojas=[...$('#clMetaLojas').querySelectorAll('input:checked')].map(i=>i.value);
  if(isGerente(u)&&lojas.some(l=>l!==u.loja)) return toast('Gerente só pode sua loja.');
  const planos=[...PLANS['Móvel'],...PLANS['Residencial']];
  for(const loja of lojas){ for(const pl of planos){ const cur=metaGet(ym,loja,pl); const nv=prompt(`Meta ${loja} • ${pl}`,String(cur)); if(nv!==null&&nv!=='') await metaSet(ym,loja,pl,Number(nv)); } }
  toast('Metas salvas.'); renderMetaLoja();
});

function fillMetaVendedores(){
  const loja=$('#metaVLoja')?.value||LOJAS[0]; const sel=$('#metaVVendedor'); if(!sel) return;
  const set=new Set(USERS.filter(u=>u.role==='vendedor'&&u.loja===loja).map(u=>u.username)); VENDAS.filter(v=>v.loja===loja).forEach(v=>set.add(v.vendedor));
  sel.innerHTML=[...set].sort().map(v=>`<option>${v}</option>`).join('');
}
$('#metaVLoja')?.addEventListener('change',()=>{fillMetaVendedores(); renderMetaVend();});
$('#metaVMes')?.addEventListener('change',renderMetaVend);
$('#metaVVendedor')?.addEventListener('change',renderMetaVend);

function renderMetaVend(){
  const tb=$('#tbodyMetaV'); if(!tb) return;
  const u=curUser(); const ym=$('#metaVMes')?.value||YM_NOW; const loja=$('#metaVLoja')?.value||LOJAS[0]; const vendedor=$('#metaVVendedor')?.value||'';
  if(isVendedor(u)){ if($('#metaVLoja')){$('#metaVLoja').value=u.loja; $('#metaVLoja').disabled=true;} if($('#metaVVendedor')){$('#metaVVendedor').value=u.username; $('#metaVVendedor').disabled=true;} }
  const planos=[...PLANS['Móvel'],...PLANS['Residencial']]; const metas=[],reals=[],labels=[];
  tb.innerHTML = planos.map(pl=>{ const m=metaVGet(ym,loja,vendedor,pl); const r=realizadosVend(ym,loja,vendedor,pl); metas.push(m); reals.push(r); labels.push(pl);
    const pct=m>0?Math.round((r/m)*100):(r>0?100:0); const t=tendencia(r,ym); const pctT=m>0?Math.round((t/m)*100):(t>0?100:0);
    const cls=pct>=100?'ok':(pct>=80?'warn':'bad'); const clsT=pctT>=100?'ok':(pctT>=80?'warn':'bad');
    const dis=isVendedor(u)?'disabled':''; return `<tr><td>${pl}</td>
      <td><input type="number" min="0" value="${m}" data-plano="${pl}" class="inpMetaV" ${dis}></td>
      <td>${r}</td><td><span class="pct ${cls}">${pct}%</span><div class="progress"><span style="width:${Math.min(pct,100)}%;background:${pct>=100?THEME.ok:(pct>=80?THEME.warn:THEME.bad)}"></span></div></td>
      <td><span class="pct ${clsT}">${pctT}%</span></td></tr>`; }).join('');
  bars($('#chMetaVendBar'), labels, metas.map((m,i)=>Math.max(m,reals[i])), pal(labels.length,210));
  const cv=$('#chMetaVendMxR'); if(cv){ const c=cv.getContext('2d'); cv.width=cv.clientWidth||800; c.clearRect(0,0,cv.width,cv.height); bars(cv, labels, metas, Array(labels.length).fill('#94a3b8')); bars(cv, labels, reals, Array(labels.length).fill('#22c55e')); }
  { const cvd = document.getElementById('chMetaVendDonut'); const metaTotal = metas.reduce((a,b)=>a+b,0); const realTotal = reals.reduce((a,b)=>a+b,0); donutPct(cvd, metaTotal, realTotal, ['#94a3b8','#22c55e']); }
}
$('#btnMetaVSalvar')?.addEventListener('click',async()=>{
  const u=curUser(); if(!isAdminLike(u)&&!isGerente(u)) return toast('Sem permissão.');
  const ym=$('#metaVMes')?.value||YM_NOW, loja=$('#metaVLoja')?.value||LOJAS[0], vendedor=$('#metaVVendedor')?.value||'';
  $$('.inpMetaV').forEach(inp=>metaVSet(ym,loja,vendedor, inp.getAttribute('data-plano'), Number(inp.value||0)));
  toast('Metas do vendedor salvas.');
});

/* Heatmap (com TOOLTIP detalhado) — vendedor vê apenas o próprio */
function renderHeatmap(){
  const cv=$('#chHeatmap'); if(!cv) return;
  const u=curUser();
  const ym=$('#metaHMes')?.value||YM_NOW;
  let loja = isVendedor(u)? u.loja : ($('#metaHLoja')?.value||LOJAS[0]);

  let vends=[];
  if (isVendedor(u)) vends=[u.username];
  else {
    const set=new Set(); USERS.filter(x=>x.role==='vendedor'&&x.loja===loja).forEach(x=>set.add(x.username)); VENDAS.filter(v=>v.loja===loja).forEach(v=>set.add(v.vendedor));
    vends=[...set].sort(); if(!vends.length) vends=['(sem vendedores)'];
  }
  const planos=[...PLANS['Móvel'],...PLANS['Residencial']];

  const c=cv.getContext('2d'); cv.width=cv.clientWidth||900; const w=cv.width,h=cv.height,ml=120,mt=28,mr=16,mb=42,cols=planos.length,rows=vends.length||1,cw=(w-ml-mr)/Math.max(cols,1),ch=(h-mt-mb)/Math.max(rows,1);
  c.clearRect(0,0,w,h); c.strokeStyle='#e5e7eb'; c.strokeRect(ml,mt,w-ml-mr,h-mt-mb); c.fillStyle='#334155'; c.font='12px system-ui';
  planos.forEach((p,j)=>{const x=ml+j*cw+cw/2; const t=p.length>12?p.slice(0,11)+'…':p; c.fillText(t,x-c.measureText(t).width/2,mt-6);});
  vends.forEach((v,i)=>{const y=mt+i*ch+ch/2+4; c.fillText(v,10,y);});

  const cells=[];
  vends.forEach((vend,i)=>planos.forEach((pl,j)=>{
    const meta=metaVGet(ym,loja,vend,pl); const real=realizadosVend(ym,loja,vend,pl); const pct=meta>0?Math.round((real/meta)*100):(real>0?100:0);
    let col=THEME.bad; if(pct>=100) col=THEME.ok; else if(pct>=80) col=THEME.warn;
    const x=ml+j*cw, y=mt+i*ch; c.fillStyle=col; c.fillRect(x+1,y+1,cw-2,ch-2);
    c.fillStyle='#111827'; c.font='bold 11px system-ui'; const t=pct+'%'; c.fillText(t,x+cw/2-c.measureText(t).width/2,y+ch/2+4);
    cells.push({x:x+1,y:y+1,w:cw-2,h:ch-2,vendedor:vend, plano:pl, meta, realizado:real, pct});
  }));
  cv.onmousemove=(e)=>{ const r=cv.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const hit=cells.find(s=>x>=s.x && x<=s.x+s.w && y>=s.y && y<=s.y+s.h); 
    if(hit) tipShow(e.clientX,e.clientY,`<b>${hit.vendedor}</b> — ${hit.plano}<br>Meta: ${hit.meta}<br>Realizado: ${hit.realizado}<br><b>Atingimento:</b> ${hit.pct}%`); else tipHide(); };
  cv.onmouseleave=tipHide;
}

/* Limitar Meta p/ vendedor: SOMENTE o próprio Heatmap */
function lockMetaForSeller(){
  const u = curUser();
  if (!u || !isVendedor(u)) return;

  const meta = document.getElementById('meta');
  if (!meta) return;

  // Esconde tudo dentro de Meta (tabelas/gráficos de loja e vendedor)
  meta.querySelectorAll('.header-row, .grid, .table-wrap, table, #btnMetaSalvar, #btnMetaVSalvar, h4, h3')
      .forEach(el => el.classList.add('hide'));

  // Mostra apenas o card do Heatmap e seus filtros
  const heatCard = document.getElementById('chHeatmap')?.closest('.card');
  if (heatCard) {
    heatCard.classList.remove('hide');
    const filt = heatCard.querySelector('.filters');
    if (filt) filt.classList.remove('hide');
  }

  // Ajusta filtros do Heatmap para a loja do vendedor e bloqueia edição
  const sLoja = document.getElementById('metaHLoja');
  if (sLoja) {
    sLoja.innerHTML = `<option>${u.loja}</option>`;
    sLoja.value = u.loja;
    sLoja.disabled = true;
  }

  const sMes = document.getElementById('metaHMes');
  if (sMes && !sMes.value) sMes.value = new Date().toISOString().slice(0,7);

  renderHeatmap();
}

/* ====== Administração ====== */
function renderUsers(){
  const tb=$('#tbodyUsers'); if(!tb) return;
  tb.innerHTML=USERS.map(u=>`<tr><td>${u.username}</td><td>${u.loja||''}</td><td>${u.role}</td><td>${u.status==='inativo'?'inativo':'ativo'}</td>
  <td><button class="btn ghost toggle" data-u="${u.username}">${u.status==='inativo'?'Ativar':'Inativar'}</button>
  <button class="btn ghost editU" data-u="${u.username}">Editar</button></td></tr>`).join('');
  $$('.toggle').forEach(b=>b.onclick=async()=>{ const u=USERS.find(x=>x.username===b.dataset.u); if(!u) return; if(isAdminLike(u)) return toast('Não pode inativar admin/backoffice/dono.'); u.status = (u.status==='inativo')?'ativo':'inativo'; await saveK(K.USERS,USERS); await log(u.status==='ativo'?'ativado':'inativado',u.username); renderUsers(); renderAudit(); });
  $$('.editU').forEach(b=>b.onclick=async()=>{ const u=USERS.find(x=>x.username===b.dataset.u); if(!u) return;
    const newRole=prompt(`Novo papel (${ROLES.join(', ')})`,u.role); if(newRole && ROLES.includes(newRole)) u.role=newRole;
    const np=prompt('Nova senha (em branco = manter)',''); if(np){ u.passwordHash=await hashPass(u.username,np); }
    await saveK(K.USERS,USERS); await log('usuario_editado',u.username); renderUsers();
  });
}
$('#userForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault(); const username=$('#uUsername').value.trim(), pass=$('#uPass').value.trim(), loja=$('#uLoja').value, role=$('#uRole').value;
  if(!username||!pass) return toast('Preencha usuário e senha.');
  if(USERS.some(u=>u.username.toLowerCase()===username.toLowerCase())) return toast('Usuário já existe.');
  USERS.push({username,passwordHash:await hashPass(username,pass),loja,role,status:'ativo',lastLogin:null});
  await saveK(K.USERS,USERS); await log('usuario_criado',username); renderUsers(); e.target.reset();
});
function renderLojasRoles(){
  $('#uLoja')&&( $('#uLoja').innerHTML=LOJAS.map(l=>`<option>${l}</option>`).join('') );
  $('#uRole')&&( $('#uRole').innerHTML=ROLES.map(r=>`<option>${r}</option>`).join('') );
  const tl=$('#tbodyLojas'); if(tl) tl.innerHTML=LOJAS.map(l=>`<tr><td>${l}</td><td><button class="btn ghost editL" data-loja="${l}">Editar</button><button class="btn ghost delL" data-loja="${l}">Excluir</button></td></tr>`).join('');
  const tr=$('#tbodyRoles'); if(tr) tr.innerHTML=ROLES.map(r=>`<tr><td>${r}</td><td><button class="btn ghost editR" data-role="${r}">Editar</button><button class="btn ghost delR" data-role="${r}">Excluir</button></td></tr>`).join('');
  $$('.editL').forEach(b=>b.onclick=async()=>{const old=b.dataset.loja; const nv=prompt('Renomear loja:',old); if(!nv||nv===old) return; if(LOJAS.includes(nv)) return toast('Já existe.');
    LOJAS=LOJAS.map(x=>x===old?nv:x); USERS.forEach(u=>{if(u.loja===old)u.loja=nv;}); VENDAS.forEach(v=>{if(v.loja===old)v.loja=nv;});
    Object.keys(METAS).forEach(ym=>{ if(METAS[ym][old]){ METAS[ym][nv]=METAS[ym][old]; delete METAS[ym][old]; }});
    Object.keys(METASV).forEach(ym=>{ if(METASV[ym][old]){ METASV[ym][nv]=METASV[ym][old]; delete METASV[ym][old]; }});
    await saveK(K.LOJAS,LOJAS); await saveK(K.USERS,USERS); await saveK(K.VENDAS,VENDAS); await saveK(K.META,METAS); await saveK(K.METAV,METASV);
    renderLojasRoles(); renderUsers(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); toast('Loja renomeada.');
  });
  $$('.delL').forEach(b=>b.onclick=async()=>{const name=b.dataset.loja; if(USERS.some(u=>u.loja===name)||VENDAS.some(v=>v.loja===name)) return toast('Loja em uso.'); if(!confirm(`Excluir ${name}?`)) return;
    LOJAS=LOJAS.filter(x=>x!==name); Object.keys(METAS).forEach(ym=>{ delete METAS[ym][name]; }); Object.keys(METASV).forEach(ym=>{ delete METASV[ym][name]; });
    await saveK(K.LOJAS,LOJAS); await saveK(K.META,METAS); await saveK(K.METAV,METASV); renderLojasRoles(); renderMetaLoja(); renderMetaVend(); renderRelatorios(); toast('Loja excluída.');
  });
  $$('.editR').forEach(b=>b.onclick=async()=>{ const old=b.dataset.role; const nv=prompt('Renomear papel:',old); if(!nv||nv===old) return; if(ROLES.includes(nv)) return toast('Já existe um papel com esse nome.');
    ROLES=ROLES.map(x=>x===old?nv:x); USERS.forEach(u=>{ if(u.role===old) u.role=nv; });
    await saveK(K.ROLES,ROLES); await saveK(K.USERS,USERS); renderLojasRoles(); renderUsers(); toast('Papel renomeado.');
  });
  $$('.delR').forEach(b=>b.onclick=async()=>{const name=b.dataset.role; if(['admin','backoffice','dono','gerente','vendedor'].includes(name)) return toast('Papel protegido.');
    if(USERS.some(u=>u.role===name)) return toast('Papel em uso.'); if(!confirm(`Excluir ${name}?`)) return; ROLES=ROLES.filter(r=>r!==name);
    await saveK(K.ROLES,ROLES); renderLojasRoles(); toast('Papel excluído.');
  });
}
$('#btnAddLoja')?.addEventListener('click',async()=>{ const n=$('#novaLoja').value.trim(); if(!n) return; if(LOJAS.includes(n)) return toast('Loja já existe.'); LOJAS.push(n); await saveK(K.LOJAS,LOJAS); renderLojasRoles(); toast('Loja adicionada.'); });
$('#btnAddRole')?.addEventListener('click',async()=>{ const n=$('#novoPapel').value.trim(); if(!n) return; if(ROLES.includes(n)) return toast('Papel já existe.'); ROLES.push(n); await saveK(K.ROLES,ROLES); renderLojasRoles(); toast('Papel adicionado.'); });

/* Planos */
function renderPlans(){
  const tb=$('#tbodyPlan'); if(!tb) return;
  const rows=[]; Object.keys(PLANS).forEach(cat=>PLANS[cat].forEach(p=>rows.push(`<tr><td>${cat}</td><td>${p}</td><td><button class="btn ghost editP" data-cat="${cat}" data-p="${p}">Editar</button><button class="btn ghost delP" data-cat="${cat}" data-p="${p}">Excluir</button></td></tr>`)));
  tb.innerHTML=rows.join('');
  $$('.editP').forEach(b=>b.onclick=async()=>{ const cat=b.dataset.cat, old=b.dataset.p; const nv=prompt(`Renomear plano (${cat})`,old); if(!nv||nv===old) return; if(PLANS[cat].includes(nv)) return toast('Já existe.');
    const i=PLANS[cat].indexOf(old); if(i>-1) PLANS[cat][i]=nv;
    VENDAS.forEach(v=>{if(v.plano===old) v.plano=nv;});
    Object.keys(METAS).forEach(ym=>Object.keys(METAS[ym]).forEach(loja=>{ if(METAS[ym][loja][old]!=null){ METAS[ym][loja][nv]=METAS[ym][loja][old]; delete METAS[ym][loja][old]; }}));
    Object.keys(METASV).forEach(ym=>Object.keys(METASV[ym]).forEach(loja=>Object.keys(METASV[ym][loja]).forEach(v=>{ if(METASV[ym][loja][v][old]!=null){ METASV[ym][loja][v][nv]=METASV[ym][loja][v][old]; delete METASV[ym][loja][v][old]; } })));
    await saveK(K.PLANS,PLANS); await saveK(K.VENDAS,VENDAS); await saveK(K.META,METAS); await saveK(K.METAV,METASV);
    renderPlans(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); toast('Plano renomeado.');
  });
  $$('.delP').forEach(b=>b.onclick=async()=>{ const cat=b.dataset.cat, plan=b.dataset.p;
    const inUse = VENDAS.some(v=>v.plano===plan) || Object.values(METAS).some(mL=>Object.values(mL).some(o=>o[plan]>0)) || Object.values(METASV).some(mL=>Object.values(mL).some(mV=>Object.values(mV).some(o=>o[plan]>0)));
    if(inUse) return toast('Plano em uso.'); if(!confirm(`Excluir plano ${plan}?`)) return;
    PLANS[cat]=PLANS[cat].filter(p=>p!==plan); await saveK(K.PLANS,PLANS); renderPlans(); toast('Plano excluído.');
  });
}
$('#planForm')?.addEventListener('submit',async(e)=>{e.preventDefault(); const cat=$('#planCat').value, nome=$('#planNome').value.trim(); if(!nome) return; if(PLANS[cat].includes(nome)) return toast('Plano já existe.'); PLANS[cat].push(nome); await saveK(K.PLANS,PLANS); renderPlans(); toast('Plano adicionado.');});

/* ====== Backup / Import / Mesclar / CSVs BI ====== */
function asArray(x){ return Array.isArray(x) ? x : (x ? [x] : []); }
function normalizeBackup(j){
  return { users: asArray(j.users), vendas: asArray(j.vendas), metasLoja: j.metasLoja||{}, metasVendedor: j.metasVendedor||{},
           auditoria: asArray(j.auditoria), lojas: asArray(j.lojas), papeis: asArray(j.papeis), plans: j.plans||{"Móvel":[],"Residencial":[]}, version: j.version||"unknown" };
}
function vendaKey(v){ return [v.data||'',v.loja||'',v.vendedor||'',v.categoria||'',v.plano||'',(v.contrato||''),(asArray(v.ged).join('|')),(v.imeiAparelho||'')].join('§'); }

function mergeUsers(into, add){ let novos=0, duplic=0; add.forEach(u=>{ const i=into.findIndex(x=>x.username===u.username); if(i<0){ into.push({...u}); novos++; } else duplic++; }); return {novos,duplic}; }
function mergeVendas(into, add){
  const seen = new Set(into.map(v=>v.id).filter(Boolean));
  const seenKey = new Set(into.map(v=>vendaKey(v)));
  let novos=0, duplic=0;
  add.forEach(v=>{
    const k = vendaKey(v);
    if(seenKey.has(k)) { duplic++; return; }
    let id = v.id || uuid(); if(seen.has(id)) id=uuid();
    into.push({...v, id}); seen.add(id); seenKey.add(k); novos++;
  });
  return {novos,duplic};
}
function mergeMetasLoja(into, add){ Object.keys(add).forEach(ym=>{ into[ym]=into[ym]||{}; Object.keys(add[ym]).forEach(loja=>{ into[ym][loja]=into[ym][loja]||{}; Object.keys(add[ym][loja]).forEach(pl=>{ const vAdd=Number(add[ym][loja][pl]||0), vCur=Number(into[ym][loja][pl]||0); into[ym][loja][pl]=Math.max(vCur,vAdd); }); }); }); }
function mergeMetasVend(into, add){ Object.keys(add).forEach(ym=>{ into[ym]=into[ym]||{}; Object.keys(add[ym]).forEach(loja=>{ into[ym][loja]=into[ym][loja]||{}; Object.keys(add[ym][loja]).forEach(vend=>{ into[ym][loja][vend]=into[ym][loja][vend]||{}; Object.keys(add[ym][loja][vend]).forEach(pl=>{ const vAdd=Number(add[ym][loja][vend][pl]||0), vCur=Number(into[ym][loja][vend][pl]||0); into[ym][loja][vend][pl]=Math.max(vCur,vAdd); }); }); }); }); }
function mergeAuditoria(into, add){ add.forEach(a=>{ into.push({ id: a.id||uuid(), ts: a.ts||new Date().toISOString(), user: a.user||'-', event:a.event||'', detail:a.detail||'' }); }); into.sort((a,b)=> (b.ts||'').localeCompare(a.ts||'')); }
function mergeLojas(into, add){ add.forEach(l=>{ if(!into.includes(l)) into.push(l); }); }
function mergePapeis(into, add){ add.forEach(r=>{ if(!into.includes(r)) into.push(r); }); }
function mergePlans(into, add){ ['Móvel','Residencial'].forEach(cat=>{ const cur=into[cat]=into[cat]||[]; const nx=asArray(add[cat]); nx.forEach(p=>{ if(!cur.includes(p)) cur.push(p); }); }); }

async function previewMerge(files){
  const readers = files.map(f=> new Promise((res,rej)=>{ const fr = new FileReader(); fr.onload=()=>{ try{ res(JSON.parse(fr.result||'{}')); }catch(e){ rej(e);} }; fr.onerror=rej; fr.readAsText(f); }));
  const results = await Promise.allSettled(readers);
  const oks = results.filter(r=>r.status==='fulfilled').map(r=>normalizeBackup(r.value));
  if(!oks.length) throw new Error('Nenhum JSON válido');

  const curKeys = new Set(VENDAS.map(v=>vendaKey(v)));
  const curUsers = new Set(USERS.map(u=>u.username));

  let addSales=0, dupSales=0, addUsers=0, dupUsers=0;
  oks.forEach(pkg=>{
    pkg.vendas.forEach(v=>{ curKeys.has(vendaKey(v)) ? dupSales++ : addSales++; });
    pkg.users.forEach(u=>{ curUsers.has(u.username) ? dupUsers++ : addUsers++; });
  });
  return {files:oks.length, addSales, dupSales, addUsers, dupUsers, oks};
}

$('#btnExport')?.addEventListener('click',async()=>{
  const payload={users:USERS,vendas:VENDAS,metasLoja:METAS,metasVendedor:METASV,auditoria:AUDIT,lojas:LOJAS,papeis:ROLES,plans:PLANS,version:APP_VERSION};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})); a.download='claro-vendas-backup-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json'; a.click(); URL.revokeObjectURL(a.href); toast('Backup exportado.');
});
$('#importFile')?.addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=async()=>{ try{ const j=JSON.parse(r.result||'{}');
    const pkg=normalizeBackup(j);
    USERS=pkg.users; VENDAS=pkg.vendas; METAS=pkg.metasLoja; METASV=pkg.metasVendedor; AUDIT=pkg.auditoria; LOJAS=pkg.lojas; ROLES=pkg.papeis; PLANS=pkg.plans;
    await saveK(K.USERS,USERS); await saveK(K.VENDAS,VENDAS); await saveK(K.META,METAS); await saveK(K.METAV,METASV); await saveK(K.AUD,AUDIT); await saveK(K.LOJAS,LOJAS); await saveK(K.ROLES,ROLES); await saveK(K.PLANS,PLANS);
    hydrateSelects(); renderUsers(); renderLojasRoles(); renderPlans(); renderRegistros(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); renderAudit(); renderHeatmap();
    toast('Backup importado.');
  }catch{ toast('JSON inválido.'); } }; r.readAsText(f);
});

$('#btnMerge')?.addEventListener('click',async()=>{
  const input=$('#mergeFiles'); if(!input?.files?.length) return toast('Selecione JSON(s) para mesclar.');
  let prev; try{ prev = await previewMerge(Array.from(input.files)); }catch{ return toast('Falha ao pré-visualizar.'); }
  if(!confirm(`Prévia de Mescla:\nArquivos: ${prev.files}\nVendas novas: ${prev.addSales}\nVendas duplicadas: ${prev.dupSales}\nUsuários novos: ${prev.addUsers}\nUsuários duplicados: ${prev.dupUsers}\n\nConfirmar mescla?`)) return;

  const oks = prev.oks;
  let uStats={novos:0,duplic:0}, vStats={novos:0,duplic:0};
  oks.forEach(pkg=>{
    const u = mergeUsers(USERS, pkg.users); uStats.novos+=u.novos; uStats.duplic+=u.duplic;
    const v = mergeVendas(VENDAS, pkg.vendas); vStats.novos+=v.novos; vStats.duplic+=v.duplic;
    mergeMetasLoja(METAS, pkg.metasLoja);
    mergeMetasVend(METASV, pkg.metasVendedor);
    mergeAuditoria(AUDIT, pkg.auditoria);
    mergeLojas(LOJAS, pkg.lojas);
    mergePapeis(ROLES, pkg.papeis);
    mergePlans(PLANS, pkg.plans);
  });

  await saveK(K.USERS,USERS); await saveK(K.VENDAS,VENDAS); await saveK(K.META,METAS); await saveK(K.METAV,METASV);
  await saveK(K.AUD,AUDIT); await saveK(K.LOJAS,LOJAS); await saveK(K.ROLES,ROLES); await saveK(K.PLANS,PLANS);

  hydrateSelects(); hydrateRelatorioFiltros(); hydrateRegistrosFiltroLoja(); hydrateRegistrosFiltroGed(); hydrateRegistrosFiltroMes();
  renderUsers(); renderLojasRoles(); renderPlans();
  renderRegistros(); renderRelatorios(); renderMetaLoja(); renderMetaVend(); renderHeatmap(); renderAudit();

  await log('backup_mesclado', `arquivos: ${oks.length}`);
  toast(`Mesclagem concluída: ${vStats.novos} vendas adicionadas (${vStats.duplic} duplicadas ignoradas); ${uStats.novos} usuários novos.`);
});

/* Export CSVs para BI (fato/dim) */
function toCSV(rows){ if(!rows.length) return ''; const cols=Object.keys(rows[0]); const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`; return cols.join(',')+'\n'+rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\n'); }
function exportDimFact(){
  const dimLoja = LOJAS.map(l=>({loja:l}));
  const vends = Array.from(new Set(VENDAS.map(v=>v.vendedor))).filter(Boolean);
  const dimVend = vends.map(v=>({vendedor:v}));
  const planos = Array.from(new Set(VENDAS.map(v=>v.plano))).filter(Boolean);
  const dimPlano = planos.map(p=>({plano:p}));
  const fatoVendas = VENDAS.map(v=>({ id:v.id, data:v.data, ym:v.data?.slice(0,7), loja:v.loja, vendedor:v.vendedor, categoria:v.categoria, plano:v.plano, ged:(v.ged||[]).join('|'), contrato:v.contrato||'', valorAparelho:v.valorAparelho||0, modeloAparelho:v.modeloAparelho||'', imei:v.imeiAparelho||'' }));
  const files=[ ['dim_loja.csv',toCSV(dimLoja)], ['dim_vendedor.csv',toCSV(dimVend)], ['dim_plano.csv',toCSV(dimPlano)], ['fato_vendas.csv',toCSV(fatoVendas)] ];
  files.forEach(([name,content])=>{ const blob=new Blob([content],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); });
  toast('CSVs exportados.');
}
$('#btnExportBI')?.addEventListener('click', exportDimFact);

/* ====== Minha Conta — troca de senha ====== */
function fillAccount(){
  const u = curUser(); if(!u) return;
  $('#accUser') && ($('#accUser').value = u.username);
  $('#accLoja') && ($('#accLoja').value = u.loja || '');
  $('#accRole') && ($('#accRole').value = u.role);
}
document.getElementById('accountForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const u = curUser(); if(!u) return toast('Sessão expirada.');
  const cur = $('#accCur').value, n1 = $('#accNew').value, n2 = $('#accNew2').value;
  if(!cur || !n1 || !n2) return toast('Preencha todos os campos.');
  if(n1 !== n2) return toast('Nova senha e confirmação não conferem.');
  const user = USERS.find(x=>x.username===u.username);
  const chk = await hashPass(user.username, cur);
  if(chk !== user.passwordHash) return toast('Senha atual incorreta.');
  user.passwordHash = await hashPass(user.username, n1);
  await saveK('cv_users', USERS);
  await log('usuario_trocou_senha', user.username);
  e.target.reset();
  toast('Senha atualizada com sucesso.');
});

/* ====== Pós Login / Pop-ups ====== */
function showRoleWelcomePopups(){
  const u=curUser(); if(!u) return;
  if(u.role==='dono'){
    popup('Bem-vindo ao Sistema de Gestão de Vendas da sua empresa.<br>Acesse as abas <b>Relatórios</b> e <b>Meta</b> para acompanhar o resultado das lojas.');
  }
  notifyGerente(u, YM_NOW);
  notifyVendedor(u, YM_NOW);
}
function pctMeta(m,r){ return m>0 ? Math.round((r/m)*100) : (r>0?100:0); }
function notifyGerente(u, ym){
  if(!isGerente(u)) return;
  const loja = u.loja;
  const planos = [...PLANS['Móvel'],...PLANS['Residencial']];
  const msgs=[];
  planos.forEach(pl=>{
    const m = metaGet(ym, loja, pl);
    const r = realizadosLoja(ym, [loja], pl);
    const p = pctMeta(m,r);
    if(p>=100) msgs.push(`Obrigado pela sua dedicação! Sua loja <b>${loja}</b> atingiu <b>100%</b> no plano <b>${pl}</b>.`);
    else if(p>=80) msgs.push(`Parabéns! Sua loja <b>${loja}</b> já está <b>elegível para comissão</b> (≥80%) no plano <b>${pl}</b>.`);
    else if(p>=50) msgs.push(`Sua loja <b>${loja}</b> alcançou <b>50%</b> no plano <b>${pl}</b>. Rumo aos 80%!`);
  });
  if(msgs.length) popup(msgs.join('<br>'));
}
function notifyVendedor(u, ym){
  if(!isVendedor(u)) return;
  const loja = u.loja, vend = u.username;
  const planos = [...PLANS['Móvel'],...PLANS['Residencial']];
  const msgs=[];
  planos.forEach(pl=>{
    const m = metaVGet(ym, loja, vend, pl);
    const r = realizadosVend(ym, loja, vend, pl);
    const p = pctMeta(m,r);
    if(p>=100) msgs.push(`Obrigado pela sua dedicação! Você atingiu <b>100%</b> no plano <b>${pl}</b>.`);
    else if(p>=80) msgs.push(`Parabéns! Você já está <b>elegível para comissão</b> (≥80%) no plano <b>${pl}</b>.`);
    else if(p>=50) msgs.push(`Você alcançou <b>50%</b> no plano <b>${pl}</b>. Rumo aos 80%!`);
  });
  if(msgs.length) popup(msgs.join('<br>'));
}

/* ====== Boot ====== */
function bootAfterLogin(){
  const u=curUser(); if(!u) return;
  badge(u);

  // Menus conforme papel
  $$('.menu a[data-requires="adminLike"]').forEach(a=>{ if(isAdminLike(u)) a.style.display='block'; else a.style.display='none'; });
  if (isVendedor(u)) {
    const allowed = new Set(['lancar','registros','meta','conta']);
    $$('.menu a').forEach(a=>{ if(!allowed.has(a.dataset.view)) a.style.display='none'; });
  } else {
    document.querySelector(`.menu a[data-view="relatorios"]`)?.style.removeProperty('display');
  }

  hydrateSelects(); hydrateRelatorioFiltros(); hydrateRegistrosFiltroLoja(); hydrateRegistrosFiltroGed(); hydrateRegistrosFiltroMes();

  // Meta selects
  if($('#metaMes')) $('#metaMes').value=YM_NOW;
  if($('#metaHMes')) $('#metaHMes').value=YM_NOW;
  if($('#metaVLoja')) $('#metaVLoja').innerHTML=LOJAS.map(l=>`<option>${l}</option>`).join('');
  if($('#metaHLoja')) $('#metaHLoja').innerHTML=LOJAS.map(l=>`<option>${l}</option>`).join('');
  if($('#clMetaLojas')){ $('#clMetaLojas').innerHTML=LOJAS.map(l=>`<label><input type="checkbox" value="${l}" checked> ${l}</label>`).join(''); $('#clMetaLojas').addEventListener('change',renderMetaLoja); }
  fillMetaVendedores();

  renderUsers(); renderLojasRoles(); renderPlans();
  openView('lancar'); renderRegistros(); renderRelatorios(); renderAudit(); renderHeatmap();

  // Restrição de Meta para vendedor (somente próprio heatmap)
  lockMetaForSeller();
}

document.addEventListener('DOMContentLoaded',async()=>{
  await seed();
  // menu lateral
  $$('.menu a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); openView(a.dataset.view);} ));
  // login
  $('#loginForm')?.addEventListener('submit',async(e)=>{e.preventDefault();await doLogin($('#loginUser').value.trim(), $('#loginPass').value.trim());});
  $('#btnLogout')?.addEventListener('click',()=>logout(false));
  // logo fallback
  $('#logoLogin')?.addEventListener('error',function(){ this.style.display='none'; });

  // restaura sessão
  const sess = await loadK(K.SESSION,null);
  if(sess && (await loadK(K.USERS,[])).some(u=>u.username===sess.username)){ SESSION=sess; badge(curUser()); showApp(); bootAfterLogin(); }
  else { showLogin(); }
});

})(); // IIFE
