/* models: survivors (with outfits), the three ghosts, spirits, pick-up items, jumpscare faces */
(function(K){
'use strict';
const {boxGeo, flat, MAT, mr, V3} = K;

K.labelSprite = function(text,color){
  const c = document.createElement('canvas'); c.width=128; c.height=32;
  const g = c.getContext('2d'); g.font='600 18px Sarabun, Tahoma, sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillStyle='rgba(0,0,0,.55)'; g.fillText(text,65,17); g.fillStyle=color; g.fillText(text,64,16);
  const t = new THREE.CanvasTexture(c); t.minFilter=THREE.LinearFilter; t.__own = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:false}));
  s.scale.set(1.1,.28,1); return s;
};

/* ---------- survivors ---------- */
const HAIR_COL = 0x111111;
K.personModel = function(look){
  look = K.cleanLook(look);
  const g = new THREE.Group();
  const shirt = flat(new THREE.Color(look.c).getHex());
  const pants = flat(0x22242a), skin = flat(0xb48a68), hair = flat(HAIR_COL);
  const legs = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.11,.9,0); const m=new THREE.Mesh(boxGeo(.18,.9,.2),pants); m.position.y=-.45; p.add(m); g.add(p); return p; });
  const torso = new THREE.Mesh(boxGeo(.46,.62,.26),shirt); torso.position.y=1.21; g.add(torso);
  const head = new THREE.Mesh(boxGeo(.26,.28,.26),skin); head.position.y=1.67; g.add(head);
  const add = (geo,mat,x,y,z) => { const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); g.add(m); return m; };
  // hair (model faces -z)
  if(look.h===3) add(boxGeo(.27,.03,.27),hair,0,1.82,0);
  else add(boxGeo(.28,.1,.28),hair,0,1.83,0);
  if(look.h===1){ add(boxGeo(.28,.42,.07),hair,0,1.6,.14); }
  if(look.h===2){ add(boxGeo(.11,.11,.11),hair,0,1.94,.05); }
  // hats
  if(look.t===1){ const cap=flat(0x8a2a22); add(boxGeo(.3,.09,.3),cap,0,1.88,0); add(boxGeo(.24,.025,.16),cap,0,1.84,-.2); }
  else if(look.t===2){ add(boxGeo(.3,.15,.3),flat(0x2f4a6a),0,1.88,0); add(boxGeo(.08,.06,.08),flat(0xd8d0c0),0,1.98,0); }
  else if(look.t===3){ const m=add(new THREE.ConeGeometry(.36,.22,10),MAT.hay,0,1.97,0); m.rotation.y=.3; }
  const arms = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.31,1.48,0); const m=new THREE.Mesh(boxGeo(.13,.62,.15),shirt); m.position.y=-.31; p.add(m); g.add(p); return p; });
  const torch = new THREE.Mesh(boxGeo(.06,.2,.06), flat(0x2a2a2a)); torch.position.y=-.68; arms[1].add(torch);
  const carry = new THREE.Group(); carry.position.set(0,-.66,-.08); arms[0].add(carry);
  return {g, legs, arms, torch, carry};
};

