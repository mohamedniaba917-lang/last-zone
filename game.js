/*
 * LAST ZONE — a top-down 2D battle royale
 * 20 fighters drop onto an island. Loot weapons, armour and medkits,
 * stay inside the shrinking safe zone, and be the last one standing.
 * Plain JavaScript + HTML5 Canvas, no libraries.
 */
'use strict';

// ======================================================
// Config
// ======================================================
const MAP = 3200;               // world is MAP x MAP pixels
const BOT_COUNT = 19;           // + you = 20 fighters
const PLAYER_SPEED = 240;
const BOT_SPEED = 205;
const FIGHTER_R = 16;
const BOT_DAMAGE = 0.6;         // bots are weaker shots than you (keeps matches lasting a few minutes)
const BOT_SIGHT = 520;
const VIEW_SIZE = 1100;         // world pixels visible along the longest screen side
const STICK_R = 60;             // touch joystick radius
const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

const WEAPONS = {
  pistol:  { name: 'Pistol',  tier: 0, damage: 14, fireRate: 0.32, speed: 950,  spread: 0.05, pellets: 1, mag: 12, reload: 1.1, range: 520,  color: '#d0d0d0', len: 20 },
  smg:     { name: 'SMG',     tier: 1, damage: 9,  fireRate: 0.08, speed: 1000, spread: 0.13, pellets: 1, mag: 30, reload: 1.7, range: 480,  color: '#6fd3ff', len: 26 },
  shotgun: { name: 'Shotgun', tier: 2, damage: 11, fireRate: 0.75, speed: 900,  spread: 0.30, pellets: 7, mag: 5,  reload: 2.1, range: 300,  color: '#ffb347', len: 30 },
  rifle:   { name: 'Rifle',   tier: 3, damage: 20, fireRate: 0.15, speed: 1300, spread: 0.04, pellets: 1, mag: 25, reload: 1.9, range: 750,  color: '#9dff6f', len: 34 },
  sniper:  { name: 'Sniper',  tier: 4, damage: 75, fireRate: 1.2,  speed: 2200, spread: 0.0,  pellets: 1, mag: 4,  reload: 2.5, range: 1300, color: '#ff6fd8', len: 42 },
};
const LOOT_WEAPONS = ['smg', 'smg', 'smg', 'shotgun', 'shotgun', 'rifle', 'rifle', 'sniper'];

const BOT_NAMES = ['Blaze', 'Viper', 'Nova', 'Ghost', 'Rex', 'Echo', 'Storm', 'Kai', 'Zara', 'Bolt',
  'Raven', 'Ace', 'Jinx', 'Onyx', 'Sage', 'Fang', 'Luna', 'Titan', 'Hex', 'Dash'];
const BOT_COLORS = ['#e2413b', '#f58f29', '#f5d02f', '#7ed957', '#2ec4b6', '#9b5de5', '#f15bb5', '#ff8a8a', '#b0b0b0', '#a1887f'];

// Each phase: wait (seconds before it starts shrinking), shrink (seconds to shrink),
// r (radius of the next safe circle) and dmg (damage per second outside it)
const ZONE_PHASES = [
  { wait: 25, shrink: 25, r: 1300, dmg: 2 },
  { wait: 20, shrink: 20, r: 800,  dmg: 4 },
  { wait: 18, shrink: 18, r: 450,  dmg: 7 },
  { wait: 15, shrink: 15, r: 220,  dmg: 11 },
  { wait: 12, shrink: 15, r: 60,   dmg: 16 },
  { wait: 10, shrink: 10, r: 0,    dmg: 25 },
];

// ======================================================
// Helpers
// ======================================================
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Does the line segment (x1,y1)-(x2,y2) touch a circle?
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1) : 0;
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
  return px * px + py * py < r * r;
}

// Does the line segment cross a rectangle? (Liang–Barsky clipping)
function segRect(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// ======================================================
// Screen
// ======================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = 0, viewH = 0, dpr = 1, zoom = 1, ui = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  zoom = Math.max(viewW, viewH) / VIEW_SIZE;
  ui = clamp(Math.min(viewW, viewH) / 700, 0.7, 1.15);
}
window.addEventListener('resize', resize);
resize();

function text(str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(str, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ======================================================
// Sound
// ======================================================
let audioCtx = null;
function beep(freq, duration, type = 'sine', volume = 0.1) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* no audio */ }
}
let lastShotSound = 0;
const sfx = {
  shot(f) {
    const d = player ? Math.hypot(f.x - player.x, f.y - player.y) : 0;
    if (d > 800 || game.time - lastShotSound < 0.05) return;
    lastShotSound = game.time;
    beep(f.weapon === 'sniper' ? 90 : 160 + Math.random() * 40, 0.07, 'square', 0.06 * (1 - d / 800));
  },
  hit: () => beep(1200, 0.04, 'square', 0.05),
  hurt: () => beep(120, 0.12, 'sawtooth', 0.08),
  pickup: () => { beep(700, 0.06); setTimeout(() => beep(1050, 0.08), 60); },
  elim: () => { beep(500, 0.08, 'triangle', 0.12); setTimeout(() => beep(750, 0.15, 'triangle', 0.12), 80); },
  zone: () => beep(220, 0.6, 'sawtooth', 0.06),
};

// ======================================================
// Saved stats
// ======================================================
function loadStats() {
  try { return Object.assign({ games: 0, wins: 0, kills: 0, bestPlace: 0 }, JSON.parse(localStorage.getItem('lz_stats') || '{}')); }
  catch (e) { return { games: 0, wins: 0, kills: 0, bestPlace: 0 }; }
}
function saveStats() { try { localStorage.setItem('lz_stats', JSON.stringify(stats)); } catch (e) { /* ignore */ } }
const stats = loadStats();

