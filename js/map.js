/* map: the abandoned temple. Static layout is seeded so every player builds the same world;
   which altars / offerings / charms are active is chosen by the host each round. */
(function(K){
'use strict';
const {MAT, boxGeo, mr, scene, V3} = K;
const rnd = K.mulberry32(20261008);
const R = (a,b) => a+rnd()*(b-a);

const world = K.world = new THREE.Group(); scene.add(world);
/* colliders: {x0,x1,z0,z1,h} boxes or {cx,cz,r,h} circles.
   h<1.3 = the krasue flies over it. ghost:true = blocks only ghosts (gate exterior, holy water).
   pret:true = blocks only the เปรต (building doorways). off:true = disabled. */
const colliders = K.colliders = [];
const occluders = K.occluders = [];   // meshes that block flashlight / voice line of sight
function addBox(x,z,w,d,h){ const c={x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,h}; colliders.push(c); return c; }
function block(mat,x,z,w,d,h,y,o){
  y = y||0; o = o||{};
  const m = new THREE.Mesh(boxGeo(w,h,d,o.uv), mat);
  m.position.set(x, y+h/2, z);
  (o.parent||world).add(m);
  if(o.col!==false) m.userData.col = addBox(x,z,w,d,o.colH||y+h);
  if(o.occ!==false && h>1.2) occluders.push(m);
  return m;
}
function cyl(mat,x,y,z,rt,rb,h,seg,parent){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||8),mat); m.position.set(x,y+h/2,z); (parent||world).add(m); return m; }
/* walls along x (at z) or along z (at x); gaps = [[from,to,lintelBottom,pretBlock]] */
function wallX(mat,z,x0,x1,h,t,gaps){
  let a = x0;
  for(const [g0,g1,top,pb] of (gaps||[])){
    if(g0>a) block(mat,(a+g0)/2,z,g0-a,t,h,0,{uv:3});
    if(top!=null && top<h) block(mat,(g0+g1)/2,z,g1-g0,t,h-top,top,{col:false,uv:3});
    if(pb) colliders.push({x0:g0,x1:g1,z0:z-t/2-.05,z1:z+t/2+.05,h:9,pret:true});
    a = g1;
  }
  if(x1>a) block(mat,(a+x1)/2,z,x1-a,t,h,0,{uv:3});
}
function wallZ(mat,x,z0,z1,h,t,gaps){
  let a = z0;
  for(const [g0,g1,top,pb] of (gaps||[])){
    if(g0>a) block(mat,x,(a+g0)/2,t,g0-a,h,0,{uv:3});
    if(top!=null && top<h) block(mat,x,(g0+g1)/2,t,g1-g0,h-top,top,{col:false,uv:3});
    if(pb) colliders.push({x0:x-t/2-.05,x1:x+t/2+.05,z0:g0,z1:g1,h:9,pret:true});
    a = g1;
  }
  if(z1>a) block(mat,x,(a+z1)/2,t,z1-a,h,0,{uv:3});
}
/* gable roof, ridge along z, with gold finials (ช่อฟ้า) at both ends */
function gable(mat,endMat,cx,cz,w,d,y,rise,over){
  over = over==null ? .5 : over;
  const a = Math.atan2(rise, w/2), L = (w/2+over)/Math.cos(a);
  for(const s of [-1,1]){
    const m = new THREE.Mesh(boxGeo(L,.12,d+over*2,2), mat);
    m.position.set(cx+s*Math.cos(a)*L/2, y+rise-Math.sin(a)*L/2, cz);
    m.rotation.z = -s*a; world.add(m);
  }
  const sh = new THREE.Shape(); sh.moveTo(-w/2,0); sh.lineTo(w/2,0); sh.lineTo(0,rise); sh.closePath();
  const tg = new THREE.ShapeGeometry(sh);
  for(const s of [-1,1]){
    const m = new THREE.Mesh(tg, endMat); m.position.set(cx,y,cz+s*d/2); world.add(m);
    const f = new THREE.Mesh(boxGeo(.09,.8,.09), MAT.gold);
    f.position.set(cx, y+rise+.3, cz+s*(d/2+over)); f.rotation.x = s*.55; world.add(f);
  }
}
function windowHole(x,z,ry,y,w,h){ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),MAT.dark); m.position.set(x,y,z); m.rotation.y=ry; world.add(m); }

