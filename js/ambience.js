/* ambience: things that make the temple feel wrong — ground mist, lightning, shrouded statues, prayer flags,
   will-o'-wisps over the graves, dread when the ghost is close, and the occasional figure that isn't there */
(function(K){
'use strict';
const {scene, MAT, mr, clamp, V3, boxGeo, flat} = K;
const G = K.G, L = K.L, P = K.P;
const rnd = K.mulberry32(7771);
const R = (a,b) => a+rnd()*(b-a);
const world = K.world;

/* ---------- shrouded statues (cloth over old images, like the one in the hall) ---------- */
function shrouded(x,z,s,ry){
  { const p = new V3(x,0,z); K.collide(p,.5*(s||1),{}); if(Math.hypot(p.x-x,p.z-z)>.01){ if(K.DEBUG) console.log('statue skipped', x, z); return null; } }
  const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = ry||0; g.scale.setScalar(s||1); world.add(g);
  const base = new THREE.Mesh(boxGeo(.7,.3,.6), MAT.white); base.position.y=.15; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.2,.38,.95,8), MAT.cloth); body.position.y=.78; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.19,1), MAT.cloth); head.position.set(0,1.38,-.03); head.scale.y=1.15; g.add(head);
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.12,8,1,true), MAT.cloth); hem.position.y=.35; g.add(hem);
  K.colliders.push({cx:x,cz:z,r:.42*(s||1),h:1.5});
  return g;
}
for(const [x,z,s,r] of [[-8.6,10.2,1,.4],[-3.4,14.2,.9,-.6],[-19.3,-2.6,1,1.4],[6.4,-8.2,1.05,-1.2],[-6.4,-17.4,1,1.6],[12.3,9.4,.85,.3],[-23,1.5,1,1.57],[16.2,-3.4,.95,-.8]]) shrouded(x,z,s,r);

/* ---------- ธงตะขาบ (long prayer flags) in front of the hall ---------- */
const FLAGS = [];
{
  const clothM = new THREE.MeshPhongMaterial({color:0x8a7a5a, side:THREE.DoubleSide, flatShading:true, transparent:true, opacity:.92});
  for(const x of [-2.7,2.7]){
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,6.2,6), MAT.wood); pole.position.set(x,3.1,-4.6); world.add(pole);
    K.colliders.push({cx:x,cz:-4.6,r:.12,h:6.2});
    const pivot = new THREE.Group(); pivot.position.set(x+.08,6,-4.6); world.add(pivot);
    const geo = new THREE.PlaneGeometry(.42,3.6,1,8); geo.translate(0,-1.8,0);
    const flag = new THREE.Mesh(geo, clothM); pivot.add(flag);
    for(let i=1;i<6;i++){ const bar=new THREE.Mesh(boxGeo(.5,.03,.03), MAT.wood); bar.position.set(0,-i*.6,0); pivot.add(bar); }
    FLAGS.push({pivot, geo, base:geo.attributes.position.array.slice(), ph:R(0,6)});
  }
}
/* ---------- broken paper lanterns under the pavilion ---------- */
const LANTERNS = [];
for(const [x,z] of [[-16.5,-1.4],[-13.2,3.4],[-18.1,4.2]]){
  const pivot = new THREE.Group(); pivot.position.set(x,4.25,z); world.add(pivot);
  const str = new THREE.Mesh(boxGeo(.01,.6,.01), flat(0x111111)); str.position.y=-.3; pivot.add(str);
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.36,8), flat(0x6a1a14,{transparent:true,opacity:.9})); lan.position.y=-.78; pivot.add(lan);
  const torn = new THREE.Mesh(boxGeo(.1,.25,.01), flat(0x8a2a1a)); torn.position.set(.1,-1.05,0); torn.rotation.z=.4; pivot.add(torn);
  LANTERNS.push({pivot, ph:R(0,6)});
}

/* ---------- moon halo ---------- */
{
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:K.glowTex(200,190,170), transparent:true, opacity:.35, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
  halo.position.set(-26,26,-40); halo.scale.setScalar(16); K.sky.add(halo);
}

