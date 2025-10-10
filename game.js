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
  cleanupBullets();

  if (joystickActive){
    player.vx = joyDir.x * player.speed;
    player.vy = joyDir.y * player.speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  } else {
    let dx=0, dy=0;
    if (keys['ArrowLeft']||keys['a']||keys['A']) dx -= 1;
    if (keys['ArrowRight']||keys['d']||keys['D']) dx += 1;
    if (keys['ArrowUp']||keys['w']||keys['W']) dy -= 1;
    if (keys['ArrowDown']||keys['s']||keys['S']) dy += 1;
    const len = Math.hypot(dx,dy);
    if (len > 0){ dx /= len; dy /= len; player.vx = dx * player.speed; player.vy = dy * player.speed; player.x += player.vx * dt; player.y += player.vy * dt; } else { player.vx = 0; player.vy = 0; }
  }
  clampPlayerToCanvas();

  const playerRect = { x: player.x - player.size/2, y: player.y - player.size/2, w: player.size, h: player.size };
  for (let i=bullets.length-1;i>=0;i--){
    if (rectCircleColliding(bullets[i], playerRect)){
      if (player.shield) {
        player.shield = false;
        safeLog("سپر ضربه را دفع کرد!");
        bullets.splice(i,1);
        updateUI();
        continue;
      }
      const dmg = Math.max(1, Math.round(6 + Math.random()*6));
      playerHP -= dmg;
      playHurt();
      safeLog('حمله خوردی — ' + dmg + ' دمیج');
      bullets.splice(i,1);
      if (playerHP <= 0){ playerHP = 0; updateUI(); endFight(false); return; }
      updateUI();
    }
  }
}
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const bossX = canvas.width - 60, bossY = canvas.height/2;
  ctx.beginPath(); ctx.fillStyle = (ultimateActive ? 'rgba(255,40,80,0.16)' : currentBossDef.color || 'rgba(125,0,178,0.12)'); ctx.arc(bossX, bossY, 36 + (bossPhase-1)*2, 0, Math.PI*2); ctx.fill(); ctx.closePath();
  ctx.beginPath(); ctx.fillStyle = '#111'; ctx.arc(bossX - 12, bossY - 8, 6, 0, Math.PI*2); ctx.arc(bossX + 12, bossY - 8, 6, 0, Math.PI*2); ctx.fill(); ctx.closePath();

  for (const b of bullets){ ctx.beginPath(); ctx.fillStyle = b.color; ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.closePath(); }

  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(Math.sin(performance.now()/200)*0.05); ctx.fillStyle = '#ffd59a'; const s = player.size; ctx.fillRect(-s/2, -s/2, s, s); ctx.restore();
}

/* ---------------- boss behavior / patterns ---------------- */
function updateBossPhase(){
  if (!bossMaxHP) return;
  const pct = bossHP / bossMaxHP;
  let newPhase = 1;
  if (pct <= 0.25) newPhase = 4;
  else if (pct <= 0.5) newPhase = 3;
  else if (pct <= 0.75) newPhase = 2;
  if (newPhase !== bossPhase){
    bossPhase = newPhase;
    safeLog('باس وارد فاز ' + bossPhase + ' شد!');
    playBeep(240 + bossPhase*40, 0.32, 'sawtooth', 0.12);
    if (spawnIntervalId){ stopSpawningBullets(); startSpawningBullets(currentStage); }
  }
  updateUI();
}

/* basic low-level patterns reused */
function burstPattern(centerX, centerY, pieces=6, spread=0.9, speed=170, color='rgba(255,120,60,0.95)'){
  const centerAngle = Math.atan2(player.y - centerY, player.x - centerX);
  for (let i=0;i<pieces;i++){
    const angle = centerAngle + (i - (pieces-1)/2) * spread;
    const spd = speed + i*6 * (Math.random()*0.7 + 0.3);
    spawnBulletAt(angle, spd, 7, color);
  }
  playBeep(360,0.09,'sawtooth',0.12);
}
function spiralPattern(stage,count=10,speed=180,color='rgba(220,60,220,0.95)'){
  for (let i=0;i<count;i++){
    const angle = spiralOffset + (i/count) * Math.PI*2;
    spawnBulletAt(angle, speed, 6, color);
  }
  spiralOffset += 0.28 + bossPhase*0.05;
  playBeep(380,0.08,'square',0.12);
}
function waveFromTop(count=6,speed=220,color='rgba(180,200,255,0.95)'){
  for (let i=0;i<count;i++){
    const x = 40 + Math.random() * (canvas.width - 80);
    spawnBulletFrom(x, -20, 0, speed * (0.9 + Math.random()*0.2), 8, color);
  }
  playBeep(320,0.06,'sine',0.10);
}

