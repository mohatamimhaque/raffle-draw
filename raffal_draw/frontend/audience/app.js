// DUET CSE FEST 2026 — Audience Presentation Engine
// Directly ported from D:\duet-cse-fest-2026-raffle-draw\src\components\AudienceDisplay.tsx & audio.ts

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isEnabled = localStorage.getItem('raffle_audio') !== 'false';
    this.userGestureReceived = false;

    const unlockAudio = () => {
      this.userGestureReceived = true;
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };

    window.addEventListener('click', unlockAudio, { passive: true, once: true });
    window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
  }

  unlock() {
    this.userGestureReceived = true;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  getContext() {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended' && this.userGestureReceived) {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    localStorage.setItem('raffle_audio', enabled);
  }

  getEnabled() {
    return this.isEnabled;
  }

  playCountdownBeep(number) {
    if (!this.isEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const freqs = {
        5: 440,
        4: 523.25,
        3: 659.25,
        2: 783.99,
        1: 987.77,
      };
      const freq = freqs[number] || 600;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }

  playCandidateSelectSound() {
    if (!this.isEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

  playTickSound() {
    if (!this.isEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  playIgnoreSound() {
    if (!this.isEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const notes = [392.0, 311.13, 261.63];

      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch {}
  }

  playWinnerCelebration() {
    if (!this.isEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Ascending Arpeggio (C5, E5, G5, C6)
      const arpeggio = [523.25, 659.25, 783.99, 1046.5];
      arpeggio.forEach((freq, index) => {
        const startTime = now + index * 0.1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.6);
      });

      // 2. Full Majestic Fanfare Chord (C4 + G4 + C5 + E5 + G5) sustained for 1.8s
      const chord = [261.63, 392.0, 523.25, 659.25, 783.99];
      chord.forEach((freq) => {
        const chordStart = now + 0.45;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, chordStart);

        gain.gain.setValueAtTime(0.01, chordStart);
        gain.gain.linearRampToValueAtTime(0.12, chordStart + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(chordStart);
        osc.stop(chordStart + 1.8);
      });
    } catch {}
  }
}

const soundEngine = new SoundEngine();

// App State
let ws = null;
let wsReconnectTimer = null;
let stageSerial = 4;
let totalWinnersTarget = 10;
let countdownTotal = 3;
let sampleParticipants = [];
let rollingInterval = null;
let currentStagePhase = 'IDLE'; // IDLE, COUNTDOWN, ROLLING, CANDIDATE_REVEAL, WINNER_CONFIRMED, CANDIDATE_IGNORED, COMPLETED
let confirmedWinnersList = [];
let confettiInstance = null;

function displayPosition(position, total = totalWinnersTarget) {
  return Number(position);
}

// DOM Elements
const audioToggleBtn = document.getElementById('audioToggleBtn');
const audioIcon = document.getElementById('audioIcon');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenIcon = document.getElementById('fullscreenIcon');
const liveDot = document.getElementById('liveDot');
const liveStatusText = document.getElementById('liveStatusText');

const ambientHaloAmber = document.getElementById('ambientHaloAmber');

// Stages
const stageIdle = document.getElementById('stageIdle');
const stageCountdown = document.getElementById('stageCountdown');
const stageRolling = document.getElementById('stageRolling');
const stageReveal = document.getElementById('stageReveal');
const stageWinnerConfirmed = document.getElementById('stageWinnerConfirmed');
const stageIgnored = document.getElementById('stageIgnored');
const stageCompleted = document.getElementById('stageCompleted');

// Idle elements
const idlePhaseText = document.getElementById('idlePhaseText');
const idleStandbyLine = document.getElementById('idleStandbyLine');
const standbyText = document.getElementById('standbyText');

// Countdown elements
const countSerialNum = document.getElementById('countSerialNum');
const countdownDigit = document.getElementById('countdownDigit');
const countdownSvgArc = document.getElementById('countdownSvgArc');
const countdownProgressBar = document.getElementById('countdownProgressBar');
const countdownShockwave = document.getElementById('countdownShockwave');

// Rolling elements
const rollSerialNum = document.getElementById('rollSerialNum');
const rollSerialSub = document.getElementById('rollSerialSub');
const rollingName = document.getElementById('rollingName');
const rollingId = document.getElementById('rollingId');
const rollingType = document.getElementById('rollingType');

// Reveal elements
const revealSerialNum = document.getElementById('revealSerialNum');
const revealName = document.getElementById('revealName');
const revealCategoryChip = document.getElementById('revealCategoryChip');
const revealCategoryIcon = document.getElementById('revealCategoryIcon');
const revealCategoryText = document.getElementById('revealCategoryText');
const revealRollChip = document.getElementById('revealRollChip');
const revealDesignationChip = document.getElementById('revealDesignationChip');

// Confirmed elements
const confirmedWinnerSerial = document.getElementById('confirmedWinnerSerial');
const confirmedWinnerName = document.getElementById('confirmedWinnerName');
const confirmedCategoryBadge = document.getElementById('confirmedCategoryBadge');
const confirmedCategoryIcon = document.getElementById('confirmedCategoryIcon');
const confirmedCategoryText = document.getElementById('confirmedCategoryText');
const confirmedRollText = document.getElementById('confirmedRollText');
const confirmedNextSubtext = document.getElementById('confirmedNextSubtext');
const btnCelebrateAgain = document.getElementById('btnCelebrateAgain');

// Ignored elements
const ignoredCandidateName = document.getElementById('ignoredCandidateName');
const ignoredNextSerial = document.getElementById('ignoredNextSerial');

// History Drawer
const bottomHistoryDrawer = document.getElementById('bottomHistoryDrawer');

// ------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  setupConfetti();
  setupAudioButton();
  setupFullscreen();
  setupKeyboardShortcuts();

  btnCelebrateAgain.addEventListener('click', () => triggerGrandConfetti());

  fetchInitialState();
  connectWebSocket();
});

// Grand Confetti Cannon matching AudienceDisplay.tsx
function setupConfetti() {
  const canvas = document.getElementById('audience-confetti-canvas');
  if (window.confetti && canvas) {
    confettiInstance = window.confetti.create(canvas, { resize: true, useWorker: false });
  }
}

function triggerGrandConfetti() {
  if (!confettiInstance) {
    setupConfetti();
  }
  const fire = confettiInstance || window.confetti;
  if (!fire) return;

  const end = Date.now() + 3500;
  const colors = ['#f59e0b', '#fbbf24', '#06b6d4', '#ec4899', '#ffffff', '#10b981'];

  // Left cannon
  fire({
    particleCount: 55,
    angle: 60,
    spread: 70,
    origin: { x: 0.1, y: 0.65 },
    colors
  });
  // Right cannon
  fire({
    particleCount: 55,
    angle: 120,
    spread: 70,
    origin: { x: 0.9, y: 0.65 },
    colors
  });
  // Center blast
  fire({
    particleCount: 80,
    spread: 100,
    origin: { x: 0.5, y: 0.5 },
    colors
  });

  (function frame() {
    try {
      fire({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors
      });
      fire({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    } catch {}
  })();
}

// ------------------------------------------------------------
// AUDIO & FULLSCREEN CONTROLS
// ------------------------------------------------------------

function setupAudioButton() {
  updateAudioUi();
  audioToggleBtn.addEventListener('click', () => {
    soundEngine.unlock();
    soundEngine.setEnabled(!soundEngine.getEnabled());
    updateAudioUi();
    if (soundEngine.getEnabled()) {
      soundEngine.playCountdownBeep(3);
    }
  });
}

function updateAudioUi() {
  const enabled = soundEngine.getEnabled();
  audioIcon.textContent = enabled ? 'volume_up' : 'volume_off';
}

function setupFullscreen() {
  fullscreenBtn.addEventListener('click', toggleFullscreen);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    fullscreenIcon.textContent = 'fullscreen_exit';
  } else {
    document.exitFullscreen().catch(() => {});
    fullscreenIcon.textContent = 'fullscreen';
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 'm' || e.key === 'M') {
      soundEngine.unlock();
      soundEngine.setEnabled(!soundEngine.getEnabled());
      updateAudioUi();
    }
  });
}

// Dynamic Base URL Resolution
// Handles cases when served via Live Server (e.g. port 5500) or directly from FastAPI (port 8000)
function getApiBaseUrl() {
  if (window.location.port === '8000' || (!window.location.port && window.location.protocol.startsWith('http'))) {
    return '';
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function getWsUrl(path) {
  const isSecure = window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss:' : 'ws:';
  const host = (window.location.port === '8000' || (!window.location.port && window.location.protocol.startsWith('http')))
    ? window.location.host
    : `${window.location.hostname}:8000`;
  return `${protocol}//${host}${path}`;
}

// ------------------------------------------------------------
// WEBSOCKET REAL-TIME CONNECTION
// ------------------------------------------------------------

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = getWsUrl('/ws/audience');

  liveDot.style.background = '#f59e0b';
  liveStatusText.textContent = 'CONNECTING...';

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('WebSocket connection error:', err);
    liveDot.style.background = '#f43f5e';
    liveStatusText.textContent = 'DISCONNECTED';
    scheduleWsReconnect();
    return;
  }

  ws.onopen = () => {
    liveDot.style.background = '#34d399';
    liveStatusText.textContent = 'LIVE SYNCED';
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerEvent(msg);
    } catch (err) {
      console.error('WS parse error:', err);
    }
  };

  ws.onclose = () => {
    liveDot.style.background = '#f43f5e';
    liveStatusText.textContent = 'DISCONNECTED';
    scheduleWsReconnect();
  };

  ws.onerror = () => {
    liveDot.style.background = '#f43f5e';
    liveStatusText.textContent = 'DISCONNECTED';
    try { ws.close(); } catch {}
  };
}

function scheduleWsReconnect() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(connectWebSocket, 2500);
}