/* ---------- ground mist ---------- */
const mistTex = K.canvasTex(64,64,(g)=>{
  const id = g.createImageData(64,64), d = id.data;
  for(let y=0;y<64;y++) for(let x=0;x<64;x++){
    const dx=(x-32)/32, dy=(y-32)/32, r=Math.sqrt(dx*dx+dy*dy);
    const n = .55+.45*Math.sin(x*.31+Math.sin(y*.23)*2)*Math.cos(y*.27+x*.05);
    const a = Math.max(0,1-r)**1.6*n;
    const i=(y*64+x)*4; d[i]=d[i+1]=d[i+2]=255; d[i+3]=a*255|0;
  }
  g.putImageData(id,0,0);
});
mistTex.magFilter = THREE.LinearFilter; mistTex.minFilter = THREE.LinearFilter;
const MIST = [];
for(let i=0;i<36;i++){
  const m = new THREE.Sprite(new THREE.SpriteMaterial({map:mistTex, color:0x9aa6ba, transparent:true, opacity:R(.2,.32), depthWrite:false}));
  m.position.set(R(-22,22), R(.25,.6), R(-22,22)); const s=R(5,9); m.scale.set(s, s*.32, 1);
  m.material.rotation = R(0,6);
  m.userData = {vx:R(-.12,.12), vz:R(-.08,.08), base:m.material.opacity};
  scene.add(m); MIST.push(m);
}
/* ---------- ผีพราย: will-o'-wisps drifting over the graves ---------- */
const wispMat = new THREE.SpriteMaterial({map:K.glowTex(120,200,255), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false});
const WISPS = [];
for(let i=0;i<6;i++){
  const s = new THREE.Sprite(wispMat); s.scale.setScalar(.28); scene.add(s);
  WISPS.push({s, cx:R(9,20), cz:R(8,17), r:R(.6,1.8), sp:R(.15,.4), ph:R(0,6), y:R(.6,1.4)});
}

/* ---------- lightning ---------- */
const LT = {next:mr(8,20), t:-1, seq:null};
const FLASH_COL = new THREE.Color(0x4a5670), tmpC = new THREE.Color();
function strike(){
  LT.t = 0; LT.seq = [[0,.07],[.13,.19],[.26,.36]];
  const d = mr(.6,2.6);
  setTimeout(()=>K.sfx.thunder && K.sfx.thunder(), d*1000);
}
K.strike = strike;
K.flashOn = () => flashLevel();
function flashLevel(){
  if(LT.t<0) return 0;
  for(const [a,b] of LT.seq) if(LT.t>=a && LT.t<=b) return 1;
  return 0;
}

