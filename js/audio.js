/* audio: everything synthesized with Web Audio, positional via HRTF panners */
(function(K){
'use strict';
const {mr} = K;
const VOL = K.VOL = Object.assign({master:.9, amb:.7, voice:1}, K.store.get('vol', {}));
const A = K.A = {ctx:null};
K.audioInit = function(){
  if(A.ctx){ if(A.ctx.state==='suspended') A.ctx.resume(); return; }
  const C = window.AudioContext||window.webkitAudioContext; if(!C) return;
  const ctx = A.ctx = new C();
  A.main = ctx.createGain(); A.main.connect(ctx.destination);
  A.fx = ctx.createGain(); A.fx.connect(A.main);
  A.amb = ctx.createGain(); A.amb.connect(A.main);
  A.voice = ctx.createGain(); A.voice.connect(ctx.destination);
  K.applyVolume();
  const len = ctx.sampleRate*2, buf = ctx.createBuffer(1,len,ctx.sampleRate), d = buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  A.noise = buf;
  // wind
  const w = ctx.createBufferSource(); w.buffer=buf; w.loop=true;
  const wf = ctx.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=380;
  const wg = ctx.createGain(); wg.gain.value=.06;
  const lfo = ctx.createOscillator(); lfo.frequency.value=.07; const lg=ctx.createGain(); lg.gain.value=.04; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
  w.connect(wf); wf.connect(wg); wg.connect(A.amb); w.start();
  // ghost presence sound (positional, gain driven per frame). One voice per ghost kind.
  A.humPan = spatial(0,0,0,A.fx); A.humGain = ctx.createGain(); A.humGain.gain.value=0; A.humGain.connect(A.humPan);
  A.hum = {};
  { // krasue: two detuned sines + hiss
    const g = ctx.createGain(); g.gain.value=0; g.connect(A.humGain); A.hum.krasue = g;
    for(const f of [92,95.5]){ const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f; o.connect(g); o.start(); }
    const hn = ctx.createBufferSource(); hn.buffer=buf; hn.loop=true; const hf=ctx.createBiquadFilter(); hf.type='bandpass'; hf.frequency.value=1800; hf.Q.value=4; const hg=ctx.createGain(); hg.gain.value=.25; hn.connect(hf); hf.connect(hg); hg.connect(g); hn.start();
  }
  { // pop: low breathing growl
    const g = ctx.createGain(); g.gain.value=0; g.connect(A.humGain); A.hum.pop = g;
    const hn = ctx.createBufferSource(); hn.buffer=buf; hn.loop=true; const hf=ctx.createBiquadFilter(); hf.type='lowpass'; hf.frequency.value=260; hf.Q.value=6;
    const br = ctx.createGain(); br.gain.value=.4; const bl = ctx.createOscillator(); bl.frequency.value=.45; const bd=ctx.createGain(); bd.gain.value=.4; bl.connect(bd); bd.connect(br.gain); bl.start();
    hn.connect(hf); hf.connect(br); br.connect(g); hn.start();
    const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=48; const og=ctx.createGain(); og.gain.value=.05; o.connect(og); og.connect(br); o.start();
  }
  { // pret: thin wavering moan
    const g = ctx.createGain(); g.gain.value=0; g.connect(A.humGain); A.hum.pret = g;
    const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value=310;
    const v = ctx.createOscillator(); v.frequency.value=.3; const vd = ctx.createGain(); vd.gain.value=40; v.connect(vd); vd.connect(o.frequency); v.start();
    const og = ctx.createGain(); og.gain.value=.12; o.connect(og); og.connect(g); o.start();
  }
  initMusic(ctx, buf);
};

/* ---------- chase music: layers fade in as the ghost closes in ----------
   drone (anything near) -> dissonant tremolo strings (close) -> drums (being chased) */
const M = K.MUS = {k:0, chase:false, beat:0, stingAt:-99};
function initMusic(ctx, buf){
  M.bus = ctx.createGain(); M.bus.gain.value = .9; M.bus.connect(A.amb);
  // drone: two detuned saws through a slow-opening lowpass
  M.drone = ctx.createGain(); M.drone.gain.value = 0; M.drone.connect(M.bus);
  M.droneF = ctx.createBiquadFilter(); M.droneF.type='lowpass'; M.droneF.frequency.value=140; M.droneF.Q.value=3; M.droneF.connect(M.drone);
  for(const f of [55, 55.7, 82.4]){ const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f; const g=ctx.createGain(); g.gain.value=.09; o.connect(g); g.connect(M.droneF); o.start(); }
  // strings: a minor second rubbing against itself, trembling
  M.str = ctx.createGain(); M.str.gain.value = 0; M.str.connect(M.bus);
  const trem = ctx.createGain(); trem.gain.value = .5; trem.connect(M.str);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 7.5; const lg = ctx.createGain(); lg.gain.value = .5; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
  const sf = ctx.createBiquadFilter(); sf.type='bandpass'; sf.frequency.value=900; sf.Q.value=.8; sf.connect(trem);
  for(const f of [466.2, 493.9, 233.1]){ const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f; const v=ctx.createOscillator(); v.frequency.value=mr(4,6); const vd=ctx.createGain(); vd.gain.value=f*.006; v.connect(vd); vd.connect(o.frequency); v.start(); const g=ctx.createGain(); g.gain.value=.035; o.connect(g); g.connect(sf); o.start(); }
  // drums are scheduled hits (see K.musicUpdate)
  M.drum = ctx.createGain(); M.drum.gain.value = 0; M.drum.connect(M.bus);
}
function drumHit(t, accent){
  const c = A.ctx;
  const o = c.createOscillator(), g = c.createGain(); o.type='sine';
  o.frequency.setValueAtTime(accent?95:80, t); o.frequency.exponentialRampToValueAtTime(38, t+.35);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent?.9:.6, t+.008); g.gain.exponentialRampToValueAtTime(.001, t+.45);
  o.connect(g); g.connect(M.drum); o.start(t); o.stop(t+.5);
  const s = c.createBufferSource(); s.buffer = A.noise; const f = c.createBiquadFilter(); f.type='lowpass'; f.frequency.value = accent?900:500;
  const ng = c.createGain(); ng.gain.setValueAtTime(accent?.35:.2, t); ng.gain.exponentialRampToValueAtTime(.001, t+.12);
  s.connect(f); f.connect(ng); ng.connect(M.drum); s.start(t, Math.random()); s.stop(t+.15);
}
K.musicStop = function(){ if(!M.bus) return; M.k = 0; M.chase = false; for(const g of [M.drone, M.str, M.drum]) g.gain.value = 0; };
/* k: 0..1 how close the danger is; chase: someone is right on top of you */
K.musicUpdate = function(dt, k, chase){
  if(!A.ctx || !M.bus) return;
  const now = A.ctx.currentTime;
  M.k += (k-M.k)*Math.min(1, dt*(k>M.k?2.5:.8));        // swells fast, lingers on the way out
  const kk = M.k;
  M.drone.gain.setTargetAtTime(Math.min(1, kk*1.6)*.55, now, .1);
  M.droneF.frequency.setTargetAtTime(140+kk*520, now, .2);
  M.str.gain.setTargetAtTime(Math.max(0, kk-.35)/.65*.5, now, .1);
  const drumOn = chase || kk>.72;
  M.drum.gain.setTargetAtTime(drumOn ? .55 : 0, now, drumOn ? .05 : .6);
  if(drumOn && !M.chase && now-M.stingAt>12){ M.stingAt = now; K.sfx.sting(); }
  M.chase = drumOn;
  // keep a few beats scheduled ahead; tempo rises with danger
  if(kk>.5){
    const step = 60/(118+kk*40)/2;
    if(M.beat < now) M.beat = now+.05;
    while(M.beat < now+.2){ const n = M.bi = ((M.bi||0)+1)%8; if(n===0||n===3||n===6||(kk>.85&&n===7)) drumHit(M.beat, n===0); M.beat += step; }
  }
};
/* phones suspend (iOS: "interrupt") the audio context after a call, a lock screen or an app switch; wake it on the next touch */
for(const ev of ['pointerdown','keydown']) addEventListener(ev, ()=>{ if(A.ctx && A.ctx.state!=='running') A.ctx.resume().catch(()=>{}); }, {capture:true, passive:true});
K.applyVolume = function(){ if(!A.ctx) return; A.fx.gain.value=VOL.master; A.amb.gain.value=VOL.master*VOL.amb; A.voice.gain.value=VOL.voice; };
function spatial(x,y,z,to){
  const p = A.ctx.createPanner(); p.panningModel='HRTF'; p.distanceModel='inverse'; p.refDistance=1.5; p.maxDistance=50; p.rolloffFactor=1.3;
  setPos(p,x,y,z); p.connect(to||A.fx); return p;
}
function setPos(p,x,y,z){ if(p.positionX){ p.positionX.value=x; p.positionY.value=y; p.positionZ.value=z; } else p.setPosition(x,y,z); }
K.spatial = spatial; K.setPos = setPos;
K.at = v => A.ctx ? spatial(v.x, v.y==null?1:v.y||1, v.z) : null;
function tone(type,f0,f1,dur,vol,out,delay){
  if(!A.ctx) return; const c=A.ctx, t=c.currentTime+(delay||0);
  const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+Math.min(.02,dur/4)); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g); g.connect(out||A.fx); o.start(t); o.stop(t+dur+.05);
}
function noise(dur,vol,out,type,f0,f1,q,delay){
  if(!A.ctx) return; const c=A.ctx, t=c.currentTime+(delay||0);
  const s=c.createBufferSource(); s.buffer=A.noise; const f=c.createBiquadFilter(); f.type=type||'lowpass'; f.Q.value=q||1;
  f.frequency.setValueAtTime(f0||800,t); f.frequency.exponentialRampToValueAtTime(f1||f0||800,t+dur);
  const g=c.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(out||A.fx); s.start(t,Math.random()); s.stop(t+dur+.05);
}
K.sfx = {
  step:(out,v)=>noise(.09,v||.18,out,'lowpass',mr(500,800),200,1),
  stomp:(out,v)=>{ noise(.22,v||.35,out,'lowpass',mr(260,340),70,2); tone('sine',mr(58,66),32,.25,(v||.35)*.7,out); },
  breath:out=>{ noise(.7,.16,out,'bandpass',900,420,2.5); noise(.9,.12,out,'bandpass',520,300,2.5,.85); },
  /* feeding, one per ghost */
  chew:out=>{ for(let i=0;i<3;i++){ noise(.12,.3,out,'bandpass',mr(280,520),180,3,i*.18); tone('sine',mr(70,90),40,.12,.12,out,i*.18); } },
  slurp:out=>{ noise(.6,.22,out,'bandpass',380,1700,4); tone('sine',300,900,.5,.04,out); },
  suck:out=>{ tone('sine',1700,2500,.7,.05,out); noise(.7,.08,out,'highpass',3500,5000,2); },
  drag:(out,v)=>noise(.5,v||.12,out,'bandpass',mr(500,700),250,2),
  heart:v=>{ tone('sine',58,40,.16,v); tone('sine',52,36,.14,v*.8,null,.22); },
  giggle:out=>{ for(let i=0;i<5;i++){ const f=mr(780,980)-i*30; tone('triangle',f,f*.92,.11,.12,out,i*.16); noise(.08,.04,out,'bandpass',2600,2400,6,i*.16); } },
  growl:out=>{ noise(1.1,.35,out,'lowpass',320,120,8); tone('sawtooth',62,44,1.1,.08,out); },
  moan:out=>{ tone('triangle',420,250,1.6,.1,out); tone('sine',415,240,1.6,.06,out,.05); },
  shriek:out=>{ tone('sawtooth',1300,500,1.2,.12,out); tone('square',1340,470,1.1,.05,out); noise(1,.1,out,'bandpass',3000,1200,3); },
  wail:out=>{ for(let i=0;i<3;i++){ tone('sawtooth',880-i*90,360,1.8,.1,out,i*.12); } noise(1.8,.12,out,'bandpass',2200,700,2); },
  whoosh:out=>noise(.4,.25,out,'bandpass',300,1600,1.5),
  hit:()=>{ noise(.25,.5,null,'lowpass',1800,200,1); tone('sine',90,40,.3,.5); tone('sawtooth',220,233,.6,.08); },
  sting:()=>{ for(const f of [220,233,311]) tone('sawtooth',f,f*.98,1.4,.05); },
  scare:()=>{ noise(.9,.9,null,'bandpass',2600,900,1.2); tone('sawtooth',1500,380,1.0,.25); tone('square',1520,360,.9,.12); tone('sine',70,35,.8,.6); },
  bell:()=>{ for(const [f,v] of [[196,.18],[392,.08],[523,.05],[784,.03]]) tone('sine',f,f*.995,4,v); },
  light:out=>{ noise(.12,.3,out,'highpass',3000,2000,1); tone('sine',600,300,.3,.04,out); },
  clang:out=>{ for(const f of [740,1110,1480]) tone('square',f,f*.97,.9,.16,out); noise(.6,.6,out,'highpass',2500,1500,1); },
  gate:()=>{ tone('sawtooth',70,42,2.6,.12); noise(2.4,.15,null,'lowpass',500,120,2); },
  pick:()=>{ tone('square',1200,1200,.04,.06); tone('square',1600,1600,.04,.05,null,.06); },
  place:()=>{ tone('sine',523,523,1.2,.1); tone('sine',784,784,1.4,.06,null,.15); },
  tick:()=>tone('square',1800,1800,.03,.05),
  good:()=>{ tone('sine',880,880,.12,.1); tone('sine',1320,1320,.16,.08,null,.08); },
  stun:()=>{ tone('sine',2400,300,.8,.15); noise(.5,.3,null,'highpass',4000,1500,1); },
  salt:out=>noise(.35,.3,out,'highpass',5000,2500,1),
  splash:out=>{ noise(.6,.35,out,'bandpass',1200,400,1.5); tone('sine',1600,900,.4,.05,out); },
  block:()=>{ tone('sine',1200,1180,1.2,.15); tone('sine',1800,1790,1.0,.08); },
  down:out=>{ noise(.3,.4,out,'lowpass',600,100,1); tone('sine',140,60,.6,.2,out); },
  ping:out=>{ tone('sine',990,990,.12,.12,out); tone('sine',1320,1320,.18,.1,out,.12); },
  wisp:out=>{ tone('sine',1500,2100,.8,.05,out); tone('sine',1505,2110,.8,.04,out,.03); },
  thunder:()=>{ const out=A.amb; noise(3.2,.5,out,'lowpass',260,60,1); noise(1.2,.35,out,'lowpass',900,120,1); tone('sine',48,30,2.6,.12,out,.1); },
  cricket:()=>{ const out=A.amb, f=mr(4200,5200), n=3+(Math.random()*3|0); for(let i=0;i<n;i++) tone('square',f,f,.025,.012,out,i*.06); },
  /* distant haunts: played at a random far point */
  haunt:(out)=>{
    const k = Math.random()*6|0;
    if(k===0){ for(let i=0;i<4;i++){ const f=mr(600,760); tone('triangle',f,f*.9,.14,.05,out,i*.22); } }          // child laughing
    else if(k===1){ tone('sawtooth',700,300,1.6,.05,out); noise(1.4,.04,out,'bandpass',1600,600,3); }            // far scream
    else if(k===2){ for(let i=0;i<3;i++) noise(.25,.12,out,'bandpass',mr(200,500),mr(150,300),8,i*.35); }       // wood creak
    else if(k===3){ tone('sine',520,700,.6,.06,out); tone('sine',700,480,1.4,.06,out,.6); }                       // dog howl
    else if(k===4){ for(const [f,v] of [[140,.08],[280,.04]]) tone('sine',f,f*.99,5,v,out); }                     // far bell
    else { for(let i=0;i<6;i++) noise(.12,.05,out,'bandpass',mr(2000,4000),mr(1500,3000),5,i*.13); }            // whisper
  }
};
K.setListener = function(){
  if(!A.ctx) return; const l=A.ctx.listener, cam=K.camera, p=cam.position;
  const f = new K.V3(0,0,-1).applyQuaternion(cam.quaternion);
  if(l.positionX){ l.positionX.value=p.x; l.positionY.value=p.y; l.positionZ.value=p.z; l.forwardX.value=f.x; l.forwardY.value=f.y; l.forwardZ.value=f.z; l.upX.value=0; l.upY.value=1; l.upZ.value=0; }
  else { l.setPosition(p.x,p.y,p.z); l.setOrientation(f.x,f.y,f.z,0,1,0); }
};
})(window.K);