function handleServerEvent(msg) {
  const { type, data } = msg;

  switch (type) {
    case 'connected':
      applyServerState(data);
      fetchConfirmedWinners();
      break;

    case 'raffle_state':
      applyServerState(data);
      break;

    case 'countdown_started':
      stageSerial = displayPosition(data.position);
      countdownTotal = data.seconds || 3;
      showCountdownPhase(stageSerial, data.seconds);
      soundEngine.playCountdownBeep(data.seconds);
      break;

    case 'countdown_tick':
      updateCountdownGauge(data.remaining);
      soundEngine.playCountdownBeep(data.remaining);
      break;

    case 'candidate_selecting':
      stageSerial = displayPosition(data.position);
      if (data.sample_names && data.sample_names.length > 0) {
        sampleParticipants = data.sample_names;
      }
      showRollingPhase(stageSerial);
      break;

    case 'candidate_revealed':
      stopRolling();
      showRevealPhase(displayPosition(data.position), data.candidate);
      soundEngine.playCandidateSelectSound();
      break;

    case 'winner_confirmed':
      showWinnerConfirmedPhase(data.winner, data.next_position, data.state.total_winners);
      soundEngine.playWinnerCelebration();
      triggerGrandConfetti();
      fetchConfirmedWinners();
      break;

    case 'candidate_ignored':
      showCandidateIgnoredPhase(data.ineligible, data.preserved_position);
      soundEngine.playIgnoreSound();
      break;

    case 'raffle_paused':
      if (currentStagePhase === 'IDLE') {
        standbyText.textContent = 'RAFFLE CURRENTLY PAUSED BY CONTROLLER';
      }
      break;

    case 'raffle_resumed':
      if (currentStagePhase === 'IDLE') {
        standbyText.textContent = 'STAGE STANDBY • AWAITING CONTROLLER TRIGGER';
      }
      break;

    case 'raffle_completed':
      showCompletedPhase();
      soundEngine.playWinnerCelebration();
      triggerGrandConfetti();
      fetchConfirmedWinners();
      break;

    case 'raffle_reset':
      if (typeof completedTimerInterval !== 'undefined' && completedTimerInterval) {
        clearInterval(completedTimerInterval);
        completedTimerInterval = null;
      }
      showIdlePhase(displayPosition(10), 10);
      fetchConfirmedWinners();
      break;

    default:
      break;
  }
}

