/* bot: a computer-run ghost, simulated on the host, so one person (or two friends) can play as survivors.
   It finds its way with A* over a coarse grid of the temple, hunts by sight and sound, lunges, and feeds on the fallen. */
(function(K){
'use strict';
const {CFG, GHOSTS, clamp} = K;
const H = K.H;

/* ---------- walk grid ---------- */
const CELL = .5, MIN = -24, N = 97;   // covers -24..24
const idx = (cx,cz) => cz*N+cx;
const toCell = v => clamp(Math.round((v-MIN)/CELL), 0, N-1);
const toW = c => MIN + c*CELL;
const grids = {};
function buildGrid(gk){
  const g = new Uint8Array(N*N), who = {ghost:true, fly:GHOSTS[gk].fly, pret:gk==='pret'};
  const r = gk==='pop' ? .4 : gk==='pret' ? .34 : .3;
  const p = new K.V3();
  for(let cz=0; cz<N; cz++) for(let cx=0; cx<N; cx++){
    const x = toW(cx), z = toW(cz); p.set(x,0,z);
    K.collide(p, r, who);
    g[idx(cx,cz)] = Math.hypot(p.x-x, p.z-z) < .02 ? 1 : 0;
  }
  // label connected areas, so an unreachable goal (inside a hut, for the เปรต) is swapped for the closest reachable spot up front
  const comp = new Int32Array(N*N).fill(-1); let label = 0;
  for(let i=0;i<N*N;i++){
    if(!g[i] || comp[i]>=0) continue;
    const q = [i]; comp[i] = label;
    while(q.length){ const c = q.pop(), cx = c%N, cz = (c/N)|0;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+dx, nz=cz+dz; if(nx<0||nz<0||nx>=N||nz>=N) continue; const ni=idx(nx,nz); if(g[ni] && comp[ni]<0){ comp[ni]=label; q.push(ni); } } }
    label++;
  }
  g.comp = comp;
  return g;
}
K.botPrepare = function(gk){ grids[gk] = buildGrid(gk); };
function closestIn(g, lab, cx, cz){
  for(let r=0;r<16;r++){
    let best = null, bd = 1e9;
    for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
      const x=cx+dx, z=cz+dz; if(x<0||z<0||x>=N||z>=N) continue;
      if(g.comp[idx(x,z)]===lab){ const d = dx*dx+dz*dz; if(d<bd){ bd = d; best = [x,z]; } }
    }
    if(best) return best;
  }
  return null;
}
if(K.DEBUG) K._bot = {findPath:(gk,...a)=>findPath(grids[gk],...a), grids, toCell, idx};   // altars change per round, so rebuild at the start

