const board = document.querySelector("#board");
const holes = [...document.querySelectorAll(".hole")];
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
const timeEl = document.querySelector("#time");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const overlayButton = document.querySelector("#overlayButton");
const stage = document.querySelector(".stage");
const hammer = document.querySelector("#hammer");
const oilChart = document.querySelector("#oilChart");
const oilCtx = oilChart.getContext("2d");

const gameLength = 60;
const generousHitRadius = 190;
const popLabels = ["WOW", "NOPE", "BONK", "+100", "FAKE"];
const trumpLines = [
  "MAKE IT GREAT!",
  "HUGE!",
  "BELIEVE ME!",
  "FAKE NEWS!",
  "YOU'RE FIRED!",
];
const hitVoiceLines = ["Ouch!", "No way!", "Huge mistake!", "Stop it!", "Unbelievable!"];

let audioContext;
let masterGain;
let softClipper;
let musicTimer = 0;
let musicStep = 0;
let musicStarted = false;
let oilCandles = [];
let score = 0;
let combo = 0;
let timeLeft = gameLength;
let running = false;
let spawnTimer = 0;
let clockTimer = 0;
let activeMoles = new Map();

function createMole(type) {
  const mole = document.createElement("div");
  const line = trumpLines[Math.floor(Math.random() * trumpLines.length)];
  mole.className = `mole ${type}`;
  mole.dataset.type = type;
  mole.innerHTML = `
    <div class="speech">${type === "decoy" ? "TOTALLY REAL!" : line}</div>
    <div class="hair"></div>
    <div class="face"></div>
    <div class="brows"></div>
    <div class="eyes"></div>
    <div class="mouth"></div>
    <div class="tie"></div>
  `;
  return mole;
}

function resetGame() {
  running = false;
  window.clearTimeout(spawnTimer);
  window.clearInterval(clockTimer);
  activeMoles.forEach(({ timeout }) => window.clearTimeout(timeout));
  activeMoles.clear();
  holes.forEach((hole) => {
    hole.classList.remove("up");
    hole.innerHTML = "";
  });
  score = 0;
  combo = 0;
  timeLeft = gameLength;
  updateStats();
}

