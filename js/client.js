/* client: what this player knows and sees — network messages, player views, round objects, effects */
(function(K){
'use strict';
const {CFG, GHOSTS, V3, mr, scene} = K;
const G = K.G = {inGame:false, role:null, gk:'krasue', ph:'none', wake:0, left:0, dawn:CFG.dawn, gate:false, ended:false, manual:false, known:false, myGt:'krasue'};
const P = K.P = {};    // id -> player view
const L = K.L = {pos:new V3(), yaw:0, pitch:0, battery:100, stamina:100, exhausted:false, light:true, boostUntil:0, bob:0, stepD:0,
  lungeUntil:0, lungeYaw:0, atkLocal:0, escSent:false, holdSend:0, menu:false, flyY:0, target:null, holding:null, sc:null, scNext:0, ch:'', of:-1};
K.gameTime = 0;
K.LOBBY = null;
const isSpect = v => v && (v.s==='dead' || v.s==='escaped');
K.isSpect = isSpect;
/* disguise mode: the ghost passes as a person (and is not mid-transformation) */
const masked = v => !!v && v.role==='ghost' && (v.flags&1024) && !(v.flags&2048);
K.masked = masked;
K.voiceIds = () => G.inGame ? Object.keys(P).filter(i=>i!=='bot') : (K.LOBBY ? K.LOBBY.p.map(p=>p.i) : []);

/* a host that goes quiet (tab asleep, network gone) only closes the link after ~30 s: say so instead of a silent frozen world */
let lastFromHost = performance.now();
setInterval(()=>{
  if(!G.inGame || K.NET.isHost || G.ph==='end' || !K.NET.host) return;
  if(performance.now()-lastFromHost > 4000) K.toast('สัญญาณจากโฮสต์ขาดหาย กำลังรอเชื่อมต่อ...', 1.5);
}, 1000);
K.clientRecv = function(m){
  lastFromHost = performance.now();
  switch(m.t){
    case 'lobby': K.onLobby(m); break;
    case 'gt': G.myGt = m.k; K.renderGhostPick && K.renderGhostPick(); break;
    case 'start': onStart(m); break;
    case 's': if(G.inGame) onSnap(m); break;
    case 'e': if(G.inGame) onEvent(m); break;
    case 'end': if(G.inGame) onEnd(m); break;
    case 'sig': K.voice.onSig(m.from, m.d); break;
    case 'deny': K.teardown(); K.show('#menuCard'); K.menuMsg(m.why, true); break;
  }
};

/* ---------- round objects ---------- */
const R = K.ROUND = {cand:[], offers:[], charms:[], holy:[], fx:[], trails:{}, wisps:[]};
K.BAT = K.BAT_SPOTS.map(([x,z],i)=>{
  const m = K.batteryMesh(); m.rotation.z = Math.PI/2;
  const g = K.groundItem(m); g.position.set(x,0,z); scene.add(g);
  return {x,z,i,g,mesh:m,up:true};
});
function clearRound(){
  for(const o of R.offers) K.disposeTree(o.g);
  for(const c of R.charms) K.disposeTree(c.g);
  for(const h of R.holy){ K.removeColliders(h.cols); K.disposeTree(h.mesh); }
  for(const f of R.fx) if(f.obj){ scene.remove(f.obj); if(f.own){ f.obj.material.map.dispose(); f.obj.material.dispose(); } }
  R.cand = []; R.offers = []; R.charms = []; R.holy = []; R.fx = []; R.trails = {}; R.wisps = [];
  K.setAltars([]);
  for(const b of K.BAT){ b.up=true; b.g.visible=true; }
  K.GATE.open=false; K.GATE.a=0; K.gateCol.off=false; for(const d of K.GATE.doors) d.pivot.rotation.y=0;
  for(const c of K.handItem.children.slice()) K.disposeTree(c);
  hideFootprints();
}
function buildRound(m){
  clearRound();
  K.setAltars(m.altars);
  R.cand = m.altars.map((s,i)=>{ const a = K.ALTARS[s]; return {i, spot:s, x:a.x, z:a.z, altar:a, lit:false, prog:0}; });
  R.offers = m.offers.map((o,i)=>{ const g = K.groundItem(K.offerMesh(o.k)); g.position.set(o.x,0,o.z); scene.add(g); return {i, k:o.k, g, x:o.x, z:o.z, by:'', placed:false}; });
  R.charms = m.charms.map((c,i)=>makeCharm(i,c.k,c.x,c.z));
}
function makeCharm(i,k,x,z){ const g = K.groundItem(K.charmMesh(k)); g.position.set(x,0,z); scene.add(g); return {i,k,g,x,z,up:true}; }

/* ---------- player views ---------- */
function addPlayerView(pl, role){
  const ghost = role==='ghost', eye = ghost ? GHOSTS[G.gk].eye : 0;
  const look = K.cleanLook(pl.look);
  const v = {id:pl.i, name:pl.n, color:look.c, look, role, pos:new V3(pl.x, eye, pl.z), tpos:new V3(pl.x, eye, pl.z),
    yaw:pl.a, tyaw:pl.a, pitch:0, tpitch:0, flags:1, h:2, s:'alive', bl:0, rv:0, fn:0, cd:0, sq:0, sa:0, ch:'', of:-1, pl:0,
    stepD:0, last:new V3(pl.x,0,pl.z), spot:null, voiceT:mr(6,12), seenAt:-99};
  P[pl.i] = v;
  if(pl.i===K.NET.me) return v;
  if(ghost){
    v.model = K.ghostModel(G.gk);
    if(G.mode==='disguise'){   // the face it wears among the others
      v.flags = 1024|1;
      v.dmodel = K.personModel(look); scene.add(v.dmodel.g);
      v.label = K.labelSprite(pl.n, look.c); v.label.position.y = 2.15; v.dmodel.g.add(v.label);
      v.spot = K.SPOTS.find(s=>!s.used); if(v.spot) v.spot.used = true;
      // eyes that only the lightning shows
      const em = new THREE.MeshBasicMaterial({color:0xff2a1a, transparent:true, opacity:0, fog:false, depthWrite:false});
      v.deyes = [-1,1].map(s=>{ const e = new THREE.Mesh(new THREE.SphereGeometry(.03,6,4), em); e.position.set(s*.065,1.7,-.135); v.dmodel.g.add(e); return e; });
      v.deyeMat = em;
    }
  }
  else {
    v.model = K.personModel(look);
    v.label = K.labelSprite(pl.n, look.c); v.label.position.y = 2.15; v.model.g.add(v.label);
    v.spot = K.SPOTS.find(s=>!s.used); if(v.spot) v.spot.used = true;
    v.spirit = K.spiritModel(look.c); v.spirit.g.visible = false; scene.add(v.spirit.g);
  }
  scene.add(v.model.g);
  return v;
}
function removePlayerView(id){
  const v = P[id]; if(!v) return;
  if(v.model){ if(v.model.carry) for(const c of v.model.carry.children.slice()) v.model.carry.remove(c); K.disposeTree(v.model.g); }   // an offering they carried is not theirs to free
  if(v.spirit) K.disposeTree(v.spirit.g);
  if(v.dmodel) K.disposeTree(v.dmodel.g);
  if(v.spot){ v.spot.used=false; v.spot.light.intensity=0; v.spot.beam.visible=false; }
  delete P[id];
}
K.ghostView = () => Object.values(P).find(v=>v.role==='ghost');
/* disguise mode: a survivor's page is not told who the ghost is, so everyone starts as a person. When it finds out
   (the ghost transforms, or its eyes show in a lightning flash) that person becomes the face the ghost wears */
function unveil(id){
  const v = P[id]; if(!v || v.role==='ghost' || id===K.NET.me) return;
  removePlayerView(id);
  const g = addPlayerView({i:id, n:v.name, look:v.look, x:v.pos.x, z:v.pos.z, a:v.yaw}, 'ghost');
  g.pos.copy(v.pos); g.tpos.copy(v.tpos); g.yaw = v.yaw; g.tyaw = v.tyaw; g.pitch = v.pitch; g.tpitch = v.tpitch; g.last.copy(v.last);
  g.h = v.h; g.s = v.s; g.flags = v.flags|1024;
  G.ghost = id;
}
K.nameOf = id => P[id] ? (id===K.NET.me ? 'คุณ' : P[id].name) : 'ใครบางคน';

function onStart(m){
  K.exitGame();
  G.inGame = true; G.mode = m.mode==='disguise' ? 'disguise' : 'normal'; G.disg = G.mode==='disguise'; G.ph = 'wake'; G.gate = false; G.ended = false; G.wake = CFG.wake; G.gk = m.gk; G.dawn = m.dawn; G.left = m.dawn; G.known = false; G.ghost = m.ghost;
  buildRound(m);
  for(const pl of m.p) addPlayerView(pl, pl.i===m.ghost?'ghost':'surv');
  const me = P[K.NET.me]; if(!me){ K.exitGame(); return; }
  G.role = me.role;
  if(G.role==='ghost') G.known = true;
  if(G.role!=='ghost') G.disg = false;
  if(G.disg) L.light = true;
  L.pos.set(me.pos.x, 0, me.pos.z); L.yaw = me.yaw; L.pitch = 0;
  L.battery = 100; L.stamina = 100; L.exhausted = false; L.light = G.role==='surv' || G.disg;   // a disguised ghost lines up with its torch on like everyone L.escSent = false; L.lungeUntil = 0; L.boostUntil = 0;
  L.sc = null; L.ch = ''; L.of = -1; L.flyY = 3; L.autoHold = null; L.crouch = false; L.eyeH = CFG.eye;
  if(K.resetProps) K.resetProps();
  document.body.classList.toggle('ghost', G.role==='ghost');
  K.setVision();
  K.$('#hudWrap').hidden = false;
  K.setRoleClass();
  const gname = m.ghost && P[m.ghost] ? P[m.ghost].name : '';
  if(G.mode==='disguise' && G.role==='ghost'){
    const g = GHOSTS[G.gk];
    K.$('#roleSub').textContent = 'โหมดปลอมตัว · คืนนี้คุณคือ'+g.name+' ที่ปลอมตัวเป็นคน';
    K.$('#roleTitle').textContent = 'ผีปลอมตัว';
    K.$('#roleText').textContent = `ไม่มีใครรู้ว่าคุณคือผี เดิน คุย ส่องไฟฉายไปกับเพื่อนได้ตามปกติ พอได้จังหวะ${K.IS_TOUCH?'กดปุ่มกลายร่าง':'คลิก'}เพื่อกลายร่าง (มีเสียงกรีดร้อง ใครอยู่ใกล้จะเห็น) แล้วตามล่า ${CFG.huntTime} วิ ก่อนจะกลับมาปลอมตัวใหม่ · ระวังเกลือ: โดนปาตอนปลอมตัวจะถูกเผยร่าง เส้นน้ำมนต์ก็เดินผ่านไม่ได้ อีกาจะบินหนีคุณ และฟ้าแลบจะเห็นตาแดงของคุณ`;
  } else if(G.mode==='disguise'){
    K.$('#roleSub').textContent = 'โหมดปลอมตัว · คุณคือคนหนี';
    K.$('#roleTitle').textContent = 'ใครคือผี?';
    K.$('#roleText').textContent = `ผีปลอมตัวเป็นหนึ่งในเพื่อนที่ยืนอยู่ข้างคุณ ทำภารกิจเหมือนเดิม: จุดเทียน ${CFG.candles} เล่ม วางของไหว้ ${CFG.offerings} ชิ้นที่ศาล แล้วหนีออกประตูทิศใต้ · สังเกตให้ดี: ใครจุดเทียนแล้วเทียนไม่ขึ้น ใครเดินข้ามเส้นน้ำมนต์ไม่ได้ ตอนฟ้าแลบตาใครเป็นสีแดง อีกาบินหนีใคร ตะกรุดจะสั่นเมื่อผีอยู่ใกล้ ปาเกลือใส่คนที่สงสัยจะบังคับให้มันเผยร่าง`;
  } else if(G.role==='ghost'){
    const g = GHOSTS[G.gk];
    K.$('#roleSub').textContent = 'คืนนี้คุณคือ';
    K.$('#roleTitle').textContent = g.name;
    K.$('#roleText').textContent = g.blurb + ' · ตะครุบคนหนีให้ล้มแล้วกดค้างที่ตัวเพื่อสูบวิญญาณ ห้ามให้ใครหนีออกประตูวัดได้ก่อนฟ้าสาง · คนที่วิ่งจะทิ้งรอยแดงไว้บนพื้นให้คุณตามได้';
  } else {
    K.$('#roleSub').textContent = 'คุณคือคนหนี · ผีคือ '+gname+' (ยังไม่รู้ว่าเป็นผีอะไร)';
    K.$('#roleTitle').textContent = 'คนหนี';
    const solo = G.ghost==='bot' && Object.keys(P).length<=2;
    K.$('#roleText').textContent = (G.ghost==='bot' ? 'ผีคืนนี้เป็นบอท มันได้ยินเสียงวิ่งและเห็นแสงไฟฉาย' + (solo ? ' · คุณมาคนเดียว หลวงพ่อเลยฝากตะกรุดไว้ 1 ดอก กันโดนตะครุบได้ครั้งหนึ่ง' : '') + ' · ' : '') + `จุดเทียน ${CFG.candles} เล่ม และขนของไหว้ ${CFG.offerings} ชิ้นไปวางที่ศาลพระภูมิ ประตูวัดทางใต้จึงจะเปิด หนีออกไปก่อนฟ้าสาง (${Math.round(G.dawn/60)} นาที) ระหว่างจุดเทียนจะมีวงจังหวะขึ้นมา กดให้ตรง ถ้าพลาดเสียงจะดังจนผีได้ยิน ส่องไฟฉายใส่หน้าผีนานๆ มันจะมึน ของขลังหาเก็บได้รอบวัด · วิ่งแล้วผีจะเห็นรอย ย่อตัว (${K.IS_TOUCH?'ปุ่มย่อ':'C'}) จะเดินเงียบ`;
  }
  K.show('#roleCard');
  L.menu = true;
}
K.exitGame = function(){
  for(const id of Object.keys(P)) removePlayerView(id);
  G.inGame=false; G.role=null; G.ph='none'; G.disg=false; G.mode='normal'; L.sc=null;
  document.body.classList.remove('ghost');
  K.$('#hudWrap').hidden = true; K.$('#hurt').style.opacity=0; K.$('#flash').style.opacity=0;
  K.SPOTS[0].light.intensity=0; K.SPOTS[0].beam.visible=false; K.handTorch.visible=false;
  if(K.A.ctx){ K.A.humGain.gain.value=0; K.musicStop(); }
  K.releasePointer && K.releasePointer();
  K.setVision();
  clearRound();
  K.setRoleClass && K.setRoleClass();
};
K.setVision = function(){
  const role = G.inGame ? G.role : null;
  if(role==='ghost' && !G.disg){
    const pret = G.gk==='pret';
    K.amb.color.set(0x6a3a3a); K.amb.groundColor.set(0x6a3a3a); K.amb.intensity=1.25; scene.fog.color.set(0x140404); scene.fog.density = pret ? .034 : .045; scene.background.set(0x140404); K.moonLight.intensity=.5;
  } else { const N = K.NIGHT; K.amb.color.set(N.sky); K.amb.groundColor.set(N.ground); K.amb.intensity=N.amb; scene.fog.color.set(N.fog); scene.fog.density=N.fogD*K.QUAL[K.QUALITY].fog; scene.background.set(N.fog); K.moonLight.intensity=N.moonI; }
  K.baseFog = scene.fog.color.getHex(); K.baseFogD = scene.fog.density;
  K.ambBase = K.amb.intensity; K.moonBase = K.moonLight.intensity;
};

function onSnap(m){
  G.ph = m.ph; G.wake = m.wk; G.left = m.lf;
  m.c.forEach((v,i)=>{
    const c = R.cand[i]; if(!c) return; c.prog = v;
    if(v>=1 && !c.lit){ c.lit=true; c.altar.flame.visible=true; K.sfx.light(K.at({x:c.x,y:1,z:c.z})); }
  });
  if(m.g && !G.gate){ G.gate = true; K.GATE.open = true; K.gateCol.off = true; }
  m.b.forEach((v,i)=>{ K.BAT[i].up = !!v; K.BAT[i].g.visible = !!v; });
  m.o.forEach(([x,z,by,pl],i)=>{
    const o = R.offers[i]; if(!o) return;
    o.x=x; o.z=z;
    if(pl && !o.placed){ o.placed = true; }
    o.by = by;
    placeOffer(o);
  });
  m.ch.forEach(([x,z,k,up],i)=>{
    let c = R.charms[i];
    if(!c || c.k!==k){ if(c) K.disposeTree(c.g); c = R.charms[i] = makeCharm(i,k,x,z); }
    c.x=x; c.z=z; c.up=!!up; c.g.position.set(x,0,z); c.g.visible = c.up;
  });
  const seen = {};
  for(const o of m.p){
    const v = P[o.i]; if(!v) continue; seen[o.i]=1;
    const prev = v.s;
    v.h=o.h; v.s=o.s; v.flags=o.f; v.bl=o.bl||0; v.rv=o.rv||0; v.fn=o.fn||0; v.pl=o.pl||0;
    if(v.role==='surv'){ v.ch=o.ch||''; v.of=o.of==null?-1:o.of; }
    if(v.role==='ghost'){ v.cd=o.cd; v.sq=o.sq; v.sa=o.sa; v.fr=o.fr||0; v.fu=o.fu||0; }
    if(o.i!==K.NET.me){ v.tpos.set(o.x,o.y,o.z); v.tyaw=o.a; v.tpitch=o.b; }
    else {
      if(prev!==v.s) onMyState(prev, v.s);
      if(G.role==='ghost' && G.mode==='disguise'){ const d = !!(v.flags&1024) && !(v.flags&2048); if(d!==G.disg){ G.disg = d; if(d) L.light = L.battery>0; K.setVision(); K.setRoleClass(); } }
      if(v.ch!==L.ch || v.of!==L.of){ L.ch = v.ch; L.of = v.of; refreshHand(); }
    }
  }
  for(const id of Object.keys(P)) if(!seen[id] && id!==K.NET.me) removePlayerView(id);
}
function placeOffer(o){
  if(o.placed){
    const slot = K.SHRINE.slots[R.offers.filter(q=>q.placed).indexOf(o)] || K.SHRINE.slots[0];
    if(o.g.parent!==scene) scene.add(o.g);
    o.g.position.set(slot.x, slot.y-.18, slot.z); o.g.children[1].visible = false; o.g.rotation.set(0,0,0);
    return;
  }
  if(o.by && o.by!==K.NET.me && P[o.by] && P[o.by].model && P[o.by].model.carry){
    const c = P[o.by].model.carry; if(o.g.parent!==c){ c.add(o.g); } o.g.position.set(0,-.18,0); o.g.children[1].visible=false;
  } else if(o.by===K.NET.me){
    if(o.g.parent) o.g.parent.remove(o.g);
  } else {
    if(o.g.parent!==scene) scene.add(o.g);
    o.g.position.set(o.x,0,o.z); o.g.children[1].visible=true;
  }
}
function refreshHand(){
  for(const c of K.handItem.children.slice()) K.disposeTree(c);
  if(L.of>=0 && R.offers[L.of]){ const m = K.offerMesh(R.offers[L.of].k); m.scale.setScalar(.7); m.position.set(0,-.02,0); K.handItem.add(m); }
  if(L.ch){ const m = K.charmMesh(L.ch); m.scale.setScalar(.6); m.position.set(.14,-.06,.04); K.handItem.add(m); }
  K.refreshCharmHUD && K.refreshCharmHUD();
}
function onMyState(prev, s){
  if(s!=='alive') L.crouch = false;
  if(s==='dead' || s==='escaped'){ L.flyY = 3; L.light=false; L.pos.y=0; L.sc=null; K.setRoleClass(); }
  if(s==='alive' && prev==='down') L.boostUntil = K.gameTime+1;
}

/* ---------- effects ---------- */
function markerSprite(text, color, sub){
  const c = document.createElement('canvas'); c.width=256; c.height=96;
  const g = c.getContext('2d');
  g.textAlign='center'; g.textBaseline='middle';
  g.strokeStyle=color; g.lineWidth=5; g.beginPath(); g.arc(128,30,16,0,7); g.stroke();
  g.fillStyle=color; g.beginPath(); g.arc(128,30,5,0,7); g.fill();
  g.font='600 26px Sarabun, Tahoma, sans-serif'; g.fillStyle='rgba(0,0,0,.7)'; g.fillText(text,130,72); g.fillStyle=color; g.fillText(text,128,70);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:t, transparent:true, depthTest:false, depthWrite:false, fog:false}));
  s.scale.set(2.2,.82,1); s.renderOrder = 10;
  return s;
}
function addFx(obj, dur, upd){ if(obj) scene.add(obj); R.fx.push({obj, t:dur, dur, upd}); }
K.updateFx = function(dt){
  for(let i=R.fx.length-1;i>=0;i--){
    const f = R.fx[i]; f.t -= dt;
    if(f.upd) f.upd(f, dt);
    if(f.t<=0){ if(f.obj){ scene.remove(f.obj); if(f.own){ f.obj.material.map.dispose(); f.obj.material.dispose(); } } R.fx.splice(i,1); }
  }
  for(let i=R.holy.length-1;i>=0;i--){
    const h = R.holy[i]; h.t -= dt;
    h.mesh.children.forEach((c,k)=>{ c.material.opacity = Math.min(1,h.t/2)*(c.userData.base||.6)*(1+Math.sin(K.gameTime*6+k)*.2); });
    if(h.t<=0){ K.removeColliders(h.cols); K.disposeTree(h.mesh); R.holy.splice(i,1); }
  }
  for(let i=R.wisps.length-1;i>=0;i--){ const w = R.wisps[i]; w.t -= dt; if(w.t<=0) R.wisps.splice(i,1); else K.lightSource(w.x,w.y+.6,w.z,0x9fc4ff,(Math.random()<.3?.2:1.6)*Math.min(1,w.t),8); }
};
function marker(text, color, x, y, z, dur){
  const s = markerSprite(text, color); s.position.set(x,y,z);
  addFx(s, dur, f=>{ f.obj.material.opacity = Math.min(1, f.t/1.2); });
  R.fx[R.fx.length-1].own = true;
}
const holyMat = () => new THREE.MeshBasicMaterial({color:0xa8d8ff, transparent:true, opacity:.6, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
function addHoly(x,z,a,d){
  const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = a;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(CFG.holyWidth,.35), holyMat()); strip.rotation.x = -Math.PI/2; strip.position.y=.03; strip.userData.base=.7; g.add(strip);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(CFG.holyWidth,1.4), holyMat()); wall.position.y=.7; wall.material.opacity=.12; wall.userData.base=.14; g.add(wall);
  scene.add(g);
  R.holy.push({cols:K.addHoly(x,z,a), mesh:g, t:d});
}
const saltMat = new THREE.SpriteMaterial({map:K.glowTex(255,255,255), transparent:true, depthWrite:false});
function saltFx(x,z,a){
  const fx = -Math.sin(a), fz = -Math.cos(a);
  for(let i=0;i<14;i++){
    const s = new THREE.Sprite(saltMat); s.scale.setScalar(.08); s.position.set(x+fx*.4, 1.3, z+fz*.4);
    const sp = mr(9,14), vx = fx*sp+mr(-1,1), vz = fz*sp+mr(-1,1), vy = mr(.5,2.5);
    addFx(s, mr(.5,.75), (f,dt)=>{ f.obj.position.x += vx*dt; f.obj.position.z += vz*dt; f.obj.position.y = Math.max(.05, f.obj.position.y + (vy - (f.dur-f.t)*9)*dt); });
  }
}
/* footprints the ผีปอบ smells out, and the scuffs every ghost sees where someone ran */
const fpMat = new THREE.MeshBasicMaterial({color:0xff7a3a, transparent:true, opacity:.8, depthWrite:false, fog:false});
const FP = [];
for(let i=0;i<140;i++){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.13,.28), fpMat.clone()); m.rotation.x=-Math.PI/2; m.position.y=.025; m.visible=false; scene.add(m); FP.push(m); }
function hideFootprints(){ for(const m of FP) m.visible=false; }
let trailT = 0;
K.updateTrails = function(dt){
  if(G.role!=='ghost') return;
  const t = K.gameTime;
  trailT -= dt;
  if(trailT<=0){
    trailT = .4;
    for(const v of Object.values(P)) if(v.role==='surv' && v.s==='alive'){
      const tr = R.trails[v.id] = R.trails[v.id] || [];
      const last = tr[tr.length-1];
      if(!last || Math.hypot(last.x-v.pos.x, last.z-v.pos.z)>.55) tr.push({x:v.pos.x, z:v.pos.z, a:v.yaw, t, side:(tr.length%2)?1:-1, run:!!(v.flags&2), tw:mr(-.6,.6)});
      while(tr.length && t-tr[0].t>25) tr.shift();
    }
  }
  const me = P[K.NET.me];
  const smell = G.gk==='pop' && me && (me.flags&256);
  let n = 0;
  for(const id in R.trails) for(const p of R.trails[id]){
    if(n>=FP.length) break;
    const age = t-p.t, scuff = p.run && age<CFG.scuffTime;
    if(!smell && !scuff) continue;
    const m = FP[n++]; m.visible = true;
    m.position.x = p.x + Math.cos(p.a)*.12*p.side; m.position.z = p.z - Math.sin(p.a)*.12*p.side;
    if(smell){ m.material.color.setHex(0xff7a3a); m.rotation.z = p.a; m.scale.set(1,1,1); m.material.opacity = .85*(1-age/25); }
    else { m.material.color.setHex(0xb3261c); m.rotation.z = p.a+p.tw; m.scale.set(.6,2.4,1); m.material.opacity = .75*(1-age/CFG.scuffTime); }
  }
  for(;n<FP.length;n++) FP[n].visible=false;
};

