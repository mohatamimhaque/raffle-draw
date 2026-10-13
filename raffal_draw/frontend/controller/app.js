// DUET CSE FEST 2026 — Controller Console Engine
// Directly aligned with D:\duet-cse-fest-2026-raffle-draw\src\components\ControllerConsole.tsx

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

let authToken = localStorage.getItem('raffle_token') || null;
let ws = null;
let wsReconnectTimer = null;
let soundEnabled = localStorage.getItem('raffle_audio') !== 'false';
let audioCtx = null;
let currentCandidateData = null;
let rollingTimer = null;
let activeCategory = 'all';

// DOM Elements
const ctrlLoginModal = document.getElementById('ctrlLoginModal');
const ctrlLoginForm = document.getElementById('ctrlLoginForm');
const ctrlUsernameInput = document.getElementById('ctrlUsernameInput');
const ctrlPasswordInput = document.getElementById('ctrlPasswordInput');
const loginErrorBox = document.getElementById('loginErrorBox');
const loginErrorMsg = document.getElementById('loginErrorMsg');

const ctrlConsoleApp = document.getElementById('ctrlConsoleApp');
const ctrlWsStatusText = document.getElementById('ctrlWsStatusText');
const ctrlLogoutBtn = document.getElementById('ctrlLogoutBtn');
const ctrlBtnPdfDownload = document.getElementById('ctrlBtnPdfDownload');
const ctrlBtnDownloadPdfTab = document.getElementById('ctrlBtnDownloadPdfTab');
const ctrlSoundBtn = document.getElementById('ctrlSoundBtn');
const ctrlSoundIcon = document.getElementById('ctrlSoundIcon');

// Metrics
const ctrlMetricCompleted = document.getElementById('ctrlMetricCompleted');
const ctrlMetricTotal = document.getElementById('ctrlMetricTotal');
const ctrlMetricEligible = document.getElementById('ctrlMetricEligible');
const ctrlMetricIgnored = document.getElementById('ctrlMetricIgnored');
const ctrlMetricNextSerial = document.getElementById('ctrlMetricNextSerial');
const ctrlLockBadge = document.getElementById('ctrlLockBadge');

// Preview Box
const ctrlStagePreviewBox = document.getElementById('ctrlStagePreviewBox');
const ctrlPreviewIntro = document.getElementById('ctrlPreviewIntro');
const ctrlPreviewReadySub = document.getElementById('ctrlPreviewReadySub');
const ctrlPreviewCountdown = document.getElementById('ctrlPreviewCountdown');
const ctrlCountdownSerial = document.getElementById('ctrlCountdownSerial');
const ctrlCountdownDigit = document.getElementById('ctrlCountdownDigit');
const ctrlPreviewRolling = document.getElementById('ctrlPreviewRolling');
const ctrlRollingName = document.getElementById('ctrlRollingName');
const ctrlRollingId = document.getElementById('ctrlRollingId');
const ctrlPreviewRevealed = document.getElementById('ctrlPreviewRevealed');
const ctrlRevealedSerial = document.getElementById('ctrlRevealedSerial');
const ctrlRevealedName = document.getElementById('ctrlRevealedName');
const ctrlRevealedRoll = document.getElementById('ctrlRevealedRoll');
const ctrlPreviewWinner = document.getElementById('ctrlPreviewWinner');
const ctrlWinnerSerial = document.getElementById('ctrlWinnerSerial');
const ctrlWinnerName = document.getElementById('ctrlWinnerName');
const ctrlWinnerRoll = document.getElementById('ctrlWinnerRoll');
const ctrlPreviewCompleted = document.getElementById('ctrlPreviewCompleted');

// Workflow Stepper Elements
const stepNodeReady = document.getElementById('stepNodeReady');
const stepNodeCountdown = document.getElementById('stepNodeCountdown');
const stepNodeRolling = document.getElementById('stepNodeRolling');
const stepNodeRevealed = document.getElementById('stepNodeRevealed');
const stepNodeConfirmed = document.getElementById('stepNodeConfirmed');
const stepLine1 = document.getElementById('stepLine1');
const stepLine2 = document.getElementById('stepLine2');
const stepLine3 = document.getElementById('stepLine3');
const stepLine4 = document.getElementById('stepLine4');

// Actions
const ctrlBtnStart = document.getElementById('ctrlBtnStart');
const ctrlBtnSerialNum = document.getElementById('ctrlBtnSerialNum');
const ctrlBtnConfirm = document.getElementById('ctrlBtnConfirm');
const ctrlBtnIgnore = document.getElementById('ctrlBtnIgnore');
const ctrlBtnPause = document.getElementById('ctrlBtnPause');
const ctrlBtnResume = document.getElementById('ctrlBtnResume');
const ctrlBtnReset = document.getElementById('ctrlBtnReset');
const ctrlBtnResetHeader = document.getElementById('ctrlBtnResetHeader');

// Reset Modal Elements
const resetConfirmModal = document.getElementById('resetConfirmModal');
const btnCancelReset = document.getElementById('btnCancelReset');
const btnConfirmReset = document.getElementById('btnConfirmReset');

// Tabs & Tables
const tabNavBtns = document.querySelectorAll('.tab-nav-btn');
const tabPanels = document.querySelectorAll('.tab-content-panel');
const ctrlCountWinners = document.getElementById('ctrlCountWinners');
const ctrlCountIneligible = document.getElementById('ctrlCountIneligible');
const ctrlWinnersTableBody = document.getElementById('ctrlWinnersTableBody');
const ctrlIneligibleTableBody = document.getElementById('ctrlIneligibleTableBody');
const ctrlAuditFeed = document.getElementById('ctrlAuditFeed');
const ctrlToastContainer = document.getElementById('ctrlToastContainer');
const ctrlWinnerSearch = document.getElementById('ctrlWinnerSearch');
const remoteEnabledToggle = document.getElementById('remoteEnabledToggle');
const remoteEnabledLabel = document.getElementById('remoteEnabledLabel');
const remotePermissionToggle = document.getElementById('remotePermissionToggle');
const remotePermissionLabel = document.getElementById('remotePermissionLabel');
const remoteDeviceStatus = document.getElementById('remoteDeviceStatus');
const remoteConnectionStatus = document.getElementById('remoteConnectionStatus');
const remoteQrPanel = document.getElementById('remoteQrPanel');
const remoteQrCode = document.getElementById('remoteQrCode');
const remoteQrSession = document.getElementById('remoteQrSession');