/* ground + sky */
{
  const g = new THREE.PlaneGeometry(130,130); const uv = g.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*44, uv.getY(i)*44);
  const m = new THREE.Mesh(g, MAT.dirt); m.rotation.x = -Math.PI/2; world.add(m);
  K.ground = m;
}
const sky = K.sky = new THREE.Group(); scene.add(sky);
{
  const arr = [];
  for(let i=0;i<420;i++){
    const th = Math.random()*Math.PI*2, ph = Math.acos(mr(.08,1));
    arr.push(Math.cos(th)*Math.sin(ph)*55, Math.cos(ph)*55, Math.sin(th)*Math.sin(ph)*55);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
  K.stars = new THREE.Points(sg, new THREE.PointsMaterial({color:0x7d8aa0, size:1.5, sizeAttenuation:false, fog:false, transparent:true}));
  sky.add(K.stars);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.4,16), new THREE.MeshBasicMaterial({color:0xc9b9a0, fog:false}));
  moon.position.set(-26,26,-40); moon.lookAt(0,0,0); sky.add(moon);
}

/* outer wall + gate (south) */
wallX(MAT.plaster,-24,-24.25,24.25,2.6,.5);
wallX(MAT.plaster, 24,-24.25,24.25,2.6,.5,[[-2.4,2.4,null]]);
wallZ(MAT.plaster,-24,-24,24,2.6,.5);
wallZ(MAT.plaster, 24,-24,24,2.6,.5);
for(const s of [-1,1]){ block(MAT.white, s*2.7, 24, .7, .7, 3.4); block(MAT.roof, s*2.7, 24, 1, 1, .25, 3.4, {col:false}); }
K.gateCol = addBox(0,24,4.8,.4,3);
colliders.push({x0:-2.6,x1:2.6,z0:24.4,z1:24.9,h:9,ghost:true});
const GATE = K.GATE = {doors:[], open:false, a:0};
for(const s of [-1,1]){
  const pivot = new THREE.Group(); pivot.position.set(s*2.35,0,24); world.add(pivot);
  const d = new THREE.Mesh(boxGeo(2.3,2.5,.12), MAT.wood); d.position.set(-s*1.15,1.25,0); pivot.add(d);
  GATE.doors.push({pivot, s});
}
for(let z=22; z>-5; z-=1.3) block(MAT.white, mr(-.15,.15), z, 1.1, .9, .04, 0, {col:false, occ:false});

/* โบสถ์ร้าง (ordination hall) x -5..5, z -20..-6. Three doorways, none passable for the เปรต */
block(MAT.white,0,-13,11.4,15.4,.12,0,{col:false});
wallX(MAT.plaster,-6,-5,5,4.2,.35,[[-1.2,1.2,2.9,true]]);
wallX(MAT.plaster,-20,-5,5,4.2,.35,[[-.9,.9,2.5,true]]);
wallZ(MAT.plaster,-5,-20,-6,4.2,.35,[[-11.2,-10,2.4,true]]);
wallZ(MAT.plaster, 5,-20,-6,4.2,.35,[[-14,-12.6,2.6,true]]);
for(const z of [-17,-8]){ windowHole(-4.81,z,Math.PI/2,2.1,.9,1.3); windowHole(4.81,z,-Math.PI/2,2.1,.9,1.3); windowHole(-5.19,z,-Math.PI/2,2.1,.9,1.3); windowHole(5.19,z,Math.PI/2,2.1,.9,1.3); }
for(const [x,z] of [[-2.6,-9],[2.6,-9],[-2.6,-15],[2.6,-15]]){ cyl(MAT.white,x,0,z,.28,.3,4.2,8); colliders.push({cx:x,cz:z,r:.32,h:4.2}); }
gable(MAT.roof,MAT.plasterDS,0,-13,10.4,14,4.2,2.8,.6);
for(const s of [-1,1]){ const m=new THREE.Mesh(boxGeo(2,.12,15.2),MAT.roof); m.position.set(s*5.75,3.85,-13); m.rotation.z=-s*.6; world.add(m); }
block(MAT.white,0,-18.6,5,1.6,.9);
{ // the main image on the altar is shrouded in white cloth
  const c = cyl(MAT.cloth,0,.9,-18.7,.45,.85,1.5,8); c.scale.z=.7;
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.4,0),MAT.cloth); h.position.set(0,2.75,-18.75); world.add(h);
}
/* pews to weave between inside the hall */
for(const [x,z] of [[-2.8,-12],[2.8,-12],[-1.2,-16.2]]) block(MAT.wood,x,z,1.6,.5,.5,0,{occ:false});

