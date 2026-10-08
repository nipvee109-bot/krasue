/* core: shared namespace, helpers, tuning numbers, ghost definitions */
window.K = {};
(function(K){
'use strict';
K.$ = s => document.querySelector(s);
K.$$ = s => Array.from(document.querySelectorAll(s));
K.clamp = (v,a,b) => v<a?a:v>b?b:v;
K.lerp = (a,b,t) => a+(b-a)*t;
K.mr = (a,b) => a+Math.random()*(b-a);
K.pick = arr => arr[Math.random()*arr.length|0];
K.shuffle = arr => { const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };
K.r2 = v => Math.round(v*100)/100;
K.esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
K.angLerp = (a,b,t) => { let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*t; };
K.params = new URLSearchParams(location.search);
K.DEBUG = K.params.has('debug');
/* ?local=1 swaps PeerJS for a BroadcastChannel transport so several tabs of one browser can play offline (testing) */
K.LOCAL = K.params.has('local');
K.V3 = THREE.Vector3;

/* map layout uses a seeded RNG so every player builds the same temple */
K.mulberry32 = function(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; };

K.store = {
  get(k, def){ try{ const v = localStorage.getItem('krasue2.'+k); return v==null ? def : JSON.parse(v); }catch(e){ return def; } },
  set(k, v){ try{ localStorage.setItem('krasue2.'+k, JSON.stringify(v)); }catch(e){} }
};

K.IS_TOUCH = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints>0);
if(K.params.has('touch')) K.IS_TOUCH = true;
if(K.params.has('notouch')) K.IS_TOUCH = false;

/* ---------- tuning ---------- */
K.CFG = {
  walk:3.0, run:5.4, carry:2.5, crouch:1.7, crouchEye:1.0, scuffTime:6, rage:1.08, lunge:8.5, lungeTime:.45, R:.3, eye:1.6,
  stamDrain:24, stamRegen:13, batDrain:.6, batPick:50, batRespawn:45,
  candles:4, offerings:2, charms:6,
  candleTime:7, placeTime:2, reviveTime:4, finishTime:3, bleed:60, wake:15,
  dawn:420, dawnChoices:[300,360,420,480,600],
  stunTime:3, stunImmune:10, stunRange:8, stunCone:Math.cos(13*Math.PI/180), stunConeMob:Math.cos(18*Math.PI/180),
  hitRange:1.55, hitCD:2.6, missCD:1.2,
  terror:16, net:1/20, reach:2.3,
  voiceRange:15,
  holyTime:15, holyWidth:3.4, saltRange:9,
  signalCD:3, wispCD:10, scFailLoss:.15, scBonus:.05, noiseTime:6,
  maxPlayers:6,
  /* disguise mode: the ghost walks among the survivors as itself, and must shed its skin to hunt */
  morphTime:1.3, huntTime:22, formCD:16, formFirst:25
};

/* three ghosts: the stats the host simulates and the client presents */
K.GHOSTS = {
  krasue:{name:'กระสือ', speed:4.6, hits:2, eye:1.75, fly:true, stunNeed:1.0, saltStun:1.6,
    skill:'inv', skillName:'หายตัว', skillTime:6, skillCD:25,
    blurb:'หัวลอยไส้เรืองแสง เร็วที่สุด บินข้ามหลุมศพกับพุ่มไม้ได้ กดสกิลเพื่อหายตัว 6 วิ แต่ตัวเรืองแสงเห็นได้แต่ไกลและแพ้ไฟฉาย'},
  pop:{name:'ผีปอบ', speed:3.9, hits:1, eye:2.05, fly:false, stunNeed:2.6, saltStun:4.2,
    skill:'smell', skillName:'ดมกลิ่น', skillTime:8, skillCD:28,
    blurb:'ตัวใหญ่หลังค่อม ช้า แต่ตะครุบครั้งเดียวล้ม ไม่ค่อยมึนไฟฉาย กดสกิลเพื่อดมกลิ่นเห็นรอยเท้าคนหนี 8 วิ แพ้เกลือแรงเป็นพิเศษ'},
  pret:{name:'เปรต', speed:4.15, hits:2, eye:3.6, fly:false, stunNeed:1.4, saltStun:1.8, noIndoor:true,
    skill:'wail', skillName:'กรีดร้องขอส่วนบุญ', skillTime:5, skillCD:30, wailRange:12,
    blurb:'สูงเกือบ 4 เมตร มองข้ามกำแพงได้ กดสกิลเพื่อกรีดร้อง คนแถวนั้นเดินช้าลงและไฟฉายกะพริบ 5 วิ แต่ตัวสูงเกินจะเข้ากุฏิกับโบสถ์ได้'}
};
K.GHOST_KEYS = ['krasue','pop','pret'];

K.CHARMS = {
  takrut:{name:'ตะกรุด', hint:'กันโดนตะครุบได้ 1 ครั้ง (ถือไว้ก็คุ้มครองแล้ว)'},
  salt:{name:'เกลือ', hint:'ปาใส่ผีให้ชะงัก'},
  holy:{name:'น้ำมนต์', hint:'พรมเป็นเส้นบนพื้น ผีข้ามไม่ได้ 15 วิ'}
};
K.OFFERS = {garland:'พวงมาลัย', incense:'ธูปเทียนแพ'};
K.SIGNALS = ['มาทางนี้','ช่วยด้วย','ผีอยู่นี่'];

/* customisation */
K.SHIRTS = ['#c0533f','#3f86c0','#cfae3f','#58a85a','#a46ac4','#d07a2c','#e0d6c0','#3a3f4a'];
K.HAIRS = ['สั้น','ยาว','มัดจุก','หัวเกรียน'];
K.HATS = ['ไม่มี','หมวกแก๊ป','หมวกไหมพรม','งอบ'];
K.defaultLook = () => ({c:K.pick(K.SHIRTS), h:Math.random()*3|0, t:0});
K.cleanLook = l => {
  l = l && typeof l==='object' ? l : {};
  return {c:K.SHIRTS.includes(l.c)?l.c:K.SHIRTS[0], h:K.clamp(l.h|0,0,K.HAIRS.length-1), t:K.clamp(l.t|0,0,K.HATS.length-1)};
};

K.fmtTime = s => { s = Math.max(0, Math.ceil(s)); return (s/60|0)+':'+String(s%60).padStart(2,'0'); };
})(window.K);