function startGame() {
  unlockAudio();
  playStartSound();
  startMusic();
  resetOilChart();
  resetGame();
  running = true;
  overlay.classList.remove("show");
  spawnLoop();
  clockTimer = window.setInterval(() => {
    timeLeft -= 1;
    updateStats();
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  running = false;
  window.clearTimeout(spawnTimer);
  window.clearInterval(clockTimer);
  activeMoles.forEach(({ timeout }) => window.clearTimeout(timeout));
  activeMoles.clear();
  holes.forEach((hole) => hole.classList.remove("up"));

  const rating = getRating(score);
  overlayTitle.textContent = `${rating} 级锤法`;
  overlayText.textContent = "把油价打下来了！";
  overlayButton.textContent = "再敲一局";
  overlay.classList.add("show");
  playEndSound();
}

function getRating(points) {
  if (points >= 8000) return "S";
  if (points >= 5200) return "A";
  if (points >= 3000) return "B";
  return "C";
}

function updateStats() {
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  timeEl.textContent = timeLeft;
}

function getLastOilPrice() {
  const last = oilCandles[oilCandles.length - 1];
  return last ? last.close.toFixed(1) : "0.0";
}

function spawnLoop() {
  if (!running) return;

  const available = holes.filter((hole) => !activeMoles.has(hole));
  if (available.length > 0) {
    const burst = timeLeft < 8 && Math.random() > 0.86 ? 2 : 1;
    for (let i = 0; i < burst && available.length; i += 1) {
      const index = Math.floor(Math.random() * available.length);
      const [hole] = available.splice(index, 1);
      popMole(hole);
    }
  }

  const speed = Math.max(2400, 3200 - (gameLength - timeLeft) * 3);
  spawnTimer = window.setTimeout(spawnLoop, speed);
}

function popMole(hole) {
  const roll = Math.random();
  const type = roll > 0.82 ? "gold" : "normal";
  const mole = createMole(type);
  const visibleTime = type === "gold" ? 4000 : Math.max(3200, 4200 - (gameLength - timeLeft) * 3);

  hole.innerHTML = "";
  hole.appendChild(mole);
  requestAnimationFrame(() => hole.classList.add("up"));

  const timeout = window.setTimeout(() => {
    missMole(hole);
  }, visibleTime);

  activeMoles.set(hole, { mole, timeout, type });
  if (Math.random() > 0.58) {
    playPopSound(type);
  }
}

function missMole(hole) {
  const entry = activeMoles.get(hole);
  if (!entry) return;

  activeMoles.delete(hole);
  hole.classList.remove("up");
  combo = 0;
  updateStats();
  window.setTimeout(() => {
    if (!activeMoles.has(hole)) hole.innerHTML = "";
  }, 140);
}

function hitHole(hole, event) {
  if (!running) return;

  const nearestTarget = findNearestActiveHole(event.clientX, event.clientY);
  const targetHole = activeMoles.has(hole) ? hole : nearestTarget?.hole;
  const targetDistance = activeMoles.has(hole) ? 0 : nearestTarget?.distance ?? Infinity;
  const entry = targetHole ? activeMoles.get(targetHole) : undefined;
  if (!entry || targetDistance > generousHitRadius) {
    positionHammer(event.clientX, event.clientY);
    swingHammer();
    combo = 0;
    showFloating(event.clientX, event.clientY, "OIL UP", "var(--red)");
    playMissSound();
    raiseOilPrice(entry ? 5 : 3);
    updateStats();
    return;
  }

  const impact = getHoleCenter(targetHole);
  positionHammer(impact.x, impact.y);
  swingHammer();

  window.clearTimeout(entry.timeout);
  activeMoles.delete(targetHole);
  entry.mole.classList.add("hit", entry.type === "gold" ? "hit-gold" : "hit-normal");
  targetHole.classList.remove("up");

  if (entry.type === "decoy") {
    combo = 0;
    score = Math.max(0, score - 150);
    showFloating(impact.x, impact.y, "-150", "var(--red)");
    playDecoySound();
  } else {
    combo += 1;
    const base = entry.type === "gold" ? 350 : 100;
    const multiplier = 1 + Math.floor(combo / 5) * 0.35;
    const gained = Math.round(base * multiplier);
    score += gained;
    showFloating(impact.x, impact.y, `+${gained}`, entry.type === "gold" ? "var(--gold)" : "var(--blue)");
    flyHair(impact.x, impact.y, entry.type);
    playHitSound(entry.type, combo);
    speakHitLine(entry.type);
    dropOilPrice(entry.type === "gold" ? 8 : 4);
  }

  document.body.classList.add("screen-shake");
  window.setTimeout(() => document.body.classList.remove("screen-shake"), 160);
  updateStats();

  window.setTimeout(() => {
    if (!activeMoles.has(targetHole)) targetHole.innerHTML = "";
  }, 270);
}

function findNearestActiveHole(x, y) {
  let nearestHole = null;
  let nearestDistance = Infinity;

  activeMoles.forEach((_, hole) => {
    const rect = hole.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(centerX - x, centerY - y);
    if (distance < nearestDistance) {
      nearestHole = hole;
      nearestDistance = distance;
    }
  });

  return nearestHole ? { hole: nearestHole, distance: nearestDistance } : null;
}

function getHoleCenter(hole) {
  const rect = hole.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height * 0.56,
  };
}

function showFloating(x, y, text, color) {
  const tag = document.createElement("div");
  tag.className = "floating";
  tag.style.setProperty("--x", `${x - 20}px`);
  tag.style.setProperty("--y", `${y - 26}px`);
  tag.style.background = color;
  tag.textContent = text || popLabels[Math.floor(Math.random() * popLabels.length)];
  document.body.appendChild(tag);
  window.setTimeout(() => tag.remove(), 720);
}

function flyHair(x, y, type = "normal") {
  const hair = document.createElement("div");
  hair.className = `flying-hair ${type === "gold" ? "gold" : ""}`;
  hair.style.setProperty("--x", `${x - (type === "gold" ? 43 : 30)}px`);
  hair.style.setProperty("--y", `${y - (type === "gold" ? 62 : 50)}px`);
  document.body.appendChild(hair);
  window.setTimeout(() => hair.remove(), type === "gold" ? 1000 : 800);
}

function swingHammer() {
  hammer.classList.add("swing");
  window.setTimeout(() => hammer.classList.remove("swing"), 125);
}

function moveHammer(event) {
  positionHammer(event.clientX, event.clientY);
}

function positionHammer(x, y) {
  hammer.style.left = `${x}px`;
  hammer.style.top = `${y}px`;
}

function unlockAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    softClipper = audioContext.createWaveShaper();
    softClipper.curve = makeSoftClipCurve();
    softClipper.oversample = "2x";
    masterGain.gain.setValueAtTime(2.35, audioContext.currentTime);
    masterGain.connect(softClipper);
    softClipper.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function now() {
  return audioContext?.currentTime ?? 0;
}

function makeGain(volume, start = now()) {
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.connect(masterGain);
  return gain;
}

function makeSoftClipCurve() {
  const samples = 512;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * 1.8);
  }
  return curve;
}

