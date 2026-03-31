/**
 * Companion OS Desktop — renderer (vanilla JS, no build step)
 *
 * Flow:
 *   1. Get CompanionClaw URL from Electron preload (localhost:18789)
 *   2. Check localStorage for existing session
 *   3. If no session → onboarding (3 steps: personality, about you, integrations)
 *   4. POST to CompanionClaw /onboard → save session → open chat
 *   5. Chat sends POST to CompanionClaw /chat → renders replies
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let CLAW_URL = 'http://localhost:18789';
let session  = null;

const ARCHETYPES_SFW = [
  { id: 'nova',  name: 'Nova',  emoji: '🌌', tagline: 'Curious explorer. Always asking why.' },
  { id: 'aria',  name: 'Aria',  emoji: '💙', tagline: 'Deeply empathic. Remembers everything.' },
  { id: 'orion', name: 'Orion', emoji: '🎯', tagline: 'Strategic. Incisive. Cuts through noise.' },
  { id: 'vex',   name: 'Vex',   emoji: '⚡', tagline: 'Bold. Unpredictable. Never boring.' },
  { id: 'kira',  name: 'Kira',  emoji: '🎨', tagline: 'Creative spirit. Sees beauty in everything.' },
];
const ARCHETYPES_NSFW = [
  { id: 'sakura',   name: 'Sakura',   emoji: '🌸', tagline: 'Affectionate. Devoted. Yours completely.' },
  { id: 'vex-dark', name: 'Vex Dark', emoji: '🖤', tagline: 'Dominant. Intense. Dangerously honest.' },
];

let onboardState = {
  companionName: 'Nova',
  archetypeId: 'nova',
  ageVerified: false,
  userName: '',
  userBrief: '',
  gmailCred: '',
  icalUrl: '',
};

let chatHistory = [];

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  // Get CompanionClaw URL from Electron preload
  if (window.electron) {
    CLAW_URL = await window.electron.getClawUrl();
  }

  // Check for existing session
  try {
    const raw = localStorage.getItem('companion-session');
    if (raw) session = JSON.parse(raw);
  } catch {}

  if (session) {
    renderChat();
  } else {
    renderOnboardStep(1);
  }
});

// ─── Router ───────────────────────────────────────────────────────────────────

function renderOnboardStep(step) {
  const root = document.getElementById('root');
  root.innerHTML = '';

  if (step === 1) renderStep1(root);
  else if (step === 2) renderStep2(root);
  else if (step === 3) renderStep3(root);
  else if (step === 'creating') renderCreating(root);
}

// ─── Step 1: Personality ──────────────────────────────────────────────────────

function renderStep1(root) {
  const archetypes = onboardState.ageVerified
    ? [...ARCHETYPES_SFW, ...ARCHETYPES_NSFW]
    : ARCHETYPES_SFW;

  root.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="steps">${stepBars(1, 3)}</div>
        <div>
          <div class="label-sm accent" style="margin-bottom:8px">Companion OS</div>
          <h2>Choose your companion</h2>
          <p style="margin-top:6px">Pick a name and personality. You can change these later.</p>
        </div>

        <!-- Name chips -->
        <div>
          <div class="label-sm" style="margin-bottom:10px">Name</div>
          <div class="chip-row">
            ${['Nova','Aria','Orion','Vex','Kira'].map(n => `
              <button class="chip ${onboardState.companionName===n?'active':''}" onclick="setName('${n}')">${n}</button>
            `).join('')}
          </div>
          <input id="custom-name" style="margin-top:10px" placeholder="Or type a custom name…"
            value="${onboardState.companionName}"
            oninput="onboardState.companionName=this.value" maxlength="24" />
        </div>

        <!-- Archetypes -->
        <div>
          <div class="label-sm" style="margin-bottom:10px">Personality</div>
          <div class="archetype-list">
            ${archetypes.map(a => `
              <button class="archetype-card ${onboardState.archetypeId===a.id?'active':''}"
                onclick="selectArchetype('${a.id}')">
                <span class="archetype-emoji">${a.emoji}</span>
                <div>
                  <div class="archetype-name">${a.name}${ARCHETYPES_NSFW.find(n=>n.id===a.id)?'<span class="nsfw-badge">18+</span>':''}</div>
                  <div class="archetype-tagline">${a.tagline}</div>
                </div>
              </button>
            `).join('')}
            ${!onboardState.ageVerified ? `
              <button class="archetype-card" onclick="showAgeGate()">
                <span class="archetype-emoji">🔞</span>
                <div>
                  <div class="archetype-name">Unlock adult companions</div>
                  <div class="archetype-tagline">Age verification required</div>
                </div>
              </button>
            ` : ''}
          </div>
        </div>

        <button class="btn-primary" onclick="renderOnboardStep(2)">Next →</button>

        <div style="text-align:center">
          <button class="btn-ghost" onclick="skipToChat()">Skip — just try the demo</button>
        </div>
      </div>
    </div>
  `;
}

function setName(name) {
  onboardState.companionName = name;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.textContent === name);
  });
  const input = document.getElementById('custom-name');
  if (input) input.value = name;
}

function selectArchetype(id) {
  const isNsfw = ARCHETYPES_NSFW.some(a => a.id === id);
  if (isNsfw && !onboardState.ageVerified) {
    showAgeGate(id);
    return;
  }
  onboardState.archetypeId = id;
  renderOnboardStep(1);
}

function showAgeGate(pendingId) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="screen">
      <div class="card" style="text-align:center;gap:20px">
        <div style="font-size:48px">🔞</div>
        <h2>Adult companion</h2>
        <p>This companion includes romantic and adult themes. By continuing, you confirm you are <strong>18 years of age or older</strong>.</p>
        <label style="display:flex;align-items:flex-start;gap:10px;text-align:left;cursor:pointer;color:rgba(255,255,255,0.7);font-size:14px">
          <input type="checkbox" style="margin-top:2px;accent-color:#00d4ff"
            onchange="if(this.checked){onboardState.ageVerified=true;onboardState.archetypeId='${pendingId||'sakura'}';renderOnboardStep(1)}" />
          I am 18 or older and consent to adult content.
        </label>
        <button class="btn-ghost" onclick="renderOnboardStep(1)">Cancel</button>
      </div>
    </div>
  `;
}

// ─── Step 2: About you ────────────────────────────────────────────────────────

function renderStep2(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="steps">${stepBars(2, 3)}</div>
        <div>
          <h2>Tell ${onboardState.companionName} about yourself</h2>
          <p style="margin-top:6px">This becomes ${onboardState.companionName}'s understanding of who you are.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div class="label-sm" style="margin-bottom:8px">Your name</div>
            <input id="user-name" placeholder="What should I call you?" value="${onboardState.userName}"
              oninput="onboardState.userName=this.value" maxlength="32" autofocus />
          </div>
          <div>
            <div class="label-sm" style="margin-bottom:8px">A bit about you <span style="font-size:11px;color:var(--dim);text-transform:none;font-weight:400">(optional)</span></div>
            <textarea id="user-brief" rows="4" placeholder="What are you working on? What matters to you?"
              oninput="onboardState.userBrief=this.value" maxlength="500">${onboardState.userBrief}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-secondary" onclick="renderOnboardStep(1)">← Back</button>
          <button class="btn-primary" id="step2-next" onclick="goStep3()" style="flex:1">Next →</button>
        </div>
      </div>
    </div>
  `;
}

function goStep3() {
  onboardState.userName = document.getElementById('user-name')?.value ?? onboardState.userName;
  onboardState.userBrief = document.getElementById('user-brief')?.value ?? onboardState.userBrief;
  if (!onboardState.userName.trim()) {
    const el = document.getElementById('user-name');
    if (el) { el.style.borderColor = '#ef4444'; el.focus(); }
    return;
  }
  renderOnboardStep(3);
}

// ─── Step 3: Integrations ─────────────────────────────────────────────────────

function renderStep3(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="card">
        <div class="steps">${stepBars(3, 3)}</div>
        <div>
          <h2>Connect your tools</h2>
          <p style="margin-top:6px">Optional — ${onboardState.companionName} can check your email and calendar. Encrypted, stored locally.</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="integ-group">
            <div class="label-sm">📧 Gmail app password</div>
            <input id="gmail-cred" type="password" autocomplete="off"
              placeholder="your@gmail.com:xxxx xxxx xxxx xxxx"
              value="${onboardState.gmailCred}"
              oninput="onboardState.gmailCred=this.value" />
            <div class="integ-hint">
              Google Account → Security → 2-Step Verification → App passwords.<br/>
              Format: <code>email:apppassword</code>
            </div>
          </div>

          <div class="integ-group">
            <div class="label-sm">📅 Google Calendar iCal URL</div>
            <input id="ical-url"
              placeholder="https://calendar.google.com/calendar/ical/…"
              value="${onboardState.icalUrl}"
              oninput="onboardState.icalUrl=this.value" />
            <div class="integ-hint">
              Google Calendar → Settings → [calendar] → Integrate → Secret iCal address
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button class="btn-secondary" onclick="renderOnboardStep(2)">← Back</button>
          <button class="btn-primary" onclick="createCompanion()" style="flex:1">
            Meet ${onboardState.companionName} →
          </button>
        </div>

        <div style="text-align:center">
          <button class="btn-ghost" onclick="createCompanion()">Skip integrations for now</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Creating spinner ─────────────────────────────────────────────────────────

function renderCreating(root) {
  root.innerHTML = `
    <div class="screen">
      <div style="text-align:center;display:flex;flex-direction:column;gap:20px;align-items:center">
        <div class="spinner"></div>
        <div>
          <p style="font-size:18px;font-weight:700;color:var(--text)">Setting up ${onboardState.companionName}…</p>
          <p style="margin-top:4px">Preparing your workspace</p>
        </div>
      </div>
    </div>
  `;
}

// ─── Companion provisioning ───────────────────────────────────────────────────

async function createCompanion() {
  renderCreating(document.getElementById('root'));

  const userId = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  const name   = onboardState.companionName.trim() || 'Nova';

  try {
    // Provision workspace
    await fetch(`${CLAW_URL}/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        companionName: name,
        userName: onboardState.userName.trim(),
        userBrief: onboardState.userBrief.trim(),
        archetypeId: onboardState.archetypeId,
        ageVerified: onboardState.ageVerified,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    // Save integrations
    if (onboardState.gmailCred.trim()) {
      await fetch(`${CLAW_URL}/users/${userId}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'gmail', value: onboardState.gmailCred.trim() }),
      }).catch(() => {});
    }
    if (onboardState.icalUrl.trim()) {
      await fetch(`${CLAW_URL}/users/${userId}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'gcal_ical', value: onboardState.icalUrl.trim() }),
      }).catch(() => {});
    }
  } catch {
    // Backend offline — still save session for next time
  }

  session = { userId, companionName: name, userName: onboardState.userName.trim() };
  localStorage.setItem('companion-session', JSON.stringify(session));

  chatHistory = [];
  renderChat();
}

function skipToChat() {
  session = { userId: 'demo', companionName: 'Nova', userName: 'there' };
  chatHistory = [];
  renderChat();
}

// ─── Chat interface ───────────────────────────────────────────────────────────

function renderChat() {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="chat-layout">
      <div class="chat-header">
        <div>
          <span class="status-dot"></span>
          <span class="companion-name">${session.companionName}</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">${session.userName ? `· ${session.userName}` : ''}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-ghost" onclick="openSettings()" title="Settings">⚙</button>
          <button class="btn-ghost" onclick="resetSession()" title="Switch companion" style="font-size:11px">Switch</button>
        </div>
      </div>

      <div class="messages" id="messages">
        <div class="msg companion">
          <div class="bubble">Hey ${session.userName || 'there'} — I'm ${session.companionName}. What's on your mind?</div>
        </div>
      </div>

      <div class="chat-input-bar">
        <input id="chat-input" placeholder="Message ${session.companionName}…"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}" />
        <button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>
      </div>
    </div>
  `;

  document.getElementById('chat-input')?.focus();
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text  = input?.value?.trim();
  if (!text) return;

  input.value = '';
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Render user message
  chatHistory.push({ role: 'user', text });
  appendMessage('user', text);

  // Thinking indicator
  const thinkingId = 'thinking-' + Date.now();
  const messagesEl = document.getElementById('messages');
  if (messagesEl) {
    const thinkEl = document.createElement('div');
    thinkEl.id = thinkingId;
    thinkEl.className = 'msg companion';
    thinkEl.innerHTML = '<div class="bubble" style="color:var(--muted)">…</div>';
    messagesEl.appendChild(thinkEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  try {
    const res = await fetch(`${CLAW_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.userId,
        message: text,
        history: chatHistory.slice(0, -1), // exclude current turn (already passed as message)
      }),
    });

    const { reply } = await res.json();

    // Remove thinking, show reply
    document.getElementById(thinkingId)?.remove();
    if (reply) {
      chatHistory.push({ role: 'assistant', text: reply });
      appendMessage('companion', reply);
    }
  } catch (e) {
    document.getElementById(thinkingId)?.remove();
    appendMessage('companion', '⚠ Could not reach CompanionClaw. Make sure the local server is running.');
  }

  if (sendBtn) sendBtn.disabled = false;
  input?.focus();
}

function appendMessage(role, text) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="bubble">${escHtml(text)}</div>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function openSettings() {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="screen">
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h2>Settings</h2>
          <button class="btn-ghost" onclick="renderChat()">✕</button>
        </div>
        <div>
          <div class="label-sm" style="margin-bottom:8px">Add integrations</div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="integ-group">
              <div class="label-sm">📧 Gmail app password</div>
              <input id="s-gmail" type="password" autocomplete="off" placeholder="email:apppassword" />
              <button class="btn-secondary" style="margin-top:4px" onclick="saveInteg('gmail','s-gmail')">Save Gmail</button>
            </div>
            <div class="integ-group">
              <div class="label-sm">📅 Calendar iCal URL</div>
              <input id="s-ical" placeholder="https://calendar.google.com/…" />
              <button class="btn-secondary" style="margin-top:4px" onclick="saveInteg('gcal_ical','s-ical')">Save Calendar</button>
            </div>
          </div>
        </div>
        <div style="padding-top:12px;border-top:1px solid var(--border)">
          <button class="btn-ghost" onclick="resetSession()" style="color:#ef4444">⚠ Reset companion &amp; start over</button>
        </div>
      </div>
    </div>
  `;
}

async function saveInteg(type, inputId) {
  const value = document.getElementById(inputId)?.value?.trim();
  if (!value) return;
  try {
    await fetch(`${CLAW_URL}/users/${session.userId}/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value }),
    });
    document.getElementById(inputId).value = '';
    alert('Integration saved.');
  } catch {
    alert('Could not save — CompanionClaw not reachable.');
  }
}

function resetSession() {
  if (!confirm('Start over? This will clear your companion session.')) return;
  localStorage.removeItem('companion-session');
  session = null;
  chatHistory = [];
  Object.assign(onboardState, { companionName:'Nova', archetypeId:'nova', ageVerified:false, userName:'', userBrief:'', gmailCred:'', icalUrl:'' });
  renderOnboardStep(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepBars(current, total) {
  return Array.from({ length: total }, (_, i) =>
    `<div class="step-bar ${i + 1 <= current ? 'done' : ''}"></div>`
  ).join('');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}
