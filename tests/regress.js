/* Regression suite for กระสือวัดร้าง.
   Plays real rooms in several tabs of one headless browser over the ?local=1 transport
   (BroadcastChannel, no internet) and checks what the host and every client end up with.
   The game itself is never put in ?debug: tests read and poke the shared window.K from outside.

   Run:  python -m http.server 8002   (in the repo root)   then   node tests/regress.js [case ...]
   Needs the `playwright` npm package. KRASUE_URL changes the address; KRASUE_LIBS points at local
   copies of three.min.js / peerjs.min.js when the CDNs can't be reached (see tests/README.md). */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL0 = (process.env.KRASUE_URL || 'http://localhost:8002/').replace(/\/?$/, '/');
const LIBS = process.env.KRASUE_LIBS;

let browser;
async function newCtx(opts = {}){
  const ctx = await browser.newContext(Object.assign({viewport:{width:480,height:270}}, opts));
  await ctx.grantPermissions(['microphone'], {origin: new URL(URL0).origin});
  if(LIBS){
    await ctx.route(/three\.min\.js/, r=>r.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(LIBS,'three.min.js'),'utf8')}));
    await ctx.route(/peerjs\.min\.js/, r=>r.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(LIBS,'peerjs.min.js'),'utf8')}));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.abort());
  }
  ctx.errors = [];
  return ctx;
}
async function open(ctx, q, tag){
  const p = await ctx.newPage();
  p.tag = tag;
  p.on('pageerror', e=>ctx.errors.push(`[${tag}] ${e.message}`));
  p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) ctx.errors.push(`[${tag} console] ${m.text()}`); });
  await p.goto(URL0 + 'index.html?local=1&quality=low' + (q ? '&'+q : ''));
  await p.waitForFunction(()=>window.K && K.renderer && document.querySelector('#hostBtn'));
  return p;
}
const sleep = ms => new Promise(r=>setTimeout(r, ms));
async function until(p, fn, arg, ms = 8000, what = 'condition'){
  try{ await p.waitForFunction(fn, arg, {timeout: ms, polling: 100}); }
  catch(e){ throw new Error(`timed out waiting for ${what} on ${p.tag}`); }
}
/* host a room with code CODE, then n-1 joiners; returns [host, ...clients] */
async function room(ctx, code, n, hostQ = ''){
  const h = await open(ctx, 'code='+code+(hostQ?'&'+hostQ:''), 'host');
  await h.click('#hostBtn');
  await until(h, ()=>K.H.phase==='lobby', null, 8000, 'lobby');
  const ps = [h];
  for(let i=1;i<n;i++){
    const c = await open(ctx, 'room='+code, 'c'+i);
    await c.click('#joinBtn');
    ps.push(c);
    await until(h, k=>K.H.lobby.length===k, i+1, 8000, `${i+1} in lobby`);
  }
  for(const p of ps){
    try{ await until(p, k=>K.LOBBY && K.LOBBY.p.length===k, n, 8000, 'lobby list'); }
    catch(e){ throw new Error(e.message+' '+await p.evaluate(()=>JSON.stringify({lobby:K.LOBBY && K.LOBBY.p.length, me:K.NET.me, peer:!!K.NET.peer, host:!!K.NET.host, msg:document.querySelector('#menuMsg').textContent, card:[...document.querySelectorAll('.card')].filter(c=>!c.hidden).map(c=>c.id)}))); }
  }
  return ps;
}
async function start(ps){
  await ps[0].evaluate(()=>K.hostStart());
  for(const p of ps) await until(p, ()=>K.G.inGame, null, 8000, 'round start');
  for(const p of ps) await p.evaluate(()=>{ K.L.menu=false; K.show(null); });
}
const me = p => p.evaluate(()=>K.NET.me);
const H = (p, f, a) => p.evaluate(f, a);          // run on the host page
/* place a player both where its own client thinks it is and where the host has it */
async function place(h, p, x, z, a = 0){
  await p.evaluate(([x,z,a])=>{ K.L.pos.x=x; K.L.pos.z=z; K.L.yaw=a; }, [x,z,a]);
  const id = await me(p);
  await h.evaluate(([id,x,z,a])=>{ const q=K.H.players[id]; q.x=x; q.z=z; q.a=a; }, [id,x,z,a]);
}
async function skipWake(h){ await h.evaluate(()=>{ K.H.wake = .05; }); await until(h, ()=>K.H.phase==='play', null, 4000, 'play phase'); }
/* a client keeps sending a hold (what holding E does) for ms */
async function hold(p, k, i, ms){
  await p.evaluate(([k,i,ms])=>new Promise(res=>{ const t0=performance.now(); const iv=setInterval(()=>{ K.sendHost({t:'hold',k,i}); if(performance.now()-t0>ms){ clearInterval(iv); res(); } }, 100); }), [k,i,ms]);
}
function check(cond, msg){ if(!cond) throw new Error(msg); }
const roles = async ps => { const out = {}; for(const p of ps){ out[await me(p)] = p; } return out; };
async function ghostAndSurv(ps){
  const gid = await ps[0].evaluate(()=>Object.values(K.H.players).find(q=>q.role==='ghost').i);
  const by = await roles(ps);
  return {g: by[gid], gid, surv: ps.filter(p=>p!==by[gid])};
}

/* ---------------------------------------------------------------- cases */
const CASES = {};
const T = (id, name, fn) => { CASES[id] = {name, fn}; };

T('room2', 'ห้องปกติ 2 คน: สร้าง เข้า เริ่ม และ sync การเดิน', async ctx=>{
  const ps = await room(ctx, 'RA02', 2);
  const [h, c] = ps;
  await start(ps);
  const st = await Promise.all(ps.map(p=>p.evaluate(()=>[K.G.role, Object.keys(K.P).length])));
  check(st.map(s=>s[0]).sort().join()==='ghost,surv', 'roles '+JSON.stringify(st));
  check(st.every(s=>s[1]===2), 'views '+JSON.stringify(st));
  await skipWake(h);
  const cid = await me(c);
  const before = await c.evaluate(()=>[K.L.pos.x, K.L.pos.z]);
  await c.evaluate(()=>{ K.L.yaw = 1.0; K.keys.KeyW = true; });
  await sleep(1200);
  await c.evaluate(()=>{ K.keys.KeyW = false; });
  await sleep(600);
  const [cx, cz, cyaw] = await c.evaluate(()=>[K.L.pos.x, K.L.pos.z, K.L.yaw]);
  check(Math.hypot(cx-before[0], cz-before[1]) > 1, 'client did not move');
  const hp = await h.evaluate(id=>{ const q=K.H.players[id], v=K.P[id]; return [q.x, q.z, q.a, v.pos.x, v.pos.z]; }, cid);
  check(Math.hypot(hp[0]-cx, hp[1]-cz) < .3, 'host position off '+JSON.stringify([hp, cx, cz]));
  check(Math.abs(Math.atan2(Math.sin(hp[2]-cyaw), Math.cos(hp[2]-cyaw))) < .05, 'host yaw off');
  check(Math.hypot(hp[3]-cx, hp[4]-cz) < .5, 'host view of client off');
  return `ย้าย ${Math.hypot(cx-before[0], cz-before[1]).toFixed(1)} ม. โฮสต์เห็นตรงกัน`;
});

