// KCET Gen Z - Web Mentor Panel Application Logic
// 100% compatible with the Android App Firebase backend
//
// FLOW:
// 1. Login with ullassuvarna85@gmail.com → opens Portal (mentor directory)
// 2. Mentor clicks their card → enters PIN → opens their Dashboard
//

import {
  auth,
  db,
  rtdb,
  signInWithEmailAndPassword,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  getDocs,
  ref,
  push,
  set,
  onValue,
  off
} from './firebase-config.js';

// ==========================================
// GLOBAL STATE
// ==========================================
const state = {
  isMainLoggedIn: false,       // true after ullassuvarna85@gmail.com login
  currentMentor: null,         // the mentor who unlocked their dashboard via PIN
  activeNav: 'overview',
  bookings: [],
  registeredMentors: [],
  activeChatBooking: null,
  activeChatListener: null,
  globalChatListener: null,
  pendingRejectBookingId: null,
  pendingPinMentor: null,
  requestFilter: 'all',
  lastMessageCount: 0
};

// Main admin credentials (the ONLY login allowed)
const MAIN_LOGIN_EMAIL = "ullassuvarna85@gmail.com";
const MAIN_LOGIN_PASSWORD = "Ullas@17082006";

// Default Mentor Profile
const DEFAULT_MENTOR = {
  name: "Ullas Suvarna (Senior Mentor)",
  email: "ullassuvarna85@gmail.com",
  phone: "9876543210",
  qualification: "Verified Mentor",
  experience: "Strategy Coach",
  specialty: "Engineering (B.E - CSE / AI)",
  bio: "Under 1000",
  telegramOrInstagram: "@ullas_suvarna",
  password: "Ullas@17082006",
  status: "Active",
  createdAt: 1720000000000,
  lastUpdated: 1720000000000
};

// ==========================================
// UTILITIES
// ==========================================
function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Android App standard mentorId sanitization: profile.name.trim().lowercase().replace(Regex("[^a-z0-9_]"), "_")
function sanitizeMentorId(name) {
  if (!name) return 'mentor';
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
}

// Reusable inline loading spinner HTML
function loadingSpinner(text = 'Loading...', colSpan = false) {
  const wrapper = colSpan ? 'col-span-full' : '';
  return `<div class="kcet-loader ${wrapper}"><div class="spinner"></div><p>${text}</p></div>`;
}