/* survivors find out which ghost it is once they get a good look at it */
let revealT = 0;
K.checkReveal = function(dt){
  if(G.role!=='surv' || G.known) return;
  revealT -= dt; if(revealT>0) return; revealT = .25;
  const g = K.ghostView(); if(!g || (g.flags&8) || masked(g) || G.ph!=='play') return;
  const cam = K.camera.position, d = cam.distanceTo(g.pos);
  const close = G.gk==='krasue' ? 18 : 11;
  if(d>close) return;
  const f = new V3(0,0,-1).applyQuaternion(K.camera.quaternion), to = g.pos.clone().sub(cam).normalize();
  if(f.dot(to)<.72) return;
  if(!K.lineOfSight(cam.x,cam.y,cam.z,g.pos.x,g.pos.y-.2,g.pos.z)) return;
  revealGhost();
};
function revealGhost(){
  if(G.known) return; G.known = true;
  K.toast('นั่นมัน... '+GHOSTS[G.gk].name+'!', 3.5);
  K.sfx.sting();
}

function onEvent(m){
  const me = P[K.NET.me], ghost = G.role==='ghost', sfx = K.sfx, at = K.at;
  switch(m.k){
    case 'wake':
      if(G.mode==='disguise'){ K.toast(ghost ? `ออกหากินได้แล้ว · กลายร่างได้ในอีก ${CFG.formFirst} วิ` : 'ผีตื่นแล้ว... มันอยู่ในกลุ่มพวกคุณ'); if(!ghost) K.sfx.haunt(K.spatial(L.pos.x+mr(-6,6), 2, L.pos.z+mr(-6,6), K.A.amb)); break; }
      if(ghost) K.toast('ออกหากินได้แล้ว'); else { K.toast('ผีตื่นแล้ว...'); const g=K.ghostView(); if(g) ghostVoice(g); }
      break;
    case 'morph': {
      unveil(m.who);
      const g = P[m.who]; if(!g) break;
      g.morphT = m.forced ? CFG.morphTime*.6 : 0; g.morphing = true;
      if(ghost){ K.toast(m.forced===1 ? 'เกลือเผาร่างปลอมจนหลุด! ทุกคนเห็นคุณแล้ว' : m.forced===2 ? 'ประตูวัดเปิด! ร่างปลอมหลุด คุณคลั่งแล้ว' : 'กำลังกลายร่าง...', 4); K.shake = .5; sfx.growl(); break; }
      const seen = g.pos.distanceTo(K.camera.position)<16 && K.lineOfSight(K.camera.position.x,K.camera.position.y,K.camera.position.z,g.pos.x,1.4,g.pos.z);
      sfx.shriek(at({x:g.pos.x,y:1.6,z:g.pos.z}));
      if(seen){ K.toast(`${g.name} คือ${GHOSTS[G.gk].name}!! มันกำลังกลายร่าง`, 4.5); sfx.scare(); K.shake = .4; G.known = true; }
      else K.toast('ได้ยินเสียงกรีดร้อง... ผีถอดร่างปลอมแล้ว', 3.5);
      break;
    }
    case 'unmorph': {
      const g = P[m.who]; if(!g) break;
      g.morphing = false;
      if(ghost){ K.toast('กลับมาปลอมตัวแล้ว · ทำตัวให้เนียน', 3.5); sfx.whoosh(); break; }
      const seen = g.pos.distanceTo(K.camera.position)<14 && K.lineOfSight(K.camera.position.x,K.camera.position.y,K.camera.position.z,g.pos.x,1.4,g.pos.z);
      if(seen) K.toast(`ผีกลับไปอยู่ในร่างของ ${g.name}`, 4);
      break;
    }
    case 'lit': {
      sfx.bell(); K.toast(`จุดเทียนแล้ว ${m.n}/${CFG.candles} เล่ม`);
      const c = R.cand[m.i];   // the ghost feels each candle catch, and where
      if(ghost && c) marker('เทียนถูกจุด', '#ffb050', c.x, 1.8, c.z, 4);
      break;
    }
    case 'placed': sfx.place(); K.toast(`วางของไหว้ที่ศาลแล้ว ${m.n}/${CFG.offerings} ชิ้น`); break;
    case 'gate': sfx.gate(); K.toast(ghost ? 'ประตูวัดเปิดแล้ว! คุณคลั่ง เร็วขึ้นกว่าเดิม อย่าให้ใครหนีไปได้' : 'ประตูวัดเปิดแล้ว! วิ่งออกไปทางทิศใต้ ผีคลั่งแล้ว ระวัง!', 5); if(!ghost) setTimeout(()=>{ const g=K.ghostView(); if(g && G.inGame) K.sfx.shriek(K.at(g.pos)); }, 1200); break;
    case 'hit':
      if(m.who===K.NET.me){ sfx.hit(); K.flash('#hurt',.9); L.boostUntil = K.gameTime+1.8; K.toast('โดนตะครุบ! วิ่ง!'); revealGhost(); K.vibrate(120); }
      else { if(ghost) sfx.hit(); else if(P[m.who]) sfx.down(at(P[m.who].pos)); }
      break;
    case 'down':
      if(m.who===K.NET.me){ revealGhost(); K.jumpscare(G.gk); K.toast('คุณล้มลง... รอเพื่อนมาช่วย', 5); K.vibrate([200,80,300]); }
      else { K.toast(`${K.nameOf(m.who)} ล้มลง`); if(P[m.who]) sfx.down(at(P[m.who].pos)); }
      break;
    case 'block':
      sfx.block();
      if(m.who===K.NET.me) K.toast('ตะกรุดกันไว้ได้! (ตะกรุดหมดฤทธิ์แล้ว)');
      else if(ghost) K.toast('มีของขลังกันไว้!');
      break;
    case 'revive': K.toast(m.who===K.NET.me ? 'ลุกขึ้นได้แล้ว รีบไป!' : `${K.nameOf(m.who)} ลุกขึ้นได้แล้ว`); break;
    case 'dead':
      if(m.who===K.NET.me){
        sfx.sting();
        K.toast(m.how==='finish' ? 'ผีสูบวิญญาณคุณไปแล้ว... ตอนนี้คุณเป็นวิญญาณ' : m.how==='dawn' ? 'ฟ้าสางแล้ว คุณยังติดอยู่ในวัด...' : 'คุณขาดใจ... ตอนนี้คุณเป็นวิญญาณ', 6);
      } else K.toast(m.how==='finish' ? `ผีสูบวิญญาณ ${K.nameOf(m.who)}` : m.how==='dawn' ? `${K.nameOf(m.who)} ติดอยู่ในวัดตอนฟ้าสาง` : `${K.nameOf(m.who)} ขาดใจ`);
      break;
    case 'esc': K.toast(m.who===K.NET.me ? 'คุณหนีออกจากวัดได้แล้ว!' : `${K.nameOf(m.who)} หนีออกจากวัดได้แล้ว`); break;
    case 'stun': {
      const g = K.ghostView(); if(g) sfx.shriek(ghost ? null : at(g.pos));
      if(ghost){ sfx.stun(); K.toast('แสงไฟแสบตา!'); } else K.toast('แสงไฟทำให้ผีมึน!');
      break;
    }
    case 'inv': if(ghost) sfx.whoosh(); break;
    case 'smell': if(ghost){ sfx.growl(); K.toast('ได้กลิ่นคน... เห็นรอยเท้าแล้ว'); } break;
    case 'wail': {
      sfx.wail(ghost ? null : at({x:m.x,y:3,z:m.z}));
      if(!ghost && m.hit.includes(K.NET.me)){ K.toast('เสียงกรีดร้องทำให้ขาสั่น ไฟฉายกะพริบ!'); K.shake = .6; }
      else if(ghost) K.toast(m.hit.length ? `คนหนี ${m.hit.length} คนขาสั่น` : 'ไม่มีใครอยู่ใกล้');
      break;
    }
    case 'bat': if(m.who===K.NET.me){ L.battery = Math.min(100, L.battery+CFG.batPick); sfx.pick(); K.toast('ได้ถ่านไฟฉาย'); } break;
    case 'charm': if(m.who===K.NET.me){ sfx.pick(); K.toast('ได้'+K.CHARMS[m.c].name+' · '+K.CHARMS[m.c].hint, 4); } break;
    case 'offer': if(m.who===K.NET.me){ sfx.pick(); K.toast('ถือ'+K.OFFERS[R.offers[m.i].k]+'แล้ว ไปวางที่ศาลพระภูมิ (ถือแล้ววิ่งไม่ได้)', 4); } break;
    case 'salt':
      saltFx(m.x,m.z,m.a); sfx.salt(at({x:m.x,y:1.3,z:m.z}));
      if(m.hit){ if(ghost){ sfx.stun(); if(G.mode!=='disguise') K.toast('เกลือ! แสบไปทั้งตัว'); } else { const g=K.ghostView(); if(g) sfx.shriek(at(g.pos)); if(m.who===K.NET.me) K.toast(g && g.morphing && G.mode==='disguise' ? `โดนเต็มๆ! ร่างปลอมหลุด ${g.name} คือผี!` : 'ปาโดน! ผีชะงัก', 4); } }
      else if(m.who===K.NET.me) K.toast('ปาเกลือพลาด');
      break;
    case 'holy':
      addHoly(m.x,m.z,m.a,m.d); sfx.splash(at({x:m.x,y:.3,z:m.z}));
      if(m.who===K.NET.me) K.toast('พรมน้ำมนต์แล้ว ผีข้ามเส้นนี้ไม่ได้ 15 วิ');
      break;
    case 'noise':
      sfx.clang(at({x:m.x,y:1,z:m.z}));
      if(ghost){ marker('เสียงดัง!', '#ff5a3a', m.x, 1.6, m.z, CFG.noiseTime); K.toast('ได้ยินเสียงดัง! มีคนจุดเทียนพลาด'); }
      else if(m.who===K.NET.me) K.toast('พลาด! เสียงดังจนผีได้ยินแล้ว');
      break;
    case 'ping':
      sfx.ping(at({x:m.x,y:1.5,z:m.z}));
      marker(K.SIGNALS[m.s]+' · '+K.nameOf(m.who), ['#7dffb0','#ff6a5a','#ffcf5a'][m.s], m.x, 2.4, m.z, 6);
      break;
    case 'wisp':
      sfx.wisp(at({x:m.x,y:m.y+.6,z:m.z}));
      R.wisps.push({x:m.x,y:m.y,z:m.z,t:3});
      if(!ghost && K.isSpect(me) && m.who===K.NET.me) K.toast('ส่งสัญญาณให้เพื่อนแล้ว');
      break;
    case 'leave': K.toast(`${m.n} ออกจากเกม`); break;
    // disguise mode: clues the host works out, since this page doesn't know who the ghost is
    case 'lt': K.strike(); if(m.eye) unveil(m.eye); break;
    case 'takrut':
      if(G.role==='surv' && L.ch==='takrut' && me && me.s==='alive'){ K.toast('ตะกรุดในมือสั่น... ผีอยู่ใกล้ตัวคุณ', 3); K.sfx.block(); K.vibrate && K.vibrate(90); }
      break;
    case 'crow': K.crowFlee && K.crowFlee(m.i); break;
  }
}
function ghostVoice(g){
  const out = K.at(g.pos);
  if(G.gk==='pop') K.sfx.growl(out); else if(G.gk==='pret') K.sfx.moan(out); else K.sfx.giggle(out);
}
K.ghostVoice = ghostVoice;