// ------------------------------------------------------------
// STAGE PHASES
// ------------------------------------------------------------

function hideAllStages() {
  stageIdle.style.display = 'none';
  stageCountdown.style.display = 'none';
  stageRolling.style.display = 'none';
  stageReveal.style.display = 'none';
  stageWinnerConfirmed.style.display = 'none';
  stageIgnored.style.display = 'none';
  stageCompleted.style.display = 'none';
  ambientHaloAmber.style.display = 'none';
}

function showIdlePhase(serial, total) {
  stopRolling();
  hideAllStages();
  currentStagePhase = 'IDLE';

  stageSerial = serial;
  totalWinnersTarget = total || 10;

  const paddedSerial = String(serial).padStart(2, '0');
  idlePhaseText.textContent = `READY • NEXT: WINNER #${paddedSerial} OF ${totalWinnersTarget}`;
  standbyText.textContent = 'STAGE STANDBY • AWAITING CONTROLLER TRIGGER';

  stageIdle.style.display = 'flex';
}

function showCountdownPhase(serial, seconds) {
  stopRolling();
  hideAllStages();
  currentStagePhase = 'COUNTDOWN';

  countSerialNum.textContent = serial;
  countdownDigit.textContent = seconds;

  // Arc circumference = 2 * PI * 84 = 527.787
  const circumference = 527.787;
  countdownSvgArc.style.strokeDashoffset = '0';
  countdownProgressBar.style.width = '100%';

  stageCountdown.style.display = 'block';
}