/* ---------- ghosts ---------- */
K.faceTex = K.canvasTex(64,64,(g)=>{
  g.clearRect(0,0,64,64);
  const gr = g.createRadialGradient(32,40,4,32,32,30); gr.addColorStop(0,'#d8d4bc'); gr.addColorStop(.7,'#a7a88f'); gr.addColorStop(1,'#5a5c4c');
  g.fillStyle = gr; g.beginPath(); g.ellipse(32,31,26,30,0,0,7); g.fill();
  for(const [x,y] of [[21,27],[43,28]]){
    const s = g.createRadialGradient(x,y,2,x,y,10); s.addColorStop(0,'rgba(0,0,0,.95)'); s.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=s; g.beginPath(); g.ellipse(x,y,10,8,0,0,7); g.fill();
    g.fillStyle='#d6cfb8'; g.beginPath(); g.ellipse(x,y,5,3,0,0,7); g.fill();
    g.fillStyle='#c01c10'; g.fillRect(x-1,y-1,2,2);
  }
  g.fillStyle='#1a0505'; g.beginPath(); g.moveTo(20,46); g.quadraticCurveTo(32,53,44,46); g.quadraticCurveTo(32,49,20,46); g.fill();   // a thin grin
  g.fillStyle='#cfc6aa'; for(let x=23;x<42;x+=3) g.fillRect(x,47,2,2);
  g.fillStyle='#060606'; for(let i=0;i<12;i++){ const x=8+i*4.4; g.fillRect(x|0,0,3,10+Math.random()*14|0); }   // wet fringe
});
const auraTex = K.glowTex(140,255,190);
const redEye = K.share(new THREE.SpriteMaterial({map:K.glowTex(255,60,40), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
K.ghostEyeMat = redEye;
function eyes(parent, y, z, gap, size){
  for(const s of [-1,1]){ const e=new THREE.Sprite(redEye); e.scale.setScalar(size||.12); e.position.set(s*gap,y,z); parent.add(e); }
}
K.krasueModel = function(){
  const g = new THREE.Group();
  const skin = flat(0xa9a48c), hairM = flat(0x060606);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,1), skin); head.scale.set(1,1.18,1.05); g.add(head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.27,.32), new THREE.MeshBasicMaterial({map:K.faceTex,transparent:true,alphaTest:.5}));
  face.position.set(0,0,-.168); face.rotation.y=Math.PI; g.add(face);
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(.2,1), hairM); hair.scale.set(1.08,1.22,1); hair.position.set(0,.03,.05); g.add(hair);
  // long wet hair hanging down around the dangling organs
  for(let i=0;i<16;i++){ const l=mr(.5,1.15); const s=new THREE.Mesh(boxGeo(.035,l,.035),hairM); const a=mr(-2.1,2.1); s.position.set(Math.sin(a)*.18,-.05-l/2,Math.cos(a)*.15+.04); s.rotation.set(mr(-.08,.08),0,Math.sin(a)*.1); g.add(s); }
  const guts = new THREE.Group(); guts.position.y=-.2; g.add(guts);
  const organ = new THREE.MeshBasicMaterial({color:0x8a2626});
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(.065,0), new THREE.MeshBasicMaterial({color:0x5a0f12})); heart.position.y=-.08; guts.add(heart);
  for(const s of [-1,1]){ const l=new THREE.Mesh(new THREE.IcosahedronGeometry(.07,0),organ); l.scale.y=1.5; l.position.set(s*.07,-.16,0); guts.add(l); }
  const tubes = [];
  for(let k=0;k<3;k++){
    const pts=[]; for(let i=0;i<6;i++) pts.push(new V3(Math.sin(i*1.7+k)*.06, -.15-i*.15, Math.cos(i*1.3+k*2)*.05));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,.022,5), new THREE.MeshBasicMaterial({color:k===1?0x6e3b2a:0x8a3a2a}));
    guts.add(t); tubes.push(t);
  }
  /* the glow ignores fog: that is the krasue's weakness, you can see it from far away */
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({map:auraTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  aura.scale.set(1.5,1.9,1); aura.position.y=-.45; g.add(aura);
  eyes(g, .015, -.18, .055, .07);
  return {g, head, guts, tubes, aura, kind:'krasue', yOff:-.15};
};
/* the ผีปอบ's face: an old woman's hide, deep sockets, a mouth that splits too wide */
const popFaceTex = K.canvasTex(64,64,(g)=>{
  const gr = g.createRadialGradient(32,44,4,32,32,40); gr.addColorStop(0,'#7c6250'); gr.addColorStop(.6,'#5a4636'); gr.addColorStop(1,'#2a1f18');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  g.strokeStyle='rgba(20,12,8,.55)'; g.lineWidth=1;
  for(let i=0;i<40;i++){ const x=Math.random()*64, y=Math.random()*64, l=4+Math.random()*10; g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+l/2,y+(Math.random()-.5)*3,x+l,y+(Math.random()-.5)*2); g.stroke(); }
  for(const x of [17,47]){ const s=g.createRadialGradient(x,26,1,x,26,10); s.addColorStop(0,'rgba(0,0,0,1)'); s.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=s; g.beginPath(); g.ellipse(x,26,11,8,0,0,7); g.fill(); }
  g.strokeStyle='rgba(0,0,0,.8)'; g.lineWidth=2.5; g.beginPath(); g.moveTo(5,15); g.lineTo(27,21); g.moveTo(59,15); g.lineTo(37,21); g.stroke();   // scowl
  g.fillStyle='#1c120c'; g.fillRect(29,33,2,3); g.fillRect(34,33,2,3);
  g.fillStyle='#120404'; g.beginPath(); g.moveTo(6,42); g.quadraticCurveTo(32,62,58,42); g.quadraticCurveTo(32,48,6,42); g.fill();
  g.fillStyle='#d8cca6';
  for(let x=9;x<56;x+=4){ if(Math.random()<.15) continue; const e=42+3*(1-Math.pow((x-32)/26,2)); g.beginPath(); g.moveTo(x,e); g.lineTo(x+3,e); g.lineTo(x+1.5,e+3+Math.random()*4); g.fill(); }
});
K.popModel = function(){
  const g = new THREE.Group();
  const skin = flat(0x5a4a3c), fur = MAT.fur, dark = flat(0x1a1410), gum = flat(0x4a1414);
  /* hunched far forward: the head hangs in front of the chest, arms drag near the ground */
  const body = new THREE.Group(); body.position.y = 1.05; body.rotation.x = -.95; g.add(body);
  const torso = new THREE.Mesh(boxGeo(1.0,1.05,.7), fur); torso.position.y=.5; body.add(torso);
  const hump = new THREE.Mesh(new THREE.IcosahedronGeometry(.5,0), fur); hump.position.set(0,.85,.28); hump.scale.set(1.15,.85,1); body.add(hump);
  for(let i=0;i<6;i++){ const t=new THREE.Mesh(boxGeo(.08,mr(.3,.5),.08), fur); t.position.set(mr(-.4,.4),mr(.4,1.1),.38); t.rotation.x=-mr(.2,.8); body.add(t); }
  const head = new THREE.Group(); head.position.set(0,1.0,-.42); head.rotation.x = .75; body.add(head);
  const skull = new THREE.Mesh(boxGeo(.46,.42,.42), skin); head.add(skull);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.46,.42), new THREE.MeshPhongMaterial({map:popFaceTex, flatShading:true, shininess:0})); face.position.z=-.212; face.rotation.y=Math.PI; head.add(face);
  const jaw = new THREE.Mesh(boxGeo(.4,.12,.34), gum); jaw.position.set(0,-.28,-.06); jaw.rotation.x=.35; head.add(jaw);
  const hair = new THREE.Mesh(boxGeo(.56,.28,.56), fur); hair.position.set(0,.22,.05); head.add(hair);
  for(let i=0;i<7;i++){ const h=new THREE.Mesh(boxGeo(.05,mr(.3,.6),.05), fur); h.position.set(mr(-.25,.25),-.1,mr(-.05,.25)); head.add(h); }
  eyes(head, .04, -.22, .11, .16);
  const legs = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.28,1.05,.1); const m=new THREE.Mesh(boxGeo(.3,1.05,.34),dark); m.position.y=-.52; p.add(m); g.add(p); return p; });
  const arms = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.6,.95,-.15); p.rotation.x=.7; body.add(p); const m=new THREE.Mesh(boxGeo(.2,1.5,.22),skin); m.position.y=-.75; p.add(m);
    for(let i=0;i<3;i++){ const c=new THREE.Mesh(boxGeo(.045,.22,.045), dark); c.position.set(-.07+i*.07,-1.58,-.07); c.rotation.x=-.3; p.add(c); } return p; });
  return {g, head, body, legs, arms, kind:'pop', yOff:-2.05};
};
K.pretModel = function(){
  const g = new THREE.Group();
  /* a faint pallor of its own, so the tall shape reads against the dark */
  const skin = flat(0x9a9d9f,{emissive:0x14171a}), bone = flat(0xb4b6b0,{emissive:0x101214}), dark = flat(0x111214), rag = flat(0x2b2925,{side:THREE.DoubleSide});
  const legs = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.14,1.95,0); g.add(p);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,1.95,5),skin); m.position.y=-.98; p.add(m);
    const k=new THREE.Mesh(new THREE.IcosahedronGeometry(.08,0),bone); k.position.y=-.95; p.add(k); return p; });
  const pelvis = new THREE.Mesh(boxGeo(.34,.16,.16),skin); pelvis.position.y=2.0; g.add(pelvis);
  const belly = new THREE.Mesh(new THREE.IcosahedronGeometry(.2,1),skin); belly.position.set(0,2.2,-.04); belly.scale.set(1,.9,1.1); g.add(belly);
  const chest = new THREE.Mesh(boxGeo(.3,.6,.18),skin); chest.position.y=2.6; g.add(chest);
  for(let i=0;i<5;i++){ const r=new THREE.Mesh(boxGeo(.32,.025,.2),bone); r.position.y=2.4+i*.1; g.add(r); }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.75,5),skin); neck.position.y=3.25; neck.rotation.x=-.12; g.add(neck);
  const head = new THREE.Group(); head.position.set(0,3.68,-.06); g.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,1),skin); skull.scale.set(.9,1.25,1); head.add(skull);
  for(const s of [-1,1]){ const e=new THREE.Mesh(new THREE.IcosahedronGeometry(.045,0),dark); e.position.set(s*.065,.04,-.14); head.add(e); }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(.012,6),dark); mouth.position.set(0,-.12,-.155); mouth.rotation.y=Math.PI; head.add(mouth);
  for(let i=0;i<6;i++){ const h=new THREE.Mesh(boxGeo(.012,mr(.25,.5),.012),dark); h.position.set(mr(-.12,.12),.05,mr(.02,.12)); head.add(h); }
  // long lank hair down the back and over the shoulders
  for(let i=0;i<10;i++){ const a=mr(-2.2,2.2), l=mr(.7,1.4); const h=new THREE.Mesh(boxGeo(.018,l,.018),dark); h.position.set(Math.sin(a)*.14, .1-l/2, Math.cos(a)*.12+.03); h.rotation.z=mr(-.08,.08); head.add(h); }
  eyes(head, .04, -.17, .065, .085);
  // rags of an old robe hanging from the hips
  for(let i=0;i<7;i++){ const l=mr(.5,1.1); const r=new THREE.Mesh(new THREE.PlaneGeometry(mr(.07,.12),l),rag); const a=i/7*Math.PI*2; r.position.set(Math.sin(a)*.17, 2.02-l/2, Math.cos(a)*.11); r.rotation.y=a; r.rotation.z=mr(-.1,.1); g.add(r); }
  const arms = [-1,1].map(s=>{ const p=new THREE.Group(); p.position.set(s*.2,2.85,0); g.add(p);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.03,.04,1.7,5),skin); m.position.y=-.85; p.add(m);
    const hand=new THREE.Mesh(boxGeo(.07,.16,.03),skin); hand.position.y=-1.77; p.add(hand);
    for(let f=0;f<3;f++){ const fi=new THREE.Mesh(boxGeo(.012,.28,.012),bone); fi.position.set(-.025+f*.025,-2.0,0); fi.rotation.x=-.15; p.add(fi); }   // fingers far too long
    return p; });
  return {g, head, legs, arms, kind:'pret', yOff:-3.6};
};
K.ghostModel = k => k==='pop' ? K.popModel() : k==='pret' ? K.pretModel() : K.krasueModel();