function onEnd(m){
  G.ph = 'end'; G.ended = true; L.sc = null;
  K.releasePointer && K.releasePointer();
  const surv = m.r.filter(r=>r.role==='surv'), esc = surv.filter(r=>r.s==='escaped').length;
  const label = {escaped:'หนีรอด', dead:'ตาย', down:'ตาย', alive:'ยังอยู่ในวัด'};
  const gname = GHOSTS[m.gk||G.gk].name;
  K.$('#endSub').textContent = m.why==='dawn' ? 'ฟ้าสางแล้ว' : 'จบรอบ';
  if(m.why==='ghostleft') K.$('#endTitle').textContent = 'ผีหายไปแล้ว';
  else if(G.role==='ghost') K.$('#endTitle').textContent = esc===0 ? 'คืนนี้'+gname+'อิ่ม' : `หนีไปได้ ${esc} คน`;
  else { const me = m.r.find(r=>r.i===K.NET.me); K.$('#endTitle').textContent = me && me.s==='escaped' ? 'รอดมาได้' : (esc ? `เพื่อนหนีรอด ${esc} คน` : 'ไม่มีใครรอด'); }
  const ul = K.$('#endList'); ul.innerHTML='';
  /* who carried the night: tasks and rescues count most */
  const score = r => { const t=r.st||{}; return (t.c||0)*3 + (t.o||0)*3 + (t.rv||0)*4 + (t.stun||0)*2 + (r.s==='escaped'?2:0); };
  const best = surv.length>1 ? surv.reduce((a,b)=>score(b)>score(a)?b:a) : null;
  for(const r of m.r){
    const li = document.createElement('li'), t = r.st||{};
    li.textContent = r.n+' ';
    const s = document.createElement('span'); s.textContent = r.role==='ghost' ? '— '+gname : '— '+label[r.s]; li.append(s);
    if(best && r===best && score(r)>0){ const b=document.createElement('b'); b.className='mvp'; b.textContent=' ดาวเด่น'; li.append(b); }
    const bits = r.role==='ghost'
      ? [t.hit&&`ตะครุบโดน ${t.hit}`, t.down&&`ล้ม ${t.down}`, t.kill&&`สูบวิญญาณ ${t.kill}`, t.stun&&`โดนทำให้มึน ${t.stun}`]
      : [t.c>=.1&&`จุดเทียน ${(Math.round(t.c*10)/10)} เล่ม`, t.o&&`วางของไหว้ ${t.o}`, t.rv&&`ช่วยเพื่อน ${t.rv}`, t.stun&&`ทำผีมึน ${t.stun}`, t.hit&&`โดนตะครุบ ${t.hit}`];
    const line = bits.filter(Boolean).join(' · ');
    if(line){ const d=document.createElement('div'); d.className='st'; d.textContent=line; li.append(d); }
    ul.append(li);
  }
  K.$('#againBtn').hidden = !K.NET.isHost;
  K.$('#endNote').textContent = K.NET.isHost ? '' : 'รอโฮสต์เริ่มรอบใหม่';
  // let a jumpscare finish before the results cover it
  const wait = K.scareLeft ? K.scareLeft()*1000 : 0;
  setTimeout(()=>{ if(G.ended && G.inGame) K.show('#endCard'); }, wait);
}
})(window.K);
