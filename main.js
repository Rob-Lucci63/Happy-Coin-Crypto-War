document.addEventListener('DOMContentLoaded', function() {
// Happy Coin: Crypto War - JavaScript (کد کامل بازی)
// نویسنده: Rob Lucci

// متغیرها و المنت‌ها
const canvas = document.getElementById('arenaCanvas');
const ctx = canvas.getContext('2d');
const bossHPText = document.getElementById('bossHPText');
const playerHPText = document.getElementById('playerHPText');
const bossHPFill = document.getElementById('bossHPFill');
const bossWarningEl = document.getElementById('bossWarning');
const attackBtn = document.getElementById('attackBtn');
const attackCooldownFill = document.getElementById('attackCooldownFill');
const actBtn = document.getElementById('actBtn');
const buyDCBtn = document.getElementById('buyDCBtn');
const retreatBtn = document.getElementById('retreatBtn');
const logEl = document.getElementById('log');
const itemBar = document.getElementById('itemBar');
const coinsEl = document.getElementById('coins');
const dcCountEl = document.getElementById('dcCount');
const dcCostEl = document.getElementById('dcCost');
const bossNameEl = document.getElementById('bossName');
const bossPhaseText = document.getElementById('bossPhaseText');
const statusText = document.getElementById('statusText');
const currentStageText = document.getElementById('currentStageText');
const timingUI = document.getElementById('timingUI');
const pointer = document.getElementById('pointer');
const sweetZone = document.getElementById('sweetZone');
const lootboxModal = document.getElementById('lootboxModal');
const lootboxContent = document.getElementById('lootboxContent');
const openLootboxBtn = document.getElementById('openLootboxBtn');

// بازی - متغیرهای اصلی
let playerHP = 100, playerMaxHP = 100, player = {shield:false, doubleDamage:false, coinBoost:false};
let bossHP = 300, bossMaxHP = 300, bossAlive = true, bossPhase = 1, bossName = "CryptoBoss";
let coins = 0, dataCenters = 0, dcCost = 50, currentStage = 1, ultimateUsed = false, ultimateActive = false;
let spawnIntervalId = null, attackCooldown = false, attackCooldownTime = 950, logLines = [];
let lootboxItem = null, lootboxReward = 0, playerItems = [];
const itemDefs = [
  { id:"heal", name:"درمان فوری", description:"+40 HP", use: ()=>{ playerHP = Math.min(playerMaxHP, playerHP+40); safeLog("از آیتم درمان فوری استفاده کردی!"); updateUI(); } },
  { id:"shield", name:"سپر موقت", description:"دفع حمله بعدی", use: ()=>{ player.shield = true; safeLog("سپر فعال شد! ضربه بعدی بی‌اثر است."); } },
  { id:"double", name:"آسیب دوبرابر", description:"حمله بعدی دوبرابر دمیج", use: ()=>{ player.doubleDamage = true; safeLog("حمله بعدی دوبرابر خواهد بود!"); } },
  { id:"coinBoost", name:"افزایش سکه", description:"دوبرابر سکه تا آخر فایت", use: ()=>{ player.coinBoost = true; safeLog("تا آخر فایت سکه دو برابر!"); } }
];

// --- توابع کاربردی ---
function playBeep(freq=220, dur=0.12, type='square', vol=0.12){
  try {
    const ctx = new(window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+dur);
    o.onended = ()=>ctx.close();
  } catch (e) {}
}
function safeLog(txt) {
  logLines.push("> "+txt);
  if (logLines.length>17) logLines=logLines.slice(logLines.length-17);
  logEl.innerText = logLines.join('\n');
}
function updateUI() {
  bossHPText.innerText = "HP: " + bossHP;
  bossHPFill.style.width = Math.max(0, (bossHP/bossMaxHP)*100) + "%";
  playerHPText.innerText = "HP: " + playerHP;
  coinsEl.innerText = coins;
  dcCountEl.innerText = dataCenters;
  dcCostEl.innerText = dcCost;
  bossNameEl.innerText = bossName;
  bossPhaseText.innerText = bossPhase;
  currentStageText.innerText = currentStage;
  // آیتم‌ها
  itemBar.innerHTML = playerItems.map((itm,i)=>`<button class="btn secondary" onclick="useItem(${i})">${itm.name}</button>`).join(" ");
}
window.useItem = function(i){
  const itm = playerItems[i];
  if(!itm) return;
  itm.use();
  playerItems.splice(i,1);
  updateUI();
}

// --- توابع اصلی مبارزه و حمله نهایی ---
function startFight(stage = 1) {
  bossHP = bossMaxHP = 200 + stage*50;
  bossAlive = true;
  bossPhase = 1;
  bossName = "کریپتو باس " + stage;
  currentStage = stage;
  playerHP = playerMaxHP;
  ultimateUsed = false; ultimateActive = false;
  statusText.innerText = "در حال مبارزه";
  safeLog("مبارزه با باس مرحله "+stage+" شروع شد!");
  updateUI();
  startSpawningBullets(stage);
}
function startSpawningBullets(stage) {
  clearInterval(spawnIntervalId);
  spawnIntervalId = setInterval(()=>{
    if (!bossAlive || ultimateActive) return;
    chooseAndExecutePattern(stage);
  }, 800-Math.min(450,stage*30));
}
function stopSpawningBullets() {
  clearInterval(spawnIntervalId);
}
function chooseAndExecutePattern(stage) {
  // حملات ساده (شبیه bullet hell ساده)
  playBeep(120+stage*10, 0.11, "square", 0.09);
  // شلیک گلوله فرضی (در نسخه واقعی می‌تونی گرافیک اضافه کنی)
  if (Math.random()<0.04+stage*0.04 && !ultimateUsed && bossAlive) {
    triggerUltimate(stage);
  }
}
function attackBoss() {
  if (attackCooldown || !bossAlive || ultimateActive) return;
  attackCooldown = true;
  attackBtn.disabled = true;
  attackCooldownFill.style.width = "100%";
  setTimeout(()=>{
    attackCooldown = false;
    attackBtn.disabled = false;
    attackCooldownFill.style.width = "0%";
  }, attackCooldownTime);
  // دمیج محاسبه
  let dmg = 18 + Math.floor(Math.random()*7);
  if (player.doubleDamage) { dmg *= 2; player.doubleDamage = false; }
  bossHP -= dmg;
  safeLog("به باس "+dmg+" دمیج زدی!");
  updateUI();
  if (bossHP <= 0) endFight(true);
  else if (bossHP < bossMaxHP/2 && bossPhase==1) { bossPhase=2; safeLog("باس به فاز ۲ رفت!"); }
}
function endFight(victory) {
  bossAlive = false;
  stopSpawningBullets();
  attackBtn.disabled = true;
  actBtn.disabled = true;
  retreatBtn.style.display = "none";
  if (victory) {
    safeLog("تبریک! باس را شکست دادی.");
    let reward = 25 + Math.floor(Math.random()*25) + currentStage*20;
    if(player.coinBoost) { reward *= 2; player.coinBoost = false; }
    coins += reward;
    // احتمال آیتم
    let getItem = Math.random()<0.65;
    if(getItem) {
      let item = itemDefs[Math.floor(Math.random()*itemDefs.length)];
      lootboxItem = item;
      lootboxReward = reward;
      showLootbox();
    } else {
      lootboxItem = null;
      lootboxReward = reward;
      showLootbox();
    }
  } else {
    safeLog("باختی! HP تموم شد.");
    statusText.innerText = "باختی!";
  }
  updateUI();
}

// تابع حمله نهایی باس (با رفع باگ)
function triggerUltimate(stage){
  if (ultimateUsed || ultimateActive || !bossAlive) return;
  ultimateActive = true; 
  ultimateUsed = true;
  bossWarningEl.style.display = 'block';
  playBeep(180,0.45,'sawtooth',0.12);
  safeLog('باس در حال شارژ شات نهایی است!');
  stopSpawningBullets();

  setTimeout(()=>{
    // اگر باس مُرده بود، حمله نهایی اجرا نشود
    if (!bossAlive) { 
      ultimateActive = false; 
      bossWarningEl.style.display = 'none'; 
      return; 
    }
    bossWarningEl.style.display = 'none';
    playBeep(240,0.24,'sine',0.12);
    const ultimateDuration = 2200; 
    const end = performance.now() + ultimateDuration;
    const ultInterval = setInterval(()=>{
      // اگر باس وسط حمله نهایی مُرد، حمله نهایی کنسل و فایت پایان یابد
      if (!bossAlive) { 
        clearInterval(ultInterval); 
        ultimateActive=false; 
        return; 
      }
      for (let i=0;i<2;i++) chooseAndExecutePattern(stage);
      if (performance.now() >= end){
        clearInterval(ultInterval);
        ultimateActive=false;
        if (bossAlive) startSpawningBullets(stage);
      }
    }, 140);
  }, 900);
}

// --- سیستم صندوق جایزه ---
function showLootbox() {
  lootboxModal.style.display = "flex";
  lootboxContent.innerHTML = `
    <div style="font-size:1.1rem;margin-bottom:6px">🎁 جایزه: <b>${lootboxReward}</b> سکه${lootboxItem ? ' + آیتم: <b>'+lootboxItem.name+'</b>' : ''}</div>
    ${lootboxItem?'<div style="font-size:0.95rem;color:#ffd59a;margin-bottom:8px">'+lootboxItem.description+'</div>':''}
  `;
}
openLootboxBtn.onclick = function(){
  if (lootboxItem) playerItems.push(lootboxItem);
  lootboxItem = null;
  coinsEl.innerText = coins;
  updateUI();
  lootboxModal.style.display = "none";
  attackBtn.disabled = false;
  actBtn.disabled = false;
  safeLog("صندوق باز شد! سکه و آیتم دریافت شد.");
}

// --- کنترل‌ها ---
attackBtn.onclick = attackBoss;
document.body.onkeydown = function(e){
  if (e.code == "Space") attackBoss();
  // می‌تونی کنترل‌های بیشتری اضافه کنی
};
buyDCBtn.onclick = function(){
  if (coins < dcCost) return;
  coins -= dcCost;
  dataCenters++;
  dcCost = Math.floor(dcCost*1.35+12);
  safeLog("یک دیتاسنتر خریدی!");
  updateUI();
};
actBtn.onclick = function(){
  safeLog("فعلاً Act فقط لاگ می‌دهد :)");
};
retreatBtn.onclick = function(){
  bossAlive = false;
  stopSpawningBullets();
  safeLog("از مبارزه فرار کردی.");
  statusText.innerText = "فرار کردی.";
};

// شروع بازی
startFight(1);

}); // پایان DOMContentLoaded