let cachedWinners = [];
let remoteClient = null;
let remoteChannel = null;
let remoteConfig = null;
let remoteState = { mobile_remote_enabled: false, next_draw_allowed: false, draw_in_progress: false, device_connected: false };

function displayPosition(position, total = 10) {
  return Number(position);
}

// ------------------------------------------------------------
// INITIALIZATION & AUTHENTICATION
// ------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupActionListeners();
  setupCategorySelector();
  setupSoundButton();
  setupSettingsHandlers();

  if (authToken) {
    verifySession();
  } else {
    showLogin();
  }
});

function setupCategorySelector() {
  const buttons = document.querySelectorAll('.category-select-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat || 'all';
      playBeep(600, 0.1);
    });
  });
}

function setupSoundButton() {
  updateSoundIcon();
  ctrlSoundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('raffle_audio', soundEnabled);
    updateSoundIcon();
    if (soundEnabled) playBeep(880, 0.15);
  });
}

function updateSoundIcon() {
  ctrlSoundIcon.textContent = soundEnabled ? 'volume_up' : 'volume_off';
  ctrlSoundIcon.style.color = soundEnabled ? '#22d3ee' : '#64748b';
}

function playBeep(freq = 600, duration = 0.15) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { }
}

function showLogin() {
  ctrlLoginModal.style.display = 'flex';
  ctrlConsoleApp.style.display = 'none';
  ctrlUsernameInput.focus();
}

ctrlLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorBox.style.display = 'none';

  const username = ctrlUsernameInput.value.trim();
  const password = ctrlPasswordInput.value.trim();

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      let errText = `Server returned ${res.status}`;
      try {
        const errData = await res.json();
        errText = errData.detail || errData.error || errText;
      } catch { }
      throw new Error(errText);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.detail || data.error || 'Invalid credentials');
    }

    authToken = data.token;
    localStorage.setItem('raffle_token', authToken);

    ctrlLoginModal.style.display = 'none';
    ctrlConsoleApp.style.display = 'flex';
    showToast('Authorized & connected to console.', 'success');

    startConsole();
  } catch (err) {
    loginErrorMsg.textContent = err.message;
    loginErrorBox.style.display = 'flex';
  }
});

ctrlLogoutBtn.addEventListener('click', () => {
  localStorage.removeItem('raffle_token');
  authToken = null;
  if (ws) ws.close();
  showLogin();
});

async function verifySession() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/controller/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('Session invalid');

    ctrlLoginModal.style.display = 'none';
    ctrlConsoleApp.style.display = 'flex';
    startConsole();
  } catch {
    localStorage.removeItem('raffle_token');
    authToken = null;
    showLogin();
  }
}

function startConsole() {
  connectWebSocket();
  fetchInitialConsoleData();
  setupRemoteControl();
}

