/* render: renderer, quality levels (auto-picked by a short benchmark), textures, materials, shared lights */
(function(K){
'use strict';
const {$, mr} = K;

K.QUAL = {
  low:{scale:.26, grain:false, beams:false, lights:3, fog:1.08},
  medium:{scale:.46, grain:true, beams:true, lights:6, fog:1},
  high:{scale:.7, grain:true, beams:true, lights:8, fog:1, shadows:true}
};
let q = K.params.get('quality');
if(!K.QUAL[q]) q = K.store.get('quality', null);
K.QUALITY = K.QUAL[q] ? q : (K.IS_TOUCH ? 'low' : 'medium');
K.autoQuality = !K.QUAL[q];   // nothing saved yet: measure the device once on the menu screen
let qAuto = K.store.get('qAuto', true) && !K.QUAL[K.params.get('quality')];   // false once the player picks a level themselves

const canvas = K.canvas = $('#game');
const renderer = K.renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
renderer.setPixelRatio(1);
const scene = K.scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1119);
scene.fog = new THREE.FogExp2(0x0b1119, .06);
const camera = K.camera = new THREE.PerspectiveCamera(72, 1, .05, 70);
camera.rotation.order = 'YXZ';
scene.add(camera);
K.resize = function(){
  const s = K.QUAL[K.QUALITY].scale * (K.IS_TOUCH ? Math.min(1.6, window.devicePixelRatio||1)*.75 : 1);
  renderer.setSize(Math.max(1,innerWidth*s|0), Math.max(1,innerHeight*s|0), false);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
};
addEventListener('resize', K.resize); K.resize();

/* benchmark: watch frame times on the menu backdrop; drop to low if the device struggles, go high if it flies */
const bench = {t:0, n:0, sum:0, done:!K.autoQuality};
K.benchFrame = function(dt){
  if(bench.done) return;
  bench.t += dt; if(bench.t<1) return;   // skip warm-up (shader compile)
  bench.n++; bench.sum += dt;
  if(bench.t<3.5) return;
  bench.done = true;
  const fps = bench.n/bench.sum;
  let pick = K.QUALITY;
  if(fps<34) pick = 'low';
  else if(fps>57 && !K.IS_TOUCH && K.QUALITY==='medium') pick = 'high';
  if(pick!==K.QUALITY) K.setQuality(pick, true);
  K.store.set('quality', K.QUALITY);
  if(K.DEBUG) console.log('bench fps', fps.toFixed(1), '->', K.QUALITY);
};
K.setQuality = function(name, auto){
  if(!K.QUAL[name]) return;
  K.QUALITY = name; bench.done = true;
  if(!auto){ K.store.set('quality', name); qAuto = false; K.store.set('qAuto', false); }
  K.resize(); K.setLightPool(K.QUAL[name].lights); K.setShadows(!!K.QUAL[name].shadows);
  K.$$('.qbtns button').forEach(b=>b.setAttribute('aria-checked', b.dataset.q===name));
};

/* in game: if an auto-picked level keeps stuttering, step down one level (a real map with players costs more than the menu) */
const perf = {t:0, n:0, sum:0};
K.perfWatch = function(dt){
  if(!qAuto || K.QUALITY==='low') return;
  perf.n++; perf.sum += dt; perf.t += dt;
  if(perf.t<6) return;
  const fps = perf.n/perf.sum; perf.t = perf.n = perf.sum = 0;
  if(fps<26 && !document.hidden){
    K.setQuality(K.QUALITY==='high' ? 'medium' : 'low', true); K.store.set('quality', K.QUALITY);
    K.toast && K.toast('ลดคุณภาพภาพลงให้ลื่นขึ้น (เปลี่ยนได้ในหน้าหยุดเกม)', 3);
  }
};

/* ---------- textures (canvas, nearest filter) ---------- */
function canvasTex(w,h,draw){
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
K.canvasTex = canvasTex;
function speckle(g,w,h,n,cols,sz){ for(let i=0;i<n;i++){ g.fillStyle=cols[i%cols.length]; g.fillRect(Math.random()*w|0, Math.random()*h|0, sz||1, sz||1); } }
const TX = K.TX = {
  dirt: canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#29281b'; g.fillRect(0,0,w,h); speckle(g,w,h,520,['#1f1e14','#34331f','#2e3a1e','#3a3524','#232b17'],2); }),
  plaster: canvasTex(64,64,(g,w,h)=>{
    g.fillStyle='#8a8272'; g.fillRect(0,0,w,h); speckle(g,w,h,420,['#7e7666','#958d7c','#6f685a'],2);
    for(let k=0;k<3;k++){
      const px=Math.random()*46, py=Math.random()*46, pw=10+Math.random()*16, ph=8+Math.random()*12;
      for(let y=py;y<py+ph;y+=4) for(let x=px+((y/4|0)%2)*4;x<px+pw;x+=8){ g.fillStyle=`rgb(${110+Math.random()*30|0},${50+Math.random()*15|0},35)`; g.fillRect(x|0,y|0,7,3); }
    }
    for(let i=0;i<10;i++){ g.fillStyle='rgba(15,15,10,.32)'; g.fillRect(Math.random()*w|0,0,1+(Math.random()*2|0),10+Math.random()*34|0); }
  }),
  roof: canvasTex(64,64,(g,w,h)=>{
    g.fillStyle='#2a120c'; g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=8) for(let x=((y/8)%2)*4;x<w+8;x+=8){ const v=mr(-18,18); g.fillStyle=`rgb(${86+v|0},${40+v*.5|0},${26})`; g.fillRect(x-4,y,7,6); }
    speckle(g,w,h,60,['#1d2a14','#26331a'],2);
  }),
  wood: canvasTex(64,64,(g,w,h)=>{
    for(let i=0;i<4;i++){ const v=mr(-10,10); g.fillStyle=`rgb(${60+v|0},${42+v|0},${28+v|0})`; g.fillRect(i*16,0,16,h); g.fillStyle='#120c07'; g.fillRect(i*16,0,1,h); }
    speckle(g,w,h,120,['rgba(0,0,0,.25)']);
  }),
  white: canvasTex(64,64,(g,w,h)=>{
    g.fillStyle='#9a958a'; g.fillRect(0,0,w,h); speckle(g,w,h,380,['#8a857a','#a8a396','#77736a'],2);
    for(let i=0;i<14;i++){ g.fillStyle=`rgba(20,22,16,${mr(.2,.5)})`; g.fillRect(Math.random()*w|0,Math.random()*20|0,1+(Math.random()*2|0),12+Math.random()*40|0); }
  }),
  gold: canvasTex(32,32,(g,w,h)=>{ g.fillStyle='#6b5626'; g.fillRect(0,0,w,h); speckle(g,w,h,160,['#8a7034','#4a3a18','#2e2a1c'],2); }),
  bark: canvasTex(32,64,(g,w,h)=>{ g.fillStyle='#2a2018'; g.fillRect(0,0,w,h); for(let i=0;i<40;i++){ g.fillStyle=Math.random()<.5?'#1a130d':'#3a2c20'; g.fillRect(Math.random()*w|0,Math.random()*h|0,1,6+Math.random()*20|0); } }),
  leaf: canvasTex(32,32,(g,w,h)=>{ g.fillStyle='#16220f'; g.fillRect(0,0,w,h); speckle(g,w,h,260,['#1f2e14','#0f170a','#26381a'],2); }),
  cloth: canvasTex(32,32,(g,w,h)=>{ g.fillStyle='#bdb7a6'; g.fillRect(0,0,w,h); for(let x=0;x<w;x+=5){ g.fillStyle='rgba(60,55,45,.3)'; g.fillRect(x+(Math.random()*2|0),0,1,h); } }),
  hay: canvasTex(32,32,(g,w,h)=>{ g.fillStyle='#8a7440'; g.fillRect(0,0,w,h); for(let i=0;i<90;i++){ g.fillStyle=Math.random()<.5?'#6e5a2e':'#a38c52'; g.fillRect(Math.random()*w|0,Math.random()*h|0,4,1); } }),
  fur: canvasTex(32,32,(g,w,h)=>{ g.fillStyle='#2a2420'; g.fillRect(0,0,w,h); for(let i=0;i<160;i++){ g.fillStyle=Math.random()<.5?'#1a1512':'#3a302a'; g.fillRect(Math.random()*w|0,Math.random()*h|0,1,3+Math.random()*4|0); } })
};
/* box geometry with UVs scaled to world size, so one texture tile ≈ s metres on every face */
K.boxGeo = function(w,h,d,s){
  s = s||2;
  const g = new THREE.BoxGeometry(w,h,d), uv = g.attributes.uv;
  const dims = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++) for(let i=0;i<4;i++){ const k=f*4+i; uv.setXY(k, uv.getX(k)*dims[f][0]/s, uv.getY(k)*dims[f][1]/s); }
  return g;
};
const phong = K.phong = (map, o) => new THREE.MeshPhongMaterial(Object.assign({map, shininess:0, flatShading:true}, o||{}));
K.flat = (color, o) => new THREE.MeshPhongMaterial(Object.assign({color, flatShading:true, shininess:0}, o||{}));
K.MAT = {
  dirt: phong(TX.dirt), plaster: phong(TX.plaster), roof: phong(TX.roof), wood: phong(TX.wood),
  white: phong(TX.white), gold: phong(TX.gold), bark: phong(TX.bark), leaf: phong(TX.leaf), cloth: phong(TX.cloth), hay: phong(TX.hay), fur: phong(TX.fur),
  plasterDS: phong(TX.plaster,{side:THREE.DoubleSide}), woodDS: phong(TX.wood,{side:THREE.DoubleSide}),
  dark: new THREE.MeshBasicMaterial({color:0x020203}),
  water: new THREE.MeshPhongMaterial({color:0x0a141c, shininess:90, specular:0x33475a})
};
/* free GPU memory of an object that leaves the scene for good. Materials and textures used by many objects are listed in K.SHARED and kept. */
K.SHARED = new WeakSet(Object.values(K.MAT));
K.share = m => { K.SHARED.add(m); return m; };
K.disposeTree = function(o){
  if(!o) return;
  if(o.parent) o.parent.remove(o);
  o.traverse(n=>{
    if(n.geometry && !n.isSprite) n.geometry.dispose();
    for(const m of n.material ? [].concat(n.material) : []){
      if(m.map && m.map.__own) m.map.dispose();
      if(!K.SHARED.has(m)) m.dispose();
    }
  });
};
K.glowTex = function(r,g,b){
  const t = canvasTex(32,32,(c)=>{ const gr=c.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,`rgba(${r},${g},${b},.95)`); gr.addColorStop(.4,`rgba(${r},${g},${b},.35)`); gr.addColorStop(1,`rgba(${r},${g},${b},0)`); c.fillStyle=gr; c.fillRect(0,0,32,32); });
  t.magFilter = THREE.LinearFilter; return t;
};