// ======================================================
// World state
// ======================================================
let walls = [], houses = [], rocks = [], trees = [], grass = [], loot = [];
let fighters = [], bullets = [], particles = [], feed = [], toasts = [];
let player = null;
let zone = null;
const cam = { x: MAP / 2, y: MAP / 2 };

const game = {
  phase: 'menu',   // menu | countdown | play | over
  phaseTime: 0,
  time: 0,
  result: null,    // 'win' | 'lose'
  placement: 0,
  killer: '',
  shake: 0,
};

// ---------- Map generation ----------
function insideAnyHouse(x, y, m) {
  return houses.some(h => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m);
}

function freeSpot(x, y, r) {
  if (insideAnyHouse(x, y, r)) return false;
  for (const o of rocks) if (Math.hypot(o.x - x, o.y - y) < o.r + r) return false;
  for (const t of trees) if (Math.hypot(t.x - x, t.y - y) < t.r + r) return false;
  return true;
}

function buildHouseWalls(x, y, w, h) {
  const T = 14, door = 72;
  const midX = x + w / 2, midY = y + h / 2;
  walls.push({ x, y, w, h: T });                                                  // top
  walls.push({ x, y, w: T, h });                                                  // left
  walls.push({ x, y: y + h - T, w: midX - door / 2 - x, h: T });                  // bottom-left
  walls.push({ x: midX + door / 2, y: y + h - T, w: x + w - (midX + door / 2), h: T }); // bottom-right
  walls.push({ x: x + w - T, y, w: T, h: midY - door / 2 - y });                  // right-top
  walls.push({ x: x + w - T, y: midY + door / 2, w: T, h: y + h - (midY + door / 2) }); // right-bottom
}

function randomLoot(x, y) {
  const r = Math.random();
  if (r < 0.5) return { x, y, kind: 'weapon', weapon: LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)] };
  if (r < 0.8) return { x, y, kind: 'med' };
  return { x, y, kind: 'armor' };
}

function generateWorld() {
  walls = []; houses = []; rocks = []; trees = []; grass = []; loot = [];

  let tries = 0;
  while (houses.length < 10 && tries++ < 600) {
    const w = rand(240, 320), h = rand(190, 250);
    const x = rand(200, MAP - 200 - w), y = rand(200, MAP - 200 - h);
    const ok = houses.every(o => x > o.x + o.w + 160 || x + w < o.x - 160 || y > o.y + o.h + 160 || y + h < o.y - 160);
    if (ok) { houses.push({ x, y, w, h }); buildHouseWalls(x, y, w, h); }
  }

  tries = 0;
  while (rocks.length < 50 && tries++ < 3000) {
    const r = rand(22, 48), x = rand(80, MAP - 80), y = rand(80, MAP - 80);
    if (freeSpot(x, y, r + 40)) rocks.push({ x, y, r });
  }

  tries = 0;
  while (trees.length < 90 && tries++ < 4000) {
    const canopy = rand(42, 60), x = rand(80, MAP - 80), y = rand(80, MAP - 80);
    if (freeSpot(x, y, canopy * 0.7)) trees.push({ x, y, r: 12, canopy });
  }

  for (const h of houses) {
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) loot.push(randomLoot(rand(h.x + 35, h.x + h.w - 35), rand(h.y + 35, h.y + h.h - 35)));
  }
  tries = 0;
  let outdoor = 0;
  while (outdoor < 45 && tries++ < 2000) {
    const x = rand(100, MAP - 100), y = rand(100, MAP - 100);
    if (freeSpot(x, y, 24)) { loot.push(randomLoot(x, y)); outdoor++; }
  }

  for (let i = 0; i < 1100; i++) grass.push({ x: rand(0, MAP), y: rand(0, MAP), s: rand(3, 6) });
}

// ---------- Fighters ----------
function makeFighter(x, y, isPlayer, name, color) {
  return {
    x, y, r: FIGHTER_R, hp: 100, armor: 0,
    weapon: 'pistol', mag: WEAPONS.pistol.mag, reloadT: 0, cooldown: 0,
    angle: rand(0, Math.PI * 2), alive: true, isPlayer, name, color,
    kills: 0, hitFlash: 0, flash: 0, lastHit: 0,
    ai: { target: null, goal: null, think: 0, strafe: 1, strafeT: 0, stuckT: 0, lastX: x, lastY: y, aimErr: 0, reaction: 0, unstick: 0, ux: 0, uy: 0 },
  };
}

function spawnPoint() {
  for (let i = 0; i < 400; i++) {
    const x = rand(150, MAP - 150), y = rand(150, MAP - 150);
    if (!freeSpot(x, y, 30)) continue;
    if (fighters.every(o => Math.hypot(o.x - x, o.y - y) > 450)) return { x, y };
  }
  for (;;) {
    const x = rand(150, MAP - 150), y = rand(150, MAP - 150);
    if (freeSpot(x, y, 30)) return { x, y };
  }
}

const aliveCount = () => fighters.reduce((n, f) => n + (f.alive ? 1 : 0), 0);

function newGame(phase = 'countdown') {
  generateWorld();
  fighters = []; bullets = []; particles = []; feed = []; toasts = [];
  const p = spawnPoint();
  player = makeFighter(p.x, p.y, true, 'You', '#3fa9ff');
  fighters.push(player);
  for (let i = 0; i < BOT_COUNT; i++) {
    const s = spawnPoint();
    fighters.push(makeFighter(s.x, s.y, false, BOT_NAMES[i % BOT_NAMES.length], BOT_COLORS[i % BOT_COLORS.length]));
  }
  zone = { x: MAP / 2, y: MAP / 2, r: MAP * 0.75, dmg: 1, phase: 0, state: 'wait', timer: 0, next: null, from: null };
  setupNextZone();
  Object.assign(game, { phase, phaseTime: 0, result: null, placement: 0, killer: '', shake: 0 });
  cam.x = player.x;
  cam.y = player.y;
}