async function setupRemoteControl() {
  if (!remoteEnabledToggle) return;
  remoteEnabledToggle.addEventListener('click', toggleRemoteControl);
  remotePermissionToggle.addEventListener('click', toggleRemotePermission);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/controller/remote/config`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error('Remote configuration unavailable');
    remoteConfig = await res.json();
    applyRemoteState(remoteConfig.state);
    setupRemotePairingCode();
  } catch (error) {
    setRemoteConnectionStatus('● Unavailable', 'is-warning');
    addAuditLog(error.message);
  }
}

async function toggleRemoteControl() {
  const enabled = remoteEnabledToggle.getAttribute('aria-pressed') !== 'true';
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/controller/remote/enabled`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Unable to update remote control');
    applyRemoteState(data.state);
    if (enabled) await connectRemoteChannel(); else await disconnectRemoteChannel();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function toggleRemotePermission() {
  const allowed = remotePermissionToggle.getAttribute('aria-pressed') !== 'true';
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/controller/remote/permission`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Unable to update draw permission');
    applyRemoteState(data.state);
    await broadcastRemoteState(data.state);
  } catch (error) { showToast(error.message, 'error'); }
}

function applyRemoteState(state) {
  if (!state) return;
  remoteState = { ...remoteState, ...state };
  const enabled = remoteState.mobile_remote_enabled === true;
  const allowed = remoteState.next_draw_allowed === true;
  remoteEnabledToggle.setAttribute('aria-pressed', String(enabled));
  remoteEnabledLabel.textContent = enabled ? 'ON' : 'OFF';
  remotePermissionToggle.disabled = !enabled;
  remotePermissionToggle.setAttribute('aria-pressed', String(allowed));
  remotePermissionLabel.textContent = allowed ? 'ON' : 'OFF';
  remoteDeviceStatus.textContent = remoteState.device_connected ? '● Android Connected' : '○ No Device';
  remoteDeviceStatus.className = `remote-status-value ${remoteState.device_connected ? '' : 'is-muted'}`;
  if (!enabled) setRemoteConnectionStatus('● Disabled', 'is-muted');
}

function setRemoteConnectionStatus(text, className = '') {
  remoteConnectionStatus.textContent = text;
  remoteConnectionStatus.className = `remote-status-value ${className}`;
}

async function connectRemoteChannel() {
  if (!remoteConfig || !remoteConfig.supabase_url || !remoteConfig.supabase_anon_key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required in .env');
  }
  if (remoteChannel) return;
  setRemoteConnectionStatus('● Connecting', 'is-warning');
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    remoteClient = createClient(remoteConfig.supabase_url, remoteConfig.supabase_anon_key);
    remoteChannel = remoteClient.channel(`raffle_remote:${remoteConfig.session_id}`, { config: { broadcast: { self: false } } });
    remoteChannel.on('broadcast', { event: 'message' }, ({ payload }) => handleRemotePayload(payload));
    remoteChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setRemoteConnectionStatus('● Connected');
        await broadcastRemoteState(remoteState);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRemoteConnectionStatus('● Reconnecting', 'is-warning');
      }
    });
  } catch (error) {
    remoteChannel = null;
    setRemoteConnectionStatus('● Disconnected', 'is-warning');
    throw error;
  }
}

async function disconnectRemoteChannel() {
  if (remoteClient && remoteChannel) await remoteClient.removeChannel(remoteChannel);
  remoteChannel = null;
  remoteClient = null;
  setRemoteConnectionStatus('● Disabled', 'is-muted');
}

async function broadcastRemotePayload(payload) {
  if (!remoteChannel) return;
  await remoteChannel.send({ type: 'broadcast', event: 'message', payload });
}

function setupRemotePairingCode() {
  if (!remoteQrPanel || !remoteQrCode || !remoteConfig?.supabase_url || !remoteConfig?.supabase_anon_key) return;
  const qrPayload = JSON.stringify({
    url: remoteConfig.supabase_url,
    key: remoteConfig.supabase_anon_key,
    session: remoteConfig.session_id,
    session_id: remoteConfig.session_id,
    channel: `raffle_remote:${remoteConfig.session_id}`
  });
  remoteQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
  remoteQrCode.alt = `QR code for ${remoteConfig.session_id} mobile remote session`;
  if (remoteQrSession) remoteQrSession.textContent = `Session: raffle_remote:${remoteConfig.session_id}`;
  remoteQrPanel.hidden = false;
}

async function broadcastRemoteState(state) {
  await broadcastRemotePayload({ type: 'draw_permission', ...state });
}

async function handleRemotePayload(payload) {
  const message = normalizeRemotePayload(payload);
  if (!message) return;
  console.info('[REMOTE] Broadcast received:', message.type);
  if (message.type === 'sync_request') {
    const response = await fetch(`${getApiBaseUrl()}/api/controller/remote/message`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message)
    });
    if (!response.ok) {
      console.warn('[REMOTE] Sync request was rejected by FastAPI:', response.status);
      return;
    }
    const result = await response.json();
    if (!result.success) return;
    applyRemoteState(result.state || { device_connected: true });
    await broadcastRemoteState(remoteState);
    return;
  }
  if (message.type !== 'draw_request') return;
  const res = await fetch(`${getApiBaseUrl()}/api/controller/remote/draw`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const result = await res.json();
  if (result.state) applyRemoteState(result.state);
  await broadcastRemotePayload({ type: 'draw_ack', request_id: message.request_id, status: result.status, reason: result.reason });
}

function normalizeRemotePayload(payload) {
  let message = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof message === 'string') {
      try { message = JSON.parse(message); } catch { return null; }
    }
    if (!message || typeof message !== 'object') return null;
    if (message.type === 'sync_request' || message.type === 'draw_request') return message;
    message = message.payload || message.data;
  }
  return null;
}

// ------------------------------------------------------------
// WEBSOCKET CONNECTION
// ------------------------------------------------------------

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = getWsUrl(`/ws/controller?token=${encodeURIComponent(authToken)}`);

  ctrlWsStatusText.textContent = 'Connecting...';
  ctrlWsStatusText.style.color = '#f59e0b';

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('WebSocket connection error:', err);
    ctrlWsStatusText.textContent = 'Disconnected';
    ctrlWsStatusText.style.color = '#f43f5e';
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWebSocket, 2500);
    return;
  }

  ws.onopen = () => {
    ctrlWsStatusText.textContent = 'Live Synced';
    ctrlWsStatusText.style.color = '#34d399';
    addAuditLog('WebSocket channel connected to server.');
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleControllerEvent(msg);
    } catch (err) {
      console.error('WS Parse Error:', err);
    }
  };

  ws.onclose = () => {
    ctrlWsStatusText.textContent = 'Reconnecting...';
    ctrlWsStatusText.style.color = '#f43f5e';
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWebSocket, 2500);
  };

  ws.onerror = () => {
    ctrlWsStatusText.textContent = 'Disconnected';
    ctrlWsStatusText.style.color = '#f43f5e';
    try { ws.close(); } catch { }
  };
}

function handleControllerEvent(msg) {
  const { type, data } = msg;

  switch (type) {
    case 'connected':
      applyConsoleState(data);
      addAuditLog('Controller synchronized with live state.');
      break;

    case 'raffle_state':
      applyConsoleState(data);
      break;

    case 'remote_state':
      applyRemoteState(data);
      if (remoteState.mobile_remote_enabled) broadcastRemoteState(remoteState);
      break;

    case 'remote_draw_event':
      broadcastRemotePayload(data);
      break;

    case 'countdown_started':
      applyConsoleState(data.state);
      showPreviewCountdown(displayPosition(data.position, data.state.total_winners), data.seconds);
      playBeep(660, 0.2);
      addAuditLog(`Draw initiated for Prize #${displayPosition(data.position, data.state.total_winners)} (${data.seconds}s countdown).`);
      break;

    case 'countdown_tick':
      ctrlCountdownDigit.textContent = data.remaining;
      playBeep(data.remaining === 1 ? 987 : 660, 0.2);
      break;

    case 'candidate_selecting':
      applyConsoleState(data.state);
      showPreviewRolling(displayPosition(data.position, data.state.total_winners), data.sample_names);
      addAuditLog(`Rolling eligible pool for Prize #${displayPosition(data.position, data.state.total_winners)}...`);
      break;

    case 'candidate_revealed':
      applyConsoleState(data.state);
      showPreviewRevealed(displayPosition(data.position, data.state.total_winners), data.candidate);
      showToast(`Selected: ${data.candidate.name}`, 'info');
      addAuditLog(`Candidate selected: ${data.candidate.name} (${data.candidate.unique_id})`);
      playBeep(880, 0.3);
      break;

    case 'winner_confirmed':
      applyConsoleState(data.state);
      showPreviewWinner(data.winner);
      setWorkflowStep(5);
      showToast(`Winner confirmed: #${data.winner.position} ${data.winner.name}`, 'success');
      addAuditLog(`Winner confirmed: #${data.winner.position} ${data.winner.name}`, 'success');
      playBeep(988, 0.35);
      fetchWinners();
      break;

    case 'candidate_ignored':
      applyConsoleState(data.state);
      showToast(`Candidate marked ineligible. Position ${data.preserved_position} preserved.`, 'warn');
      addAuditLog(`Candidate marked ineligible: ${data.ineligible.name}. Prize #${data.preserved_position} preserved.`, 'warn');
      playBeep(350, 0.25);
      fetchIneligible();
      break;

    case 'raffle_paused':
      applyConsoleState(data.state);
      showToast('Raffle paused.', 'warn');
      addAuditLog('Draw paused by operator.', 'warn');
      break;

    case 'raffle_resumed':
      applyConsoleState(data.state);
      showToast('Raffle resumed.', 'info');
      addAuditLog('Draw resumed by operator.');
      break;

    case 'raffle_stopped':
      applyConsoleState(data.state);
      showToast('Raffle stopped.', 'error');
      addAuditLog('Raffle stopped.', 'error');
      break;

    case 'raffle_completed':
      applyConsoleState(data.state);
      setWorkflowStep(5);
      showPreviewCompleted();
      showToast('🎉 All 10 winners confirmed! Raffle completed.', 'success');
      addAuditLog('🎉 All 10 winners confirmed! Raffle completed.', 'success');
      fetchWinners();
      break;

    case 'raffle_reset':
      applyConsoleState(data.state || data);
      showToast('Raffle reset fresh to Winner #1. Previous results archived.', 'info');
      addAuditLog('Raffle reset fresh to Winner #1. Previous results archived.', 'warn');
      fetchWinners();
      fetchIneligible();
      break;

    default:
      break;
  }
}

