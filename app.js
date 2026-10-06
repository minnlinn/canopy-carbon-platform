'use strict';

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(c / 100);
const qty = u => (u / 10).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = d => new Date(d).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

const KEY = 'canopy-platform-v3';
let store, actor = null, actorRole = null, view = 'market', timer, requestFilter = 'All', projectFilter = 'All', loginTab = 'sme', stale = false;

// Initialize Store
try {
  const raw = localStorage.getItem(KEY);
  const d = raw ? JSON.parse(raw) : null;
  if (d && d.version !== 3) throw Error();
  store = new CanopyModel.Store(d);
} catch {
  store = new CanopyModel.Store();
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.data));
  } catch (e) {
    console.warn('Storage unavailable', e);
  }
}

// URL params support for direct demo access & testing: ?role=admin or ?role=sme1 or ?role=partner1
const params = new URLSearchParams(window.location.search);
const directRole = params.get('role') || params.get('login');
if (directRole) {
  if (directRole === 'admin') {
    actor = 'admin';
    actorRole = 'admin';
    store.data.currentUser = { id: 'admin', role: 'admin' };
    view = params.get('view') || 'dashboard';
  } else if (directRole.startsWith('partner')) {
    actor = directRole === 'partner' ? 'partner1' : directRole;
    actorRole = 'partner';
    store.data.currentUser = { id: actor, role: 'partner' };
    view = params.get('view') || 'partner-dashboard';
  } else {
    actor = directRole === 'sme' ? 'sme1' : directRole;
    actorRole = 'sme';
    store.data.currentUser = { id: actor, role: 'sme' };
    view = params.get('view') || 'market';
  }
  saveState();
} else if (store.data.currentUser) {
  actor = store.data.currentUser.id;
  actorRole = store.data.currentUser.role;
  if (params.get('view')) view = params.get('view');
} else {
  actor = null;
  actorRole = null;
}

// Lookups & predicates
const project = id => store.project(id);
const company = id => store.account(id);
const partner = id => store.partner(id);
const isAdmin = () => actorRole === 'admin';
const isPartner = () => actorRole === 'partner';
const isSME = () => actorRole === 'sme';