/* ศาลาการเปรียญ (open pavilion) x -20..-10, z -4..6 — raised so the เปรต fits under it */
block(MAT.wood,-15,1,10,10,.1,0,{col:false});
for(const x of [-19.6,-16.5,-13.5,-10.4]) for(const z of [-3.6,1,5.6]){ cyl(MAT.wood,x,0,z,.16,.18,4.3,6); colliders.push({cx:x,cz:z,r:.22,h:4.3}); }
gable(MAT.roof,MAT.woodDS,-15,1,10,10,4.3,2.2,.6);
block(MAT.wood,-17.5,-1,2.4,.5,.45); block(MAT.wood,-12.5,3,2.4,.5,.45); block(MAT.wood,-17.5,3.5,.5,2.2,.45);
/* folding screen gives a corner to hide behind */
block(MAT.woodDS,-11.6,-1.2,.12,2.4,1.9,0,{uv:2});

/* กุฏิ (monk huts) — front and back doors make loops; the เปรต can't fit through */
K.HUTS = [];
function hut(cx,cz,back){
  const w=4, d=4, h=2.6, t=.2;
  wallX(MAT.wood,cz+d/2,cx-w/2,cx+w/2,h,t,[[cx-.55,cx+.55,2,true]]);
  wallX(MAT.wood,cz-d/2,cx-w/2,cx+w/2,h,t,back?[[cx-.55,cx+.55,2,true]]:null);
  wallZ(MAT.wood,cx-w/2,cz-d/2,cz+d/2,h,t);
  wallZ(MAT.wood,cx+w/2,cz-d/2,cz+d/2,h,t);
  gable(MAT.roof,MAT.woodDS,cx,cz,w+.2,d+.2,h,1.3,.45);
  block(MAT.wood,cx,cz,w-.1,d-.1,.06,0,{col:false});
  block(MAT.wood,cx+1.4,cz+(back?.6:-1.5),.8,.5,1.1);
  K.HUTS.push({cx,cz});
}
/* inside the hall or a hut (the เปรต can't stand up in there) */
K.indoors = (x,z) => (x>-5 && x<5 && z>-20 && z<-6) || K.HUTS.some(h=>Math.abs(x-h.cx)<2 && Math.abs(z-h.cz)<2);
hut(-18,-16,true); hut(-11,-19,false); hut(-20.5,9.2,true); hut(19.5,1,true);

/* เจดีย์ (stupa) */
function chedi(cx,cz,s,colH){
  const base = block(MAT.white,cx,cz,6*s,6*s,1.2*s,0,{col:false});
  occluders.push(base);
  block(MAT.white,cx,cz,4.6*s,4.6*s,.9*s,1.2*s,{col:false,occ:false});
  cyl(MAT.white,cx,2.1*s,cz,1.9*s,2.1*s,.5*s,10);
  cyl(MAT.white,cx,2.6*s,cz,1.15*s,1.9*s,2.6*s,10);
  block(MAT.white,cx,cz,1.6*s,1.6*s,.6*s,5.2*s,{col:false,occ:false});
  cyl(MAT.gold,cx,5.8*s,cz,.04*s,.6*s,4.2*s,8);
  addBox(cx,cz,6*s+.1,6*s+.1,colH||10*s);
}
chedi(14,-12,1);
for(const [x,z] of [[9,-17],[19,-17],[9,-7],[19,-7]]) chedi(x,z,.35);

/* หอระฆัง (bell tower) — raised for the เปรต too */
for(const [x,z] of [[4.9,-2.1],[7.1,-2.1],[4.9,.1],[7.1,.1]]){ cyl(MAT.wood,x,0,z,.12,.14,4.1,6); colliders.push({cx:x,cz:z,r:.18,h:4.1}); }
gable(MAT.roof,MAT.woodDS,6,-1,2.8,2.8,4.1,1.2,.35);
cyl(MAT.gold,6,3.1,-1,.28,.45,.8,10);