// ------------------------------------------------------------
// STATE RENDERING & WORKFLOW STEPPER
// ------------------------------------------------------------

function setWorkflowStep(step) {
  const nodes = [stepNodeReady, stepNodeCountdown, stepNodeRolling, stepNodeRevealed, stepNodeConfirmed];
  const lines = [stepLine1, stepLine2, stepLine3, stepLine4];

  nodes.forEach((n, idx) => {
    if (!n) return;
    if (idx + 1 === step) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });

  lines.forEach((l, idx) => {
    if (!l) return;
    if (idx + 1 < step) {
      l.classList.add('passed');
    } else {
      l.classList.remove('passed');
    }
  });
}

function hideAllPreviews() {
  if (rollingTimer) {
    clearInterval(rollingTimer);
    rollingTimer = null;
  }
  if (ctrlPreviewIntro) ctrlPreviewIntro.style.display = 'none';
  if (ctrlPreviewCountdown) ctrlPreviewCountdown.style.display = 'none';
  if (ctrlPreviewRolling) ctrlPreviewRolling.style.display = 'none';
  if (ctrlPreviewRevealed) ctrlPreviewRevealed.style.display = 'none';
  if (ctrlPreviewWinner) ctrlPreviewWinner.style.display = 'none';
  if (ctrlPreviewCompleted) ctrlPreviewCompleted.style.display = 'none';
}