/* A* with 8 neighbours; returns world waypoints, pulled tight where a straight line stays walkable */
function walkLine(g, ax, az, bx, bz){
  const d = Math.hypot(bx-ax, bz-az), n = Math.ceil(d/(CELL*.5));
  for(let i=1;i<=n;i++){ const t=i/n; if(!g[idx(toCell(ax+(bx-ax)*t), toCell(az+(bz-az)*t))]) return false; }
  return true;
}
function nearestOpen(g, cx, cz){
  if(g[idx(cx,cz)]) return [cx,cz];
  for(let r=1;r<8;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){
    const x=cx+dx, z=cz+dz; if(x<0||z<0||x>=N||z>=N) continue;
    if(g[idx(x,z)]) return [x,z];
  }
  return null;
}
const gScore = new Float32Array(N*N), came = new Int32Array(N*N), closed = new Uint8Array(N*N);
/* binary heap of [f, cell] */
const heap = [];
function hpush(f, i){ heap.push([f,i]); let k = heap.length-1; while(k>0){ const p = (k-1)>>1; if(heap[p][0]<=heap[k][0]) break; [heap[p],heap[k]] = [heap[k],heap[p]]; k = p; } }
function hpop(){ const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let k = 0; for(;;){ const l = 2*k+1, r = l+1; let m = k; if(l<heap.length && heap[l][0]<heap[m][0]) m = l; if(r<heap.length && heap[r][0]<heap[m][0]) m = r; if(m===k) break; [heap[m],heap[k]] = [heap[k],heap[m]]; k = m; } } return top; }
function findPath(g, ax, az, bx, bz){
  const s = nearestOpen(g, toCell(ax), toCell(az)); if(!s) return null;
  const si = idx(s[0],s[1]);
  let e = nearestOpen(g, toCell(bx), toCell(bz));
  if(!e || g.comp[idx(e[0],e[1])]!==g.comp[si]){ e = closestIn(g, g.comp[si], toCell(bx), toCell(bz)); if(!e) return null; bx = toW(e[0]); bz = toW(e[1]); }
  const ei = idx(e[0],e[1]);
  if(ei===si) return [[bx, bz]];
  gScore.fill(1e9); came.fill(-1); closed.fill(0); heap.length = 0;
  hpush(0, si); gScore[si] = 0;
  const h = i => { const x=i%N, z=(i/N)|0, dx=Math.abs(x-e[0]), dz=Math.abs(z-e[1]); return Math.max(dx,dz) + .414*Math.min(dx,dz); };
  let found = false, bestI = si, bestH = 1e9;
  while(heap.length){
    const cur = hpop()[1];
    if(closed[cur]) continue; closed[cur] = 1;
    if(cur===ei){ found = true; break; }
    { const hh = h(cur); if(hh<bestH){ bestH = hh; bestI = cur; } }
    const cx = cur%N, cz = (cur/N)|0;
    for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){
      if(!dx && !dz) continue;
      const nx=cx+dx, nz=cz+dz; if(nx<0||nz<0||nx>=N||nz>=N) continue;
      const ni = idx(nx,nz); if(!g[ni] || closed[ni]) continue;
      if(dx && dz && (!g[idx(cx+dx,cz)] || !g[idx(cx,cz+dz)])) continue;   // no corner cutting
      const ng = gScore[cur] + (dx&&dz ? 1.414 : 1);
      if(ng < gScore[ni]){ gScore[ni] = ng; came[ni] = cur; hpush(ng + h(ni), ni); }
    }
  }
  // can't get there (the เปรต at a hut door): go as close as it can and wait
  const end = found ? ei : bestI;
  if(end===si) return null;
  const cells = []; for(let c=end; c!==-1; c=came[c]) cells.push(c); cells.reverse();
  const pts = cells.map(c=>[toW(c%N), toW((c/N)|0)]);
  // string pulling
  const out = []; let from = [ax, az], i = 0;
  while(i < pts.length-1){
    let j = pts.length-1;
    while(j>i+1 && !walkLine(g, from[0], from[1], pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); from = pts[j]; i = j;
  }
  if(!found) bx = toW(end%N), bz = toW((end/N)|0);
  if(!out.length) out.push([bx, bz]);
  return out;
}

/* ---------- senses ---------- */
const eyeY = gh => gh.y || 1.6;
function sees(gh, q){
  const d = Math.hypot(q.x-gh.x, q.z-gh.z);
  if(d<2.2) return true;
  const lit = q.f&1, crouch = q.f&512, run = q.f&2;
  const range = lit ? 24 : crouch ? 5 : run ? 14 : 10;
  if(d>range) return false;
  // a torch pointed your way is seen from anywhere it reaches; otherwise it has to be roughly in front
  const fx = -Math.sin(gh.a), fz = -Math.cos(gh.a);
  if(!lit && ((q.x-gh.x)*fx + (q.z-gh.z)*fz)/d < -.2) return false;
  return K.lineOfSight(gh.x, eyeY(gh), gh.z, q.x, 1.2, q.z);
}
function hears(gh, q){
  const d = Math.hypot(q.x-gh.x, q.z-gh.z);
  if(!(q.f&4) || (q.f&512)) return false;   // still or crouch-walking: silent
  return d < ((q.f&2) ? 13 : 5.5);
}
K.botNoise = function(x, z, w){ if(H.bot) H.bot.noise = {x, z, t:H.t, w:w||1}; };