function tone({ type = "sine", from = 220, to = from, volume = 0.18, start = now(), duration = 0.16 }) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = makeGain(volume, start);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function noise({ volume = 0.14, start = now(), duration = 0.08, filter = 900 }) {
  if (!audioContext) return;
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
  }

  const source = audioContext.createBufferSource();
  const filterNode = audioContext.createBiquadFilter();
  const gain = makeGain(volume, start);
  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(filter, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filterNode);
  filterNode.connect(gain);
  source.start(start);
  source.stop(start + duration);
}

function playHitSound(type, streak) {
  unlockAudio();
  const t = now();
  const bonus = Math.min(streak, 12) * 5;
  noise({ start: t, duration: 0.045, volume: 0.55, filter: 1800 });
  noise({ start: t + 0.012, duration: 0.075, volume: 0.24, filter: 520 });
  tone({ type: "sine", from: 92 + bonus, to: 45, volume: 0.42, start: t, duration: 0.18 });
  tone({ type: "triangle", from: 210 + bonus, to: 105, volume: 0.33, start: t + 0.012, duration: 0.15 });
  tone({ type: "square", from: 132 + bonus, to: 92, volume: 0.1, start: t + 0.03, duration: 0.08 });
  tone({ type: "sine", from: 520 + bonus, to: 390 + bonus, volume: 0.13, start: t + 0.055, duration: 0.11 });

  if (type === "gold") {
    noise({ start: t + 0.045, duration: 0.09, volume: 0.22, filter: 2600 });
    tone({ type: "square", from: 650, to: 980, volume: 0.2, start: t + 0.08, duration: 0.08 });
    tone({ type: "sine", from: 980, to: 1480, volume: 0.18, start: t + 0.14, duration: 0.1 });
    tone({ type: "triangle", from: 1480, to: 920, volume: 0.13, start: t + 0.23, duration: 0.12 });
  }
}

function playMissSound() {
  unlockAudio();
  const t = now();
  tone({ type: "sawtooth", from: 160, to: 62, volume: 0.12, start: t, duration: 0.2 });
  noise({ start: t + 0.02, duration: 0.06, volume: 0.08, filter: 260 });
}

function playDecoySound() {
  unlockAudio();
  const t = now();
  tone({ type: "square", from: 280, to: 88, volume: 0.12, start: t, duration: 0.18 });
  tone({ type: "sawtooth", from: 92, to: 54, volume: 0.1, start: t + 0.11, duration: 0.16 });
}

function playPopSound(type) {
  unlockAudio();
  const t = now();
  const pitch = type === "gold" ? 520 : 330;
  tone({ type: "sine", from: pitch, to: pitch * 1.35, volume: 0.035, start: t, duration: 0.07 });
}

function playStartSound() {
  const t = now();
  tone({ type: "square", from: 220, to: 330, volume: 0.08, start: t, duration: 0.08 });
  tone({ type: "square", from: 330, to: 495, volume: 0.08, start: t + 0.09, duration: 0.09 });
  tone({ type: "triangle", from: 495, to: 740, volume: 0.11, start: t + 0.18, duration: 0.14 });
}

function playEndSound() {
  const t = now();
  tone({ type: "triangle", from: 520, to: 390, volume: 0.08, start: t, duration: 0.12 });
  tone({ type: "triangle", from: 390, to: 260, volume: 0.08, start: t + 0.13, duration: 0.14 });
  tone({ type: "sawtooth", from: 160, to: 70, volume: 0.07, start: t + 0.28, duration: 0.2 });
}

function resetOilChart() {
  const start = 86;
  oilCandles = Array.from({ length: 22 }, (_, index) => {
    const base = start + Math.sin(index * 0.65) * 5 + index * 0.45;
    const close = base + (Math.random() - 0.35) * 5;
    return {
      open: base,
      close,
      high: Math.max(base, close) + 2 + Math.random() * 4,
      low: Math.min(base, close) - 2 - Math.random() * 4,
    };
  });
  drawOilChart();
}

function resizeOilChart() {
  const rect = oilChart.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  oilChart.width = Math.max(1, Math.floor(rect.width * scale));
  oilChart.height = Math.max(1, Math.floor(rect.height * scale));
  oilCtx.setTransform(scale, 0, 0, scale, 0, 0);
  drawOilChart();
}

