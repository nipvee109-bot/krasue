/* net: PeerJS (WebRTC data channels) with the host as authority.
   LocalPeer mimics the small part of the PeerJS API we use over a BroadcastChannel,
   so ?local=1 lets several tabs play together with no internet (handy for testing). */
(function(K){
'use strict';
K.PREFIX = 'krasue-wat2-';
K.ICE = [{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}];
/* add a TURN server here if some mobile networks can't connect, e.g.
   K.ICE.push({urls:'turn:your.turn.host:3478', username:'...', credential:'...'}); */

class Emitter{
  constructor(){ this._h = {}; }
  on(e,f){ (this._h[e]=this._h[e]||[]).push(f); return this; }
  emit(e,...a){ for(const f of (this._h[e]||[])) try{ f(...a); }catch(err){ console.error(err); } }
}
const bc = K.LOCAL && window.BroadcastChannel ? new BroadcastChannel('krasue-local') : null;
const localPeers = {};
if(bc) bc.onmessage = ev => { const m = ev.data; const p = localPeers[m.to]; if(p) p._recv(m); };
class LocalConn extends Emitter{
  constructor(peer, remote){ super(); this.peerObj=peer; this.peer=remote; this.open=false; }
  send(m){ if(this.open) bc.postMessage({k:'d', from:this.peerObj.id, to:this.peer, m}); }
  close(){ if(!this.open) return; this.open=false; bc.postMessage({k:'x', from:this.peerObj.id, to:this.peer}); this.emit('close'); }
}
class LocalPeer extends Emitter{
  constructor(id){
    super(); this.id = id || ('p'+Math.random().toString(36).slice(2,10)); this.conns = {}; this.destroyed = false;
    localPeers[this.id] = this;
    setTimeout(()=>this.emit('open', this.id), 30);
  }
  connect(remote){
    const c = new LocalConn(this, remote); this.conns[remote] = c;
    bc.postMessage({k:'c', from:this.id, to:remote});
    setTimeout(()=>{ if(!c.open){ delete this.conns[remote]; this.emit('error', {type:'peer-unavailable'}); } }, 1500);
    return c;
  }
  _recv(m){
    let c = this.conns[m.from];
    if(m.k==='c'){ c = new LocalConn(this, m.from); this.conns[m.from]=c; c.open=true; this.emit('connection', c); c.emit('open'); bc.postMessage({k:'a', from:this.id, to:m.from}); }   // open our end before acking, so the joiner's first message never beats it
    else if(m.k==='a' && c){ c.open = true; c.emit('open'); }
    else if(m.k==='d' && c && c.open){ c.emit('data', m.m); }
    else if(m.k==='x' && c){ c.open=false; delete this.conns[m.from]; c.emit('close'); }
  }
  destroy(){ if(this.destroyed) return; this.destroyed = true; for(const id in this.conns) this.conns[id].close(); delete localPeers[this.id]; }
  reconnect(){}
}
addEventListener('pagehide', ()=>{ for(const id in localPeers) localPeers[id].destroy(); });

const NET = K.NET = {peer:null, isHost:false, code:'', conns:{}, host:null, me:null};
K.peerOpts = () => ({debug: K.DEBUG?2:0, config:{iceServers:K.ICE}});
K.newPeer = id => bc ? new LocalPeer(id) : (id ? new Peer(id, K.peerOpts()) : new Peer(K.peerOpts()));
K.peerReady = function(){ if(bc || window.Peer) return true; K.menuMsg('โหลดระบบออนไลน์ (PeerJS) ไม่ได้ ลองรีเฟรชหน้า หรือเช็คอินเทอร์เน็ต', true); return false; };
K.genCode = function(){ const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=a[Math.random()*a.length|0]; return s; };
K.sendHost = function(m){ if(NET.isHost) K.hostRecv(NET.me,m); else if(NET.host && NET.host.open) NET.host.send(m); };
K.broadcast = function(m){ for(const id in NET.conns){ const c=NET.conns[id]; if(c.open) c.send(m); } K.clientRecv(m); };
K.sendTo = function(id,m){ if(id===NET.me) K.clientRecv(m); else { const c=NET.conns[id]; if(c && c.open) c.send(m); } };

K.hostCreate = function(){
  if(NET.peer || !K.peerReady()) return;   // already hosting or joining: a second click must not open a second session
  K.audioInit();
  const name = K.myName();
  K.menuMsg('กำลังสร้างห้อง...');
  const code = K.params.get('code') && (K.DEBUG||K.LOCAL) ? K.params.get('code').toUpperCase() : K.genCode();
  const peer = NET.peer = K.newPeer(K.PREFIX+code);
  peer.on('open', id=>{
    NET.me = id; NET.isHost = true; NET.code = code;
    K.hostOpen(id, name);
    K.voice.start();
  });
  peer.on('connection', conn=>{
    conn.on('open', ()=>{ NET.conns[conn.peer]=conn; });
    conn.on('data', m=>K.hostRecv(conn.peer,m));
    conn.on('close', ()=>K.hostDrop(conn.peer));
    conn.on('error', ()=>K.hostDrop(conn.peer));
  });
  // destroy() fires 'disconnected' before marking itself destroyed, so decide once it has settled: only a live room reconnects
  peer.on('disconnected', ()=>setTimeout(()=>{ if(NET.peer===peer && !peer.destroyed) peer.reconnect(); }, 0));
  peer.on('error', err=>{
    if(err.type==='unavailable-id'){ peer.destroy(); NET.peer = null; K.hostCreate(); return; }
    if(!NET.isHost){ K.menuMsg('สร้างห้องไม่สำเร็จ ('+err.type+') ลองใหม่อีกครั้ง', true); K.teardown(); }
  });
};
K.joinRoom = function(){
  if(NET.peer || !K.peerReady()) return;
  const code = K.codeIn.value.trim().toUpperCase();
  if(code.length!==4){ K.menuMsg('ใส่รหัสห้อง 4 ตัวที่เพื่อนส่งมา', true); K.codeIn.focus(); return; }
  K.audioInit();
  const name = K.myName();
  K.menuMsg('กำลังเข้าห้อง '+code+'...');
  const peer = NET.peer = K.newPeer();
  let opened = false;
  const timer = setTimeout(()=>{ if(!opened && NET.peer===peer){ K.menuMsg('เชื่อมต่อห้อง '+code+' ไม่ได้ (เน็ตบางแห่งบล็อกการเชื่อมต่อแบบ P2P)', true); K.teardown(); } }, 15000);
  peer.on('open', id=>{
    NET.me = id; NET.code = code;
    const conn = peer.connect(K.PREFIX+code, {reliable:true, serialization:'json'});
    conn.on('open', ()=>{ opened=true; clearTimeout(timer); NET.host=conn; conn.send({t:'hello', n:name, look:K.LOOK, mob:K.IS_TOUCH?1:0}); K.voice.start(); });
    conn.on('data', K.clientRecv);
    conn.on('close', ()=>{ if(NET.host===conn) K.hostGone(); });
  });
  peer.on('error', err=>{
    if(NET.peer!==peer) return;
    clearTimeout(timer);
    if(err.type==='peer-unavailable') K.menuMsg('ไม่พบห้อง '+code+' เช็ครหัสอีกครั้ง หรือให้เพื่อนสร้างห้องใหม่', true);
    else if(NET.host) return;
    else K.menuMsg('เชื่อมต่อไม่ได้ ('+err.type+')', true);
    K.teardown();
  });
};
K.hostGone = function(){ K.exitGame(); K.teardown(); K.show('#menuCard'); K.menuMsg('หลุดจากห้องแล้ว (โฮสต์ออกหรือเน็ตหลุด รอบนั้นจบ)', true); };
K.teardown = function(){
  K.voice.stop();
  if(NET.peer && !NET.peer.destroyed) NET.peer.destroy();
  NET.peer=null; NET.isHost=false; NET.conns={}; NET.host=null; NET.me=null; K.LOBBY=null;
  K.H.phase='none'; K.H.players={};
};
K.leaveRoom = function(){ K.exitGame(); K.teardown(); K.show('#menuCard'); K.menuMsg(''); };
})(window.K);