function applyConsoleState(state) {
  if (!state) return;

  // Metrics
  ctrlMetricCompleted.textContent = state.winner_count;
  ctrlMetricTotal.textContent = state.total_winners;
  ctrlMetricEligible.textContent = state.eligible_count;
  ctrlMetricIgnored.textContent = state.ineligible_count;
  ctrlMetricNextSerial.textContent = `#${displayPosition(state.current_position, state.total_winners)}`;
  ctrlBtnSerialNum.textContent = displayPosition(state.current_position, state.total_winners);

  // Dynamic Event Titles
  if (state.event || state.organization || state.segment) {
    const rawEvent = (state.event || 'Live Raffle Draw').trim();
    document.title = `${rawEvent} — Event Controller Console`;
    const elHeaderEvent = document.getElementById('ctrlHeaderEventName');
    if (elHeaderEvent) elHeaderEvent.textContent = rawEvent;

    const elTopPillContainer = document.getElementById('ctrlPreviewTopPillContainer');
    const elTopPill = document.getElementById('ctrlPreviewTopPill');
    const elBrandPart1 = document.getElementById('ctrlPreviewBrandPart1');
    const elBrandPart2 = document.getElementById('ctrlPreviewBrandPart2');

    const org = (state.organization || '').trim();
    if (elTopPill && elTopPillContainer) {
      if (org) {
        elTopPill.textContent = org.toUpperCase();
        elTopPillContainer.style.display = 'inline-flex';
      } else {
        elTopPillContainer.style.display = 'none';
      }
    }

    const words = rawEvent.split(/\s+/);
    if (words.length > 1) {
      const lastWord = words.pop();
      if (elBrandPart1) elBrandPart1.textContent = words.join(' ');
      if (elBrandPart2) elBrandPart2.textContent = lastWord;
    } else {
      if (elBrandPart1) elBrandPart1.textContent = rawEvent;
      if (elBrandPart2) elBrandPart2.textContent = '';
    }
  }

  // Dynamic Category Counts and Badges
  if (state.category_counts) {
    renderDynamicCategories(state.category_counts);
  }

  // Lock Badge
  if (state.state === 'COUNTDOWN' || state.state === 'SELECTING') {
    ctrlLockBadge.textContent = 'Lock: DRAWING';
    ctrlLockBadge.style.color = '#38bdf8';
    ctrlLockBadge.style.borderColor = '#38bdf8';
  } else if (state.state === 'CANDIDATE_REVEALED') {
    ctrlLockBadge.textContent = 'Lock: REVEALED';
    ctrlLockBadge.style.color = '#34d399';
    ctrlLockBadge.style.borderColor = '#34d399';
  } else if (state.state === 'PAUSED') {
    ctrlLockBadge.textContent = 'Lock: PAUSED';
    ctrlLockBadge.style.color = '#f59e0b';
    ctrlLockBadge.style.borderColor = '#f59e0b';
  } else {
    ctrlLockBadge.textContent = 'Lock: IDLE';
    ctrlLockBadge.style.color = '#c084fc';
    ctrlLockBadge.style.borderColor = 'rgba(168,85,247,0.4)';
  }

  // Requirement 5: Strict single-action button activation!
  // Disable all buttons first
  ctrlBtnStart.disabled = true;
  ctrlBtnConfirm.disabled = true;
  ctrlBtnIgnore.disabled = true;
  ctrlBtnPause.disabled = true;
  ctrlBtnResume.disabled = true;
  if (ctrlBtnReset) ctrlBtnReset.disabled = true;
  if (ctrlBtnResetHeader) ctrlBtnResetHeader.disabled = true;

  document.querySelectorAll('.btn-active-highlight').forEach(el => el.classList.remove('btn-active-highlight'));

  // Enable ONLY corresponding button for current state
  switch (state.state) {
    case 'WAITING_FOR_START':
    case 'IDLE':
      ctrlBtnStart.disabled = false;
      ctrlBtnStart.classList.add('btn-active-highlight');
      if (ctrlBtnReset) ctrlBtnReset.disabled = false;
      if (ctrlBtnResetHeader) ctrlBtnResetHeader.disabled = false;
      setWorkflowStep(1);
      showPreviewIntro(displayPosition(state.current_position, state.total_winners), state.total_winners);
      break;

    case 'COUNTDOWN':
      ctrlBtnPause.disabled = false;
      ctrlBtnPause.classList.add('btn-active-highlight');
      setWorkflowStep(2);
      showPreviewCountdown(displayPosition(state.current_position, state.total_winners), state.countdown_remaining || 3);
      break;

    case 'SELECTING':
      ctrlBtnPause.disabled = false;
      ctrlBtnPause.classList.add('btn-active-highlight');
      setWorkflowStep(3);
      showPreviewRolling(displayPosition(state.current_position, state.total_winners));
      break;

    case 'CANDIDATE_REVEALED':
      ctrlBtnConfirm.disabled = false;
      ctrlBtnIgnore.disabled = false;
      ctrlBtnConfirm.classList.add('btn-active-highlight');
      setWorkflowStep(4);
      if (state.current_candidate) {
        showPreviewRevealed(displayPosition(state.current_position, state.total_winners), state.current_candidate);
      }
      break;

    case 'PAUSED':
      ctrlBtnResume.disabled = false;
      ctrlBtnResume.classList.add('btn-active-highlight');
      if (ctrlBtnReset) ctrlBtnReset.disabled = false;
      if (ctrlBtnResetHeader) ctrlBtnResetHeader.disabled = false;
      break;

    case 'COMPLETED':
      if (ctrlBtnReset) {
        ctrlBtnReset.disabled = false;
        ctrlBtnReset.classList.add('btn-active-highlight');
      }
      if (ctrlBtnResetHeader) ctrlBtnResetHeader.disabled = false;
      setWorkflowStep(5);
      showPreviewCompleted();
      break;

    default:
      break;
  }
}

function showPreviewIntro(serial, total, customText) {
  hideAllPreviews();
  if (ctrlPreviewIntro) {
    ctrlPreviewIntro.style.display = 'flex';
    const padded = String(serial).padStart(2, '0');
    if (ctrlPreviewReadySub) {
      ctrlPreviewReadySub.textContent = customText || `✨ READY • NEXT: WINNER #${padded} OF ${total} ✨`;
    }
  }
}

function showPreviewCountdown(serial, seconds) {
  hideAllPreviews();
  if (ctrlPreviewCountdown) {
    ctrlPreviewCountdown.style.display = 'flex';
    if (ctrlCountdownSerial) ctrlCountdownSerial.textContent = serial;
    if (ctrlCountdownDigit) ctrlCountdownDigit.textContent = seconds;
  }
}

function showPreviewRolling(serial, sampleNames = []) {
  hideAllPreviews();
  if (ctrlPreviewRolling) {
    ctrlPreviewRolling.style.display = 'flex';
    let idx = 0;
    rollingTimer = setInterval(() => {
      if (sampleNames && sampleNames.length > 0) {
        if (ctrlRollingName) ctrlRollingName.textContent = sampleNames[idx % sampleNames.length];
        if (ctrlRollingId) ctrlRollingId.textContent = `Candidate #${(idx % 114) + 1}`;
        idx++;
      } else {
        if (ctrlRollingName) ctrlRollingName.textContent = 'Selecting Candidate...';
      }
    }, 80);
  }
}

function showPreviewRevealed(serial, candidate) {
  hideAllPreviews();
  if (ctrlPreviewRevealed) {
    ctrlPreviewRevealed.style.display = 'flex';
    if (ctrlRevealedSerial) ctrlRevealedSerial.textContent = serial;
    if (ctrlRevealedName) ctrlRevealedName.textContent = candidate.name;
    if (ctrlRevealedRoll) {
      ctrlRevealedRoll.textContent = candidate.student_id ? `Student ID: ${candidate.student_id}` : `ID: ${candidate.unique_id}`;
    }
  }
}

function showPreviewWinner(winner) {
  hideAllPreviews();
  if (ctrlPreviewWinner) {
    ctrlPreviewWinner.style.display = 'flex';
    if (ctrlWinnerSerial) ctrlWinnerSerial.textContent = displayPosition(winner.position);
    if (ctrlWinnerName) ctrlWinnerName.textContent = winner.name;
    if (ctrlWinnerRoll) {
      ctrlWinnerRoll.textContent = winner.student_id ? `Student ID: ${winner.student_id}` : `ID: ${winner.unique_id}`;
    }
  }
}