function drawOilChart() {
  if (!oilCandles.length) return;

  const width = oilChart.clientWidth;
  const height = oilChart.clientHeight;
  oilCtx.clearRect(0, 0, width, height);
  oilCtx.font = "900 13px Trebuchet MS";

  const values = oilCandles.flatMap((candle) => [candle.high, candle.low]);
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;
  const mapY = (value) => height - 18 - ((value - min) / (max - min)) * (height - 42);
  const step = width / (oilCandles.length + 1);
  const candleWidth = Math.max(7, step * 0.42);

  oilCtx.lineWidth = 3;
  oilCtx.strokeStyle = "rgba(46, 98, 184, 0.86)";
  oilCtx.beginPath();
  oilCandles.forEach((candle, index) => {
    const x = step * (index + 1);
    const y = mapY(candle.close);
    if (index === 0) oilCtx.moveTo(x, y);
    else oilCtx.lineTo(x, y);
  });
  oilCtx.stroke();

  oilCandles.forEach((candle, index) => {
    const x = step * (index + 1);
    const open = mapY(candle.open);
    const close = mapY(candle.close);
    const high = mapY(candle.high);
    const low = mapY(candle.low);
    const falling = candle.close < candle.open;

    oilCtx.strokeStyle = falling ? "#d53636" : "#2f9d68";
    oilCtx.fillStyle = falling ? "#d53636" : "#2f9d68";
    oilCtx.lineWidth = 2;
    oilCtx.beginPath();
    oilCtx.moveTo(x, high);
    oilCtx.lineTo(x, low);
    oilCtx.stroke();
    oilCtx.fillRect(x - candleWidth / 2, Math.min(open, close), candleWidth, Math.max(4, Math.abs(close - open)));
  });

  const last = oilCandles[oilCandles.length - 1].close;
  const labelX = width / 2 - 33;
  oilCtx.fillStyle = "#d53636";
  oilCtx.fillRect(labelX, mapY(last) - 14, 66, 24);
  oilCtx.fillStyle = "#fff";
  oilCtx.fillText(`$${last.toFixed(1)}`, labelX + 7, mapY(last) + 2);
}

function dropOilPrice(amount) {
  const previous = oilCandles[oilCandles.length - 1] ?? { close: 88 };
  const open = previous.close + (Math.random() - 0.5) * 2;
  const close = Math.max(38, open - amount - Math.random() * 3);
  oilCandles.push({
    open,
    close,
    high: open + 1 + Math.random() * 2,
    low: close - 2 - Math.random() * 3,
  });
  oilCandles = oilCandles.slice(-22);
  drawOilChart();
}

function raiseOilPrice(amount) {
  const previous = oilCandles[oilCandles.length - 1] ?? { close: 88 };
  const open = previous.close + (Math.random() - 0.5) * 2;
  const close = Math.min(160, open + amount + Math.random() * 3);
  oilCandles.push({
    open,
    close,
    high: close + 2 + Math.random() * 4,
    low: open - 1 - Math.random() * 2,
  });
  oilCandles = oilCandles.slice(-22);
  drawOilChart();
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  scheduleMusicStep();
  musicTimer = window.setInterval(scheduleMusicStep, 165);
}

function scheduleMusicStep() {
  if (!audioContext) return;
  const t = now();
  const bass = [98, 98, 123, 98, 147, 123, 98, 82];
  const chord = [196, 247, 294, 330];
  const step = musicStep % 16;
  const beat = musicStep % 4;

  tone({ type: "square", from: bass[musicStep % bass.length], to: bass[musicStep % bass.length] * 0.96, volume: 0.07, start: t, duration: 0.1 });
  if (beat === 1 || beat === 3) {
    noise({ start: t, duration: 0.035, volume: 0.09, filter: 4200 });
  }
  if (step % 4 === 0) {
    chord.forEach((freq, index) => {
      tone({ type: "triangle", from: freq, to: freq * 1.01, volume: 0.025, start: t + index * 0.006, duration: 0.13 });
    });
  }
  if (step === 6 || step === 14) {
    tone({ type: "sine", from: 392, to: 494, volume: 0.035, start: t, duration: 0.12 });
  }
  musicStep += 1;
}

function speakHitLine(type) {
  if (!("speechSynthesis" in window)) return;
  const line = type === "gold" ? "Huge mistake!" : hitVoiceLines[Math.floor(Math.random() * hitVoiceLines.length)];
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.lang = "en-US";
  utterance.rate = 1.08;
  utterance.pitch = type === "gold" ? 0.82 : 0.92;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

document.addEventListener("pointermove", moveHammer);
stage.addEventListener("pointerdown", (event) => {
  const hole = event.target.closest?.(".hole") ?? null;
  hitHole(hole, event);
});
startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", startGame);
overlayButton.addEventListener("click", startGame);

resetGame();
resetOilChart();
resizeOilChart();
window.addEventListener("resize", resizeOilChart);