/* specific boss patterns */
function pattern_fireballs(stage){
  burstPattern(canvas.width-60, canvas.height/2, 6 + bossPhase, 0.9, 160 + bossPhase*20, currentBossDef.color);
  if (Math.random() < 0.35) aimedPredictive(stage, 160 + Math.random()*40);
}
function pattern_dashes(stage){
  const offsets = [-40, -10, 10, 40];
  const off = offsets[Math.floor(Math.random()*offsets.length)];
  for (let i=0;i<3 + bossPhase;i++){
    const sx = canvas.width - 60;
    const sy = canvas.height/2 + off + (Math.random()*40-20);
    const dx = player.x - sx + (Math.random()*80-40);
    const dy = player.y - sy + (Math.random()*80-40);
    const ang = Math.atan2(dy, dx);
    spawnBulletFrom(sx, sy, Math.cos(ang)*(220 + i*10), Math.sin(ang)*(220 + i*10), 8, currentBossDef.color);
  }
  playBeep(420,0.06,'square',0.12);
}
function pattern_poison(stage){
  waveFromTop(4 + bossPhase, 120 + bossPhase*10, 'rgba(80,200,120,0.9)');
  if (Math.random() < 0.4) spiralPattern(stage, 10 + bossPhase*2, 140, 'rgba(120,255,140,0.9)');
}
function pattern_lightning(stage){
  for (let i=0;i<2 + bossPhase;i++){
    const x = 80 + Math.random() * (canvas.width - 160);
    spawnBulletFrom(x, -10, 0, 300 + Math.random()*120, 9, 'rgba(200,230,255,0.98)');
  }
  playBeep(480,0.06,'sine',0.12);
}
function pattern_lasers(stage){
  for (let r=0;r<2 + bossPhase;r++){
    const y = 40 + Math.random() * (canvas.height - 80);
    spawnBulletFrom(canvas.width + 30, y, -260 - Math.random()*60, 0, 10, 'rgba(255,200,80,0.95)');
  }
  playBeep(520,0.06,'sawtooth',0.12);
}
function pattern_spiral(stage){
  spiralPattern(stage, 14 + bossPhase*2, 200, currentBossDef.color);
}
function pattern_boulder(stage){
  for (let i=0;i<3 + bossPhase;i++){
    const y = 60 + Math.random() * (canvas.height - 120);
    spawnBulletFrom(canvas.width + 40, y, -120 - Math.random()*40, 0, 14, 'rgba(180,140,90,0.95)');
  }
  playBeep(300,0.08,'square',0.12);
}
function pattern_lightBurst(stage){
  spiralPattern(stage, 18 + bossPhase*3, 240, 'rgba(255,240,120,0.95)');
}

/* predictive aimed bullet helper */
function aimedPredictive(stage,speed=220){
  const sx = canvas.width - 60, sy = canvas.height/2;
  const dx = player.x - sx, dy = player.y - sy; const dist = Math.hypot(dx,dy);
  const t = Math.max(0.16, dist / speed);
  const predictedX = player.x + (player.vx || 0) * t * 1.2;
  const predictedY = player.y + (player.vy || 0) * t * 1.0;
  const angle = Math.atan2(predictedY - sy, predictedX - sx);
  spawnBulletAt(angle, speed * (0.95 + Math.random()*0.2), 8, 'rgba(255,200,100,0.95)');
  playBeep(400,0.06,'square',0.11);
}