/* ---------- the figure that isn't there ---------- */
const fig = (function(){
  const g = new THREE.Group(); scene.add(g); g.visible = false;
  const m = new THREE.MeshBasicMaterial({color:0xb8b4a8, transparent:true, opacity:.85});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.16,.34,1.4,7), m); body.position.y=.7; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,1), m); head.position.y=1.55; g.add(head);
  const face = new THREE.Mesh(new THREE.CircleGeometry(.09,8), new THREE.MeshBasicMaterial({color:0x050505})); face.position.set(0,1.53,-.16); face.rotation.y=Math.PI; g.add(face);
  return {g, m, t:0, next:mr(50,90), lit:0};
})();
function trySpawnFigure(){
  const me = P[K.NET.me];
  if(!me || me.role!=='surv' || me.s!=='alive' || G.ph!=='play') return;
  for(const v of Object.values(P)) if(v.id!==K.NET.me && v.role==='surv' && v.s==='alive' && v.pos.distanceTo(L.pos)<9) return;
  const g = K.ghostView(); if(g && g.pos.distanceTo(L.pos)<16) return;
  const side = (Math.random()<.5?-1:1)*mr(.25,.5), d = mr(11,15);
  const a = L.yaw + side, x = L.pos.x - Math.sin(a)*d, z = L.pos.z - Math.cos(a)*d;
  if(Math.abs(x)>23 || Math.abs(z)>23) return;
  const p = new V3(x,0,z); K.collide(p,.4,{}); if(p.distanceTo(new V3(x,0,z))>.05) return;
  if(!K.lineOfSight(L.pos.x,1.6,L.pos.z,x,1.3,z)) return;
  fig.g.position.set(x,0,z); fig.g.lookAt(L.pos.x,0,L.pos.z); fig.g.rotateY(Math.PI);
  fig.g.visible = true; fig.t = mr(1.6,2.6); fig.lit = 0; fig.m.opacity = .85;
}
/* sometimes the lightning shows a figure out there that is gone in the next flash */
function flashFigure(){
  const me = P[K.NET.me];
  if(!G.inGame || !me || me.role!=='surv' || me.s!=='alive' || G.ph!=='play' || fig.g.visible || Math.random()>.4) return;
  const g = K.ghostView(); if(g && g.pos.distanceTo(L.pos)<22) return;   // the real one is near: let it be the one you see
  const a = L.yaw + mr(-.35,.35), d = mr(16,22), x = L.pos.x - Math.sin(a)*d, z = L.pos.z - Math.cos(a)*d;
  if(Math.abs(x)>23 || Math.abs(z)>23) return;
  const p = new V3(x,0,z); K.collide(p,.4,{}); if(p.distanceTo(new V3(x,0,z))>.05) return;
  if(!K.lineOfSight(L.pos.x,1.6,L.pos.z,x,1.3,z)) return;
  fig.g.position.set(x,0,z); fig.g.lookAt(L.pos.x,0,L.pos.z); fig.g.rotateY(Math.PI);
  fig.g.visible = true; fig.t = .38; fig.lit = 0; fig.m.opacity = .85; fig.quiet = true;
}
function updateFigure(dt){
  fig.next -= dt;
  if(fig.next<=0){ fig.next = mr(55,110); trySpawnFigure(); }
  if(!fig.g.visible) return;
  fig.t -= dt;
  const d = fig.g.position.distanceTo(new V3(L.pos.x,0,L.pos.z));
  const f = new V3(0,0,-1).applyQuaternion(K.camera.quaternion), to = fig.g.position.clone().setY(1.3).sub(K.camera.position).normalize();
  if(L.light && f.dot(to)>.97) fig.lit += dt;
  if(fig.t<=0 || d<7 || fig.lit>.25 || !G.inGame){
    fig.g.visible = false;
    if(fig.quiet){ fig.quiet = false; return; }
    if(G.inGame){ K.sfx.haunt(K.at({x:fig.g.position.x,y:1.4,z:fig.g.position.z})); if(fig.lit>.25 || d<7) K.sfx.sting(); }
  }
}