/* ศาลพระภูมิ: where the two offerings go */
const SHRINE = K.SHRINE = {x:11.5, z:-1.6, slots:[]};
{
  const {x,z} = SHRINE;
  block(MAT.white,x,z,1.6,1.2,.25,0,{col:false,occ:false});
  cyl(MAT.white,x,.25,z,.14,.18,1.25,8); colliders.push({cx:x,cz:z,r:.5,h:2.4});
  block(MAT.white,x,z,1.15,.9,.08,1.5,{col:false,occ:false});
  block(MAT.gold,x,z-.12,.8,.55,.6,1.58,{col:false,occ:false});
  const roof = new THREE.Mesh(new THREE.ConeGeometry(.72,.55,4), MAT.roof); roof.position.set(x,2.45,z-.12); roof.rotation.y=Math.PI/4; world.add(roof);
  const fin = new THREE.Mesh(boxGeo(.06,.35,.06), MAT.gold); fin.position.set(x,2.85,z-.12); world.add(fin);
  SHRINE.slots = [new V3(x-.32,1.62,z+.3), new V3(x+.32,1.62,z+.3)];
}

/* ป่าช้า (cemetery): rows of small ash chedis, an old crematorium chimney */
for(let z=8; z<=17; z+=3) for(let x=8; x<=20.5; x+=2.2){
  const px = x+R(-.3,.3), pz = z+R(-.3,.3);
  if(rnd()<.18 || Math.hypot(px-14,pz-12.5)<1.8) continue;
  chedi(px,pz,.13+R(0,.03),1.1);
}
block(MAT.plaster,19.5,19.5,1.4,1.4,6.5);
block(MAT.plaster,17.5,19.5,3,3,1.8);

/* ต้นโพธิ์ใหญ่ with coloured ribbons, a pond, broken walls */
function tree(x,z,big){
  const h = big?5:R(2.6,3.6);
  const tr = cyl(MAT.bark,x,0,z,big?.6:.16,big?.9:.24,h,6); occluders.push(tr);
  const n = big?8:3;
  for(let i=0;i<n;i++){
    const r = big?R(1.6,2.4):R(1,1.6);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r,0), MAT.leaf);
    m.position.set(x+R(-1,1)*(big?2.2:.7), h+R(-.4,.9)*(big?1.4:1), z+R(-1,1)*(big?2.2:.7));
    m.rotation.set(R(0,3),R(0,3),0); world.add(m);
  }
  colliders.push({cx:x,cz:z,r:big?1:.32,h:9});
}
tree(-6,12,true);
['#a3242a','#c9a227','#3f7d3a','#c25a8c'].forEach((c,i)=>{ const m=cyl(new THREE.MeshPhongMaterial({color:c,flatShading:true}),-6,1+i*.18,12,.93,.95,.12,8); m.rotation.y=i; });
{
  const p = new THREE.Mesh(new THREE.CircleGeometry(3,12), MAT.water); p.rotation.x=-Math.PI/2; p.position.set(-17,.03,15); world.add(p);
  for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; block(MAT.white,-17+Math.cos(a)*3.1,15+Math.sin(a)*3.1,.6,.6,.3,0,{col:false}); }
  colliders.push({cx:-17,cz:15,r:3,h:.4});
}
/* broken walls and cover: loops to run around and corners to break line of sight */
for(const [x,z,w,d,h] of [
  [-8,-2,3,.4,1.6],[9,3,.4,3,1.1],[-2,2,2.4,.4,1],[-14,12,3,.4,1.2],[-9,-12,.4,3,1.9],
  [4,9,3,.4,1.8],[-3.5,15.5,.4,3,1.7],[13,4.5,3,.4,1.7],[-12.5,-8.5,.4,2.6,1.8],[-22,-14,2.6,.4,1.7],[3.5,-22,3,.4,1.8]
]) block(MAT.plaster,x,z,w,d,h,0,{uv:3});
/* hay stacks */
for(const [x,z] of [[-22,4],[16,-21.5],[-8.5,19],[21.5,15.5]]){ const m=cyl(MAT.hay,x,0,z,.75,.95,1.5,7); occluders.push(m); colliders.push({cx:x,cz:z,r:.95,h:1.5}); }
/* small ruined shrine in the north-east corner */
block(MAT.white,20.5,-22.2,2.4,1.2,1.6); block(MAT.roof,20.5,-22.2,2.8,1.6,.2,1.6,{col:false});

