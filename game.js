/* ---------------- Audio (WebAudio helper) ---------------- */
let audioCtx = null;
function initAudioContext(){ if (audioCtx) return; try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; } }
function ensureAudioResume(){ if (!audioCtx) initAudioContext(); if (!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{}); }
function playBeep(freq, duration=0.12, type='sine', volume=0.12){ if (!audioCtx) initAudioContext(); if (!audioCtx) return; const now = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = volume; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(0.0001, now + duration); o.start(now); o.stop(now + duration + 0.02); }
function playAttack(){ ensureAudioResume(); playBeep(640,0.08,'sawtooth',0.12); setTimeout(()=>playBeep(940,0.06,'sine',0.10),80); }
function playHurt(){ ensureAudioResume(); playBeep(160,0.12,'square',0.16); setTimeout(()=>playBeep(220,0.09,'sawtooth',0.08),40); }
function playWin(){ ensureAudioResume(); const now = audioCtx.currentTime; const freqs=[440,660,880]; const gain = audioCtx.createGain(); gain.gain.value=0.14; gain.connect(audioCtx.destination); const oscs=freqs.map(f=>{const o=audioCtx.createOscillator(); o.type='sine'; o.frequency.value=f; o.connect(gain); return o;}); oscs.forEach(o=>o.start(now)); gain.gain.setValueAtTime(0.14, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7); oscs.forEach(o=>o.stop(now + 0.72)); }
(function attachAutoResume(){ const resume = ()=>{ ensureAudioResume(); document.removeEventListener('pointerdown', resume); document.removeEventListener('keydown', resume); }; document.addEventListener('pointerdown', resume); document.addEventListener('keydown', resume); })();

/* ---------------- storage & log ---------------- */
function readNumber(k,f){ try{ const v=localStorage.getItem(k); if(v===null) return f; const n=Number(v); return isNaN(n)?f:n; }catch(e){return f;} }
function saveNumber(k,v){ try{ localStorage.setItem(k,String(v)); }catch(e){} }
function safeLog(msg){ const el=document.getElementById('log'); const esc=String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); el.innerHTML = '> ' + esc + '<br>' + el.innerHTML; }

/* ---------------- game state ---------------- */
const TOTAL_STAGES = 34;
let coins = readNumber('hc_coins', 0);
let dcCount = readNumber('hc_dcCount', 0);
let dcCost = readNumber('hc_dcCost', 50);
let unlockedStage = readNumber('hc_unlocked', 1) || 1;

const BASE_PLAYER_MAX_HP = 100;
let playerMaxHP = BASE_PLAYER_MAX_HP + dcCount * 25;
let playerHP = playerMaxHP;

let currentStage = 0;
let bossMaxHP = 300;
let bossHP = bossMaxHP;

let bossAlive = false;
let spawnIntervalId = null;
let rafId = null;
let bullets = [];

let bossPhase = 1;
let spiralOffset = 0;
let ultimateUsed = false;
let ultimateActive = false;

/* performance & control */
const MAX_BULLETS = 700;
let moveRafId = null;

/* ---------------- boss definitions (unique per stage) ---------------- */
const bossDefs = [
  { id:'inferno', name:'اينفرنو دراگون', color:'rgba(255,100,60,0.95)', hpMult:1.0, pattern:'fireballs' },
  { id:'shadow',  name:'آسانسین سایه', color:'rgba(160,80,200,0.95)', hpMult:1.05, pattern:'dashes' },
  { id:'slime',   name:'سمی اسلایم', color:'rgba(90,200,110,0.95)', hpMult:1.12, pattern:'poison' },
  { id:'storm',   name:'تایتان طوفان', color:'rgba(80,160,255,0.95)', hpMult:1.18, pattern:'lightning' },
  { id:'mecha',   name:'مکا گولم', color:'rgba(180,180,200,0.95)', hpMult:1.25, pattern:'lasers' },
  { id:'void',    name:'اِووید وُید', color:'rgba(220,60,220,0.95)', hpMult:1.3, pattern:'spiral' },
  { id:'rock',    name:'راک کلنگ', color:'rgba(200,140,80,0.95)', hpMult:1.35, pattern:'boulder' },
  { id:'oracle',  name:'نَبّی برق', color:'rgba(255,240,100,0.95)', hpMult:1.45, pattern:'lightBurst' },
];

let currentBossDef = bossDefs[0];

/* آیتم‌ها و صندوق جایزه */
const itemDefs = [
  { id:"heal", name:"درمان فوری", description:"+40 HP", use: ()=>{ playerHP = Math.min(playerMaxHP, playerHP+40); safeLog("از آیتم درمان فوری استفاده کردی!"); updateUI(); } },
  { id:"shield", name:"سپر موقت", description:"دفع حمله بعدی", use: ()=>{ player.shield = true; safeLog("سپر فعال شد! ضربه بعدی بی‌اثر است."); } },
  { id:"double", name:"آسیب دوبرابر", description:"حمله بعدی دوبرابر دمیج", use: ()=>{ player.doubleDamage = true; safeLog("حمله بعدی دوبرابر خواهد بود!"); } },
  { id:"coinBoost", name:"افزایش سکه", description:"دوبرابر سکه تا آخر فایت", use: ()=>{ player.coinBoost = true; safeLog("تا آخر فایت سکه دو برابر!"); } }
];
let lootboxItem = null;
let lootboxReward = 0;
let playerItems = [];