function updateCountdownGauge(remaining) {
  countdownDigit.textContent = remaining;

  const circumference = 527.787;
  const progressPercent = countdownTotal > 0 ? remaining / countdownTotal : 1;
  const strokeDashoffset = circumference * (1 - progressPercent);

  countdownSvgArc.style.strokeDashoffset = String(strokeDashoffset);
  countdownProgressBar.style.width = `${progressPercent * 100}%`;

  // Trigger shockwave pulse
  countdownShockwave.style.animation = 'none';
  void countdownShockwave.offsetWidth;
  countdownShockwave.style.animation = 'pingRipple 1s cubic-bezier(0, 0, 0.2, 1) infinite';
}

function showRollingPhase(serial) {
  hideAllStages();
  currentStagePhase = 'ROLLING';

  rollSerialNum.textContent = serial;
  rollSerialSub.textContent = serial;
  stageRolling.style.display = 'flex';

  let idx = 0;
  if (rollingInterval) clearInterval(rollingInterval);
  rollingInterval = setInterval(() => {
    if (sampleParticipants.length > 0) {
      const name = sampleParticipants[idx % sampleParticipants.length];
      rollingName.textContent = name;
      if (rollingId) {
        rollingId.textContent = `Candidate #${(idx % 114) + 1}`;
      }
      idx++;
    } else {
      rollingName.textContent = 'Selecting Candidate...';
    }
    soundEngine.playTickSound();
  }, 75);
}

function stopRolling() {
  if (rollingInterval) {
    clearInterval(rollingInterval);
    rollingInterval = null;
  }
}

function showRevealPhase(serial, candidate) {
  hideAllStages();
  currentStagePhase = 'CANDIDATE_REVEAL';

  revealSerialNum.textContent = serial;
  revealName.textContent = candidate.name;

  const candType = (candidate.type || 'student').toLowerCase();
  revealCategoryText.textContent = candType === 'faculty' ? 'Faculty Member' : candType === 'guest' ? 'Guest' : 'Student';
  revealCategoryIcon.textContent = candType === 'faculty' ? 'workspace_premium' : candType === 'guest' ? 'badge' : 'school';

  if (candType === 'student') {
    revealCategoryChip.className = 'category-badge-student';
  } else if (candType === 'faculty') {
    revealCategoryChip.className = 'category-badge-faculty';
  } else {
    revealCategoryChip.className = 'category-badge-guest';
  }

  if (candidate.student_id && candType === 'student') {
    revealRollChip.textContent = `Student ID: ${candidate.student_id}`;
    revealRollChip.style.display = 'inline-block';
  } else {
    revealRollChip.textContent = `ID: ${candidate.unique_id}`;
  }

  if (candidate.designation && candType !== 'student') {
    revealDesignationChip.textContent = candidate.designation;
    revealDesignationChip.style.display = 'inline-block';
  } else {
    revealDesignationChip.style.display = 'none';
  }

  stageReveal.style.display = 'flex';
}