function showPreviewCompleted() {
  hideAllPreviews();
  if (ctrlPreviewCompleted) {
    ctrlPreviewCompleted.style.display = 'flex';
  }
}

// ------------------------------------------------------------
// ACTION HANDLERS & RESET (REQUIREMENT 6 & 8)
// ------------------------------------------------------------

function setupActionListeners() {
  ctrlBtnStart.addEventListener('click', () => {
    ctrlBtnStart.disabled = true;
    ctrlBtnStart.classList.remove('btn-active-highlight');
    playBeep(700, 0.1);
    callApi('/api/controller/start', 'Draw initiated', { category: activeCategory });
  });

  ctrlBtnConfirm.addEventListener('click', () => {
    ctrlBtnConfirm.disabled = true;
    ctrlBtnIgnore.disabled = true;
    ctrlBtnConfirm.classList.remove('btn-active-highlight');
    playBeep(880, 0.2);
    callApi('/api/controller/confirm', 'Winner confirmed');
  });

  ctrlBtnIgnore.addEventListener('click', () => {
    if (confirm('Mark this candidate as absent / ineligible? The prize serial will be preserved for redraw.')) {
      ctrlBtnConfirm.disabled = true;
      ctrlBtnIgnore.disabled = true;
      playBeep(350, 0.25);
      callApi('/api/controller/ignore', 'Candidate marked ineligible');
    }
  });

  ctrlBtnPause.addEventListener('click', () => {
    ctrlBtnPause.disabled = true;
    ctrlBtnPause.classList.remove('btn-active-highlight');
    playBeep(500, 0.15);
    callApi('/api/controller/pause', 'Raffle paused');
  });

  ctrlBtnResume.addEventListener('click', () => {
    ctrlBtnResume.disabled = true;
    ctrlBtnResume.classList.remove('btn-active-highlight');
    playBeep(750, 0.15);
    callApi('/api/controller/resume', 'Raffle resumed');
  });

  // Reset Modal Handlers (Requirement 6)
  const openResetModal = () => {
    if (resetConfirmModal) resetConfirmModal.style.display = 'flex';
    playBeep(440, 0.2);
  };
  const closeResetModal = () => {
    if (resetConfirmModal) resetConfirmModal.style.display = 'none';
  };

  if (ctrlBtnReset) ctrlBtnReset.addEventListener('click', openResetModal);
  if (ctrlBtnResetHeader) ctrlBtnResetHeader.addEventListener('click', openResetModal);
  if (btnCancelReset) btnCancelReset.addEventListener('click', closeResetModal);
  if (btnConfirmReset) {
    btnConfirmReset.addEventListener('click', async () => {
      closeResetModal();
      await callApi('/api/controller/reset', 'Raffle restarted fresh from Winner #1');
      playBeep(880, 0.3);
      showToast('Raffle restarted fresh from Winner #1. Previous results archived.', 'success');
      addAuditLog('Raffle restarted fresh from Winner #1. Backup archived.', 'warn');
      await fetchWinners();
      await fetchIneligible();
    });
  }

  const triggerPdf = () => window.open(`${getApiBaseUrl()}/api/results/pdf`, '_blank');
  if (ctrlBtnPdfDownload) ctrlBtnPdfDownload.addEventListener('click', triggerPdf);
  if (ctrlBtnDownloadPdfTab) ctrlBtnDownloadPdfTab.addEventListener('click', triggerPdf);

  // Live search in winners table (Requirement 8)
  if (ctrlWinnerSearch) {
    ctrlWinnerSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderWinnersTable(cachedWinners);
        return;
      }
      const filtered = cachedWinners.filter(w => {
        const name = (w.name || '').toLowerCase();
        const roll = (w.student_id || w.unique_id || '').toLowerCase();
        const pos = String(w.position);
        return name.includes(q) || roll.includes(q) || pos.includes(q);
      });
      renderWinnersTable(filtered);
    });
  }

  // Setup Dynamic Settings & Excel Data Handlers
  setupSettingsHandlers();

  // Keyboard Shortcuts (Requirement 8)
  setupKeyboardShortcuts();
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;

    // Don't interfere with typing in form fields
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable)
    ) {
      return;
    }

    // Ignore ALL keyboard events by default
    e.preventDefault();
    e.stopPropagation();

    // Only your specific keys are activated
    if (e.code === 'Space') {
      if (ctrlBtnStart && !ctrlBtnStart.disabled) {
        ctrlBtnStart.click();
      }

    } else if (e.code === 'Enter') {
      if (ctrlBtnConfirm && !ctrlBtnConfirm.disabled) {
        ctrlBtnConfirm.click();
      }

    } else if (e.code === 'Escape') {
      if (resetConfirmModal && resetConfirmModal.style.display === 'flex') {
        resetConfirmModal.style.display = 'none';
      } else if (ctrlBtnIgnore && !ctrlBtnIgnore.disabled) {
        ctrlBtnIgnore.click();
      }

    } else if (e.key.toLowerCase() === 'p') {
      if (ctrlBtnPause && !ctrlBtnPause.disabled) {
        ctrlBtnPause.click();
      } else if (ctrlBtnResume && !ctrlBtnResume.disabled) {
        ctrlBtnResume.click();
      }

    } else if (e.key.toLowerCase() === 'r') {
      if (ctrlBtnReset && !ctrlBtnReset.disabled) {
        if (resetConfirmModal) {
          resetConfirmModal.style.display = 'flex';
        }
      }
    }
  }, true); // capture phase
}


