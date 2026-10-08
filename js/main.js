/* main: frame loop + debug hooks */
(function(K){
'use strict';
const G = K.G;
let lastT = performance.now();
function frame(dt){
  K.gameTime += dt;
  if(G.inGame){
    K.updateLocal(dt);
    if(G.ph!=='end') K.sendState(dt);
    K.updateRemotes(dt);
    K.updateTrails(dt);
    K.checkReveal(dt);
    K.updateFx(dt);
    K.updateHUD(dt);
    K.updateAudio(dt);
    K.perfWatch(dt);
  } else {
    // menu backdrop: slow orbit over the temple (the lobby has its own scene, see lobby3d.js)
    const a = K.gameTime*.05;
    K.camera.position.set(Math.sin(a)*18, 6, Math.cos(a)*18+4); K.camera.lookAt(0,1.5,-6);
    if(K.lobby3d.active()) K.lobby3d.frame(dt);
    K.updateHUD(dt);
    K.benchFrame(dt);
    if(K.lookOpen()) K.preview.frame(dt);
  }
  K.voice.update(dt);
  K.updateWorld(dt);
  K.updateAmbience(dt);
  K.grain(dt);
  if(!G.inGame && K.lobby3d.active()) K.lobby3d.render(); else K.renderer.render(K.scene, K.camera);
}
function loop(t){ requestAnimationFrame(loop); const dt=Math.min(.05,(t-lastT)/1000); lastT=t; if(!G.manual) frame(dt); }
requestAnimationFrame(loop);
K.setVision();

if(K.DEBUG){
  window.__game = Object.assign(K, {
    view(x,z,yaw,pitch){ K.L.pos.set(x,K.L.pos.y,z); if(yaw!=null) K.L.yaw=yaw; if(pitch!=null) K.L.pitch=pitch; },
    tick(sec){ G.manual=true; const n=Math.round((sec||1)*30); for(let i=0;i<n;i++){ if(K.NET.isHost) K.hostTick(1/30); frame(1/30); } G.manual=false; },
    play(){ K.L.menu=false; K.show(null); },
    key(code,down){ K.keys[code]=down!==false; }
  });
}
})(window.K);