function showWinnerConfirmedPhase(winner, nextPos, total) {
  hideAllStages();
  currentStagePhase = 'WINNER_CONFIRMED';
  ambientHaloAmber.style.display = 'block';

  confirmedWinnerSerial.textContent = displayPosition(winner.position, total);
  confirmedWinnerName.textContent = winner.name;

  const candType = (winner.type || 'student').toLowerCase();
  confirmedCategoryText.textContent = candType === 'faculty' ? 'Faculty Member' : candType === 'guest' ? 'Guest' : 'Student';
  confirmedCategoryIcon.textContent = candType === 'faculty' ? 'workspace_premium' : candType === 'guest' ? 'badge' : 'school';

  if (candType === 'student') {
    confirmedCategoryBadge.className = 'category-badge-student';
  } else if (candType === 'faculty') {
    confirmedCategoryBadge.className = 'category-badge-faculty';
  } else {
    confirmedCategoryBadge.className = 'category-badge-guest';
  }

  if (winner.student_id && candType === 'student') {
    confirmedRollText.textContent = `Student ID: ${winner.student_id}`;
  } else {
    confirmedRollText.textContent = `ID: ${winner.unique_id}`;
  }

  if (nextPos > total) {
    confirmedNextSubtext.textContent = '🎉 ALL 10 WINNERS OFFICIALLY CONFIRMED • CONGRATULATIONS TO EVERYONE!';
  } else {
    confirmedNextSubtext.textContent = `Next Prize Draw: Winner #${displayPosition(nextPos, total)} of ${total}`;
  }

  stageWinnerConfirmed.style.display = 'block';

  // Proudly show winner on stage for 10 seconds before returning to ready
  setTimeout(() => {
    if (currentStagePhase === 'WINNER_CONFIRMED') {
      if (nextPos > total) {
        showCompletedPhase();
      } else {
        showIdlePhase(displayPosition(nextPos, total), total);
      }
    }
  }, 10000);
}

function showCandidateIgnoredPhase(ineligible, preservedPos) {
  hideAllStages();
  currentStagePhase = 'CANDIDATE_IGNORED';

  ignoredCandidateName.textContent = ineligible.name;
  ignoredNextSerial.textContent = displayPosition(preservedPos, totalWinnersTarget);

  stageIgnored.style.display = 'flex';

  // Show absent notice for 5 seconds before returning to ready
  setTimeout(() => {
    if (currentStagePhase === 'CANDIDATE_IGNORED') {
      showIdlePhase(displayPosition(preservedPos, totalWinnersTarget), totalWinnersTarget);
    }
  }, 5000);
}

let completedTimerInterval = null;

function showCompletedPhase() {
  stopRolling();
  hideAllStages();
  currentStagePhase = 'COMPLETED';
  stageCompleted.style.display = 'flex';

  const completedInitialBanner = document.getElementById('completedInitialBanner');
  const completedFullRoster = document.getElementById('completedFullRoster');
  const rosterTimerSec = document.getElementById('rosterTimerSec');
  const btnShowRosterNow = document.getElementById('btnShowRosterNow');
  const btnGrandCelebrate = document.getElementById('btnGrandCelebrate');

  if (completedInitialBanner) completedInitialBanner.style.display = 'flex';
  if (completedFullRoster) completedFullRoster.style.display = 'none';

  renderFullWinnersGrid();

  // Clear any existing timer
  if (completedTimerInterval) {
    clearInterval(completedTimerInterval);
    completedTimerInterval = null;
  }

  let remaining = 30;
  if (rosterTimerSec) rosterTimerSec.textContent = remaining;

  completedTimerInterval = setInterval(() => {
    remaining--;
    if (rosterTimerSec) rosterTimerSec.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(completedTimerInterval);
      completedTimerInterval = null;
      transitionToFullRoster();
    }
  }, 1000);

  if (btnShowRosterNow) {
    btnShowRosterNow.onclick = () => {
      if (completedTimerInterval) {
        clearInterval(completedTimerInterval);
        completedTimerInterval = null;
      }
      transitionToFullRoster();
    };
  }

  if (btnGrandCelebrate) {
    btnGrandCelebrate.onclick = () => {
      triggerGrandConfetti();
      soundEngine.playWinnerCelebration();
    };
  }
}