T('room6', 'ห้องปกติ 6 คน เริ่มเกมได้ ผี 1 คน', async ctx=>{
  const ps = await room(ctx, 'RA06', 6);
  await start(ps);
  const st = await Promise.all(ps.map(p=>p.evaluate(()=>[K.G.role, Object.keys(K.P).length, K.ghostView() && K.ghostView().id])));
  check(st.filter(s=>s[0]==='ghost').length===1, 'ghosts '+JSON.stringify(st));
  check(st.every(s=>s[1]===6), 'views '+JSON.stringify(st));
  check(new Set(st.map(s=>s[2])).size===1, 'clients disagree on the ghost');
  return 'ทุกแท็บเห็น 6 คน ผีตรงกัน';
});

T('room7', 'คนที่ 7 เข้าไม่ได้ ห้องยังเหลือ 6', async ctx=>{
  const ps = await room(ctx, 'RA07', 6);
  const x = await open(ctx, 'room=RA07', 'c7');
  await x.click('#joinBtn');
  await until(x, ()=>!document.querySelector('#menuCard').hidden && /เต็ม/.test(document.querySelector('#menuMsg') ? document.querySelector('#menuMsg').textContent : document.body.innerText), null, 8000, 'room full message');
  await sleep(1500);
  const n = await ps[0].evaluate(()=>[K.H.lobby.length, Object.keys(K.NET.conns).length]);
  check(n[0]===6, 'lobby '+n[0]);
  check(n[1]===5, 'host still holds the refused connection: conns='+n[1]);
  return 'ขึ้นว่าห้องเต็ม ห้องยังมี 6 คน';
});

T('escape', 'คนหนีจุดเทียน วางของไหว้ ประตูเปิด หนีรอด', async ctx=>{
  const ps = await room(ctx, 'RESC', 3);
  const [h] = ps;
  await start(ps);
  const {g, surv} = await ghostAndSurv(ps);
  await place(h, g, 0, -15, 0); await g.evaluate(()=>{ K.H && 0; });
  const alt = await H(h, ()=>K.H.altars.map(i=>K.ALTAR_SPOTS[i]));
  for(let k=0;k<4;k+=2){
    await Promise.all(surv.map(async (p,j)=>{ const a = alt[k+j]; await place(h, p, a[0]+.8, a[1]); await sleep(300); await hold(p, 'candle', k+j, 7600); }));
  }
  const lit = await H(h, ()=>K.H.candles.slice());
  check(lit.every(v=>v>=1), 'candles '+JSON.stringify(lit));
  const offers = await H(h, ()=>K.H.offers.map(o=>[o.x,o.z]));
  const sh = await H(h, ()=>[K.SHRINE.x, K.SHRINE.z]);
  for(let i=0;i<2;i++){
    const p = surv[i];
    await place(h, p, offers[i][0], offers[i][1]+.6); await sleep(300);
    await p.evaluate(i=>K.sendHost({t:'pick', k:'offer', i}), i);
    await until(h, ([id,i])=>K.H.players[id].of===i, [await me(p), i], 3000, 'offer picked');
    await place(h, p, sh[0], sh[1]+1.4); await sleep(300);
    await hold(p, 'place', 0, 2600);
  }
  await until(h, ()=>K.H.gate, null, 3000, 'gate open');
  for(const p of surv) await until(p, ()=>K.G.gate && K.GATE.open, null, 3000, 'gate on client');
  for(const p of surv){ await place(h, p, 0, 26.5); await sleep(250); await p.evaluate(()=>K.sendHost({t:'esc'})); }
  for(const p of ps) await until(p, ()=>K.G.ph==='end' && !document.querySelector('#endCard').hidden, null, 6000, 'end card');
  const titles = await Promise.all(ps.map(p=>p.evaluate(()=>[K.G.role, document.querySelector('#endTitle').textContent])));
  check(titles.filter(t=>t[0]==='surv').every(t=>t[1]==='รอดมาได้'), JSON.stringify(titles));
  return titles.map(t=>t[1]).join(' / ');
});

T('allcaught', 'ผีจับได้หมด เกมจบ', async ctx=>{
  const ps = await room(ctx, 'RCAT', 3);
  const [h] = ps; await start(ps); await skipWake(h);
  const {g, gid, surv} = await ghostAndSurv(ps);
  for(const p of surv){
    const sid = await me(p);
    await H(h, ([gid,sid])=>{ const g=K.H.players[gid], s=K.H.players[sid]; s.h=1; s.ch=null; g.atkReady=0; g.stunUntil=0; }, [gid, sid]);
    await place(h, p, 0, 5); await place(h, g, 0, 6.6, 0); await sleep(400);
    await g.evaluate(()=>K.ghostAttack());   // the real lunge, from the ghost's own client
    await until(h, sid=>K.H.players[sid].s!=='alive' || K.H.phase==='end', sid, 3000, 'downed');
    await sleep(2800);   // hit cooldown
  }
  for(const p of ps) await until(p, ()=>K.G.ph==='end' && !document.querySelector('#endCard').hidden, null, 6000, 'end card');
  const t = await Promise.all(ps.map(p=>p.evaluate(()=>document.querySelector('#endTitle').textContent)));
  check(t.filter(x=>x==='ไม่มีใครรอด').length===2, JSON.stringify(t));
  return t.join(' / ');
});

T('dawn', 'ฟ้าสางก่อนหนี ผีชนะ', async ctx=>{
  const ps = await room(ctx, 'RDWN', 2);
  const [h] = ps; await start(ps);
  await H(h, ()=>{ K.H.left = .3; });
  for(const p of ps) await until(p, ()=>K.G.ph==='end' && !document.querySelector('#endCard').hidden, null, 5000, 'end card');
  const t = await Promise.all(ps.map(p=>p.evaluate(()=>document.querySelector('#endSub').textContent)));
  check(t.every(x=>x==='ฟ้าสางแล้ว'), JSON.stringify(t));
  return 'ทุกแท็บขึ้น ฟ้าสางแล้ว';
});

T('revive', 'ล้มแล้วเพื่อนช่วยลุก', async ctx=>{
  const ps = await room(ctx, 'RREV', 3);
  const [h] = ps; await start(ps); await skipWake(h);
  const {surv} = await ghostAndSurv(ps);
  const [a, b] = surv, aid = await me(a);
  await place(h, a, 0, 5); await place(h, b, .8, 5);
  await H(h, id=>{ const q=K.H.players[id]; q.h=0; q.s='down'; q.bl=K.CFG.bleed; q.rv=0; }, aid);
  await until(a, ()=>K.P[K.NET.me].s==='down', null, 3000, 'down on own client');
  await hold(b, 'revive', aid, 4600);
  await until(h, id=>K.H.players[id].s==='alive', aid, 2000, 'revived');
  await until(a, ()=>K.P[K.NET.me].s==='alive', null, 3000, 'alive on own client');
  return 'ลุกขึ้นมาพร้อมเลือด '+await H(h, id=>K.H.players[id].h, aid);
});

