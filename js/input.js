/* input: keyboard, mouse look (pointer lock, or press-and-drag when the browser refuses the lock), touch controls */
(function(K){
'use strict';
const {clamp} = K;
const G = K.G, L = K.L, keys = K.keys;
K.SENS = K.store.get('sens', 1);
const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','KeyQ','KeyR','KeyM','KeyC','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Digit1','Digit2','Digit3'];
const playing = () => G.inGame && !L.menu;
function turn(dx, dy, k){ L.yaw -= dx*k*K.SENS; L.pitch = clamp(L.pitch - dy*k*K.SENS, -1.35, 1.35); }

/* primary action: timing ring first, otherwise the ghost lunges */
function primary(){ if(K.scPress()) return; if(G.role==='ghost') K.ghostAttack(); }

addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT'){ if(e.code==='Enter'){ if(e.target===K.codeIn) K.joinRoom(); else if(e.target===K.nameIn) K.hostCreate(); } return; }
  if(e.code==='Escape' && G.inGame && !L.menu && LOOK.mode==='drag'){ K.pause(); return; }
  if(!playing()) return;
  if(GAME_KEYS.includes(e.code)) e.preventDefault();
  if(e.repeat){ keys[e.code]=true; return; }
  keys[e.code]=true;
  switch(e.code){
    case 'KeyF': K.toggleLight(); break;
    case 'KeyQ': K.ghostSkill(); break;
    case 'KeyE': K.usePress(); break;
    case 'KeyR': K.useCharm(); break;
    case 'KeyM': K.voice.toggleMute(); break;
    case 'KeyC': K.toggleCrouch(); break;
    case 'Digit1': K.signal(0); break;
    case 'Digit2': K.signal(1); break;
    case 'Digit3': K.signal(2); break;
    case 'Space': if(!K.isSpect(K.P[K.NET.me])) primary(); break;
  }
});
addEventListener('keyup', e=>{ keys[e.code]=false; });
addEventListener('blur', ()=>{ for(const k in keys) keys[k]=false; });

/* ---------- mouse look ---------- */
const LOOK = K.LOOK_MODE = {mode:K.store.get('dragLook', false) ? 'drag' : 'lock', locked:false, ever:false, dragging:false, moved:0, lx:0, ly:0, pending:false};
const canvas = K.canvas;
function lockFailed(){
  if(!LOOK.pending) return;
  /* once a lock has worked here, a refusal is just the browser's short cooldown after Esc: click the view to retry */
  if(LOOK.ever){ LOOK.pending = false; K.toast('คลิกที่จอเพื่อหันมองต่อ', 2.5); return; }
  toDrag(true);
}
function toDrag(why){
  if(LOOK.mode==='drag') return;
  LOOK.mode = 'drag'; LOOK.pending = false;
  document.body.classList.add('drag-look');
  const box = K.$('#dragLookBox'); if(box) box.checked = true;
  if(why) K.toast('ล็อกเมาส์ไม่ได้ในหน้าต่างนี้ · กดค้างแล้วลากเพื่อหันมอง', 5);
}
K.setDragLook = function(on){
  K.store.set('dragLook', on);
  if(on){ if(document.pointerLockElement) document.exitPointerLock(); toDrag(false); }
  else { LOOK.mode = 'lock'; document.body.classList.remove('drag-look'); }
};
if(LOOK.mode==='drag') document.body.classList.add('drag-look');
K.lockPointer = function(){
  if(K.IS_TOUCH || LOOK.mode==='drag' || document.pointerLockElement===canvas) return;
  if(!canvas.requestPointerLock){ toDrag(true); return; }
  LOOK.pending = true;
  try{
    const r = canvas.requestPointerLock();
    if(r && r.catch) r.catch(lockFailed);
  }catch(e){ LOOK.pending = true; lockFailed(); return; }
  /* some embedded windows neither lock nor report an error */
  setTimeout(()=>{ if(document.pointerLockElement!==canvas) lockFailed(); }, 700);
};
K.releasePointer = function(){ if(document.pointerLockElement) document.exitPointerLock(); LOOK.dragging = false; };
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('pointerlockchange', ()=>{
  const was = LOOK.locked;
  LOOK.locked = document.pointerLockElement===canvas;
  if(LOOK.locked){ LOOK.pending = false; LOOK.ever = true; }
  if(was && !LOOK.locked && G.inGame && !L.menu && !G.ended) K.pause();
});
canvas.addEventListener('mousedown', e=>{
  if(!playing() || e.button!==0) return;
  if(LOOK.mode==='lock'){
    if(!LOOK.locked){ K.lockPointer(); return; }
    primary(); return;
  }
  LOOK.dragging = true; LOOK.moved = 0; LOOK.lx = e.clientX; LOOK.ly = e.clientY;
  document.body.classList.add('dragging');
});
document.addEventListener('mousemove', e=>{
  if(LOOK.locked){ turn(e.movementX, e.movementY, .0022); return; }
  if(LOOK.mode==='drag' && LOOK.dragging && playing()){
    const dx = e.clientX-LOOK.lx, dy = e.clientY-LOOK.ly; LOOK.lx = e.clientX; LOOK.ly = e.clientY;
    LOOK.moved += Math.abs(dx)+Math.abs(dy);
    turn(dx, dy, .0042);
  }
});
document.addEventListener('mouseup', e=>{
  if(!LOOK.dragging) return;
  LOOK.dragging = false; document.body.classList.remove('dragging');
  if(LOOK.moved<6 && playing()) primary();
});
canvas.addEventListener('contextmenu', e=>e.preventDefault());