// UI Helpers
const badge = s => `<span class="status ${['Verified', 'Completed', 'Published', 'Settled', 'Active', 'Onboarded & Trading'].includes(s) ? 'good' : ['Rejected', 'Suspended', 'Cancelled'].includes(s) ? 'bad' : s === 'Premium' ? 'premium-badge' : 'pending'}">${E(s)}</span>`;
const field = (label, name, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
const select = (label, name, options, value) => `<label>${label}<select name="${name}">${options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${E(v)}" ${v === value ? 'selected' : ''}>${E(t)}</option>`; }).join('')}</select></label>`;
const area = (label, name, value = '', extra = '') => `<label>${label}<textarea name="${name}" ${extra}>${E(value)}</textarea></label>`;
const end = label => `<p class="form-error" id="formError" role="alert"></p><button class="primary" type="submit">${label}</button></form>`;
const empty = (title, description) => `<div class="empty-state"><h2>${title}</h2><p>${description}</p></div>`;
const action = (label, a, id = '', style = 'secondary') => `<button class="${style}" data-action="${a}" data-id="${E(id)}">${label}</button>`;

function toast(s) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = s;
  t.style.display = 'block';
  clearTimeout(timer);
  timer = setTimeout(() => t.style.display = 'none', 4500);
}

function mutate(fn, message) {
  if (stale) throw Error('Reload this tab before making changes. Another tab updated data.');
  const before = JSON.stringify(store.data);
  try {
    const r = fn();
    saveState();
    render();
    if (message) toast(message);
    return r;
  } catch (e) {
    store = new CanopyModel.Store(JSON.parse(before));
    throw e;
  }
}

function modal(title, body, eyebrow = 'CANOPY · WORKSPACE ACTION') {
  $('#dialogEyebrow').textContent = eyebrow;
  $('#dialogBody').innerHTML = `<h2 id="dialogTitle">${title}</h2>${body}`;
  const d = $('#projectDialog');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

const closeModal = () => $('#projectDialog').close();

function form(fn) {
  const f = $('#modalForm');
  if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await fn(Object.fromEntries(new FormData(f)), f);
    } catch (err) {
      const errEl = $('#formError');
      if (errEl) errEl.textContent = err.message;
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  });
}

const heading = (eyebrow, title, description, button = '') => `
  <div class="page-title title-row">
    <div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <p>${description}</p>
    </div>
    ${button}
  </div>`;

const stats = (items, cols = 4) => `
  <div class="overview ${cols === 5 ? 'cols-5' : ''}">
    ${items.map(([label, value, sub]) => `
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
        <p>${sub}</p>
      </div>`).join('')}
  </div>`;

const table = (headers, rows) => `
  <div class="table-wrap">
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`;

function navigate(v) {
  view = v;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Session Handlers
function loginAs(role, id) {
  actor = id;
  actorRole = role;
  store.data.currentUser = { id, role };
  saveState();
  if (role === 'admin') view = 'dashboard';
  else if (role === 'partner') view = 'partner-dashboard';
  else view = 'market';
  render();
  toast('Signed in as ' + (role === 'admin' ? 'Canopy Operations' : role === 'partner' ? partner(id).name : company(id).name));
}

function logout() {
  actor = null;
  actorRole = null;
  store.data.currentUser = null;
  saveState();
  closeModal();
  render();
  toast('Signed out from Canopy.');
}

/* ==========================================================================
   RENDER ROOT (LOGIN OR WORKSPACE)
   ========================================================================== */
function render() {
  const root = $('#root');
  if (!actor || !actorRole) {
    root.innerHTML = renderLoginScreen();
    bindLoginEvents();
    return;
  }
  root.innerHTML = renderAppShell();
  bindAppEvents();
  renderCurrentView();
}

/* ==========================================================================
   LOGIN SCREEN COMPONENT
   ========================================================================== */
function renderLoginScreen() {
  return `
  <div class="login-screen">
    <div class="login-top-bar">
      <div class="brand"><span class="mark">c</span>canopy<span class="brand-dot">.</span></div>
      <div class="reg-tags">
        <span class="tag-pill">🇲🇾 BCX Aligned</span>
        <span class="tag-pill">National Carbon Policy 2026</span>
        <span class="tag-pill">BNM JC3 Standards</span>
      </div>
    </div>

    <div class="login-container">
      <!-- Left Hero Description -->
      <div class="login-hero">
        <div class="eyebrow" style="color: #a4dd97;">MALAYSIA'S SME CARBON WORKSPACE</div>
        <h1>Democratising <span>Carbon Credits</span> for Malaysian Businesses.</h1>
        <p>
          Lowering entry barriers to verified carbon projects through digital fractional units, transparent pricing, automated ESG audit reporting, and dedicated partner advisory tools.
        </p>

        <div class="hero-highlights">
          <div class="hero-card">
            <strong>Fractional Access</strong>
            <span>Trade from 0.1 tCO₂e without enterprise 1,000t bulk constraints.</span>
          </div>
          <div class="hero-card">
            <strong>1.5% Fair Fee</strong>
            <span>Transparent transaction fees with full registry traceability.</span>
          </div>
          <div class="hero-card">
            <strong>Bursa &amp; BNM ESG Pack</strong>
            <span>One-click RM100 compliance reports for supply chain audits.</span>
          </div>
          <div class="hero-card">
            <strong>Partner Portal</strong>
            <span>RM500/mo desk for ESG consultants, green banks &amp; advisors.</span>
          </div>
        </div>
      </div>

      <!-- Right Login Card -->
      <div class="login-card">
        <div class="login-card-header">
          <h2>Sign In to Workspace</h2>
          <p>Select your user portal or test with 1-click demo accounts.</p>
        </div>

        <!-- Role Tabs -->
        <div class="role-tabs">
          <button type="button" class="role-tab ${loginTab === 'sme' ? 'active' : ''}" data-login-tab="sme">🏢 SME Business</button>
          <button type="button" class="role-tab ${loginTab === 'admin' ? 'active' : ''}" data-login-tab="admin">🛡️ Canopy Admin</button>
          <button type="button" class="role-tab ${loginTab === 'partner' ? 'active' : ''}" data-login-tab="partner">🤝 Partner Portal</button>
        </div>

        <!-- Quick 1-Click Demo Login Shortcuts -->
        <div class="demo-quick-logins">
          <div class="label">
            <span>⚡ Instant Demo Access</span>
            <small>No password needed</small>
          </div>
          <div class="quick-btn-grid">
            ${loginTab === 'sme' ? `
              <button class="quick-login-btn" data-quick-login="sme" data-id="sme1">
                <span><strong>Meranti Manufacturing</strong><small> · Shah Alam</small></span>
                <span class="status good" style="font-size:11px;">Premium SME</span>
              </button>
              <button class="quick-login-btn" data-quick-login="sme" data-id="sme2">
                <span><strong>Kita Foods Sdn Bhd</strong><small> · Bayan Lepas</small></span>
                <span class="status pending" style="font-size:11px;">Free Plan</span>
              </button>
              <button class="quick-login-btn" data-quick-login="sme" data-id="sme3">
                <span><strong>Rimba Packaging</strong><small> · Johor Bahru</small></span>
                <span class="status pending" style="font-size:11px;">Pending KYB</span>
              </button>
            ` : loginTab === 'admin' ? `
              <button class="quick-login-btn" data-quick-login="admin" data-id="admin">
                <span><strong>Canopy Operations &amp; Risk Team</strong></span>
                <span class="status good" style="font-size:11px;">Admin Console</span>
              </button>
            ` : `
              <button class="quick-login-btn" data-quick-login="partner" data-id="partner1">
                <span><strong>EcoPartner ESG Advisory</strong><small> · KL</small></span>
                <span class="status good" style="font-size:11px;">Active Partner</span>
              </button>
              <button class="quick-login-btn" data-quick-login="partner" data-id="partner2">
                <span><strong>CIMB Green SME Desk</strong></span>
                <span class="status good" style="font-size:11px;">Active Partner</span>
              </button>
            `}
          </div>
        </div>

        <div class="login-divider"><span>or sign in with credentials</span></div>

        <!-- Form -->
        <form id="loginForm">
          <div class="login-form-group">
            <label>Work Email</label>
            <input type="email" id="loginEmail" required value="${loginTab === 'admin' ? 'admin@canopy.eco' : loginTab === 'partner' ? 'azlan@ecopartner.my' : 'aina@meranti.com.my'}">
          </div>
          <div class="login-form-group">
            <label>Password</label>
            <input type="password" id="loginPassword" required value="demo-session-2026">
          </div>
          <button type="submit" class="primary" style="width:100%; margin-top:10px;">Enter ${loginTab.toUpperCase()} Workspace</button>
        </form>

        <div class="login-card-foot">
          ${loginTab === 'sme' ? `
            <span>New Malaysian business? <a href="#" id="linkRegisterSme">Register SME for verification</a></span>
          ` : loginTab === 'partner' ? `
            <span>Are you a consultant or bank? Partner desk is RM500/mo. <a href="#" id="linkPartnerInfo">Learn more</a></span>
          ` : `
            <span>Restricted to authorized Canopy compliance and exchange operations staff.</span>
          `}
        </div>
      </div>
    </div>

    <div class="login-bottom-bar">
      <span>© 2026 Canopy Carbon Platform · Malaysian B2B FinTech Demonstration</span>
      <span>Simulated environment · No live BCX connection or actual fund transfer</span>
    </div>
  </div>`;
}

function bindLoginEvents() {
  $$('.role-tab').forEach(btn => {
    btn.onclick = () => {
      loginTab = btn.dataset.loginTab;
      render();
    };
  });

  $$('.quick-login-btn').forEach(btn => {
    btn.onclick = () => {
      loginAs(btn.dataset.quickLogin, btn.dataset.id);
    };
  });

  const f = $('#loginForm');
  if (f) {
    f.onsubmit = e => {
      e.preventDefault();
      const email = $('#loginEmail').value.trim().toLowerCase();
      if (loginTab === 'admin') {
        loginAs('admin', 'admin');
      } else if (loginTab === 'partner') {
        const p = store.data.partners.find(pt => pt.email.toLowerCase() === email) || store.data.partners[0];
        loginAs('partner', p.id);
      } else {
        const s = store.data.accounts.find(a => a.email.toLowerCase() === email) || store.data.accounts[0];
        loginAs('sme', s.id);
      }
    };
  }

  const regLink = $('#linkRegisterSme');
  if (regLink) regLink.onclick = e => { e.preventDefault(); newAccount(); };

  const partnerLink = $('#linkPartnerInfo');
  if (partnerLink) partnerLink.onclick = e => {
    e.preventDefault();
    modal('Canopy Partner Portal (RM500 / month)', `
      <p class="dialog-description">Designed for Sustainability Consultants, ESG Auditors, and Commercial Banks advising Malaysian SMEs on carbon decarbonisation.</p>
      <div class="pricing-card featured" style="margin:16px 0;">
        <span class="pricing-badge">ADVISORY DESK</span>
        <h3>Partner Subscription</h3>
        <div class="price">RM500 <small>/ month</small></div>
        <ul class="feature-list">
          <li><span class="check-icon">✓</span> Dedicated Partner Dashboard &amp; Referral Code</li>
          <li><span class="check-icon">✓</span> SME Referral Pipeline Management &amp; Fee Sharing</li>
          <li><span class="check-icon">✓</span> Real-time Portfolio Visibility into Referred SME Clients</li>
          <li><span class="check-icon">✓</span> Download Batch ESG &amp; Carbon Audit Reports</li>
          <li><span class="check-icon">✓</span> Access Technical Project PDDs and BCX Registry Documentation</li>
        </ul>
      </div>
      <button class="primary" style="width:100%;" onclick="loginAs('partner','partner1')">Enter Partner Portal Demo</button>
    `);
  };
}

/* ==========================================================================
   APP SHELL (SIDEBAR & HEADER)
   ========================================================================== */
function renderAppShell() {
  const currentRole = actorRole;
  let navItems = [];

  if (currentRole === 'admin') {
    navItems = [
      ['dashboard', '◫', 'Overview'],
      ['queue', '⇄', 'Request Queue'],
      ['projects', '▤', 'Project Listings'],
      ['companies', '▦', 'SME Verification'],
      ['billing', '🏷️', 'Developer Billing', '1% Com.'],
      ['platform-revenue', '💰', 'Platform Revenue', '5 Streams'],
      ['reports', '▥', 'Audit & Reports']
    ];
  } else if (currentRole === 'partner') {
    navItems = [
      ['partner-dashboard', '◫', 'Partner Overview'],
      ['partner-referrals', '👥', 'SME Referrals', 'RM Share'],
      ['partner-clients', '📊', 'Client ESG Data'],
      ['partner-reports', '▥', 'Reporting Tools'],
      ['partner-projects', '▤', 'Project Advisory'],
      ['partner-analytics', '📈', 'Partner Analytics']
    ];
  } else {
    // SME
    const isPrem = company(actor).plan === 'Premium';
    navItems = [
      ['market', '◫', 'Marketplace'],
      ['portfolio', '▤', 'My Holdings'],
      ['analytics', '📈', 'Portfolio Analytics', isPrem ? 'PRO' : 'Preview'],
      ['requests', '⇄', 'My Requests'],
      ['history', '≡', 'Transactions'],
      ['certificates', '▧', 'Certificates'],
      ['esg-reports', '📋', 'ESG & Carbon Reports', 'RM100'],
      ['premium', '⭐', 'Premium Plan', isPrem ? 'Active' : 'RM150'],
      ['account', '◎', 'Company Profile']
    ];
  }

  // Account name & meta
  let avatarLetter = 'C', workspaceTitle = 'Canopy Operations', workspaceSub = 'Administrator';
  if (currentRole === 'sme') {
    const acc = company(actor);
    avatarLetter = acc.name[0];
    workspaceTitle = acc.name;
    workspaceSub = (acc.plan === 'Premium' ? '⭐ Premium SME' : 'Free SME') + ' · ' + acc.status;
  } else if (currentRole === 'partner') {
    const pt = partner(actor);
    avatarLetter = pt.name[0];
    workspaceTitle = pt.name;
    workspaceSub = 'Partner Portal · RM500/mo';
  }

  return `
  <aside class="sidebar">
    <a class="brand" href="#workspace"><span class="mark">c</span>canopy<span class="brand-dot">.</span></a>
    
    <div class="workspace-badge-box">
      <span class="avatar">${avatarLetter}</span>
      <div class="meta">
        <strong>${E(workspaceTitle)}</strong>
        <small>${E(workspaceSub)}</small>
      </div>
    </div>

    <p class="nav-label">${currentRole === 'admin' ? 'ADMIN WORKSPACE' : currentRole === 'partner' ? 'PARTNER PORTAL' : 'SME WORKSPACE'}</p>
    <nav id="navigation" aria-label="Main navigation">
      ${navItems.map(([id, icon, name, tag]) => `
        <button class="nav-item ${view === id ? 'active' : ''}" data-nav="${id}">
          <span>${icon}</span>
          ${name}
          ${tag ? `<b class="nav-badge-pill">${tag}</b>` : ''}
        </button>`).join('')}
    </nav>

    <div class="sidebar-note">
      <span class="small-label">BURSA CARBON EXCHANGE (BCX)</span>
      <h3>VCM Integration Ready</h3>
      <p>Simulating 0.1 tCO₂e fractionalisation linked to BCX registry standards.</p>
      <span class="status good" style="font-size:11px;">National Carbon Policy 2026</span>
    </div>

    <div class="sidebar-foot">
      <span>Canopy v0.3</span>
      <button class="signout-link" id="sidebarSignoutBtn">⎋ Sign Out</button>
    </div>
  </aside>

  <div class="app">
    <header>
      <div class="breadcrumb">Workspace <span>/</span> <strong id="crumb">${E(view)}</strong></div>
      
      <div class="header-right">
        <!-- Switch Account Dropdown for Quick Testing -->
        <label class="switch-label">
          <span>Switch User:</span>
          <select id="accountSwitch" aria-label="Demo account switch">
            <optgroup label="Canopy Management">
              <option value="admin|admin" ${isAdmin() ? 'selected' : ''}>🛡️ Admin · Canopy Operations</option>
            </optgroup>
            <optgroup label="Malaysian SMEs">
              ${store.data.accounts.map(a => `
                <option value="sme|${E(a.id)}" ${actor === a.id ? 'selected' : ''}>
                  🏢 SME · ${E(a.name)} (${a.plan === 'Premium' ? '⭐ Premium' : 'Free'})
                </option>`).join('')}
            </optgroup>
            <optgroup label="Partner Portal (RM500/mo)">
              ${store.data.partners.map(p => `
                <option value="partner|${E(p.id)}" ${actor === p.id ? 'selected' : ''}>
                  🤝 Partner · ${E(p.name)}
                </option>`).join('')}
            </optgroup>
          </select>
        </label>

        <button class="header-logout-btn" id="headerLogoutBtn">⎋ Sign Out</button>
      </div>
    </header>

    <main>
      <div class="notice">
        <span class="notice-icon">i</span>
        <span>
          <strong>Canopy B2B Prototype:</strong> Demonstrating 5 revenue streams: <strong>1.5% SME transaction fee</strong>, <strong>1% project developer commission</strong>, <strong>RM150/mo SME Premium subscription</strong>, <strong>RM500/mo Partner portal</strong>, and <strong>RM100 Carbon &amp; ESG reports</strong>.
        </span>
      </div>

      <div id="content"></div>
    </main>

    <footer>
      <span>© 2026 Canopy Carbon Platform · Aligned with Bursa Carbon Exchange (BCX)</span>
      <span id="saveStatus">Data saved in browser localStorage</span>
    </footer>
  </div>`;
}

function bindAppEvents() {
  $('#sidebarSignoutBtn').onclick = logout;
  $('#headerLogoutBtn').onclick = logout;

  $('#accountSwitch').onchange = e => {
    const [role, id] = e.target.value.split('|');
    loginAs(role, id);
  };
}

/* ==========================================================================
   VIEW ROUTING
   ========================================================================== */
function renderCurrentView() {
  const screens = {
    // SME
    market: renderMarket,
    portfolio: renderPortfolio,
    analytics: renderAnalytics,
    requests: renderRequests,
    history: renderHistory,
    certificates: renderCertificates,
    'esg-reports': renderEsgReports,
    premium: renderPremium,
    account: renderAccount,
    // Admin
    dashboard: renderDashboard,
    queue: renderQueue,
    projects: renderProjects,
    companies: renderCompanies,
    billing: renderDeveloperBilling,
    'platform-revenue': renderPlatformRevenue,
    reports: renderReports,
    // Partner
    'partner-dashboard': renderPartnerDashboard,
    'partner-referrals': renderPartnerReferrals,
    'partner-clients': renderPartnerClients,
    'partner-reports': renderPartnerReports,
    'partner-projects': renderPartnerProjects,
    'partner-analytics': renderPartnerAnalytics
  };

  const renderer = screens[view] || (isAdmin() ? renderDashboard : isPartner() ? renderPartnerDashboard : renderMarket);
  $('#crumb').textContent = view.replace(/-/g, ' ').toUpperCase();
  $('#content').innerHTML = renderer();
}

/* ==========================================================================
   SME VIEWS
   ========================================================================== */
function renderMarket() {
  const acc = company(actor);
  const isPrem = acc.plan === 'Premium';
  const list = store.data.projects.filter(p => p.status === 'Published' && (projectFilter === 'All' || p.type === projectFilter));

  return heading('CURATED BCX & VCM PROJECTS', 'Carbon Marketplace.', 'Trade fractional carbon credits from 0.1 tCO₂e with transparent 1.5% platform transaction fee.')
    + (acc.status !== 'Verified' ? `<div class="warning">Your SME is currently <strong>${E(acc.status)}</strong>. Carbon transactions require admin verification. ${action('Complete profile', 'profile')}</div>` : '')
    + stats([
      ['Available projects', list.length, 'Verified listings'],
      ['My holdings', qty(Object.values(store.data.balances[actor] || {}).reduce((a, b) => a + b, 0)) + ' tCO₂e', 'Owned in wallet'],
      ['My active requests', store.data.requests.filter(r => r.accountId === actor && CanopyModel.active(r)).length, 'In review or approval'],
      ['SME Plan', isPrem ? '⭐ Premium' : 'Free Tier', isPrem ? 'Priority access active' : 'Standard 48h access']
    ])
    + `<div class="section-top">
        <h2>Available Projects <span class="count">${list.length}</span></h2>
        <label class="filter">Category
          <select id="projectFilter">
            ${['All', ...new Set(store.data.projects.map(p => p.type))].map(t => `<option ${t === projectFilter ? 'selected' : ''}>${E(t)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="projects">
        ${list.map((p, i) => `
          <article class="project-card">
            <div class="card-top ${p.type === 'Methane avoidance' ? 'methane' : p.type === 'Biochar removal' ? 'biochar' : 'forest'}">
              ${p.earlyAccess ? `<span class="early-access-ribbon">⭐ 48H PRIORITY ACCESS</span>` : ''}
              <span class="sample-label">${E(p.vintage)}</span>
              <span class="project-kind">${E(p.type)}</span>
              <div class="project-code">${String(i + 1).padStart(2, '0')}</div>
            </div>
            <div class="card-body">
              <div class="location">📍 ${E(p.location)}</div>
              <h3>${E(p.name)}</h3>
              <div class="developer-line">🏢 Developer: <strong>${E(p.developer)}</strong></div>
              <p class="description">${E(p.description)}</p>
              <div class="tags">
                <span class="tag">📜 ${E(p.registry)}</span>
                <span class="tag">${E(p.method)}</span>
              </div>
              <div class="price-row">
                <div>
                  <strong>${money(p.price)}</strong>
                  <small>per tCO₂e (0.1t fractional)</small>
                </div>
                <span>${qty(store.inventory(p.id))} t available</span>
              </div>
              <div class="row-actions" style="margin-top:auto; gap:8px;">
                ${action('Project Details', 'project', p.id, 'secondary')}
                ${p.earlyAccess && !isPrem ? `
                  <button class="secondary" style="flex:1; border-color:#d49f3d; color:#855c0a;" data-action="prompt-early-access" data-id="${p.id}">
                    🔒 Priority (Opens in 36h)
                  </button>
                ` : `
                  <button class="primary" style="flex:1;" data-action="request-Buy" data-id="${p.id}">Buy Credits</button>
                `}
              </div>
            </div>
          </article>`).join('')}
      </div>`;
}

function renderPortfolio() {
  const list = store.data.projects.filter(p => store.balance(actor, p.id) > 0);
  const total = list.reduce((s, p) => s + store.balance(actor, p.id), 0);
  const reserved = list.reduce((s, p) => s + store.reserved(actor, p.id), 0);
  const retired = store.data.retirements.filter(r => r.accountId === actor).reduce((s, r) => s + r.units, 0);

  return heading('SME CARBON WALLET', 'My Holdings & Balances.', 'Sell, transfer or retire your verified fractional credits with full audit trails.')
    + stats([
      ['Total Held', qty(total) + ' tCO₂e', 'Owned carbon inventory'],
      ['Available to Trade', qty(total - reserved) + ' tCO₂e', 'Unreserved balance'],
      ['Reserved in Orders', qty(reserved) + ' tCO₂e', 'Active sell/transfer/retire'],
      ['Permanently Retired', qty(retired) + ' tCO₂e', 'Offset against footprint']
    ])
    + (list.length ? table(
      ['Carbon Project', 'Held / Available', 'Reserved', 'Market Value (Est.)', 'Actions'],
      list.map(p => `
        <tr>
          <td>
            <strong>${E(p.name)}</strong>
            <small>${E(p.registry)} · ${E(p.location)}</small>
          </td>
          <td><strong>${qty(store.balance(actor, p.id))} t</strong> / ${qty(store.available(actor, p.id))} t</td>
          <td>${qty(store.reserved(actor, p.id))} t</td>
          <td>${money(Math.round(p.price * store.balance(actor, p.id) / 10))}</td>
          <td>
            <div class="row-actions">
              ${action('Sell', 'request-Sell', p.id)}
              ${action('Transfer', 'request-Transfer', p.id)}
              ${action('Retire', 'request-Retire', p.id, 'primary')}
            </div>
          </td>
        </tr>`)
    ) : empty('No carbon holdings yet', 'Explore the Marketplace to purchase your first fractional credits.'))
    + `<div class="bottom-note">
        <strong>Selling Fee Note:</strong>
        <p>When you sell carbon credits, Canopy deducts a 1.5% platform transaction fee from the seller's proceeds, matching the buy fee structure.</p>
      </div>`;
}

// Portfolio Analytics (Premium Feature)
function renderAnalytics() {
  const acc = company(actor);
  const isPrem = acc.plan === 'Premium';
  const totalUnits = Object.values(store.data.balances[actor] || {}).reduce((s, u) => s + u, 0) / 10;
  const retiredUnits = store.data.retirements.filter(r => r.accountId === actor).reduce((s, r) => s + r.units, 0) / 10;
  const totalImpact = totalUnits + retiredUnits;

  // Equivalencies (standard EPA / GHG conversion factors)
  const treesPlanted = Math.round(totalImpact * 16.5);
  const carKmOffset = Math.round(totalImpact * 2480);
  const cleanMWh = (totalImpact * 1.2).toFixed(1);

  if (!isPrem) {
    return heading('PREMIUM ANALYTICS', 'Detailed Portfolio Analytics.', 'Real-time asset valuation, GHG equivalencies, and BCX market intelligence.')
      + `<div class="pricing-card featured" style="margin:24px 0; text-align:center; padding:40px;">
          <span class="pricing-badge">PREMIUM EXCLUSIVE</span>
          <h2>Unlock Detailed Portfolio Analytics</h2>
          <p style="max-width:550px; margin:12px auto 24px; color:var(--muted); font-size:15px;">
            Gain deep visibility into your SME's carbon balance sheet, supply chain readiness score, offset equivalency metrics, and historical price benchmarking.
          </p>
          <div class="price">RM150 <small>/ month</small></div>
          <button class="primary" data-action="upgrade-premium" style="font-size:15px; padding:12px 28px;">Subscribe to Premium (RM150/mo)</button>
        </div>`
      + `<div class="analytics-grid" style="opacity:0.4; pointer-events:none; filter:blur(1px);">
          <div class="analytics-card"><div class="icon-head">🌲</div><strong>${treesPlanted} Seedlings</strong><span>Tree seedlings grown for 10 years</span></div>
          <div class="analytics-card"><div class="icon-head">🚗</div><strong>${carKmOffset.toLocaleString()} km</strong><span>Passenger vehicle emissions offset</span></div>
          <div class="analytics-card"><div class="icon-head">⚡</div><strong>${cleanMWh} MWh</strong><span>Equivalent renewable electricity</span></div>
        </div>`;
  }

  return heading('PORTFOLIO INTELLIGENCE', 'Detailed Portfolio Analytics.', 'Live carbon asset valuation, GHG equivalencies, and Malaysian market benchmarks.')
    + stats([
      ['Net Decarbonisation Impact', totalImpact.toFixed(1) + ' tCO₂e', 'Held + Retired credits'],
      ['Portfolio Cost Basis', money(totalUnits * 5200), 'Weighted average cost'],
      ['Current Market Value', money(totalUnits * 5800), '+11.5% Unrealized valuation'],
      ['Supply Chain ESG Score', retiredUnits > 0 ? 'Tier 1' : 'Tier 2', 'NSRF / BNM JC3 Aligned']
    ])
    + `<div class="analytics-grid">
        <div class="analytics-card">
          <div class="icon-head">🌲</div>
          <strong>${treesPlanted} Seedlings</strong>
          <span>Tree seedlings grown for 10 years</span>
          <div class="sub-metric"><span>Avoided deforestation</span><strong>Verra VCS</strong></div>
        </div>
        <div class="analytics-card">
          <div class="icon-head">🚗</div>
          <strong>${carKmOffset.toLocaleString()} km</strong>
          <span>Passenger vehicle emissions offset</span>
          <div class="sub-metric"><span>Road transport equivalent</span><strong>Scope 1 &amp; 3</strong></div>
        </div>
        <div class="analytics-card">
          <div class="icon-head">⚡</div>
          <strong>${cleanMWh} MWh</strong>
          <span>Equivalent clean energy displacement</span>
          <div class="sub-metric"><span>Grid emission factor</span><strong>0.75 kg/kWh</strong></div>
        </div>
      </div>

      <div class="panel" style="margin-top:20px;">
        <h3>Malaysian Voluntary Carbon Market (BCX) Benchmark</h3>
        <p class="fine-print">Tracking spot clearing rates against the upcoming National Carbon Market Policy (NCMP) 2026 guidelines.</p>
        <dl class="detail-grid">
          <div><dt>Average Nature-Based Credit (BCX)</dt><dd>RM65.00 / tCO₂e (+8.3% YoY)</dd></div>
          <div><dt>Average Tech/Methane Avoidance (BCX)</dt><dd>RM36.00 / tCO₂e (+5.1% YoY)</dd></div>
          <div><dt>Projected Carbon Tax Threshold</dt><dd>RM35 - RM50 / tCO₂e (Domestic target)</dd></div>
          <div><dt>SME Supply Chain Advantage</dt><dd>First-access quota reserved</dd></div>
        </dl>
      </div>`;
}

// SME Requests
function renderRequests() {
  const list = store.data.requests.filter(r => r.accountId === actor);
  return heading('TRANSACTION PIPELINE', 'My Requests.', 'Track status of purchase, sale, transfer and retirement requests through admin verification.')
    + requestTable(list, false);
}

// SME History & Ledger
function renderHistory() {
  const list = store.data.ledger.filter(t => t.accountId === actor);
  return heading('SETTLED MOVEMENTS', 'Transaction History.', 'Verified credit inflows, outflows, and platform transaction fee receipts.', action('Download CSV', 'export-history'))
    + ledgerTable(list);
}

// SME Certificates
function renderCertificates() {
  const list = store.data.retirements.filter(r => r.accountId === actor);
  return heading('EVIDENCE & AUDIT TRAIL', 'Retirement Certificates.', 'Verifiable carbon retirement records for corporate sustainability reporting.')
    + (list.length ? table(
      ['Certificate ID', 'Project', 'Retired Volume', 'Settlement Date', 'Actions'],
      list.map(r => `
        <tr>
          <td><strong>${E(r.id)}</strong><small>${E(r.reference)}</small></td>
          <td>${E(project(r.projectId).name)}</td>
          <td><strong>${qty(r.units)} tCO₂e</strong></td>
          <td>${date(r.date)}</td>
          <td>${action('View & Download Certificate', 'certificate', r.id, 'primary')}</td>
        </tr>`)
    ) : empty('No retirement certificates yet', 'Retire credits from your holdings to generate permanent certificates.'));
}

// Carbon & ESG Reports (RM100 Idea)
function renderEsgReports() {
  const acc = company(actor);
  const reports = store.data.esgReports.filter(r => r.accountId === actor);

  return heading('CORPORATE SUSTAINABILITY DISCLOSURE', 'Carbon & ESG Reports.', 'Generate official audit packs aligned with Bursa Malaysia NSRF & Bank Negara Malaysia JC3 guidelines.')
    + `<div class="pricing-grid">
        <!-- Basic Free Report -->
        <div class="pricing-card">
          <h3>Basic Sustainability Snapshot</h3>
          <p style="color:var(--muted); font-size:13.5px;">Standard 1-page overview of your current carbon holdings and completed retirements.</p>
          <div class="price">Free <small>/ instant</small></div>
          <ul class="feature-list">
            <li><span class="check-icon">✓</span> Total carbon credits held &amp; retired</li>
            <li><span class="check-icon">✓</span> Basic project listing breakdown</li>
            <li><span class="cross-icon">✕</span> No official auditor hash or serial stamp</li>
            <li><span class="cross-icon">✕</span> No Scope 1/2/3 supply-chain attestation</li>
          </ul>
          <button class="secondary" data-action="generate-report" data-tier="Basic Snapshot (Free)">Generate Free Snapshot</button>
        </div>

        <!-- Comprehensive RM100 Report -->
        <div class="pricing-card featured">
          <span class="pricing-badge">POPULAR FOR AUDITS</span>
          <h3>Carbon &amp; ESG Compliance Report</h3>
          <p style="color:var(--muted); font-size:13.5px;">Comprehensive audit package formatted for MNC supply chain questionnaires (EcoVadis, Sedex, Bursa).</p>
          <div class="price">RM100 <small>/ per report</small></div>
          <ul class="feature-list">
            <li><span class="check-icon">✓</span> <strong>Verified Scope 1 &amp; Scope 2 Offsets</strong></li>
            <li><span class="check-icon">✓</span> <strong>Verra VCS &amp; BCX Registry Serial Numbers</strong></li>
            <li><span class="check-icon">✓</span> <strong>Anti-Double Counting Statutory Attestation</strong></li>
            <li><span class="check-icon">✓</span> Official QR Code verification seal &amp; hash</li>
            <li><span class="check-icon">✓</span> Project-level environmental &amp; community impact metrics</li>
          </ul>
          <button class="primary" data-action="generate-report" data-tier="Comprehensive Audit (RM100)">Purchase &amp; Generate (RM100)</button>
        </div>
      </div>

      <div class="section-top" style="margin-top:36px;">
        <h2>Generated Reports <span class="count">${reports.length}</span></h2>
      </div>`
    + (reports.length ? table(
      ['Report ID / Reference', 'Report Tier', 'Period', 'Generated Date', 'Fee', 'Actions'],
      reports.map(r => `
        <tr>
          <td><strong>${E(r.id)}</strong><small>${E(r.reference)}</small></td>
          <td>${E(r.tier)}</td>
          <td>${E(r.period)}</td>
          <td>${date(r.generatedAt)}</td>
          <td>${r.cost > 0 ? money(r.cost) : 'Free'}</td>
          <td>${action('View & Print Report', 'view-esg-report', r.id, 'primary')}</td>
        </tr>`)
    ) : empty('No reports generated yet', 'Select a report tier above to generate your corporate ESG disclosure.'));
}

// Premium Subscription Plan Page (RM150/mo Idea)
function renderPremium() {
  const acc = company(actor);
  const isPrem = acc.plan === 'Premium';

  return heading('MEMBERSHIP TIERS', 'Canopy Premium.', 'Accelerate your SME decarbonisation with early project access, portfolio analytics, and advisory perks.')
    + stats([
      ['Current Tier', isPrem ? '⭐ Premium Plan' : 'Free Plan', isPrem ? 'Subscribed' : 'Standard Tier'],
      ['Monthly Fee', isPrem ? 'RM150 / month' : 'RM0 / month', isPrem ? 'Auto-renews monthly' : 'Upgrade anytime'],
      ['Early Access', isPrem ? 'Active (48h head start)' : 'Standard Access', isPrem ? 'First to buy new drops' : 'Subject to availability'],
      ['Next Billing Date', isPrem ? acc.planRenewsAt || '2026-11-01' : '—', isPrem ? 'Direct bank/card debit' : 'None']
    ])
    + `<div class="pricing-grid">
        <div class="pricing-card ${!isPrem ? 'featured' : ''}">
          <h3>Free Plan</h3>
          <p style="color:var(--muted); font-size:13.5px;">Essential tools for SMEs starting their carbon journey.</p>
          <div class="price">RM0 <small>/ month</small></div>
          <ul class="feature-list">
            <li><span class="check-icon">✓</span> Browse public carbon projects</li>
            <li><span class="check-icon">✓</span> Fractional trading (0.1 tCO₂e minimum)</li>
            <li><span class="check-icon">✓</span> Basic portfolio tracking &amp; balance</li>
            <li><span class="check-icon">✓</span> Basic transaction history</li>
            <li><span class="cross-icon">✕</span> Standard project access (48h public delay)</li>
            <li><span class="cross-icon">✕</span> No advanced market benchmarks</li>
          </ul>
          ${!isPrem ? `<span class="status good" style="text-align:center; padding:10px;">Your Current Plan</span>` : `<button class="secondary" disabled>Active</button>`}
        </div>

        <div class="pricing-card ${isPrem ? 'featured' : ''}">
          <span class="pricing-badge">RECOMMENDED FOR SMES</span>
          <h3>Canopy Premium</h3>
          <p style="color:var(--muted); font-size:13.5px;">For proactive SMEs seeking competitive ESG standing and project access.</p>
          <div class="price">RM150 <small>/ month</small></div>
          <ul class="feature-list">
            <li><span class="check-icon">✓</span> <strong>First to know &amp; buy published carbon projects (48h early access)</strong></li>
            <li><span class="check-icon">✓</span> <strong>Detailed portfolio analytics &amp; tree/EV GHG equivalencies</strong></li>
            <li><span class="check-icon">✓</span> <strong>Advanced market information &amp; BCX price trend forecasts</strong></li>
            <li><span class="check-icon">✓</span> Priority request queue processing</li>
            <li><span class="check-icon">✓</span> Dedicated sustainability onboarding specialist</li>
          </ul>
          ${isPrem ? `
            <div style="background:#eaf4ec; padding:12px; border-radius:6px; text-align:center; color:#1f5e34; font-weight:600;">
              ✓ You are subscribed to Premium
            </div>
          ` : `
            <button class="primary" data-action="upgrade-premium">Subscribe to Premium — RM150/month</button>
          `}
        </div>
      </div>`;
}

// SME Account
function renderAccount() {
  const a = company(actor);
  return heading('SME CREDENTIALS', 'Company Profile & KYB.', 'Official business registration and verification records.')
    + `<div class="panel">
        <div class="section-top">
          <h2>${E(a.name)}</h2>
          ${badge(a.status)}
        </div>
        <dl class="detail-grid">
          <div><dt>Registration (SSM)</dt><dd>${E(a.registration)}</dd></div>
          <div><dt>Industry Sector</dt><dd>${E(a.sector)}</dd></div>
          <div><dt>Contact Person</dt><dd>${E(a.contact)}</dd></div>
          <div><dt>Work Email</dt><dd>${E(a.email)}</dd></div>
          <div><dt>Location</dt><dd>${E(a.location || 'Malaysia')}</dd></div>
          <div><dt>Current Plan</dt><dd>${E(a.plan)} ${a.plan === 'Premium' ? '⭐ (RM150/mo)' : ''}</dd></div>
        </dl>
        <p class="review-note"><strong>Admin KYB Review:</strong> ${E(a.note)}</p>
        <h3>Verification Documents</h3>
        ${documents('account', a.id)}
        ${action('Upload Document', 'upload', 'account|' + a.id)}
      </div>`;
}

/* ==========================================================================
   ADMIN VIEWS
   ========================================================================== */
function renderDashboard() {
  const d = store.data;
  const open = d.requests.filter(CanopyModel.active);
  const totalRev = d.platformRevenue.reduce((s, r) => s + r.amount, 0);

  return heading('CANOPY OPERATIONS', 'Operations & Revenue Overview.', 'Platform management, transaction approvals, and 5-stream revenue tracking.')
    + stats([
      ['Total Gross Revenue', money(totalRev), 'Across all 5 streams'],
      ['Open Requests', open.length, 'Submitted or approved'],
      ['SMEs Awaiting KYB', d.accounts.filter(a => a.status === 'Pending').length, 'Verification queue'],
      ['Active Partners', d.partners.length, 'RM500/mo subscribers']
    ])
    + `<div class="panel" style="margin-bottom:28px;">
        <div class="section-top">
          <h2>Platform Revenue Breakdown (5 Streams)</h2>
          ${action('View full revenue ledger', 'nav-revenue', '', 'secondary')}
        </div>
        <div class="overview cols-5" style="border:0; padding:0; margin:0; box-shadow:none;">
          <div>
            <span>1. SME Fees (1.5%)</span>
            <strong>${money(d.platformRevenue.filter(r => r.category === 'transaction_fee').reduce((s, r) => s + r.amount, 0))}</strong>
            <p>1.5% on Buy &amp; Sell</p>
          </div>
          <div>
            <span>2. Developer Com. (1%)</span>
            <strong>${money(d.platformRevenue.filter(r => r.category === 'developer_commission').reduce((s, r) => s + r.amount, 0))}</strong>
            <p>1% on project sales</p>
          </div>
          <div>
            <span>3. SME Premium</span>
            <strong>${money(d.platformRevenue.filter(r => r.category === 'sme_subscription').reduce((s, r) => s + r.amount, 0))}</strong>
            <p>RM150/mo subscriptions</p>
          </div>
          <div>
            <span>4. Partner Portal</span>
            <strong>${money(d.platformRevenue.filter(r => r.category === 'partner_subscription').reduce((s, r) => s + r.amount, 0))}</strong>
            <p>RM500/mo portals</p>
          </div>
          <div>
            <span>5. ESG Reports</span>
            <strong>${money(d.platformRevenue.filter(r => r.category === 'esg_report').reduce((s, r) => s + r.amount, 0))}</strong>
            <p>RM100 audit packs</p>
          </div>
        </div>
      </div>

      <div class="section-top">
        <h2>Requests Needing Attention <span class="count">${open.length}</span></h2>
        ${action('Open Full Queue', 'nav-queue')}
      </div>`
    + requestTable(open.slice(0, 6), true);
}

function renderQueue() {
  const list = store.data.requests.filter(r => requestFilter === 'All' || r.status === requestFilter || r.type === requestFilter);
  return heading('TRANSACTION CLEARING', 'Request Queue.', 'Review, approve, and execute carbon credit movements with BCX references.')
    + `<div class="section-top">
        <h2>${list.length} Requests</h2>
        <label class="filter">Status / Type
          <select id="requestFilter">
            ${['All', 'Submitted', 'Approved', 'Completed', 'Rejected', 'Cancelled', 'Buy', 'Sell', 'Transfer', 'Retire'].map(s => `<option ${s === requestFilter ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>`
    + requestTable(list, true);
}

function renderProjects() {
  return heading('MARKETPLACE CURATION', 'Project Listings.', 'Manage carbon projects, developer assignments, sample pricing, and early access status.', action('Add Project', 'edit-project', '', 'primary'))
    + table(
      ['Project / Developer', 'Price / Vintage', 'Inventory (tCO₂e)', 'Access Tier', 'Status', 'Actions'],
      store.data.projects.map(p => `
        <tr>
          <td>
            <strong>${E(p.name)}</strong>
            <small>🏢 Developer: ${E(p.developer)} · ${E(p.registry)}</small>
          </td>
          <td>${money(p.price)} / t<small>Vintage ${E(p.vintage)}</small></td>
          <td>${qty(p.inventory)} / ${qty(store.inventory(p.id))} avail</td>
          <td>${p.earlyAccess ? `<span class="early-access-ribbon" style="position:static; display:inline-block;">⭐ Premium 48h</span>` : `<span class="tag">Public</span>`}</td>
          <td>${badge(p.status)}</td>
          <td>
            <div class="row-actions">
              ${action('Edit', 'edit-project', p.id)}
              ${action('Docs', 'upload', 'project|' + p.id)}
            </div>
          </td>
        </tr>`)
    );
}

function renderCompanies() {
  return heading('KYB ONBOARDING', 'SME Verification.', 'Perform business due diligence, anti-money laundering (AML) checks, and set eligibility.', action('Add SME', 'new-account'))
    + table(
      ['Company', 'SSM / Sector', 'Plan', 'KYB Status', 'Documents', 'Actions'],
      store.data.accounts.map(a => `
        <tr>
          <td><strong>${E(a.name)}</strong><small>${E(a.contact)} · ${E(a.email)}</small></td>
          <td>${E(a.registration)}<small>${E(a.sector)}</small></td>
          <td>${a.plan === 'Premium' ? badge('Premium') : '<span class="tag">Free</span>'}</td>
          <td>${badge(a.status)}</td>
          <td>${a.documents.length} docs</td>
          <td>${action('Review KYB', 'verify', a.id, 'primary')}</td>
        </tr>`)
    );
}

// Idea 4: Project Developer Commission & Partner Billing View
function renderDeveloperBilling() {
  const list = store.data.developerBilling;
  const totalEarned = list.reduce((s, b) => s + b.commissionEarned, 0);

  return heading('DEVELOPER COMMISSION MANAGEMENT', 'Partner & Developer Billing.', 'Track 1% commissions owed by carbon project developers on credits sold through Canopy.', action('Export Billing CSV', 'export-dev-billing'))
    + stats([
      ['Total Commissions Earned', money(totalEarned), '1.0% on gross credits sold'],
      ['Pending Settlement', money(list.filter(b => b.status === 'Pending Settlement').reduce((s, b) => s + b.commissionEarned, 0)), 'Awaiting developer invoice'],
      ['Settled to Canopy', money(list.filter(b => b.status === 'Settled').reduce((s, b) => s + b.commissionEarned, 0)), 'Received platform revenue'],
      ['Active Developers', new Set(list.map(b => b.developer)).size, 'Project originators']
    ])
    + `<div class="bottom-note">
        <strong>Revenue Mechanism:</strong>
        <p>Project Developers list credits on Canopy. When an SME purchases credits, Canopy earns a 1.00% developer commission from the seller, in addition to the 1.50% SME platform transaction fee.</p>
      </div>`
    + (list.length ? table(
      ['Developer', 'Project / Ref', 'Credits Sold', 'Gross Value', 'Commission (1%)', 'Status', 'Actions'],
      list.map(b => `
        <tr>
          <td><strong>${E(b.developer)}</strong></td>
          <td>${E(b.projectName)}<small>${E(b.reference)} · ${date(b.date)}</small></td>
          <td>${qty(b.creditsSold)} tCO₂e</td>
          <td>${money(b.transactionValue)}</td>
          <td><strong>${money(b.commissionEarned)}</strong></td>
          <td>${badge(b.status)}</td>
          <td>
            <div class="row-actions">
              ${b.status !== 'Settled' ? action('Mark Settled', 'settle-dev-bill', b.id, 'primary') : '<span class="status good">Settled ✓</span>'}
            </div>
          </td>
        </tr>`)
    ) : empty('No billing records', 'Commissions generate automatically as SME purchase orders settle.'));
}

// Admin: Platform Revenue (5 Streams)
function renderPlatformRevenue() {
  const d = store.data;
  const rev = d.platformRevenue;
  const totalRev = rev.reduce((s, r) => s + r.amount, 0);

  return heading('FINANCIAL OVERVIEW', 'Platform Revenue (5 Streams).', 'Complete revenue ledger reflecting Canopy business model economics.', action('Download Revenue CSV', 'export-revenue'))
    + stats([
      ['Total Revenue', money(totalRev), 'All sources combined'],
      ['1.5% SME Fees', money(rev.filter(r => r.category === 'transaction_fee').reduce((s, r) => s + r.amount, 0)), 'Trading fee'],
      ['1% Developer Com.', money(rev.filter(r => r.category === 'developer_commission').reduce((s, r) => s + r.amount, 0)), 'Originator fee'],
      ['SaaS Subscriptions', money(rev.filter(r => ['sme_subscription', 'partner_subscription'].includes(r.category)).reduce((s, r) => s + r.amount, 0)), 'SME RM150 + Partner RM500']
    ])
    + table(
      ['Reference / Date', 'Revenue Stream', 'Payer / Entity', 'Amount', 'Status'],
      rev.map(r => `
        <tr>
          <td><strong>${E(r.reference)}</strong><small>${date(r.date)}</small></td>
          <td>${E(r.source)}</td>
          <td><strong>${E(r.payer)}</strong></td>
          <td><strong>+${money(r.amount)}</strong></td>
          <td><span class="status good">Collected</span></td>
        </tr>`)
    );
}

function renderReports() {
  return heading('TRACEABLE AUDIT', 'Audit Log & Reports.', 'Complete chronological activity log of all platform trades, reviews, and decisions.', action('Export Audit Log', 'export-audit'))
    + table(
      ['Timestamp', 'Actor', 'Action', 'Details'],
      store.data.audit.map(a => `
        <tr>
          <td>${date(a.date)}</td>
          <td><strong>${E(a.actor === 'admin' ? 'Canopy Admin' : a.actor === 'partner1' || a.actor === 'partner2' ? partner(a.actor).name : company(a.actor)?.name || a.actor)}</strong></td>
          <td>${E(a.action)}</td>
          <td>${E(a.detail)}</td>
        </tr>`)
    );
}

/* ==========================================================================
   PARTNER VIEWS (RM500/month Portal)
   ========================================================================== */
function renderPartnerDashboard() {
  const pt = partner(actor);
  const myRefs = store.data.referrals.filter(r => r.partnerId === actor);
  const activeCount = myRefs.filter(r => r.status === 'Onboarded & Trading').length;

  return heading('PARTNER ADVISORY DESK', 'Partner Portal Dashboard.', 'Manage referred Malaysian SMEs, monitor portfolio carbon activity, and access advisory reporting tools.')
    + `<div class="partner-banner">
        <div>
          <h2>Welcome, ${E(pt.name)}</h2>
          <p>Your firm is an active Canopy Certified Carbon Advisory Partner (Subscription: RM500/month).</p>
        </div>
        <div class="ref-code-box">
          <div>
            <span>Your SME Referral Code</span>
            <strong>${E(pt.referralCode)}</strong>
          </div>
          <button class="secondary" data-action="copy-ref-code" data-code="${E(pt.referralCode)}" style="background:#fff; color:#184e3a;">Copy Code</button>
        </div>
      </div>`
    + stats([
      ['Referred SMEs', pt.referredCount || myRefs.length, 'In onboarding pipeline'],
      ['Active Trading Clients', activeCount, 'Generating carbon volume'],
      ['Client Volume Traded', qty(pt.totalClientVolume || 420) + ' tCO₂e', 'Portfolio carbon units'],
      ['Referral Share Earned', money(pt.commissionEarned || 24500), 'Shared transaction rewards']
    ])
    + `<div class="section-top">
        <h2>Referred SME Pipeline</h2>
        ${action('+ Refer Malaysian SME', 'refer-sme', '', 'primary')}
      </div>`
    + table(
      ['SME Company', 'Sector / Contact', 'Referral Date', 'Pipeline Status', 'Completed Trades', 'Reward Share'],
      myRefs.map(r => `
        <tr>
          <td><strong>${E(r.smeName)}</strong><small>${E(r.email)}</small></td>
          <td>${E(r.sector)}<small>${E(r.contact)}</small></td>
          <td>${date(r.date)}</td>
          <td>${badge(r.status)}</td>
          <td>${r.completedTrades || 0} trades</td>
          <td><strong>${money(r.reward || 0)}</strong></td>
        </tr>`)
    );
}

function renderPartnerReferrals() {
  const pt = partner(actor);
  const myRefs = store.data.referrals.filter(r => r.partnerId === actor);

  return heading('SME ACQUISITION', 'SME Referral Management.', 'Refer Malaysian businesses to Canopy and earn 20% platform fee sharing on client trades.', action('+ Refer New SME', 'refer-sme', '', 'primary'))
    + `<div class="panel" style="margin-bottom:24px;">
        <div class="title-row">
          <div>
            <div class="eyebrow">PARTNER INCENTIVE PROGRAM</div>
            <h3>How Referral Rewards Work</h3>
            <p class="dialog-description">Partners receive 20% of the platform transaction fee for all completed carbon purchases made by their referred clients, credited directly to your advisory balance.</p>
          </div>
          <div class="ref-code-box" style="background:#f1f6f2; border-color:#bcd0c0;">
            <div style="color:#1d3d29;">
              <span style="color:#577460;">Referral Code</span>
              <strong style="color:#1e5e34;">${E(pt.referralCode)}</strong>
            </div>
          </div>
        </div>
      </div>`
    + table(
      ['SME Name', 'Contact & Email', 'Industry Sector', 'Referred On', 'Status', 'Reward Accrued'],
      myRefs.map(r => `
        <tr>
          <td><strong>${E(r.smeName)}</strong></td>
          <td>${E(r.contact)}<small>${E(r.email)}</small></td>
          <td>${E(r.sector)}</td>
          <td>${date(r.date)}</td>
          <td>${badge(r.status)}</td>
          <td><strong>${money(r.reward || 0)}</strong></td>
        </tr>`)
    );
}

function renderPartnerClients() {
  const matchedAccounts = store.data.accounts.filter(a => a.partnerId === actor);

  return heading('CLIENT SUSTAINABILITY MONITOR', 'Carbon & ESG Data Dashboard.', 'Real-time overview of carbon-credit holdings, retirements, and decarbonisation progress across your SME clients.')
    + stats([
      ['Authorised Clients', matchedAccounts.length, 'Under advisory mandate'],
      ['Total Active Holdings', qty(matchedAccounts.reduce((s, a) => s + Object.values(store.data.balances[a.id] || {}).reduce((x, y) => x + y, 0), 0)) + ' t', 'Carbon asset inventory'],
      ['Client Retirements', qty(store.data.retirements.filter(r => matchedAccounts.some(a => a.id === r.accountId)).reduce((s, r) => s + r.units, 0)) + ' t', 'Offset against emissions'],
      ['ESG Compliance Readiness', '86%', 'Average client audit readiness']
    ])
    + table(
      ['Client SME', 'Industry Sector', 'Carbon Held (tCO₂e)', 'Carbon Retired', 'Plan Tier', 'Actions'],
      matchedAccounts.map(a => {
        const held = Object.values(store.data.balances[a.id] || {}).reduce((x, y) => x + y, 0);
        const ret = store.data.retirements.filter(r => r.accountId === a.id).reduce((s, r) => s + r.units, 0);
        return `
          <tr>
            <td><strong>${E(a.name)}</strong><small>${E(a.registration)}</small></td>
            <td>${E(a.sector)}</td>
            <td><strong>${qty(held)} t</strong></td>
            <td>${qty(ret)} t</td>
            <td>${a.plan === 'Premium' ? badge('Premium') : '<span class="tag">Free</span>'}</td>
            <td>${action('View Advisory Pack', 'client-esg-pack', a.id, 'primary')}</td>
          </tr>`;
      })
    );
}

function renderPartnerReports() {
  return heading('ADVISORY TOOLKIT', 'Partner Reporting Tools.', 'Generate consolidated portfolio summaries, client carbon transaction statements, and batch ESG reports.')
    + `<div class="pricing-grid">
        <div class="pricing-card">
          <h3>Consolidated Client Statement</h3>
          <p style="color:var(--muted); font-size:13.5px;">Download a complete ledger of all carbon trades, prices, and registry IDs executed by your referred SMEs.</p>
          <button class="primary" data-action="export-partner-clients" style="margin-top:auto;">Download Client Ledger CSV</button>
        </div>
        <div class="pricing-card">
          <h3>Batch ESG Advisory Pack</h3>
          <p style="color:var(--muted); font-size:13.5px;">Generate multi-client carbon audit certificates for institutional ESG presentations and supply chain reporting.</p>
          <button class="secondary" data-action="batch-esg-preview" style="margin-top:auto;">Preview Batch ESG Pack</button>
        </div>
      </div>`;
}

function renderPartnerProjects() {
  return heading('TECHNICAL SPECIFICATIONS', 'Carbon Project Information.', 'Detailed project descriptions, methodologies, registry documentation, and wholesale pricing to assist SME clients.')
    + table(
      ['Project Name', 'Type / Method', 'Registry & Standard', 'Developer', 'Sample Price', 'Available tCO₂e'],
      store.data.projects.map(p => `
        <tr>
          <td><strong>${E(p.name)}</strong><small>${E(p.location)}</small></td>
          <td>${E(p.type)}<small>${E(p.method)}</small></td>
          <td><strong>${E(p.registry)}</strong></td>
          <td>${E(p.developer)}</td>
          <td>${money(p.price)} / t</td>
          <td><strong>${qty(store.inventory(p.id))} t</strong></td>
        </tr>`)
    );
}

function renderPartnerAnalytics() {
  return heading('PORTFOLIO PERFORMANCE', 'Partner Analytics.', 'Track client onboarding velocity, carbon transaction volume, and sector breakdown.')
    + stats([
      ['SME Conversion Rate', '62.5%', 'Referrals to active trading'],
      ['Avg. Trade Size', '12.4 tCO₂e', 'Per transaction'],
      ['Top Project Preference', 'Forest Conservation (Kuamut)', '48% of total volume'],
      ['Projected Annual Fees', money(145000), 'Estimated 12-month client volume']
    ])
    + `<div class="panel">
        <h3>Sector Participation Breakdown</h3>
        <dl class="detail-grid">
          <div><dt>Precision Manufacturing</dt><dd>45% (High Scope 2 offset demand)</dd></div>
          <div><dt>Food &amp; Beverage</dt><dd>25% (Scope 3 packaging offsets)</dd></div>
          <div><dt>Logistics &amp; Transport</dt><dd>20% (Fleet diesel emissions)</dd></div>
          <div><dt>Packaging &amp; Plastics</dt><dd>10% (Industrial export compliance)</dd></div>
        </dl>
      </div>`;
}

/* ==========================================================================
   TABLE & MODAL UTILITIES
   ========================================================================== */
function requestTable(list, isAdm) {
  return list.length ? table(
    ['Request / Date', 'Company / Project', 'Type / Quantity', 'Fees & Proceeds', 'Status', 'Actions'],
    list.map(r => `
      <tr>
        <td><strong>${E(r.id)}</strong><small>${date(r.date)}</small></td>
        <td>${E(company(r.accountId).name)}<small>${E(project(r.projectId).name)}</small></td>
        <td><strong>${r.type}</strong><small>${qty(r.units)} tCO₂e</small></td>
        <td>
          ${['Buy', 'Sell'].includes(r.type) ? `
            <strong>${money(r.type === 'Buy' ? r.quote.total : r.quote.net)}</strong>
            <small>Fee (1.5%): ${money(r.quote.fee)}</small>
          ` : '—'}
        </td>
        <td>${badge(r.status)}</td>
        <td>${action(isAdm ? 'Review' : 'View Details', 'review', r.id, isAdm ? 'primary' : 'secondary')}</td>
      </tr>`)
  ) : empty('No requests found', 'Transactions appear here as companies submit orders.');
}

function ledgerTable(list) {
  return list.length ? table(
    ['Date / Reference', 'Project', 'Activity', 'Quantity', 'Amount (MYR)'],
    list.map(t => `
      <tr>
        <td>${date(t.date)}<small>${E(t.requestId || t.id)} · ${E(t.reference)}</small></td>
        <td>${E(project(t.projectId)?.name || 'Platform')}</td>
        <td>${E(t.type)}</td>
        <td>${t.units > 0 ? '+' : ''}${qty(t.units)} t</td>
        <td><strong>${t.amount ? money(t.amount) : '—'}</strong></td>
      </tr>`)
  ) : empty('No settled transactions yet', 'Completed transactions appear here.');
}

function documents(kind, id) {
  const item = kind === 'project' ? project(id) : company(id);
  return item.documents.length ? `
    <div class="document-list">
      ${item.documents.map(d => `
        <div>
          <span>▧ ${E(d.name)}<small>${Math.ceil(d.size / 1024)} KB · Demo upload</small></span>
          ${action('Download', 'document', kind + '|' + id + '|' + d.id)}
        </div>`).join('')}
    </div>` : '<p class="fine-print">No supporting documents uploaded.</p>';
}

function showProject(id) {
  const p = project(id);
  modal(E(p.name), `
    <p class="dialog-description">${E(p.description)}</p>
    <dl class="detail-grid">
      <div><dt>Type / Location</dt><dd>${E(p.type)} · ${E(p.location)}</dd></div>
      <div><dt>Vintage / Methodology</dt><dd>${E(p.vintage)} · ${E(p.method)}</dd></div>
      <div><dt>Registry Standard</dt><dd>${E(p.registry)}</dd></div>
      <div><dt>Project Developer</dt><dd>${E(p.developer)}</dd></div>
      <div><dt>Developer Email</dt><dd>${E(p.developerEmail || 'projects@canopy.eco')}</dd></div>
      <div><dt>Sample Price / Available</dt><dd>${money(p.price)} per tCO₂e · ${qty(store.inventory(id))} t</dd></div>
    </dl>
    <h3>Supporting Project Documents</h3>
    ${documents('project', id)}
    <div style="margin-top:20px;">
      ${action('Request to Buy', 'request-Buy', id, 'primary')}
    </div>
  `, 'PROJECT SPECIFICATION');
}

/* ==========================================================================
   MODAL ACTIONS: BUY, SELL, RETIRE, PREMIUM, ESG REPORT
   ========================================================================== */
function requestForm(type, id) {
  const p = project(id);
  if (company(actor).status !== 'Verified') return toast('Your SME must be verified by admin before transacting.');
  const recipients = store.data.accounts.filter(a => a.status === 'Verified' && a.id !== actor);

  modal(type + ' Carbon Credits', `
    <p class="dialog-description">${E(p.name)} · Available: ${qty(type === 'Buy' ? store.inventory(id) : store.available(actor, id))} tCO₂e</p>
    <form id="modalForm" class="purchase-form">
      ${field('Quantity (tCO₂e) — fractional from 0.1t', 'quantity', '25.0', 'number', 'min="0.1" step="0.1" max="100000" required')}
      ${type === 'Sell' ? field('Asking Price per tCO₂e (RM)', 'price', (p.price / 100).toFixed(2), 'number', 'min="0.01" max="1000000" step="0.01" required') : ''}
      ${type === 'Transfer' ? select('Recipient Verified Company', 'recipientId', recipients.map(a => [a.id, a.name]), recipients[0]?.id) : ''}
      ${type === 'Retire' ? area('Retirement Purpose / Reporting Period', 'purpose', 'Scope 2 Greenhouse Gas Decarbonisation for FY2026', 'minlength="5" maxlength="500" required') : ''}
      
      <!-- Breakdown -->
      <div id="quote" class="fee-lines"></div>

      <label class="ack">
        <input type="checkbox" required>
        <span>This is a prototype transaction. Fractional credits are recorded to your wallet upon admin execution.</span>
      </label>
      ${end('Submit ' + type + ' Request')}
  `, 'TRANSACTION CHECKOUT');

  const update = () => {
    const f = $('#modalForm');
    const q = Number(f.elements.quantity.value) * 10;
    const price = type === 'Sell' ? Math.round(Number(f.elements.price.value) * 100) : p.price;
    if (!['Buy', 'Sell'].includes(type)) {
      $('#quote').innerHTML = '<p class="fine-print">No platform fee is charged on transfers or retirement.</p>';
      return;
    }
    const c = store.quote(id, Number.isFinite(q) && q > 0 ? q : 0, Number.isFinite(price) && price > 0 ? price : 0);

    if (type === 'Buy') {
      $('#quote').innerHTML = `
        <div><span>Carbon credit value:</span><strong>${money(c.subtotal)}</strong></div>
        <div><span>Platform transaction fee (1.5%):</span><strong>${money(c.fee)}</strong></div>
        <div class="total"><span>Total payable:</span><span>${money(c.total)}</span></div>
        <div class="highlight-note">💡 The ${money(c.fee)} is Canopy platform revenue supporting the digital registry.</div>`;
    } else {
      $('#quote').innerHTML = `
        <div><span>Gross sale value:</span><strong>${money(c.subtotal)}</strong></div>
        <div><span>Platform transaction fee (1.5% deducted):</span><strong>-${money(c.fee)}</strong></div>
        <div class="total"><span>Net proceeds to seller:</span><span>${money(c.net)}</span></div>
        <div class="highlight-note">💡 The ${money(c.fee)} platform transaction fee is deducted from seller proceeds.</div>`;
    }
  };

  $('#modalForm').addEventListener('input', update);
  update();

  form(d => {
    const u = Number(d.quantity) * 10;
    const r = mutate(() => store.submit(actor, {
      type,
      projectId: id,
      units: Math.round(u),
      price: Math.round(Number(d.price) * 100),
      recipientId: d.recipientId,
      purpose: d.purpose
    }), 'Request submitted.');

    modal('Request Submitted Successfully', `
      <div class="success">
        <span class="check">✓</span>
        <h2>${E(r.id)}</h2>
        <p>${r.type} ${qty(r.units)} tCO₂e · ${E(p.name)}</p>
        <p class="fine-print">An admin will review and record BCX execution. Once completed, your wallet balance will update.</p>
        ${action('View My Requests', 'my-requests', '', 'primary')}
      </div>
    `, 'CONFIRMATION');
  });
}

function showRequest(id) {
  const r = store.request(id);
  if (!isAdmin() && r.accountId !== actor) throw Error('Access denied.');

  let body = `
    <div class="detail-grid">
      <div><dt>Company</dt><dd>${E(company(r.accountId).name)}</dd></div>
      <div><dt>Project</dt><dd>${E(project(r.projectId).name)}</dd></div>
      <div><dt>Action &amp; Quantity</dt><dd>${r.type} · ${qty(r.units)} tCO₂e</dd></div>
      <div><dt>Status</dt><dd>${badge(r.status)}</dd></div>
      ${['Buy', 'Sell'].includes(r.type) ? `
        <div><dt>${r.type === 'Buy' ? 'Total Payable' : 'Net Proceeds'}</dt><dd>${money(r.type === 'Buy' ? r.quote.total : r.quote.net)}</dd></div>
        <div><dt>Platform Fee (1.5%)</dt><dd>${money(r.quote.fee)}</dd></div>
      ` : ''}
      <div><dt>Date Submitted</dt><dd>${date(r.date)}</dd></div>
      <div><dt>Execution Reference</dt><dd>${E(r.reference || 'Pending completion')}</dd></div>
    </div>
    ${r.purpose ? `<p><strong>Purpose:</strong> ${E(r.purpose)}</p>` : ''}
    ${r.reviewNote ? `<p class="review-note"><strong>Admin Review Note:</strong> ${E(r.reviewNote)}</p>` : ''}`;

  if (isAdmin() && CanopyModel.active(r)) {
    body += `
      <form id="modalForm" class="purchase-form">
        ${select('Admin Action', 'decision', r.status === 'Submitted' ? ['Approve', 'Reject'] : ['Complete demo', 'Reject'], '')}
        ${area('Review Note / Audit Trail', 'note', r.reviewNote || 'Approved for BCX execution settlement.', 'maxlength="500" required')}
        <div id="executionFields" ${r.status === 'Approved' ? '' : 'hidden'}>
          ${field('BCX / Registry Execution Reference', 'reference', 'BCX-SETTLE-' + String(Date.now()).slice(-5), 'text', 'required maxlength="100"')}
          ${r.type === 'Sell' ? select('Matched Buying SME Company', 'buyerId', [['', 'Select verified buyer'], ...store.data.accounts.filter(a => a.id !== r.accountId && a.status === 'Verified').map(a => [a.id, a.name])], '') : ''}
          <label class="ack">
            <input type="checkbox" name="confirmCompletion" checked>
            <span>Confirm credit movements and record 1.5% platform fee and 1.0% developer commission to platform revenue.</span>
          </label>
        </div>
        ${end('Save Decision')}
      </form>`;
  } else if (!isAdmin() && r.status === 'Submitted') {
    body += action('Cancel Request', 'cancel', id);
  }

  modal(E(r.id) + ' · ' + r.type, body, 'ORDER DETAILS');

  if ($('#modalForm')) {
    const f = $('#modalForm');
    f.elements.decision.addEventListener('change', () => {
      $('#executionFields').hidden = f.elements.decision.value !== 'Complete demo';
    });
    form(d => {
      if (d.decision === 'Complete demo') {
        mutate(() => store.settle(actor, id, {
          reference: d.reference,
          buyerId: d.buyerId,
          confirmRetirement: true
        }), 'Settlement recorded. Revenue & balances updated.');
      } else {
        mutate(() => store.review(actor, id, d.decision, d.note), 'Review decision saved.');
      }
      showRequest(id);
    });
  }
}

// Upgrade to Premium Modal
function upgradePremiumModal() {
  const acc = company(actor);
  modal('Subscribe to Canopy Premium', `
    <div class="pricing-card featured" style="margin:10px 0;">
      <span class="pricing-badge">PREMIUM TIER</span>
      <h3>Canopy Premium Membership</h3>
      <div class="price">RM150 <small>/ month</small></div>
      <p style="color:var(--muted); font-size:13.5px; margin-bottom:16px;">
        Empowers ${E(acc.name)} with priority carbon project access, deep portfolio analytics, and automated compliance tools.
      </p>
      <ul class="feature-list">
        <li><span class="check-icon">✓</span> <strong>48h Early Access</strong> to newly published carbon projects before public release</li>
        <li><span class="check-icon">✓</span> <strong>Full Portfolio Analytics</strong> with real-time tree &amp; vehicle offset equivalencies</li>
        <li><span class="check-icon">✓</span> <strong>Malaysian Carbon Tax Benchmark</strong> and BCX pricing trends</li>
        <li><span class="check-icon">✓</span> Automated recurring RM150/mo debit (Platform Revenue)</li>
      </ul>
      <form id="modalForm" class="purchase-form">
        <label class="ack">
          <input type="checkbox" required checked>
          <span>Confirm monthly recurring subscription of RM150 to Canopy Carbon Platform.</span>
        </label>
        ${end('Confirm Subscription — RM150 / Month')}
      </form>
    </div>
  `, 'PREMIUM UPGRADE');

  form(() => {
    mutate(() => store.subscribePremium(actor, actor), 'Subscribed to Premium! Features unlocked.');
    closeModal();
    navigate('premium');
  });
}

// Generate Carbon & ESG Report Modal
function generateReportModal(tier) {
  const acc = company(actor);
  const isAdv = tier.includes('RM100');
  const cost = isAdv ? 'RM100.00' : 'Free';

  modal('Generate ' + tier, `
    <p class="dialog-description">Generating formal sustainability disclosure for ${E(acc.name)}.</p>
    <div class="detail-grid">
      <div><dt>Company</dt><dd>${E(acc.name)}</dd></div>
      <div><dt>Reporting Period</dt><dd>FY2026 (YTD)</dd></div>
      <div><dt>Report Tier</dt><dd>${tier}</dd></div>
      <div><dt>Service Fee</dt><dd><strong>${cost}</strong></dd></div>
    </div>
    <form id="modalForm" class="purchase-form">
      ${field('Report Title / Audit Note', 'title', isAdv ? 'Bursa / BNM JC3 Aligned Carbon & ESG Compliance Report' : 'Basic Sustainability Snapshot', 'text', 'required')}
      ${field('Target Reporting Period', 'period', 'FY 2026 (Annual Audit)', 'text', 'required')}
      <p class="fine-print">
        ${isAdv ? 'The RM100 fee is credited to Canopy platform revenue and generates a tamper-evident audit report with registry hashes.' : 'Free snapshot includes basic holding balances without registry attestation.'}
      </p>
      <label class="ack">
        <input type="checkbox" required checked>
        <span>I authorise the generation of this corporate sustainability report.</span>
      </label>
      ${end(isAdv ? 'Pay RM100 & Generate Report' : 'Generate Free Report')}
    </form>
  `, 'ESG REPORT GENERATION');

  form(d => {
    const rpt = mutate(() => store.generateEsgReport(actor, actor, {
      title: d.title,
      period: d.period,
      tier
    }), 'Report generated successfully.');
    closeModal();
    showEsgReport(rpt.id);
  });
}

// High-Fidelity Printable ESG Report Viewer
function showEsgReport(id) {
  const r = store.data.esgReports.find(x => x.id === id);
  if (!r) throw Error('Report not found.');
  const acc = company(r.accountId);

  modal('Carbon &amp; ESG Report: ' + E(r.id), `
    <div class="report-viewer-card" id="printableReport">
      <div class="report-watermark">BURSA / BNM ALIGNED · OFFICIAL RECORD</div>
      <div class="report-header">
        <span class="eyebrow" style="color:#2d6945;">MALAYSIAN NATIONAL SUSTAINABILITY REPORTING FRAMEWORK</span>
        <h2>${E(r.title)}</h2>
        <p>Issued to: <strong>${E(acc.name)}</strong> · Reg: ${E(acc.registration)} · Sector: ${E(acc.sector)}</p>
        <p class="fine-print">Audit Ref: ${E(r.reference)} · Generated: ${date(r.generatedAt)} · Fee: ${r.cost > 0 ? money(r.cost) : 'Free'}</p>
      </div>

      <div class="report-stat-strip">
        <div><span>Total Credits Held</span><strong>${r.totalHeld.toFixed(1)} tCO₂e</strong></div>
        <div><span>Verified Retired</span><strong>${r.retiredUnits.toFixed(1)} tCO₂e</strong></div>
        <div><span>Net Avoidance</span><strong>${r.netEmissionsAvoided.toFixed(1)} tCO₂e</strong></div>
        <div><span>ESG Readiness</span><strong style="color:#216d3a;">${E(r.sustainabilityScore)}</strong></div>
      </div>

      <h4 style="margin:20px 0 10px;">Verified Project Allocations &amp; Registries</h4>
      <table style="margin-bottom:16px;">
        <thead><tr><th>Carbon Project</th><th>Volume (tCO₂e)</th><th>Registry Standard</th></tr></thead>
        <tbody>
          ${(r.holdingsSnapshot || []).map(h => `
            <tr>
              <td><strong>${E(h.project)}</strong></td>
              <td>${h.units.toFixed(1)} t</td>
              <td><span class="tag">${E(h.registry)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>

      <h4 style="margin:20px 0 8px;">Statutory Attestation &amp; Non-Double Counting</h4>
      <p style="font-size:12.5px; line-height:1.6; color:#405748;">
        This audit record certifies that the above carbon credits represent authentic fractional rights under BCX-compliant registry standards. The retirement transactions recorded herein are permanent, irreversible, and protected against double-counting under the Malaysian National Carbon Market Policy 2026.
      </p>

      <div class="report-seal-row">
        <div>
          <strong style="font-size:13px; display:block;">Canopy Carbon Operations &amp; Verification Desk</strong>
          <span style="font-size:11px; color:var(--muted);">Digital Certificate Hash: 8f4e-29a0-bcx9-2026-cyp</span>
        </div>
        <div class="qr-box">
          QR VERIFIED<br>🇲🇾 BCX
        </div>
      </div>
    </div>

    <div class="row-actions" style="margin-top:20px; justify-content:flex-end;">
      <button class="secondary" onclick="window.print()">🖨️ Print / Save PDF</button>
      <button class="primary" data-action="download-report-txt" data-id="${r.id}">Download Text Summary</button>
    </div>
  `, 'ESG AUDIT REPORT');
}

// Partner: Refer SME Modal
function referSmeModal() {
  const pt = partner(actor);
  modal('Refer Malaysian SME', `
    <p class="dialog-description">Onboard a Malaysian client under ${E(pt.name)}'s advisory code: <strong>${E(pt.referralCode)}</strong>.</p>
    <form id="modalForm" class="purchase-form">
      ${field('Company Name (Sdn Bhd / Enterprise)', 'smeName', '', 'text', 'required maxlength="100" placeholder="e.g. InnoTech Precision Sdn Bhd"')}
      ${field('Business Registration Reference (SSM)', 'registration', '', 'text', 'required maxlength="60" placeholder="e.g. 202401039845"')}
      ${field('Contact Person Name', 'contact', '', 'text', 'required maxlength="100" placeholder="e.g. Ahmad Razak"')}
      ${field('Contact Work Email', 'email', '', 'email', 'required maxlength="120" placeholder="e.g. razak@innotech.my"')}
      ${select('Business Industry Sector', 'sector', ['Precision Manufacturing', 'Food & Beverage', 'Industrial Packaging', 'Transport & Logistics', 'Agriculture & Palm Oil', 'Retail & Wholesale', 'Professional Services'], 'Precision Manufacturing')}
      <p class="fine-print">
        Once this SME onboards and completes transactions on Canopy, your partner firm automatically receives a 20% platform fee share.
      </p>
      ${end('Register SME Referral')}
    </form>
  `, 'PARTNER REFERRAL');

  form(d => {
    mutate(() => {
      store.addReferral(actor, d);
      store.addAccount('admin', {
        name: d.smeName,
        registration: d.registration,
        contact: d.contact,
        email: d.email,
        sector: d.sector
      });
    }, 'SME registered to your referral pipeline.');
    closeModal();
    navigate('partner-referrals');
  });
}

// Edit Project Modal
function editProject(id) {
  const p = id ? project(id) : { name: '', location: '', type: 'Forest conservation', method: '', description: '', registry: '', developer: '', developerEmail: '', vintage: '2025', status: 'Draft', price: 4000, inventory: 1000, earlyAccess: false };
  modal(id ? 'Edit Carbon Project' : 'Add New Carbon Project', `
    <form id="modalForm" class="purchase-form">
      <div class="form-grid">
        ${field('Project Name', 'name', p.name, 'text', 'required maxlength="100"')}
        ${field('Location (State, Malaysia)', 'location', p.location, 'text', 'required maxlength="100"')}
        ${select('Project Type', 'type', ['Forest conservation', 'Methane avoidance', 'Biochar removal', 'Renewable energy', 'Other'], p.type)}
        ${field('Vintage Year', 'vintage', p.vintage, 'text', 'pattern="[0-9]{4}" required')}
        ${field('Methodology / Standard', 'method', p.method, 'text', 'required maxlength="100"')}
        ${field('Registry Reference', 'registry', p.registry, 'text', 'maxlength="100"')}
        ${field('Project Developer Name', 'developer', p.developer, 'text', 'required maxlength="100" placeholder="e.g. Permian Malaysia"')}
        ${field('Developer Contact Email', 'developerEmail', p.developerEmail, 'email', 'required maxlength="100"')}
        ${field('Price per tCO₂e (RM)', 'price', (p.price / 100).toFixed(2), 'number', 'min="0.01" step="0.01" required')}
        ${field('Inventory (tCO₂e)', 'inventory', p.inventory / 10, 'number', 'min="0" step="0.1" required')}
        ${select('Listing Status', 'status', ['Draft', 'Published', 'Paused'], p.status)}
      </div>
      <label class="ack" style="margin:16px 0;">
        <input type="checkbox" name="earlyAccess" ${p.earlyAccess ? 'checked' : ''}>
        <span><strong>⭐ Enable 48h Early Access for Canopy Premium SMEs</strong> (Priority allocation before public opening)</span>
      </label>
      ${area('Project Description & ESG Co-benefits', 'description', p.description, 'minlength="10" maxlength="1500" required')}
      ${end('Save Project Listing')}
    </form>
  `, 'PROJECT CONFIGURATION');

  form(d => {
    mutate(() => store.saveProject(actor, {
      ...d,
      price: Math.round(Number(d.price) * 100),
      inventory: Math.round(Number(d.inventory) * 10),
      earlyAccess: d.earlyAccess === 'on' || d.earlyAccess === true
    }, id || null), 'Project listing saved.');
    closeModal();
  });
}

// New SME Account Modal
function newAccount() {
  modal('Register Malaysian SME', `
    <p class="dialog-description">Submit your enterprise profile for KYB review and trading eligibility.</p>
    <form id="modalForm" class="purchase-form">
      ${field('Company Legal Name', 'name', '', 'text', 'required maxlength="100" placeholder="e.g. Langkawi Eco Logistics Sdn Bhd"')}
      ${field('SSM Registration Number', 'registration', '', 'text', 'required maxlength="60" placeholder="e.g. 202301049281 (1492011-V)"')}
      ${field('Principal Contact Person', 'contact', '', 'text', 'required maxlength="100"')}
      ${field('Official Work Email', 'email', '', 'email', 'required maxlength="120"')}
      ${field('Business Sector', 'sector', '', 'text', 'required maxlength="80" placeholder="e.g. Clean Energy Transport"')}
      ${field('Office Location', 'location', '', 'text', 'required maxlength="100" placeholder="e.g. Petaling Jaya, Selangor"')}
      ${end('Submit for KYB Verification')}
    </form>
  `, 'SME REGISTRATION');

  form(d => {
    mutate(() => store.addAccount('admin', d), 'Registration submitted! Please sign in.');
    closeModal();
    if (!store.data.currentUser) {
      toast('Company created! You can now log in.');
    }
  });
}

// Admin: Verify SME Account Modal
function verifyAccount(id) {
  const a = company(id);
  modal('KYB Review: ' + E(a.name), `
    <dl class="detail-grid">
      <div><dt>Registration (SSM)</dt><dd>${E(a.registration)}</dd></div>
      <div><dt>Contact Person</dt><dd>${E(a.contact)} · ${E(a.email)}</dd></div>
      <div><dt>Sector &amp; Location</dt><dd>${E(a.sector)} · ${E(a.location || 'Malaysia')}</dd></div>
      <div><dt>Current Status</dt><dd>${badge(a.status)}</dd></div>
    </dl>
    <h3>Submitted Documents</h3>
    ${documents('account', id)}
    <form id="modalForm" class="purchase-form">
      ${select('Verification Decision', 'status', ['Verified', 'Pending', 'Rejected', 'Suspended'], a.status)}
      ${area('Verification Audit Note', 'note', a.note || 'KYB verified against SSM registry and AML screening.', 'required minlength="3" maxlength="500"')}
      ${end('Save KYB Decision')}
    </form>
  `, 'ADMIN DUE DILIGENCE');

  form(d => {
    mutate(() => store.verify(actor, id, d.status, d.note), 'KYB verification status updated.');
    closeModal();
  });
}

// Upload & Download
function uploadForm(target) {
  const [kind, id] = target.split('|');
  const targetName = kind === 'project' ? project(id).name : company(id).name;
  modal('Upload Sample Document', `
    <p class="dialog-description">${E(targetName)}</p>
    ${documents(kind, id)}
    <form id="modalForm" class="purchase-form">
      <label>Choose File (PDF, PNG, JPG, TXT · max 500 KB)
        <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required>
      </label>
      ${end('Attach Document')}
    </form>
  `, 'SUPPORTING DOCUMENT');

  form(async (d, f) => {
    const file = f.elements.file.files[0];
    if (!file || file.size > 500000) throw Error('File must be smaller than 500 KB.');
    const mime = file.type || ({ 'txt': 'text/plain', 'pdf': 'application/pdf' }[file.name.split('.').pop()] || '');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('File read error'));
      reader.readAsDataURL(file);
    });
    mutate(() => store.attach(actor, kind, id, { name: file.name, size: file.size, mime, data }), 'Document attached.');
    uploadForm(target);
  });
}

