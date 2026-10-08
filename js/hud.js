/* hud: menus, lobby, outfit editor, settings, in-game HUD, timing ring, jumpscare */
(function(K){
'use strict';
const {$, $$, CFG, GHOSTS, clamp, esc} = K;
const G = K.G, L = K.L, P = K.P;

/* ---------- small helpers ---------- */
let toastT = 0;
K.toast = function(msg, sec){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); toastT=sec||3.5; };
const CARDS = ['#menuCard','#lookCard','#lobbyCard','#roleCard','#pauseCard','#endCard'];
let lookReturn = '#menuCard';
K.show = function(id){
  for(const c of CARDS) $(c).hidden = c!==id;
  if(id) K.resetTouch && K.resetTouch();
  K.setRoleClass();
};
K.menuMsg = function(msg, err){ const m=$('#menuMsg'); m.textContent=msg||''; m.classList.toggle('err',!!err); };
K.flash = function(sel, v){ const e=$(sel); e.style.transition='none'; e.style.opacity=v; requestAnimationFrame(()=>{ e.style.transition='opacity .9s'; e.style.opacity=0; }); };
const keyName = k => K.IS_TOUCH ? ({E:'ปุ่มใช้', R:'ปุ่มของขลัง'}[k]||k) : k;
document.body.classList.toggle('touch', K.IS_TOUCH);

/* body classes drive which touch buttons show */
K.setRoleClass = function(){
  const b = document.body, me = P[K.NET.me];
  const role = !G.inGame ? null : (K.isSpect(me) ? 'spect' : G.role==='ghost' ? 'ghost' : 'surv');
  b.classList.toggle('role-surv', role==='surv'); b.classList.toggle('role-ghost', role==='ghost'); b.classList.toggle('role-spect', role==='spect');
  b.classList.toggle('ingame', G.inGame);
  $('#touch').hidden = !(K.IS_TOUCH && G.inGame && !L.menu);
};

/* ---------- name, code, outfit ---------- */
const nameIn = K.nameIn = $('#nameIn'), codeIn = K.codeIn = $('#codeIn');
nameIn.value = K.store.get('name','');
if(K.params.get('room')){ codeIn.value = K.params.get('room').toUpperCase().slice(0,4); $('#joinBtn').textContent='เข้าห้อง '+codeIn.value; }
K.myName = function(){ const n=nameIn.value.trim().slice(0,14) || 'ผู้เล่น'+(Math.random()*90+10|0); K.store.set('name',n); return n; };
K.LOOK = K.cleanLook(K.store.get('look', null) || K.defaultLook());
function radios(box, items, cur, on){
  box.innerHTML = '';
  items.forEach((it,i)=>{ const b=document.createElement('button'); b.type='button'; b.setAttribute('role','radio'); b.setAttribute('aria-checked', i===cur); b.textContent=it; b.onclick=()=>on(i); box.append(b); });
}
function renderLook(){
  const sw = $('#shirtBtns'); sw.innerHTML='';
  for(const c of K.SHIRTS){ const b=document.createElement('button'); b.type='button'; b.style.background=c; b.setAttribute('role','radio'); b.setAttribute('aria-label','สีเสื้อ'); b.setAttribute('aria-checked', c===K.LOOK.c); b.onclick=()=>setLook({c}); sw.append(b); }
  radios($('#hairBtns'), K.HAIRS, K.LOOK.h, i=>setLook({h:i}));
  radios($('#hatBtns'), K.HATS, K.LOOK.t, i=>setLook({t:i}));
  K.preview.set(K.LOOK);
}
function setLook(ch){
  K.LOOK = K.cleanLook(Object.assign({}, K.LOOK, ch)); K.store.set('look', K.LOOK); renderLook();
  if(K.NET.me) K.sendHost({t:'look', look:K.LOOK});
}
function openLook(from){ lookReturn = from; K.show('#lookCard'); renderLook(); }
$('#lookBtn').onclick = ()=>openLook('#menuCard');
$('#lobbyLook').onclick = ()=>openLook('#lobbyCard');
$('#lookDone').onclick = ()=>{ if(lookReturn==='#lobbyCard' && K.LOBBY) K.onLobby(K.LOBBY); else K.show(lookReturn); };
K.lookOpen = () => !$('#lookCard').hidden;

/* ---------- lobby ---------- */
K.onLobby = function(m){
  K.LOBBY = m;
  if(G.inGame) K.exitGame();
  if(!K.lookOpen()) K.show('#lobbyCard');
  $('#roomCode').textContent = m.code;
  const host = K.NET.isHost, ul = $('#plist'); ul.innerHTML='';
  for(const p of m.p){
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className='sw'; sw.style.background=(p.look&&p.look.c)||'#888';
    const nm = document.createElement('span'); nm.className='nm'; nm.textContent = p.n + (p.i===m.host?' (โฮสต์)':'') + (p.i===K.NET.me?' · คุณ':'');
    const tag = document.createElement('span'); tag.className='tag'+(m.ghost===p.i?' g':''); tag.textContent = m.ghost===p.i ? 'ผีรอบหน้า' : (p.gc ? `เคยเป็นผี ${p.gc}` : '');
    li.append(sw,nm,tag);
    if(host && m.p.length>1){
      const b = document.createElement('button'); b.className='small';
      const forced = m.picked && m.ghost===p.i;
      b.textContent = forced ? 'ยกเลิก' : 'ให้เป็นผี';
      b.onclick = ()=>K.hostSetGhost(p.i);
      li.append(b);
    }
    ul.append(li);
  }
  const names = m.queue.map(id=>{ const p=m.p.find(q=>q.i===id); return p ? (id===K.NET.me?'คุณ':p.n) : '?'; });
  $('#queueNote').textContent = m.p.length>1 ? 'คิวผี: '+names.join(' → ') : '';
  $('#ghostPick').hidden = m.ghost!==K.NET.me || m.p.length<2 && !K.DEBUG;
  K.renderGhostPick();
  // dawn
  const db = $('#dawnBtns'); db.innerHTML='';
  for(const s of CFG.dawnChoices){
    const b=document.createElement('button'); b.type='button'; b.setAttribute('role','radio'); b.setAttribute('aria-checked', s===m.dawn); b.textContent=(s/60)+' นาที';
    b.disabled = !host; if(host) b.onclick=()=>K.hostSetDawn(s); db.append(b);
  }
  $('#lobbyNote').textContent = (m.p.length<2 ? 'รอเพื่อนอย่างน้อยอีก 1 คน' : `${m.p.length} คนในห้อง`) + (host ? '' : ' · รอโฮสต์เริ่มเกม');
  $('#startBtn').hidden = !host;
  $('#startBtn').disabled = m.p.length<2 && !K.DEBUG;
  K.onVoiceState();
};
K.renderGhostPick = function(){
  const box = $('#gBtns'); if(!box) return;
  box.innerHTML='';
  for(const k of K.GHOST_KEYS){
    const b=document.createElement('button'); b.type='button'; b.setAttribute('role','radio'); b.setAttribute('aria-checked', k===G.myGt); b.textContent=GHOSTS[k].name;
    b.onclick=()=>{ G.myGt = k; K.sendHost({t:'gpick', k}); K.renderGhostPick(); }; box.append(b);
  }
  $('#gBlurb').textContent = GHOSTS[G.myGt].blurb;
};
$('#copyBtn').onclick = ()=>{
  const link = location.origin + location.pathname + '?room=' + K.NET.code + (K.LOCAL?'&local=1':'');
  const done = ()=>{ $('#copyBtn').textContent='คัดลอกแล้ว ส่งให้เพื่อนได้เลย'; setTimeout(()=>$('#copyBtn').textContent='คัดลอกลิงก์ชวนเพื่อน',2500); };
  if(navigator.share && K.IS_TOUCH){ navigator.share({title:'กระสือวัดร้าง', text:'มาเล่นผีกัน ห้อง '+K.NET.code, url:link}).catch(()=>{}); return; }
  if(navigator.clipboard) navigator.clipboard.writeText(link).then(done, ()=>prompt('คัดลอกลิงก์นี้ส่งให้เพื่อน', link));
  else prompt('คัดลอกลิงก์นี้ส่งให้เพื่อน', link);
};

/* ---------- voice state labels ---------- */
K.onVoiceState = function(){
  const V = K.voice;
  let txt;
  if(!V.asked) txt = 'ไมค์: ยังไม่เปิด';
  else if(V.denied) txt = V.why==='insecure' ? 'ไมค์ใช้ไม่ได้ (ต้องเปิดเกมผ่าน https)' : 'ไม่ได้ให้สิทธิ์ไมค์ · ใช้ปุ่มส่งสัญญาณแทน';
  else if(!V.stream) txt = 'กำลังขอใช้ไมค์...';
  else txt = V.muted ? 'ไมค์: ปิดอยู่ (กดเพื่อเปิด)' : 'ไมค์: เปิดอยู่ (กดเพื่อปิด)';
  for(const id of ['#lobbyMic','#pauseMic']){ const b=$(id); b.textContent = txt; b.disabled = V.denied || !V.stream; }
  const mic = $('#mic'); mic.classList.toggle('on', !!V.stream && !V.muted); mic.classList.toggle('off', V.denied || V.muted);
  $('#micT').textContent = V.denied ? 'ไม่มีไมค์' : !V.stream ? '' : V.muted ? 'ไมค์ปิด' + (K.IS_TOUCH?'':' (M)') : 'ไมค์เปิด' + (K.IS_TOUCH?'':' (M)');
  $('#tMic').classList.toggle('off', V.muted || V.denied);
};
$('#lobbyMic').onclick = ()=>K.voice.toggleMute();
$('#pauseMic').onclick = ()=>K.voice.toggleMute();

/* ---------- settings ---------- */
$$('.qbtns button[data-q]').forEach(b=>{ b.setAttribute('aria-checked', b.dataset.q===K.QUALITY); b.onclick = ()=>{ K.setQuality(b.dataset.q); K.setVision(); }; });
$$('.opts input[type=range][data-v]').forEach(r=>{
  r.value = Math.round(K.VOL[r.dataset.v]*100);
  r.oninput = ()=>{ K.VOL[r.dataset.v] = r.value/100; K.applyVolume(); K.store.set('vol', K.VOL); };
});
$('#sensIn').value = Math.round(K.SENS*100);
$('#sensIn').oninput = e=>{ K.SENS = e.target.value/100; K.store.set('sens', K.SENS); };
K.SCARE = K.store.get('scare', true);
$('#scareBox').checked = K.SCARE;
$('#scareBox').onchange = e=>{ K.SCARE = e.target.checked; K.store.set('scare', K.SCARE); };
$('#dragLookBox').checked = K.LOOK_MODE.mode==='drag';
$('#dragLookBox').onchange = e=>K.setDragLook(e.target.checked);

K.pause = function(){ if(!G.inGame || G.ended) return; L.menu = true; for(const k in K.keys) K.keys[k]=false; K.releasePointer(); K.show('#pauseCard'); };
K.resume = function(){ K.audioInit(); L.menu=false; K.show(null); K.lockPointer(); K.enterMobile(); };
$('#readyBtn').onclick = K.resume;
$('#resumeBtn').onclick = K.resume;

/* ---------- jumpscare ---------- */
let scareT = 0;
K.scareLeft = () => Math.max(0, scareT);
K.jumpscare = function(kind){
  K.sfx.hit(); K.sfx.sting();
  if(!K.SCARE) return;
  const c = $('#scareC'); K.drawFace(kind, c);
  const box = $('#scare'); box.hidden = false;
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  K.sfx.scare();
  scareT = 1.4;
};

/* ---------- timing ring ---------- */
const scC = $('#sc'), scG = scC.getContext('2d');
function drawSC(){
  const s = L.sc; scC.hidden = !s; if(!s) return;
  const W = scC.width, cx = W/2, r = W*.36, g = scG;
  g.clearRect(0,0,W,W);
  const rot = -Math.PI/2;
  g.lineWidth = 10; g.strokeStyle = 'rgba(230,218,194,.25)'; g.beginPath(); g.arc(cx,cx,r,0,Math.PI*2); g.stroke();
  g.strokeStyle = s.done ? (s.ok ? '#7dffb0' : '#b3322f') : '#d08a3c';
  g.lineWidth = 14; g.beginPath(); g.arc(cx,cx,r,rot+s.a0,rot+s.a0+s.w); g.stroke();
  const ang = s.done ? null : ((K.gameTime-s.t0)/s.dur)*Math.PI*2;
  if(ang!=null){
    g.strokeStyle = '#e6dac2'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx,cx); g.lineTo(cx+Math.cos(rot+ang)*(r+12), cx+Math.sin(rot+ang)*(r+12)); g.stroke();
  }
  g.fillStyle = '#e6dac2'; g.font = '600 15px Sarabun, Tahoma, sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(s.done ? (s.ok ? 'ตรง!' : 'พลาด!') : (K.IS_TOUCH ? 'แตะ!' : 'Space'), cx, cx);
}