/* spirits: only other spirits see them */
const spiritTex = K.glowTex(150,190,255);
K.spiritModel = function(color){
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:spiritTex, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false}));
  s.scale.set(.9,1.4,1); s.position.y = 1.2; g.add(s);
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1), new THREE.MeshBasicMaterial({color:new THREE.Color(color).lerp(new THREE.Color(0x9fc0ff),.6), transparent:true, opacity:.6}));
  h.position.y = 1.55; g.add(h);
  return {g, kind:'spirit'};
};

/* ---------- pick-ups ---------- */
const itemGlow = K.share(new THREE.SpriteMaterial({map:K.glowTex(255,210,140), transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false}));
K.offerMesh = function(kind){
  const g = new THREE.Group();
  if(kind==='garland'){
    const t = new THREE.Mesh(new THREE.TorusGeometry(.13,.035,5,10), flat(0xe0c040)); t.rotation.x=Math.PI/2; g.add(t);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(.13,.02,4,10), flat(0xf2eee0)); t2.rotation.x=Math.PI/2; t2.position.y=.03; g.add(t2);
    const tail = new THREE.Mesh(boxGeo(.03,.16,.03), flat(0xb03030)); tail.position.set(0,-.08,.13); g.add(tail);
  } else {
    for(let i=0;i<5;i++){ const s=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.32,4), flat(0x8a3a20)); s.position.set(-.04+i*.02,.14,0); s.rotation.z=(i-2)*.06; g.add(s); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.04,6), flat(0xd9c050)); band.position.y=.06; g.add(band);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.18,6), flat(0xe6dcc0)); candle.position.set(.08,.09,0); g.add(candle);
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({map:K.glowTex(255,80,40),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); tip.material.map.__own = true;
    tip.scale.setScalar(.06); tip.position.set(0,.31,0); g.add(tip);
  }
  return g;
};
K.charmMesh = function(kind){
  const g = new THREE.Group();
  if(kind==='takrut'){
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.16,8), MAT.gold); c.rotation.z=Math.PI/2; g.add(c);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(.07,.008,4,10), flat(0x8a1a1a)); loop.position.y=.06; g.add(loop);
  } else if(kind==='salt'){
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.11,0), flat(0xe8e4da)); b.scale.set(1,.8,1); g.add(b);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(.03,.04,.06,5), flat(0xb03030)); tie.position.y=.1; g.add(tie);
  } else {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.13,.08,.08,10), flat(0xb8bcc4, {shininess:60})); g.add(bowl);
    const water = new THREE.Mesh(new THREE.CircleGeometry(.12,10), new THREE.MeshBasicMaterial({color:0x6ab0ff})); water.rotation.x=-Math.PI/2; water.position.y=.041; g.add(water);
    const leaf = new THREE.Mesh(boxGeo(.03,.14,.06), flat(0x3a6a2a)); leaf.position.set(.03,.08,0); leaf.rotation.z=.4; g.add(leaf);
  }
  return g;
};
K.batteryMesh = function(){
  return new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.18,6), new THREE.MeshPhongMaterial({color:0xc8a12a,emissive:0x2a1e04,flatShading:true}));
};
/* ground item = mesh + faint glow so it can be found in the dark */
K.groundItem = function(mesh){
  const g = new THREE.Group(); g.add(mesh); mesh.position.y = .18;
  const gl = new THREE.Sprite(itemGlow); gl.scale.setScalar(.7); gl.position.y = .12; g.add(gl);
  return g;
};