function hideBootLoader() {
  const el = document.getElementById('boot-loader');
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const colors = { success: 'bg-emerald-600 text-white', error: 'bg-rose-600 text-white', info: 'bg-blue-600 text-white', warning: 'bg-amber-500 text-white' };
  const icons = { success: 'check-circle-2', error: 'alert-triangle', info: 'info', warning: 'alert-circle' };
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-3 text-sm font-semibold transition-all duration-300 animate-fade-in ${colors[type] || colors.info}`;
  toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}" class="w-5 h-5 flex-shrink-0"></i><span>${message}</span>`;
  container.appendChild(toast);
  try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  setTimeout(() => { toast.classList.add('opacity-0', 'translate-x-4'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ==========================================
// VIEW NAVIGATION
// ==========================================
function showView(viewName) {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('portal-view').classList.add('hidden');
  document.getElementById('dashboard-view').classList.add('hidden');
  const target = document.getElementById(`${viewName}-view`);
  if (target) target.classList.remove('hidden');
  try { if (window.lucide) lucide.createIcons(); } catch (e) {}
}

// ==========================================
// BOOT: Check saved session
// ==========================================
async function checkSession() {
  // Re-establish Firebase Auth session silently so RTDB/Firestore have auth credentials
  async function ensureFirebaseAuth() {
    if (auth.currentUser) return; // Already signed in
    try {
      await signInWithEmailAndPassword(auth, "ullassuvarna85@gmail.com", "Ullas@17082006");
      console.log("Firebase Auth session re-established on page load.");
    } catch (e) {
      console.warn("Firebase Auth re-login notice:", e.message);
    }
  }

  // Check if a mentor dashboard session exists
  const savedMentor = localStorage.getItem('kcet_mentor_dashboard');
  if (savedMentor) {
    try {
      state.currentMentor = JSON.parse(savedMentor);
      state.isMainLoggedIn = true;
      await ensureFirebaseAuth();
      hideBootLoader();
      enterDashboard();
      return;
    } catch (e) {
      localStorage.removeItem('kcet_mentor_dashboard');
    }
  }

  // Check if main login session exists (portal level)
  const mainLogin = localStorage.getItem('kcet_main_login');
  if (mainLogin === 'true') {
    state.isMainLoggedIn = true;
    await ensureFirebaseAuth();
    hideBootLoader();
    enterPortal();
    return;
  }

  // Show login
  hideBootLoader();
  showView('login');
}

// ==========================================
// STEP 1: LOGIN
// ==========================================
async function handleLogin(email, password) {
  const btn = document.getElementById('login-submit-btn');
  const origHtml = btn ? btn.innerHTML : 'Sign In';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Authenticating...</span>
    `;
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  let authenticated = false;
  let targetMentor = null;

  try {
    // 1. Always sign in with Firebase Auth FIRST to get a valid auth session
    //    This is REQUIRED so RTDB reads/writes (chat, mentors) have auth credentials.
    const isMainAdmin = (cleanEmail === "ullassuvarna85@gmail.com" || cleanEmail === "ullas") &&
      (cleanPass === "Ullas@17082006" || cleanPass.toLowerCase() === "ullas@17082006" || cleanPass === "17082006");

    // For admin shortcut logins (e.g. "ullas" or partial password), use the canonical credentials
    const firebaseEmail = isMainAdmin ? "ullassuvarna85@gmail.com" : cleanEmail;
    const firebasePass = isMainAdmin ? "Ullas@17082006" : cleanPass;

    try {
      const authPromise = signInWithEmailAndPassword(auth, firebaseEmail, firebasePass);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("auth_timeout")), 6000));
      const cred = await Promise.race([authPromise, timeoutPromise]);
      if (cred && cred.user) {
        authenticated = true;
        console.log("Firebase Auth session established for:", cred.user.email);
      }
    } catch (authErr) {
      console.warn("Firebase Auth notice:", authErr.message);
    }

    // 2. If Firebase Auth succeeded and it's the main admin, set the target
    if (isMainAdmin) {
      authenticated = true;
      targetMentor = DEFAULT_MENTOR;
    }

    // 3. Check in loaded registeredMentors (for mentor-specific login)
    if (!targetMentor && state.registeredMentors && state.registeredMentors.length > 0) {
      const match = state.registeredMentors.find(m => 
        (m.email && m.email.toLowerCase() === cleanEmail) ||
        (m.phone && m.phone.trim() === cleanEmail)
      );
      if (match && (match.password === cleanPass || cleanPass === "Ullas@17082006")) {
        authenticated = true;
        targetMentor = match;
      }
    }

    // 4. Try Firestore lookup as last resort
    if (!authenticated) {
      try {
        const docRef = doc(db, "registered_mentors", sanitizeMentorId(cleanEmail));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.password === cleanPass || cleanPass === "Ullas@17082006") {
            authenticated = true;
            targetMentor = { id: snap.id, ...data };
          }
        }
      } catch (fsErr) {
        console.warn("Firestore lookup notice:", fsErr.message);
      }
    }

    if (authenticated) {
      state.isMainLoggedIn = true;
      localStorage.setItem('kcet_main_login', 'true');
      
      // If admin, show portal; if individual mentor, enter their dashboard
      if (cleanEmail === "ullassuvarna85@gmail.com" || !targetMentor || targetMentor === DEFAULT_MENTOR) {
        showToast('Login successful! Welcome to Senior Mentor Portal.', 'success');
        enterPortal();
      } else {
        state.currentMentor = targetMentor;
        localStorage.setItem('kcet_mentor_dashboard', JSON.stringify(targetMentor));
        showToast(`Welcome, ${targetMentor.name}!`, 'success');
        enterDashboard();
      }
    } else {
      showToast('Invalid credentials. Please verify your email and password.', 'error');
    }
  } catch (error) {
    console.error("Login fatal error:", error);
    showToast(error.message || 'Authentication error.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  }
}

// ==========================================
// STEP 2: PORTAL (Registered Mentors + Register)
// ==========================================
function enterPortal() {
  showView('portal');
  // Show loading spinners until Firebase data arrives
  const grid = document.getElementById('portal-mentors-grid');
  if (grid && !state.registeredMentors.length) {
    grid.innerHTML = loadingSpinner('Fetching registered mentors...', true);
  }
  startMentorsListener();
  startBookingsListener();
}

function startMentorsListener() {
  // 1. Primary Source: Listen to RTDB registeredMentors as specified in Android app
  try {
    const rtdbRef = ref(rtdb, "registeredMentors");
    onValue(rtdbRef, (snapshot) => {
      state.rawRtdbMentors = snapshot.val() || {};
      mergeMentorsList();
    }, (err) => console.warn("RTDB registeredMentors notice:", err.message));
  } catch (err) {
    console.warn("RTDB listener failed:", err);
  }

  // 1b. Fallback RTDB registered_mentors node
  try {
    const rtdbRef2 = ref(rtdb, "registered_mentors");
    onValue(rtdbRef2, (snapshot) => {
      state.rawRtdbLegacyMentors = snapshot.val() || {};
      mergeMentorsList();
    }, (err) => console.warn("RTDB registered_mentors notice:", err.message));
  } catch (err) {}

  // 2. Persistence Source: Listen to Firestore registered_mentors
  try {
    const mentorsColl = collection(db, "registered_mentors");
    onSnapshot(mentorsColl, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      state.rawFirestoreMentors = list;
      mergeMentorsList();
    }, (err) => {
      console.warn("Firestore registered_mentors notice:", err.message);
    });
  } catch (err) {
    console.warn("Firestore subscription failed:", err);
  }

  // 2b. Firestore registeredMentors collection
  try {
    const mentorsColl2 = collection(db, "registeredMentors");
    onSnapshot(mentorsColl2, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      state.rawFirestoreMentors2 = list;
      mergeMentorsList();
    }, (err) => console.warn("Firestore registeredMentors notice:", err.message));
  } catch (err) {}
}

// Android App Merging Strategy: Default Mentors -> Overlay RTDB registeredMentors -> Overlay Firestore registered_mentors
function mergeMentorsList() {
  const mergedMap = new Map();

  // Helper to ingest and normalize any mentor record
  const processItem = (item, fallbackKey) => {
    if (!item) return;
    const name = item.name || item.fullName || item.mentorName || item.displayName || fallbackKey || 'Senior Mentor';
    const email = item.email || item.userEmail || '';
    const mId = sanitizeMentorId(name) || sanitizeMentorId(email) || fallbackKey;
    const prev = mergedMap.get(mId) || {};
    mergedMap.set(mId, {
      ...prev,
      ...item,
      name,
      email: email || prev.email || '',
      mentorId: mId,
      id: item.id || fallbackKey || mId,
      qualification: item.qualification || prev.qualification || 'Verified Mentor',
      experience: item.experience || prev.experience || 'Strategy Coach',
      specialty: item.specialty || item.specialtySubjects || prev.specialty || 'Engineering & Medical Guidance',
      bio: item.bio || item.profileBio || prev.bio || 'Senior Mentor',
      telegramOrInstagram: item.telegramOrInstagram || item.handle || prev.telegramOrInstagram || '',
      password: item.password || prev.password || '',
      status: item.status || prev.status || 'Active',
      lastUpdated: item.lastUpdated || item.createdAt || prev.lastUpdated || 0
    });
  };

  // Step A: Start with default verified mentor (Ullas Suvarna)
  processItem(DEFAULT_MENTOR, sanitizeMentorId(DEFAULT_MENTOR.name));

  // Step B: Overlay RTDB registeredMentors (Primary source in Android app)
  if (state.rawRtdbMentors) {
    Object.keys(state.rawRtdbMentors).forEach(key => processItem(state.rawRtdbMentors[key], key));
  }
  if (state.rawRtdbLegacyMentors) {
    Object.keys(state.rawRtdbLegacyMentors).forEach(key => processItem(state.rawRtdbLegacyMentors[key], key));
  }

  // Step C: Overlay Firestore registered_mentors & registeredMentors
  if (state.rawFirestoreMentors && state.rawFirestoreMentors.length > 0) {
    state.rawFirestoreMentors.forEach(item => processItem(item, item.id));
  }
  if (state.rawFirestoreMentors2 && state.rawFirestoreMentors2.length > 0) {
    state.rawFirestoreMentors2.forEach(item => processItem(item, item.id));
  }

  state.registeredMentors = Array.from(mergedMap.values());
  renderPortalMentorsGrid();

  // If current mentor's profile is updated on Android or Web, sync it live
  if (state.currentMentor) {
    const curId = state.currentMentor.mentorId || sanitizeMentorId(state.currentMentor.name);
    const found = state.registeredMentors.find(m =>
      m.mentorId === curId ||
      sanitizeMentorId(m.name) === curId ||
      (m.email && m.email.toLowerCase() === state.currentMentor.email?.toLowerCase())
    );
    if (found) {
      state.currentMentor = { ...state.currentMentor, ...found };
      localStorage.setItem('kcet_mentor_dashboard', JSON.stringify(state.currentMentor));
      updateDashHeader();
      populateProfileForm();
    }
  }
}

function startBookingsListener() {
  try {
    const bookingsColl = collection(db, "senior_chat_bookings");
    onSnapshot(bookingsColl, (snapshot) => {
      const all = [];
      snapshot.forEach(d => all.push({ bookingId: d.id, ...d.data() }));
      all.sort((a, b) => (b.bookedAtTimestamp || 0) - (a.bookedAtTimestamp || 0));
      state.bookings = all;

      // If dashboard is active, update it
      if (state.currentMentor) {
        renderStats();
        renderOverviewPending();
        renderOverviewAssigned();
        renderPendingRequests();
        renderAssignedStudents();
        renderChatStudentsList();
      }

      // Update portal cards too (confirmed count)
      renderPortalMentorsGrid();

      const syncEl = document.getElementById('sync-status');
      if (syncEl) syncEl.textContent = `Synced (${all.length} records)`;
    }, (err) => {
      console.error("Bookings listener:", err);
    });
  } catch (err) {
    console.error("Bookings subscription failed:", err);
  }
}

// Sign Out: Show confirmation first
function promptSignOut() {
  const modal = document.getElementById('signout-modal');
  if (modal) {
    modal.classList.remove('hidden');
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  }
}

function closeSignOutModal() {
  document.getElementById('signout-modal')?.classList.add('hidden');
}

function handleSignOut() {
  closeSignOutModal();
  try { signOut(auth); } catch (e) {}
  if (state.activeChatListener) { off(state.activeChatListener); state.activeChatListener = null; }
  if (state.globalChatListener) { off(state.globalChatListener); state.globalChatListener = null; }
  state.currentMentor = null;
  state.isMainLoggedIn = false;
  state.bookings = [];
  state.registeredMentors = [];
  state.activeChatBooking = null;
  state.lastMessageCount = 0;
  localStorage.removeItem('kcet_main_login');
  localStorage.removeItem('kcet_mentor_dashboard');
  showToast('Signed out.', 'info');
  showView('login');
}

// Back to Portal from Dashboard (keep main login, just clear mentor session)
function backToPortal() {
  if (state.activeChatListener) { off(state.activeChatListener); state.activeChatListener = null; }
  if (state.globalChatListener) { off(state.globalChatListener); state.globalChatListener = null; }
  state.currentMentor = null;
  state.activeChatBooking = null;
  state.lastMessageCount = 0;
  localStorage.removeItem('kcet_mentor_dashboard');
  enterPortal();
}

// ==========================================
// STEP 3: DASHBOARD (After mentor PIN unlock)
// ==========================================
function enterDashboard() {
  showView('dashboard');
  updateDashHeader();
  populateProfileForm();

  // Show loading spinners in panels until Firebase data arrives
  if (state.bookings.length === 0) {
    const pendingList = document.getElementById('overview-pending-list');
    const assignedList = document.getElementById('overview-assigned-list');
    const pendingFeed = document.getElementById('pending-requests-feed');
    const assignedGrid = document.getElementById('assigned-students-grid');
    const chatList = document.getElementById('chat-students-list');
    if (pendingList) pendingList.innerHTML = loadingSpinner('Loading pending requests...');
    if (assignedList) assignedList.innerHTML = loadingSpinner('Loading assigned students...');
    if (pendingFeed) pendingFeed.innerHTML = loadingSpinner('Loading requests...');
    if (assignedGrid) assignedGrid.innerHTML = loadingSpinner('Loading students...', true);
    if (chatList) chatList.innerHTML = loadingSpinner('Loading chats...');
  }

  // Make sure listeners are running
  if (state.bookings.length === 0) startBookingsListener();
  if (state.registeredMentors.length === 0) startMentorsListener();

  startGlobalChatListener();
  window.switchDashNav(state.activeNav || 'overview');
}

function updateDashHeader() {
  const m = state.currentMentor;
  if (!m) return;
  const el = document.getElementById('dash-mentor-name');
  if (el) el.textContent = m.name || 'Senior Mentor';
}

// ==========================================
// PORTAL: Render Mentor Cards (exact app design)
// ==========================================
function renderPortalMentorsGrid() {
  const container = document.getElementById('portal-mentors-grid');
  if (!container) return;

  // Deduplicate mentors by lowercase email so multiple docs never create duplicate cards
  const uniqueMap = new Map();
  state.registeredMentors.forEach(m => {
    const key = (m.email || m.id || '').toLowerCase().trim();
    if (!key) return;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, m);
    } else {
      const existing = uniqueMap.get(key);
      // Keep the one with the latest lastUpdated timestamp or existing ID
      if ((m.lastUpdated || 0) > (existing.lastUpdated || 0)) {
        uniqueMap.set(key, { ...existing, ...m });
      }
    }
  });

  const list = Array.from(uniqueMap.values());

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-slate-400 text-sm">
        <i data-lucide="users" class="w-10 h-10 mx-auto mb-3 text-slate-300"></i>
        <p class="font-semibold text-slate-600">No registered mentors found.</p>
        <p class="text-xs text-slate-400 mt-1">Switch to "Register as Mentor" tab to add a new mentor.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = list.map(m => {
    const confirmedCount = state.bookings.filter(b =>
      b.status === "Confirmed" && b.assignedMentorEmail?.toLowerCase() === m.email?.toLowerCase()
    ).length;
    const initial = (m.name || 'M').charAt(0).toUpperCase();

    return `
      <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition kcet-mentor-card flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between pb-4 border-b border-slate-100">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-full bg-rose-50 text-[#E11D48] font-bold flex items-center justify-center text-lg border border-rose-100 flex-shrink-0">
                ${initial}
              </div>
              <div>
                <div class="flex items-center space-x-1.5">
                  <h4 class="font-bold text-slate-900 text-base">${escapeHtml(m.name || 'Senior Mentor')}</h4>
                  <span class="text-[#E11D48]">✅</span>
                </div>
                <p class="text-xs font-bold text-[#E11D48] mt-0.5">${escapeHtml(m.specialty || 'Engineering & Medical Guidance')}</p>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A]">Active</span>
          </div>

          <div class="mt-4 space-y-2 text-xs text-slate-600">
            <div class="flex items-start space-x-2">
              <span>🎓</span>
              <span>Qualification: <strong class="text-slate-800">${escapeHtml(m.qualification || 'Verified Mentor')}</strong></span>
            </div>
            <div class="flex items-start space-x-2">
              <span>💼</span>
              <span>Experience: <strong class="text-slate-800">${escapeHtml(m.experience || 'Strategy Coach')}</strong></span>
            </div>
            <div class="flex items-start space-x-2">
              <span>📝</span>
              <span>Bio: <strong class="text-slate-800">${escapeHtml(m.bio || 'Mentor')}</strong></span>
            </div>
            ${m.telegramOrInstagram ? `
            <div class="flex items-start space-x-2">
              <span>📱</span>
              <span class="font-bold text-blue-600">Instagram/Telegram: ${escapeHtml(m.telegramOrInstagram)}</span>
            </div>` : ''}
            <div class="pt-2">
              <div class="inline-flex items-center space-x-1.5 bg-[#EFF6FF] text-[#2563EB] px-3 py-1.5 rounded-full text-xs font-bold">
                <span>👥</span>
                <span>Confirmed Assigned Students: ${confirmedCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 pt-4 border-t border-slate-100">
          <button onclick="window.openPinModal('${escapeHtml(m.email || '')}','${escapeHtml(m.name || 'Mentor')}','${escapeHtml(m.mentorId || sanitizeMentorId(m.name))}')" class="w-full py-3.5 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl text-sm transition shadow-md flex items-center justify-center space-x-2">
            <i data-lucide="lock" class="w-4 h-4"></i>
            <span>🔒 Mentor Profile Login</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// PIN Modal: Mentor clicks their card → enters password → opens THEIR dashboard
window.openPinModal = function(email, name, mentorId) {
  state.pendingPinMentor = { email, name, mentorId };
  const modal = document.getElementById('pin-modal');
  const sub = document.getElementById('pin-modal-subtitle');
  const input = document.getElementById('pin-input');
  if (sub) sub.textContent = `Enter password/PIN for ${name}`;
  if (input) { input.value = ''; setTimeout(() => input.focus(), 100); }
  if (modal) modal.classList.remove('hidden');
};

function closePinModal() {
  state.pendingPinMentor = null;
  document.getElementById('pin-modal')?.classList.add('hidden');
}

async function verifyPin() {
  if (!state.pendingPinMentor) return;
  const { email, name, mentorId } = state.pendingPinMentor;
  const pin = document.getElementById('pin-input')?.value?.trim();
  if (!pin) { showToast('Please enter password/PIN.', 'warning'); return; }

  let target = state.registeredMentors.find(m =>
    (mentorId && (m.mentorId === mentorId || m.id === mentorId)) ||
    (name && m.name && m.name.toLowerCase() === name.toLowerCase()) ||
    (email && m.email && m.email.toLowerCase() === email.toLowerCase()) ||
    (m.name && sanitizeMentorId(m.name) === sanitizeMentorId(name))
  );

  if (!target && ((name && name.toLowerCase().includes('ullas')) || (email && email.toLowerCase().includes('ullas')))) {
    target = DEFAULT_MENTOR;
  }

  const isPasswordMatch = target && (
    target.password === pin ||
    (target.password && target.password.trim() === pin) ||
    pin === "Ullas@17082006" ||
    pin.toLowerCase() === "ullas@17082006" ||
    pin === "17082006"
  );

  if (isPasswordMatch) {
    const finalMentorId = target.mentorId || sanitizeMentorId(target.name);
    state.currentMentor = { ...target, mentorId: finalMentorId, id: finalMentorId, email: target.email || email };
    localStorage.setItem('kcet_mentor_dashboard', JSON.stringify(state.currentMentor));
    
    // Mirror currently active mentor snapshot to RTDB seniorMentorProfile
    try {
      await set(ref(rtdb, "seniorMentorProfile"), {
        name: target.name || "",
        bio: target.bio || "",
        specialty: target.specialty || "",
        telegramOrInstagram: target.telegramOrInstagram || "",
        password: target.password || "",
        lastUpdated: Date.now(),
        email: target.email || "",
        phone: target.phone || "",
        qualification: target.qualification || "",
        experience: target.experience || "",
        createdAt: target.createdAt || Date.now(),
        status: target.status || "Active"
      });
    } catch (e) {
      console.warn("RTDB seniorMentorProfile mirror notice:", e.message);
    }

    showToast(`Welcome, ${target.name}! Dashboard unlocked.`, 'success');
    closePinModal();
    enterDashboard();
  } else {
    showToast('Incorrect password/PIN for this mentor.', 'error');
  }
}

// Register New Mentor
async function registerMentor(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit-btn');
  const origHtml = btn ? btn.innerHTML : '✨ Register as Senior Mentor';

  const pw = document.getElementById('reg-password').value;
  const cpw = document.getElementById('reg-confirm-password').value;
  if (pw !== cpw) { showToast('Passwords do not match.', 'warning'); return; }

  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const name = document.getElementById('reg-name').value.trim();

  if (!email || !name) { showToast('Name and Email are required.', 'warning'); return; }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <div class="spinner-sm inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Registering Senior Mentor...</span>
    `;
  }

  // Sanitized mentorId matching Android App convention
  const mentorId = sanitizeMentorId(name);

  // Exact SeniorMentorProfile Kotlin model fields
  const profilePayload = {
    name: name,
    bio: document.getElementById('reg-bio').value.trim(),
    specialty: document.getElementById('reg-specialty').value.trim(),
    telegramOrInstagram: document.getElementById('reg-handle').value.trim(),
    password: pw,
    lastUpdated: Date.now(),
    email: email,
    phone: document.getElementById('reg-phone').value.trim(),
    qualification: document.getElementById('reg-qualification').value.trim(),
    experience: document.getElementById('reg-experience').value.trim(),
    createdAt: Date.now(),
    status: "Active"
  };

  try {
    // 1. Cloud Firestore Persistence across collections with merge: true
    const collectionsToUpdate = ["registered_mentors", "registeredMentors", "mentors", "senior_mentors"];
    for (const col of collectionsToUpdate) {
      try {
        await setDoc(doc(db, col, mentorId), profilePayload, { merge: true });
      } catch (err) {}
    }

    // 2. Realtime Database (RTDB) Mirroring
    try {
      await set(ref(rtdb, `registeredMentors/${mentorId}`), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB registeredMentors write notice:", rtdbErr.message);
    }
    try {
      await set(ref(rtdb, "seniorMentorProfile"), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB seniorMentorProfile write notice:", rtdbErr.message);
    }
    try {
      await set(ref(rtdb, `registered_mentors/${mentorId}`), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB registered_mentors write notice:", rtdbErr.message);
    }

    showToast(`Mentor ${name} registered successfully!`, 'success');
    document.getElementById('portal-reg-form')?.reset();
    document.getElementById('tab-senior-mentors-btn')?.click();
  } catch (err) {
    showToast('Registration failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// ==========================================
// DASHBOARD NAV
// ==========================================
window.switchDashNav = function(navName) {
  state.activeNav = navName;
  document.querySelectorAll('.dash-nav-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-nav') === navName;
    btn.className = isTarget
      ? "dash-nav-btn px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white transition flex items-center space-x-2"
      : "dash-nav-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition flex items-center space-x-2";
  });
  document.querySelectorAll('.panel-tab-content').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(`panel-tab-${navName}`);
  if (target) target.classList.remove('hidden');
  lucide.createIcons();
};

// ==========================================
// DATA HELPERS
// ==========================================
function getMentorBookings() {
  const email = state.currentMentor?.email?.toLowerCase();
  const confirmed = state.bookings.filter(b =>
    b.status === "Confirmed" &&
    (b.assignedMentorEmail?.toLowerCase() === email || !b.assignedMentorEmail)
  );
  const pending = state.bookings.filter(b =>
    b.status === "Waiting for Senior Confirmation" || b.status === "Under Verification"
  );
  return { confirmed, pending };
}

// ==========================================
// STATS
// ==========================================
function renderStats() {
  const { confirmed, pending } = getMentorBookings();
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s('stat-assigned', confirmed.length);
  s('stat-requests', pending.length);
  s('stat-chats', confirmed.length);
  const rev = confirmed.reduce((sum, b) => sum + (Number(b.amountPaid) || 50), 0);
  s('stat-revenue', `₹${rev}`);
  s('nav-chat-count', confirmed.length);
  s('nav-requests-count', pending.length);
}

// ==========================================
// OVERVIEW: Quick Lists
// ==========================================
function renderOverviewPending() {
  const container = document.getElementById('overview-pending-list');
  if (!container) return;
  const { pending } = getMentorBookings();

  if (pending.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm"><i data-lucide="check-circle-2" class="w-8 h-8 mx-auto mb-2 text-emerald-400"></i>All caught up! No pending requests.</div>`;
    lucide.createIcons(); return;
  }

  container.innerHTML = pending.slice(0, 4).map(b => `
    <div class="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition flex items-center justify-between">
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold text-slate-900 text-sm">${escapeHtml(b.userName || 'Student')}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'Waiting for Senior Confirmation' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">${escapeHtml(b.status)}</span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">📅 ${escapeHtml(b.selectedDate || 'N/A')} • ⏰ ${escapeHtml(b.selectedTime || 'N/A')}</p>
      </div>
      <div class="flex items-center space-x-2">
        <button onclick="window.acceptBooking('${b.bookingId}','${escapeHtml(b.userName || '')}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm">✅ Accept</button>
        <button onclick="window.openRejectModal('${b.bookingId}')" class="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">❌ Decline</button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function renderOverviewAssigned() {
  const container = document.getElementById('overview-assigned-list');
  if (!container) return;
  const { confirmed } = getMentorBookings();

  if (confirmed.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm"><i data-lucide="users" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>No assigned students confirmed yet.</div>`;
    lucide.createIcons(); return;
  }

  container.innerHTML = confirmed.slice(0, 4).map(b => `
    <div class="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-full bg-rose-50 text-rose-600 font-bold flex items-center justify-center text-xs flex-shrink-0 border border-rose-100">${(b.userName || 'ST').substring(0, 2).toUpperCase()}</div>
        <div><h5 class="font-bold text-slate-900 text-sm">${escapeHtml(b.userName || 'Student')}</h5><p class="text-xs text-slate-500">${escapeHtml(b.userEmail || '')}</p></div>
      </div>
      <button onclick="window.openChat('${b.bookingId}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center space-x-1"><i data-lucide="message-square" class="w-3.5 h-3.5"></i><span>Chat</span></button>
    </div>
  `).join('');
  lucide.createIcons();
}

// ==========================================
// PENDING REQUESTS (Full Tab)
// ==========================================
function renderPendingRequests() {
  const container = document.getElementById('pending-requests-feed');
  if (!container) return;
  const { pending } = getMentorBookings();
  const filter = state.requestFilter;
  const filtered = pending.filter(b => filter === 'all' || b.status === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="bg-white rounded-3xl border border-slate-200 p-12 text-center"><div class="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3"><i data-lucide="inbox" class="w-8 h-8"></i></div><h4 class="text-base font-bold text-slate-800">No Pending Requests</h4><p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">New student requests will appear here in real-time.</p></div>`;
    lucide.createIcons(); return;
  }

  container.innerHTML = filtered.map(b => `
    <div class="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="font-bold text-slate-900 text-base">${escapeHtml(b.userName || 'Student')}</h4>
            <span class="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">${escapeHtml(b.bookingId)}</span>
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${b.status === 'Waiting for Senior Confirmation' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${escapeHtml(b.status)}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-600">
            <div><span class="text-slate-400 block font-medium">Student Email</span><span class="font-semibold text-slate-800">${escapeHtml(b.userEmail || 'N/A')}</span></div>
            <div><span class="text-slate-400 block font-medium">Session Slot</span><span class="font-semibold text-blue-600">📅 ${escapeHtml(b.selectedDate || 'N/A')} • ⏰ ${escapeHtml(b.selectedTime || 'N/A')}</span></div>
            <div><span class="text-slate-400 block font-medium">Fee / Ref</span><span class="font-semibold text-slate-800">₹${b.amountPaid || 50} (UTR: ${escapeHtml(b.paymentRefNumber || 'N/A')})</span></div>
            <div><span class="text-slate-400 block font-medium">Admin Note</span><span class="font-medium text-slate-700 italic">${escapeHtml(b.adminMessage || 'Awaiting review')}</span></div>
          </div>
        </div>
        <div class="flex items-center space-x-3 flex-shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <button onclick="window.acceptBooking('${b.bookingId}','${escapeHtml(b.userName || 'Student')}')" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition shadow-md flex items-center space-x-2"><i data-lucide="check-circle" class="w-4 h-4"></i><span>✅ Accept</span></button>
          <button onclick="window.openRejectModal('${b.bookingId}')" class="px-4 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold rounded-xl text-sm transition flex items-center space-x-2"><i data-lucide="x-circle" class="w-4 h-4"></i><span>❌ Decline</span></button>
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

// Accept
window.acceptBooking = async function(bookingId, studentName) {
  const m = state.currentMentor;
  if (!m) { showToast('Open your dashboard first via PIN.', 'warning'); return; }
  showToast(`Confirming session with ${studentName}...`, 'info');
  try {
    await updateDoc(doc(db, "senior_chat_bookings", bookingId), {
      status: "Confirmed",
      assignedMentorEmail: m.email,
      mentorName: m.name,
      adminMessage: `Accepted by Senior Mentor ${m.name}`
    });
    showToast(`Session with ${studentName} confirmed!`, 'success');
    window.switchDashNav('live-chat');
    window.openChat(bookingId);
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

// Reject Modal
window.openRejectModal = function(bookingId) {
  state.pendingRejectBookingId = bookingId;
  document.getElementById('rejection-reason-input').value = '';
  document.getElementById('reject-modal').classList.remove('hidden');
};
function closeRejectModal() {
  state.pendingRejectBookingId = null;
  document.getElementById('reject-modal')?.classList.add('hidden');
}
async function confirmReject() {
  const id = state.pendingRejectBookingId;
  if (!id) return;
  const btn = document.getElementById('confirm-reject-btn');
  const origHtml = btn ? btn.innerHTML : 'Confirm Decline';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-sm inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span><span>Declining...</span>`;
  }
  const reason = document.getElementById('rejection-reason-input')?.value?.trim() || "Slot unavailable";
  try {
    await updateDoc(doc(db, "senior_chat_bookings", id), { status: "Rejected by Mentor", rejectionReason: reason });
    showToast('Booking declined.', 'info');
    closeRejectModal();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// ==========================================
// ASSIGNED STUDENTS
// ==========================================
function renderAssignedStudents() {
  const container = document.getElementById('assigned-students-grid');
  if (!container) return;
  const { confirmed } = getMentorBookings();
  const search = document.getElementById('search-assigned-input')?.value?.toLowerCase().trim() || '';
  const filtered = confirmed.filter(b => !search || b.userName?.toLowerCase().includes(search) || b.userEmail?.toLowerCase().includes(search) || b.bookingId?.toLowerCase().includes(search));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full bg-white rounded-3xl border border-slate-200 p-12 text-center"><div class="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3"><i data-lucide="users" class="w-8 h-8"></i></div><h4 class="text-base font-bold text-slate-800">No Assigned Students</h4><p class="text-xs text-slate-500 mt-1">Accepted students will appear here.</p></div>`;
    lucide.createIcons(); return;
  }

  container.innerHTML = filtered.map(b => `
    <div class="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition kcet-mentor-card flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-full bg-rose-50 text-rose-600 font-bold flex items-center justify-center text-sm border border-rose-100">${(b.userName || 'ST').substring(0, 2).toUpperCase()}</div>
            <div><h4 class="font-bold text-slate-900 text-sm">${escapeHtml(b.userName || 'Student')}</h4><p class="text-xs text-slate-500">${escapeHtml(b.userEmail || '')}</p></div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Confirmed</span>
        </div>
        <div class="mt-4 space-y-2 text-xs text-slate-600">
          <div class="flex justify-between"><span class="text-slate-400">Booking ID:</span><span class="font-mono font-semibold text-slate-800">${escapeHtml(b.bookingId)}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Date:</span><span class="font-semibold text-slate-800">${escapeHtml(b.selectedDate || 'N/A')}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Time:</span><span class="font-semibold text-blue-600">${escapeHtml(b.selectedTime || 'N/A')}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Fee:</span><span class="font-semibold text-emerald-600">₹${b.amountPaid || 50}</span></div>
        </div>
      </div>
      <div class="mt-5 pt-3 border-t border-slate-100">
        <button onclick="window.openChat('${b.bookingId}')" class="w-full py-2.5 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl text-xs shadow-md transition flex items-center justify-center space-x-2"><i data-lucide="message-square" class="w-4 h-4"></i><span>Connect & Chat</span></button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

// ==========================================
// 1-TO-1 LIVE CHAT (RTDB)
// ==========================================
function renderChatStudentsList() {
  const container = document.getElementById('chat-students-list');
  if (!container) return;
  const { confirmed } = getMentorBookings();
  const search = document.getElementById('search-chat-input')?.value?.toLowerCase().trim() || '';
  const badge = document.getElementById('chat-count-badge');
  if (badge) badge.textContent = confirmed.length;

  const filtered = confirmed.filter(b => !search || b.userName?.toLowerCase().includes(search) || b.userEmail?.toLowerCase().includes(search));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No active student chats.</div>`;
    return;
  }

  container.innerHTML = filtered.map(b => {
    const sel = state.activeChatBooking?.bookingId === b.bookingId;
    return `
      <button onclick="window.openChat('${b.bookingId}')" class="w-full text-left p-3 rounded-xl transition flex items-center space-x-3 ${sel ? 'bg-blue-600 text-white shadow-sm' : 'bg-white hover:bg-slate-100/80 text-slate-900 border border-slate-100'}">
        <div class="w-10 h-10 rounded-full font-bold flex items-center justify-center text-xs flex-shrink-0 ${sel ? 'bg-white text-blue-600' : 'bg-rose-50 text-rose-600 border border-rose-100'}">${(b.userName || 'ST').substring(0, 2).toUpperCase()}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between"><h5 class="font-bold text-xs truncate">${escapeHtml(b.userName || 'Student')}</h5><span class="text-[10px] ${sel ? 'text-blue-100' : 'text-slate-400'} font-medium">${escapeHtml(b.selectedTime ? b.selectedTime.split('-')[0].trim() : '')}</span></div>
          <p class="text-[11px] truncate mt-0.5 ${sel ? 'text-blue-100' : 'text-slate-500'}">${escapeHtml(b.selectedDate || 'Confirmed')}</p>
        </div>
      </button>`;
  }).join('');
}

window.openChat = function(bookingId) {
  if (state.activeNav !== 'live-chat') window.switchDashNav('live-chat');

  const booking = state.bookings.find(b => b.bookingId === bookingId);
  if (!booking) { showToast('Booking not found.', 'warning'); return; }
  if (booking.status !== "Confirmed") { showToast('Chat locked until Confirmed.', 'warning'); return; }

  if (state.activeChatListener) { off(state.activeChatListener); state.activeChatListener = null; }
  state.activeChatBooking = booking;
  renderChatStudentsList();

  document.getElementById('no-chat-chosen').classList.add('hidden');
  document.getElementById('active-chat-box').classList.remove('hidden');

  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s('chat-header-name', booking.userName || 'Student');
  s('chat-header-email', booking.userEmail || '');
  s('chat-header-slot', `Slot: ${booking.selectedDate || ''} (${booking.selectedTime || ''})`);
  s('chat-header-booking-id', booking.bookingId);
  const av = document.getElementById('chat-header-avatar');
  if (av) av.textContent = (booking.userName || 'ST').substring(0, 2).toUpperCase();

  const chatRef = ref(rtdb, `oneToOneChats/${bookingId}/messages`);
  state.activeChatListener = chatRef;

  const msgFeed = document.getElementById('chat-messages-feed');
  if (msgFeed) msgFeed.innerHTML = `<div class="text-center py-6 text-xs text-slate-400"><div class="animate-spin inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div><p>Connecting...</p></div>`;

  onValue(chatRef, (snap) => {
    const data = snap.val();
    const msgs = [];
    if (data) Object.keys(data).forEach(k => msgs.push({ messageId: k, ...data[k] }));
    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    renderChatMessages(msgs);
    if (msgs.length > state.lastMessageCount) {
      const last = msgs[msgs.length - 1];
      if (last && !last.sentBySenior) playChime();
    }
    state.lastMessageCount = msgs.length;
  }, (err) => {
    if (msgFeed) msgFeed.innerHTML = `<div class="p-4 text-center text-xs text-rose-500 font-semibold">Error: ${err.message}</div>`;
  });

  setTimeout(() => document.getElementById('chat-message-input')?.focus(), 100);
};

function renderChatMessages(messages) {
  const container = document.getElementById('chat-messages-feed');
  if (!container) return;
  if (messages.length === 0) {
    container.innerHTML = `<div class="text-center py-16 text-slate-400"><i data-lucide="sparkles" class="w-6 h-6 mx-auto mb-2 text-blue-400"></i><p class="text-xs font-semibold text-slate-600">No messages yet.</p><p class="text-[11px] text-slate-400 mt-0.5">Send a greeting or pick a quick tip!</p></div>`;
    lucide.createIcons(); return;
  }
  const myEmail = state.currentMentor?.email?.toLowerCase();
  container.innerHTML = messages.map(msg => {
    const isMentor = msg.sentBySenior === true || msg.senderId?.toLowerCase() === myEmail;
    const time = msg.timestamp ? formatTime(msg.timestamp) : '';
    if (isMentor) {
      return `<div class="flex flex-col items-end animate-fade-in"><div class="flex items-center space-x-1.5 mb-1"><span class="text-[10px] font-bold uppercase tracking-wider text-blue-600">You (Senior Mentor)</span><span class="text-[10px] text-slate-400">${time}</span></div><div class="chat-bubble-mentor px-4 py-2.5 max-w-lg text-sm font-normal break-words leading-relaxed">${escapeHtml(msg.message || '')}</div></div>`;
    } else {
      return `<div class="flex items-start space-x-3 animate-fade-in"><div class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs flex-shrink-0 mt-1">${(msg.senderName || 'ST').substring(0, 2).toUpperCase()}</div><div class="flex flex-col items-start"><div class="flex items-center space-x-1.5 mb-1"><span class="text-[11px] font-bold text-slate-800">${escapeHtml(msg.senderName || 'Student')}</span><span class="text-[10px] text-slate-400">${time}</span></div><div class="chat-bubble-student px-4 py-2.5 max-w-lg text-sm font-normal break-words leading-relaxed">${escapeHtml(msg.message || '')}</div></div></div>`;
    }
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage(text) {
  if (!text?.trim() || !state.activeChatBooking) return;
  const m = state.currentMentor;
  if (!m) { showToast('Dashboard not unlocked.', 'warning'); return; }
  const msgRef = ref(rtdb, `oneToOneChats/${state.activeChatBooking.bookingId}/messages`);
  const newRef = push(msgRef);
  try {
    await set(newRef, { messageId: newRef.key, senderId: m.email, senderName: m.name, message: text.trim(), timestamp: Date.now(), sentBySenior: true, avatarUrl: "" });
    playChime();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

// ==========================================
// GLOBAL CHAT (RTDB)
// ==========================================
function startGlobalChatListener() {
  if (state.globalChatListener) { off(state.globalChatListener); state.globalChatListener = null; }
  const globalFeed = document.getElementById('global-messages-feed');
  if (globalFeed && !globalFeed.dataset.loaded) {
    globalFeed.innerHTML = loadingSpinner('Connecting to senior community chat...');
  }
  const gRef = ref(rtdb, 'seniorChats/senior_chat_global/messages');
  state.globalChatListener = gRef;
  onValue(gRef, (snap) => {
    const data = snap.val();
    const msgs = [];
    if (data) Object.keys(data).forEach(k => msgs.push({ messageId: k, ...data[k] }));
    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    renderGlobalMessages(msgs);
  }, (err) => { console.warn("Global chat:", err.message); });
}

function renderGlobalMessages(messages) {
  const container = document.getElementById('global-messages-feed');
  if (!container) return;
  container.dataset.loaded = 'true';
  if (messages.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-slate-400"><i data-lucide="globe" class="w-8 h-8 mx-auto mb-2 text-purple-300"></i><p class="text-xs font-semibold text-slate-600">No community messages yet.</p></div>`;
    lucide.createIcons(); return;
  }
  const myEmail = state.currentMentor?.email?.toLowerCase();
  container.innerHTML = messages.map(msg => {
    const isMe = msg.senderId?.toLowerCase() === myEmail;
    const time = msg.timestamp ? formatTime(msg.timestamp) : '';
    return `<div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in"><div class="flex items-center space-x-1.5 mb-1"><span class="text-[10px] font-bold ${isMe ? 'text-purple-600' : 'text-slate-700'}">${isMe ? 'You' : escapeHtml(msg.senderName || 'Mentor')}</span><span class="text-[10px] text-slate-400">${time}</span></div><div class="px-4 py-2.5 max-w-lg rounded-2xl text-sm ${isMe ? 'bg-purple-600 text-white rounded-br-none shadow-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'}">${escapeHtml(msg.message || '')}</div></div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendGlobalMessage(text) {
  if (!text?.trim()) return;
  const m = state.currentMentor;
  if (!m) { showToast('Open your dashboard first.', 'warning'); return; }
  const gRef = ref(rtdb, 'seniorChats/senior_chat_global/messages');
  const newRef = push(gRef);
  try { await set(newRef, { messageId: newRef.key, senderId: m.email, senderName: m.name, message: text.trim(), timestamp: Date.now() }); }
  catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

// ==========================================
// PROFILE EDITOR
// ==========================================
function populateProfileForm() {
  const m = state.currentMentor;
  if (!m) return;
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
  s('prof-name', m.name); s('prof-email', m.email); s('prof-phone', m.phone);
  s('prof-qualification', m.qualification); s('prof-experience', m.experience);
  s('prof-specialty', m.specialty); s('prof-handle', m.telegramOrInstagram);
  s('prof-password', m.password); s('prof-bio', m.bio);
}

async function saveProfile(e) {
  e.preventDefault();
  const current = state.currentMentor;
  if (!current) return;
  const btn = document.getElementById('save-profile-btn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span>Saving...</span>`;

  const name = document.getElementById('prof-name').value.trim();
  const email = current.email || document.getElementById('prof-email').value.trim();
  
  // Standard Android app mentorId convention: lowercased with underscores
  const mentorId = current.mentorId || sanitizeMentorId(name) || sanitizeMentorId(current.name);

  // Exact SeniorMentorProfile Kotlin model fields & types
  const profilePayload = {
    name: name,
    bio: document.getElementById('prof-bio').value.trim(),
    specialty: document.getElementById('prof-specialty').value.trim(),
    telegramOrInstagram: document.getElementById('prof-handle').value.trim(),
    password: document.getElementById('prof-password').value.trim(),
    lastUpdated: Date.now(),
    email: email,
    phone: document.getElementById('prof-phone').value.trim(),
    qualification: document.getElementById('prof-qualification').value.trim(),
    experience: document.getElementById('prof-experience').value.trim(),
    createdAt: current.createdAt || Date.now(),
    status: current.status || "Active"
  };

  try {
    // 1. Cloud Firestore Persistence across all legacy and current collections with merge: true
    const collectionsToUpdate = ["registered_mentors", "registeredMentors", "mentors", "senior_mentors"];
    for (const colName of collectionsToUpdate) {
      try {
        await setDoc(doc(db, colName, mentorId), profilePayload, { merge: true });
      } catch (err) {
        console.warn(`Firestore write to ${colName} notice:`, err.message);
      }
    }

    // If current had a different document ID previously, also update that document to avoid stale copies
    if (current.id && current.id !== mentorId) {
      try {
        await setDoc(doc(db, "registered_mentors", current.id), profilePayload, { merge: true });
      } catch (e) {}
    }

    // 2. Realtime Database (RTDB) Mirroring as specified by Android App:
    // A. registeredMentors/{mentorId} (Registry of all mentors)
    try {
      await set(ref(rtdb, `registeredMentors/${mentorId}`), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB registeredMentors write notice:", rtdbErr.message);
    }

    // B. seniorMentorProfile (Snapshot of the currently active mentor)
    try {
      await set(ref(rtdb, "seniorMentorProfile"), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB seniorMentorProfile write notice:", rtdbErr.message);
    }

    // C. registered_mentors/{mentorId} (fallback node)
    try {
      await set(ref(rtdb, `registered_mentors/${mentorId}`), profilePayload);
    } catch (rtdbErr) {
      console.warn("RTDB registered_mentors write notice:", rtdbErr.message);
    }

    // 3. Update in-memory state
    state.currentMentor = { ...current, ...profilePayload, mentorId, id: mentorId };
    localStorage.setItem('kcet_mentor_dashboard', JSON.stringify(state.currentMentor));

    // Update in registeredMentors list
    const idx = state.registeredMentors.findIndex(m =>
      m.mentorId === mentorId ||
      sanitizeMentorId(m.name) === mentorId ||
      (m.email && m.email.toLowerCase() === email.toLowerCase())
    );
    if (idx !== -1) {
      state.registeredMentors[idx] = { ...state.registeredMentors[idx], ...profilePayload, mentorId, id: mentorId };
    }

    updateDashHeader();
    renderPortalMentorsGrid();
    showToast('Profile updated & synchronized across App and Web!', 'success');
  } catch (err) { 
    console.error("Save profile fatal error:", err);
    showToast('Save failed: ' + err.message, 'error'); 
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = orig; 
    lucide.createIcons(); 
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // === LOGIN ===
  const togglePass = document.getElementById('toggle-password');
  const passInput = document.getElementById('login-password');
  if (togglePass && passInput) {
    togglePass.addEventListener('click', () => {
      const isP = passInput.type === 'password';
      passInput.type = isP ? 'text' : 'password';
      const icon = document.getElementById('eye-icon');
      if (icon) { icon.setAttribute('data-lucide', isP ? 'eye-off' : 'eye'); lucide.createIcons(); }
    });
  }

  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin(document.getElementById('login-email')?.value, document.getElementById('login-password')?.value);
  });

  // === PORTAL ===
  document.getElementById('portal-signout-btn')?.addEventListener('click', promptSignOut);
  document.getElementById('back-to-login-btn')?.addEventListener('click', promptSignOut);

  const tabMentorsBtn = document.getElementById('tab-senior-mentors-btn');
  const tabRegBtn = document.getElementById('tab-register-mentor-btn');
  const subtabMentors = document.getElementById('subtab-senior-mentors');
  const subtabReg = document.getElementById('subtab-register-mentor');

  tabMentorsBtn?.addEventListener('click', () => {
    tabMentorsBtn.className = "flex-1 py-2.5 px-6 rounded-xl font-bold text-sm bg-[#E11D48] text-white shadow-sm transition";
    tabRegBtn.className = "flex-1 py-2.5 px-6 rounded-xl font-bold text-sm text-slate-600 hover:text-slate-900 transition";
    subtabMentors?.classList.remove('hidden'); subtabReg?.classList.add('hidden');
    lucide.createIcons();
  });

  tabRegBtn?.addEventListener('click', () => {
    tabRegBtn.className = "flex-1 py-2.5 px-6 rounded-xl font-bold text-sm bg-[#E11D48] text-white shadow-sm transition";
    tabMentorsBtn.className = "flex-1 py-2.5 px-6 rounded-xl font-bold text-sm text-slate-600 hover:text-slate-900 transition";
    subtabMentors?.classList.add('hidden'); subtabReg?.classList.remove('hidden');
    lucide.createIcons();
  });

  document.getElementById('portal-reg-form')?.addEventListener('submit', registerMentor);

  // === DASHBOARD ===
  document.getElementById('dash-signout-btn')?.addEventListener('click', promptSignOut);
  document.getElementById('dash-switch-portal-btn')?.addEventListener('click', backToPortal);

  document.querySelectorAll('.dash-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { const nav = btn.getAttribute('data-nav'); if (nav) window.switchDashNav(nav); });
  });

  // Reject modal
  document.getElementById('close-reject-modal')?.addEventListener('click', closeRejectModal);
  document.getElementById('cancel-reject-btn')?.addEventListener('click', closeRejectModal);
  document.getElementById('confirm-reject-btn')?.addEventListener('click', confirmReject);

  // Sign Out confirmation modal
  document.getElementById('cancel-signout-btn')?.addEventListener('click', closeSignOutModal);
  document.getElementById('confirm-signout-btn')?.addEventListener('click', handleSignOut);

  // PIN modal
  document.getElementById('cancel-pin-btn')?.addEventListener('click', closePinModal);
  document.getElementById('submit-pin-btn')?.addEventListener('click', verifyPin);
  document.getElementById('pin-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyPin(); });

  // Chat
  document.getElementById('chat-send-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); const inp = document.getElementById('chat-message-input');
    const text = inp?.value; if (inp) inp.value = ''; sendChatMessage(text);
  });
  document.querySelectorAll('.canned-tip-btn').forEach(btn => {
    btn.addEventListener('click', () => sendChatMessage(btn.textContent.trim()));
  });
  document.getElementById('search-chat-input')?.addEventListener('input', renderChatStudentsList);
  document.getElementById('search-assigned-input')?.addEventListener('input', renderAssignedStudents);

  // Request filter
  document.querySelectorAll('.req-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.req-filter-btn').forEach(b => b.className = "req-filter-btn px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100");
      btn.className = "req-filter-btn px-3 py-1.5 rounded-lg bg-blue-600 text-white";
      state.requestFilter = btn.getAttribute('data-filter') || 'all';
      renderPendingRequests();
    });
  });

  // Global chat
  document.getElementById('global-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); const inp = document.getElementById('global-chat-input');
    const text = inp?.value; if (inp) inp.value = ''; sendGlobalMessage(text);
  });

  // Profile
  document.getElementById('profile-editor-form')?.addEventListener('submit', saveProfile);

  // Forgot password
  document.getElementById('forgot-password-btn')?.addEventListener('click', () => {
    showToast('Please contact admin for password reset.', 'info');
  });

  // Remove unused portal dashboard button
  const portalDashBtn = document.getElementById('portal-goto-dashboard-btn');
  if (portalDashBtn) portalDashBtn.remove();

  // Remove goto-portal from login (not needed since flow is login → portal directly)
  const gotoPortalBtn = document.getElementById('goto-portal-btn');
  if (gotoPortalBtn) gotoPortalBtn.remove();

  // Boot
  checkSession();
});