// ======================================================
// Zone
// ======================================================
function setupNextZone() {
  const ph = ZONE_PHASES[zone.phase];
  if (!ph) { zone.next = null; return; }
  const maxOff = Math.max(0, zone.r - ph.r) * 0.8;
  const a = rand(0, Math.PI * 2), d = Math.random() * maxOff;
  zone.next = {
    x: clamp(zone.x + Math.cos(a) * d, 300, MAP - 300),
    y: clamp(zone.y + Math.sin(a) * d, 300, MAP - 300),
    r: ph.r,
  };
  zone.state = 'wait';
  zone.timer = ph.wait;
  if (zone.phase > 0) toast('New safe zone marked on your map');
}

function updateZone(dt) {
  const ph = ZONE_PHASES[zone.phase];
  if (!ph) return;
  zone.timer -= dt;
  if (zone.state === 'wait' && zone.timer <= 0) {
    zone.state = 'shrink';
    zone.timer = ph.shrink;
    zone.from = { x: zone.x, y: zone.y, r: zone.r };
    zone.dmg = ph.dmg;
    toast('The zone is closing in!');
    sfx.zone();
  } else if (zone.state === 'shrink') {
    const t = 1 - Math.max(0, zone.timer) / ph.shrink;
    zone.x = lerp(zone.from.x, zone.next.x, t);
    zone.y = lerp(zone.from.y, zone.next.y, t);
    zone.r = lerp(zone.from.r, zone.next.r, t);
    if (zone.timer <= 0) {
      zone.phase++;
      setupNextZone();
    }
  }
}

const outsideZone = (f, margin = 0) => Math.hypot(f.x - zone.x, f.y - zone.y) > zone.r - margin;

// ======================================================
// Combat
// ======================================================
function fire(f) {
  const w = WEAPONS[f.weapon];
  if (f.reloadT > 0 || f.cooldown > 0) return;
  if (f.mag <= 0) { startReload(f); return; }
  f.cooldown = w.fireRate;
  f.mag--;
  f.flash = 0.05;
  for (let i = 0; i < w.pellets; i++) {
    const a = f.angle + (Math.random() - 0.5) * w.spread * 2;
    bullets.push({
      x: f.x + Math.cos(f.angle) * (f.r + 8),
      y: f.y + Math.sin(f.angle) * (f.r + 8),
      vx: Math.cos(a) * w.speed,
      vy: Math.sin(a) * w.speed,
      life: w.range / w.speed,
      dmg: w.damage,
      owner: f,
      color: w.color,
    });
  }
  sfx.shot(f);
  if (f.mag === 0) startReload(f);
}

function startReload(f) {
  const w = WEAPONS[f.weapon];
  if (f.reloadT > 0 || f.mag === w.mag) return;
  f.reloadT = w.reload;
}

function damage(f, amount, src) {
  if (!f.alive) return;
  if (src && !src.isPlayer) amount *= BOT_DAMAGE;
  if (f.armor > 0 && src) {          // armour soaks up most of each bullet (not zone damage)
    const absorbed = Math.min(f.armor, amount * 0.6);
    f.armor -= absorbed;
    amount -= absorbed;
  }
  f.hp -= amount;
  f.hitFlash = 0.1;
  f.lastHit = 2;
  if (f.isPlayer && src) { game.shake = Math.max(game.shake, 6); sfx.hurt(); }
  if (src && src.isPlayer) sfx.hit();
  if (!f.isPlayer && src && src.alive && src !== f) { f.ai.target = src; f.ai.reaction = Math.min(f.ai.reaction, 0.35); }
  if (f.hp <= 0) kill(f, src);
}

function kill(f, src) {
  f.alive = false;
  f.hp = 0;
  if (src && src !== f) src.kills++;
  feed.unshift({
    text: src ? `${src.name} eliminated ${f.name}` : `${f.name} was caught in the zone`,
    t: 6,
    mine: src === player || f === player,
  });
  if (feed.length > 5) feed.pop();

  if (f.weapon !== 'pistol') loot.push({ x: f.x + rand(-12, 12), y: f.y + rand(-12, 12), kind: 'weapon', weapon: f.weapon });
  loot.push({ x: f.x + rand(-12, 12), y: f.y + rand(-12, 12), kind: 'med' });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), s = rand(60, 260);
    particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), color: f.color, size: rand(3, 7) });
  }

  if (src === player) { sfx.elim(); toast(`You eliminated ${f.name}!`); }

  if (f === player) {
    game.placement = aliveCount() + 1;
    game.killer = src ? src.name : 'the zone';
    endGame(false);
  } else if (player.alive && aliveCount() === 1) {
    endGame(true);
  }
}

function endGame(won) {
  if (game.phase === 'over') return;
  game.phase = 'over';
  game.phaseTime = 0;
  game.result = won ? 'win' : 'lose';
  if (won) game.placement = 1;
  stats.games++;
  stats.kills += player.kills;
  if (won) stats.wins++;
  if (!stats.bestPlace || game.placement < stats.bestPlace) stats.bestPlace = game.placement;
  saveStats();
}

function toast(str) {
  toasts.push({ text: str, t: 2.4 });
  if (toasts.length > 3) toasts.shift();
}

// ======================================================
// Movement & collisions
// ======================================================
function pushOutRect(f, w) {
  const cx = clamp(f.x, w.x, w.x + w.w), cy = clamp(f.y, w.y, w.y + w.h);
  const dx = f.x - cx, dy = f.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= f.r * f.r) return;
  if (d2 === 0) { // centre is inside the wall: push out the shortest way
    const left = f.x - w.x, right = w.x + w.w - f.x, top = f.y - w.y, bottom = w.y + w.h - f.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) f.x = w.x - f.r;
    else if (m === right) f.x = w.x + w.w + f.r;
    else if (m === top) f.y = w.y - f.r;
    else f.y = w.y + w.h + f.r;
  } else {
    const d = Math.sqrt(d2);
    f.x = cx + (dx / d) * f.r;
    f.y = cy + (dy / d) * f.r;
  }
}