/* ---------- lights ----------
   Point lights are expensive per pixel, so the world asks for light "sources" each frame
   and a small pool of real PointLights (3/6/8 by quality) is given to the nearest ones. */
/* the night's palette: a cold moonlit sky over warm-dark earth, and a blue-grey fog that things fade into
   (not black: distant buildings read as dark shapes against it). setVision() applies it for survivors. */
K.NIGHT = {sky:0x31415f, ground:0x17160f, amb:.62, fog:0x0b1119, fogD:.06, moon:0xa3b6d6, moonI:.62};
K.amb = new THREE.HemisphereLight(K.NIGHT.sky, K.NIGHT.ground, K.NIGHT.amb); scene.add(K.amb);
/* the moon: one clear direction (from the north-west, where the moon hangs in the sky) so walls have a lit and a dark side */
K.moonLight = new THREE.DirectionalLight(K.NIGHT.moon, K.NIGHT.moonI); K.moonLight.position.set(-26,26,-40); scene.add(K.moonLight); scene.add(K.moonLight.target);
/* moon shadows, on high only: one 1024² map covering ~32 m around the camera, re-centred as you move.
   Only the static temple casts (marked once the map is built); point lights and torches never cast. */
{
  const sh = K.moonLight.shadow; sh.mapSize.set(1024,1024); sh.bias = -.0015; sh.normalBias = .02;
  const c = sh.camera; c.left = c.bottom = -16; c.right = c.top = 16; c.near = 5; c.far = 95; c.updateProjectionMatrix();
}
const MOON_DIR = new THREE.Vector3(-26,26,-40).normalize();
K.setShadows = function(on){
  if(renderer.shadowMap.enabled===on) return;
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFShadowMap; K.moonLight.castShadow = on;
  scene.traverse(o=>{ for(const m of o.material ? [].concat(o.material) : []) m.needsUpdate = true; });   // shaders pick shadows up or drop them
};
K.markShadows = function(root){ root.traverse(o=>{ if(o.isMesh && !o.material.transparent){ o.castShadow = true; o.receiveShadow = true; } }); };
const pool = [];
K.setLightPool = function(n){
  while(pool.length<n){ const l=new THREE.PointLight(0xff9a40,0,7,1.6); scene.add(l); pool.push(l); }
  while(pool.length>n){ scene.remove(pool.pop()); }
};
K.setLightPool(K.QUAL[K.QUALITY].lights);
const sources = [];
K.lightSource = (x,y,z,color,intensity,dist) => { sources.push({x,y,z,color,intensity,dist:dist||7}); };
K.flushLights = function(){
  const c = camera.position;
  if(renderer.shadowMap.enabled){   // keep the shadow box on the player, snapped so edges don't crawl as you walk
    const sx = Math.round(c.x*2)/2, sz = Math.round(c.z*2)/2;
    K.moonLight.target.position.set(sx,0,sz); K.moonLight.position.set(sx+MOON_DIR.x*50, MOON_DIR.y*50, sz+MOON_DIR.z*50);
  }
  for(const s of sources) s.d = (s.x-c.x)**2+(s.z-c.z)**2 - s.intensity*4;
  sources.sort((a,b)=>a.d-b.d);
  for(let i=0;i<pool.length;i++){
    const l = pool[i], s = sources[i];
    if(s){ l.position.set(s.x,s.y,s.z); l.color.setHex(s.color); l.intensity=s.intensity; l.distance=s.dist; }
    else l.intensity = 0;
  }
  sources.length = 0;
};