/* choose and execute pattern based on current boss def */
function chooseAndExecutePattern(stage){
  if (!bossAlive || ultimateActive) return;
  const pat = currentBossDef.pattern;
  switch(pat){
    case 'fireballs': pattern_fireballs(stage); break;
    case 'dashes': pattern_dashes(stage); break;
    case 'poison': pattern_poison(stage); break;
    case 'lightning': pattern_lightning(stage); break;
    case 'lasers': pattern_lasers(stage); break;
    case 'spiral': pattern_spiral(stage); break;
    case 'boulder': pattern_boulder(stage); break;
    case 'lightBurst': pattern_lightBurst(stage); break;
    default: pattern_fireballs(stage); break;
  }
}

/* ultimate simplified */
function triggerUltimate(stage){
  if (ultimateUsed || ultimateActive || !bossAlive) return;
  ultimateActive = true; ultimateUsed = true;
  bossWarningEl.style.display = 'block'; playBeep(180,0.45,'sawtooth',0.12); safeLog('باس در حال شارژ شات نهایی است!');
  stopSpawningBullets();
  setTimeout(()=>{
    bossWarningEl.style.display = 'none'; playBeep(240,0.24,'sine',0.12);
    const ultimateDuration = 2200; const end = performance.now() + ultimateDuration;
    const ultInterval = setInterval(()=>{
      if (!ultimateActive) { clearInterval(ultInterval); return; }
      for (let i=0;i<2;i++) chooseAndExecutePattern(stage);
      if (performance.now() >= end){ clearInterval(ultInterval); ultimateActive=false; if (bossAlive) startSpawningBullets(stage); }
    }, 140);
  }, 900);
}

/* spawn controller */
function startSpawningBullets(stage){
  stopSpawningBullets();
  const base = Math.max(200, 900 - (stage-1)*18);
  const phaseMod = Math.max(1, 1.0 - (bossPhase-1)*0.08);
  const interval = Math.round(base * phaseMod);
  spawnIntervalId = setInterval(()=>{
    if (bossPhase >= 4 && !ultimateUsed && Math.random() < 0.04) { triggerUltimate(stage); return; }
    chooseAndExecutePattern(stage);
  }, Math.max(80, interval));
}
function stopSpawningBullets(){ if (spawnIntervalId){ clearInterval(spawnIntervalId); spawnIntervalId = null; } }

/* ---------------- spawn boss per stage (unique) ---------------- */
function spawnBossForStage(stage){
  const index = (stage - 1) % bossDefs.length;
  currentBossDef = bossDefs[index];
  const cycles = Math.floor((stage - 1) / bossDefs.length);
  bossMaxHP = Math.round(300 * currentBossDef.hpMult * Math.pow(1.12, stage-1) * Math.pow(1.08, cycles));
  bossHP = bossMaxHP;
  bossPhase = 1;
  ultimateUsed = false;
  ultimateActive = false;
  safeLog('⚔️ مرحله ' + stage + ' — ' + currentBossDef.name + ' وارد شد!');
  updateUI();
}

/* start/end fight */
function startStage(stage){
  if (bossAlive){ safeLog('الان در مبارزه‌ای — اول تمومش کن یا فرار کن.'); return; }
  currentStage = stage;
  spawnBossForStage(stage);
  playerMaxHP = BASE_PLAYER_MAX_HP + dcCount * 25;
  playerHP = playerMaxHP;
  bossAlive = true; bullets = [];
  player.shield = false; player.doubleDamage = false; player.coinBoost = false;
  statusText.innerText = 'مبارزه (مرحله '+stage+')'; retreatBtn.style.display = 'inline-block';
  startSpawningBullets(stage);
  if (!rafId){ lastFrame = performance.now(); rafId = requestAnimationFrame(rafLoop); }
  updateUI();
}