function pushOutCircle(f, c) {
  const dx = f.x - c.x, dy = f.y - c.y;
  const d = Math.hypot(dx, dy), min = f.r + c.r;
  if (d < min && d > 0) {
    f.x = c.x + (dx / d) * min;
    f.y = c.y + (dy / d) * min;
  }
}

function resolveCollisions(f) {
  for (const w of walls) {
    if (Math.abs(f.x - (w.x + w.w / 2)) < w.w / 2 + 40 && Math.abs(f.y - (w.y + w.h / 2)) < w.h / 2 + 40) pushOutRect(f, w);
  }
  for (const r of rocks) pushOutCircle(f, r);
  for (const t of trees) pushOutCircle(f, t);
  f.x = clamp(f.x, f.r, MAP - f.r);
  f.y = clamp(f.y, f.r, MAP - f.r);
}

function moveFighter(f, mx, my, speed, dt) {
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  f.x += mx * speed * dt;
  f.y += my * speed * dt;
  resolveCollisions(f);
}

function separateFighters() {
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d < min && d > 0) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
}

function segBlocked(x1, y1, x2, y2, includeTrunks) {
  for (const w of walls) if (segRect(x1, y1, x2, y2, w)) return true;
  for (const r of rocks) if (segCircle(x1, y1, x2, y2, r.x, r.y, r.r)) return true;
  if (includeTrunks) for (const t of trees) if (segCircle(x1, y1, x2, y2, t.x, t.y, t.r)) return true;
  return false;
}

const hasLOS = (a, b) => !segBlocked(a.x, a.y, b.x, b.y, false);
const hiddenInTree = f => trees.some(t => Math.hypot(t.x - f.x, t.y - f.y) < t.canopy * 0.75);

// ======================================================
// Bot AI
// ======================================================
function chooseBotGoal(f) {
  const safe = zone.next || zone;
  const wantWeapon = WEAPONS[f.weapon].tier < 3;
  const wantMed = f.hp < 70, wantArmor = f.armor < 50;
  let best = null, bestD = 750;
  for (const l of loot) {
    const useful = (l.kind === 'weapon' && wantWeapon && WEAPONS[l.weapon].tier > WEAPONS[f.weapon].tier) ||
                   (l.kind === 'med' && wantMed) || (l.kind === 'armor' && wantArmor);
    if (!useful) continue;
    if (Math.hypot(l.x - safe.x, l.y - safe.y) > safe.r + 50) continue;
    const d = Math.hypot(l.x - f.x, l.y - f.y);
    if (d < bestD) { bestD = d; best = l; }
  }
  if (best) return { x: best.x, y: best.y };
  const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * safe.r * 0.7;
  return { x: clamp(safe.x + Math.cos(a) * r, 100, MAP - 100), y: clamp(safe.y + Math.sin(a) * r, 100, MAP - 100) };
}

function updateBot(f, dt) {
  const ai = f.ai;
  const w = WEAPONS[f.weapon];
  ai.think -= dt;

  if (ai.think <= 0) {
    ai.think = rand(0.2, 0.4);
    // look for the closest enemy we can actually see
    let best = null, bestD = BOT_SIGHT;
    for (const o of fighters) {
      if (o === f || !o.alive) continue;
      const d = dist(f, o);
      if (d >= bestD) continue;
      if (d > 180 && hiddenInTree(o)) continue;
      if (!hasLOS(f, o)) continue;
      best = o; bestD = d;
    }
    if (ai.target && ai.target.alive && !best && dist(f, ai.target) < BOT_SIGHT && hasLOS(f, ai.target)) best = ai.target;
    if (best !== ai.target) ai.reaction = rand(0.45, 0.9);
    ai.target = best;

    const safe = zone.next || zone;
    const headingOut = Math.hypot(f.x - safe.x, f.y - safe.y) > safe.r * 0.85 && (zone.state === 'shrink' || zone.timer < 10);
    if (outsideZone(f, 60) || headingOut) {
      ai.goal = { x: safe.x + rand(-40, 40), y: safe.y + rand(-40, 40) };
    } else if (!ai.goal || Math.hypot(f.x - ai.goal.x, f.y - ai.goal.y) < 40) {
      ai.goal = chooseBotGoal(f);
    }
  }

  let mx = 0, my = 0;
  const t = ai.target;
  if (t && t.alive) {
    const d = dist(f, t);
    const ang = Math.atan2(t.y - f.y, t.x - f.x);
    ai.aimErr = clamp(ai.aimErr + (Math.random() - 0.5) * dt * 4, -0.3, 0.3);
    f.angle = ang + ai.aimErr;

    const pref = w.range * 0.55;
    const fwd = d > pref + 60 ? 1 : d < pref - 60 ? -1 : 0;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = rand(0.6, 1.6); }
    mx = Math.cos(ang) * fwd + Math.cos(ang + Math.PI / 2) * ai.strafe * 0.8;
    my = Math.sin(ang) * fwd + Math.sin(ang + Math.PI / 2) * ai.strafe * 0.8;
    if (outsideZone(f, 20)) {
      const za = Math.atan2(zone.y - f.y, zone.x - f.x);
      mx = Math.cos(za); my = Math.sin(za);
    }
    ai.reaction -= dt;
    ai.hold = Math.max(0, (ai.hold || 0) - dt);
    if (Math.random() < dt * 1.2) ai.hold = rand(0.3, 0.9); // bots pause between bursts
    if (ai.reaction <= 0 && ai.hold <= 0 && d < w.range * 0.95) fire(f);
  } else if (ai.goal) {
    const ang = Math.atan2(ai.goal.y - f.y, ai.goal.x - f.x);
    mx = Math.cos(ang); my = Math.sin(ang);
    f.angle = ang;
    if (f.mag < w.mag * 0.4) startReload(f);
  }

  // Getting stuck on a wall or rock? Wiggle free in a random direction.
  ai.stuckT += dt;
  if (ai.stuckT > 0.6) {
    const moved = Math.hypot(f.x - ai.lastX, f.y - ai.lastY);
    if (moved < 20 && (mx || my) && !(t && t.alive)) {
      const a = rand(0, Math.PI * 2);
      ai.unstick = 0.6; ai.ux = Math.cos(a); ai.uy = Math.sin(a);
      ai.goal = null;
    }
    ai.lastX = f.x; ai.lastY = f.y; ai.stuckT = 0;
  }
  if (ai.unstick > 0) { ai.unstick -= dt; mx = ai.ux; my = ai.uy; }

  moveFighter(f, mx, my, BOT_SPEED, dt);
}