async function callApi(endpoint, successText, body = null) {
  try {
    const url = `${getApiBaseUrl()}${endpoint}`;
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);

    if (!res.ok) {
      let errText = `Server returned ${res.status}`;
      try {
        const errJson = await res.json();
        errText = errJson.detail || errJson.error || errText;
      } catch { }
      throw new Error(errText);
    }

    const data = await res.json();
    if (data.success === false) {
      throw new Error(data.error || data.detail || 'Action rejected');
    }

    if (data.data) {
      applyConsoleState(data.data);
    }
  } catch (err) {
    showToast(err.message, 'error');
    addAuditLog(`Error: ${err.message}`, 'error');
  }
}

// ------------------------------------------------------------
// DATA & TABS
// ------------------------------------------------------------

function setupTabs() {
  tabNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabNavBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

async function fetchInitialConsoleData() {
  try {
    const statusRes = await fetch(`${getApiBaseUrl()}/api/controller/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (statusRes.ok && (statusRes.headers.get('content-type') || '').includes('application/json')) {
      const state = await statusRes.json();
      applyConsoleState(state);
    }

    await fetchWinners();
    await fetchIneligible();
  } catch (err) {
    console.error('Fetch console data error:', err);
  }
}

async function fetchWinners() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/results`);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      cachedWinners = data.data;
      ctrlCountWinners.textContent = data.data.length;
      renderWinnersTable(data.data);
    }
  } catch (err) {
    // Silently wait for backend
  }
}

function renderWinnersTable(winners) {
  if (!winners || winners.length === 0) {
    ctrlWinnersTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:20px;">No winners confirmed yet.</td></tr>';
    return;
  }

  ctrlWinnersTableBody.innerHTML = winners.map(w => `
    <tr>
      <td><span style="font-weight:800; color:#fbbf24; font-family:'JetBrains Mono', monospace;">#${displayPosition(w.position)}</span></td>
      <td style="font-weight:700; color:#ffffff;">${escapeHtml(w.name)}</td>
      <td><code style="color:#67e8f9;">${w.student_id ? escapeHtml(w.student_id) : escapeHtml(w.unique_id)}</code></td>
      <td><span style="text-transform:capitalize; color:#cbd5e1;">${escapeHtml(w.type || 'student')}</span></td>
    </tr>
  `).join('');
}

async function fetchIneligible() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/ineligible`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      ctrlCountIneligible.textContent = data.data.length;
      renderIneligibleTable(data.data);
    }
  } catch (err) {
    // Silently wait for backend
  }
}

function renderIneligibleTable(list) {
  if (!list || list.length === 0) {
    ctrlIneligibleTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:20px;">No ineligible records.</td></tr>';
    return;
  }

  ctrlIneligibleTableBody.innerHTML = list.map(i => `
    <tr>
      <td><span style="font-weight:800; color:#f43f5e; font-family:'JetBrains Mono', monospace;">#${i.position}</span></td>
      <td style="font-weight:700; color:#ffffff;">${escapeHtml(i.name)}</td>
      <td><code style="color:#94a3b8;">${i.student_id ? escapeHtml(i.student_id) : escapeHtml(i.unique_id)}</code></td>
      <td><span style="color:#fda4af;">Absent / Skipped</span></td>
    </tr>
  `).join('');
}

function addAuditLog(text, level = 'info') {
  const item = document.createElement('div');
  item.className = `audit-item ${level}`;
  const now = new Date().toLocaleTimeString();
  item.innerHTML = `<span>${escapeHtml(text)}</span><span style="color:#64748b; font-size:10px;">${now}</span>`;
  ctrlAuditFeed.prepend(item);
}

// ------------------------------------------------------------
// TOAST NOTIFICATIONS
// ------------------------------------------------------------

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast-box';

  if (type === 'success') {
    toast.style.background = 'rgba(6, 78, 59, 0.95)';
    toast.style.border = '1px solid #10b981';
    toast.style.color = '#a7f3d0';
  } else if (type === 'error') {
    toast.style.background = 'rgba(136, 19, 55, 0.95)';
    toast.style.border = '1px solid #f43f5e';
    toast.style.color = '#fecdd3';
  } else {
    toast.style.background = 'rgba(8, 47, 73, 0.95)';
    toast.style.border = '1px solid #06b6d4';
    toast.style.color = '#bae6fd';
  }

  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  ctrlToastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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

// ------------------------------------------------------------
// DYNAMIC CATEGORY BAR RENDERING
// ------------------------------------------------------------

function renderDynamicCategories(categoryCounts) {
  const container = document.getElementById('ctrlCategoryBar');
  if (!container || !categoryCounts) return;

  const categories = Object.keys(categoryCounts);
  if (categories.length === 0) return;

  const getCatMeta = (cat) => {
    const lower = cat.toLowerCase();
    if (lower === 'all') return { icon: 'groups', label: 'ALL', cls: '' };
    if (lower === 'student') return { icon: 'school', label: 'STUDENTS', cls: 'cat-student' };
    if (lower === 'faculty') return { icon: 'workspace_premium', label: 'FACULTY', cls: 'cat-faculty' };
    if (lower === 'guest' || lower === 'guests') return { icon: 'badge', label: 'GUESTS', cls: 'cat-guest' };
    if (lower.includes('vip')) return { icon: 'star', label: cat.toUpperCase(), cls: 'cat-faculty' };
    return { icon: 'person', label: cat.toUpperCase(), cls: '' };
  };

  container.innerHTML = categories.map(cat => {
    const meta = getCatMeta(cat);
    const count = categoryCounts[cat] || 0;
    const isActive = activeCategory.toLowerCase() === cat.toLowerCase();
    return `
      <button type="button" class="category-select-btn ${meta.cls} ${isActive ? 'active' : ''}" data-cat="${cat}">
        <span class="material-symbols-outlined" style="font-size:16px;">${meta.icon}</span>
        <span>${meta.label}</span>
        <span class="category-count-badge">${count}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.category-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.category-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat || 'all';
      playBeep(600, 0.1);
    });
  });
}