//--- Lootbox system ---
function showLootboxModal(coinsReward, item){
  lootboxContent.innerHTML = `
    <div style="font-size:1.08rem;margin-bottom:10px">شما یک صندوق جایزه دریافت کردید!</div>
    <div style="font-size:1.06rem;margin-bottom:7px">
      <span style="color:gold">+${coinsReward} سکه</span>
    </div>
    <div style="margin-bottom:10px">
      <div style="font-weight:700;color:#0ff">${item.name}</div>
      <div style="font-size:0.92rem;margin-top:2px;color:#ccc">${item.description}</div>
    </div>
  `;
  lootboxModal.style.display = "flex";
  openLootboxBtn.disabled = false;
}
function closeLootboxModal(){
  lootboxModal.style.display = "none";
  lootboxContent.innerHTML = "";
}
openLootboxBtn.addEventListener("click", function(){
  openLootboxBtn.disabled = true;
  coins += lootboxReward;
  playerItems.push(lootboxItem);
  safeLog(`صندوق باز شد! +${lootboxReward} سکه و آیتم: ${lootboxItem.name}`);
  updateUI();
  closeLootboxModal();
  playerMaxHP = BASE_PLAYER_MAX_HP + dcCount * 25;
  playerHP = playerMaxHP;
  statusText.innerText = 'برنده شدی!';
  currentStage = 0; updateUI();
});

function endFight(victory){
  bossAlive = false; stopSpawningBullets(); if (rafId){ cancelAnimationFrame(rafId); rafId=null; }
  bullets = []; retreatBtn.style.display = 'none'; timingUI.style.display='none'; timingUI.setAttribute('aria-hidden','true'); bossWarningEl.style.display='none'; ultimateActive=false;
  if (moveRafId) { cancelAnimationFrame(moveRafId); moveRafId = null; }
  if (victory){
    playWin();
    const baseReward = Math.round(100 * Math.max(1,currentStage) * (1 + dcCount*0.08));
    lootboxReward = player.coinBoost ? baseReward * 2 : baseReward;
    lootboxItem = itemDefs[Math.floor(Math.random()*itemDefs.length)];
    showLootboxModal(lootboxReward, lootboxItem);
    if (currentStage < TOTAL_STAGES && unlockedStage <= currentStage) unlockedStage = currentStage + 1;
  } else {
    const loss = Math.min(coins, Math.round(10 * Math.max(1,currentStage)));
    coins -= loss;
    safeLog('شکست خوردی — از دست دادی ' + loss + ' سکه');
    playerMaxHP = BASE_PLAYER_MAX_HP + dcCount * 25;
    playerHP = Math.max(1, Math.round(playerMaxHP * 0.3));
    statusText.innerText = 'شکست خوردی';
    currentStage = 0; updateUI();
  }
}

/* retreat */
retreatBtn.addEventListener('click', ()=>{ if (!bossAlive) return; safeLog('فرار کردی از مبارزه.'); endFight(false); });

/* ---------------- attack timing minigame + cooldown ---------------- */
let timing = { running:false, pos:0, speed:1.6, sweetLeft:0.25, sweetWidth:0.18 };

function setAttackCooldown(ms){
  attackReady = false;
  attackBtn.disabled = true;
  const start = Date.now();
  if (attackCooldownTimer) clearInterval(attackCooldownTimer);
  attackCooldownFill.style.width = '100%';
  attackCooldownTimer = setInterval(()=>{
    const elapsed = Date.now() - start;
    const pct = Math.min(1, elapsed / ms);
    attackCooldownFill.style.width = ((1 - pct) * 100) + '%';
    if (pct >= 1){ clearInterval(attackCooldownTimer); attackCooldownTimer = null; attackReady = true; attackBtn.disabled = false; attackCooldownFill.style.width='0%'; }
  }, 50);
}

