/* ---------------- Audio (WebAudio helper) ---------------- */
let audioCtx = null;
function initAudioContext(){ if (audioCtx) return; try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; } }
function ensureAudioResume(){ if (!audioCtx) initAudioContext(); if (!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{}); }
function playBeep(freq, duration=0.12, type='sine', volume=0.12){ if (!audioCtx) initAudioContext(); if (!audioCtx) return; const now = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = volume; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(0.0001, now + duration); o.start(now); o.stop(now + duration + 0.02); }
function playAttack(){ ensureAudioResume(); playBeep(640,0.08,'sawtooth',0.12); setTimeout(()=>playBeep(940,0.06,'sine',0.10),80); }
function playHurt(){ ensureAudioResume(); playBeep(160,0.12,'square',0.16); setTimeout(()=>playBeep(220,0.09,'sawtooth',0.08),40); }