T('spirit', 'เลือดหมดกลายเป็นวิญญาณ เกมยังเล่นต่อ', async ctx=>{
  const ps = await room(ctx, 'RSPR', 3);
  const [h] = ps; await start(ps); await skipWake(h);
  const {surv} = await ghostAndSurv(ps);
  const aid = await me(surv[0]);
  await H(h, id=>{ const q=K.H.players[id]; q.h=0; q.s='down'; q.bl=.3; }, aid);
  await until(surv[0], ()=>K.P[K.NET.me].s==='dead' && document.body.classList.contains('role-spect'), null, 4000, 'spirit on client');
  await sleep(500);
  check(await H(h, ()=>K.H.phase)==='play', 'round ended early');
  check(await surv[1].evaluate(id=>K.P[id] && K.P[id].s, aid)==='dead', 'friend does not see the spirit');
  return 'กลายเป็นวิญญาณ รอบยังเดินต่อ';
});

async function ghostRoom(ctx, code, gk, n = 2){
  const ps = await room(ctx, code, n);
  const [h] = ps;
  const gid = await H(h, ()=>K.nextGhost());
  const by = await roles(ps);
  await by[gid].evaluate(k=>{ K.G.myGt=k; K.sendHost({t:'gpick', k}); }, gk);
  await until(h, ([id,k])=>K.H.gtype[id]===k, [gid, gk], 3000, 'ghost pick');
  await start(ps); await skipWake(h);
  return {ps, h, g: by[gid], gid, surv: ps.filter(p=>p!==by[gid])};
}
T('krasue', 'กระสือ: บิน หายตัว', async ctx=>{
  const {h, g, gid, surv} = await ghostRoom(ctx, 'RKRS', 'krasue');
  check(await H(h, ()=>K.GHOSTS[K.H.gk].fly)===true, 'not a flyer');
  await g.evaluate(()=>K.ghostSkill());
  await until(h, id=>K.H.players[id].invUntil>K.H.t, gid, 2000, 'invisible on host');
  await until(surv[0], id=>K.P[id] && (K.P[id].flags&8), gid, 2000, 'invisible flag on survivor');
  return 'หายตัวแล้ว คนหนีเห็น flag หายตัว';
});
T('pop', 'ปอบ: ดมกลิ่น ตะครุบทีเดียวล้ม', async ctx=>{
  const {h, g, gid, surv} = await ghostRoom(ctx, 'RPOP', 'pop');
  await g.evaluate(()=>K.ghostSkill());
  await until(g, ()=>/ได้กลิ่นคน/.test(document.querySelector('#toast').textContent), null, 2000, 'smell reaching the ghost');
  check(!/ได้กลิ่นคน/.test(await surv[0].evaluate(()=>document.querySelector('#toast').textContent)), 'survivor got the smell');
  const sid = await me(surv[0]);
  await place(h, surv[0], 0, 5); await place(h, g, 0, 6.6, 0); await sleep(400);
  await g.evaluate(()=>K.ghostAttack());
  await until(h, sid=>K.H.players[sid].s==='down' || K.H.phase==='end', sid, 3000, 'one-hit down');
  return 'ดมกลิ่นได้ ตะครุบครั้งเดียวล้ม';
});
T('pret', 'เปรต: กรีดร้อง ช้าลง และเข้าโบสถ์ไม่ได้', async ctx=>{
  const {h, g, gid, surv} = await ghostRoom(ctx, 'RPRT', 'pret');
  const sid = await me(surv[0]);
  await place(h, g, 0, 0); await place(h, surv[0], 3, 0); await sleep(300);
  await g.evaluate(()=>K.ghostSkill());
  await until(h, sid=>K.H.players[sid].slowUntil>K.H.t, sid, 2000, 'slowed');
  await until(surv[0], ()=>K.P[K.NET.me].flags&128, null, 2000, 'slowed flag');
  // walk the pret at the hall's north door from outside
  await g.evaluate(()=>{ K.L.pos.set(0,0,-3.6); K.L.yaw=0; K.keys.KeyW=true; });
  await sleep(2500);
  const z = await g.evaluate(()=>{ K.keys.KeyW=false; return K.L.pos.z; });
  check(z > -6.3, 'pret got into the hall: z='+z.toFixed(2));
  return 'กรีดร้องแล้วคนหนีช้าลง เดินชนประตูโบสถ์หยุดที่ z='+z.toFixed(2);
});

