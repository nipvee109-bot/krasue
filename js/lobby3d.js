/* lobby3d: the waiting room as a scene — everyone in the room stands in a half circle before the temple gate,
   candles at their feet, fog behind. Its own small scene, drawn with the main renderer while the lobby card is open. */
(function(K){
'use strict';
const {flat, MAT, boxGeo, V3, mr, clamp} = K;
const G = K.G;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.FogExp2(0x05070c, .062);
const cam = new THREE.PerspectiveCamera(38, 1, .1, 60);
cam.position.set(0, 1.6, 8.4); cam.lookAt(0, 1.1, 0);
const amb = new THREE.AmbientLight(0x24304a, .75); scene.add(amb);
const moon = new THREE.DirectionalLight(0x8ea4c2, .8); moon.position.set(-4, 6, -8); scene.add(moon);       // rim light from behind
const key = new THREE.DirectionalLight(0xffc890, .55); key.position.set(2.5, 2, 7); scene.add(key);          // warm candle light on faces
const gateL = new THREE.PointLight(0x5a6c98, 1.1, 9, 1.4); gateL.position.set(0, 3, -2); scene.add(gateL);
const fire = new THREE.PointLight(0xff9040, 1.5, 7, 1.6); fire.position.set(0, .5, 1.6); scene.add(fire);
const fill = new THREE.PointLight(0x6a2018, .0, 6, 2); fill.position.set(0, 2.2, -2.2); scene.add(fill);   // the red glow behind the next ghost

/* ---------- set ---------- */
{
  const gt = MAT.dirt.map.clone(); gt.needsUpdate = true; gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(22, 22);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshPhongMaterial({map:gt, shininess:0})); ground.rotation.x = -Math.PI/2; scene.add(ground);
  // the temple gate: two white pillars, a lintel, a tiled roof, walls running off into the fog
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
  for(const s of [-1,1]){
    add(boxGeo(.55, 3.4, .55), MAT.white, s*1.6, 1.7, -4.2);
    add(boxGeo(7, 2.4, .35, 3), MAT.plaster, s*5.3, 1.2, -4.2);
  }
  add(boxGeo(3.9, .35, .7), MAT.white, 0, 3.45, -4.2);
  const roof = add(new THREE.ConeGeometry(2.7, 1.1, 4), MAT.roof, 0, 4.15, -4.2); roof.rotation.y = Math.PI/4; roof.scale.z = .35;
  add(new THREE.PlaneGeometry(2.7, 3.3), MAT.dark, 0, 1.65, -4.35);                           // nothing but black through the gate
  // trees either side
  for(const [x,z,s] of [[-6.2,-2.5,1.2],[6.8,-3.2,1],[-9,1,.9],[9.5,0,1.1]]){
    add(new THREE.CylinderGeometry(.18*s, .3*s, 3.4*s, 6), MAT.bark, x, 1.7*s, z);
    for(let i=0;i<4;i++){ const m = add(new THREE.IcosahedronGeometry(mr(1,1.6)*s, 0), MAT.leaf, x+mr(-1,1)*s, 3.4*s+mr(-.3,.8), z+mr(-1,1)*s); m.rotation.set(mr(0,3), mr(0,3), 0); }
  }
  // a shrouded statue by the gate, like the ones inside
  const sh = add(new THREE.CylinderGeometry(.2, .38, .95, 8), MAT.cloth, 2.7, .48, -3.5);
  add(new THREE.IcosahedronGeometry(.19, 1), MAT.cloth, 2.7, 1.08, -3.5);
  // moon
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:K.glowTex(200,190,170), transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
  halo.position.set(-9, 9, -22); halo.scale.setScalar(7); scene.add(halo);
}
/* candles on the ground in front of everyone */
const CANDLES = [];
{
  const wax = flat(0xd8d0bb), flameM = new THREE.MeshBasicMaterial({color:0xffb050});
  const glowM = new THREE.SpriteMaterial({map:K.glowTex(255,170,80), transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false});
  for(let i=0;i<7;i++){
    const a = (i/6-.5)*1.9, x = Math.sin(a)*1.9, z = 1.75-Math.cos(a)*.55, h = mr(.1,.22);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, h, 6), wax); c.position.set(x, h/2, z); scene.add(c);
    const f = new THREE.Mesh(new THREE.ConeGeometry(.022, .07, 5), flameM); f.position.set(x, h+.04, z); scene.add(f);
    const gl = new THREE.Sprite(glowM); gl.scale.setScalar(.45); f.add(gl);
    CANDLES.push({f, ph:mr(0,6), out:0});
  }
}
/* low mist */
const MIST = [];
{
  const tex = K.canvasTex(64,64,(g)=>{ const gr = g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,.8)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64); });
  for(let i=0;i<9;i++){
    const m = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, color:0x8a96aa, transparent:true, opacity:mr(.14,.24), depthWrite:false}));
    m.position.set(mr(-8,8), mr(.2,.5), mr(-5,1)); const s = mr(4,7); m.scale.set(s, s*.3, 1); scene.add(m);
    MIST.push({m, vx:mr(-.15,.15)});
  }
}
/* the thing in the gateway that is only there when the lightning shows it */
const gateFig = (function(){
  const g = new THREE.Group(); g.position.set(.2, 0, -4.6); g.visible = false; scene.add(g);
  const m = new THREE.MeshBasicMaterial({color:0xb8b4a8});
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.15, .32, 1.4, 7), m); b.position.y = .7; g.add(b);
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 1), m); h.position.y = 1.55; g.add(h);
  return g;
})();
/* a shadow that stands behind whoever is the ghost next round: only its eyes catch the light */
const shade = (function(){
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const m = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:.75, depthWrite:false});
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.22, .4, 1.9, 8), m); b.position.y = .95; g.add(b);
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), m); h.position.y = 2.05; g.add(h);
  const em = new THREE.MeshBasicMaterial({color:0xff2a1a, fog:false});
  for(const s of [-1,1]){ const e = new THREE.Mesh(new THREE.SphereGeometry(.028, 6, 4), em); e.position.set(s*.08, 2.07, .2); g.add(e); }
  return {g, m, em, k:0};
})();