/* ---------- ตุ๊กตา: old dolls on the monks' shelves. They turn to face you while you aren't looking ---------- */
const dollFace = K.canvasTex(32,32,(g)=>{
  g.fillStyle='#d9cdb8'; g.fillRect(0,0,32,32);
  g.fillStyle='#120c0a'; g.fillRect(0,0,32,9); g.fillRect(0,0,4,20); g.fillRect(28,0,4,20);       // black bob
  g.fillStyle='#050404'; g.beginPath(); g.ellipse(11,16,3.4,4.2,0,0,7); g.ellipse(21,16,3.4,4.2,0,0,7); g.fill();
  g.fillStyle='rgba(200,190,170,.9)'; g.fillRect(10,14,1,1); g.fillRect(20,14,1,1);
  g.fillStyle='#7a1010'; g.fillRect(14,24,4,2);
  g.fillStyle='rgba(90,20,15,.55)'; g.fillRect(10,21,1,5); g.fillRect(22,21,1,4);              // stains under the eyes
});
const DOLLS = [];
{
  const dress = flat(0x7a1c1c), skin = new THREE.MeshPhongMaterial({color:0xd9cdb8, flatShading:true}), hair = flat(0x120c0a);
  const faceM = new THREE.MeshBasicMaterial({map:dollFace});
  for(const [x,y,z] of [[-16.6,1.1,-15.4],[-9.6,1.1,-20.5],[-19.1,1.1,9.8],[20.9,1.1,1.6],[1.9,.9,-18.3],[-12.5,.45,3]]){
    const g = new THREE.Group(); g.position.set(x,y,z); world.add(g);
    const body = new THREE.Mesh(new THREE.ConeGeometry(.12,.26,7), dress); body.position.y=.13; g.add(body);
    const head = new THREE.Group(); head.position.y=.33; g.add(head);
    head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.085,1), skin));
    const hr = new THREE.Mesh(new THREE.IcosahedronGeometry(.09,1), hair); hr.position.set(0,.015,-.012); hr.scale.set(1,1,.92); head.add(hr);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(.13,.13), faceM); f.position.z=.083; head.add(f);
    const away = R(0,Math.PI*2); g.rotation.y = away;
    DOLLS.push({g, head, x, y, z, away, unseen:0, facing:false, armed:false, seenFor:0});
  }
}
let dollGiggleAt = -99, dollT = 0;
/* is a point inside my view (and not behind a wall)? */
function inView(x,y,z,far){
  const cp = K.camera.position, dx=x-cp.x, dy=y-cp.y, dz=z-cp.z, d=Math.hypot(dx,dy,dz);
  if(d>far) return false;
  const f = tmpV.set(0,0,-1).applyQuaternion(K.camera.quaternion);
  if((f.x*dx+f.y*dy+f.z*dz)/d < .76) return false;
  return K.lineOfSight(cp.x,cp.y,cp.z,x,y,z);
}
const tmpV = new V3();
function updateDolls(dt){
  dollT += dt; if(dollT<.2) return;
  const st = dollT; dollT = 0;
  const me = P[K.NET.me], living = G.inGame && me && me.role==='surv' && me.s==='alive';
  for(const d of DOLLS){
    const dist = Math.hypot(L.pos.x-d.x, L.pos.z-d.z);
    const seen = dist<16 && inView(d.x,d.y+.3,d.z,16);
    if(seen){
      d.unseen = 0;
      if(d.armed && dist<10){ d.armed = false; d.seenFor = 0;
        if(living && K.gameTime-dollGiggleAt>35){ dollGiggleAt = K.gameTime; setTimeout(()=>{ if(G.inGame) K.sfx.giggle(K.at({x:d.x,y:d.y+.3,z:d.z})); }, 500); }
      }
      d.seenFor += st;
      // stare long enough from close by and the head tilts
      d.head.rotation.z += ((d.facing && dist<3.5 && d.seenFor>1.2 ? .45 : 0) - d.head.rotation.z)*Math.min(1,st*3);
      continue;
    }
    d.unseen += st; d.seenFor = 0;
    if(!d.facing && living && dist<13 && d.unseen>1.5 && Math.random()<st*.35){
      d.facing = true; d.armed = true; d.g.rotation.y = Math.atan2(L.pos.x-d.x, L.pos.z-d.z);
    } else if(d.facing && d.unseen>12 && Math.random()<st*.1){
      d.facing = false; d.armed = false; d.g.rotation.y = d.away = R(0,Math.PI*2); d.head.rotation.z = 0;
    } else if(d.facing && dist<13) d.g.rotation.y = Math.atan2(L.pos.x-d.x, L.pos.z-d.z);   // keep following while unseen
  }
}