// ------------------------------------------------------------
// DYNAMIC SETTINGS & EXCEL DATA MANAGER
// ------------------------------------------------------------

function setupSettingsHandlers() {
  const ctrlBtnSettings = document.getElementById('ctrlBtnSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnReloadExcelData = document.getElementById('btnReloadExcelData');
  const inputUploadExcel = document.getElementById('inputUploadExcel');
  const settingsForm = document.getElementById('settingsForm');

  const openSettingsModal = async () => {
    if (!settingsModal) return;
    settingsModal.style.display = 'flex';
    playBeep(650, 0.15);
    await fetchSettingsData();
  };

  const closeSettingsModal = () => {
    if (settingsModal) settingsModal.style.display = 'none';
  };

  window.openSettingsModal = openSettingsModal;
  window.closeSettingsModal = closeSettingsModal;

  if (ctrlBtnSettings) {
    ctrlBtnSettings.onclick = openSettingsModal;
    ctrlBtnSettings.addEventListener('click', openSettingsModal);
  }
  if (btnCloseSettingsModal) btnCloseSettingsModal.addEventListener('click', closeSettingsModal);
  if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  async function fetchSettingsData() {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/controller/settings`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const s = data.settings || {};
      const f = data.file_info || {};

      // Fill Form Inputs
      const elOrg = document.getElementById('settingOrgName');
      const elEvent = document.getElementById('settingEventName');
      const elSegment = document.getElementById('settingSegmentName');
      const elWinners = document.getElementById('settingTotalWinners');
      const elCountdown = document.getElementById('settingCountdownSec');
      const elShuffle = document.getElementById('settingShufflePasses');
      const elRoll = document.getElementById('settingRollDurationMs');

      if (elOrg) elOrg.value = s.organization_name || '';
      if (elEvent) elEvent.value = s.event_name || '';
      if (elSegment) elSegment.value = s.segment_name || '';
      if (elWinners) elWinners.value = s.total_winners || 10;
      if (elCountdown) elCountdown.value = s.draw_countdown_seconds || 3;
      if (elShuffle) elShuffle.value = s.shuffle_passes || 100;
      if (elRoll) elRoll.value = s.name_roll_duration_ms || 1500;

      // Fill File Info
      const elFileBadge = document.getElementById('settingsFileBadge');
      const elTotal = document.getElementById('settingsTotalRows');
      const elEligible = document.getElementById('settingsEligibleRows');
      const elModified = document.getElementById('settingsFileModified');
      const elCols = document.getElementById('settingsColumnsList');

      if (elFileBadge) elFileBadge.textContent = f.filename || 'data.xlsx';
      if (elTotal) elTotal.textContent = f.total_rows || 0;
      if (elEligible) elEligible.textContent = f.eligible_rows || 0;
      if (elModified) elModified.textContent = f.modified_at || '—';

      if (elCols && Array.isArray(f.columns)) {
        elCols.innerHTML = f.columns.map(c => `<span class="lock-badge" style="color:#67e8f9; border-color:rgba(34,211,238,0.3);">${escapeHtml(c)}</span>`).join('');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  // Reload data.xlsx directly from disk
  if (btnReloadExcelData) {
    btnReloadExcelData.addEventListener('click', async () => {
      btnReloadExcelData.disabled = true;
      const origText = btnReloadExcelData.innerHTML;
      btnReloadExcelData.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">hourglass_top</span> <span>Reloading...</span>`;

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/controller/reload-data`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reload');

        showToast(data.message, 'success');
        addAuditLog(`data.xlsx reloaded: ${data.data.total_participants} participants (${data.data.eligible} eligible).`, 'info');
        playBeep(880, 0.2);
        await fetchSettingsData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnReloadExcelData.disabled = false;
        btnReloadExcelData.innerHTML = origText;
      }
    });
  }

  // Upload new Excel file
  if (inputUploadExcel) {
    inputUploadExcel.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const uploadStatus = document.getElementById('uploadStatusText');
      if (uploadStatus) uploadStatus.textContent = `Uploading ${file.name}...`;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/controller/upload-data`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');

        showToast(data.message, 'success');
        addAuditLog(`Uploaded ${file.name}: ${data.data.total_participants} participants loaded.`, 'success');
        playBeep(880, 0.25);
        await fetchSettingsData();
        if (uploadStatus) uploadStatus.textContent = `✓ Uploaded ${file.name}`;
      } catch (err) {
        showToast(err.message, 'error');
        if (uploadStatus) uploadStatus.textContent = `✗ ${err.message}`;
      } finally {
        inputUploadExcel.value = '';
      }
    });
  }

  // Save Settings Form
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btnSave = document.getElementById('btnSaveSettings');
      if (btnSave) btnSave.disabled = true;

      const payload = {
        organization_name: (document.getElementById('settingOrgName')?.value || '').trim(),
        event_name: document.getElementById('settingEventName').value.trim(),
        segment_name: document.getElementById('settingSegmentName').value.trim(),
        total_winners: parseInt(document.getElementById('settingTotalWinners').value, 10),
        draw_countdown_seconds: parseInt(document.getElementById('settingCountdownSec').value, 10),
        shuffle_passes: parseInt(document.getElementById('settingShufflePasses').value, 10),
        name_roll_duration_ms: parseInt(document.getElementById('settingRollDurationMs').value, 10)
      };

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/controller/settings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update settings');

        showToast('Settings saved & applied live to all stage displays!', 'success');
        addAuditLog(`Event settings updated: ${payload.event_name} (${payload.total_winners} winners target).`, 'info');
        playBeep(988, 0.2);
        closeSettingsModal();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (btnSave) btnSave.disabled = false;
      }
    });
  }
}

// Global direct handlers so inline onclick attributes always work reliably
window.openSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'flex';
  if (typeof setupSettingsHandlers === 'function') {
    setupSettingsHandlers();
  }
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
};

// Immediate or DOM ready execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSettingsHandlers);
} else {
  setupSettingsHandlers();
}