T('disguise_secret', 'โหมดปลอมตัว: ไม่เผยตัวผี', async ctx=>{
  const ps = await room(ctx, 'RDIS', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  for(const p of ps) await until(p, ()=>K.LOBBY.mode==='disguise', null, 3000, 'mode');
  const lob = await Promise.all(ps.map(p=>p.evaluate(()=>[K.LOBBY.ghost, K.LOBBY.queue.length])));
  check(lob.every(l=>l[0]==null && l[1]===0), 'lobby leaks '+JSON.stringify(lob));
  await start(ps); await skipWake(h); await sleep(1500);
  const {g, gid, surv} = await ghostAndSurv(ps);
  const out = [];
  for(const p of surv){
    const r = await p.evaluate(gid=>{
      const v = K.P[gid];
      return {role: K.G.role, label: v && v.label && v.label.visible, ghostModel: !!(v && v.model && v.model.kind && v.model.g.visible), roleText: document.querySelector('#roleTitle').textContent};
    }, gid);
    out.push(r);
    check(r.role==='surv', 'role');
    check(r.roleText==='ใครคือผี?', 'role card '+r.roleText);
    check(!r.ghostModel, 'ghost model visible to a survivor while disguised');
  }
  return 'ห้องรอ การ์ดบทบาท และโมเดลไม่เผยตัว';
});

/* record every message this page is sent from now on, raw, before the game reads it.
   Joiners: listen on the ?local=1 BroadcastChannel for frames addressed to them. The host delivers to itself by calling K.clientRecv. */
async function tap(p){
  await p.evaluate(()=>{
    window.__rx = [];
    if(K.NET.isHost){ if(!K.__tapped){ K.__tapped = true; const o = K.clientRecv; K.clientRecv = m=>{ window.__rx.push(JSON.parse(JSON.stringify(m))); return o(m); }; } return; }
    const bc = new BroadcastChannel('krasue-local');
    bc.onmessage = ev=>{ const m = ev.data; if(m.k==='d' && m.to===K.NET.me) window.__rx.push(m.m); };
  });
}
const rx = p => p.evaluate(()=>window.__rx.splice(0));
/* anything in what a survivor was sent that names the disguised ghost */
function leaks(msgs, gid){
  const out = [];
  for(const m of msgs){
    const j = JSON.stringify(m);
    if(j.includes('"ghost":"'+gid+'"')) out.push(m.t+' names the ghost');
    if(j.includes('"role"') && m.t!=='end') out.push(m.t+' carries roles');
    if(m.t==='s'){
      const e = m.p.find(e=>e.i===gid), o = m.p.find(e=>e.i!==gid && e.s==='alive' && !('pl' in e));
      if(!e) continue;
      if(e.f & (8|16|32|128|256|1024|2048)) out.push('snapshot flags '+e.f);
      for(const k of ['fr','fu','cd','sq','sa']) if(k in e) out.push('snapshot field '+k);
      if(e.y!==0) out.push('snapshot height '+e.y);
      if(o && Object.keys(e).sort().join()!==Object.keys(o).sort().join()) out.push('snapshot shape '+Object.keys(e).join());
    }
    if(m.t==='e' && (m.eye || ['morph','unmorph','inv','smell','stun'].includes(m.k))) out.push('event '+m.k);
    if(m.t==='gt') out.push('ghost-type message');
  }
  return [...new Set(out)];
}
/* what a survivor's page holds about the ghost (anyone can read it from the console) */
const pageLeaks = (p, gid) => p.evaluate(gid=>{
  const v = K.P[gid], out = [];
  if(K.G.ghost) out.push('G.ghost');
  if(v && v.role!=='surv') out.push('player role '+v.role);
  if(v && (v.flags&1024)) out.push('flag 1024');
  if(K.ghostView()) out.push('ghostView');
  if(!K.NET.isHost && Object.keys(K.H.players).length) out.push('host state');
  return out;
}, gid);

T('disguise_net', 'โหมดปลอมตัว 6 คน: ข้อมูลเครือข่ายและ state ที่คนหนีได้รับไม่บอกว่าใครเป็นผี', async ctx=>{
  const ps = await room(ctx, 'RDNT', 6);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  for(const p of ps) await tap(p);
  await start(ps); await skipWake(h); await sleep(1500);
  const {gid, surv} = await ghostAndSurv(ps);
  const out = []; let n = 0;
  for(const p of surv){
    const msgs = await rx(p); n += msgs.length;
    const l = leaks(msgs, gid).concat(await pageLeaks(p, gid));
    if(!msgs.some(m=>m.t==='start') || !msgs.some(m=>m.t==='s')) l.push('tap saw no start/snapshot');
    if(l.length) out.push(p.tag+': '+l.join(', '));
  }
  check(!out.length, 'survivor knows the ghost: '+out.join(' | '));
  return `คนหนี ${surv.length} คน ตรวจ ${n} ข้อความ ไม่มีข้อมูลบอกตัวผี`;
});

T('disguise_clues', 'โหมดปลอมตัว: เบาะแส ฟ้าแลบเห็นตาแดง ตะกรุดสั่น อีกาบินหนี มาจากโฮสต์ และไม่รั่วให้คนที่ไม่เห็น', async ctx=>{
  const ps = await room(ctx, 'RDCL', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  const {g, gid, surv} = await ghostAndSurv(ps);
  const [a, b] = surv, aid = await me(a), bid = await me(b);
  for(const p of ps) await tap(p);
  // crows: the ghost walks up to the perch at (4.5, 9); a watches from 7 m, out of the crows' own reach
  await place(h, a, 4.5, 16, 0); await place(h, b, -6, 21, Math.PI); await place(h, g, 10, 14, 0); await sleep(400);
  await rx(a);
  await place(h, g, 4.5, 10, 0);
  await until(a, ()=>window.__rx.some(m=>m.k==='crow'), null, 3000, 'crow event');
  await until(a, ()=>K.crowState(2)==='fly', null, 2000, 'crows take off');
  // takrut: b holds one and the ghost comes within 4 m
  await H(h, id=>{ K.H.players[id].ch='takrut'; }, bid);
  await until(b, ()=>K.L.ch==='takrut', null, 2000, 'takrut in hand');
  await place(h, g, -6, 18.5, 0); await sleep(300);
  await until(b, ()=>/ตะกรุดในมือสั่น/.test(document.querySelector('#toast').textContent), null, 3000, 'takrut trembles');
  await H(h, id=>{ K.H.players[id].ch=null; }, bid);
  // lightning: a looks straight at the ghost from 4 m, b stands behind it looking away
  await place(h, g, 0, 17, 0); await place(h, a, 0, 21, 0); await place(h, b, 3, 21, Math.PI); await sleep(400);
  await H(h, ()=>{ K.H.lt = .01; });
  await until(a, gid=>K.G.ghost===gid && K.P[gid].role==='ghost', gid, 3000, 'eyes seen in the flash');
  await sleep(300);
  const shown = await a.evaluate(gid=>{ const v=K.P[gid]; return !!v.deyeMat && !!v.dmodel && v.dmodel.g.visible && !v.model.g.visible; }, gid);
  check(shown, 'the unveiled ghost should still look like a person');
  await until(b, ()=>window.__rx.some(m=>m.k==='lt'), null, 3000, 'flash on b');
  await sleep(300);
  const la = await rx(a), lb = await rx(b);
  check(la.some(m=>m.k==='lt' && m.eye===gid), 'a was not shown the eyes');
  const bl = leaks(lb, gid).concat(await pageLeaks(b, gid));
  check(!bl.length, 'b, who looked away, learned who the ghost is: '+bl.join(', '));
  const tk = lb.find(m=>m.k==='takrut');
  check(!tk || Object.keys(tk).join()==='t,k', 'takrut event carries more than the tremble '+JSON.stringify(tk));
  const cr = la.concat(lb).find(m=>m.k==='crow');
  check(!cr || Object.keys(cr).join()==='t,k,i', 'crow event carries more than the perch '+JSON.stringify(cr));
  // a, who saw the eyes, now gets the real data: the ghost is still in disguise for a
  await sleep(500);
  check(await a.evaluate(gid=>K.masked(K.P[gid]), gid), 'a should see the ghost as disguised (masked)');
  return 'อีกาบิน ตะกรุดสั่น ฟ้าแลบเผยตาเฉพาะคนที่มอง คนอื่นไม่รู้';
});

T('disguise_spoof', 'โหมดปลอมตัว: ลูกห้องส่งข้อมูลปลอมเพื่อเป็นผีหรือเผยตัวคนอื่นไม่ได้', async ctx=>{
  const ps = await room(ctx, 'RDSP', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  const {gid, surv} = await ghostAndSurv(ps);
  const [a, b] = surv, aid = await me(a);
  for(const p of ps) await tap(p);
  await a.evaluate(aid=>{
    const send = m=>K.sendHost(m);
    send({t:'st', x:1, y:2, z:21, a:0, b:0, f:0xffff});
    for(const m of [{t:'start', ghost:aid, gk:'pop', p:[]}, {t:'role', role:'ghost'}, {t:'gpick', k:'pop'}, {t:'atk'}, {t:'skill'},
      {t:'e', k:'morph', who:aid}, {t:'s', p:[{i:aid, f:1024}]}, {t:'end', why:'done', r:[]}, {t:'lobby', p:[]}]) send(m);
  }, aid);
  await sleep(800);
  const host = await H(h, ([aid,gid])=>({a:K.H.players[aid].role, g:K.H.players[gid].role, n:Object.values(K.H.players).filter(q=>q.role==='ghost').length, ph:K.H.phase}), [aid, gid]);
  check(host.a==='surv' && host.g==='ghost' && host.n===1 && host.ph==='play', 'host roles changed '+JSON.stringify(host));
  const lb = await rx(b);
  const fake = lb.filter(m=>m.t==='s').some(m=>{ const e=m.p.find(e=>e.i===aid); return e && (e.f & ~0x247); });
  check(!fake, 'spoofed flags reached another player');
  check(await b.evaluate(aid=>K.P[aid].role==='surv', aid), 'b sees a as the ghost');
  const bl = leaks(lb, gid).concat(await pageLeaks(b, gid));
  check(!bl.length, 'leak after spoofing: '+bl.join(', '));
  return 'ส่งบทบาท/flag/ข้อความปลอมแล้วโฮสต์ไม่เชื่อ';
});

T('disguise_rejoin', 'โหมดปลอมตัว: คนเข้าห้องกลางเกม คนหลุด และรอบใหม่ ไม่ทำให้ข้อมูลผีรั่ว', async ctx=>{
  const ps = await room(ctx, 'RDRJ', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  let {gid, surv} = await ghostAndSurv(ps);
  // someone tries to come in while the round is on
  const x = await open(ctx, 'room=RDRJ', 'late');
  await x.evaluate(()=>{ window.__rx=[]; const bc = new BroadcastChannel('krasue-local'); bc.onmessage = ev=>{ const m=ev.data; if(m.k==='d' && m.to===K.NET.me) window.__rx.push(m.m); }; });
  await x.click('#joinBtn');
  await until(x, ()=>/กำลังเล่นอยู่/.test(document.querySelector('#menuMsg').textContent), null, 8000, 'late joiner denied');
  const lx = await rx(x);
  check(lx.every(m=>m.t==='deny'), 'late joiner was sent '+lx.map(m=>m.t).join(','));
  // a survivor drops out (the host never leaves here: that ends the room)
  const leaver = surv.find(p=>p!==h);
  let stay = ps.filter(p=>p!==leaver);
  if(leaver){
    for(const p of stay) await tap(p);
    await leaver.evaluate(()=>K.leaveRoom());
    await sleep(1200);
    for(const p of stay.filter(p=>surv.includes(p))){ const l = leaks(await rx(p), gid).concat(await pageLeaks(p, gid)); check(!l.length, p.tag+' after a drop: '+l.join(', ')); }
  }
  // end the round at dawn and play again with who is left: the new ghost is secret again
  if((await H(h, ()=>K.H.phase))==='play'){ await H(h, ()=>{ K.H.left = .05; }); }
  await until(h, ()=>K.H.phase==='end', null, 5000, 'round over');
  for(const p of stay) await tap(p);
  await H(h, ()=>K.hostAgain());
  await until(h, k=>K.H.lobby.length===k, stay.length, 3000, 'lobby again');
  await start(stay); await skipWake(h); await sleep(800);
  ({gid, surv} = await ghostAndSurv(stay));
  for(const p of surv){ const l = leaks(await rx(p), gid).concat(await pageLeaks(p, gid)); check(!l.length, p.tag+' in round 2: '+l.join(', ')); }
  return `เข้ากลางเกมถูกปฏิเสธ คนหลุดไม่ทำให้รั่ว รอบใหม่ ${stay.length} คนยังเป็นความลับ`;
});

T('disguise_salt', 'โหมดปลอมตัว: ปาเกลือใส่ผีปลอมตัว ร่างหลุดและทุกคนรู้ตัวผี', async ctx=>{
  const ps = await room(ctx, 'RDSL', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  const {g, gid, surv} = await ghostAndSurv(ps);
  const [a, b] = surv, aid = await me(a);
  await place(h, g, 0, 17, 0); await place(h, a, 0, 19, 0); await place(h, b, -8, 21, Math.PI); await sleep(400);
  check(await b.evaluate(gid=>K.P[gid].role==='surv', gid), 'b knew before the salt');
  await H(h, id=>{ K.H.players[id].ch='salt'; }, aid);
  await until(a, ()=>K.L.ch==='salt', null, 2000, 'salt in hand');
  await a.evaluate(()=>K.useCharm());
  await until(h, gid=>!K.H.players[gid].dis && K.H.players[gid].outed, gid, 2000, 'disguise burnt off');
  await until(a, gid=>K.P[gid].role==='ghost' && /ร่างปลอมหลุด/.test(document.querySelector('#toast').textContent), gid, 3000, 'thrower sees who it was');
  await until(b, gid=>K.P[gid] && K.P[gid].role==='ghost' && !(K.P[gid].flags&1024), gid, 3000, 'everyone is told once it is out');
  return 'โดนเกลือแล้วร่างหลุด คนปารู้และทุกคนได้ข้อมูลผีหลังเผยร่าง';
});

T('disguise_morph', 'โหมดปลอมตัว: กลายร่าง ออกล่า กลับร่าง', async ctx=>{
  const ps = await room(ctx, 'RMRP', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  const {g, gid, surv} = await ghostAndSurv(ps);
  check(await g.evaluate(()=>K.G.disg)===true, 'ghost not disguised at start');
  await H(h, id=>{ K.H.players[id].formReady = 0; }, gid);
  await until(g, ()=>K.P[K.NET.me].fr===0, null, 2000, 'form ready on ghost client');
  await g.evaluate(()=>{ K.L.pos.set(0,0,10); });
  await sleep(300);
  await g.evaluate(()=>K.ghostAttack());
  await until(surv[0], id=>K.P[id] && (K.P[id].flags&2048), gid, 2000, 'morphing seen');
  await until(surv[0], id=>K.P[id] && !(K.P[id].flags&1024), gid, 4000, 'revealed');
  await until(g, ()=>!K.G.disg, null, 2000, 'ghost client in ghost form');
  await H(h, id=>{ K.H.players[id].formUntil = K.H.t+.2; }, gid);
  await until(surv[0], id=>K.P[id] && (K.P[id].flags&1024), gid, 3000, 'back in disguise');
  await until(g, ()=>K.G.disg, null, 2000, 'ghost client disguised again');
  // the gate opening strips the disguise for good
  await H(h, ()=>{ K.H.candles=K.H.candles.map(()=>1); K.H.offers.forEach(o=>o.placed=true); K.H.gate=true; });
  await until(surv[0], id=>K.P[id] && !(K.P[id].flags&1024), gid, 4000, 'revealed at gate');
  return 'กลายร่าง กลับร่าง และหลุดถาวรตอนประตูเปิด';
});

T('charms', 'เกลือ น้ำมนต์ ตะกรุด', async ctx=>{
  const {h, g, gid, surv} = await ghostRoom(ctx, 'RCHM', 'krasue');
  const s = surv[0], sid = await me(s);
  // takrut blocks one hit
  await place(h, s, 0, 8, 0); await place(h, g, 0, 9.6, 0);
  await H(h, sid=>{ K.H.players[sid].ch='takrut'; }, sid); await sleep(400);
  await g.evaluate(()=>K.ghostAttack());
  await until(h, sid=>K.H.players[sid].ch===null, sid, 2000, 'takrut used');
  const hp = await H(h, sid=>[K.H.players[sid].h, K.H.players[sid].s], sid);
  check(hp[0]===2 && hp[1]==='alive', 'takrut did not block '+hp);
  // salt stuns
  await sleep(2800);
  await place(h, g, 0, 4, 0); await place(h, s, 0, 8, 0);
  await H(h, sid=>{ K.H.players[sid].ch='salt'; }, sid);
  await sleep(400);
  await s.evaluate(()=>K.useCharm());
  await until(h, gid=>K.H.players[gid].stunUntil>K.H.t, gid, 2000, 'salt stun');
  // holy water line stops the ghost
  await H(h, sid=>{ K.H.players[sid].ch='holy'; }, sid);
  await sleep(300);
  await s.evaluate(()=>K.useCharm());
  await until(g, ()=>K.ROUND.holy.length>0, null, 2000, 'holy line on ghost client');
  const hl = await H(h, ()=>[K.H.holy[0].x, K.H.holy[0].z]);
  const z = await g.evaluate(hl=>{ const p=new K.V3(hl[0], 0, hl[1]-3); for(let i=0;i<60;i++){ p.z+=.1; K.collide(p,.3,{ghost:true}); } return [p.z, hl[1]]; }, hl);
  check(z[0] < z[1], 'ghost crossed the holy line '+JSON.stringify(z));
  return 'ตะกรุดกันได้ เกลือทำให้มึน น้ำมนต์กั้นผี';
});

for(const [lv, name] of [[0,'easy'],[1,'normal'],[2,'hard']]){
  T('bot_'+name, `ผีบอทเล่นคนเดียว ระดับ ${['ง่าย','ปกติ','โหด'][lv]}`, async ctx=>{
    const h = await open(ctx, 'code=RB0'+lv, 'host');
    await h.click('#hostBtn'); await until(h, ()=>K.H.phase==='lobby');
    await H(h, lv=>{ K.hostSetBot(true); K.hostSetBotLv(lv); }, lv);
    check(await h.evaluate(()=>!document.querySelector('#startBtn').disabled), 'start disabled when alone with a bot');
    await h.click('#startBtn');
    await until(h, ()=>K.G.inGame);
    await h.evaluate(()=>{ K.L.menu=false; K.show(null); });
    const st = await H(h, ()=>[K.G.role, K.H.botLv, K.H.players[K.NET.me].ch, K.H.players.bot && K.H.players.bot.role]);
    check(st[0]==='surv' && st[1]===lv && st[2]==='takrut' && st[3]==='ghost', JSON.stringify(st));
    await skipWake(h);
    // stand lit in the open 12 m from the hall door where the bot wakes; it must come
    await h.evaluate(()=>{ K.L.pos.set(0,0,9); K.L.light=true; K.L.yaw=0; });
    const t0 = Date.now();
    await until(h, ()=>K.H.players[K.NET.me].ch===null || K.H.players[K.NET.me].h<2 || K.H.phase==='end', null, 45000, 'bot reaching the player');
    return `บอทมาถึงตัวใน ${((Date.now()-t0)/1000).toFixed(1)} วิ`;
  });
}

T('leave_surv', 'คนหนีหลุดกลางเกม: โฮสต์และเพื่อนเก็บกวาด', async ctx=>{
  const ps = await room(ctx, 'RLV1', 3);
  const [h] = ps; await start(ps); await skipWake(h);
  const {gid, surv} = await ghostAndSurv(ps);
  const [a, b] = surv, aid = await me(a);
  await H(h, id=>{ const o=0; K.H.players[id].of=o; K.H.offers[o].by=id; }, aid);
  await a.close();
  await until(h, id=>!K.H.players[id] && !K.NET.conns[id] && !K.H.lobby.some(q=>q.i===id), aid, 8000, 'host dropped the player');
  await until(b, id=>!K.P[id], aid, 3000, 'friend removed the view');
  check(await H(h, ()=>K.H.offers[0].by)===null, 'carried offering not dropped');
  check(await H(h, ()=>K.H.phase)==='play', 'round should go on');
  return 'โฮสต์ลบผู้เล่น ของไหว้ตกที่พื้น เพื่อนเห็นหายไป รอบเล่นต่อ';
});
T('leave_ghost', 'ผีหลุดกลางเกม: รอบจบ', async ctx=>{
  const ps = await room(ctx, 'RLV2', 3);
  const [h] = ps;
  const gid = await H(h, ()=>K.nextGhost());
  const by = await roles(ps);
  if(by[gid]===h){ await H(h, id=>K.hostSetGhost(id), await me(ps[1])); }
  await start(ps); await skipWake(h);
  const {g} = await ghostAndSurv(ps);
  check(g!==h, 'host is ghost');
  await g.close();
  const rest = ps.filter(p=>p!==g);
  for(const p of rest) await until(p, ()=>K.G.ph==='end' && document.querySelector('#endTitle').textContent==='ผีหายไปแล้ว', null, 8000, 'ghost-left end');
  return 'ทุกคนขึ้น ผีหายไปแล้ว';
});
T('leave_host', 'โฮสต์หลุด: ลูกห้องกลับเมนู และสร้างห้องใหม่ได้', async ctx=>{
  const ps = await room(ctx, 'RLV3', 3);
  const [h] = ps; await start(ps);
  await h.close();
  const rest = ps.slice(1);
  for(const p of rest) await until(p, ()=>!K.G.inGame && !document.querySelector('#menuCard').hidden && /หลุด/.test(document.body.innerText), null, 10000, 'back to menu');
  const st = await rest[0].evaluate(()=>[K.NET.peer, Object.keys(K.P).length, K.voice && Object.keys(K.voice.pcs).length]);
  check(st[0]===null && st[1]===0 && st[2]===0, 'leftovers '+JSON.stringify(st));
  // the survivor can host a fresh room and the other one joins it
  await rest[0].evaluate(()=>K.hostCreate());
  await until(rest[0], ()=>K.H.phase==='lobby');
  const code = await rest[0].evaluate(()=>K.NET.code);
  await rest[1].evaluate(c=>{ K.codeIn.value=c; K.joinRoom(); }, code);
  await until(rest[0], ()=>K.H.lobby.length===2, null, 8000, 'rejoin');
  return 'ลูกห้องกลับเมนูพร้อมข้อความ และตั้งห้องใหม่ได้';
});

T('again', 'จบแล้วเล่นรอบใหม่ได้ ไม่มีของค้าง', async ctx=>{
  const ps = await room(ctx, 'RAGN', 3);
  const [h] = ps;
  for(let r=0;r<2;r++){
    await start(ps);
    await H(h, ()=>{ K.H.left = .3; });
    for(const p of ps) await until(p, ()=>K.G.ph==='end', null, 5000, 'end');
    await H(h, ()=>K.hostAgain());
    for(const p of ps) await until(p, ()=>!K.G.inGame && !document.querySelector('#lobbyCard').hidden, null, 5000, 'back to lobby');
  }
  await start(ps);
  const st = await Promise.all(ps.map(p=>p.evaluate(()=>[Object.keys(K.P).length, K.G.ph, K.scene.children.length])));
  check(st.every(s=>s[0]===3 && s[1]==='wake'), JSON.stringify(st));
  const hs = await H(h, ()=>[Object.keys(K.H.holds).length, K.H.gate, K.H.candles.every(v=>v===0)]);
  check(hs[0]===0 && hs[1]===false && hs[2], 'stale host state '+JSON.stringify(hs));
  return 'เล่นต่อ 3 รอบ สถานะใหม่ทุกครั้ง';
});

T('voice', 'เสียงคุยต่อติด และปิดไมค์ได้', async ctx=>{
  const ps = await room(ctx, 'RVOX', 2);
  const [h, c] = ps; await start(ps);
  await until(c, ()=>Object.values(K.voice.pcs).some(e=>e.pc.connectionState==='connected'), null, 15000, 'voice connected');
  const t0 = await c.evaluate(()=>[K.voice.muted, K.voice.track && K.voice.track.enabled]);
  await c.evaluate(()=>{ if(K.voice.muted) K.voice.toggleMute(); });
  await c.keyboard.press('KeyM');
  const t1 = await c.evaluate(()=>[K.voice.muted, K.voice.track && K.voice.track.enabled]);
  check(t1[0]===true && t1[1]===false, 'mute did not stop the track '+JSON.stringify(t1));
  await c.keyboard.press('KeyM');
  const t2 = await c.evaluate(()=>[K.voice.muted, K.voice.track && K.voice.track.enabled]);
  check(t2[0]===false && t2[1]===true, 'unmute '+JSON.stringify(t2));
  return 'ต่อเสียงติด กด M ปิดและเปิดไมค์ได้';
});

T('desktop', 'การควบคุมคอม: เดิน วิ่ง ย่อ ไฟฉาย', async ctx=>{
  const ps = await room(ctx, 'RDSK', 2);
  const [h] = ps; await start(ps); await skipWake(h);
  const {surv} = await ghostAndSurv(ps);
  const s = surv[0];
  await s.bringToFront();
  const p0 = await s.evaluate(()=>[K.L.pos.x, K.L.pos.z, K.L.light, K.L.crouch]);
  await s.keyboard.down('KeyW'); await sleep(800); await s.keyboard.down('ShiftLeft'); await sleep(500);
  const run = await s.evaluate(()=>!!(K.P[K.NET.me] && K.L.stamina<100));
  await s.keyboard.up('ShiftLeft'); await s.keyboard.up('KeyW');
  const p1 = await s.evaluate(()=>[K.L.pos.x, K.L.pos.z]);
  await s.keyboard.press('KeyF'); await s.keyboard.press('KeyC');
  const p2 = await s.evaluate(()=>[K.L.light, K.L.crouch]);
  check(Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) > .3, 'W did not move');
  check(run, 'Shift did not run');
  check(p2[0]!==p0[2] && p2[1]!==p0[3], 'F/C did nothing '+JSON.stringify([p0,p2]));
  return 'W เดิน Shift วิ่ง F ไฟฉาย C ย่อ';
});

T('touch', 'การควบคุมมือถือจำลอง: จอย หันกล้อง ปุ่มใหญ่', async ()=>{
  const ctx = await newCtx({viewport:{width:844,height:390}, hasTouch:true, isMobile:true});
  try{
    const h = await open(ctx, 'code=RTCH&touch', 'host');
    const c = await open(ctx, 'room=RTCH&touch', 'c1');
    await h.click('#hostBtn'); await until(h, ()=>K.H.phase==='lobby');
    await c.click('#joinBtn'); await until(h, ()=>K.H.lobby.length===2);
    await start([h, c]); await skipWake(h);
    const {surv} = await ghostAndSurv([h, c]);
    const s = surv[0];
    const vis = await s.evaluate(()=>!document.querySelector('#touch').hidden);
    check(vis, 'touch pad hidden');
    const r = await s.evaluate(()=>new Promise(res=>{
      const el=document.querySelector('#touch'); const ev=(t,id,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:x,clientY:y,bubbles:true,pointerType:'touch'}));
      const z0=K.L.pos.z, x0=K.L.pos.x, yaw0=K.L.yaw;
      ev('pointerdown',1,120,280); ev('pointermove',1,120,220);
      ev('pointerdown',2,500,200); ev('pointermove',2,450,200);
      setTimeout(()=>{ const out={d:Math.hypot(K.L.pos.x-x0, K.L.pos.z-z0), dyaw:K.L.yaw-yaw0}; ev('pointerup',1,120,220); ev('pointerup',2,450,200); res(out); }, 2000);
    }));
    check(r.d > .3, 'joystick did not move: '+r.d);   // frame time is capped, so a slow software-rendered tab covers less ground
    check(Math.abs(r.dyaw) > .05, 'look drag did nothing');
    const big = await s.evaluate(()=>{ const b=document.querySelector('#touch .big.r-surv'); return !!b && b.offsetWidth>0; });
    check(big, 'big action button missing');
    if(ctx.errors.length) throw new Error(ctx.errors.join('\n'));
    return `จอยพาเดิน ${r.d.toFixed(1)} ม. ลากจอหันกล้องได้`;
  } finally { await ctx.close(); }
});

/* ---- found in the P0/P1 audit: each failed on the baseline */
T('double_join', 'กดเข้าห้องสองครั้งติดกัน ต้องมีเราแค่คนเดียวในห้อง', async ctx=>{
  const h = await open(ctx, 'code=RDBL', 'host');
  await h.click('#hostBtn'); await until(h, ()=>K.H.phase==='lobby');
  const c = await open(ctx, 'room=RDBL', 'c1');
  await c.evaluate(()=>{ K.joinRoom(); K.joinRoom(); });
  await sleep(3000);
  const n = await H(h, ()=>K.H.lobby.length);
  check(n===2, 'lobby has '+n+' entries for 2 people');
  check(await c.evaluate(()=>!!K.LOBBY && K.LOBBY.p.some(q=>q.i===K.NET.me)), 'client not in its own lobby');
  return 'ห้องมี 2 คนตามจริง';
});
T('host_leave_socket', 'โฮสต์ออกจากห้องแล้ว ต้องไม่ต่อเซิร์ฟเวอร์ใหม่ค้างไว้ (PeerJS จริง กับ WebSocket จำลอง)', async ctx=>{
  const p = await ctx.newPage(); p.tag = 'host';
  p.on('pageerror', e=>ctx.errors.push('[host] '+e.message));
  await p.addInitScript(()=>{
    window.__ws = 0;
    class FakeWS{
      constructor(url){ window.__ws++; this.url=url; this.readyState=0; setTimeout(()=>{ this.readyState=1; this.onopen && this.onopen(); setTimeout(()=>this.onmessage && this.onmessage({data:JSON.stringify({type:'OPEN'})}), 10); }, 10); }
      send(){} close(){ this.readyState=3; setTimeout(()=>this.onclose && this.onclose({}), 0); }
    }
    FakeWS.CONNECTING=0; FakeWS.OPEN=1; FakeWS.CLOSING=2; FakeWS.CLOSED=3;
    window.WebSocket = FakeWS;
  });
  await p.goto(URL0 + 'index.html?quality=low');
  await p.waitForFunction(()=>window.K && window.Peer);
  await p.evaluate(()=>K.hostCreate());
  await until(p, ()=>K.H.phase==='lobby', null, 5000, 'room open');
  const before = await p.evaluate(()=>window.__ws);
  await p.evaluate(()=>K.leaveRoom());
  await sleep(1500);
  const after = await p.evaluate(()=>window.__ws);
  check(after===before, `a new signalling socket was opened after leaving (${before} → ${after})`);
  return 'ออกแล้วไม่เปิด socket ใหม่';
});
T('disguise_torch', 'โหมดปลอมตัว: ผีเริ่มรอบไฟฉายเปิดเหมือนคนอื่น และถ่านไม่หมดจนเผยตัว', async ctx=>{
  const ps = await room(ctx, 'RDTO', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h); await sleep(600);
  const {g, gid, surv} = await ghostAndSurv(ps);
  const mine = await g.evaluate(()=>[K.G.disg, K.L.light]);
  const seen = await surv[0].evaluate(gid=>[K.P[gid].flags&1, K.L.light], gid);
  check(mine[0] && mine[1], 'disguised ghost starts with the torch off');
  check(seen[0]===1 && seen[1], 'survivor sees the disguised ghost without a beam');
  // its torch drains like anyone's, so it must be able to refill it like anyone
  const b = await g.evaluate(()=>{ const b=K.BAT.find(b=>b.up); K.L.pos.x=b.x; K.L.pos.z=b.z; K.L.battery=40; return b.i; });
  await place(h, g, ...(await g.evaluate(()=>[K.L.pos.x, K.L.pos.z]))); await sleep(300);
  await g.evaluate(()=>K.usePress());
  await until(g, ()=>K.L.battery>80, null, 3000, 'disguised ghost picking a battery');
  return 'ผีไฟฉายเปิดตั้งแต่เริ่ม และเก็บถ่านได้เหมือนคน';
});
T('spirit_voice', 'โหมดปลอมตัว: วิญญาณไม่ได้ยินเสียงผี', async ctx=>{
  const ps = await room(ctx, 'RSVC', 3);
  const [h] = ps;
  await H(h, ()=>K.hostSetMode('disguise'));
  await start(ps); await skipWake(h);
  const {gid, surv} = await ghostAndSurv(ps);
  const a = surv[0], aid = await me(a);
  await until(a, gid=>K.voice.pcs[gid] && K.voice.pcs[gid].pc.connectionState==='connected', gid, 15000, 'voice to ghost');
  for(const p of ps) await place(h, p, 0, 5);
  await H(h, id=>{ K.H.players[id].s='dead'; }, aid);
  await until(a, ()=>K.P[K.NET.me].s==='dead', null, 3000, 'dead');
  await sleep(1500);
  const g = await a.evaluate(gid=>{ const e=K.voice.pcs[gid]; return [e.gD ? e.gD.gain.value : 0, e.gS ? e.gS.gain.value : 0]; }, gid);
  check(g[0] < .01 && g[1] < .01, 'spirit still hears the disguised ghost '+JSON.stringify(g));
  return 'วิญญาณไม่ได้ยินเสียงผีปลอมตัว';
});
T('deny_mic', 'โดนปฏิเสธเข้าห้อง (ห้องเต็ม/กำลังเล่น) แล้วไมค์ต้องปิด', async ctx=>{
  const ps = await room(ctx, 'RDMC', 2);
  await start(ps);
  const x = await open(ctx, 'room=RDMC', 'late');
  await x.evaluate(()=>{ window.__tracks=[]; const o=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia=async c=>{ await new Promise(r=>setTimeout(r,1500)); const s=await o(c); window.__tracks.push(...s.getTracks()); return s; }; });
  await x.click('#joinBtn');
  try{ await until(x, ()=>/กำลังเล่นอยู่/.test(document.querySelector('#menuMsg').textContent), null, 8000, 'denied'); }catch(e){ throw new Error(e.message+' menuMsg='+await x.evaluate(()=>document.querySelector('#menuMsg').textContent+' peer='+!!K.NET.peer)); }
  await sleep(2500);
  const live = await x.evaluate(()=>window.__tracks.filter(t=>t.readyState==='live').length);
  check(live===0, live+' microphone track(s) left running after the deny');
  return 'ปฏิเสธแล้วไมค์ปิด';
});

T('host_stall', 'โฮสต์เงียบไป ลูกห้องต้องมีข้อความบอก', async ctx=>{
  const ps = await room(ctx, 'RSTL', 2);
  const [h, c] = ps; await start(ps); await skipWake(h);
  await h.evaluate(()=>{ K.G.manual = true; });   // the host stops simulating and sending, like a tab put to sleep
  await until(c, ()=>/ขาดหาย/.test(document.querySelector('#toast').textContent) && document.querySelector('#toast').classList.contains('on'), null, 8000, 'stall message');
  await h.evaluate(()=>{ K.G.manual = false; });
  await sleep(3000);
  check(await c.evaluate(()=>!document.querySelector('#toast').classList.contains('on') || !/ขาดหาย/.test(document.querySelector('#toast').textContent)), 'message stays after the host is back');
  return 'ขึ้นข้อความเมื่อโฮสต์เงียบ และหายไปเมื่อกลับมา';
});

/* ---------------------------------------------------------------- runner */
(async()=>{
  browser = await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const pick = process.argv.slice(2);
  const ids = pick.length ? pick : Object.keys(CASES);
  const results = [];
  for(const id of ids){
    const c = CASES[id]; if(!c){ console.log('unknown case', id); continue; }
    const t0 = Date.now();
    let ctx, res;
    try{
      ctx = await newCtx();
      const note = await c.fn(ctx);
      if(ctx.errors.length) throw new Error('page errors:\n  '+ctx.errors.join('\n  '));
      res = {id, name:c.name, r:'PASS', note};
    }catch(e){ res = {id, name:c.name, r:'FAIL', note:e.message.split('\n').slice(0,6).join(' | ')}; }
    finally{ if(ctx) await ctx.close().catch(()=>{}); }
    res.s = ((Date.now()-t0)/1000).toFixed(0);
    results.push(res);
    console.log(`${res.r}  ${id}  (${res.s}s)  ${res.name} — ${res.note||''}`);
  }
  await browser.close();
  const pass = results.filter(r=>r.r==='PASS').length;
  console.log(`\n${pass}/${results.length} PASS`);
  if(process.env.KRASUE_JSON) fs.writeFileSync(process.env.KRASUE_JSON, JSON.stringify(results, null, 1));
  process.exit(pass===results.length ? 0 : 1);
})();