/* ---------- โลงศพ: a coffin left in the hall. Sometimes something inside knocks ---------- */
const COFFIN = (function(){
  const x=3.25, z=-17.3, g = new THREE.Group(); g.position.set(x,0,z); world.add(g);
  const wood = flat(0x2a1a12), gold = MAT.gold;
  for(const sx of [-.7,.7]){ const t=new THREE.Mesh(boxGeo(.08,.55,.5), wood); t.position.set(sx,.275,0); g.add(t); }
  const box = new THREE.Mesh(boxGeo(1.9,.5,.58), wood); box.position.y=.8; g.add(box);
  const trim = new THREE.Mesh(boxGeo(1.94,.05,.62), gold); trim.position.y=.6; g.add(trim);
  const pivot = new THREE.Group(); pivot.position.set(0,1.05,-.29); g.add(pivot);
  const lid = new THREE.Mesh(boxGeo(1.96,.1,.62), wood); lid.position.set(0,.05,.31); pivot.add(lid);
  const ridge = new THREE.Mesh(boxGeo(1.7,.08,.3), wood); ridge.position.set(0,.13,.31); pivot.add(ridge);
  pivot.rotation.set(-.06,0,.02);                      // never quite closed
  const crack = new THREE.Mesh(boxGeo(1.6,.04,.02), new THREE.MeshBasicMaterial({color:0x000000})); crack.position.set(0,1.06,.3); g.add(crack);
  // a wreath of dead flowers leaning on it, and two cold candles
  const wr = new THREE.Mesh(new THREE.TorusGeometry(.28,.07,5,10), flat(0x8c8270)); wr.position.set(-1.12,.55,.12); wr.rotation.set(0,Math.PI/2,.15); g.add(wr);
  for(const sx of [-.6,.6]){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.24,6), flat(0xd8d0bb)); c.position.set(sx,1.26,.3); g.add(c); }
  K.colliders.push({x0:x-.98,x1:x+.98,z0:z-.31,z1:z+.31,h:1.1});
  return {x, z, pivot, next:mr(20,40), k:-1};
})();
function updateCoffin(dt){
  const C = COFFIN, d = Math.hypot(L.pos.x-C.x, L.pos.z-C.z);
  C.next -= dt;
  if(C.next<=0){
    C.next = mr(35,75);
    const me = P[K.NET.me];
    if(G.inGame && me && me.s==='alive' && d<9){ K.sfx.knock(K.at({x:C.x,y:.9,z:C.z})); C.k = 0; }
  }
  if(C.k>=0){
    C.k += dt;
    const b = [0,.32,.64].some(t=>C.k>t && C.k<t+.09);
    C.pivot.rotation.x = b ? -.14 : -.06;
    if(C.k>1) C.k = -1;
  }
}

