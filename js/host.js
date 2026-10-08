/* host: lobby, ghost rotation and the authoritative game simulation.
   Clients move themselves and report positions; everything that decides the round happens here. */
(function(K){
'use strict';
const {CFG, GHOSTS, clamp, r2} = K;
const H = K.H = {phase:'none', lobby:[], pick:null, gtype:{}, dawn:K.store.get('dawn', CFG.dawn), mode:K.store.get('mode','normal')==='disguise'?'disguise':'normal', joinN:0,
  players:{}, t:0, wake:0, left:0, gk:'krasue', altars:[], candles:[], offers:[], charms:[], bats:[], holy:[], holds:{}};
const isSpect = p => p.s==='dead' || p.s==='escaped';

/* ---------- lobby ---------- */
function order(){
  return H.lobby.slice().sort((a,b)=> (a.i===H.pick?-1:0)-(b.i===H.pick?-1:0) || a.gc-b.gc || a.j-b.j);
}
K.nextGhost = () => { const o = order(); return o.length ? o[0].i : null; };
/* in disguise mode nobody (the host included) is told who the next ghost is: it is drawn at the start */
const hidden = () => H.mode==='disguise';
function lobbyMsg(){
  return {t:'lobby', code:K.NET.code, host:K.NET.me, ghost:hidden()?null:K.nextGhost(), picked:!hidden() && !!H.pick, queue:hidden()?[]:order().map(q=>q.i), dawn:H.dawn, mode:H.mode,
    p:H.lobby.map(q=>({i:q.i, n:q.n, look:q.look, gc:q.gc}))};
}
K.broadcastLobby = function(){
  const m = lobbyMsg();
  K.broadcast(m);
  if(m.ghost) K.sendTo(m.ghost, {t:'gt', k:H.gtype[m.ghost]||'krasue'});
};
K.hostOpen = function(id, name){
  H.lobby = [{i:id, n:name, look:K.LOOK, mob:K.IS_TOUCH?1:0, gc:0, j:H.joinN++}];
  H.pick = null; H.phase = 'lobby';
  K.broadcastLobby();
};
K.hostSetGhost = function(id){ if(!K.NET.isHost || H.phase!=='lobby' || hidden()) return; H.pick = H.pick===id ? null : id; K.broadcastLobby(); };
K.hostSetMode = function(mode){ if(!K.NET.isHost || H.phase!=='lobby') return; H.mode = mode==='disguise' ? 'disguise' : 'normal'; H.pick = null; K.store.set('mode', H.mode); K.broadcastLobby(); };
K.hostSetDawn = function(sec){ if(!K.NET.isHost) return; H.dawn = sec; K.store.set('dawn', sec); if(H.phase==='lobby') K.broadcastLobby(); };
K.hostDrop = function(id){
  if(!K.NET.isHost) return;
  delete K.NET.conns[id]; delete H.holds[id];
  const li = H.lobby.findIndex(p=>p.i===id); if(li<0) return;
  const name = H.lobby[li].n; H.lobby.splice(li,1);
  if(H.pick===id) H.pick=null;
  const p = H.players[id];
  if(p){
    dropOffer(p);
    const wasGhost = p.role==='ghost';
    delete H.players[id];
    K.broadcast({t:'e', k:'leave', n:name});
    if((H.phase==='wake'||H.phase==='play') && wasGhost) hostEnd('ghostleft');
  }
  if(H.phase==='lobby' || H.phase==='end') K.broadcastLobbyQuiet();
};
/* in the results screen keep the list fresh without kicking players out of it */
K.broadcastLobbyQuiet = function(){ if(H.phase==='lobby') K.broadcastLobby(); };

function near(p, x, z, r){ return Math.hypot(p.x-x, p.z-z) <= (r||CFG.reach); }
function dropOffer(p){
  if(p.of==null || p.of<0) return;
  const o = H.offers[p.of]; if(o && !o.placed){ o.by = null; o.x = p.x; o.z = p.z; }
  p.of = -1; p.pl = 0;
}
function gateCheck(){
  if(H.gate) return;
  if(H.candles.every(v=>v>=1) && H.offers.every(o=>o.placed)){ H.gate = true; K.broadcast({t:'e', k:'gate'}); }
}
function survivorsNotGhost(){ return Object.values(H.players).filter(q=>q.role!=='ghost'); }
function sendSurv(m){ for(const q of survivorsNotGhost()) K.sendTo(q.i, m); }

K.hostRecv = function(id, m){
  if(!m || typeof m!=='object') return;
  const p = H.players[id];
  const play = H.phase==='play';
  switch(m.t){
    case 'hello': {
      if(H.phase!=='lobby' && H.phase!=='end'){ K.sendTo(id,{t:'deny', why:'เกมกำลังเล่นอยู่ รอรอบหน้าแล้วเข้าใหม่นะ'}); return; }
      if(H.lobby.length>=CFG.maxPlayers){ K.sendTo(id,{t:'deny', why:'ห้องเต็มแล้ว (สูงสุด '+CFG.maxPlayers+' คน)'}); return; }
      if(H.lobby.some(q=>q.i===id)) return;
      /* newcomers start level with the others in the ghost rotation */
      const minGc = H.lobby.length ? Math.min(...H.lobby.map(q=>q.gc)) : 0;
      H.lobby.push({i:id, n:String(m.n||'ผู้เล่น').slice(0,14), look:K.cleanLook(m.look), mob:m.mob?1:0, gc:minGc, j:H.joinN++});
      /* joining while the others read the results: only the newcomer gets the lobby now, everyone else sees them on "play again" */
      if(H.phase==='lobby') K.broadcastLobby(); else K.sendTo(id, lobbyMsg());
      return;
    }
    case 'look': { const q = H.lobby.find(q=>q.i===id); if(q){ q.look = K.cleanLook(m.look); if(H.phase==='lobby') K.broadcastLobby(); } return; }
    case 'gpick':
      if(H.phase!=='lobby' || !GHOSTS[m.k]) return;
      H.gtype[id] = m.k; K.sendTo(id, {t:'gt', k:m.k}); return;
    case 'sig':
      if(typeof m.to!=='string') return;
      if(m.to===K.NET.me) K.clientRecv({t:'sig', from:id, d:m.d}); else K.sendTo(m.to, {t:'sig', from:id, d:m.d});
      return;
    case 'st':
      if(!p) return;
      p.x=+m.x||0; p.y=+m.y||0; p.z=+m.z||0; p.a=+m.a||0; p.b=+m.b||0; p.f=m.f|0; return;
    case 'hold':
      if(p) H.holds[id] = {k:m.k, i:m.i, last:H.t}; return;
    case 'sc': {
      if(!p || !(play || H.phase==='wake') || p.role!=='surv' || p.s!=='alive') return;
      const i = m.i|0, a = K.ALTAR_SPOTS[H.altars[i]];
      if(!a || H.candles[i]>=1 || !near(p,a[0],a[1],CFG.reach+.5)) return;
      if(m.ok) H.candles[i] = Math.min(.99, H.candles[i]+CFG.scBonus);
      else { H.candles[i] = Math.max(0, H.candles[i]-CFG.scFailLoss); K.broadcast({t:'e', k:'noise', who:id, x:r2(a[0]), z:r2(a[1])}); }
      return;
    }
    case 'pick': {
      if(!p || p.role!=='surv' || p.s!=='alive' || H.phase==='end') return;
      if(m.k==='bat'){
        const b = H.bats[m.i]; const s = K.BAT_SPOTS[m.i];
        if(b==null || b>0 || !near(p,s[0],s[1])) return;
        H.bats[m.i] = H.t+CFG.batRespawn; K.broadcast({t:'e', k:'bat', who:id, i:m.i});
      } else if(m.k==='charm'){
        const c = H.charms[m.i]; if(!c || !c.up || !near(p,c.x,c.z)) return;
        const got = c.k;
        if(p.ch){ c.k = p.ch; } else c.up = false;   // holding one already: swap, the old one stays on the ground
        p.ch = got; K.broadcast({t:'e', k:'charm', who:id, c:got});
      } else if(m.k==='offer'){
        const o = H.offers[m.i]; if(!o || o.placed || o.by || p.of>=0 || !near(p,o.x,o.z)) return;
        o.by = id; p.of = m.i; K.broadcast({t:'e', k:'offer', who:id, i:m.i});
      }
      return;
    }
    case 'use': {
      if(!p || p.role!=='surv' || p.s!=='alive' || !play || !p.ch) return;
      const gh = Object.values(H.players).find(q=>q.role==='ghost');
      const fx = -Math.sin(p.a), fz = -Math.cos(p.a);
      if(p.ch==='salt'){
        p.ch = null;
        let hit = false;
        if(gh){
          const dx = gh.x-p.x, dz = gh.z-p.z, along = dx*fx+dz*fz, perp = Math.abs(dx*fz-dz*fx);
          const gy = Math.min(gh.y, 2.2);
          if(along>-.3 && along<CFG.saltRange && perp<1.1 && K.lineOfSight(p.x,1.4,p.z,gh.x,gy,gh.z)){
            hit = true; p.stat.stun++; gh.stat.stun++;
            if(gh.dis){ unmask(gh, true); K.broadcast({t:'e', k:'morph', who:gh.i, forced:1, by:id}); }   // salt burns the disguise off
            gh.stunUntil = Math.max(gh.stunUntil, H.t+GHOSTS[gh.gk].saltStun);
            gh.lungeUntil = 0; gh.invUntil = 0; gh.atkReady = Math.max(gh.atkReady, gh.stunUntil);
          }
        }
        K.broadcast({t:'e', k:'salt', who:id, x:r2(p.x), z:r2(p.z), a:r2(p.a), hit});
      } else if(p.ch==='holy'){
        p.ch = null;
        const h = {x:r2(p.x+fx*1.3), z:r2(p.z+fz*1.3), a:r2(p.a), until:H.t+CFG.holyTime};
        H.holy.push(h);
        K.broadcast({t:'e', k:'holy', who:id, x:h.x, z:h.z, a:h.a, d:CFG.holyTime});
      }
      return;
    }
    case 'atk':
      if(!p || p.role!=='ghost' || !play || H.t<p.stunUntil) return;
      if(p.dis){   // disguised: the attack button sheds the disguise
        if(p.morphUntil || H.t<p.formReady) return;
        p.morphUntil = H.t+CFG.morphTime; K.broadcast({t:'e', k:'morph', who:id}); return;
      }
      if(H.t<p.atkReady) return;
      p.lungeUntil = H.t+CFG.lungeTime; p.lungeHit=false; p.atkReady = H.t+99; p.invUntil = 0; return;
    case 'skill': {
      if(!p || p.role!=='ghost' || !play || p.dis || H.t<p.skillReady || H.t<p.stunUntil) return;
      const g = GHOSTS[p.gk];
      p.skillUntil = H.t+g.skillTime; p.skillReady = H.t+g.skillTime+g.skillCD;
      if(g.skill==='inv'){ p.invUntil = p.skillUntil; K.broadcast({t:'e', k:'inv', who:id}); }
      else if(g.skill==='smell') K.sendTo(id, {t:'e', k:'smell'});
      else if(g.skill==='wail'){
        const hitIds = [];
        for(const q of Object.values(H.players)) if(q.role==='surv' && (q.s==='alive'||q.s==='down') && Math.hypot(q.x-p.x,q.z-p.z)<g.wailRange){ q.slowUntil = H.t+g.skillTime; hitIds.push(q.i); }
        K.broadcast({t:'e', k:'wail', x:r2(p.x), z:r2(p.z), hit:hitIds});
      }
      return;
    }
    case 'esc':
      if(!p || p.role!=='surv' || p.s!=='alive' || !H.gate || p.z<25.5) return;
      p.s='escaped'; K.broadcast({t:'e', k:'esc', who:id}); return;
    case 'ping':
      if(!p || !(p.role==='surv' || p.dis) || isSpect(p) || H.t<p.pingReady || ![0,1,2].includes(m.k)) return;   // a disguised ghost can cry wolf
      p.pingReady = H.t+CFG.signalCD;
      sendSurv({t:'e', k:'ping', who:id, s:m.k, x:r2(p.x), z:r2(p.z)}); return;
    case 'wisp':
      if(!p || p.role!=='surv' || !isSpect(p) || !play || H.t<p.wispReady) return;
      p.wispReady = H.t+CFG.wispCD;
      sendSurv({t:'e', k:'wisp', who:id, x:r2(+m.x||0), y:r2(+m.y||0), z:r2(+m.z||0)}); return;
  }
};

/* spread picks: prefer spots far apart so one corner never holds every task */
function spread(pool, n, minD){
  const idx = K.shuffle(pool.map((_,i)=>i)), out = [];
  for(const i of idx){ if(out.length>=n) break; if(out.every(j=>Math.hypot(pool[i][0]-pool[j][0], pool[i][1]-pool[j][1])>=minD)) out.push(i); }
  for(const i of idx){ if(out.length>=n) break; if(!out.includes(i)) out.push(i); }
  return out;
}
K.hostStart = function(){
  if(!K.NET.isHost || H.phase!=='lobby') return;
  if(H.lobby.length<2 && !K.DEBUG) return;
  const dis = H.mode==='disguise';
  let ghost = K.nextGhost();
  if(dis){ const low = Math.min(...H.lobby.map(q=>q.gc)); ghost = K.pick(H.lobby.filter(q=>q.gc===low)).i; }
  const gk = GHOSTS[H.gtype[ghost]] ? H.gtype[ghost] : 'krasue';
  const gq = H.lobby.find(q=>q.i===ghost); if(gq) gq.gc++;
  H.pick = null;
  H.players = {}; H.holds = {}; H.holy = [];
  H.t = 0; H.wake = CFG.wake; H.left = H.dawn; H.phase = 'wake'; H.gate = false; H.gk = gk;
  H.altars = spread(K.ALTAR_SPOTS, CFG.candles, 10);
  H.candles = H.altars.map(()=>0);
  const offerKinds = ['garland','incense'];
  H.offers = spread(K.OFFER_SPOTS, CFG.offerings, 12).map((s,i)=>({k:offerKinds[i%2], x:K.OFFER_SPOTS[s][0], z:K.OFFER_SPOTS[s][1], by:null, placed:false}));
  const kinds = K.shuffle(['takrut','salt','holy','takrut','salt','holy']);
  H.charms = spread(K.CHARM_SPOTS, CFG.charms, 7).map((s,i)=>({k:kinds[i%kinds.length], x:K.CHARM_SPOTS[s][0], z:K.CHARM_SPOTS[s][1], up:true}));
  H.bats = K.BAT_SPOTS.map(()=>0);
  // in disguise mode the ghost lines up at the gate with everyone else, in a random place in the row
  let k = 0; const row = K.shuffle(H.lobby.filter(q=>dis || q.i!==ghost).map(q=>q.i)), nRow = row.length;
  const list = H.lobby.map(q=>{
    const role = q.i===ghost ? 'ghost' : 'surv', inRow = row.includes(q.i);
    const x = inRow ? (row.indexOf(q.i) - (nRow-1)/2)*1.3 : 0;
    const z = inRow ? 21.2 : -3.6, a = inRow ? 0 : Math.PI;
    H.players[q.i] = {i:q.i, n:q.n, role, gk:role==='ghost'?gk:null, mob:q.mob, x, y:role==='ghost'&&!dis?GHOSTS[gk].eye:0, z, a, b:0, f:1,
      dis: role==='ghost' && dis, morphUntil:0, formUntil:0, formReady: CFG.wake+CFG.formFirst,
      h:2, s:'alive', bl:0, rv:0, fn:0, ch:null, of:-1, pl:0, slowUntil:0, pingReady:0, wispReady:0,
      stunAcc:0, stunUntil:0, immUntil:0, invUntil:0, skillUntil:0, skillReady:0, atkReady:0, lungeUntil:0, lungeHit:false,
      stat:{c:0, o:0, rv:0, stun:0, hit:0, down:0, kill:0}};   // for the results screen
    return {i:q.i, n:q.n, look:q.look, x, z, a};
  });
  K.broadcast({t:'start', ghost, gk, mode:H.mode, dawn:H.dawn, altars:H.altars, offers:H.offers.map(o=>({k:o.k,x:o.x,z:o.z})), charms:H.charms.map(c=>({k:c.k,x:c.x,z:c.z})), p:list});
};

function hostTick(dt){
  if(H.phase!=='wake' && H.phase!=='play') return;
  H.t += dt;
  const all = Object.values(H.players);
  const gh = all.find(p=>p.role==='ghost');
  const surv = all.filter(p=>p.role==='surv');
  if(H.phase==='wake'){ H.wake -= dt; if(H.wake<=0){ H.phase='play'; K.broadcast({t:'e', k:'wake'}); } }
  H.left -= dt;
  if(H.left<=0){
    for(const q of surv) if(q.s==='alive' || q.s==='down'){ dropOffer(q); q.s='dead'; K.broadcast({t:'e', k:'dead', who:q.i, how:'dawn'}); }
    hostEnd('dawn'); return;
  }
  /* survivors may already work on tasks during the ghost's 15 s head start */
  {
    for(const id in H.holds){
      const h = H.holds[id], p = H.players[id];
      if(!p || H.t-h.last>.3){ delete H.holds[id]; if(p) p.pl = 0; continue; }
      if(h.k==='candle'){
        const a = K.ALTAR_SPOTS[H.altars[h.i]];
        if(!a || p.role!=='surv' || p.s!=='alive' || H.candles[h.i]>=1 || !near(p,a[0],a[1],CFG.reach+.3)) continue;
        H.candles[h.i] = Math.min(1, H.candles[h.i]+dt/CFG.candleTime); p.stat.c += dt/CFG.candleTime;
        if(H.candles[h.i]>=1){
          const n = H.candles.filter(v=>v>=1).length;
          K.broadcast({t:'e', k:'lit', i:h.i, n});
          gateCheck();
        }
      } else if(h.k==='place'){
        if(p.role!=='surv' || p.s!=='alive' || p.of<0 || !near(p,K.SHRINE.x,K.SHRINE.z,CFG.reach+.4)) continue;
        p.pl += dt/CFG.placeTime;
        if(p.pl>=1){
          const o = H.offers[p.of]; o.placed = true; o.by = null; p.of = -1; p.pl = 0; p.stat.o++;
          K.broadcast({t:'e', k:'placed', who:id, n:H.offers.filter(o=>o.placed).length});
          gateCheck();
        }
      } else if(h.k==='revive'){
        const q = H.players[h.i];
        if(!q || q===p || p.role!=='surv' || p.s!=='alive' || q.s!=='down' || !near(p,q.x,q.z)) continue;
        q.rv += dt/CFG.reviveTime;
        if(q.rv>=1){ q.s='alive'; q.h=1; q.rv=0; q.fn=0; p.stat.rv++; K.broadcast({t:'e', k:'revive', who:q.i, by:id}); }
      } else if(h.k==='finish'){
        const q = H.players[h.i];
        if(!q || p.role!=='ghost' || p.dis || H.t<p.stunUntil || q.s!=='down' || !near(p,q.x,q.z,CFG.reach+.4)) continue;
        q.fn += dt/CFG.finishTime; q.finishing = H.t;
        if(q.fn>=1){ p.stat.kill++; q.s='dead'; K.broadcast({t:'e', k:'dead', who:q.i, how:'finish'}); }
      }
    }
  }
  if(H.phase==='play'){
    for(const q of surv) if(q.s==='down'){
      if(H.t-(q.finishing||0)>.3) q.fn = Math.max(0, q.fn-dt*.5);
      q.bl -= dt;
      if(q.bl<=0){ q.s='dead'; K.broadcast({t:'e', k:'dead', who:q.i, how:'bleed'}); }
    }
    for(const q of surv) if(q.of>=0 && q.s!=='alive') dropOffer(q);
    if(gh && H.mode==='disguise'){
      if(gh.dis && gh.morphUntil && H.t>=gh.morphUntil) unmask(gh, false);
      else if(gh.dis && (H.gate && !gh.morphUntil)) { unmask(gh, false); K.broadcast({t:'e', k:'morph', who:gh.i, forced:2}); }
      else if(!gh.dis && gh.formUntil && H.t>=gh.formUntil && H.t>=gh.lungeUntil && H.t>=gh.stunUntil){
        gh.dis = true; gh.formUntil = 0; gh.formReady = H.t+CFG.formCD; gh.invUntil = 0; gh.skillUntil = Math.min(gh.skillUntil, H.t);
        K.broadcast({t:'e', k:'unmorph', who:gh.i});
      }
    }
    if(gh){
      const G_ = GHOSTS[gh.gk];
      if(gh.lungeUntil && !gh.lungeHit){
        if(H.t<gh.lungeUntil){
          // test the whole path covered since the last tick, so a lunge that passes between updates still lands
          const sx = gh.sx==null?gh.x:gh.sx, sz = gh.sz==null?gh.z:gh.sz, ex = gh.x-sx, ez = gh.z-sz, el = ex*ex+ez*ez;
          const fx = -Math.sin(gh.a), fz = -Math.cos(gh.a);
          const range = CFG.hitRange + (gh.gk==='pret' ? .25 : 0);
          for(const q of surv){
            if(q.s!=='alive') continue;
            const u = el>1e-6 ? clamp(((q.x-sx)*ex+(q.z-sz)*ez)/el,0,1) : 1;
            const dx=q.x-(sx+ex*u), dz=q.z-(sz+ez*u), d=Math.hypot(dx,dz);
            if(d<range && (d<.8 || (dx*fx+dz*fz)/d>.2)){
              gh.lungeHit = true; gh.lungeUntil = 0; gh.atkReady = H.t+CFG.hitCD;
              if(q.ch==='takrut'){ q.ch = null; K.broadcast({t:'e', k:'block', who:q.i}); break; }
              q.h -= G_.hits===1 ? 2 : 1; q.stat.hit++; gh.stat.hit++; if(q.h<=0) gh.stat.down++;
              if(q.h<=0){ q.h=0; q.s='down'; q.bl=CFG.bleed; q.rv=0; q.fn=0; dropOffer(q); K.broadcast({t:'e', k:'down', who:q.i, gk:gh.gk}); }
              else K.broadcast({t:'e', k:'hit', who:q.i, gk:gh.gk});
              break;
            }
          }
        } else { gh.lungeUntil = 0; gh.atkReady = H.t+CFG.missCD; }
      }
      gh.sx = gh.x; gh.sz = gh.z;
      // flashlight stun
      if(H.t>=gh.stunUntil && !gh.dis){
        let lit = false;
        const gy = gh.y - (gh.gk==='krasue' ? .1 : .3);
        for(const q of surv){
          if(q.s!=='alive' || !(q.f&1)) continue;
          const ey = 1.5, dx=gh.x-q.x, dy=gy-ey, dz=gh.z-q.z, d=Math.hypot(dx,dy,dz);
          if(d>CFG.stunRange || d<.01) continue;
          const cb = Math.cos(q.b), lx=-Math.sin(q.a)*cb, ly=Math.sin(q.b), lz=-Math.cos(q.a)*cb;
          if((dx*lx+dy*ly+dz*lz)/d < (q.mob ? CFG.stunConeMob : CFG.stunCone)) continue;
          if(!K.lineOfSight(q.x,ey,q.z,gh.x,gy,gh.z)) continue;
          lit = true; gh.litBy = q.i; break;
        }
        gh.stunAcc = lit ? gh.stunAcc+dt : Math.max(0, gh.stunAcc-dt*.6);
        if(gh.stunAcc>=G_.stunNeed && H.t>=gh.immUntil){
          gh.stunUntil = H.t+CFG.stunTime; gh.immUntil = gh.stunUntil+CFG.stunImmune;
          gh.stat.stun++; if(H.players[gh.litBy]) H.players[gh.litBy].stat.stun++;
          gh.stunAcc = 0; gh.invUntil = 0; gh.lungeUntil = 0; gh.atkReady = Math.max(gh.atkReady, gh.stunUntil);
          K.broadcast({t:'e', k:'stun'});
        }
      }
    }
    for(let i=0;i<H.bats.length;i++) if(H.bats[i]>0 && H.t>=H.bats[i]) H.bats[i]=0;
    H.holy = H.holy.filter(h=>h.until>H.t);
    // nobody left standing to revive the downed: the round is over
    if(!surv.some(q=>q.s==='alive')){
      for(const q of surv) if(q.s==='down') q.s='dead';
      hostEnd('done'); return;
    }
    if(!gh && !(K.DEBUG && all.length===1)){ hostEnd('ghostleft'); return; }
  }
  K.broadcast(snapshot());
}
K.hostTick = hostTick;
function snapshot(){
  const p = [];
  for(const id in H.players){
    const q = H.players[id];
    let f = q.f & 0x247;   // 1 light, 2 run, 4 move, 64 holding, 512 crouched
    if(q.dis) f|=1024;     // disguised as a person
    if(q.morphUntil) f|=2048;
    if(H.t<q.invUntil) f|=8;
    if(H.t<q.stunUntil) f|=16;
    if(H.t<q.lungeUntil) f|=32;
    if(H.t<q.slowUntil) f|=128;
    if(q.role==='ghost' && H.t<q.skillUntil) f|=256;
    const o = {i:q.i, x:r2(q.x), y:r2(q.y), z:r2(q.z), a:r2(q.a), b:r2(q.b), f, h:q.h, s:q.s};
    if(q.role==='surv'){ o.ch = q.ch||''; o.of = q.of; if(q.pl>0) o.pl = r2(q.pl); }
    if(q.s==='down'){ o.bl=Math.ceil(q.bl); o.rv=r2(q.rv); o.fn=r2(q.fn); }
    if(q.role==='ghost' && H.mode==='disguise'){ o.fr=r2(Math.max(0,q.formReady-H.t)); o.fu=q.formUntil?r2(Math.max(0,q.formUntil-H.t)):0; }
    if(q.role==='ghost'){ o.cd=r2(Math.max(0,q.atkReady-H.t)); o.sq=r2(Math.max(0,q.skillReady-H.t)); o.sa=r2(Math.min(1,q.stunAcc/GHOSTS[q.gk].stunNeed)); }
    p.push(o);
  }
  return {t:'s', ph:H.phase, wk:Math.ceil(H.wake), lf:Math.ceil(H.left), c:H.candles.map(r2), g:H.gate?1:0, b:H.bats.map(v=>v>0?0:1),
    o:H.offers.map(o=>[r2(o.x), r2(o.z), o.by||'', o.placed?1:0]),
    ch:H.charms.map(c=>[c.x, c.z, c.k, c.up?1:0]), p};
}
/* the disguise comes off: after the morph, or burnt off by salt (then it stands there stunned, plainly a ghost) */
function unmask(gh, salt){
  gh.dis = false; gh.morphUntil = 0;
  gh.formUntil = H.gate ? 0 : H.t + CFG.huntTime + (salt ? GHOSTS[gh.gk].saltStun : 0);
  gh.atkReady = Math.max(gh.atkReady, H.t+.4); gh.stunAcc = 0;
}
function hostEnd(why){
  H.phase = 'end'; H.holds = {};
  K.broadcast(snapshot());
  K.broadcast({t:'end', why, gk:H.gk, r:Object.values(H.players).map(q=>({i:q.i, n:q.n, role:q.role, s:q.s, st:{c:r2(q.stat.c), o:q.stat.o, rv:q.stat.rv, stun:q.stat.stun, hit:q.stat.hit, down:q.stat.down, kill:q.stat.kill}}))});
}
K.hostAgain = function(){ if(!K.NET.isHost) return; H.phase='lobby'; H.players={}; K.broadcastLobby(); };

/* the host simulates on a worker timer: page timers get throttled when the host alt-tabs (e.g. to Discord), worker timers don't */
let hostAcc = 0, hostLast = performance.now();
function hostPulse(){
  const now = performance.now(), dt = Math.min(.25,(now-hostLast)/1000); hostLast = now;
  if(K.NET.isHost && !K.G.manual){ hostAcc += dt; while(hostAcc>=CFG.net){ hostAcc-=CFG.net; hostTick(CFG.net); } }
}
try{
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},50)'],{type:'text/javascript'})));
  w.onmessage = hostPulse;
}catch(e){ setInterval(hostPulse,50); }
})(window.K);