function startTimingMinigame(){
  if (!bossAlive){ safeLog('الان باس نیست.'); return; }
  if (timing.running) return;
  if (!attackReady){ safeLog('حمله در کول‌داون است. صبر کن.'); return; }

  const baseWidth = 0.18;
  timing.sweetWidth = Math.min(0.45, baseWidth + dcCount * 0.02);
  timing.sweetLeft = Math.max(0.08, Math.min(0.78, 0.25 + (Math.random() * 0.5 - 0.15)));
  timing.pos = 0; timing.running = true; timing.startTime = performance.now();
  timingUI.style.display = 'block'; timingUI.setAttribute('aria-hidden','false');

  const parentW = timingUI.clientWidth || 300;
  sweetZoneEl.style.left = (timing.sweetLeft * parentW) + 'px';
  sweetZoneEl.style.width = (timing.sweetWidth * parentW) + 'px';

  const hadSpawn = !!spawnIntervalId;
  if (spawnIntervalId) stopSpawningBullets();

  let onKey = null; let clickHandler = null;

  function finishTiming(userPressed){
    if (!timing.running) return;
    timing.running = false; timingUI.style.display='none'; timingUI.setAttribute('aria-hidden','true');
    window.removeEventListener('keydown', onKey);
    attackBtn.removeEventListener('click', clickHandler);

    const winPos = timing.pos; const left = timing.sweetLeft; const right = timing.sweetLeft + timing.sweetWidth;
    let quality = 0;
    if (winPos >= left && winPos <= right){
      const center = (left + right)/2; const dist = Math.abs(winPos - center) / (timing.sweetWidth/2);
      quality = (dist < 0.18) ? 3 : (dist < 0.45 ? 2 : 1);
    } else quality = 0;

    let baseDamage;
    if (quality === 3) baseDamage = Math.round(45 + Math.random()*12);
    else if (quality === 2) baseDamage = Math.round(28 + Math.random()*10);
    else if (quality === 1) baseDamage = Math.round(16 + Math.random()*8);
    else baseDamage = Math.round(6 + Math.random()*6);

    let dmg = Math.round(baseDamage * damageMultiplier());
    bossHP -= dmg;
    updateBossPhase();
    const reward = Math.round(8 * Math.max(1,currentStage) * (1 + quality*0.25));
    coins += reward;

    playAttack();

    safeLog('تو حمله زدی — کیفیت: ' + (['Fail','OK','Great','Perfect'][quality]) + ' | ' + dmg + ' دمیج — +' + reward + ' سکه');
    updateUI();

    setAttackCooldown(ATTACK_COOLDOWN_MS);

    setTimeout(()=>{ if (hadSpawn && bossAlive && !ultimateActive) startSpawningBullets(currentStage); }, 300);
    if (bossHP <= 0){ bossHP = 0; updateUI(); endFight(true); }
  }

  function step(){
    if (!timing.running) return;
    const now = performance.now();
    const elapsed = (now - timing.startTime) / 1000;
    timing.pos = (Math.sin(elapsed * Math.PI * timing.speed - Math.PI/2) + 1) / 2;
    const parentW = timingUI.clientWidth || 300; pointerEl.style.left = (timing.pos * parentW) + 'px';
    if (elapsed > 3.2){ finishTiming(false); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  onKey = function(e){ if (e.key === ' ' || e.key === 'Spacebar'){ e.preventDefault(); } if (!timing.running) return; if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter'){ finishTiming(true); } };
  window.addEventListener('keydown', onKey);
  clickHandler = function(){ if (timing.running) finishTiming(true); };
  attackBtn.addEventListener('click', clickHandler);
}

/* keyboard events (global) */
window.addEventListener('keydown', (e)=>{ keys[e.key]=true; if ((e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') && !timing.running){ if (attackReady) startTimingMinigame(); else { e.preventDefault(); } } });
window.addEventListener('keyup', (e)=>{ keys[e.key]=false; });

/* joystick implementation */
const joyWrap = document.getElementById('joystickWrap');
const joyBase = document.getElementById('joyBase');
const joyKnob = document.getElementById('joyKnob');
let joyPointerId = null;
const joyRadius = 46;
function setKnob(x,y){ joyKnob.style.transform = `translate(${x}px, ${y}px)`; joystickActive=true; }
function resetKnob(){ joyKnob.style.transform = 'translate(0px,0px)'; joyDir.x = 0; joyDir.y = 0; joystickActive = false; }

function joyStart(ev){
  ev.preventDefault();
  joystickActive = true;
  if (ev.pointerId !== undefined) joyPointerId = ev.pointerId; else joyPointerId = 'mouse';
  joyMove(ev);
  window.addEventListener('pointermove', joyPointerMove);
  window.addEventListener('pointerup', joyPointerUp);
}
function joyPointerMove(e){ if (!joystickActive) return; if (joyPointerId && e.pointerId !== joyPointerId && joyPointerId !== 'mouse') return; joyMove(e); }
function joyPointerUp(e){ if (joyPointerId && e.pointerId !== joyPointerId && joyPointerId !== 'mouse') return; joyPointerId = null; resetKnob(); window.removeEventListener('pointermove', joyPointerMove); window.removeEventListener('pointerup', joyPointerUp); }
function joyMove(e){ const rect = joyBase.getBoundingClientRect(); const cx = rect.left + rect.width/2; const cy = rect.top + rect.height/2; const dx = (e.clientX - cx); const dy = (e.clientY - cy); const dist = Math.hypot(dx,dy); const max = joyRadius; let nx = dx, ny = dy; if (dist > max){ nx = dx / dist * max; ny = dy / dist * max; } setKnob(nx, ny); const ndx = nx / max; const ndy = ny / max; joyDir.x = ndx; joyDir.y = ndy; }

joyBase.addEventListener('pointerdown', joyStart);

/* canvas drag */
function setupCanvasDrag(){
  let dragging = false;
  function down(e){ dragging=true; move(e); }
  function move(e){ if (!dragging) return; const rect = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; const x = (t.clientX - rect.left) * (canvas.width / rect.width); const y = (t.clientY - rect.top) * (canvas.height / rect.height); player.x = x; player.y = y; clampPlayerToCanvas(); }
  function up(){ dragging=false; }
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); down(e.touches[0]); }, {passive:false});
  canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); move(e.touches[0]); }, {passive:false});
  canvas.addEventListener('touchend', (e)=>{ up(); }, {passive:false});
  canvas.addEventListener('mousedown', (e)=>{ down(e); window.addEventListener('mousemove', move); window.addEventListener('mouseup', ()=>{ up(); window.removeEventListener('mousemove', move); }); });
}

function clampPlayerToCanvas(){ 
  const marginX = Math.floor(canvas.width * 0.2);
  const marginY = Math.floor(canvas.height * 0.2);
  const bossZoneWidth = 140;
  player.x = Math.max(marginX, Math.min(canvas.width - marginX - bossZoneWidth, player.x)); 
  player.y = Math.max(marginY, Math.min(canvas.height - marginY, player.y)); 
}

/* buy DC & stages */
function buyDataCenter(){ if (coins < dcCost){ safeLog('سکه کافی نداری'); return; } coins -= dcCost; dcCount += 1; dcCost = Math.min(999999999, Math.round(dcCost * 1.6)); const oldMax = playerMaxHP; playerMaxHP = BASE_PLAYER_MAX_HP + dcCount * 25; const hpIncrease = playerMaxHP - oldMax; playerHP = Math.min(playerMaxHP, playerHP + Math.round(hpIncrease * 0.7)); safeLog('دیتاسنتر خریدی — +25 Max HP و HP فعلی افزایش یافت'); updateUI(); }

function buildStages(){ stagesGrid.innerHTML = ''; for (let s=1;s<=TOTAL_STAGES;s++){ const div=document.createElement('div'); div.style.padding='10px'; div.style.borderRadius='8px'; div.style.background=(s<=unlockedStage)?'#101014':'#0b0b0d'; div.style.border='1px solid rgba(255,255,255,0.03)'; div.style.cursor=(s<=unlockedStage)?'pointer':'not-allowed'; div.innerHTML = '<div style="font-weight:800;color:var(--accent)">مرحله '+s+'</div><div style="font-size:0.85rem;margin-top:6px">'+(s<=4?'آسان':s<=12?'متوسط':s<=24?'سخت':'نهایی')+'</div>'; if (s<=unlockedStage) div.addEventListener('click', ()=>{ startStage(s); closeModal(); }); else div.title='این مرحله قفل است'; stagesGrid.appendChild(div); } }
function openModal(){ stageModal.style.display = 'flex'; }
function closeModal(){ stageModal.style.display = 'none'; }

/* UI events */
openStagesBtn.addEventListener('click', ()=>{ buildStages(); openModal(); });
closeStageModal.addEventListener('click', closeModal);
attackBtn.addEventListener('click', ()=>{ if (!timing.running) startTimingMinigame(); });
buyDCBtn.addEventListener('click', buyDataCenter);
resetBtn.addEventListener('click', ()=>{ if (confirm('میخوای ذخیره رو ریست کنی؟')){ localStorage.clear(); location.reload(); } });

/* init */
function init(){
  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(320