/* ---------- อีกา: crows on the walls burst into the air when someone comes close, ghost included ---------- */
const CROWS = [];
{
  const black = flat(0x0d0d10), beakM = flat(0x2a2620);
  const bodyG = new THREE.IcosahedronGeometry(.11,0), headG = new THREE.IcosahedronGeometry(.06,0), beakG = new THREE.ConeGeometry(.02,.08,4), wingG = new THREE.PlaneGeometry(.24,.12); wingG.translate(.12,0,0);
  const tailG = new THREE.PlaneGeometry(.08,.14);
  const eyeM = new THREE.MeshBasicMaterial({color:0xc8a040});
  for(const [x,y,z] of [[-8.6,1.6,-2],[-7.3,1.6,-2],[4.5,1.8,9],[12.4,1.7,4.5],[-22.4,1.7,-14],[3,1.8,-22],[4.2,1.8,-22],[-9,1.9,-11.5],[-22,1.5,4],[21.5,1.5,15.5],[17.5,1.8,19.5],[-3.5,1.7,16.2]]){
    const g = new THREE.Group(); world.add(g);
    const b = new THREE.Mesh(bodyG, black); b.scale.set(.8,.8,1.35); b.position.y=.1; g.add(b);
    const h = new THREE.Mesh(headG, black); h.position.set(0,.2,.12); g.add(h);
    const bk = new THREE.Mesh(beakG, beakM); bk.rotation.x=Math.PI/2; bk.position.set(0,.19,.2); g.add(bk);
    for(const s of [-1,1]){ const e=new THREE.Mesh(new THREE.SphereGeometry(.009,4,3), eyeM); e.position.set(s*.035,.215,.155); g.add(e); }
    const t = new THREE.Mesh(tailG, black); t.position.set(0,.08,-.2); t.rotation.x=-1.1; g.add(t);
    const wings = [-1,1].map(s=>{ const w=new THREE.Mesh(wingG, black); w.material.side = THREE.DoubleSide; w.position.set(s*.05,.14,0); w.rotation.set(-Math.PI/2,0,0); w.scale.x=s; w.visible=false; g.add(w); return w; });
    const c = {g, head:h, wings, home:new V3(x,y,z), st:'perch', t:0, vel:new V3(), ph:R(0,6)};
    resetCrow(c); CROWS.push(c);
  }
  black.side = THREE.DoubleSide;
}
function resetCrow(c){
  c.st = 'perch'; c.t = 0; c.g.visible = true;
  c.g.position.copy(c.home).add(tmpV.set(R(-.2,.2),0,R(-.1,.1))); c.g.rotation.set(0,R(0,6.3),0);
  for(const w of c.wings) w.visible = false;
}
function flush(c, near){
  c.st = 'fly'; c.t = 0;
  const a = Math.atan2(c.home.x-near.x, c.home.z-near.z) + R(-.8,.8);
  c.vel.set(Math.sin(a)*R(3,4.5), R(2.2,3.2), Math.cos(a)*R(3,4.5));
  c.g.rotation.set(0, a, 0);
  for(const w of c.wings) w.visible = true;
}
let crowSfxAt = -99, crowT = 0;
function updateCrows(dt){
  crowT += dt;
  const scan = crowT>.15; if(scan) crowT = 0;
  // who is moving around: living survivors and the ghost, wherever it hides
  let movers = null;
  if(scan && G.inGame && (G.ph==='play'||G.ph==='wake')){
    movers = [];
    for(const v of Object.values(P)){
      const mine = v.id===K.NET.me;
      if(v.role==='ghost' ? G.ph!=='play' : v.s!=='alive') continue;
      const p = mine ? L.pos : v.pos; if(!p) continue;
      const run = mine ? (L.running && L.moving) : (v.flags&2);
      movers.push({x:p.x, z:p.z, r: v.role==='ghost' ? 4.5 : run ? 6 : (v.flags&512)||(mine&&L.crouch) ? 1.6 : 3});
    }
  }
  for(const c of CROWS){
    c.t += dt;
    if(c.st==='perch'){
      c.head.rotation.y = Math.sin(c.t*.9+c.ph)>.6 ? .6 : Math.sin(c.t*.7+c.ph*3)>.7 ? -.5 : 0;   // twitchy head turns
      if(movers) for(const m of movers) if(Math.hypot(m.x-c.home.x, m.z-c.home.z)<m.r){
        // the whole perch goes up together
        let n = 0;
        for(const o of CROWS) if(o.st==='perch' && o.home.distanceTo(c.home)<3){ flush(o, m); n++; }
        if(K.gameTime-crowSfxAt>.6){ crowSfxAt = K.gameTime; const at = {x:c.home.x, y:c.home.y+.5, z:c.home.z}; K.sfx.flap(K.at(at)); K.sfx.caw(K.at(at)); }
        break;
      }
    } else if(c.st==='fly'){
      c.vel.y += dt*.6; c.g.position.addScaledVector(c.vel, dt);
      const fl = Math.sin(c.t*26)*.9;
      c.wings[0].rotation.y = fl; c.wings[1].rotation.y = -fl;
      if(c.t>4){ c.st = 'gone'; c.g.visible = false; c.t = 0; }
    } else if(c.t>40 && Math.hypot(L.pos.x-c.home.x, L.pos.z-c.home.z)>14){
      // drift back once nobody has been around for a while
      if(!movers || movers.every(m=>Math.hypot(m.x-c.home.x, m.z-c.home.z)>8)) resetCrow(c);
    }
  }
}
if(K.DEBUG) K._props = {DOLLS, CROWS, COFFIN, inView};
K.resetProps = function(){
  for(const c of CROWS) resetCrow(c);
  for(const d of DOLLS){ d.facing = d.armed = false; d.g.rotation.y = d.away; d.head.rotation.z = 0; }
};