/* DOM */
const coinsEl = document.getElementById('coins');
const dcCountEl = document.getElementById('dcCount');
const dcCostEl = document.getElementById('dcCost');
const bossHPText = document.getElementById('bossHPText');
const playerHPText = document.getElementById('playerHPText');
const statusText = document.getElementById('statusText');
const currentStageText = document.getElementById('currentStageText');
const bossPhaseTextEl = document.getElementById('bossPhaseText');
const bossWarningEl = document.getElementById('bossWarning');
const bossNameEl = document.getElementById('bossName');
const bossHPFillEl = document.getElementById('bossHPFill');

const canvas = document.getElementById('arenaCanvas');
const ctx = canvas.getContext('2d');
const attackBtn = document.getElementById('attackBtn');
const attackCooldownFill = document.getElementById('attackCooldownFill');
const buyDCBtn = document.getElementById('buyDCBtn');
const retreatBtn = document.getElementById('retreatBtn');
const openStagesBtn = document.getElementById('openStagesBtn');
const stageModal = document.getElementById('stageModal');
const stagesGrid = document.getElementById('stagesGrid');
const closeStageModal = document.getElementById('closeStageModal');
const timingUI = document.getElementById('timingUI');
const pointerEl = document.getElementById('pointer');
const sweetZoneEl = document.getElementById('sweetZone');
const resetBtn = document.getElementById('resetBtn');
const lootboxModal = document.getElementById('lootboxModal');
const lootboxContent = document.getElementById('lootboxContent');
const openLootboxBtn = document.getElementById('openLootboxBtn');
const itemBar = document.getElementById('itemBar');

/* player */
let player = { x:120, y: canvas.height/2, size:18, speed:300, vx:0, vy:0, shield:false, doubleDamage:false, coinBoost:false };

/* movement control */
const keys = {};
let joystickActive = false;
let joyDir = { x:0, y:0 };

/* cooldown */
let attackReady = true;
const ATTACK_COOLDOWN_MS = 1300;
let attackCooldownTimer = null;

/* helpers */
function damageMultiplier(){
  let base = 1 + dcCount * 0.35;
  if (player.doubleDamage) { base *= 2; player.doubleDamage = false; }
  return base;
}

/* UI update */
function updateUI(){
  coinsEl.innerText = Math.round(coins);
  dcCountEl.innerText = dcCount;
  dcCostEl.innerText = Math.round(dcCost);
  bossHPText.innerText = 'HP: ' + Math.max(0,Math.round(bossHP)) + ' / ' + Math.round(bossMaxHP);
  playerHPText.innerText = 'HP: ' + Math.max(0,Math.round(playerHP)) + ' / ' + Math.round(playerMaxHP);
  currentStageText.innerText = currentStage ? currentStage : '—';
  bossPhaseTextEl.innerText = bossPhase;
  bossNameEl.innerText = currentBossDef ? currentBossDef.name : '—';
  const pct = bossMaxHP ? Math.max(0, Math.min(1, bossHP / bossMaxHP)) : 0;
  bossHPFillEl.style.width = (pct * 100) + '%';
  saveNumber('hc_coins', coins);
  saveNumber('hc_dcCount', dcCount);
  saveNumber('hc_dcCost', dcCost);
  saveNumber('hc_unlocked', unlockedStage);
  if (itemBar) {
    itemBar.innerHTML = playerItems.map((it,i)=>`<button class="btn secondary" onclick="useItem(${i})" title="${it.description}">${it.name}</button>`).join(' ');
  }
}
window.useItem = function(idx){
  const item = playerItems[idx];
  if (!item) return;
  item.use();
  playerItems.splice(idx,1);
  updateUI();
}

/* projectiles (with cap) */
function pushBullet(obj){ if (bullets.length < MAX_BULLETS) bullets.push(obj); }
function spawnBulletAt(angle, speed, size=8, color='rgba(255,80,80,0.95)'){
  const spawnX = canvas.width - 60, spawnY = canvas.height / 2;
  pushBullet({ x:spawnX, y:spawnY, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, r:size, color });
}
function spawnBulletFrom(x,y,vx,vy,r=6,color='rgba(255,120,60,0.95)'){ pushBullet({x,y,vx,vy,r,color}); }
function cleanupBullets(){ bullets = bullets.filter(b => b.x + b.r > -100 && b.x - b.r < canvas.width + 100 && b.y + b.r > -100 && b.y - b.r < canvas.height + 100); }

/* collisions */
function rectCircleColliding(circle, rect){
  const distX = Math.abs(circle.x - (rect.x + rect.w/2));
  const distY = Math.abs(circle.y - (rect.y + rect.h/2));
  if (distX > (rect.w/2 + circle.r)) return false;
  if (distY > (rect.h/2 + circle.r)) return false;
  if (distX <= (rect.w/2)) return true;
  if (distY <= (rect.h/2)) return true;
  const dx = distX - rect.w/2, dy = distY - rect.h/2;
  return (dx*dx + dy*dy <= (circle.r*circle.r));
}

/* render + physics */
let lastFrame = performance.now();
function rafLoop(now){
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  updatePhysics(dt);
  render();
  rafId = requestAnimationFrame(rafLoop);
}
function updatePhysics(dt){
  for (const b of bullets){ b.x += b.vx * dt; b.y += b.vy * dt; }
  cleanupB