/* ---------- people ---------- */
const PEOPLE = {};   // id -> {v, look, name, label, x, z, tx, tz, ...}
let lobbyRef = null;
function slots(n){
  const out = [];
  for(let i=0;i<n;i++){ const t = n===1 ? 0 : i/(n-1)-.5, a = t*Math.min(1.9, .5*n); out.push([Math.sin(a)*2.3, -Math.cos(a)*.9+.9-.15]); }
  return out;
}
function labelFor(p, m){
  const me = p.i===K.NET.me, host = p.i===m.host;
  const txt = p.n + (me ? ' (คุณ)' : '');
  return {txt, col: host ? '#e8c46a' : me ? '#f2ead8' : '#c9bfae'};
}
K.lobby3d = {
  sync(m){
    lobbyRef = m;
    const ids = m.p.map(p=>p.i), pos = slots(ids.length);
    for(const id of Object.keys(PEOPLE)) if(!ids.includes(id)){ const o = PEOPLE[id]; K.disposeTree(o.v.g); K.disposeTree(o.label); delete PEOPLE[id]; }
    m.p.forEach((p, i)=>{
      let o = PEOPLE[p.i];
      const lk = JSON.stringify(p.look||{});
      if(!o){
        // newcomers walk in out of the fog through the gate
        o = PEOPLE[p.i] = {x:mr(-.4,.4), z:-5, ph:mr(0,6), look:null, lt:'', walk:0, look2:0, lookT:mr(2,5)};
      }
      if(o.look!==lk){ if(o.v) K.disposeTree(o.v.g); o.v = K.personModel(p.look); scene.add(o.v.g); o.look = lk; }
      const L = labelFor(p, m), lt = L.txt+L.col;
      if(o.lt!==lt){ if(o.label) K.disposeTree(o.label); o.label = K.labelSprite(L.txt, L.col); o.label.scale.set(1.5,.38,1); scene.add(o.label); o.lt = lt; }
      o.tx = pos[i][0]; o.tz = pos[i][1];
      o.host = p.i===m.host;
    });
    shade.id = m.ghost && PEOPLE[m.ghost] ? m.ghost : null;
    shade.roam = m.mode==='disguise' && ids.length>1 && !m.bot;
    shade.gate = !!m.bot;   // the bot waits in the gateway   // nobody knows who: the shadow drifts from one to the next
  },
  active(){ return !G.inGame && !K.$('#lobbyCard').hidden; },
  clear(){ for(const id of Object.keys(PEOPLE)){ const o = PEOPLE[id]; K.disposeTree(o.v.g); K.disposeTree(o.label); delete PEOPLE[id]; } lobbyRef = null; },
  frame(dt){
    const t = K.gameTime;
    // keep the people clear of the side panel: shift the view so the circle sits in the open part of the screen
    const W = innerWidth, H = innerHeight, portrait = H>W;
    const panel = portrait ? 0 : Math.min(440, W*.48);
    cam.aspect = W/H;
    if(portrait){ cam.fov = 72; cam.setViewOffset(W, H, 0, H*.22, W, H); }
    else { cam.fov = 34; cam.setViewOffset(W, H, panel/2, 0, W, H); }
    cam.updateProjectionMatrix();
    cam.position.x = Math.sin(t*.13)*.3; cam.position.y = 1.6+Math.sin(t*.21)*.06; cam.lookAt(0, 1.1, 0);
    for(const id in PEOPLE){
      const o = PEOPLE[id], v = o.v;
      const dx = o.tx-o.x, dz = o.tz-o.z, d = Math.hypot(dx, dz);
      const moving = d>.03;
      if(moving){ const s = Math.min(d, dt*1.6); o.x += dx/d*s; o.z += dz/d*s; o.walk += dt*7; }
      v.g.position.set(o.x, 0, o.z);
      // face where they walk, then turn to the camera, now and then glancing at a neighbour or over a shoulder
      o.lookT -= dt;
      if(o.lookT<=0){ o.lookT = mr(2.5,6); o.look2 = Math.random()<.35 ? mr(-1.2,1.2) : Math.random()<.12 ? (Math.random()<.5?-2.4:2.4) : 0; }
      const face = moving ? Math.atan2(-dx, -dz) : Math.atan2(-(cam.position.x-o.x), -(cam.position.z-o.z)) + o.look2*.35;
      let da = face - v.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
      v.g.rotation.y += da*Math.min(1, dt*(moving?8:2.5));
      const sw = moving ? Math.sin(o.walk)*.5 : 0, br = Math.sin(t*1.7+o.ph);
      v.legs[0].rotation.x = sw; v.legs[1].rotation.x = -sw;
      v.arms[0].rotation.x = -sw*.8 + br*.03; v.arms[1].rotation.x = moving ? sw*.8 : -.35 + br*.03;   // torch held low, pointed at the ground
      v.g.position.y = moving ? Math.abs(Math.sin(o.walk))*.04 : br*.008;
      o.label.position.set(o.x, 2.3+Math.sin(t*1.2+o.ph)*.02, o.z);
    }
    // the shadow behind the next ghost leans in and out of the light
    if(shade.roam){
      shade.rt = (shade.rt||0) - dt;
      if(shade.rt<=0){ const ids = Object.keys(PEOPLE).filter(i=>i!==shade.id); shade.id = ids[Math.random()*ids.length|0]; shade.rt = mr(4,8); shade.k = 0; }
    }
    if(shade.gate){
      shade.g.visible = true; shade.k = Math.min(1, shade.k+dt*.4);
      const lean = .5+.5*Math.sin(t*.5);
      shade.g.position.set(0, 0, -3.9+lean*.3); shade.g.rotation.y = 0;
      shade.m.opacity = .7*shade.k; shade.em.color.setRGB((.6+.4*lean)*shade.k, .16*shade.k, .1*shade.k);
      fill.position.set(0, 2, -3); fill.intensity = (.5+.4*lean)*shade.k;
    } else if(shade.id && PEOPLE[shade.id]){
      const o = PEOPLE[shade.id];
      shade.g.visible = true; shade.k = Math.min(1, shade.k+dt*.5);
      const lean = .5+.5*Math.sin(t*.6);
      shade.g.position.set(o.x+.15, 0, o.z-.75+lean*.25);
      shade.g.rotation.y = Math.atan2(-(cam.position.x-o.x), -(cam.position.z-o.z))+Math.PI;
      shade.m.opacity = .55*shade.k; shade.em.color.setRGB(1*(.6+.4*lean)*shade.k, .16*shade.k, .1*shade.k);
      fill.position.set(o.x, 2, o.z-1); fill.intensity = (.5+.4*lean)*shade.k;
    } else { shade.g.visible = false; shade.k = 0; fill.intensity = 0; }
    // candles: flicker, and one gutters out for a moment now and then
    let lit = 0;
    for(const c of CANDLES){
      if(c.out>0){ c.out -= dt; c.f.visible = false; continue; }
      c.f.visible = true; lit++;
      c.f.scale.y = .8+.3*Math.sin(t*13+c.ph)+.15*Math.sin(t*31+c.ph*2);
      if(Math.random()<dt*.012) c.out = mr(1.5,4);
    }
    fire.intensity = 1.5*(.45+.55*lit/CANDLES.length) + Math.sin(t*11)*.08 + Math.sin(t*23)*.06;
    for(const s of MIST){ s.m.position.x += s.vx*dt; if(s.m.position.x>9) s.m.position.x = -9; if(s.m.position.x<-9) s.m.position.x = 9; }
    // lightning: same rhythm as the temple outside, and a figure in the gate for exactly one flash
    const fl = K.flashOn ? K.flashOn() : 0;
    amb.intensity = .75 + fl*1.6; moon.intensity = .8 + fl*1.5;
    scene.fog.density = fl ? .025 : .062;
    if(fl && !this.shown){ this.shown = true; gateFig.visible = Math.random()<.5; } else if(!fl){ this.shown = false; gateFig.visible = false; }
  },
  render(){ K.renderer.render(scene, cam); }
};
})(window.K);