function transitionToFullRoster() {
  const completedInitialBanner = document.getElementById('completedInitialBanner');
  const completedFullRoster = document.getElementById('completedFullRoster');
  if (completedInitialBanner) completedInitialBanner.style.display = 'none';
  if (completedFullRoster) {
    completedFullRoster.style.display = 'block';
  }
  renderFullWinnersGrid();
  triggerGrandConfetti();
}

async function renderFullWinnersGrid() {
  const fullWinnersGrid = document.getElementById('fullWinnersGrid');
  if (!fullWinnersGrid) return;

  if (!confirmedWinnersList || confirmedWinnersList.length === 0) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/results`);
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          confirmedWinnersList = data.data;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!confirmedWinnersList || confirmedWinnersList.length === 0) {
    fullWinnersGrid.innerHTML = `<div style="color:#cbd5e1; font-family:'JetBrains Mono', monospace; text-align:center; padding:20px; grid-column:1/-1;">Awaiting confirmed winners...</div>`;
    return;
  }

  const sorted = [...confirmedWinnersList].sort((a, b) => a.position - b.position);

  fullWinnersGrid.innerHTML = sorted.map(w => {
    const winnerPosition = displayPosition(w.position);
    const isTop3 = winnerPosition <= 3;
    const candType = (w.type || 'general').toLowerCase();
    let typeLabel = candType.charAt(0).toUpperCase() + candType.slice(1);
    let typeIcon = 'badge';
    let typeBadgeClass = 'category-badge-guest';

    if (candType === 'faculty') {
      typeIcon = 'workspace_premium';
      typeBadgeClass = 'category-badge-faculty';
    } else if (candType === 'student') {
      typeIcon = 'school';
      typeBadgeClass = 'category-badge-student';
    } else if (candType.includes('vip')) {
      typeIcon = 'star';
      typeBadgeClass = 'category-badge-faculty';
    }

    return `
      <div class="roster-winner-card">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="roster-rank-pill ${isTop3 ? 'roster-rank-top3' : ''}">
            #${winnerPosition}
          </div>
          <div style="display:flex; flex-direction:column; text-align:left;">
            <div style="font-size:15px; font-weight:800; color:#ffffff; font-family:'Space Grotesk', sans-serif;">
              ${escapeHtml(w.name)}
            </div>
            <div style="font-size:11px; font-family:'JetBrains Mono', monospace; color:#67e8f9; margin-top:2px;">
              ${w.student_id ? `ID: ${escapeHtml(w.student_id)}` : `Token: ${escapeHtml(w.unique_id || 'N/A')}`}
            </div>
          </div>
        </div>
        <span class="${typeBadgeClass}" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:9999px; font-size:11px; font-weight:700; text-transform:uppercase;">
          <span class="material-symbols-outlined" style="font-size:13px;">${typeIcon}</span>
          <span>${escapeHtml(typeLabel)}</span>
        </span>
      </div>
    `;
  }).join('');
}

function applyServerState(state) {
  if (!state) return;

  totalWinnersTarget = state.total_winners || 10;
  stageSerial = displayPosition(state.current_position, totalWinnersTarget);

  // Dynamic Event Titles on Audience Stage (100% from Server State / Environment)
  if (state.event || state.organization || state.segment) {
    const rawEvent = (state.event || 'Live Raffle Draw').trim();
    document.title = `${rawEvent} — Live Audience Stage`;

    const elCountdownEvent = document.getElementById('audienceCountdownEvent');
    const elCompletedEvent = document.getElementById('audienceCompletedEvent');
    const elRosterEvent = document.getElementById('audienceRosterEvent');
    const elTopPill = document.getElementById('audienceTopPill');
    const elTopPillText = document.getElementById('audienceTopPillText');
    const elDeptSubtitle = document.getElementById('audienceDeptSubtitle');
    const elBrandTitle = document.getElementById('audienceBrandTitle');
    const elBrandEmblem = document.getElementById('audienceBrandEmblem');
    const elBrandPart1 = document.getElementById('audienceBrandPart1');
    const elBrandPart2 = document.getElementById('audienceBrandPart2');
    const elCompletedTotal = document.getElementById('audienceCompletedTotal');

    if (elCountdownEvent) elCountdownEvent.textContent = rawEvent.toUpperCase();
    if (elCompletedEvent) elCompletedEvent.textContent = rawEvent;
    if (elRosterEvent) elRosterEvent.textContent = rawEvent.toUpperCase();
    if (elCompletedTotal) elCompletedTotal.textContent = state.total_winners || 10;

    // 1. Top Header Pill: Organization / University Name
    const org = (state.organization || '').trim();
    if (elTopPillText && elTopPill) {
      if (org) {
        elTopPillText.textContent = org.toUpperCase();
        elTopPill.style.display = 'inline-flex';
      } else {
        elTopPill.style.display = 'none';
      }
    }

    // 2. Subtitle: Ceremony / Segment / Department
    if (elDeptSubtitle) {
      const seg = (state.segment || '').trim();
      if (seg) {
        elDeptSubtitle.textContent = seg;
        elDeptSubtitle.style.display = 'block';
      } else {
        elDeptSubtitle.style.display = 'none';
      }
    }

    // 3. Main Grand Title: Dynamically split into white headline + golden aura accent
    const words = rawEvent.split(/\s+/);
    if (words.length > 1) {
      const lastWord = words.pop();
      if (elBrandPart1) elBrandPart1.textContent = words.join(' ');
      if (elBrandPart2) elBrandPart2.textContent = lastWord;
    } else {
      if (elBrandPart1) elBrandPart1.textContent = rawEvent;
      if (elBrandPart2) elBrandPart2.textContent = '';
    }
    if (elBrandTitle) elBrandTitle.style.display = 'none';
    if (elBrandEmblem) elBrandEmblem.style.display = 'inline-flex';
  }

  switch (state.state) {
    case 'WAITING_FOR_START':
    case 'IDLE':
      showIdlePhase(stageSerial, state.total_winners);
      break;

    case 'COUNTDOWN':
      countdownTotal = state.countdown_remaining || 3;
      showCountdownPhase(stageSerial, state.countdown_remaining || 3);
      break;

    case 'SELECTING':
      showRollingPhase(stageSerial);
      break;

    case 'CANDIDATE_REVEALED':
      if (state.current_candidate) {
        showRevealPhase(stageSerial, state.current_candidate);
      }
      break;

    case 'COMPLETED':
      showCompletedPhase();
      break;

    case 'PAUSED':
      if (currentStagePhase === 'IDLE') {
        standbyText.textContent = 'RAFFLE CURRENTLY PAUSED BY CONTROLLER';
      }
      break;

    default:
      break;
  }
}

// ------------------------------------------------------------
// DATA FETCHING
// ------------------------------------------------------------

async function fetchInitialState() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/audience/status`);
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const state = await res.json();
      applyServerState(state);
    } else if (!res.ok) {
      console.warn(`[Audience] /api/audience/status returned HTTP ${res.status}. Ensure backend is running via "python run.py" on port 8000.`);
    }
    await fetchConfirmedWinners();
    await fetchSamplePool();
  } catch (err) {
    console.warn('Backend currently unreachable. Waiting for server on port 8000...');
  }
}

