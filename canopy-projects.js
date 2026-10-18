'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const cash = value => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  let context;
  let projects = [];
  let firstDemoPurchase = false;

  async function query(table, configure) {
    const result = await configure(context.db.from(table));
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function rpc(name, args) {
    const { data, error } = await context.db.rpc(name, args);
    if (error) throw error;
    return data;
  }
  function modal(html) {
    const dialog = document.querySelector('#actionDialog');
    document.querySelector('#dialogBody').innerHTML = html;
    dialog.showModal();
    dialog.querySelector('.close').onclick = () => dialog.close();
    return dialog;
  }
  function errorMessage(error) {
    const message = $('#demoProjectMessage');
    if (message) { message.textContent = error?.message || 'Request failed.'; message.hidden = false; }
    else context.toast(error?.message || 'Request failed.');
  }
  const demoBadge = '<span class="demo-project-badge">DEMONSTRATION LISTING — NO REAL CARBON CREDITS SOLD</span>';
  function locationRegion(location) {
    if (String(location).toLowerCase().includes('sabah')) return 'Sabah, Malaysia';
    if (String(location).toLowerCase().includes('perak')) return 'Perak, Malaysia';
    if (String(location).toLowerCase().includes('peninsular')) return 'Peninsular Malaysia';
    return location;
  }

  function visibleProjects() {
    const search = ($('#demoProjectSearch')?.value || '').trim().toLowerCase();
    const location = $('#demoProjectLocation')?.value || '';
    const category = $('#demoProjectCategory')?.value || '';
    const type = $('#demoProjectType')?.value || '';
    return projects.filter(project => (!search || project.project_name.toLowerCase().includes(search))
      && (!location || locationRegion(project.location) === location)
      && (!category || project.category === category)
      && (!type || project.project_type === type));
  }

  function card(project) {
    const reference = Number(project.simulated_price_myr || 0);
    const price = project.simulated_price_myr == null ? 'Not configured' : `${cash(reference)} / tCO₂e (simulated)`;
    const rangeMin = reference * 0.8; const rangeMax = reference * 1.2; const sellBack = reference * 0.98;
    const inventory = Number(project.simulated_inventory_tco2e || 0);
    const available = inventory > 0 ? `${inventory.toFixed(2)} tCO₂e (simulated inventory)` : 'Not configured';
    const canTrade = project.demo_trading_enabled && project.simulated_price_myr != null && inventory >= 0.01;
    return `<article class="demo-project-card"><div class="demo-project-image"><img src="${escapeHtml(project.representative_image_url)}" alt="${escapeHtml(project.image_attribution)}" loading="lazy"><span>Representative image</span></div><div class="demo-project-copy">${demoBadge}<p class="eyebrow">${escapeHtml(project.registry_name)} · PROJECT ${escapeHtml(project.registry_project_id)}</p><h2>${escapeHtml(project.project_name)}</h2><p class="demo-project-location">${escapeHtml(project.location)}</p><p><strong>${escapeHtml(project.category)}</strong></p><p>${escapeHtml(project.description)}</p><p class="demo-project-source">Public registry facts · checked ${date(project.source_checked_at)}</p><dl class="demo-project-stats"><div><dt>Demo reference price — NOT live BCX data</dt><dd>${price}</dd></div><div><dt>Illustrative ±20% range</dt><dd>${cash(rangeMin)} – ${cash(rangeMax)} / tCO₂e</dd></div><div><dt>Illustrative sell-back quote — not an actual offer</dt><dd>${cash(sellBack)} / tCO₂e</dd></div><div><dt>Demo available quantity</dt><dd>${available}</dd></div></dl><details class="demo-project-details"><summary>View Project Details</summary><dl><div><dt>Registry</dt><dd>${escapeHtml(project.registry_name)}</dd></div><div><dt>Registry project ID</dt><dd>${escapeHtml(project.registry_project_id)}</dd></div><div><dt>Project proponent in public reference</dt><dd>${escapeHtml(project.project_proponent || 'Not supplied')}</dd></div><div><dt>Project type</dt><dd>${escapeHtml(project.project_type)}</dd></div><div><dt>Relationship / credit status</dt><dd>Canopy does not claim ownership, acquisition, developer relationship, or BCX authorization for this project.</dd></div></dl><p><a href="${escapeHtml(project.public_reference_url)}" target="_blank" rel="noopener noreferrer">Open public project reference</a></p><p><a href="${escapeHtml(project.registry_url)}" target="_blank" rel="noopener noreferrer">Open Verra Registry record</a></p><small>${escapeHtml(project.image_attribution)}</small></details>${canTrade ? `<form class="demo-purchase-form" data-project="${project.id}"><label>Demo purchase quantity (tCO₂e)<input name="quantity" type="number" min="0.01" step="0.01" value="0.01" max="${inventory.toFixed(2)}" required></label><dl class="demo-purchase-quote"><div><dt>Credit value</dt><dd data-credit-value>${cash(Number(project.simulated_price_myr) * 0.01)}</dd></div><div><dt>Platform fee (1.5%)</dt><dd data-platform-fee>${cash(Number(project.simulated_price_myr) * 0.01 * 0.015)}</dd></div><div><dt>Total · simulated only</dt><dd data-total>${cash(Number(project.simulated_price_myr) * 0.01 * 1.015)}</dd></div></dl><button class="btn primary" type="submit">Request demo purchase</button></form>` : '<p class="demo-trading-disabled">Demo trading disabled. No price or project availability is implied.</p>'}</div></article>`;
  }

  function renderMarket() {
    const locations = [...new Set(projects.map(project => locationRegion(project.location)))].sort();
    const categories = [...new Set(projects.map(project => project.category))].sort();
    const types = [...new Set(projects.map(project => project.project_type))].sort();
    const selectOptions = (values, selected) => `<option value="">All</option>${values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
    const previous = { location: $('#demoProjectLocation')?.value || '', category: $('#demoProjectCategory')?.value || '', type: $('#demoProjectType')?.value || '' };
    const search = $('#demoProjectSearch')?.value || '';
    $('#demoProjectCatalog').innerHTML = `<section class="demo-project-market"><div class="page-heading"><div><span class="eyebrow">PUBLIC REGISTRY REFERENCES</span><h1>Malaysian carbon projects</h1><p>Demonstration listings — no real carbon credits sold. Public project facts are linked to their references; prices and inventory below are simulated and are not registry balances.</p></div></div>${demoBadge}<details class="demo-project-details"><summary>Pricing explained</summary><p>The demo reference price helps SMEs compare simulated project pricing. The ±20% range is a proposed Canopy platform rule, not a BCX requirement. A 1.5% transaction fee is shown at checkout. The sell-back quote is illustrative only; no sell-back offer or transaction is available.</p></details><form id="demoProjectFilters" class="demo-project-filters"><label>Search by name<input id="demoProjectSearch" type="search" value="${escapeHtml(search)}" placeholder="Search projects"></label><label>Location<select id="demoProjectLocation">${selectOptions(locations, previous.location)}</select></label><label>Category<select id="demoProjectCategory">${selectOptions(categories, previous.category)}</select></label><label>Project type<select id="demoProjectType">${selectOptions(types, previous.type)}</select></label></form><div class="demo-project-grid">${visibleProjects().map(card).join('') || '<p class="muted">No demonstration projects match these filters.</p>'}</div><p id="demoProjectMessage" class="demo-project-message" role="status" aria-live="polite" hidden></p></section>`;
    ['#demoProjectSearch', '#demoProjectLocation', '#demoProjectCategory', '#demoProjectType'].forEach(selector => $(selector).addEventListener(selector.includes('Search') ? 'input' : 'change', renderMarket));
    $$('.demo-purchase-form').forEach(form => {
      const project = projects.find(item => item.id === form.dataset.project);
      const input = form.elements.quantity;
      input.addEventListener('input', () => {
        const quantity = Number(input.value || 0);
        const value = Math.round(quantity * Number(project.simulated_price_myr) * 100) / 100;
        const fee = Math.round(value * 0.015 * 100) / 100;
        form.querySelector('[data-credit-value]').textContent = cash(value);
        form.querySelector('[data-platform-fee]').textContent = cash(fee);
        form.querySelector('[data-total]').textContent = cash(value + fee);
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try { const quantity = Number(input.value); if (firstDemoPurchase) await openFirstPurchaseWizard(project.id, quantity); else await openPurchaseConfirmation(project, quantity); }
        catch (error) { errorMessage(error); }
        finally { button.disabled = false; }
      });
    });
  }

  async function openFirstPurchaseWizard(projectId, initialQuantity, step = 1) {
    const available = projects.filter(project => project.demo_trading_enabled && Number(project.simulated_inventory_tco2e) >= 0.01 && project.simulated_price_myr != null);
    let selected = available.find(project => project.id === projectId) || available[0];
    if (!selected) throw new Error('No simulated project is available for purchase.');
    const quantity = Number(initialQuantity || 0.01);
    if (step === 4) return openPurchaseConfirmation(selected, quantity, true);
    let body;
    if (step === 1) body = `<label>Choose a demonstration project<select id="wizardProject">${available.map(project => `<option value="${project.id}" ${project.id === selected.id ? 'selected' : ''}>${escapeHtml(project.project_name)} · ${cash(project.simulated_price_myr)} / tCO₂e</option>`).join('')}</select></label>`;
    else if (step === 2) body = `<label>Quantity (tCO₂e)<input id="wizardQuantity" type="number" min="0.01" step="0.01" value="${quantity.toFixed(2)}" required></label><p class="fine-print">Minimum 0.01 tCO₂e. Demo / simulated only.</p>`;
    else { const wallet = await rpc('canopy_demo_wallet_summary'); const credit = Math.round(quantity * Number(selected.simulated_price_myr) * 100) / 100; const fee = Math.round(credit * 0.015 * 100) / 100; const total = credit + fee; const enough = Number(wallet.balance_myr) >= total; body = `<p><strong>${escapeHtml(selected.project_name)}</strong></p><dl class="details"><div><dt>Unit price</dt><dd>${cash(selected.simulated_price_myr)} / tCO₂e</dd></div><div><dt>Demo RM Wallet</dt><dd>${cash(wallet.balance_myr)}</dd></div><div><dt>Credit value</dt><dd>${cash(credit)}</dd></div><div><dt>Platform fee (1.5%)</dt><dd>${cash(fee)}</dd></div><div><dt>Total</dt><dd>${cash(total)}</dd></div></dl><p class="feedback-message ${enough ? '' : 'feedback-error'}">${enough ? 'Demo only — no real payment or carbon credits.' : 'Insufficient Demo RM Wallet balance. Please top up before continuing.'}</p>`; }
    const dialog = modal(`<h2>First demo purchase</h2><p class="fine-print">Step ${step} of 4 · DEMO / SIMULATED only</p><div class="dialog-form">${body}<div class="walkthrough-actions"><button class="btn secondary" id="wizardCancel" type="button">Cancel</button>${step > 1 ? '<button class="btn secondary" id="wizardBack" type="button">Back</button>' : ''}<button class="btn primary" id="wizardNext" type="button">Next</button></div></div>`);
    dialog.querySelector('#wizardCancel').onclick = () => dialog.close();
    dialog.querySelector('#wizardBack')?.addEventListener('click', () => openFirstPurchaseWizard(selected.id, quantity, step - 1));
    dialog.querySelector('#wizardNext').onclick = () => { const project = available.find(item => item.id === dialog.querySelector('#wizardProject')?.value) || selected; const nextQuantity = Number(dialog.querySelector('#wizardQuantity')?.value || quantity); if (step === 2 && (!Number.isFinite(nextQuantity) || nextQuantity < 0.01 || Math.round(nextQuantity * 100) !== nextQuantity * 100)) { context.toast('Use at least 0.01 tCO₂e in 0.01 increments.', 'error'); return; } openFirstPurchaseWizard(project.id, nextQuantity, step + 1); };
  }
  async function openPurchaseConfirmation(project, initialQuantity, firstWizard = false) {
    const wallet = await rpc('canopy_demo_wallet_summary');
    const dialog = modal(`<h2>${firstWizard ? 'Step 4 of 4 · Confirm demo purchase' : 'Confirm demo purchase'}</h2><p><strong>${escapeHtml(project.project_name)}</strong></p><p class="fine-print">Demo only — no real payment or carbon-credit purchase. Admin review is required before a simulated allocation appears in your holdings.</p><form id="demoPurchaseConfirm" class="dialog-form"><label>Quantity (tCO₂e)<input name="quantity" type="number" min="0.01" step="0.01" value="${Number(initialQuantity).toFixed(2)}" required></label><dl class="details"><div><dt>Simulated unit price</dt><dd>${cash(project.simulated_price_myr)} / tCO₂e</dd></div><div><dt>Available Demo RM Wallet balance</dt><dd id="walletBalance">${cash(wallet.balance_myr)}</dd></div><div><dt>Credit value</dt><dd id="confirmCreditValue"></dd></div><div><dt>Platform fee (1.5%)</dt><dd id="confirmFee"></dd></div><div><dt>Total</dt><dd id="confirmTotal"></dd></div></dl><button class="btn primary" type="submit">Confirm Demo Purchase</button><p id="demoPurchaseResult" class="feedback-message" aria-live="polite"></p></form>`);
    const form = dialog.querySelector('#demoPurchaseConfirm');
    if (firstWizard) {
      form.insertAdjacentHTML('afterend', '<div class="walkthrough-actions"><button class="btn secondary" id="wizardConfirmBack" type="button">Back</button><button class="btn secondary" id="wizardConfirmCancel" type="button">Cancel</button></div>');
      dialog.querySelector('#wizardConfirmBack').onclick = () => openFirstPurchaseWizard(project.id, Number(form.elements.quantity.value), 3);
      dialog.querySelector('#wizardConfirmCancel').onclick = () => dialog.close();
    }
    const input = form.elements.quantity;
    const submit = form.querySelector('button[type="submit"]');
    const result = dialog.querySelector('#demoPurchaseResult');
    const updateQuote = () => {
      const quantity = Number(input.value || 0); const credit = Math.round(quantity * Number(project.simulated_price_myr) * 100) / 100; const fee = Math.round(credit * 0.015 * 100) / 100; const total = credit + fee;
      dialog.querySelector('#confirmCreditValue').textContent = cash(credit); dialog.querySelector('#confirmFee').textContent = cash(fee); dialog.querySelector('#confirmTotal').textContent = cash(total);
      const valid = quantity >= 0.01 && Math.round(quantity * 100) === quantity * 100;
      const enough = Number(wallet.balance_myr) >= total;
      submit.disabled = !valid || !enough;
      result.className = `feedback-message ${!valid || !enough ? 'feedback-error' : ''}`;
      result.textContent = !valid ? 'Use at least 0.01 tCO₂e in 0.01 increments.' : !enough ? 'Insufficient Demo RM Wallet balance. Open Demo RM Wallet to add demo funds.' : '';
    };
    input.addEventListener('input', updateQuote); updateQuote();
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return; submit.disabled = true; submit.textContent = 'Submitting…'; result.textContent = '';
      try {
        const request = await rpc('canopy_request_demo_purchase', { p_project_id: project.id, p_quantity: Number(input.value) });
        result.className = 'feedback-message feedback-success'; result.textContent = '✓ Demo purchase request submitted successfully! Pending Admin approval.';
        submit.textContent = 'Submitted';
        firstDemoPurchase = false; context.toast('✓ Demo purchase request submitted successfully! Pending Admin approval.', 'success');
        await mount('market', context);
      } catch (error) { submit.disabled = false; submit.textContent = 'Confirm Demo Purchase'; result.className = 'feedback-message feedback-error'; result.textContent = error?.message || 'Could not submit this demo purchase.'; }
    });
  }

  function factsFormMarkup(project = {}, isNew = false) {
    const values = {
      registry_name: project.registry_name || 'Verra VCS',
      registry_project_id: project.registry_project_id || '',
      project_name: project.project_name || '',
      location: project.location || '',
      category: project.category || '',
      project_type: project.project_type || '',
      project_proponent: project.project_proponent || '',
      description: project.description || '',
      public_reference_url: project.public_reference_url || '',
      registry_url: project.registry_url || '',
      representative_image_url: project.representative_image_url || 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80',
      image_attribution: project.image_attribution || 'Generic representative image under the Unsplash License; not a project photograph.'
    };
    const field = (name, label, type = 'text', required = true) => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(values[name])}" ${required ? 'required' : ''}></label>`;
    return `<form class="demo-facts-form" ${isNew ? 'id="newDemoProjectForm"' : `data-facts-project="${project.id}"`}><h3>${isNew ? 'Add registry listing' : `Edit facts · ${escapeHtml(project.project_name)}`}</h3>${field('registry_name','Registry name')}${field('registry_project_id','Registry project ID')}${field('project_name','Project name')}${field('location','Location')}${field('category','Category')}${field('project_type','Project type')}${field('project_proponent','Project proponent', 'text', false)}<label>Description<textarea name="description" required minlength="10">${escapeHtml(values.description)}</textarea></label>${field('public_reference_url','Public reference URL','url')}${field('registry_url','Official registry URL','url')}${field('representative_image_url','Generic representative image URL','url')}${field('image_attribution','Image attribution')}${field('note','Admin audit note')}<button class="btn secondary" type="submit">${isNew ? 'Add listing' : 'Save project facts'}</button></form>`;
  }

  async function saveFacts(form) {
    const values = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await rpc('canopy_admin_save_demo_project_facts', {
        p_admin_id: context.profile.id,
        p_project_id: form.dataset.factsProject || null,
        p_registry_name: values.get('registry_name'),
        p_registry_project_id: values.get('registry_project_id'),
        p_project_name: values.get('project_name'),
        p_location: values.get('location'),
        p_category: values.get('category'),
        p_project_type: values.get('project_type'),
        p_description: values.get('description'),
        p_project_proponent: values.get('project_proponent'),
        p_public_reference_url: values.get('public_reference_url'),
        p_registry_url: values.get('registry_url'),
        p_image_url: values.get('representative_image_url'),
        p_image_attribution: values.get('image_attribution'),
        p_note: values.get('note')
      });
      context.toast(form.dataset.factsProject ? 'Project facts updated and audited.' : 'Demo project listing added and audited.');
      await mount('projects', context);
    } catch (error) { button.disabled = false; errorMessage(error); }
  }

  async function adminView() {
    const [rows, requests, accountResult] = await Promise.all([
      query('canopy_demo_projects', table => table.select('*').order('project_name')),
      query('canopy_demo_purchase_requests', table => table.select('*').order('created_at', { ascending: false })),
      context.db.functions.invoke('account-workflow', { body: { action: 'list-account-verification' } })
    ]);
    projects = rows;
    const allocated = await Promise.all(rows.map(project => query('canopy_demo_entitlement_ledger', table => table.select('delta_tco2e').eq('project_id', project.id))));
    const details = new Map(rows.map((project, index) => {
      const approved = allocated[index].reduce((sum, row) => sum + Math.max(0, Number(row.delta_tco2e || 0)), 0);
      const pending = requests.filter(request => request.project_id === project.id && request.request_status === 'pending_admin_review');
      return [project.id, { project, approved, pending, remaining: Math.max(0, Number(project.simulated_inventory_tco2e || 0) - approved - pending.reduce((sum, request) => sum + Number(request.quantity_tco2e || 0), 0)) }];
    }));
    const activeDetails = [...details.values()].filter(item => item.project.listing_active);
    const totalAvailable = activeDetails.reduce((sum, item) => sum + item.remaining, 0);
    const pendingRequests = requests.filter(request => request.request_status === 'pending_admin_review');
    const approvedAllocations = activeDetails.reduce((sum, item) => sum + item.approved, 0);
    const accounts = accountResult.error ? null : (accountResult.data?.data || []);
    const pendingVerification = accounts ? accounts.filter(account => account.role === 'sme' && account.effective_status === 'pending').length : null;
    const recentActivity = accounts ? accounts.map(account => account.audit).filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5) : [];    const operations = `<section class="revenue-section demo-operations"><h2>Demo Inventory & Operations</h2><p>Simulated inventory only — no actual BCX custody or credit backing.</p><div class="metric-grid"><article><span>Total simulated availability</span><strong>${totalAvailable.toFixed(2)} tCO₂e</strong></article><article><span>Pending demo purchase requests</span><strong>${pendingRequests.length}</strong></article><article><span>Approved demo allocations</span><strong>${approvedAllocations.toFixed(2)} tCO₂e</strong></article><article><span>Simulated retirement requests</span><strong>Not available</strong></article></div><div class="table-wrap"><table><thead><tr><th>Project / Verra reference</th><th>Original simulated inventory</th><th>Approved allocations</th><th>Pending reservations</th><th>Remaining availability</th></tr></thead><tbody>${activeDetails.map(item => `<tr><td><strong>${escapeHtml(item.project.project_name)}</strong><small>${escapeHtml(item.project.registry_name)} ${escapeHtml(item.project.registry_project_id)}</small></td><td>${Number(item.project.simulated_inventory_tco2e || 0).toFixed(2)} tCO₂e</td><td>${item.approved.toFixed(2)} tCO₂e</td><td>${item.pending.length} request${item.pending.length === 1 ? '' : 's'} · ${item.pending.reduce((sum, request) => sum + Number(request.quantity_tco2e || 0), 0).toFixed(2)} tCO₂e</td><td>${item.remaining.toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div></section>`;
    const compliance = `<section class="revenue-section demo-compliance"><h2>Demo Compliance Monitoring</h2><p>Demonstration monitoring — not a certified AML/CFT compliance system.</p><div class="metric-grid"><article><span>Pending SME verification</span><strong>${pendingVerification === null ? 'Not available' : pendingVerification}</strong></article><article><span>Pending demo purchase review</span><strong>${pendingRequests.length}</strong></article><article><span>Account-review data</span><strong>${accounts === null ? 'Not available' : 'Available'}</strong></article></div><p class="warning">Pending or unverified SME accounts cannot use protected demo purchase actions until approved.</p>${recentActivity.length ? `<div class="table-wrap"><table><thead><tr><th>Recent Admin activity</th><th>When</th></tr></thead><tbody>${recentActivity.map(audit => `<tr><td>${escapeHtml(audit.previous_status || '—')} → ${escapeHtml(audit.new_status || '—')}<small>${escapeHtml(audit.reason || 'Admin account decision')}</small></td><td>${date(audit.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Recent Admin approval/rejection activity: Not available.</p>'}</section>`;    const legacyProjects = (context.projects || []).filter(project => project && project.id);
    $('#demoProjectCatalog').innerHTML = `<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Carbon Projects</h1><p>Manage the simulated demonstration catalogue from the existing Projects page. Public registry facts are referenced only; no real credits, ownership or availability are represented.</p></div></div>${demoBadge}${operations}${compliance}<div class="demo-admin-projects">${rows.map(project => { const quantities = details.get(project.id); const state = project.listing_active && project.demo_trading_enabled ? 'Listed · demo trading enabled' : project.listing_active ? 'Listed · demo trading disabled' : 'Listing inactive'; return `<form class="demo-admin-project" data-project="${project.id}"><h2>${escapeHtml(project.project_name)}</h2><p><strong>Registry:</strong> ${escapeHtml(project.registry_name)} ${escapeHtml(project.registry_project_id)} · <strong>Location:</strong> ${escapeHtml(project.location)}</p><p><strong>Project type:</strong> ${escapeHtml(project.project_type)} · <strong>Status:</strong> ${state}</p><label>Simulated price (MYR/tCO₂e)<input name="price" type="number" min="0.01" step="0.01" value="${project.simulated_price_myr ?? ''}"></label><label>Simulated inventory (tCO₂e)<input name="inventory" type="number" min="0" step="0.01" value="${Number(project.simulated_inventory_tco2e).toFixed(2)}"></label><p>Allocated demo entitlements: ${quantities.approved.toFixed(2)} tCO₂e</p><label class="demo-toggle"><input name="enabled" type="checkbox" ${project.demo_trading_enabled ? 'checked' : ''}> Enable demo trading</label><label>Audit note<input name="note" required minlength="3" placeholder="Reason for simulated setting change"></label><button class="btn secondary" type="submit">Save simulated listing settings</button></form>`; }).join('')}</div><section class="demo-admin-requests"><h2>Simulated purchase requests</h2>${requests.length ? `<div class="table-wrap"><table><thead><tr><th>SME</th><th>Project</th><th>Quantity</th><th>Simulated total</th><th>Status</th><th>Review</th></tr></thead><tbody>${requests.map(request => `<tr><td>${escapeHtml(request.user_id)}</td><td>${escapeHtml(details.get(request.project_id)?.project.project_name || request.project_id)}</td><td>${Number(request.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${cash(request.simulated_total_myr)} · not collected</td><td>${escapeHtml(request.request_status)}</td><td>${request.request_status === 'pending_admin_review' ? `<button class="btn primary" data-purchase-decision="approve" data-request="${request.id}">Approve demo</button><button class="btn danger" data-purchase-decision="reject" data-request="${request.id}">Reject</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No simulated purchase requests.</p>'}</section>${legacyProjects.length ? `<section class="demo-admin-requests"><h2>Legacy project records</h2><p>These existing <code>projects</code> records are retained unchanged. They are separate from the simulated catalogue above.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Location</th><th>Listing status</th></tr></thead><tbody>${legacyProjects.map(project => `<tr><td>${escapeHtml(project.name || 'Untitled')}</td><td>${escapeHtml(project.location || '—')}</td><td>${escapeHtml(project.listing_status || '—')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}<p id="demoProjectMessage" class="demo-project-message" role="status" aria-live="polite" hidden></p>`;
    document.querySelector('#demoProjectCatalog').insertAdjacentHTML('beforeend', `<section class="demo-facts-management"><h2>Project registry facts</h2><p>Add only projects with a public registry record. Every fact edit requires an audit note.</p>${factsFormMarkup({}, true)}<details class="demo-existing-facts"><summary>Edit an existing listing’s facts</summary>${rows.map(project => factsFormMarkup(project)).join('')}</details></section>`);
    $('#newDemoProjectForm').addEventListener('submit', event => { event.preventDefault(); saveFacts(event.currentTarget); });
    $$('.demo-facts-form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); saveFacts(form); }));
    $$('.demo-admin-project').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); const values = new FormData(form); const button = form.querySelector('button'); button.disabled = true;
      try { await rpc('canopy_admin_update_demo_project', { p_admin_id: context.profile.id, p_project_id: form.dataset.project, p_price_myr: values.get('price') ? Number(values.get('price')) : null, p_inventory_tco2e: Number(values.get('inventory')), p_trading_enabled: values.get('enabled') === 'on', p_note: values.get('note') }); context.toast('Simulated project settings saved and audited.'); await mount('projects', context); }
      catch (error) { button.disabled = false; errorMessage(error); }
    }));
    $$('[data-purchase-decision]').forEach(button => button.addEventListener('click', async () => {
      const note = window.prompt('Enter an Admin review note (at least 3 characters):');
      if (!note || note.trim().length < 3) return;
      button.disabled = true;
      try { await rpc('canopy_admin_review_demo_purchase', { p_admin_id: context.profile.id, p_request_id: button.dataset.request, p_decision: button.dataset.purchaseDecision, p_note: note.trim() }); context.toast('Demo purchase reviewed. No real credits transferred.'); await mount('projects', context); }
      catch (error) { button.disabled = false; errorMessage(error); }
    }));
  }

  async function holdingsView() {
    const [ledger, catalogue] = await Promise.all([
      query('canopy_demo_entitlement_ledger', table => table.select('project_id,delta_tco2e,created_at').order('created_at', { ascending: false })),
      query('canopy_demo_projects', table => table.select('id,project_name,registry_name,registry_project_id').order('project_name'))
    ]);
    const projectNames = new Map(catalogue.map(project => [project.id, project]));
    const balances = new Map();
    ledger.forEach(entry => balances.set(entry.project_id, (balances.get(entry.project_id) || 0) + Number(entry.delta_tco2e || 0)));
    const rows = [...balances.entries()].filter(([, quantity]) => quantity > 0.00001);
    $('#demoProjectCatalog').innerHTML = `<div class="page-heading"><div><span class="eyebrow">SIMULATED PORTFOLIO</span><h1>My demo carbon holdings</h1><p>Approved demo allocations only. These are not real carbon credits, registry balances, certificates, or ownership records.</p></div></div>${demoBadge}${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Registry reference</th><th>Demo quantity</th></tr></thead><tbody>${rows.map(([projectId, quantity]) => { const project = projectNames.get(projectId); return `<tr><td>${escapeHtml(project?.project_name || projectId)}</td><td>${escapeHtml(project ? `${project.registry_name} ${project.registry_project_id}` : '—')}</td><td>${quantity.toFixed(2)} tCO₂e</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><h3>No approved demo allocations yet</h3><p>Top up your Demo RM Wallet, submit a simulated purchase request, and wait for Admin review.</p></div>'}`;
  }

  async function requestsView() {
    const [demoRequests, demoProjects] = await Promise.all([
      query('canopy_demo_purchase_requests', table => table.select('id,project_id,quantity_tco2e,request_status,created_at').order('created_at', { ascending: false })),
      query('canopy_demo_projects', table => table.select('id,project_name'))
    ]);
    const demoProjectNames = new Map(demoProjects.map(project => [project.id, project.project_name]));
    const legacyProjectNames = new Map((context.projects || []).map(project => [project.id, project.name]));
    const statusName = value => ({ pending_admin_review: 'Pending Admin Review', approved_demo: 'Approved (Demo)', rejected: 'Rejected' })[value] || value;
    const statusMarkup = value => `<span class="status ${escapeHtml(String(value).toLowerCase().replace(/[^a-z0-9-]/g, '-'))}">${escapeHtml(statusName(value))}</span>`;
    const rows = [
      ...demoRequests.map(request => ({ ...request, kind: 'Demo purchase', project_name: demoProjectNames.get(request.project_id) || request.project_id, status: request.request_status, demo: true })),
      ...(context.requests || []).map(request => ({ ...request, kind: request.request_type || 'Request', project_name: legacyProjectNames.get(request.project_id) || request.project_id, status: request.status, demo: false }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    $('#demoProjectCatalog').innerHTML = `<div class="page-heading"><div><span class="eyebrow">ACTIVITY</span><h1>My requests</h1><p>Track your submitted requests. Demo only — no real carbon credits.</p></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Request type</th><th>Project</th><th>Quantity</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.kind)}${row.demo ? '<small>Demo only</small>' : ''}</td><td>${escapeHtml(row.project_name || 'Project')}</td><td>${Number(row.quantity_tco2e || 0).toFixed(2)} tCO₂e</td><td>${statusMarkup(row.status)}</td><td>${date(row.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h3>Nothing here yet</h3><p>Your demo and other submitted requests will appear here.</p></div>'}`;
  }

  async function mount(view, values) {
    context = { ...values, view };
    try {
      if (view === 'market') {
        projects = await query('canopy_demo_projects', table => table.select('*').eq('listing_active', true).order('project_name'));
        firstDemoPurchase = context.profile?.role === 'sme' && (await query('canopy_demo_purchase_requests', table => table.select('id').limit(1))).length === 0;
        renderMarket();
      } else if (view === 'projects') {
        await adminView();
      } else if (view === 'holdings') {
        await holdingsView();
      } else if (view === 'requests') {
        await requestsView();
      }
    } catch (error) {
      errorMessage(error);
      $('#demoProjectCatalog').innerHTML = `<div class="empty"><h3>Demonstration project data unavailable</h3><p>${escapeHtml(error?.message || 'Database migration required.')}</p></div>`;
    }
  }

  window.CanopyProjects = { mount };
})();