/* ---------- per-frame HUD ---------- */
let teamT = 0;
K.updateHUD = function(dt){
  if(toastT>0){ toastT-=dt; if(toastT<=0) $('#toast').classList.remove('on'); }
  if(scareT>0){ scareT-=dt; if(scareT<=0) $('#scare').hidden = true; }
  const me = P[K.NET.me]; if(!me) return;
  const ghost = G.role==='ghost', spect = K.isSpect(me);
  const gdef = GHOSTS[G.gk];
  if(ghost){
    $('#barALabel').textContent = gdef.skillName.length>8 ? 'สกิล'+(K.IS_TOUCH?'':' Q') : gdef.skillName+(K.IS_TOUCH?'':' Q'); $('#barBLabel').textContent='ตะครุบ';
    $('#barA').style.width = (100*(1-clamp(me.sq/(gdef.skillTime+gdef.skillCD),0,1)))+'%';
    $('#barB').style.width = (100*(1-clamp(me.cd/CFG.hitCD,0,1)))+'%';
    $('#barA').classList.toggle('low', me.sq>0); $('#barB').classList.toggle('low', me.cd>0);
  } else {
    $('#barALabel').textContent='ไฟฉาย'; $('#barBLabel').textContent='แรง';
    $('#barA').style.width = L.battery+'%'; $('#barA').classList.toggle('low', L.battery<20);
    $('#barB').style.width = L.stamina+'%'; $('#barB').classList.toggle('low', L.exhausted);
  }
  $('#bars').hidden = spect;
  // prompt + hold progress
  let pr = '', prog = -1;
  const t = L.target, E = `<b>${keyName('E')}</b>`, HOLD = K.IS_TOUCH ? 'แตะปุ่มใช้' : `กด ${E} ค้างไว้`;
  if(t){
    if(t.k==='candle'){ pr = `${HOLD} จุดเทียน`; prog = K.ROUND.cand[t.i].prog; }
    else if(t.k==='bat') pr = `กด ${E} เก็บถ่านไฟฉาย`;
    else if(t.k==='charm'){ const c = K.ROUND.charms[t.i]; pr = `กด ${E} เก็บ${K.CHARMS[c.k].name}` + (L.ch ? ` (สลับกับ${K.CHARMS[L.ch].name})` : ''); }
    else if(t.k==='offer') pr = `กด ${E} ถือ${K.OFFERS[K.ROUND.offers[t.i].k]}`;
    else if(t.k==='place'){ pr = `${HOLD} วางของไหว้ที่ศาล`; prog = me.pl||0; }
    else if(t.k==='revive'){ pr = `${HOLD} ช่วย `+esc(P[t.i].name); prog = P[t.i].rv; }
    else if(t.k==='finish'){ pr = `กด${K.IS_TOUCH?'ปุ่มสูบ':' <b>E</b>'} ค้างไว้ สูบวิญญาณ `+esc(P[t.i].name); prog = P[t.i].fn; }
  } else if(spect && G.ph==='play') pr = K.IS_TOUCH ? '' : `กด <b>E</b> ทำให้ไฟตรงที่มองอยู่กะพริบ บอกทางเพื่อน`;
  if(L.autoHold && L.holding && pr) pr = 'กำลัง' + pr.replace(/^แตะปุ่มใช้ /,'') + ' · แตะปุ่มใช้อีกครั้งเพื่อหยุด';
  $('#prompt').innerHTML = L.sc ? '' : pr;
  $('#hold').hidden = !(L.holding && prog>=0);
  if(prog>=0) $('#holdFill').style.width = (prog*100)+'%';
  drawSC();
  // status line
  let st = '', bad = false;
  if(G.ph==='wake') st = ghost ? `กำลังตื่น... ${G.wake}` : `หนีไปซ่อน! ผีจะตื่นใน ${G.wake}`;
  else if(me.s==='down'){ st = `ล้ม · รอเพื่อนช่วย ${me.bl} วิ` + (me.fn>0?' · กำลังถูกสูบวิญญาณ!':''); bad = true; }
  else if(me.s==='dead') st = 'คุณเป็นวิญญาณ · ผีมองไม่เห็นคุณ' + (K.IS_TOUCH ? '' : ' (Space ขึ้น / Shift ลง)');
  else if(me.s==='escaped') st = 'คุณหนีรอดแล้ว · ลอยดูเพื่อนได้' + (K.IS_TOUCH ? '' : ' (Space ขึ้น / Shift ลง)');
  else if(ghost && (me.flags&16)){ st = 'มึน!'; bad = true; }
  else if(ghost && (me.flags&256)) st = gdef.skillName;
  else if(ghost && (me.flags&8)) st = 'กำลังหายตัว';
  else if(!ghost && (me.flags&128)){ st = 'ขาสั่น เดินช้าลง'; bad = true; }
  else if(!ghost && me.h===1){ st = 'บาดเจ็บ' + (L.crouch ? ' · ย่อตัวอยู่' : ''); bad = true; }
  else if(!ghost && L.crouch) st = 'ย่อตัว เดินเงียบ' + (K.IS_TOUCH ? '' : ' (C ยืนขึ้น)');
  { const tc = $('#tCrouch'); if(tc) tc.classList.toggle('act', !!L.crouch); }
  $('#status').textContent = st; $('#status').classList.toggle('bad', bad);
  // overlays
  const hurt = ghost ? (me.sa||0)*.5 : (me.s==='down' ? .75 : me.h===1 ? .3+Math.sin(K.gameTime*3)*.08 : 0);
  if(!ghost) $('#hurt').style.opacity = hurt;
  else { const f=$('#flash'); f.style.transition='opacity .3s'; f.style.opacity = (me.flags&16) ? .45+Math.sin(K.gameTime*20)*.08 : hurt; }
  // mic level
  const lv = K.voice.level(); $('#mic .dot').style.transform = `scale(${1+Math.min(1.5,lv*12)})`;
  // a few times a second: clock, goals, team, inventory
  teamT -= dt; if(teamT>0) return; teamT = .25;
  $('#clockT').textContent = 'ฟ้าสางใน '+K.fmtTime(G.left); $('#clockT').classList.toggle('late', G.left<=60);
  $('#ghostId').textContent = ghost ? 'คุณคือ'+gdef.name : 'ผี: '+(G.known ? gdef.name : '???');
  const lit = K.ROUND.cand.filter(c=>c.lit).length, placed = K.ROUND.offers.filter(o=>o.placed).length;
  const goals = ghost
    ? [['จับคนหนีให้หมดก่อนฟ้าสาง', false], [`เทียนที่ถูกจุด ${lit}/${CFG.candles}`, lit>=CFG.candles], [`ของไหว้ที่ศาล ${placed}/${CFG.offerings}`, placed>=CFG.offerings], [G.gate ? 'ประตูวัดเปิดแล้ว!' : 'ประตูวัดยังปิด', false]]
    : [[`จุดเทียน ${lit}/${CFG.candles}`, lit>=CFG.candles], [`ของไหว้ที่ศาลพระภูมิ ${placed}/${CFG.offerings}`, placed>=CFG.offerings], [G.gate ? 'หนีออกประตูวัดทางทิศใต้' : 'ประตูวัดทางใต้ยังปิดอยู่', me.s==='escaped']];
  $('#goal h3').textContent = ghost ? gdef.name : spect ? 'วิญญาณ' : 'คนหนี';
  $('#goal ul').innerHTML = goals.map(([s,d])=>`<li class="${d?'done':''}">${s}</li>`).join('');
  const lbl = v => v.role==='ghost' ? ['ผี','ok'] : v.s==='escaped' ? ['หนีรอด','ok'] : v.s==='dead' ? ['วิญญาณ','bad'] : v.s==='down' ? [`ล้ม ${v.bl}`,'bad'] : v.h===1 ? ['บาดเจ็บ','bad'] : ['ปกติ',''];
  $('#team ul').innerHTML = Object.values(P).map(v=>{ const [s,c]=lbl(v); return `<li><span class="sw" style="background:${v.color}"></span><span>${esc(v.name)}${v.id===K.NET.me?' (คุณ)':''}</span><span class="st ${c}">${s}</span></li>`; }).join('');
  K.refreshCharmHUD();
};
K.refreshCharmHUD = function(){
  const me = P[K.NET.me];
  const surv = me && G.role==='surv' && !K.isSpect(me);
  $('#invCharm').innerHTML = surv ? (L.ch ? `ของขลัง: <b>${K.CHARMS[L.ch].name}</b>${L.ch==='takrut'?' (คุ้มครองอยู่)':K.IS_TOUCH?'':' · กด R ใช้'}` : 'ของขลัง: ไม่มี') : '';
  $('#invOffer').innerHTML = surv && L.of>=0 && K.ROUND.offers[L.of] ? `ถือ <b>${K.OFFERS[K.ROUND.offers[L.of].k]}</b> · วิ่งไม่ได้` : '';
};

/* ---------- buttons ---------- */
$('#hostBtn').onclick = K.hostCreate;
$('#joinBtn').onclick = K.joinRoom;
$('#startBtn').onclick = K.hostStart;
$('#leaveBtn').onclick = K.leaveRoom;
$('#quitBtn').onclick = K.leaveRoom;
$('#endLeaveBtn').onclick = K.leaveRoom;
$('#againBtn').onclick = K.hostAgain;
codeIn.addEventListener('input', ()=>{ codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g,''); $('#joinBtn').textContent='เข้าห้องเพื่อน'; });
if(!window.Peer && !K.LOCAL) setTimeout(()=>{ if(!window.Peer) K.menuMsg('โหลดระบบออนไลน์ (PeerJS) ไม่ได้ ลองรีเฟรชหน้า หรือเช็คอินเทอร์เน็ต', true); }, 4000);
K.onVoiceState();
})(window.K);