/* flashlights: [0] = mine, [1..5] = other survivors (fixed count so shaders never recompile) */
const beamGeo = new THREE.ConeGeometry(2.4,9,12,1,true); beamGeo.translate(0,-4.5,0); beamGeo.rotateX(-Math.PI/2);
const beamMat = new THREE.MeshBasicMaterial({color:0xffe8c0,transparent:true,opacity:.045,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
K.SPOTS = [];
for(let i=0;i<6;i++){
  const s = new THREE.SpotLight(0xffe9c0,0,22,.42,.5,1.6);
  scene.add(s); scene.add(s.target);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible=false; scene.add(beam);
  K.SPOTS.push({light:s, beam, used:i===0});
}
K.handTorch = new THREE.Mesh(K.boxGeo(.05,.05,.2), new THREE.MeshPhongMaterial({color:0x222222}));
K.handTorch.position.set(.22,-.22,-.42); camera.add(K.handTorch); K.handTorch.visible=false;
/* what I'm carrying, shown low in the view */
K.handItem = new THREE.Group(); K.handItem.position.set(-.24,-.26,-.5); camera.add(K.handItem);

/* ---------- grain overlay ---------- */
const gcan = $('#grain'), gctx = gcan.getContext('2d'), gimg = gctx.createImageData(gcan.width, gcan.height);
let grainT = 0;
K.grain = function(dt){
  const on = K.QUAL[K.QUALITY].grain; gcan.hidden = !on; if(!on) return;
  grainT -= dt; if(grainT>0) return; grainT = 1/24;
  const d = gimg.data; for(let i=0;i<d.length;i+=4){ const v=Math.random()*255|0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
  gctx.putImageData(gimg,0,0);
};
})(window.K);