/* ---------- spawn pools (the host picks from these every round) ---------- */
K.ALTAR_SPOTS = [[0,-16.4],[-15,1],[-18.6,-17.2],[14,-8.2],[14,12.5],[-6,9.4],[20.5,-20.5],[-21,20.5],[-11.9,-20.2],[-21.4,10.2],[18.6,.1],[-21.5,-3],[9,21.5]];
K.OFFER_SPOTS = [[-3.6,-17],[-17,-2.6],[-10.2,-17.8],[9.1,9.6],[3,7.4],[-11,15.5],[21.2,12.6],[-21.6,-21.4],[6,-22.4],[14.5,21.6],[-1.6,-1.2]];
K.CHARM_SPOTS = [[2,-11],[-13,4.6],[-17.4,-14.8],[10.8,-4.4],[-7.6,4],[2.6,3.4],[-21,12.9],[7.2,15.2],[17,6.4],[-2,20.4],[10,-21.4],[-22.2,-11.4],[22.2,-4],[-10,21.6],[19,-13.6],[-19.4,8.2],[20.2,1.8]];
K.BAT_SPOTS = [[-12.4,-17.6],[3.8,-7.2],[-18.6,4.6],[6,-1],[21.5,-11],[11,19.6],[-21,-8],[3,13]];

/* random trees and bushes, kept off buildings, paths and every spawn spot */
{
  const keep = [[-6.5,6.5,-21.5,-4],[-21,-9,-5,7],[-20.5,-15.5,-18.5,-13.5],[-13.5,-8.5,-21.5,-16.5],[-23,-18,6.5,12],[17,22.5,-1.5,3.5],
    [7,21,-19,-5],[6,21,5,21],[4,8,-3,1],[-4,4,14,24],[-2.5,2.5,-5,24],[-21,-13,11,19],[9.5,13.5,-3.5,.5]];
  const pts = K.ALTAR_SPOTS.concat(K.OFFER_SPOTS, K.CHARM_SPOTS, K.BAT_SPOTS);
  const free = (x,z,r) => {
    if(Math.abs(x)>22.5 || Math.abs(z)>22.5) return false;
    for(const k of keep) if(x>k[0]-r && x<k[1]+r && z>k[2]-r && z<k[3]+r) return false;
    for(const p of pts) if(Math.hypot(x-p[0],z-p[1])<2+r) return false;
    if(Math.hypot(x+6,z-12)<4) return false;
    for(const c of colliders) if(c.r!==undefined ? Math.hypot(x-c.cx,z-c.cz)<c.r+r+.6 : (x>c.x0-r-.6 && x<c.x1+r+.6 && z>c.z0-r-.6 && z<c.z1+r+.6)) return false;
    return true;
  };
  let n=0, tries=0;
  while(n<28 && tries++<900){ const x=R(-23,23), z=R(-23,23); if(free(x,z,1)){ tree(x,z,false); n++; } }
  n=0; tries=0;
  while(n<24 && tries++<900){
    const x=R(-23,23), z=R(-23,23);
    if(!free(x,z,.6)) continue;
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(R(.5,.8),0),MAT.leaf); m.position.set(x,.35,z); m.scale.y=.7; world.add(m);
    colliders.push({cx:x,cz:z,r:.55,h:.8}); n++;
  }
}

