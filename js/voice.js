/* voice: proximity voice chat. One RTCPeerConnection per pair of players, signalled through the host's data channel
   (so it works the same over PeerJS and ?local=1). Remote voices go through Web Audio panners:
   heard with direction, fading to silence at 15 m. Who hears whom follows the game rules in voiceGain(). */
(function(K){
'use strict';
const V = K.voice = {stream:null, track:null, muted:K.store.get('muted', false), denied:false, why:'', asked:false, pcs:{}, src:null, an:null, buf:null, resyncT:0};

V.start = async function(){
  if(V.asked) return; V.asked = true;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ V.denied = true; V.why = 'insecure'; K.onVoiceState && K.onVoiceState(); return; }
  try{
    V.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}, video:false});
    V.track = V.stream.getAudioTracks()[0];
    V.track.enabled = !V.muted;
    for(const id in V.pcs) attachTrack(V.pcs[id]);
    if(K.A.ctx){ V.src = K.A.ctx.createMediaStreamSource(V.stream); V.an = K.A.ctx.createAnalyser(); V.an.fftSize = 256; V.buf = new Uint8Array(V.an.fftSize); V.src.connect(V.an); }
  }catch(e){ V.denied = true; V.why = e && e.name || 'denied'; }
  K.onVoiceState && K.onVoiceState();
};
V.stop = function(){
  for(const id in V.pcs) closePc(id);
  if(V.stream) for(const t of V.stream.getTracks()) t.stop();
  V.stream = null; V.track = null; V.asked = false; V.denied = false; V.src = null; V.an = null;
};
V.setMuted = function(m){ V.muted = m; K.store.set('muted', m); if(V.track) V.track.enabled = !m; K.onVoiceState && K.onVoiceState(); };
V.toggleMute = () => V.setMuted(!V.muted);
V.level = function(){
  if(!V.an || V.muted) return 0;
  V.an.getByteTimeDomainData(V.buf); let s=0; for(let i=0;i<V.buf.length;i++){ const v=(V.buf[i]-128)/128; s+=v*v; }
  return Math.sqrt(s/V.buf.length);
};

function attachTrack(e){
  for(const tr of e.pc.getTransceivers()) if(tr.receiver.track && tr.receiver.track.kind==='audio'){
    try{ tr.direction = 'sendrecv'; if(V.track) tr.sender.replaceTrack(V.track); }catch(err){}
  }
}
function sig(to, d){ K.sendHost({t:'sig', to, d}); }
function makePc(id){
  const pc = new RTCPeerConnection({iceServers:K.ICE});
  const e = {id, pc, pending:[], haveRemote:false, gD:null, gS:null, pan:null, el:null};
  V.pcs[id] = e;
  pc.onicecandidate = ev => { if(ev.candidate) sig(id, {c:ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate}); };
  pc.ontrack = ev => {
    const stream = ev.streams && ev.streams[0] || new MediaStream([ev.track]);
    /* Chrome only feeds a remote WebRTC stream into Web Audio while some media element plays it */
    e.el = new Audio(); e.el.srcObject = stream; e.el.muted = true; e.el.play().catch(()=>{});
    const A = K.A;
    if(A.ctx){
      const src = A.ctx.createMediaStreamSource(stream);
      e.gD = A.ctx.createGain(); e.gD.gain.value = 0; src.connect(e.gD); e.gD.connect(A.voice);
      e.gS = A.ctx.createGain(); e.gS.gain.value = 0; src.connect(e.gS);
      e.pan = A.ctx.createPanner(); e.pan.panningModel='HRTF'; e.pan.distanceModel='linear'; e.pan.refDistance=1; e.pan.maxDistance=K.CFG.voiceRange; e.pan.rolloffFactor=1;
      e.gS.connect(e.pan); e.pan.connect(A.voice);
    } else { e.el.muted = false; }
  };
  pc.onconnectionstatechange = () => { if(pc.connectionState==='failed' || pc.connectionState==='closed') closePc(id); };
  return e;
}
function closePc(id){
  const e = V.pcs[id]; if(!e) return; delete V.pcs[id];
  try{ e.pc.close(); }catch(err){}
  if(e.el){ e.el.srcObject = null; }
  try{ if(e.gD) e.gD.disconnect(); if(e.gS) e.gS.disconnect(); if(e.pan) e.pan.disconnect(); }catch(err){}
}
async function call(id){
  const e = makePc(id);
  const tr = e.pc.addTransceiver('audio', {direction:'sendrecv'});
  if(V.track) tr.sender.replaceTrack(V.track);
  try{ const o = await e.pc.createOffer(); await e.pc.setLocalDescription(o); sig(id, {sdp:e.pc.localDescription.toJSON ? e.pc.localDescription.toJSON() : {type:o.type, sdp:o.sdp}}); }
  catch(err){ closePc(id); }
}
V.onSig = async function(from, d){
  if(!d || !window.RTCPeerConnection) return;
  let e = V.pcs[from];
  try{
    if(d.sdp){
      if(d.sdp.type==='offer'){
        if(e) closePc(from);
        e = makePc(from);
        await e.pc.setRemoteDescription(d.sdp); e.haveRemote = true;
        attachTrack(e);
        const a = await e.pc.createAnswer(); await e.pc.setLocalDescription(a);
        sig(from, {sdp:{type:a.type, sdp:a.sdp}});
      } else if(e && d.sdp.type==='answer'){
        await e.pc.setRemoteDescription(d.sdp); e.haveRemote = true;
      }
      if(e) { for(const c of e.pending) try{ await e.pc.addIceCandidate(c); }catch(err){} e.pending = []; }
    } else if(d.c && e){
      if(e.haveRemote) await e.pc.addIceCandidate(d.c); else e.pending.push(d.c);
    }
  }catch(err){ if(K.DEBUG) console.warn('voice sig', err); }
};
/* keep one connection per other player in the room; the lower id makes the offer */
V.sync = function(ids){
  if(!window.RTCPeerConnection || !K.NET.me) return;
  const me = K.NET.me;
  for(const id in V.pcs) if(!ids.includes(id)) closePc(id);
  for(const id of ids) if(id!==me && !V.pcs[id] && me<id) call(id);
};

/* who hears whom:
   - lobby / results: everyone, no distance
   - in a round the ghost is silent; living survivors are heard by living survivors and by the ghost within 15 m;
     spirits (dead or escaped) hear only each other */
function voiceGain(me, s){
  if(!K.G.inGame || K.G.ph==='end') return [1,0];
  if(!me || !s) return [0,0];
  const spect = v => v.s==='dead' || v.s==='escaped';
  if(s.role==='ghost') return [0,0];
  if(spect(s)) return spect(me) ? [1,0] : [0,0];
  if(spect(me)) return [0,0];
  return [0,1];
}
V.update = function(dt){
  V.resyncT -= dt;
  if(V.resyncT<=0){ V.resyncT = 4; if(K.voiceIds) V.sync(K.voiceIds()); }
  const A = K.A; if(!A.ctx) return;
  const me = K.P[K.NET.me], t = A.ctx.currentTime;
  for(const id in V.pcs){
    const e = V.pcs[id]; if(!e.gD) continue;
    const s = K.P[id];
    const [d, sp] = voiceGain(me, s);
    e.gD.gain.setTargetAtTime(d, t, .08);
    e.gS.gain.setTargetAtTime(sp, t, .08);
    if(s && sp>0) K.setPos(e.pan, s.pos.x, s.role==='ghost'?s.pos.y:1.6, s.pos.z);
  }
};
})(window.K);