/* ---------- jumpscare faces (2D canvas, no gore) ---------- */
K.drawFace = function(kind, c){
  const g = c.getContext('2d'), W = c.width, H = c.height, cx = W/2, cy = H/2, rnd = Math.random;
  g.clearRect(0,0,W,H);
  g.save();
  const oval = (x,y,rx,ry,rot)=>{ g.beginPath(); g.ellipse(x,y,rx,ry,rot||0,0,Math.PI*2); };
  /* skin lit from below, like a torch held low */
  function face(rx, ry, top, mid, edge){
    const gr = g.createRadialGradient(cx, cy+ry*.55, ry*.1, cx, cy, ry*1.05);
    gr.addColorStop(0, top); gr.addColorStop(.55, mid); gr.addColorStop(1, edge);
    g.fillStyle = gr; oval(cx, cy, rx, ry); g.fill();
    g.save(); oval(cx, cy, rx, ry); g.clip();
    for(let n=0;n<1400;n++){ const x=cx+(rnd()-.5)*rx*2, y=cy+(rnd()-.5)*ry*2; g.fillStyle = rnd()<.6 ? 'rgba(0,0,0,.18)' : 'rgba(255,240,220,.07)'; g.fillRect(x|0, y|0, 1+(rnd()*2|0), 1+(rnd()*2|0)); }
    g.restore();
  }
  function wrinkles(n, x0, y0, w, h, a){
    g.strokeStyle = `rgba(10,6,4,${a||.35})`; g.lineWidth = 1;
    for(let k=0;k<n;k++){ const x=x0+rnd()*w, y=y0+rnd()*h, l=6+rnd()*18; g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+l*.5, y+(rnd()-.5)*5, x+l, y+(rnd()-.5)*3); g.stroke(); }
  }
  /* sunken socket + eye. pupil: tiny, off-centre, staring */
  function eye(x, y, r, iris, glow, white){
    const s = g.createRadialGradient(x, y, r*.3, x, y, r*2.1); s.addColorStop(0,'rgba(0,0,0,.95)'); s.addColorStop(.6,'rgba(0,0,0,.6)'); s.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle = s; oval(x, y, r*2.1, r*1.7); g.fill();
    if(white){ g.fillStyle = white; oval(x, y, r, r*.62); g.fill(); }
    if(glow){ g.shadowColor = glow; g.shadowBlur = r*2.2; }
    g.fillStyle = iris; oval(x+(rnd()-.5)*r*.3, y, r*(white?.22:.38), r*(white?.22:.3)); g.fill();
    g.shadowBlur = 0;
  }
  function mouth(y, w, h, teeth, toothCol){
    g.fillStyle = '#0a0202'; g.beginPath(); g.moveTo(cx-w, y); g.quadraticCurveTo(cx, y+h*2.1, cx+w, y); g.quadraticCurveTo(cx, y+h*.5, cx-w, y); g.fill();
    g.fillStyle = toothCol;
    for(let k=0;k<teeth;k++){
      if(rnd()<.18) continue;   // gaps
      const u = (k+.5)/teeth, x = cx-w*.92+u*w*1.84, tw = w*1.7/teeth*(.55+rnd()*.4), edge = y+h*.5*(1-Math.pow(2*u-1,2))*.9;
      const tl = h*(.45+rnd()*.5)*(1-Math.abs(2*u-1)*.45);
      g.beginPath(); g.moveTo(x-tw/2, edge); g.lineTo(x+tw/2, edge); g.lineTo(x+tw*(rnd()-.5)*.4, edge+tl); g.fill();
      const lo = y+h*(1.1+.7*(1-Math.pow(2*u-1,2)));
      if(rnd()<.7){ g.beginPath(); g.moveTo(x-tw/2, lo); g.lineTo(x+tw/2, lo); g.lineTo(x+tw*(rnd()-.5)*.4, lo-tl*.7); g.fill(); }
    }
  }
  function hair(n, len, spread, col, cover){
    g.strokeStyle = col;
    for(let k=0;k<n;k++){
      const side = rnd()<.5?-1:1, sx = cx+side*rnd()*W*spread*.5, sy = cy-H*.42+rnd()*H*.06;
      const ex = cx+side*W*(cover ? .08+rnd()*.42 : .3+rnd()*.25), ey = sy+len*(.6+rnd()*.5);
      g.lineWidth = 1+rnd()*2.5; g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx+side*W*.15, sy+len*.3, ex-side*W*.06, ey-len*.3, ex, ey); g.stroke();
    }
  }
  if(kind==='krasue'){
    // only a woman's head: pale, wet black hair, no body, a green glow beneath
    const gl = g.createRadialGradient(cx, H*.9, 4, cx, H*.9, W*.45); gl.addColorStop(0,'rgba(120,255,170,.55)'); gl.addColorStop(1,'rgba(120,255,170,0)'); g.fillStyle=gl; g.fillRect(0,0,W,H);
    hair(60, H*.75, .9, '#050505', false);
    face(W*.25, H*.33, '#e6e2c8', '#a9ad92', '#3a3d32');
    hair(26, H*.55, .55, 'rgba(5,5,5,.92)', true);
    wrinkles(10, cx-W*.18, cy+H*.05, W*.36, H*.15, .2);
    eye(cx-W*.1, cy-H*.05, W*.05, '#120000', null, '#cdbfa6');
    eye(cx+W*.1, cy-H*.035, W*.05, '#120000', null, '#cdbfa6');
    g.strokeStyle='rgba(120,20,20,.55)'; g.lineWidth=1;   // bloodshot rims
    for(const ex of [-.1,.1]) for(let k=0;k<5;k++){ const a=rnd()*6.28; g.beginPath(); g.moveTo(cx+W*ex+Math.cos(a)*W*.05, cy-H*.045+Math.sin(a)*W*.03); g.lineTo(cx+W*ex+Math.cos(a)*W*.03, cy-H*.045+Math.sin(a)*W*.018); g.stroke(); }
    mouth(cy+H*.16, W*.1, H*.035, 9, '#cfc5aa');
    g.strokeStyle = 'rgba(40,10,10,.8)'; g.lineWidth = 1.5;
    for(let k=0;k<7;k++){ const x=cx+(rnd()-.5)*W*.2; g.beginPath(); g.moveTo(x, cy+H*.32); g.bezierCurveTo(x+(rnd()-.5)*30, cy+H*.4, x+(rnd()-.5)*30, cy+H*.45, x+(rnd()-.5)*20, H*(.9+rnd()*.1)); g.stroke(); }
  } else if(kind==='pop'){
    // a hag possessed: hide-dark skin, matted fur, ember eyes, a mouth too wide
    hair(110, H*.5, 1.1, '#120d0a', false);
    face(W*.34, H*.37, '#7a5f48', '#4c3a2c', '#140e0a');
    wrinkles(70, cx-W*.3, cy-H*.32, W*.6, H*.64, .45);
    g.strokeStyle='rgba(0,0,0,.6)'; g.lineWidth=3; g.beginPath(); g.moveTo(cx-W*.22, cy-H*.17); g.lineTo(cx-W*.04, cy-H*.11); g.moveTo(cx+W*.22, cy-H*.17); g.lineTo(cx+W*.04, cy-H*.11); g.stroke();   // brow scowl
    eye(cx-W*.13, cy-H*.06, W*.06, '#ff3a14', '#ff2a10');
    eye(cx+W*.13, cy-H*.07, W*.06, '#ff3a14', '#ff2a10');
    g.fillStyle='#1a100c'; oval(cx-W*.03, cy+H*.06, W*.02, H*.012); oval(cx+W*.03, cy+H*.06, W*.02, H*.012); g.fill();
    mouth(cy+H*.12, W*.26, H*.11, 13, '#d4c69e');
    hair(30, H*.35, .7, 'rgba(18,13,10,.85)', true);
  } else {
    // pret: a head stretched long, holes for eyes, a mouth the size of a needle's eye
    g.save(); g.translate(cx, cy); g.scale(.62, 1.05); g.translate(-cx, -cy);
    face(W*.36, H*.46, '#9a9c9a', '#5d6062', '#1a1c1e');
    g.restore();
    for(const sd of [-1,1]){ const hc = g.createRadialGradient(cx+sd*W*.13, cy+H*.1, 2, cx+sd*W*.13, cy+H*.1, W*.12); hc.addColorStop(0,'rgba(0,0,0,.7)'); hc.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=hc; oval(cx+sd*W*.13, cy+H*.1, W*.1, H*.18); g.fill(); }   // hollow cheeks
    wrinkles(40, cx-W*.17, cy-H*.4, W*.34, H*.8, .3);
    eye(cx-W*.085, cy-H*.12, W*.08, '#ffd9b0', '#ff8a50');
    eye(cx+W*.085, cy-H*.1, W*.08, '#ffd9b0', '#ff8a50');
    g.fillStyle='#000'; oval(cx, cy+H*.28, W*.007, H*.006); g.fill();
    g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=1; g.beginPath(); g.moveTo(cx-W*.05, cy+H*.28); g.quadraticCurveTo(cx, cy+H*.3, cx+W*.05, cy+H*.28); g.stroke();
    g.strokeStyle='#0c0c0c'; for(let k=0;k<16;k++){ const x=cx+(rnd()-.5)*W*.32; g.lineWidth=1+rnd(); g.beginPath(); g.moveTo(x, cy-H*.48); g.quadraticCurveTo(x+(rnd()-.5)*20, cy-H*.3, x+(rnd()-.5)*40, cy-H*(.05+rnd()*.25)); g.stroke(); }
  }
  // film burn: vignette + scratches
  const v = g.createRadialGradient(cx, cy, W*.25, cx, cy, W*.72); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.9)');
  g.fillStyle = v; g.fillRect(0,0,W,H);
  g.fillStyle = 'rgba(255,255,255,.08)'; for(let k=0;k<6;k++) g.fillRect(rnd()*W|0, 0, 1, H);
  g.restore();
};

/* ---------- outfit preview (its own tiny renderer, only drawn while the card is open) ---------- */
K.preview = (function(){
  let r=null, sc, cam, cur=null, spin=0;
  function init(){
    const cv = K.$('#lookCanvas'); if(!cv) return false;
    r = new THREE.WebGLRenderer({canvas:cv, antialias:true, alpha:true}); r.setPixelRatio(1); r.setSize(cv.width, cv.height, false);
    sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0x8890a8,.8));
    const d = new THREE.DirectionalLight(0xffe0b0,.9); d.position.set(1,2,-2); sc.add(d);
    cam = new THREE.PerspectiveCamera(32, cv.width/cv.height, .1, 20); cam.position.set(0,1.25,-3.4); cam.lookAt(0,1.05,0);
    return true;
  }
  return {
    set(look){ if(!r && !init()) return; if(cur) K.disposeTree(cur.g); cur = K.personModel(look); cur.g.rotation.y = spin; sc.add(cur.g); },
    frame(dt){ if(!r || !cur) return; spin += dt*.8; cur.g.rotation.y = spin; r.render(sc,cam); }
  };
})();
})(window.K);