/* ---------- altars: one per spot, only this round's are shown ---------- */
const flameMat = new THREE.MeshBasicMaterial({color:0xffb050});
/* an unlit altar still shows a faint ember of old incense, so players can find it in the dark */
const emberMat = new THREE.SpriteMaterial({map:K.glowTex(255,150,70), transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false, fog:false});
const haloMat = new THREE.SpriteMaterial({map:K.glowTex(255,190,110), transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false, fog:false});
K.ALTARS = K.ALTAR_SPOTS.map(([x,z],i)=>{
  const g = new THREE.Group(); world.add(g);
  const table = block(MAT.wood,x,z,.8,.5,.7,0,{colH:.7, parent:g, occ:false});
  cyl(new THREE.MeshPhongMaterial({color:0xd9d2bf}),x-.15,.7,z,.035,.035,.22,6,g);
  cyl(MAT.gold,x+.18,.7,z,.08,.06,.1,6,g);
  const gar = new THREE.Mesh(new THREE.TorusGeometry(.12,.03,4,8), K.flat(0xd27a1c));
  gar.position.set(x+.05,.72,z+.12); gar.rotation.x=Math.PI/2; g.add(gar);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.035,.1,5), flameMat); flame.position.set(x-.15,.97,z); flame.visible=false; g.add(flame);
  const halo = new THREE.Sprite(haloMat); halo.scale.setScalar(.8); flame.add(halo);   // shows with the flame
  const ember = new THREE.Sprite(emberMat); ember.position.set(x+.18,.86,z); ember.scale.setScalar(.45); g.add(ember);
  g.visible = false; table.userData.col.off = true;
  return {x,z,i,g,col:table.userData.col,flame,ember};
});
K.setAltars = function(spots){
  for(const a of K.ALTARS){ const on = spots.includes(a.i); a.g.visible = on; a.col.off = !on; a.flame.visible = false; }
};

/* ---------- holy water lines: a row of ghost-only circle colliders ---------- */
K.addHoly = function(x,z,a){
  const out = [], px = Math.cos(a), pz = -Math.sin(a);   // perpendicular to facing (-sin a, -cos a)
  const n = 7;
  for(let i=0;i<n;i++){
    const t = (i/(n-1)-.5)*K.CFG.holyWidth;
    const c = {cx:x+px*t, cz:z+pz*t, r:.32, h:9, ghost:true, holy:true};
    colliders.push(c); out.push(c);
  }
  return out;
};
K.removeColliders = function(list){ for(const c of list){ const i=colliders.indexOf(c); if(i>=0) colliders.splice(i,1); } };

/* ---------- movement collision ---------- */
/* who: {ghost, fly, pret} */
K.collide = function(p, r, who){
  for(let it=0; it<2; it++) for(const c of colliders){
    if(c.off) continue;
    if(c.ghost && !who.ghost) continue;
    if(c.pret && !who.pret) continue;
    if(who.fly && c.h<1.3) continue;
    if(c.r!==undefined){
      const dx=p.x-c.cx, dz=p.z-c.cz, d=Math.hypot(dx,dz), m=c.r+r;
      if(d<m && d>1e-6){ p.x=c.cx+dx/d*m; p.z=c.cz+dz/d*m; }
    } else {
      const nx=K.clamp(p.x,c.x0,c.x1), nz=K.clamp(p.z,c.z0,c.z1), dx=p.x-nx, dz=p.z-nz, d2=dx*dx+dz*dz;
      if(d2>=r*r) continue;
      if(d2>1e-8){ const d=Math.sqrt(d2); p.x=nx+dx/d*r; p.z=nz+dz/d*r; }
      else { const l=p.x-c.x0, rr=c.x1-p.x, t=p.z-c.z0, b=c.z1-p.z, m=Math.min(l,rr,t,b);
        if(m===l) p.x=c.x0-r; else if(m===rr) p.x=c.x1+r; else if(m===t) p.z=c.z0-r; else p.z=c.z1+r; }
    }
  }
};
const ray = new THREE.Raycaster();
K.lineOfSight = function(ax,ay,az,bx,by,bz){
  const d = new V3(bx-ax,by-ay,bz-az), len = d.length();
  if(len<1e-4) return true;
  ray.set(new V3(ax,ay,az), d.normalize()); ray.far = len;
  return ray.intersectObjects(occluders,false).length===0;
};
/* where the camera ray meets the world (spirits point at things with it) */
K.lookPoint = function(origin, dir, far){
  ray.set(origin, dir); ray.far = far||25;
  const hit = ray.intersectObjects(occluders.concat([K.ground]), false)[0];
  return hit ? hit.point : origin.clone().addScaledVector(dir, far||25);
};
})(window.K);