async function fetchConfirmedWinners() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/results`);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      confirmedWinnersList = data.data;
      renderHistoryDrawer(confirmedWinnersList);
    }
  } catch (err) {
    // Silently wait for backend to become available
  }
}

async function fetchSamplePool() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/pool/sample?limit=45`);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.names)) {
      sampleParticipants = data.names;
    }
  } catch (err) {
    // Silently wait for backend to become available
  }
}

function renderHistoryDrawer(winners) {
  if (!bottomHistoryDrawer) return;

  if (!winners || winners.length === 0) {
    bottomHistoryDrawer.innerHTML = `
      <div class="history-chip" style="opacity: 0.6;">
        <span class="material-symbols-outlined" style="font-size:14px; color:#fbbf24;">emoji_events</span>
        <span>Awaiting first winner...</span>
      </div>
    `;
    return;
  }

  bottomHistoryDrawer.innerHTML = winners.map(w => `
    <div class="history-chip">
      <span style="font-weight:800; color:#fbbf24; font-family:'JetBrains Mono', monospace;">#${displayPosition(w.position)}</span>
      <span style="font-weight:700; color:#ffffff;">${escapeHtml(w.name)}</span>
      ${w.student_id ? `<span style="color:#67e8f9; font-family:'JetBrains Mono', monospace; font-size:11px;">(${escapeHtml(w.student_id)})</span>` : ''}
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
