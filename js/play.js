/* play: my own movement and actions, other players' animation, world animation, per-frame audio */
(function(K){
'use strict';
const {CFG, GHOSTS, V3, clamp, lerp, mr} = K;
const G = K.G, P = K.P, L = K.L, R = K.ROUND;
const keys = K.keys = {};
K.IN = {mx:0, my:0, run:false, fly:0};   // touch joystick + fly buttons

/* ---------- what's in front of me ---------- */
K.findTarget = function(){
  const me = P[K.NET.me]; if(!me || (G.ph!=='play' && G.ph!=='wake')) return null;
  const fx=-Math.sin(L.yaw), fz=-Math.cos(L.yaw);
  let best=null, bd=1e9;
  const consider = (x,z,o,reach)=>{
    const dx=x-L.pos.x, dz=z-L.pos.z, d=Math.hypot(dx,dz);
    if(d>reach) return;
    if(d>1 && (dx*fx+dz*fz)/d<.45) return;
    if(d<bd){ bd=d; best=o; }
  };
  if(me.role==='surv' && me.s==='alive'){
    for(const c of R.cand) if(!c.lit) consider(c.x,c.z,{k:'candle',i:c.i},1.9);
    for(const b of K.BAT) if(b.up) consider(b.x,b.z,{k:'bat',i:b.i},1.7);
    for(const c of R.charms) if(c.up) consider(c.x,c.z,{k:'charm',i:c.i},1.7);
    if(L.of<0) for(const o of R.offers) if(!o.placed && !o.by) consider(o.x,o.z,{k:'offer',i:o.i},1.7);
    if(L.of>=0) consider(K.SHRINE.x,K.SHRINE.z,{k:'place'},2.4);
    for(const v of Object.values(P)) if(v.id!==K.NET.me && v.role==='surv' && v.s==='down') consider(v.pos.x,v.pos.z,{k:'revive',i:v.id},1.9);
  } else if(me.role==='ghost' && !(me.flags&16)){
    for(const v of Object.values(P)) if(v.role==='surv' && v.s==='down') consider(v.pos.x,v.pos.z,{k:'finish',i:v.id},2.2);
  }
  return best;
};
const TAP = {bat:1, charm:1, offer:1};
K.HOLD_KINDS = {candle:1, place:1, revive:1};
/* E pressed (or the use button tapped) */
K.usePress = function(){
  const me = P[K.NET.me]; if(!G.inGame || L.menu || !me) return;
  if(K.isSpect(me)){ K.wisp(); return; }
  const t = K.findTarget();
  if(t && TAP[t.k]) K.sendHost({t:'pick', k:t.k, i:t.i});
};
K.wisp = function(){
  if(G.ph!=='play' || K.gameTime<(L.wispLocal||0)) return;
  const dir = new V3(0,0,-1).applyQuaternion(K.camera.quaternion);
  const p = K.lookPoint(K.camera.position.clone(), dir, 30);
  L.wispLocal = K.gameTime + CFG.wispCD;
  K.sendHost({t:'wisp', x:K.r2(p.x), y:K.r2(Math.max(0,p.y)), z:K.r2(p.z)});
};
K.useCharm = function(){
  const me = P[K.NET.me]; if(!G.inGame || L.menu || !me || me.role!=='surv' || me.s!=='alive' || !L.ch) return;
  if(L.ch==='takrut'){ K.toast('ตะกรุดคุ้มครองคุณอยู่ กันโดนตะครุบได้ 1 ครั้ง'); return; }
  if(G.ph!=='play'){ K.toast('รอผีตื่นก่อน'); return; }
  K.sendHost({t:'use'});
};
K.signal = function(k){
  const me = P[K.NET.me]; if(!G.inGame || !me || me.role!=='surv' || K.isSpect(me)) return;
  if(K.gameTime<(L.pingLocal||0)) return;
  L.pingLocal = K.gameTime + CFG.signalCD;
  K.sendHost({t:'ping', k});
};
K.toggleCrouch = function(){
  const me = P[K.NET.me];
  if(G.role==='surv' && me && me.s==='alive' && !L.menu) L.crouch = !L.crouch;
};
K.toggleLight = function(){
  const me = P[K.NET.me];
  if(G.role==='surv' && me && me.s==='alive' && L.battery>0){ L.light=!L.light; K.sfx.pick(); }
};
K.ghostAttack = function(){
  const me = P[K.NET.me];
  if(G.role!=='ghost' || G.ph!=='play' || !me || (me.flags&16) || me.cd>0 || K.gameTime<L.atkLocal) return;
  L.lungeUntil = K.gameTime+CFG.lungeTime; L.lungeYaw = L.yaw; L.atkLocal = K.gameTime+.8;
  K.sfx.whoosh(); K.sendHost({t:'atk'});
};
K.ghostSkill = function(){
  const me = P[K.NET.me];
  if(G.role!=='ghost' || G.ph!=='play' || !me || me.sq>0) return;
  K.sendHost({t:'skill'});
};

/* ---------- candle timing ring ----------
   while lighting, a needle sweeps a circle; press inside the bright arc. Miss, or let go, and it clangs. */
K.scPress = function(){
  const s = L.sc; if(!s || s.done) return false;
  const ang = ((K.gameTime-s.t0)/s.dur)*Math.PI*2;
  const ok = ang>=s.a0 && ang<=s.a0+s.w;
  scResult(ok);
  return true;
};
function scResult(ok){
  const s = L.sc; if(!s || s.done) return;
  s.done = true; s.ok = ok; s.hide = K.gameTime+.35;
  if(ok) K.sfx.good();
  K.sendHost({t:'sc', i:s.i, ok});
  L.scNext = K.gameTime + mr(1.8,3.2);
}
function updateSkillCheck(){
  const h = L.holding;
  if(L.sc){
    const s = L.sc;
    if(s.done){ if(K.gameTime>s.hide) L.sc = null; }
    else if(!h || h.k!=='candle' || h.i!==s.i) scResult(false);
    else if(K.gameTime-s.t0>=s.dur) scResult(false);
    return;
  }
  if(!h || h.k!=='candle'){ L.scNext = 0; return; }
  if(!L.scNext){ L.scNext = K.gameTime + mr(1.2,2.4); return; }
  const c = R.cand[h.i]; if(!c || c.prog>.9) return;
  if(K.gameTime>=L.scNext){
    const w = mr(.75,1.0);                                   // ~45–55° arc
    L.sc = {i:h.i, t0:K.gameTime, dur:1.25, a0:mr(Math.PI*.6, Math.PI*1.55), w, done:false};
    K.sfx.tick();
  }
}

/* ---------- my movement ---------- */
K.updateLocal = function(dt){
  const me = P[K.NET.me]; if(!me) return;
  const ghost = G.role==='ghost', spect = K.isSpect(me), down = me.s==='down';
  const gdef = GHOSTS[G.gk];
  if(!L.menu){
    const tr = (keys.ArrowLeft?1:0)-(keys.ArrowRight?1:0); L.yaw += tr*dt*2.2;
    const tp = (keys.ArrowUp?1:0)-(keys.ArrowDown?1:0); L.pitch = clamp(L.pitch+tp*dt*1.6,-1.35,1.35);
  }
  L.target = (!L.menu && !spect && !down) ? K.findTarget() : null;
  /* a latched touch hold lets go when the target changes or the player walks off */
  const ah = L.autoHold;
  if(ah && (!L.target || L.target.k!==ah.k || L.target.i!==ah.i || Math.hypot(K.IN.mx,K.IN.my)>.35)) L.autoHold = null;
  const holdKey = keys.KeyE || keys.TouchUse || !!L.autoHold;
  L.holding = L.target && !TAP[L.target.k] && holdKey ? L.target : null;
  if(L.holding && K.gameTime>=L.holdSend){ L.holdSend = K.gameTime+.1; K.sendHost({t:'hold', k:L.holding.k, i:L.holding.i}); }
  updateSkillCheck();
  // movement
  let ix=0, iz=0;
  if(!L.menu){ if(keys.KeyW) iz-=1; if(keys.KeyS) iz+=1; if(keys.KeyA) ix-=1; if(keys.KeyD) ix+=1; ix += K.IN.mx; iz += K.IN.my; }
  let il = Math.hypot(ix,iz); if(il>1){ ix/=il; iz/=il; il=1; }
  const sin=Math.sin(L.yaw), cos=Math.cos(L.yaw);
  let vx = ix*cos + iz*sin, vz = -ix*sin + iz*cos, speed = 0, running = false;
  const runKey = keys.ShiftLeft || keys.ShiftRight || K.IN.run;
  if(spect){
    speed = 6;
    if(!L.menu){ if(keys.Space || K.IN.fly>0) L.flyY+=dt*4; if(((keys.ShiftLeft||keys.ShiftRight) && !K.IN.run) || K.IN.fly<0) L.flyY-=dt*4; }
    L.flyY = clamp(L.flyY,.5,12);
  } else if(down || L.holding){ speed = 0; }
  else if(ghost){
    const stunned = me.flags&16;
    if(G.ph==='wake' || stunned) speed = 0;
    else if(K.gameTime<L.lungeUntil){ vx=-Math.sin(L.lungeYaw); vz=-Math.cos(L.lungeYaw); speed=CFG.lunge; il=1; }
    else speed = gdef.speed * ((me.flags&8)?1.1:1) * (me.cd>CFG.missCD+.05 ? .55 : 1);
  } else {
    const moving = il>.05;
    const carrying = L.of>=0;
    running = moving && runKey && !L.exhausted && iz<=0 && !carrying;
    if(running) L.crouch = false;   // breaking into a run stands you up
    speed = carrying ? CFG.carry : running ? CFG.run : L.crouch ? CFG.crouch : CFG.walk;
    if(K.gameTime<L.boostUntil) speed *= 1.4;
    if(me.flags&128) speed *= .55;
    L.stamina = clamp(L.stamina + (running ? -CFG.stamDrain : CFG.stamRegen)*dt, 0, 100);
    if(L.stamina<=0) L.exhausted = true; if(L.exhausted && L.stamina>35) L.exhausted = false;
    if(L.light){ L.battery = Math.max(0, L.battery-CFG.batDrain*dt); if(L.battery<=0) L.light=false; }
  }
  const dist = speed*dt*Math.max(il, ghost&&K.gameTime<L.lungeUntil?1:0), steps = Math.max(1, Math.ceil(dist/.15));
  const who = {ghost, fly:ghost && gdef.fly, pret:ghost && G.gk==='pret'};
  const rad = ghost ? (G.gk==='pop' ? .4 : G.gk==='pret' ? .34 : .3) : CFG.R;
  for(let i=0;i<steps;i++){
    L.pos.x += vx*dist/steps; L.pos.z += vz*dist/steps;
    if(!spect) K.collide(L.pos, rad, who);
  }
  L.pos.x = clamp(L.pos.x,-29,29); L.pos.z = clamp(L.pos.z,-29,34);
  const moved = (speed>0 && il>.05) || K.gameTime<L.lungeUntil;
  if(me.role==='surv' && me.s==='alive' && G.gate && L.pos.z>26 && !L.escSent){ L.escSent=true; K.sendHost({t:'esc'}); }
  // camera
  let eye;
  if(spect) eye = L.flyY;
  else if(down) eye = .35;
  else if(ghost){
    eye = gdef.eye + Math.sin(K.gameTime*(G.gk==='krasue'?1.7:1.1))*(G.gk==='krasue'?.06:.03);
    if(moved && G.gk!=='krasue'){ L.bob += dt*(G.gk==='pop'?6:4.5); eye += Math.sin(L.bob)*.05; L.stepD += dist; if(L.stepD>1.8){ L.stepD=0; K.sfx.step(null,.25); } }
  } else {
    if(moved){ L.bob += dt*(running?11:L.crouch?4.5:7.5); L.stepD += dist; if(L.stepD>(running?2.2:1.6)){ L.stepD=0; K.sfx.step(null, running?.22:L.crouch?.04:.14); } }
    L.eyeH = lerp(L.eyeH||CFG.eye, L.crouch ? CFG.crouchEye : CFG.eye, Math.min(1, dt*9));
    eye = L.eyeH + Math.sin(L.bob)*(L.crouch?.02:.035);
  }
  L.pos.y = ghost||spect ? eye : 0;
  let shake = 0; if(K.shake>0){ K.shake -= dt; shake = K.shake*.03; }
  K.camera.position.set(L.pos.x + mr(-shake,shake), eye + mr(-shake,shake), L.pos.z);
  K.camera.rotation.set(L.pitch, L.yaw, down ? .25 : 0);
  me.pos.set(L.pos.x, L.pos.y, L.pos.z); me.yaw = L.yaw;
  L.moving = moved; L.running = running;
};
let sendAcc = 0;
K.sendState = function(dt){
  sendAcc += dt; if(sendAcc<CFG.net) return; sendAcc = 0;
  const f = (L.light?1:0)|(L.running?2:0)|(L.moving?4:0)|(L.holding?64:0)|(L.crouch?512:0);
  K.sendHost({t:'st', x:K.r2(L.pos.x), y:K.r2(L.pos.y), z:K.r2(L.pos.z), a:K.r2(L.yaw), b:K.r2(L.pitch), f});
};

/* ---------- other players ---------- */
const tmpV = new V3();
K.updateRemotes = function(dt){
  const k = 1-Math.exp(-dt*14);
  const iAmGhost = G.role==='ghost', iAmSpect = K.isSpect(P[K.NET.me]);
  const t = K.gameTime;
  for(const v of Object.values(P)){
    if(v.id===K.NET.me) continue;
    v.pos.lerp(v.tpos,k); v.yaw = K.angLerp(v.yaw,v.tyaw,k); v.pitch = lerp(v.pitch,v.tpitch,k);
    const g = v.model.g, gone = K.isSpect(v);
    const moved = Math.hypot(v.pos.x-v.last.x, v.pos.z-v.last.z); v.last.copy(v.pos);
    const sp = moved/Math.max(dt,1e-4);
    if(v.role==='ghost'){
      const inv = v.flags&8, stun = v.flags&16, lunge = v.flags&32, m = v.model;
      g.visible = !inv;
      /* it turns its head to watch you. The เปรต's neck turns further than a neck should */
      const cdx = K.camera.position.x-v.pos.x, cdz = K.camera.position.z-v.pos.z, cd = Math.hypot(cdx,cdz);
      const meAlive = !iAmSpect && P[K.NET.me] && P[K.NET.me].s==='alive';
      let rel = Math.atan2(-cdx,-cdz) - v.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const lim = m.kind==='pret' ? 1.75 : m.kind==='pop' ? 1.0 : 1.2;
      const want = meAlive && cd<13 && Math.abs(rel)<lim+.6 ? clamp(rel,-lim,lim) : 0;
      m.look = lerp(m.look||0, want, Math.min(1, dt*(m.kind==='pret'?1.6:3.5)));
      g.position.set(v.pos.x, v.pos.y + m.yOff, v.pos.z); g.rotation.y = v.yaw + (m.kind==='krasue' ? m.look : 0);
      if(m.kind!=='krasue') m.head.rotation.y = m.look;
      // eyes catch the dark from far off, and blink now and then
      m.blinkT = (m.blinkT==null ? mr(2,6) : m.blinkT) - dt;
      if(m.blinkT < -.13) m.blinkT = mr(2,6);
      K.ghostEyeMat.opacity = m.blinkT<0 ? 0 : clamp(1.35 - cd/20, .12, 1);
      // something breathing right behind you
      if(meAlive && !inv && G.ph==='play' && cd<8){
        const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw);
        v.breathT = (v.breathT||0) - dt;
        if((cdx*fx+cdz*fz)/Math.max(cd,.01) > .25 && v.breathT<=0 && K.A.ctx){ v.breathT = mr(5,9); K.sfx.breath(K.at(v.pos)); }
      }
      if(m.kind==='krasue'){
        m.guts.rotation.x = Math.sin(t*2.1)*.12 + (lunge ? .5 : 0); m.guts.rotation.z = Math.sin(t*1.6)*.1;
        m.tubes.forEach((tb,i)=>{ tb.rotation.y = Math.sin(t*1.3+i)*.4; });
        m.head.rotation.z = stun ? Math.sin(t*30)*.2 : Math.sin(t*.7)*.08;
        if(!inv) K.lightSource(v.pos.x, v.pos.y-.5, v.pos.z, 0x6dffa6, 1.1+Math.sin(t*9)*.15, 7);
      } else {
        const ph = t*(m.kind==='pop'?6:4.5), sw = sp>.3 ? Math.sin(ph)*(m.kind==='pop'?.5:.35) : 0;
        m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
        const base = m.kind==='pop' ? .7 : 0;
        m.arms[0].rotation.x = base - sw*.6 + (lunge?1.2:0); m.arms[1].rotation.x = base + sw*.6 + (lunge?1.2:0);
        m.head.rotation.z = stun ? Math.sin(t*28)*.25 : Math.sin(t*.6)*.1;
        if(m.body) m.body.rotation.x = -.95 - (lunge?.25:0) + Math.sin(t*1.4)*.03;
        // heavy footfalls give the walking ghosts away; the krasue floats in silence
        if(!inv && sp>.3 && K.A.ctx && G.ph==='play'){
          v.stepD += moved;
          if(v.stepD>(m.kind==='pop'?1.5:2.4)){ v.stepD=0; const o=K.at({x:v.pos.x, y:.2, z:v.pos.z}); if(m.kind==='pop') K.sfx.stomp(o,.32); else { K.sfx.stomp(o,.2); K.sfx.drag(o,.1); } }
        }
      }
      v.voiceT -= dt;
      if(v.voiceT<=0){ v.voiceT = mr(9,16); if(!inv && G.ph==='play' && K.camera.position.distanceTo(v.pos)<20) K.ghostVoice(v); }
    } else {
      const m = v.model;
      g.visible = !gone;
      if(v.spirit){ v.spirit.g.visible = gone && iAmSpect && v.s==='dead'; v.spirit.g.position.set(v.pos.x, v.pos.y-1.2+Math.sin(t*1.3+v.pos.x)*.1, v.pos.z); }
      const crouched = (v.flags&512) && v.s==='alive';
      // the sound of being fed on carries
      if(v.s==='down' && v.fn>(v.lastFn||0)+.001 && K.A.ctx){
        v.chewT = (v.chewT||0) - dt;
        const gv = K.ghostView();
        if(v.chewT<=0 && gv){ v.chewT = mr(.55,.8); const o = K.at(gv.pos); if(G.gk==='pop') K.sfx.chew(o); else if(G.gk==='krasue') K.sfx.slurp(o); else K.sfx.suck(o); }
      }
      v.lastFn = v.fn;
      g.scale.y = lerp(g.scale.y, crouched ? .66 : 1, Math.min(1, dt*9));
      if(v.s==='down'){ g.position.set(v.pos.x,.15,v.pos.z); g.rotation.set(-Math.PI/2,v.yaw,0,'YXZ'); }
      else { g.position.set(v.pos.x,0,v.pos.z); g.rotation.set(0,v.yaw,0); }
      const ph = t*(sp>4?11:7.5);
      const sw = sp>.3 && v.s==='alive' ? Math.sin(ph)*.6 : 0;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.arms[0].rotation.x = v.of>=0 ? -1.1 : -sw*.7;
      m.arms[1].rotation.x = Math.PI/2*.85 + v.pitch;
      v.label.visible = !iAmGhost && !gone && K.camera.position.distanceTo(v.pos)<12;
      if(v.s==='alive' && moved>0 && !crouched){   // crouch-walking makes no sound
        v.stepD += moved; if(v.stepD>(sp>4?2.2:1.6)){ v.stepD=0; if(K.A.ctx) K.sfx.step(K.at(v.pos), (sp>4?.3:.18)*(v.h===1?1.4:1)); }
      }
      if(v.spot){
        let on = (v.flags&1) && v.s==='alive';
        if(on && (v.flags&128) && Math.random()<.35) on = false;
        v.spot.light.intensity = on ? 2 : 0;
        v.spot.beam.visible = !!on && K.QUAL[K.QUALITY].beams;
        if(on){
          m.torch.getWorldPosition(tmpV);
          const cb = Math.cos(v.pitch), dir = new V3(-Math.sin(v.yaw)*cb, Math.sin(v.pitch), -Math.cos(v.yaw)*cb);
          v.spot.light.position.copy(tmpV); v.spot.light.target.position.copy(tmpV).addScaledVector(dir,10);
          v.spot.beam.position.copy(tmpV); v.spot.beam.lookAt(tmpV.clone().add(dir));
        }
      }
    }
  }
};

/* ---------- world ---------- */
const DAWN_COL = new THREE.Color(0x2a3550), tmpC = new THREE.Color();
K.updateWorld = function(dt){
  const t = K.gameTime;
  K.ALTARS[0] && (K.ALTARS[0].ember.material.opacity = .3+Math.sin(t*1.7)*.12);   // shared material: one pulse for all
  for(const c of R.cand) c.altar.ember.visible = !c.lit;
  for(const c of R.cand) if(c.lit){
    let f=1+Math.sin(t*13+c.i)*.08+Math.sin(t*7.3+c.i*2)*.06;
    for(const w of R.wisps) if(Math.hypot(w.x-c.x,w.z-c.z)<6) f *= Math.random()<.5 ? .15 : 1.3;
    c.altar.flame.scale.y=f;
    K.lightSource(c.x-.15,1.15,c.z,0xff9a40,1.4*f,7);
  }
  if(R.offers.some(o=>o.placed)) K.lightSource(K.SHRINE.x,2,K.SHRINE.z+.4,0xffc070,.9+Math.sin(t*5)*.1,5);
  if(K.GATE.open) K.lightSource(0, 2.4, 25.6, 0xbccaff, 1.5+Math.sin(t*2)*.2, 10);   // cold light of the road outside: the way out
  if(K.GATE.open && K.GATE.a<1){ K.GATE.a = Math.min(1, K.GATE.a+dt*.5); for(const d of K.GATE.doors) d.pivot.rotation.y = d.s*K.GATE.a*1.75; }
  for(const b of K.BAT) if(b.up) b.mesh.rotation.y += dt*1.5;
  for(const c of R.charms) if(c.up) c.g.children[0].rotation.y += dt*1.2;
  for(const o of R.offers) if(!o.by && !o.placed) o.g.children[0].rotation.y += dt*.8;
  K.sky.position.copy(K.camera.position);
  // dawn creeping in over the last minute and a half
  if(G.inGame && G.role!=='ghost' && K.baseFog!=null){
    const k = clamp(1-G.left/90, 0, 1);
    tmpC.setHex(K.baseFog).lerp(DAWN_COL, k*.85);
    K.scene.fog.color.copy(tmpC); K.scene.background.copy(tmpC);
    K.stars.material.opacity = 1-k*.8;
  }
  // my flashlight
  const me = P[K.NET.me], s0 = K.SPOTS[0];
  const alive = G.inGame && G.role==='surv' && me && me.s==='alive';
  let on = alive && L.light;
  K.handTorch.visible = !!alive;
  K.handItem.visible = !!alive;
  if(on){
    let inten = 2.3;
    if(L.battery<15) inten *= (Math.random()<.08 ? .1 : .6+L.battery/40);
    if(me.flags&128) inten *= Math.random()<.4 ? 0 : .7;
    if(K.fear>.5 && Math.random()<K.fear*.09) inten *= .12;   // the torch stutters when something is close
    s0.light.intensity = inten;
    const dir = new V3(0,0,-1).applyQuaternion(K.camera.quaternion);
    s0.light.position.copy(K.camera.position).addScaledVector(dir,.2).add(new V3(0,-.12,0));
    s0.light.target.position.copy(K.camera.position).addScaledVector(dir,10);
  } else s0.light.intensity = 0;
  K.flushLights();
};

/* ---------- chase music: survivors hear the ghost closing in; the ghost hears its prey getting near ---------- */
function musicTick(dt, g, me){
  let k = 0, chase = false;
  if(G.inGame && G.ph==='play' && me && !L.menu){
    if(G.role==='ghost'){
      let d = 1e9; for(const v of Object.values(P)) if(v.role==='surv' && v.s==='alive') d = Math.min(d, Math.hypot(v.pos.x-L.pos.x, v.pos.z-L.pos.z));
      k = clamp(1-d/10, 0, 1)*.85; chase = d<5;
    } else if(g && (me.s==='alive' || me.s==='down')){
      const d = Math.hypot(g.pos.x-L.pos.x, g.pos.z-L.pos.z);
      k = clamp(1-(d-2)/(CFG.terror-2), 0, 1) * ((g.flags&8) ? .55 : 1);
      chase = d<7 && !(g.flags&8) && !(g.flags&16);
    }
  }
  K.musicUpdate(dt, k, chase);
}

/* ---------- audio per frame: heartbeat, ghost presence, crickets, distant haunts ---------- */
let heartT = 0, cricketT = 2, hauntT = 15;
K.updateAudio = function(dt){
  const A = K.A; if(!A.ctx) return;
  K.setListener();
  cricketT -= dt; if(cricketT<=0){ cricketT = mr(.4,2.2); K.sfx.cricket(); }
  if(G.inGame && G.ph==='play'){
    hauntT -= dt;
    if(hauntT<=0){ hauntT = mr(18,45); const a = Math.random()*Math.PI*2; K.sfx.haunt(K.spatial(L.pos.x+Math.cos(a)*24, 2, L.pos.z+Math.sin(a)*24, A.amb)); }
  }
  const g = K.ghostView(), me = P[K.NET.me];
  musicTick(dt, g, me);
  if(!g || !me || G.role==='ghost'){ A.humGain.gain.value = 0; return; }
  K.setPos(A.humPan, g.pos.x, g.pos.y, g.pos.z);
  A.humGain.gain.value = (g.flags&8) || G.ph==='wake' ? 0 : .22;
  for(const k in A.hum) A.hum[k].gain.value = k===G.gk ? 1 : 0;
  if(me.s!=='alive' && me.s!=='down') return;
  if(me.s==='down' && me.fn>(L.lastFn||0)+.001){ L.chewT = (L.chewT||0)-dt; if(L.chewT<=0){ L.chewT = mr(.5,.75); const o = K.at(g.pos); if(G.gk==='pop') K.sfx.chew(o); else if(G.gk==='krasue') K.sfx.slurp(o); else K.sfx.suck(o); } }
  L.lastFn = me.fn;
  const d = Math.hypot(g.pos.x-L.pos.x, g.pos.z-L.pos.z);
  if(d<CFG.terror && G.ph==='play'){
    heartT -= dt;
    if(heartT<=0){ const k=1-d/CFG.terror; heartT = lerp(1.15,.42,k); K.sfx.heart(.12+k*.5); }
  }
};
})(window.K);