/* ---------- touch ---------- */
const T = {stick:null, look:null, sx:0, sy:0, lx:0, ly:0};
const touchEl = K.$('#touch'), stickEl = K.$('#stick'), knobEl = K.$('#knob');
const STICK_R = 56;
function act(name, down){
  if(down) K.vibrate(8);
  switch(name){
    case 'use':
      /* on a phone the use button latches: tap once to start lighting/placing/reviving, tap again (or tap the ring) to hit the ring.
         Holding one thumb on a button while tapping with another is awkward on glass. */
      if(!down) break;
      if(K.scPress()) break;
      if(L.autoHold){ L.autoHold = null; break; }
      if(L.target && K.HOLD_KINDS[L.target.k]){ L.autoHold = {k:L.target.k, i:L.target.i}; break; }
      K.usePress(); break;
    case 'hold': keys.TouchUse = down; break;
    case 'light': if(down) K.toggleLight(); break;
    case 'crouch': if(down) K.toggleCrouch(); break;
    case 'charm': if(down) K.useCharm(); break;
    case 'sig': if(down) document.body.classList.toggle('sig-open'); break;
    case 'sig0': case 'sig1': case 'sig2': if(down){ K.signal(+name[3]); document.body.classList.remove('sig-open'); } break;
    case 'mic': if(down) K.voice.toggleMute(); break;
    case 'atk': if(down) primary(); break;
    case 'skill': if(down) K.ghostSkill(); break;
    case 'up': K.IN.fly = down ? 1 : 0; break;
    case 'down': K.IN.fly = down ? -1 : 0; break;
    case 'wisp': if(down) K.wisp(); break;
    case 'pause': if(down) K.pause(); break;
  }
}
const btnDown = {};
touchEl.addEventListener('pointerdown', e=>{
  if(!playing()) return;
  e.preventDefault();
  const b = e.target.closest('[data-act]');
  if(b){ btnDown[e.pointerId] = b; b.classList.add('on'); act(b.dataset.act, true); return; }
  if(e.clientX < innerWidth*.42 && !T.stick){
    T.stick = e.pointerId; T.sx = e.clientX; T.sy = e.clientY;
    stickEl.style.left = (T.sx-STICK_R)+'px'; stickEl.style.top = (T.sy-STICK_R)+'px'; stickEl.hidden = false; knobEl.style.transform = 'translate(0,0)';
  } else if(!T.look){
    if(K.scPress()) return;   // tap anywhere on the right while the timing ring is up
    T.look = e.pointerId; T.lx = e.clientX; T.ly = e.clientY;
  }
}, {passive:false});
touchEl.addEventListener('pointermove', e=>{
  if(e.pointerId===T.stick){
    let dx = e.clientX-T.sx, dy = e.clientY-T.sy; const d = Math.hypot(dx,dy);
    if(d>STICK_R){ dx*=STICK_R/d; dy*=STICK_R/d; }
    knobEl.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, d/STICK_R);
    K.IN.mx = dx/STICK_R; K.IN.my = dy/STICK_R;
    K.IN.run = m>.92;   // push to the rim to run
    stickEl.classList.toggle('run', K.IN.run);
  } else if(e.pointerId===T.look){
    const dx = e.clientX-T.lx, dy = e.clientY-T.ly; T.lx = e.clientX; T.ly = e.clientY;
    turn(dx, dy, .0065);
  }
});
function endPointer(e){
  const b = btnDown[e.pointerId];
  if(b){ delete btnDown[e.pointerId]; b.classList.remove('on'); act(b.dataset.act, false); }
  if(e.pointerId===T.stick){ T.stick=null; K.IN.mx=0; K.IN.my=0; K.IN.run=false; stickEl.hidden = true; }
  if(e.pointerId===T.look) T.look=null;
}
touchEl.addEventListener('pointerup', endPointer);
touchEl.addEventListener('pointercancel', endPointer);
K.resetTouch = function(){ T.stick=null; T.look=null; K.IN.mx=0; K.IN.my=0; K.IN.run=false; K.IN.fly=0; keys.TouchUse=false; L.autoHold=null; stickEl.hidden=true; for(const id in btnDown){ btnDown[id].classList.remove('on'); delete btnDown[id]; } };

/* on phones: go full screen, hold landscape, keep the screen awake */
let wakeLock = null;
K.enterMobile = async function(){
  if(!K.IS_TOUCH) return;
  try{ if(!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:'hide'}); }catch(e){}
  try{ if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); }catch(e){}
  K.keepAwake();
};
K.keepAwake = async function(){
  try{ if('wakeLock' in navigator && !wakeLock){ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', ()=>{ wakeLock = null; }); } }catch(e){}
};
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && G.inGame) K.keepAwake(); });
K.vibrate = p => { try{ if(K.IS_TOUCH && navigator.vibrate) navigator.vibrate(p); }catch(e){} };
})(window.K);