// ======================================================
// Player input
// ======================================================
const keys = {};
const mouse = { x: 0, y: 0, down: false };
const sticks = {
  move: { id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 },
  aim:  { id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 },
};
let usingTouch = false;

function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (sticks.move.id !== null) { mx = sticks.move.dx; my = sticks.move.dy; }
  moveFighter(player, mx, my, PLAYER_SPEED, dt);

  if (usingTouch) {
    const a = sticks.aim;
    const mag = Math.hypot(a.dx, a.dy);
    if (a.id !== null && mag > 0.15) player.angle = Math.atan2(a.dy, a.dx);
    if (a.id !== null && mag > 0.55) fire(player);
  } else {
    const sx = viewW / 2 + (player.x - cam.x) * zoom;
    const sy = viewH / 2 + (player.y - cam.y) * zoom;
    player.angle = Math.atan2(mouse.y - sy, mouse.x - sx);
    if (mouse.down) fire(player);
  }
  if (keys.KeyR) startReload(player);
}

// ======================================================
// Update
// ======================================================
function updateFighterCommon(f, dt) {
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt);
  f.flash = Math.max(0, f.flash - dt);
  f.lastHit = Math.max(0, f.lastHit - dt);
  if (f.reloadT > 0) {
    f.reloadT -= dt;
    if (f.reloadT <= 0) { f.reloadT = 0; f.mag = WEAPONS[f.weapon].mag; }
  }
  if (outsideZone(f)) damage(f, zone.dmg * dt, null);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    let hit = false;
    for (const f of fighters) {
      if (!f.alive || f === b.owner) continue;
      if (Math.abs(f.x - nx) > 80 || Math.abs(f.y - ny) > 80) continue;
      if (segCircle(b.x, b.y, nx, ny, f.x, f.y, f.r)) {
        damage(f, b.dmg, b.owner);
        spark(nx, ny, '#ff4b4b', 6);
        hit = true;
        break;
      }
    }
    if (!hit && segBlocked(b.x, b.y, nx, ny, true)) { spark(nx, ny, '#ddd', 4); hit = true; }
    b.x = nx; b.y = ny;
    b.life -= dt;
    if (hit || b.life <= 0) bullets.splice(i, 1);
  }
}

function spark(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 160);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.35), color, size: rand(2, 4) });
  }
}

function tryPickup(f, l) {
  if (l.kind === 'weapon') {
    if (WEAPONS[l.weapon].tier <= WEAPONS[f.weapon].tier) return false;
    f.weapon = l.weapon;
    f.mag = WEAPONS[l.weapon].mag;
    f.reloadT = 0;
    if (f.isPlayer) { toast(`Picked up ${WEAPONS[l.weapon].name}`); sfx.pickup(); }
    return true;
  }
  if (l.kind === 'med') {
    if (f.hp >= 100) return false;
    f.hp = Math.min(100, f.hp + 50);
    if (f.isPlayer) { toast('+50 health'); sfx.pickup(); }
    return true;
  }
  if (l.kind === 'armor') {
    if (f.armor >= 100) return false;
    f.armor = Math.min(100, f.armor + 50);
    if (f.isPlayer) { toast('+50 armour'); sfx.pickup(); }
    return true;
  }
  return false;
}

function updatePickups() {
  for (const f of fighters) {
    if (!f.alive) continue;
    for (let i = loot.length - 1; i >= 0; i--) {
      const l = loot[i];
      if (Math.abs(l.x - f.x) > 32 || Math.abs(l.y - f.y) > 32) continue;
      if (Math.hypot(l.x - f.x, l.y - f.y) > f.r + 14) continue;
      if (tryPickup(f, l)) loot.splice(i, 1);
    }
  }
}

function update(dt) {
  game.time += dt;
  game.phaseTime += dt;
  game.shake = Math.max(0, game.shake - dt * 30);

  if (game.phase === 'menu') {
    cam.x = MAP / 2 + Math.sin(game.time * 0.12) * 700;
    cam.y = MAP / 2 + Math.cos(game.time * 0.09) * 500;
    return;
  }
  if (game.phase === 'countdown') {
    if (game.phaseTime >= 3) {
      game.phase = 'play';
      game.phaseTime = 0;
      toast('Find loot, stay in the zone, survive!');
    }
    cam.x = player.x; cam.y = player.y;
    return;
  }

  updateZone(dt);
  if (player.alive && game.phase === 'play') updatePlayer(dt);
  for (const f of fighters) if (f.alive && !f.isPlayer) updateBot(f, dt);
  for (const f of fighters) if (f.alive) updateFighterCommon(f, dt);
  separateFighters();
  updateBullets(dt);
  updatePickups();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) feed.splice(i, 1); }
  for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= dt; if (toasts[i].t <= 0) toasts.splice(i, 1); }

  const k = Math.min(1, dt * 8);
  cam.x += (player.x - cam.x) * k;
  cam.y += (player.y - cam.y) * k;
}