/* ---------- per frame ---------- */
const dread = K.$('#dread'), grainEl = K.$('#grain');
K.fear = 0;
K.updateAmbience = function(dt){
  const t = K.gameTime;
  // swaying cloth
  for(const f of FLAGS){
    const p = f.geo.attributes.position, b = f.base;
    for(let i=0;i<p.count;i++){ const y=b[i*3+1]; const k=-y/3.6; p.array[i*3+2] = b[i*3+2] + Math.sin(t*1.6+f.ph+y*1.3)*.35*k*k + Math.sin(t*.4+f.ph)*.25*k; }
    p.needsUpdate = true; f.pivot.rotation.z = Math.sin(t*.7+f.ph)*.04;
  }
  for(const l of LANTERNS){ l.pivot.rotation.z = Math.sin(t*1.1+l.ph)*.12; l.pivot.rotation.x = Math.sin(t*.8+l.ph*2)*.08; }
  // mist drifts around me; banks that fall too far behind are moved back out ahead
  const nm = K.QUALITY==='low' ? 10 : K.QUALITY==='medium' ? 22 : 34;
  const cx = K.camera.position.x, cz = K.camera.position.z;
  MIST.forEach((m,i)=>{
    m.visible = i<nm; if(!m.visible) return;
    m.position.x += m.userData.vx*dt; m.position.z += m.userData.vz*dt;
    const dx = m.position.x-cx, dz = m.position.z-cz;
    if(dx*dx+dz*dz>17*17){ const a = Math.random()*Math.PI*2, r = mr(6,16); m.position.x = cx+Math.cos(a)*r; m.position.z = cz+Math.sin(a)*r; }
    m.material.rotation += dt*.02;
  });
  for(const w of WISPS){ const a = t*w.sp+w.ph; w.s.position.set(w.cx+Math.cos(a)*w.r, w.y+Math.sin(t*1.3+w.ph)*.25, w.cz+Math.sin(a*1.3)*w.r); w.s.material.opacity = .5+.5*Math.sin(t*3+w.ph); }
  // lightning
  LT.next -= dt;
  if(LT.next<=0){ LT.next = G.inGame ? mr(40,90) : mr(12,26); strike(); }
  if(LT.t>=0){ LT.t += dt; if(LT.t>.5) LT.t = -1; }
  const fl = flashLevel();
  K.amb.intensity = (K.ambBase||.55) + fl*1.6;
  K.moonLight.intensity = (K.moonBase||.3) + fl*1.4;
  if(fl){ tmpC.copy(K.scene.fog.color).lerp(FLASH_COL,.7); K.scene.background.copy(tmpC); }
  else K.scene.background.copy(K.scene.fog.color);
  // the flash thins the fog: for a blink you see the whole temple, and whatever is standing in it
  if(K.baseFogD) K.scene.fog.density = K.baseFogD * (fl ? .32 : 1);
  if(fl && !LT.shown){ LT.shown = true; flashFigure(); }
  if(LT.t<0) LT.shown = false;
  // dread: darker edges, heavier grain, a flickering torch when the ghost is close
  let fear = 0;
  const me = P[K.NET.me], g = K.ghostView();
  if(G.inGame && G.role==='surv' && me && (me.s==='alive'||me.s==='down') && g && G.ph==='play' && !(g.flags&8)){
    const d = g.pos.distanceTo(new V3(L.pos.x, g.pos.y, L.pos.z));
    fear = clamp(1-(d-3)/12, 0, 1);
  }
  K.fear += (fear-K.fear)*Math.min(1,dt*3);
  dread.style.opacity = (K.fear*.85*(.85+.15*Math.sin(t*7))).toFixed(3);
  grainEl.style.opacity = (.05 + K.fear*.13).toFixed(3);
  if(G.inGame) updateFigure(dt); else if(fig.g.visible) fig.g.visible = false;
  updateDolls(dt); updateCoffin(dt); updateCrows(dt);
};
})(window.K);