/* ---------- brain ---------- */
const PATROL = () => K.ALTAR_SPOTS.filter((_,i)=>H.altars.includes(i)).concat([[K.SHRINE.x, K.SHRINE.z]], H.offers.filter(o=>!o.placed).map(o=>[o.x,o.z]));
function goal(B, x, z){ if(!B.goal || Math.hypot(B.goal[0]-x, B.goal[1]-z)>1.2){ B.goal = [x,z]; B.repath = 0; } }
K.botTick = function(gh, dt, surv){
  const B = H.bot = H.bot || {ignore:{}, campT:0, path:null, repath:0, goal:null, target:null, last:null, noise:null, think:0, strafe:0, wander:0};
  const G_ = GHOSTS[gh.gk], grid = grids[gh.gk]; if(!grid) return;
  const stunned = H.t < gh.stunUntil, lunging = H.t < gh.lungeUntil;
  // feeding
  const feeding = B.feed && H.players[B.feed] && H.players[B.feed].s==='down' && Math.hypot(H.players[B.feed].x-gh.x, H.players[B.feed].z-gh.z) < CFG.reach;
  if(feeding && !stunned){ H.holds.bot = {k:'finish', i:B.feed, last:H.t}; faceTo(gh, H.players[B.feed], dt*4); hover(gh); return; }
  B.think -= dt;
  if(B.think<=0){
    B.think = .25;
    // pick a target: a fallen survivor nearby first (to finish), then anyone it can see or hear, then what it remembers
    let best = null, bd = 1e9;
    for(const q of surv){
      if(q.s==='down'){ const d = Math.hypot(q.x-gh.x, q.z-gh.z); if(d<16 && d-6<bd && !q.rv){ bd = d-6; best = {q, down:true}; } continue; }
      if(q.s!=='alive' || (B.ignore[q.i]||0)>H.t) continue;
      if(sees(gh, q) || hears(gh, q)){ const d = Math.hypot(q.x-gh.x, q.z-gh.z); if(d<bd){ bd = d; best = {q}; } }
    }
    if(best && !B.target && !best.down) B.notice = H.t + .75;   // it spots you, stops, stares... then comes
    if(best){ B.target = best.q.i; B.last = {x:best.q.x, z:best.q.z, t:H.t}; B.feed = best.down ? best.q.i : null; }
    else if(B.target && H.t-(B.last ? B.last.t : 0) > 7) B.target = null;
    // skills
    if(H.t>=gh.skillReady && !stunned){
      const tq = B.target && H.players[B.target], d = tq ? Math.hypot(tq.x-gh.x, tq.z-gh.z) : 99;
      const use = G_.skill==='inv' ? (d>6 && d<16) : G_.skill==='wail' ? d<G_.wailRange*.8 : (!tq && Math.random()<.2);
      if(use) K.hostRecv('bot', {t:'skill'});
    }
  }
  const tq = B.target && H.players[B.target];
  let tx, tz, chasing = false;
  if(tq && tq.s!=='dead' && tq.s!=='escaped' && B.last){
    // fresh sight: go straight for them; stale: their last known spot
    const fresh = H.t-B.last.t < .6;
    tx = fresh ? tq.x : B.last.x; tz = fresh ? tq.z : B.last.z; chasing = fresh;
    if(Math.hypot(tx-gh.x, tz-gh.z) < 1 && !fresh) B.target = null;
  } else if(B.noise && H.t-B.noise.t < 12){
    tx = B.noise.x; tz = B.noise.z;
    if(Math.hypot(tx-gh.x, tz-gh.z) < 1.5) B.noise = null;
  } else {
    // wander between the places survivors have to visit
    if(!B.wp || Math.hypot(B.wp[0]-gh.x, B.wp[1]-gh.z) < 1.5 || H.t>B.wander){ const pts = PATROL(); B.wp = pts.length ? K.pick(pts) : [K.mr(-20,20), K.mr(-20,20)]; B.wander = H.t+25; }
    tx = B.wp[0]; tz = B.wp[1];
  }
  if(B.feed && tq && tq.s==='down'){ tx = tq.x; tz = tq.z; }
  // lunge when someone is right there
  if(chasing && tq && tq.s==='alive' && !stunned && !lunging && H.t>=gh.atkReady){
    const d = Math.hypot(tq.x-gh.x, tq.z-gh.z);
    if(d < 3.3 && K.lineOfSight(gh.x, eyeY(gh), gh.z, tq.x, 1.2, tq.z)){
      gh.a = Math.atan2(-(tq.x-gh.x), -(tq.z-gh.z));
      K.hostRecv('bot', {t:'atk'});
      B.lungeYaw = gh.a;
    }
  }
  // movement
  let speed = 0, mx = 0, mz = 0;
  if(stunned || H.phase!=='play'){ speed = 0; }
  else if(H.t < (B.notice||0) && tq){ speed = 0; faceTo(gh, tq, dt*6); }
  else if(H.t < gh.lungeUntil){ mx = -Math.sin(B.lungeYaw); mz = -Math.cos(B.lungeYaw); speed = CFG.lunge; }
  else {
    const missSlow = (gh.atkReady-H.t) > CFG.missCD+.05 ? .55 : 1;
    speed = G_.speed * .9 * (H.t<gh.invUntil ? 1.1 : 1) * missSlow * (H.gate ? CFG.rage : 1);
    // close and in sight: no path needed
    if(chasing && Math.hypot(tx-gh.x, tz-gh.z) < 6 && walkLine(grid, gh.x, gh.z, tx, tz)) B.path = [[tx,tz]];
    else {
      goal(B, tx, tz);
      B.repath -= dt;
      if(B.repath<=0 || !B.path || !B.path.length){ B.repath = chasing ? .4 : 1.2; B.path = findPath(grid, gh.x, gh.z, B.goal[0], B.goal[1]); if(!B.path){ B.path = [[gh.x, gh.z]]; B.repath = 1.5; } }
    }
    let wp = B.path[0];
    while(wp && Math.hypot(wp[0]-gh.x, wp[1]-gh.z) < .45 && B.path.length>1){ B.path.shift(); wp = B.path[0]; }
    if(wp){ const dx = wp[0]-gh.x, dz = wp[1]-gh.z, d = Math.hypot(dx,dz); if(d>.05){ mx = dx/d; mz = dz/d; } else speed = 0; }
    // caught in a torch beam: sidestep out of it
    if(gh.stunAcc > .25 && H.t>B.strafe){ B.strafe = H.t+1; B.side = Math.random()<.5 ? -1 : 1; }
    if(H.t<B.strafe){ const sx = -mz*B.side, sz = mx*B.side; mx = mx*.4+sx; mz = mz*.4+sz; const l = Math.hypot(mx,mz)||1; mx/=l; mz/=l; }
  }
  // waiting at a door it can't fit through: give up after a while and hunt someone else
  if(tq && B.path && B.path.length===1 && Math.hypot(B.path[0][0]-gh.x, B.path[0][1]-gh.z)<.7 && Math.hypot(tq.x-gh.x, tq.z-gh.z)>2.6){
    B.campT += dt; if(B.campT>9){ B.ignore[tq.i] = H.t+14; B.target = null; B.campT = 0; B.path = null; B.wp = null; }
  } else B.campT = 0;
  if(speed>0 && (mx||mz)){
    const p = new K.V3(gh.x, 0, gh.z), dist = speed*dt, steps = Math.max(1, Math.ceil(dist/.15));
    const who = {ghost:true, fly:G_.fly, pret:gh.gk==='pret'}, r = gh.gk==='pop' ? .4 : gh.gk==='pret' ? .34 : .3;
    const bx = gh.x, bz = gh.z;
    for(let i=0;i<steps;i++){ p.x += mx*dist/steps; p.z += mz*dist/steps; K.collide(p, r, who); }
    gh.x = clamp(p.x, -29, 29); gh.z = clamp(p.z, -29, 34);
    if(H.t >= gh.lungeUntil){
      faceTo(gh, {x:gh.x+mx, z:gh.z+mz}, dt*7);
      // pushed back by something the grid doesn't know (holy water): find another way
      if(Math.hypot(gh.x-bx, gh.z-bz) < dist*.2){ B.stuck = (B.stuck||0)+dt; if(B.stuck>.8){ B.stuck = 0; B.path = null; B.wp = null; B.strafe = H.t+.8; B.side = Math.random()<.5?-1:1; } }
      else B.stuck = 0;
    }
    gh.f = 4;
  } else gh.f = 0;
  hover(gh);
};
function faceTo(gh, q, k){
  const want = Math.atan2(-(q.x-gh.x), -(q.z-gh.z));
  let d = want-gh.a; d = Math.atan2(Math.sin(d), Math.cos(d));
  gh.a += d*Math.min(1, k);
}
function hover(gh){ const e = GHOSTS[gh.gk].eye; gh.y = e + (gh.gk==='krasue' ? Math.sin(H.t*1.7)*.06 : 0); gh.b = -.1; }
})(window.K);