// ======================================================
// Drawing — world
// ======================================================
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const visible = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

function drawLoot(l) {
  const pulse = 1 + Math.sin(game.time * 4 + l.x) * 0.1;
  const color = l.kind === 'weapon' ? WEAPONS[l.weapon].color : l.kind === 'med' ? '#ff5a5a' : '#4da3ff';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(l.x, l.y, 22 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  if (l.kind === 'weapon') {
    const w = WEAPONS[l.weapon];
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(l.x - w.len / 2, l.y - 4, w.len, 8);
    ctx.fillStyle = w.color;
    ctx.fillRect(l.x - w.len / 2, l.y - 4, 10, 12);
  } else if (l.kind === 'med') {
    ctx.fillStyle = '#fff';
    roundRect(l.x - 10, l.y - 10, 20, 20, 4); ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.fillRect(l.x - 2.5, l.y - 7, 5, 14);
    ctx.fillRect(l.x - 7, l.y - 2.5, 14, 5);
  } else {
    ctx.fillStyle = '#4da3ff';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 12);
    ctx.lineTo(l.x + 10, l.y - 7);
    ctx.lineTo(l.x + 8, l.y + 5);
    ctx.lineTo(l.x, l.y + 12);
    ctx.lineTo(l.x - 8, l.y + 5);
    ctx.lineTo(l.x - 10, l.y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d6ecff'; ctx.lineWidth = 2; ctx.stroke();
  }
}

function drawFighter(f) {
  const w = WEAPONS[f.weapon];
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(f.x + 3, f.y + 5, f.r, f.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(f.r - 6, -4, w.len, 8);
  ctx.fillStyle = w.color;
  ctx.fillRect(f.r - 6, -4, 8, 8);
  if (f.flash > 0) {
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath(); ctx.arc(f.r - 6 + w.len + 6, 0, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath(); ctx.arc(f.r - 1, 6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(f.r + 9, -3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, f.r, 0, Math.PI * 2);
  ctx.fillStyle = f.hitFlash > 0 ? '#fff' : f.color;
  ctx.fill();
  ctx.lineWidth = f.isPlayer ? 4 : 2.5;
  ctx.strokeStyle = f.isPlayer ? '#fff' : 'rgba(0,0,0,0.5)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-f.r + 2, -7, 6, 14);
  ctx.restore();

  if (!f.isPlayer && f.lastHit > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(f.x - 20, f.y - f.r - 14, 40, 6);
    ctx.fillStyle = '#5be35b';
    ctx.fillRect(f.x - 20, f.y - f.r - 14, 40 * (f.hp / 100), 6);
    if (f.armor > 0) { ctx.fillStyle = '#4da3ff'; ctx.fillRect(f.x - 20, f.y - f.r - 18, 40 * (f.armor / 100), 3); }
  }
}

function drawWorld() {
  const shx = rand(-1, 1) * game.shake, shy = rand(-1, 1) * game.shake;
  const cx = cam.x + shx, cy = cam.y + shy;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (viewW / 2 - cx * zoom), dpr * (viewH / 2 - cy * zoom));
  view = { x0: cx - viewW / 2 / zoom, y0: cy - viewH / 2 / zoom, x1: cx + viewW / 2 / zoom, y1: cy + viewH / 2 / zoom };

  // water around the island
  ctx.fillStyle = '#1f5f8b';
  ctx.fillRect(view.x0 - 50, view.y0 - 50, view.x1 - view.x0 + 100, view.y1 - view.y0 + 100);
  // ground
  ctx.fillStyle = '#e3cf8f';
  ctx.fillRect(-40, -40, MAP + 80, MAP + 80);
  ctx.fillStyle = '#4f8a3c';
  ctx.fillRect(0, 0, MAP, MAP);
  const T = 200;
  ctx.fillStyle = '#4a8338';
  for (let i = Math.max(0, Math.floor(view.x0 / T)); i * T < Math.min(MAP, view.x1); i++) {
    for (let j = Math.max(0, Math.floor(view.y0 / T)); j * T < Math.min(MAP, view.y1); j++) {
      if ((i + j) % 2) ctx.fillRect(i * T, j * T, T, T);
    }
  }
  ctx.strokeStyle = '#3d7230';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const g of grass) {
    if (!visible(g.x, g.y, 10)) continue;
    ctx.moveTo(g.x - g.s, g.y); ctx.lineTo(g.x, g.y - g.s * 1.5); ctx.lineTo(g.x + g.s, g.y);
  }
  ctx.stroke();

  // house floors
  for (const h of houses) {
    if (!visible(h.x + h.w / 2, h.y + h.h / 2, Math.max(h.w, h.h))) continue;
    ctx.fillStyle = '#9a7a55';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = h.y + 24; y < h.y + h.h; y += 24) { ctx.moveTo(h.x, y); ctx.lineTo(h.x + h.w, y); }
    ctx.stroke();
  }

  for (const l of loot) if (visible(l.x, l.y, 30)) drawLoot(l);

  ctx.lineCap = 'round';
  for (const b of bullets) {
    if (!visible(b.x, b.y, 40)) continue;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
    ctx.stroke();
  }

  for (const f of fighters) if (f.alive && visible(f.x, f.y, 60)) drawFighter(f);

  for (const w of walls) {
    if (!visible(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) continue;
    ctx.fillStyle = '#4b4f57';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#6b7079';
    ctx.fillRect(w.x, w.y, w.w, Math.min(5, w.h));
  }

  for (const r of rocks) {
    if (!visible(r.x, r.y, r.r)) continue;
    ctx.fillStyle = '#7d8088';
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#979aa3';
    ctx.beginPath(); ctx.arc(r.x - r.r * 0.25, r.y - r.r * 0.25, r.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  // tree canopies go on top, so you can hide underneath them
  for (const t of trees) {
    if (!visible(t.x, t.y, t.canopy)) continue;
    const underneath = player && player.alive && Math.hypot(player.x - t.x, player.y - t.y) < t.canopy;
    ctx.globalAlpha = underneath ? 0.5 : 0.93;
    ctx.fillStyle = '#2f6b2a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.canopy, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c8034';
    ctx.beginPath(); ctx.arc(t.x - t.canopy * 0.2, t.y - t.canopy * 0.2, t.canopy * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const p of particles) {
    if (!visible(p.x, p.y, 10)) continue;
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // the storm outside the safe zone
  ctx.beginPath();
  ctx.rect(view.x0 - 100, view.y0 - 100, view.x1 - view.x0 + 200, view.y1 - view.y0 + 200);
  ctx.arc(zone.x, zone.y, Math.max(0, zone.r), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(110,40,200,0.3)';
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(200,130,255,0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(zone.x, zone.y, Math.max(0, zone.r), 0, Math.PI * 2); ctx.stroke();
  if (zone.next && zone.next.r > 0) {
    ctx.setLineDash([24, 16]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(zone.next.x, zone.next.y, zone.next.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ======================================================
// Drawing — HUD
// ======================================================
function drawMinimap() {
  const size = 150 * ui, x0 = viewW - size - 14, y0 = 14, s = size / MAP;
  ctx.fillStyle = 'rgba(20,60,30,0.85)';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#9a7a55';
  for (const h of houses) ctx.fillRect(x0 + h.x * s, y0 + h.y * s, Math.max(2, h.w * s), Math.max(2, h.h * s));
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
  ctx.strokeStyle = '#c78bff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x0 + zone.x * s, y0 + zone.y * s, Math.max(0, zone.r * s), 0, Math.PI * 2); ctx.stroke();
  if (zone.next && zone.next.r > 0) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x0 + zone.next.x * s, y0 + zone.next.y * s, zone.next.r * s, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (player) {
    const px = x0 + player.x * s, py = y0 + player.y * s;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(player.angle) * 9, py + Math.sin(player.angle) * 9); ctx.stroke();
    ctx.fillStyle = '#3fa9ff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, size, size);
}

function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) { ctx.fillStyle = color; roundRect(x, y, Math.max(h, w * frac), h, h / 2); ctx.fill(); }
}

function drawStick(s) {
  if (s.id === null) return;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(s.ox, s.oy, STICK_R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(s.ox + s.dx * STICK_R, s.oy + s.dy * STICK_R, 26, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (game.phase !== 'menu' && player.alive && outsideZone(player)) {
    const a = 0.35 + Math.sin(game.time * 6) * 0.15;
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.3, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.7);
    g.addColorStop(0, 'rgba(160,40,220,0)');
    g.addColorStop(1, `rgba(160,40,220,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    text('You are outside the zone!', viewW / 2, viewH * 0.22, 22 * ui, '#e6b3ff', 'center');
  }

  if (game.phase === 'menu') return;

  // alive & kills
  const cx = viewW / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(cx - 120 * ui, 12, 240 * ui, 40 * ui, 12); ctx.fill();
  text(`ALIVE ${aliveCount()}`, cx - 60 * ui, 12 + 20 * ui, 19 * ui, '#fff', 'center');
  text(`KILLS ${player.kills}`, cx + 60 * ui, 12 + 20 * ui, 19 * ui, '#ffd34d', 'center');
  let zt;
  if (!ZONE_PHASES[zone.phase]) zt = 'Final zone';
  else if (zone.state === 'wait') zt = `Zone closes in ${Math.ceil(zone.timer)}s`;
  else zt = 'Zone closing!';
  text(zt, cx, 12 + 56 * ui, 15 * ui, zone.state === 'shrink' ? '#e6b3ff' : '#ddd', 'center', '600');

  // kill feed
  let fy = 24;
  for (const f of feed) {
    ctx.globalAlpha = clamp(f.t, 0, 1);
    text(f.text, 14, fy, 14 * ui, f.mine ? '#ffd34d' : '#fff', 'left', '600');
    fy += 22 * ui;
  }
  ctx.globalAlpha = 1;

  drawMinimap();

  // health, armour, weapon
  if (player.alive) {
    const w = WEAPONS[player.weapon];
    const bw = Math.min(320, viewW * 0.5), bx = (viewW - bw) / 2;
    const by = viewH - 34 * ui;
    bar(bx, by, bw, 14 * ui, player.hp / 100, player.hp > 35 ? '#5be35b' : '#ff4b4b');
    text(`${Math.ceil(player.hp)}`, bx + bw + 8, by + 7 * ui, 14 * ui, '#fff');
    bar(bx, by - 12 * ui, bw, 7 * ui, player.armor / 100, '#4da3ff');
    const ammo = player.reloadT > 0 ? 'Reloading...' : `${player.mag} / ${w.mag}`;
    text(`${w.name}`, bx, by - 30 * ui, 18 * ui, w.color, 'left');
    text(ammo, bx + bw, by - 30 * ui, 16 * ui, player.reloadT > 0 ? '#ffd34d' : '#fff', 'right');
    if (player.reloadT > 0) {
      bar(bx, by - 46 * ui, bw, 4, 1 - player.reloadT / w.reload, '#ffd34d');
    }
  }

  // messages
  let ty = viewH * 0.3;
  for (const t of toasts) {
    ctx.globalAlpha = clamp(t.t * 2, 0, 1);
    text(t.text, viewW / 2, ty, 20 * ui, '#fff', 'center');
    ty += 28 * ui;
  }
  ctx.globalAlpha = 1;

  if (game.phase === 'countdown') {
    const n = Math.ceil(3 - game.phaseTime);
    text(n > 0 ? String(n) : 'GO!', viewW / 2, viewH / 2 - 60 * ui, 90 * ui, '#fff', 'center');
    text(`${fighters.length} players. One survivor.`, viewW / 2, viewH / 2 + 10 * ui, 20 * ui, '#ddd', 'center', '600');
  }

  drawStick(sticks.move);
  drawStick(sticks.aim);
  if (usingTouch && game.phase === 'play' && player.alive && sticks.move.id === null && sticks.aim.id === null && game.phaseTime < 8) {
    text('Left thumb: move', viewW * 0.25, viewH * 0.75, 16 * ui, 'rgba(255,255,255,0.8)', 'center', '600');
    text('Right thumb: aim + shoot', viewW * 0.75, viewH * 0.75, 16 * ui, 'rgba(255,255,255,0.8)', 'center', '600');
  }

  // mouse crosshair
  if (!usingTouch && game.phase !== 'over') {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouse.x - 16, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 16, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 16); ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 16);
    ctx.stroke();
  }
}

function drawPanel(lines, accent) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(8,10,20,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  const pw = Math.min(560, viewW - 30), ph = lines.length * 40 * ui + 50;
  const px = (viewW - pw) / 2, py = (viewH - ph) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
  let y = py + 40;
  for (const l of lines) {
    text(l.t, viewW / 2, y, (l.s || 16) * ui * (pw < 400 ? 0.85 : 1), l.c || '#fff', 'center', l.w || 'bold');
    y += (l.gap || 40) * ui;
  }
}

function drawOverlays() {
  const blink = Math.sin(game.time * 4) > -0.3;
  if (game.phase === 'menu') {
    drawPanel([
      { t: 'LAST ZONE', s: 56, c: '#c78bff', gap: 58 },
      { t: '20 players drop in. One walks out.', s: 18, w: '500' },
      { t: 'Loot weapons, armour and medkits. Stay inside the zone.', s: 15, w: '500', c: '#ccd' },
      { t: 'PC: WASD to move, mouse to aim, click to shoot, R to reload', s: 14, w: '500', c: '#bfe8ff', gap: 30 },
      { t: 'Phone: left thumb moves, right thumb aims and shoots', s: 14, w: '500', c: '#bfe8ff' },
      { t: 'Tip: hide under trees, bots can\'t see you from far away', s: 14, w: '500', c: '#9f9' },
      { t: blink ? 'CLICK OR TAP TO DROP IN' : '', s: 24, c: '#7CFC8A', gap: 44 },
      { t: `Wins: ${stats.wins}   Kills: ${stats.kills}   Best place: ${stats.bestPlace ? '#' + stats.bestPlace : '-'}`, s: 14, w: '500', c: '#aaa' },
    ], 'rgba(199,139,255,0.7)');
  } else if (game.phase === 'over' && game.phaseTime > 1) {
    const won = game.result === 'win';
    drawPanel(won ? [
      { t: 'WINNER!', s: 60, c: '#ffd34d', gap: 60 },
      { t: 'Last one standing.', s: 20, w: '500' },
      { t: `Eliminations: ${player.kills}`, s: 22 },
      { t: blink ? 'CLICK OR TAP TO PLAY AGAIN' : '', s: 22, c: '#7CFC8A', gap: 44 },
      { t: `Total wins: ${stats.wins}`, s: 14, w: '500', c: '#aaa' },
    ] : [
      { t: 'ELIMINATED', s: 52, c: '#ff5c5c', gap: 56 },
      { t: `You placed #${game.placement} of ${fighters.length}`, s: 24 },
      { t: `Taken out by ${game.killer}`, s: 17, w: '500', c: '#ddd' },
      { t: `Eliminations: ${player.kills}`, s: 18, w: '500' },
      { t: game.phaseTime > 1.5 && blink ? 'CLICK OR TAP TO PLAY AGAIN' : '', s: 22, c: '#7CFC8A', gap: 44 },
      { t: `Best place: #${stats.bestPlace}   Total wins: ${stats.wins}`, s: 14, w: '500', c: '#aaa' },
    ], won ? 'rgba(255,211,77,0.8)' : 'rgba(255,92,92,0.7)');
  }
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1f5f8b';
  ctx.fillRect(0, 0, viewW, viewH);
  drawWorld();
  drawHUD();
  drawOverlays();
}

// ======================================================
// Input events
// ======================================================
function startOrRestart() {
  if (game.phase === 'menu') { newGame(); return true; }
  if (game.phase === 'over') { if (game.phaseTime > 1.5) newGame(); return true; }
  return false;
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  beep(1, 0.01, 'sine', 0.0001); // unlocks audio on mobile
  usingTouch = e.pointerType === 'touch';
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (startOrRestart()) return;

  if (usingTouch) {
    const s = e.clientX < viewW / 2 ? sticks.move : sticks.aim;
    if (s.id === null) Object.assign(s, { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
  } else if (e.button === 0) {
    mouse.down = true;
  }
});

canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch') { usingTouch = false; mouse.x = e.clientX; mouse.y = e.clientY; return; }
  for (const s of [sticks.move, sticks.aim]) {
    if (s.id !== e.pointerId) continue;
    let dx = (e.clientX - s.ox) / STICK_R, dy = (e.clientY - s.oy) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    s.dx = dx; s.dy = dy;
  }
});

function pointerEnd(e) {
  for (const s of [sticks.move, sticks.aim]) {
    if (s.id === e.pointerId) { s.id = null; s.dx = 0; s.dy = 0; }
  }
  if (e.pointerType !== 'touch') mouse.down = false;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); startOrRestart(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });

// ======================================================
// Start
// ======================================================
newGame('menu');

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