function download(name, text, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csv(name, headers, rows) {
  const q = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
  download(name, '\uFEFF' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

function exportReport(type) {
  if (type === 'history') {
    csv('Canopy-Transactions-' + actor + '.csv', ['Transaction', 'Company', 'Project', 'Date', 'Activity', 'tCO2e', 'Amount MYR', 'Reference'],
      store.data.ledger.filter(t => t.accountId === actor).map(t => [t.id, company(t.accountId).name, project(t.projectId)?.name || 'Platform', t.date, t.type, t.units / 10, t.amount / 100, t.reference]));
  } else if (type === 'dev-billing') {
    csv('Canopy-Developer-Commissions.csv', ['Bill ID', 'Developer', 'Project', 'Credits Sold tCO2e', 'Gross Value MYR', 'Commission 1% MYR', 'Status', 'Date'],
      store.data.developerBilling.map(b => [b.id, b.developer, b.projectName, b.creditsSold / 10, b.transactionValue / 100, b.commissionEarned / 100, b.status, b.date]));
  } else if (type === 'revenue') {
    csv('Canopy-Platform-Revenue-5Streams.csv', ['Ref', 'Category', 'Source', 'Payer', 'Amount MYR', 'Date'],
      store.data.platformRevenue.map(r => [r.reference, r.category, r.source, r.payer, r.amount / 100, r.date]));
  } else if (type === 'audit') {
    csv('Canopy-Audit-Log.csv', ['Date', 'Actor', 'Action', 'Details'],
      store.data.audit.map(a => [a.date, a.actor, a.action, a.detail]));
  } else if (type === 'partner-clients') {
    const clients = store.data.accounts.filter(a => a.partnerId === actor);
    csv('Canopy-Partner-Client-Holdings.csv', ['Client Name', 'Registration', 'Sector', 'Credits Held tCO2e'],
      clients.map(a => [a.name, a.registration, a.sector, Object.values(store.data.balances[a.id] || {}).reduce((x, y) => x + y, 0) / 10]));
  }
  toast('Report CSV exported.');
}

function certificate(id, save = false) {
  const c = store.data.retirements.find(x => x.id === id);
  if (!c || (!isAdmin() && c.accountId !== actor)) throw Error('Certificate not available.');
  const text = `MALAYSIA BURSA CARBON EXCHANGE (BCX) ALIGNED PROTOTYPE\nCANOPY RETIREMENT RECORD ${c.id}\n\nBeneficiary: ${c.beneficiary}\nProject: ${project(c.projectId).name}\nQuantity: ${qty(c.units)} tCO2e\nDate: ${date(c.date)}\nExecution Reference: ${c.reference}\nPurpose: ${c.purpose}\n\nVerra VCS / BCX registry compliant. Permanent environmental retirement.`;
  if (save) {
    download(c.id + '-CERTIFICATE.txt', text);
    return;
  }
  modal('Retirement Certificate', `
    <div class="certificate">
      <div class="sample-watermark">VERIFIED CARBON RETIREMENT</div>
      <h3>${E(c.id)}</h3>
      <p>Beneficiary: <strong>${E(c.beneficiary)}</strong></p>
      <p>${E(project(c.projectId).name)}<br><strong>${qty(c.units)} tCO₂e</strong></p>
      <p><em>${E(c.purpose)}</em></p>
      <p>${date(c.date)}<br><small>BCX Reference: ${E(c.reference)}</small></p>
      <p class="fine-print">Permanent retirement proof for Scope 1/2 corporate reporting.</p>
    </div>
    ${action('Download Certificate File', 'download-certificate', id, 'primary')}
  `, 'CARBON RETIREMENT EVIDENCE');
}

/* ==========================================================================
   GLOBAL CLICK & CHANGE DISPATCHER
   ========================================================================== */
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    navigate(nav.dataset.nav);
    return;
  }

  const b = e.target.closest('[data-action]');
  if (!b) return;
  const { action: a, id, code, tier } = b.dataset;

  try {
    if (a.startsWith('request-')) return requestForm(a.slice(8), id);
    if (a.startsWith('export-')) return exportReport(a.slice(7));
    if (a === 'nav-revenue') return navigate('platform-revenue');
    if (a === 'nav-queue') return navigate('queue');

    const handlers = {
      project: () => showProject(id),
      review: () => showRequest(id),
      'edit-project': () => editProject(id),
      verify: () => verifyAccount(id),
      upload: () => uploadForm(id),
      document: () => downloadDocument(id),
      certificate: () => certificate(id),
      'download-certificate': () => certificate(id, true),
      'new-account': newAccount,
      profile: () => navigate('account'),
      'my-requests': () => { closeModal(); navigate('requests'); },
      cancel: () => { mutate(() => store.cancel(actor, id), 'Cancelled.'); showRequest(id); },
      'upgrade-premium': upgradePremiumModal,
      'generate-report': () => generateReportModal(tier),
      'view-esg-report': () => showEsgReport(id),
      'download-report-txt': () => {
        const r = store.data.esgReports.find(x => x.id === id);
        if (r) download(r.id + '-SUMMARY.txt', `${r.title}\nRef: ${r.reference}\nTier: ${r.tier}\nTotal Held: ${r.totalHeld} tCO2e\nRetired: ${r.retiredUnits} tCO2e\nStatus: ${r.sustainabilityScore}`);
      },
      'refer-sme': referSmeModal,
      'copy-ref-code': () => {
        navigator.clipboard?.writeText(code);
        toast('Referral code ' + code + ' copied to clipboard!');
      },
      'settle-dev-bill': () => {
        mutate(() => store.settleDeveloperBill(actor, id, 'Settled'), 'Developer commission marked as Settled.');
      },
      'prompt-early-access': () => {
        modal('Canopy Premium Early Access', `
          <div class="pricing-card featured" style="margin:10px 0;">
            <span class="pricing-badge">EXCLUSIVE DROP</span>
            <h3>Kuamut Rainforest Conservation (Sabah)</h3>
            <p style="color:var(--muted); font-size:13.5px;">
              This newly listed BCX landmark project is currently in the <strong>48-hour Early Access window</strong> exclusively for Canopy Premium SMEs.
            </p>
            <p style="font-size:13px; line-height:1.6; color:#214c33;">
              Free plan consumers will be granted access once the embargo ends in 36 hours (subject to remaining inventory).
            </p>
            <button class="primary" data-action="upgrade-premium" style="width:100%; margin-top:14px;">
              Upgrade to Premium (RM150/mo) for Instant Priority Buy
            </button>
          </div>
        `, 'PRIORITY ACCESS ALLOCATION');
      },
      'client-esg-pack': () => {
        const clientAcc = company(id);
        modal('Client ESG Advisory: ' + E(clientAcc.name), `
          <dl class="detail-grid">
            <div><dt>Company</dt><dd>${E(clientAcc.name)}</dd></div>
            <div><dt>Sector</dt><dd>${E(clientAcc.sector)}</dd></div>
            <div><dt>Credits Held</dt><dd>${qty(Object.values(store.data.balances[id] || {}).reduce((x, y) => x + y, 0))} tCO₂e</dd></div>
            <div><dt>Advisory Status</dt><dd><span class="status good">Active Client</span></dd></div>
          </dl>
          <p class="dialog-description">Advisor recommendations for ${E(clientAcc.name)}:</p>
          <ul class="feature-list">
            <li><span class="check-icon">✓</span> Client holds sufficient credits for Q4 Scope 2 offsetting.</li>
            <li><span class="check-icon">✓</span> Advise client to retire 10.0 tCO₂e before November for annual CSR disclosure.</li>
            <li><span class="check-icon">✓</span> Recommend upgrading to Premium (RM150/mo) for Kuamut early allocation.</li>
          </ul>
        `, 'CLIENT ADVISORY DOSSIER');
      },
      'batch-esg-preview': () => {
        toast('Batch advisory pack compiled for all active referred clients.');
      }
    };
    handlers[a]?.();
  } catch (err) {
    toast(err.message);
  }
});

function downloadDocument(target) {
  const [kind, id, docId] = target.split('|');
  if (kind === 'account' && !isAdmin() && id !== actor) throw Error('Access denied.');
  const doc = (kind === 'project' ? project(id) : company(id)).documents.find(d => d.id === docId);
  if (!doc) throw Error('Document not found.');
  const a = document.createElement('a');
  a.href = doc.data;
  a.download = doc.name;
  document.body.append(a);
  a.click();
  a.remove();
}

document.addEventListener('change', e => {
  if (e.target.id === 'projectFilter') {
    projectFilter = e.target.value;
    render();
  }
  if (e.target.id === 'requestFilter') {
    requestFilter = e.target.value;
    render();
  }
});

window.addEventListener('storage', e => {
  if (e.key === KEY) {
    stale = true;
    toast('Data updated in another tab. Reload for fresh session.');
  }
});

// Close dialog
const closeBtn = $('#dialogCloseBtn');
if (closeBtn) closeBtn.onclick = closeModal;

// Initial render
render();

// Optional deep link modal opening
if (params.get('modal') === 'buy' && params.get('id')) {
  requestForm('Buy', params.get('id'));
} else if (params.get('modal') === 'esg' && params.get('id')) {
  showEsgReport(params.get('id'));
}

