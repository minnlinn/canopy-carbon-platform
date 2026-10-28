'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const cash = value => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  const malaysiaDay = value => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)); const get = type => parts.find(part => part.type === type)?.value; return `${get('year')}-${get('month')}-${get('day')}`; };
  const malaysiaMonth = value => malaysiaDay(value).slice(0, 7);
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
  function miniBars(items, label, color = '#2e7657') {
    const peak = Math.max(0, ...items.map(item => Number(item.value || 0)));
    if (!peak) return '<p class="muted">No approved simulated purchase activity yet.</p>';
    const bar = Math.max(14, (520 - 32 - 8 * (items.length - 1)) / items.length);
    return `<svg viewBox="0 0 520 150" role="img" aria-label="${escapeHtml(label)}" style="width:100%;height:auto;display:block">${items.map((item, index) => { const value = Number(item.value || 0); const height = Math.max(value ? 4 : 0, value / peak * 94); const x = 16 + index * (bar + 8); return `<rect x="${x.toFixed(1)}" y="${(110 - height).toFixed(1)}" width="${bar.toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="${color}"></rect><text x="${(x + bar / 2).toFixed(1)}" y="132" text-anchor="middle" font-size="10" fill="#52665a">${escapeHtml(item.label)}</text>`; }).join('')}</svg>`;
  }
  function miniDoughnut(items, label) {
    const usable = items.filter(item => Number(item.value || 0) > 0); const total = usable.reduce((sum, item) => sum + Number(item.value), 0);
    if (!total) return '<p class="muted">No approved simulated holdings yet.</p>';
    const shortName = value => { const name = String(value || ''); const key = name.toLowerCase(); return key.includes('kuamut') ? 'Kuamut' : key.includes('infapro') ? 'INFAPRO' : key.includes('monsoon') ? 'Monsoon Methane' : key.includes('biomass') ? 'Biomass Recovery' : name; };
    const colors = ['#2e7657', '#73a65b', '#b6cf9c', '#b7d8c3', '#699b82']; const circumference = 270.18; let offset = 0;
    const arcs = usable.map((item, index) => { const length = Number(item.value) / total * circumference; const arc = `<circle cx="64" cy="64" r="43" fill="none" stroke="${colors[index % colors.length]}" stroke-width="20" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 64 64)"></circle>`; offset += length; return arc; }).join('');
    return `<div class="portfolio-doughnut"><svg viewBox="0 0 128 128" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>${arcs}<text x="64" y="62" text-anchor="middle" font-size="13" fill="#23442f">${total.toFixed(2)}</text><text x="64" y="78" text-anchor="middle" font-size="9" fill="#52665a">tCO₂e</text></svg><ul class="portfolio-breakdown">${usable.map((item, index) => `<li title="${escapeHtml(item.label)}"><span class="portfolio-key" style="background:${colors[index % colors.length]}"></span><span>${escapeHtml(shortName(item.label))}</span><strong>${Number(item.value).toFixed(2)} tCO₂e</strong></li>`).join('')}</ul></div>`;
  }

  function miniShareDoughnut(percentage) {
    const mine = Math.max(0, Math.min(100, Number(percentage || 0))); const circumference = 270.18; const mineLength = mine / 100 * circumference;
    return `<div class="contribution-doughnut"><svg viewBox="0 0 128 128" role="img" aria-label="Approximate share of simulated purchase activity"><circle cx="64" cy="64" r="43" fill="none" stroke="#dbe9df" stroke-width="20"></circle><circle cx="64" cy="64" r="43" fill="none" stroke="#2e7657" stroke-width="20" stroke-dasharray="${mineLength} ${circumference - mineLength}" transform="rotate(-90 64 64)"></circle><text x="64" y="64" text-anchor="middle" font-size="17" fill="#23442f">${mine}%</text><text x="64" y="80" text-anchor="middle" font-size="9" fill="#52665a">approx.</text></svg><p><span><i style="background:#2e7657"></i>My approximate share</span><span><i style="background:#8aa895"></i>Other SMEs combined</span></p></div>`;
  }
  function locationRegion(location) {
    if (String(location).toLowerCase().includes('sabah')) return 'Sabah, Malaysia';
    if (String(location).toLowerCase().includes('perak')) return 'Perak, Malaysia';
    if (String(location).toLowerCase().includes('peninsular')) return 'Peninsular Malaysia';
    return location;
  }
  function projectRisk(project) {
    const kind = `${project.category || ''} ${project.project_type || ''}`.toLowerCase();
    if (kind.includes('forest')) return 'Potential reversal risk from fire, illegal logging, or other forest loss.';
    if (kind.includes('biomass')) return 'Operational and project-performance risks may affect expected outcomes.';
    if (kind.includes('methane') || kind.includes('wastewater')) return 'Monitoring, measurement, and operational risks may affect expected outcomes.';
    return 'Project performance and monitoring conditions may vary.';
  }
  function projectVintage(project) { return project.credit_vintage || project.vintage_year || project.vintage || 'Not specified'; }
  function projectPriceChange(project) { const value = Number(project.price_change_30d); return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : 'Not available'; }

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
    const rangeMin = reference * 0.85; const rangeMax = reference * 1.15; const sellBack = reference * 0.98;
    const inventory = Number(project.simulated_inventory_tco2e || 0);
    const available = inventory > 0 ? `${inventory.toFixed(2)} tCO₂e (simulated inventory)` : 'Not configured';
    const canTrade = project.demo_trading_enabled && project.simulated_price_myr != null && inventory >= 0.01;
    const risk = projectRisk(project);
    return `<article class="demo-project-card"><div class="demo-project-image"><img src="${escapeHtml(project.representative_image_url)}" alt="${escapeHtml(project.image_attribution)}" loading="lazy"><span>Representative image</span></div><div class="demo-project-copy">${demoBadge}<p class="eyebrow">${escapeHtml(project.registry_name)} · PROJECT ${escapeHtml(project.registry_project_id)}</p><h2>${escapeHtml(project.project_name)}</h2><p class="demo-project-location">${escapeHtml(project.location)}</p><p><strong>${escapeHtml(project.category)}</strong></p><p>${escapeHtml(project.description)}</p><p class="demo-project-source">Public registry facts · checked ${date(project.source_checked_at)}</p><dl class="demo-project-stats"><div><dt>Demo reference price — NOT live BCX data</dt><dd>${price}</dd></div><div><dt>Illustrative ±15% range</dt><dd>${cash(rangeMin)} – ${cash(rangeMax)} / tCO₂e</dd></div><div><dt>Illustrative sell-back quote — not an actual offer</dt><dd>${cash(sellBack)} / tCO₂e</dd></div><div><dt>Demo available quantity</dt><dd>${available}</dd></div></dl><details class="demo-project-details"><summary>View Project Details</summary><dl><div><dt>Registry</dt><dd>${escapeHtml(project.registry_name)}</dd></div><div><dt>Registry project ID</dt><dd>${escapeHtml(project.registry_project_id)}</dd></div><div><dt>Project proponent in public reference</dt><dd>${escapeHtml(project.project_proponent || 'Not supplied')}</dd></div><div><dt>Project type</dt><dd>${escapeHtml(project.project_type)}</dd></div><div><dt>Relationship / credit status</dt><dd>Canopy does not claim ownership, acquisition, developer relationship, or BCX authorization for this project.</dd></div></dl><section class="risk-price-card"><h3>Risk &amp; Price Information</h3><dl><div><dt>Vintage</dt><dd>${escapeHtml(projectVintage(project))}</dd></div><div><dt>Indicative demo price</dt><dd>${price}</dd></div><div><dt>30-day price change</dt><dd>${escapeHtml(projectPriceChange(project))}</dd></div></dl><p><strong>Key risk:</strong> ${escapeHtml(risk)}</p><small>Carbon credit prices can rise or fall. Historical price movements do not guarantee future prices.</small></section><p><a href="${escapeHtml(project.public_reference_url)}" target="_blank" rel="noopener noreferrer">Open public project reference</a></p><p><a href="${escapeHtml(project.registry_url)}" target="_blank" rel="noopener noreferrer">Open Verra Registry record</a></p><small>${escapeHtml(project.image_attribution)}</small></details>${canTrade ? `<form class="demo-purchase-form" data-project="${project.id}"><label>Demo purchase quantity (tCO₂e)<input name="quantity" type="number" min="0.01" step="0.01" value="0.01" max="${inventory.toFixed(2)}" required></label><dl class="demo-purchase-quote"><div><dt>Credit value</dt><dd data-credit-value>${cash(Number(project.simulated_price_myr) * 0.01)}</dd></div><div><dt>Platform fee (1.5%)</dt><dd data-platform-fee>${cash(Number(project.simulated_price_myr) * 0.01 * 0.015)}</dd></div><div><dt>Total · simulated only</dt><dd data-total>${cash(Number(project.simulated_price_myr) * 0.01 * 1.015)}</dd></div></dl><button class="btn primary" type="submit">Request demo purchase</button></form>` : '<p class="demo-trading-disabled">Demo trading disabled. No price or project availability is implied.</p>'}</div></article>`;
  }

  async function loadSmeListings() {
    const target = $('#smeListings'); if (!target || context.profile?.role !== 'sme') return;
    try {
      const listings = await query('canopy_demo_trade_listings', table => table.select('*').eq('status', 'active').order('created_at', { ascending: false }));
      const names = new Map(projects.map(project => [project.id, project.project_name]));
      const visible = listings.filter(listing => listing.seller_id !== context.profile.id);
      target.innerHTML = `<section class="revenue-section"><h2>SME Listings</h2><p>DEMO ONLY — simulated SME-to-SME trades require Admin approval.</p>${visible.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Quantity</th><th>Price</th><th>Simulated total</th><th></th></tr></thead><tbody>${visible.map(listing => { const value = Number(listing.quantity_tco2e) * Number(listing.unit_price_myr); const fee = value * .015; return `<tr><td>${escapeHtml(names.get(listing.project_id) || listing.project_id)}</td><td>${Number(listing.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${cash(listing.unit_price_myr)} / tCO₂e</td><td>${cash(value + fee)}<small>Includes 1.5% buyer fee · simulated</small></td><td><button class="btn primary" data-trade-buy="${listing.id}">Buy listing</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No other SME demo listings are active.</p>'}</section>`;
      $$('[data-trade-buy]').forEach(button => button.onclick = () => {
        const listing = visible.find(item => item.id === button.dataset.tradeBuy);
        if (!listing) return;
        const projectName = names.get(listing.project_id) || 'Demo project';
        const quantity = Number(listing.quantity_tco2e);
        const unitPrice = Number(listing.unit_price_myr);
        const creditValue = Math.round(quantity * unitPrice * 100) / 100;
        const buyerFee = Math.round(creditValue * 0.015 * 100) / 100;
        const total = creditValue + buyerFee;
        const requestKey = crypto.randomUUID();
        const dialog = modal(`<h2>Confirm SME listing purchase</h2><p><strong>${escapeHtml(projectName)}</strong></p><p>Demo only. Your request requires Admin approval. No real payment or carbon credits.</p><dl class="demo-purchase-quote"><div><dt>Quantity</dt><dd>${quantity.toFixed(2)} tCO₂e</dd></div><div><dt>Unit price</dt><dd>${cash(unitPrice)} / tCO₂e</dd></div><div><dt>Credit value</dt><dd>${cash(creditValue)}</dd></div><div><dt>Buyer transaction fee (1.5%)</dt><dd>${cash(buyerFee)}</dd></div><div><dt>Total simulated payment</dt><dd>${cash(total)}</dd></div></dl><form id="demoTradePurchaseForm" class="dialog-form"><div class="walkthrough-actions"><button class="btn secondary" type="button" id="cancelDemoTradePurchase">Cancel</button><button class="btn primary" type="submit">Request purchase</button></div><p id="demoTradePurchaseResult" class="feedback-message" role="status" aria-live="polite"></p></form>`);
        const opener = button;
        dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true });
        $('#cancelDemoTradePurchase').onclick = () => dialog.close();
        $('#demoTradePurchaseForm').querySelector('[type="submit"]').focus();
        $('#demoTradePurchaseForm').onsubmit = async event => {
          event.preventDefault();
          const submit = event.currentTarget.querySelector('[type="submit"]');
          const feedback = $('#demoTradePurchaseResult');
          submit.disabled = true; submit.textContent = 'Requesting…';
          try {
            await rpc('canopy_request_demo_trade', { p_listing_id: listing.id, p_idempotency_key: requestKey });
            const message = '✓ Demo trade request submitted for Admin approval.';
            feedback.className = 'feedback-message feedback-success'; feedback.textContent = message;
            submit.className = 'account-action-label approved-label'; submit.textContent = '✓ Done';
            context.toast(message, 'success');
            await loadSmeListings();
          } catch (error) {
            submit.disabled = false; submit.className = 'btn primary'; submit.textContent = 'Request purchase';
            feedback.className = 'feedback-message feedback-error'; feedback.textContent = error.message || 'Could not request this demo trade.';
          }
        };
      });
    } catch (error) { target.innerHTML = '<p class="muted">SME Listings are unavailable until Migration 011 is applied.</p>'; }
  }
  function renderMarket() {
    const locations = [...new Set(projects.map(project => locationRegion(project.location)))].sort();
    const categories = [...new Set(projects.map(project => project.category))].sort();
    const types = [...new Set(projects.map(project => project.project_type))].sort();
    const selectOptions = (values, selected) => `<option value="">All</option>${values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
    const previous = { location: $('#demoProjectLocation')?.value || '', category: $('#demoProjectCategory')?.value || '', type: $('#demoProjectType')?.value || '' };
    const search = $('#demoProjectSearch')?.value || '';
    $('#demoProjectCatalog').innerHTML = `<section class="demo-project-market"><div class="page-heading"><div><span class="eyebrow">PUBLIC REGISTRY REFERENCES</span><h1>Malaysian carbon projects</h1><p>Demonstration listings — no real carbon credits sold. Public project facts are linked to their references; prices and inventory below are simulated and are not registry balances.</p></div></div>${demoBadge}<details class="demo-project-details"><summary>Pricing explained</summary><p>The demo reference price helps SMEs compare simulated project pricing. The ±15% range is a proposed Canopy platform rule, not a BCX requirement. A 1.5% transaction fee is shown at checkout. The sell-back quote is illustrative only; no sell-back offer or transaction is available.</p></details><form id="demoProjectFilters" class="demo-project-filters"><label>Search by name<input id="demoProjectSearch" type="search" value="${escapeHtml(search)}" placeholder="Search projects"></label><label>Location<select id="demoProjectLocation">${selectOptions(locations, previous.location)}</select></label><label>Category<select id="demoProjectCategory">${selectOptions(categories, previous.category)}</select></label><label>Project type<select id="demoProjectType">${selectOptions(types, previous.type)}</select></label></form><div class="demo-project-grid">${visibleProjects().map(card).join('') || '<p class="muted">No demonstration projects match these filters.</p>'}</div><div id="smeListings"></div><p id="demoProjectMessage" class="demo-project-message" role="status" aria-live="polite" hidden></p></section>`;
    loadSmeListings();
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
        try { const quantity = Number(input.value); if (firstDemoPurchase) await openFirstPurchaseWizard(project.id, quantity); else { if (context.profile?.verification_status !== 'verified') throw new Error('Your SME account must be verified by Admin before you can submit a simulated purchase request.'); await openPurchaseConfirmation(project, quantity); } }
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
    let body;
    if (step === 1) body = `<label>Choose a demonstration project<select id="wizardProject">${available.map(project => `<option value="${project.id}" ${project.id === selected.id ? 'selected' : ''}>${escapeHtml(project.project_name)} · ${cash(project.simulated_price_myr)} / tCO₂e</option>`).join('')}</select></label>`;
    else if (step === 2) body = `<label>Quantity (tCO₂e)<input id="wizardQuantity" type="number" min="0.01" step="0.01" value="${quantity.toFixed(2)}" required></label><p class="fine-print">Minimum 0.01 tCO₂e. Demo / simulated only.</p>`;
    else { const credit = Math.round(quantity * Number(selected.simulated_price_myr) * 100) / 100; const fee = Math.round(credit * 0.015 * 100) / 100; const total = credit + fee; body = step === 3 ? `<p><strong>${escapeHtml(selected.project_name)}</strong></p><dl class="details"><div><dt>Indicative unit price</dt><dd>${cash(selected.simulated_price_myr)} / tCO₂e</dd></div><div><dt>Sample quantity</dt><dd>${quantity.toFixed(2)} tCO₂e</dd></div><div><dt>Credit value</dt><dd>${cash(credit)}</dd></div><div><dt>Platform fee (1.5%)</dt><dd>${cash(fee)}</dd></div><div><dt>Indicative total</dt><dd>${cash(total)}</dd></div></dl><p class="fine-print"><strong>DEMO / PREVIEW ONLY.</strong> This is a preview of how fractional carbon-credit purchasing works on Canopy. Once your SME account is verified by Admin, you can submit simulated purchase requests through the Marketplace.</p>` : `<p><strong>Preview complete</strong></p><p>This walkthrough did not submit a purchase, check a wallet balance, reserve credits, or create a transaction record.</p><p class="fine-print">You can revisit this walkthrough from <strong>Learn</strong>. Actual simulated purchases remain available only to Admin-verified SMEs through the Marketplace.</p>`; }
    const finalStep = step === 4;
    const dialog = modal(`<h2>First demo purchase</h2><p class="fine-print">Step ${step} of 4 · DEMO / PREVIEW ONLY</p><div class="dialog-form">${body}<div class="walkthrough-actions"><button class="btn secondary" id="wizardSkip" type="button">Skip walkthrough</button>${step > 1 ? '<button class="btn secondary" id="wizardBack" type="button">Back</button>' : ''}<button class="btn primary" id="wizardNext" type="button">${finalStep ? 'Finish walkthrough' : step === 3 ? 'Continue walkthrough' : 'Next'}</button></div></div>`);
    dialog.querySelector('#wizardSkip').onclick = () => { firstDemoPurchase = false; dialog.close(); };
    dialog.querySelector('#wizardBack')?.addEventListener('click', () => openFirstPurchaseWizard(selected.id, quantity, step - 1));
    dialog.querySelector('#wizardNext').onclick = () => { if (finalStep) { firstDemoPurchase = false; dialog.close(); context.toast('✓ Purchase walkthrough complete. No simulated purchase was submitted.', 'success'); return; } const project = available.find(item => item.id === dialog.querySelector('#wizardProject')?.value) || selected; const nextQuantity = Number(dialog.querySelector('#wizardQuantity')?.value || quantity); if (step === 2 && (!Number.isFinite(nextQuantity) || nextQuantity < 0.01 || Math.round(nextQuantity * 100) !== nextQuantity * 100)) { context.toast('Use at least 0.01 tCO₂e in 0.01 increments.', 'error'); return; } openFirstPurchaseWizard(project.id, nextQuantity, step + 1); };
  }
  async function openPurchaseConfirmation(project, initialQuantity) {
    const wallet = await rpc('canopy_demo_wallet_summary');
    const projectImage = project.representative_image_url ? `<img src="${escapeHtml(project.representative_image_url)}" alt="" loading="lazy">` : '<span class="purchase-project-fallback" aria-hidden="true">◒</span>';
    const risk = projectRisk(project);
    const dialog = modal(`<section class="purchase-confirmation"><div class="purchase-modal-title"><div><h2>Purchase carbon credits</h2><p>Demo only — Admin approval is required.</p></div></div><div class="purchase-project"><div class="purchase-project-image">${projectImage}</div><div><strong>${escapeHtml(project.project_name)}</strong><small>${escapeHtml(`${project.registry_name || 'Registry'} ${project.registry_project_id || ''}`.trim())}</small><span>SIMULATED LISTING</span></div></div><p class="fine-print">No real payment or carbon-credit purchase. An approved request creates a simulated allocation in your holdings.</p><form id="demoPurchaseConfirm" class="dialog-form"><label>Quantity <small>(tCO₂e)</small><input name="quantity" type="number" min="0.01" step="0.01" value="${Number(initialQuantity).toFixed(2)}" required></label><dl class="details purchase-support"><div><dt>Simulated unit price</dt><dd>${cash(project.simulated_price_myr)} / tCO₂e</dd></div><div><dt>Demo RM Wallet</dt><dd id="walletBalance">${cash(wallet.balance_myr)}</dd></div></dl><dl class="purchase-breakdown"><div><dt>Credit value</dt><dd id="confirmCreditValue"></dd></div><div><dt>Platform fee (1.5%)</dt><dd id="confirmFee"></dd></div><div class="purchase-total"><dt>Total simulated payment</dt><dd id="confirmTotal"></dd></div></dl><p class="purchase-risk-reminder"><span aria-hidden="true">ⓘ</span><span><strong>Key risk:</strong> ${escapeHtml(risk)} Carbon credit prices can rise or fall.</span></p><div class="purchase-actions"><button class="btn secondary" type="button" data-purchase-close>Cancel</button><button class="btn primary" type="submit">Confirm demo purchase</button></div><p id="demoPurchaseResult" class="feedback-message" aria-live="polite"></p></form></section>`);
    dialog.querySelector('[data-purchase-close]').onclick = () => dialog.close();

    const form = dialog.querySelector('#demoPurchaseConfirm');
    const input = form.elements.quantity;
    const submit = form.querySelector('button[type="submit"]');
    const result = dialog.querySelector('#demoPurchaseResult');
    const updateQuote = () => {
      const quantity = Number(input.value || 0); const credit = Math.round(quantity * Number(project.simulated_price_myr) * 100) / 100; const fee = Math.round(credit * 0.015 * 100) / 100; const total = credit + fee;
      dialog.querySelector('#confirmCreditValue').textContent = cash(credit); dialog.querySelector('#confirmFee').textContent = cash(fee); dialog.querySelector('#confirmTotal').textContent = cash(total);
      const scaledQuantity = quantity * 100;
      const valid = Number.isFinite(quantity) && quantity >= 0.01 && Math.abs(scaledQuantity - Math.round(scaledQuantity)) < 1e-8;
      const enough = Number(wallet.balance_myr) >= total;
      const validationMessage = !valid ? 'Use at least 0.01 tCO₂e in 0.01 increments.' : !enough ? 'Insufficient Demo RM Wallet balance. Open Demo RM Wallet to add demo funds.' : '';
      submit.disabled = !valid || !enough;
      result.className = `feedback-message${validationMessage ? ' feedback-error' : ''}`;
      result.textContent = validationMessage;
      result.hidden = !validationMessage;
    };
    input.addEventListener('input', updateQuote); updateQuote();
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return; submit.disabled = true; submit.textContent = 'Submitting…'; result.textContent = '';
      try {
        const request = await rpc('canopy_request_demo_purchase', { p_project_id: project.id, p_quantity: Number(input.value) });
        result.hidden = false; result.className = 'feedback-message feedback-success'; result.textContent = '✓ Demo purchase request submitted successfully! Pending Admin approval.';
        submit.textContent = 'Submitted';
        firstDemoPurchase = false; context.toast('✓ Demo purchase request submitted successfully! Pending Admin approval.', 'success');
        await mount('market', context);
      } catch (error) { submit.disabled = false; submit.textContent = 'Confirm Demo Purchase'; result.hidden = false; result.className = 'feedback-message feedback-error'; result.textContent = error?.message || 'Could not submit this demo purchase.'; }
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

  function retirementStatus(value) {
    return ({ requested: 'Requested', processing: 'Processing', completed: 'Completed (Demo)', rejected: 'Rejected', failed: 'Failed', voided: 'Voided' })[value] || value;
  }
  function retirementQrDataUrl(verificationUrl) {
    if (typeof window.qrcode !== 'function') throw new Error('Local QR-code support is unavailable. Please refresh the app and try again.');
    const code = window.qrcode(0, 'M');
    code.addData(verificationUrl, 'Byte');
    code.make();
    return code.createDataURL(8, 0);
  }
  async function downloadRetirementStatement(row, project) {
    if (!window.jspdf?.jsPDF) throw new Error('Local PDF support is unavailable. Please refresh the app and try again.');
    const verificationUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}verify.html?ref=${encodeURIComponent(row.statement_reference)}`;
    const qrData = retirementQrDataUrl(verificationUrl);
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    // jsPDF's bundled standard fonts use WinAnsi encoding and cannot render U+2082 reliably.
    // Compose tCO₂e with a positioned numeral so the PDF remains portable without a new font.
    const drawTco2e = (x, y, quantity) => {
      const amount = Number(quantity).toFixed(2);
      doc.setFontSize(11); doc.text(`${amount} tCO`, x, y);
      const subscriptX = x + doc.getTextWidth(`${amount} tCO`);
      doc.setFontSize(7); doc.text('2', subscriptX, y + 2.5);
      const suffixX = subscriptX + doc.getTextWidth('2');
      doc.setFontSize(11); doc.text('e', suffixX, y);
    };
    doc.setFillColor(27, 81, 61); doc.rect(0, 0, 595, 86, 'F'); doc.setTextColor(255,255,255); doc.setFontSize(24); doc.text('canopy',42,52);
    doc.setTextColor(27,59,46); doc.setFontSize(23); doc.text('Canopy Retirement Statement',42,126); doc.setFontSize(10); doc.setTextColor(90,112,99); doc.text('DEMONSTRATION ONLY — simulated retirement; not an official registry certificate or evidence of verified emissions reduction.',42,149,{maxWidth:500});
    const lines=[['Statement reference',row.statement_reference],['Beneficiary',row.beneficiary_name],['Project',project?.project_name||'Demonstration project'],['Registry reference',project ? `${project.registry_name} ${project.registry_project_id}` : 'Not available'],['Quantity retired',row.quantity_tco2e],['Purpose',row.retirement_purpose||'Not supplied'],['Requested date',date(row.requested_at)],['Completed date',date(row.completed_at||row.requested_at)],['Status','Completed (Demo)'],['Pool reference',row.pool_reference||'Not applicable']];
    let y=190; lines.forEach(([label,value], index) => { if (index % 2 === 0) { doc.setFillColor(246,249,245); doc.rect(36,y-17,348,25,'F'); } doc.setFontSize(9); doc.setTextColor(90,112,99); doc.text(label,44,y); doc.setFontSize(11); doc.setTextColor(27,59,46); if (label === 'Quantity retired') drawTco2e(166, y, value); else if (label === 'Project') { const projectWidth=216; const fittedSize=Math.min(11, 11 * projectWidth / doc.getTextWidth(String(value))); doc.setFontSize(fittedSize); doc.text(String(value),166,y); } else doc.text(String(value),166,y,{maxWidth:216}); y+=28; });
    doc.addImage(qrData,'PNG',396,454,132,132); doc.setFontSize(9); doc.setTextColor(90,112,99); doc.text('Scan to verify this public demonstration record',462,606,{maxWidth:150,align:'center'}); doc.setFontSize(8); doc.text(verificationUrl,42,642,{maxWidth:500});
    doc.setDrawColor(199,216,201); doc.line(42,682,553,682); doc.setFontSize(9); doc.setTextColor(90,112,99); doc.text('This statement records a Canopy DEMO / SIMULATED retirement only. It does not transfer, retire, or verify real carbon credits and does not create registry-backed ownership.',42,704,{maxWidth:510});
    doc.save(`Canopy_Retirement_Statement_${row.statement_reference}.pdf`);
  }
  function openRetirementDialog(project, available, companyName) {
    const dialog=modal(`<section class="retirement-dialog"><h2>Retire simulated credits</h2><p><strong>${escapeHtml(project.project_name)}</strong><br><small>${escapeHtml(`${project.registry_name} ${project.registry_project_id}`)}</small></p><p class="fine-print">DEMO / SIMULATED only. No real carbon credits, registry retirement, payment, or verified emissions reduction is created.</p><form id="demoRetirementForm" class="dialog-form"><dl class="details"><div><dt>Available to retire</dt><dd>${available.toFixed(2)} tCO₂e</dd></div><div><dt>Illustrative retirement fee</dt><dd id="retirementFee">USD 0.00 <small>informational only</small></dd></div></dl><label>Quantity to retire (tCO₂e)<input name="quantity" type="number" min="0.01" max="${available.toFixed(2)}" step="0.01" value="0.01" required></label><label>Beneficiary name<input name="beneficiary" value="${escapeHtml(companyName||'')}" minlength="2" required></label><label>Retirement purpose <small>(optional)</small><textarea name="purpose" placeholder="e.g. 2026 operational emissions"></textarea></label><div class="retirement-summary"><span>Remaining available balance</span><strong id="retirementRemaining"></strong></div><p id="retirementFractionNote" class="fine-print"></p><label class="ack"><input name="confirm" type="checkbox" required> <span><strong>Retirement is permanent.</strong> Retired credits cannot be sold, transferred or used again.</span></label><div class="purchase-actions"><button class="btn secondary" type="button" data-retirement-close>Cancel</button><button class="btn primary" type="submit">Submit retirement request</button></div><p id="retirementResult" class="feedback-message" aria-live="polite" hidden></p></form></section>`);
    const form=dialog.querySelector('#demoRetirementForm'),qty=form.elements.quantity,submit=form.querySelector('[type="submit"]'),result=dialog.querySelector('#retirementResult'); const preview=()=>{const amount=Number(qty.value||0),valid=Number.isFinite(amount)&&amount>=.01&&amount<=available&&Math.abs(amount*100-Math.round(amount*100))<1e-8;dialog.querySelector('#retirementFee').innerHTML=`USD ${(Math.max(0,amount)*.02).toFixed(2)} <small>informational only — no Demo RM Wallet deduction</small>`;dialog.querySelector('#retirementRemaining').textContent=valid?`${(available-amount).toFixed(2)} tCO₂e`:'Enter a valid quantity';dialog.querySelector('#retirementFractionNote').textContent=valid&&amount<1?'Fractional retirements receive a Canopy Retirement Statement. In a future live implementation, whole-tonne registry retirement may support official registry documentation. You may increase to 1.00 tCO₂e, but this is optional.':'A completed request creates a Canopy simulated retirement confirmation, not an official registry certificate.';submit.disabled=!valid;}; qty.addEventListener('input',preview);preview();dialog.querySelector('[data-retirement-close]').onclick=()=>dialog.close();
    form.onsubmit=async event=>{event.preventDefault();const amount=Number(qty.value);if(submit.disabled||!form.elements.confirm.checked){result.hidden=false;result.className='feedback-message feedback-error';result.textContent='Confirm the permanent simulated retirement and enter a valid quantity.';return;}submit.disabled=true;submit.textContent='Submitting…';result.hidden=true;try{await rpc('canopy_request_demo_retirement',{p_project_id:project.id,p_quantity:amount,p_beneficiary_name:form.elements.beneficiary.value,p_retirement_purpose:form.elements.purpose.value||null,p_idempotency_key:`retirement:${crypto.randomUUID()}`});dialog.close();context.toast('✓ Simulated retirement request submitted for Admin review.','success');await mount('holdings',context);}catch(error){submit.disabled=false;submit.textContent='Submit retirement request';result.hidden=false;result.className='feedback-message feedback-error';result.textContent=error?.message||'Could not submit this retirement request.';}};
  }

  async function holdingsView() {
    let contribution = null; let retirementRequests = []; let retirementLoadError = false;
    try { contribution = await rpc('canopy_sme_purchase_contribution'); } catch (_) { /* Migration 013 may not be applied yet. */ }
    try { retirementRequests = await query('canopy_demo_retirement_requests', table => table.select('*').order('requested_at', { ascending: false })); }
    catch (_) { retirementLoadError = true; }
    const [ledger, catalogue, listings, trades, purchases, buyerTrades] = await Promise.all([
      query('canopy_demo_entitlement_ledger', table => table.select('project_id,delta_tco2e,created_at').order('created_at', { ascending: false })),
      query('canopy_demo_projects', table => table.select('id,project_name,registry_name,registry_project_id,simulated_price_myr').order('project_name')),
      query('canopy_demo_trade_listings', table => table.select('*').eq('seller_id', context.profile.id).order('created_at', { ascending: false })),
      query('canopy_demo_trade_requests', table => table.select('id,listing_id,status,quantity_tco2e,credit_value_myr,created_at,reviewed_at').eq('seller_id', context.profile.id).order('created_at', { ascending: false })),
      query('canopy_demo_purchase_requests', table => table.select('quantity_tco2e,request_status,reviewed_at,created_at').order('created_at', { ascending: false })),
      query('canopy_demo_trade_requests', table => table.select('quantity_tco2e,status,reviewed_at,created_at').eq('buyer_id', context.profile.id).order('created_at', { ascending: false }))
    ]);
    const projectNames = new Map(catalogue.map(project => [project.id, project])); const balances = new Map();
    ledger.forEach(entry => balances.set(entry.project_id, (balances.get(entry.project_id) || 0) + Number(entry.delta_tco2e || 0)));
    const rows = [...balances.entries()].filter(([, quantity]) => quantity > 0.00001);
    const pendingListingIds = new Set(trades.filter(trade => trade.status === 'pending_admin_review').map(trade => trade.listing_id));
    const statusName = value => ({ active: 'Active', sold: 'Sold (Demo)', cancelled: 'Cancelled', pending_admin_review: 'Pending Admin Review', approved_demo: 'Approved (Demo)', rejected: 'Rejected' })[value] || value;
    const statusMarkup = value => `<span class="status ${escapeHtml(String(value).replace(/[^a-z0-9-]/gi, '-').toLowerCase())}">${escapeHtml(statusName(value))}</span>`;
    const activeListings = listings.filter(listing => listing.status === 'active'); const sales = trades.filter(trade => trade.status === 'approved_demo'); const listedByProject = new Map(); activeListings.forEach(listing => listedByProject.set(listing.project_id, (listedByProject.get(listing.project_id) || 0) + Number(listing.quantity_tco2e || 0)));
    const activityByDay = new Map(); const activityByMonth = new Map();
    const approvedActivity = [...purchases.filter(row => row.request_status === 'approved_demo'), ...buyerTrades.filter(row => row.status === 'approved_demo')];
    approvedActivity.forEach(row => { const timestamp = row.reviewed_at || row.created_at; if (timestamp) { const quantity = Number(row.quantity_tco2e || 0); const day = malaysiaDay(timestamp); const month = malaysiaMonth(timestamp); activityByDay.set(day, (activityByDay.get(day) || 0) + quantity); activityByMonth.set(month, (activityByMonth.get(month) || 0) + quantity); } });
    const malaysiaToday = new Date(`${malaysiaDay(new Date())}T00:00:00Z`);
    const activity = Array.from({ length: 7 }, (_, index) => { const day = new Date(malaysiaToday); day.setUTCDate(day.getUTCDate() - 6 + index); const key = day.toISOString().slice(0, 10); return { label: key.slice(5), value: activityByDay.get(key) || 0 }; });
    const thisMonth = malaysiaMonth(new Date()); const [year, month] = thisMonth.split('-').map(Number);
    const monthlyActivity = Array.from({ length: 7 }, (_, index) => { const dateValue = new Date(Date.UTC(year, month - 1 - (6 - index), 1)); const key = dateValue.toISOString().slice(0, 7); return { label: new Intl.DateTimeFormat('en-MY', { month: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(dateValue), value: activityByMonth.get(key) || 0 }; });
    const portfolio = rows.map(([projectId, quantity]) => ({ label: projectNames.get(projectId)?.project_name || projectId, value: quantity }));
    const totalHeld = rows.reduce((sum, [, quantity]) => sum + quantity, 0);
    const totalListed = [...listedByProject.values()].reduce((sum, quantity) => sum + Number(quantity || 0), 0);
    const holdingsSummary = `<section class="holdings-summary" aria-label="Simulated holdings summary"><article><span>Total simulated holdings</span><strong>${totalHeld.toFixed(2)} <small>tCO₂e</small></strong></article><article><span>Listed / reserved</span><strong>${totalListed.toFixed(2)} <small>tCO₂e</small></strong></article><article><span>Available to sell</span><strong>${Math.max(0, totalHeld - totalListed).toFixed(2)} <small>tCO₂e</small></strong></article></section>`;
    const contributionAvailable = contribution?.comparison_available === true;
    const contributionChart = contributionAvailable ? `<p class="contribution-amount"><strong>${Number(contribution.my_purchase_tco2e || 0).toFixed(2)} tCO₂e</strong><span>my approved simulated purchase activity</span></p>${miniShareDoughnut(contribution.my_approximate_percentage)}<p class="contribution-caption">Approximate share: ${Number(contribution.my_approximate_percentage || 0)}%</p>` : '<p class="muted">Insufficient aggregated data for a privacy-safe comparison.</p>';
    const dashboardCharts = `<section class="revenue-section holdings-dashboard"><h2>Simulated portfolio overview</h2><p class="revenue-note">DEMO / SIMULATED holdings and approved purchase activity only — not real carbon credits, environmental impact, or emissions reductions.</p><div class="metric-grid"><article><h3>Portfolio by project</h3>${miniDoughnut(portfolio, 'Simulated portfolio by project')}</article><article class="activity-card"><h3>Approved purchases · 7 days</h3>${miniBars(activity, 'Approved simulated purchase activity over the last seven days')}<div class="monthly-activity"><h4>Approved purchases · 7 months</h4><p>tCO₂e of approved simulated purchases</p>${miniBars(monthlyActivity, 'Approved simulated purchase activity over the last seven months', '#8cab76')}</div></article><article><h3>My simulated purchase contribution</h3><p class="revenue-note">Approved project purchases and SME-to-SME buys only. This is activity, not current holdings.</p>${contributionChart}</article></div></section>`;
    const retirementHistory = retirementLoadError ? '<p class="muted">Retirement history is temporarily unavailable. Your holdings and trading data remain available.</p>' : retirementRequests.length ? `<div class="table-wrap"><table><thead><tr><th>Statement</th><th>Project</th><th>Quantity</th><th>Status</th><th>Requested</th><th></th></tr></thead><tbody>${retirementRequests.map(row => `<tr><td>${escapeHtml(row.statement_reference)}</td><td>${escapeHtml(projectNames.get(row.project_id)?.project_name || row.project_id)}</td><td>${Number(row.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${statusMarkup(row.status)}</td><td>${date(row.requested_at)}</td><td>${row.status==='completed' ? `<button class="btn secondary" data-retirement-statement="${row.id}">Download statement</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No simulated retirement requests yet.</p>';
    $('#demoProjectCatalog').innerHTML = `<div class="page-heading"><div><span class="eyebrow">SIMULATED PORTFOLIO</span><h1>My demo carbon holdings</h1><p>Approved demo allocations only. These are not real carbon credits, registry balances, certificates, or ownership records.</p></div></div>${demoBadge}${holdingsSummary}${dashboardCharts}${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Registry reference</th><th>Total held</th><th>Listed / reserved</th><th>Available to sell</th><th></th></tr></thead><tbody>${rows.map(([projectId, quantity]) => { const project = projectNames.get(projectId); return `<tr><td>${escapeHtml(project?.project_name || projectId)}</td><td>${escapeHtml(project ? `${project.registry_name} ${project.registry_project_id}` : '—')}</td><td>${quantity.toFixed(2)} tCO₂e</td><td>${Number(listedByProject.get(projectId) || 0).toFixed(2)} tCO₂e</td><td>${Math.max(0, quantity - Number(listedByProject.get(projectId) || 0)).toFixed(2)} tCO₂e</td><td class="row-actions"><button class="btn secondary" data-trade-list="${projectId}" data-trade-max="${Math.max(0, quantity - Number(listedByProject.get(projectId) || 0))}" ${quantity - Number(listedByProject.get(projectId) || 0) < .01 ? 'disabled' : ''}>Sell</button><button class="btn primary" data-retire="${projectId}" data-retire-max="${Math.max(0, quantity - Number(listedByProject.get(projectId) || 0))}" ${quantity - Number(listedByProject.get(projectId) || 0) < .01 ? 'disabled' : ''}>Retire</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><h3>No approved demo allocations yet</h3><p>Top up your Demo RM Wallet, submit a simulated purchase request, and wait for Admin review.</p></div>'}<section class="revenue-section"><h2>Retirement history</h2><p>DEMO / SIMULATED only. Retirement reservations are excluded from available holdings while Admin review is pending.</p>${retirementHistory}</section><section class="revenue-section"><h2>My active SME sell listings</h2><p>DEMO / SIMULATED only. A pending buyer request prevents cancellation.</p>${activeListings.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Quantity</th><th>Unit price</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${activeListings.map(listing => `<tr><td>${escapeHtml(projectNames.get(listing.project_id)?.project_name || listing.project_id)}</td><td>${Number(listing.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${cash(listing.unit_price_myr)} / tCO₂e</td><td>${statusMarkup(pendingListingIds.has(listing.id) ? 'pending_admin_review' : listing.status)}</td><td>${date(listing.created_at)}</td><td><button class="btn danger" data-trade-cancel="${listing.id}" ${pendingListingIds.has(listing.id) ? 'disabled title="A buyer request is pending Admin review"' : ''}>Cancel</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No active SME sell listings.</p>'}</section><section class="revenue-section"><h2>Completed demo sales</h2>${sales.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Quantity</th><th>Demo sale proceeds</th><th>Status</th><th>Reviewed</th></tr></thead><tbody>${sales.map(trade => `<tr><td>${escapeHtml(projectNames.get(listings.find(listing => listing.id === trade.listing_id)?.project_id)?.project_name || 'Project')}</td><td>${Number(trade.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${cash(trade.credit_value_myr)} <small>Demo only</small></td><td>${statusMarkup(trade.status)}</td><td>${date(trade.reviewed_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No completed demo sales.</p>'}</section>`;
    $$('[data-retire]').forEach(button => button.onclick = () => { if (retirementLoadError) return context.toast('Retirement services are temporarily unavailable. Your holdings remain unchanged.', 'error'); const project = projectNames.get(button.dataset.retire); const available = Number(button.dataset.retireMax || 0); if (!project || available < .01) return context.toast('No available simulated holdings can be retired.', 'error'); openRetirementDialog(project, available, context.profile.company_name); });
    $$('[data-retirement-statement]').forEach(button => button.onclick = async () => { const row = retirementRequests.find(item => item.id === button.dataset.retirementStatement); if (!row) return; button.disabled=true; try { await downloadRetirementStatement(row, projectNames.get(row.project_id)); context.toast('✓ Canopy Retirement Statement download started.', 'success'); } catch (error) { console.error('Canopy retirement statement generation failed:', error, { hasJsPdf: Boolean(window.jspdf?.jsPDF), hasQrCode: typeof window.qrcode === 'function', statementReference: row.statement_reference }); context.toast(error?.message || 'Could not generate the retirement statement.', 'error'); } finally { button.disabled=false; } });
    $$('[data-trade-list]').forEach(button => button.onclick = () => {
      const projectId = button.dataset.tradeList; const project = projectNames.get(projectId); const totalHeld = Number(balances.get(projectId) || 0); const reserved = Number(listedByProject.get(projectId) || 0); const maximum = Number(button.dataset.tradeMax); const referencePrice = Number(project?.simulated_price_myr || 0); const low = referencePrice * .85; const high = referencePrice * 1.15;
      if (!project || !Number.isFinite(referencePrice) || referencePrice <= 0) return context.toast('The simulated reference price is unavailable for this project.', 'error');
      const dialog = modal(`<h2>Create simulated sell listing</h2><p><strong>${escapeHtml(project.project_name)}</strong><br><small>${escapeHtml(`${project.registry_name} ${project.registry_project_id}`)}</small></p><p class="fine-print">DEMO / SIMULATED only — no real carbon credits, money, or BCX trade. The ±15% range is a proposed platform pricing guideline, not an official BCX requirement.</p><dl class="details"><div><dt>Total simulated holdings</dt><dd>${totalHeld.toFixed(2)} tCO₂e</dd></div><div><dt>Already listed / reserved</dt><dd>${reserved.toFixed(2)} tCO₂e</dd></div><div><dt>Available to sell</dt><dd>${maximum.toFixed(2)} tCO₂e</dd></div><div><dt>Simulated reference price</dt><dd>${cash(referencePrice)} / tCO₂e</dd></div><div><dt>Proposed ±15% range</dt><dd>${cash(low)}–${cash(high)} / tCO₂e</dd></div></dl><form id="demoSellListingForm" class="dialog-form"><label>Quantity to sell (tCO₂e)<input name="quantity" type="number" min="0.01" max="${maximum.toFixed(2)}" step="0.01" value="0.01" required></label><label>Selling price per tCO₂e (RM)<input name="price" type="number" min="0.01" step="0.01" value="${referencePrice.toFixed(2)}" required></label><p id="demoSellEstimate" class="revenue-note"></p><p id="demoSellGuidance" class="revenue-note" aria-live="polite"></p><div class="walkthrough-actions"><button class="btn secondary" id="cancelDemoSellListing" type="button">Cancel</button><button class="btn primary" type="submit">Create sell listing</button></div><p id="demoSellResult" class="feedback-message" aria-live="polite"></p></form>`);
      const form = dialog.querySelector('#demoSellListingForm'); const result = dialog.querySelector('#demoSellResult'); const estimate = dialog.querySelector('#demoSellEstimate'); const guidance = dialog.querySelector('#demoSellGuidance'); const refreshSalePreview = () => { const values = new FormData(form); const quantity = Number(values.get('quantity')); const price = Number(values.get('price')); estimate.textContent = Number.isFinite(quantity) && Number.isFinite(price) && quantity >= 0 && price >= 0 ? `Estimated simulated sale proceeds: ${cash(quantity * price)}` : 'Enter a valid quantity and price.'; const inside = Number.isFinite(price) && price >= low && price <= high; guidance.className = `revenue-note${inside ? ' feedback-success' : ' feedback-error'}`; guidance.textContent = inside ? 'Within the proposed ±15% pricing guideline.' : 'Outside the proposed ±15% pricing guideline. This is guidance only.'; };
      form.querySelectorAll('input').forEach(input => input.addEventListener('input', refreshSalePreview)); refreshSalePreview(); dialog.querySelector('#cancelDemoSellListing').onclick = () => dialog.close();
      form.onsubmit = async event => { event.preventDefault(); const values = new FormData(form); const quantity = Number(values.get('quantity')); const price = Number(values.get('price')); if (!Number.isFinite(quantity) || quantity < .01 || quantity > maximum || !Number.isFinite(price) || price <= 0) { result.className = 'feedback-message feedback-error'; result.textContent = `Enter 0.01–${maximum.toFixed(2)} tCO₂e and a positive selling price.`; return; } const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Creating…'; try { await rpc('canopy_create_demo_trade_listing', { p_project_id: projectId, p_quantity: quantity, p_unit_price: price }); dialog.close(); context.toast('✓ Demo sell listing created.', 'success'); await mount('holdings', context); } catch (error) { submit.disabled = false; submit.textContent = 'Create sell listing'; result.className = 'feedback-message feedback-error'; result.textContent = error?.message || 'Could not create the demo sell listing.'; } };
    });
    $$('[data-trade-cancel]').forEach(button => button.onclick = async () => { if (!window.confirm('Cancel this DEMO / SIMULATED sell listing?')) return; button.disabled=true; try { await rpc('canopy_cancel_demo_trade_listing',{p_listing_id:button.dataset.tradeCancel}); context.toast('✓ Demo sell listing cancelled.','success'); await mount('holdings',context); } catch(error) { button.disabled=false; context.toast(error.message||'Could not cancel this demo listing.','error'); } });
  }
  async function requestsView() {
    const [demoRequests, demoTrades, demoProjects] = await Promise.all([
      query('canopy_demo_purchase_requests', table => table.select('id,project_id,quantity_tco2e,request_status,created_at').order('created_at', { ascending: false })),
      query('canopy_demo_trade_requests', table => table.select('id,project_id,quantity_tco2e,status,unit_price_myr,total_myr,created_at').eq('buyer_id', context.profile.id).order('created_at', { ascending: false })),
      query('canopy_demo_projects', table => table.select('id,project_name'))
    ]);
    const demoProjectNames = new Map(demoProjects.map(project => [project.id, project.project_name])); const legacyProjectNames = new Map((context.projects || []).map(project => [project.id, project.name]));
    const statusName = value => ({ pending_admin_review: 'Pending Admin Review', approved_demo: 'Approved (Demo)', rejected: 'Rejected' })[value] || value;
    const statusMarkup = value => `<span class="status ${escapeHtml(String(value).toLowerCase().replace(/[^a-z0-9-]/g, '-'))}">${escapeHtml(statusName(value))}</span>`;
    const rows = [...demoRequests.map(request => ({ ...request, kind: 'Demo project purchase', project_name: demoProjectNames.get(request.project_id) || request.project_id, status: request.request_status, demo: true })), ...demoTrades.map(trade => ({ ...trade, kind: 'SME-to-SME demo trade', project_name: demoProjectNames.get(trade.project_id) || trade.project_id, demo: true })), ...(context.requests || []).map(request => ({ ...request, kind: request.request_type || 'Request', project_name: legacyProjectNames.get(request.project_id) || request.project_id, status: request.status, demo: false }))].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    $('#demoProjectCatalog').innerHTML = `<div class="page-heading"><div><span class="eyebrow">ACTIVITY</span><h1>My requests</h1><p>Track your submitted requests. Demo only — no real carbon credits.</p></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Request type</th><th>Project</th><th>Quantity</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.kind)}${row.demo ? '<small>Demo only</small>' : ''}</td><td>${escapeHtml(row.project_name || 'Project')}</td><td>${Number(row.quantity_tco2e || 0).toFixed(2)} tCO₂e</td><td>${statusMarkup(row.status)}</td><td>${date(row.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h3>Nothing here yet</h3><p>Your demo and other submitted requests will appear here.</p></div>'}`;
  }
  async function adminRetirementsView() {
    const [retirements, catalogue, pools, profiles] = await Promise.all([
      query('canopy_demo_retirement_requests', table => table.select('*').order('requested_at', { ascending: false })),
      query('canopy_demo_projects', table => table.select('id,project_name').order('project_name')),
      query('canopy_demo_retirement_pools', table => table.select('*').order('created_at', { ascending: false })),
      query('profiles', table => table.select('id,company_name'))
    ]);
    const names = new Map(catalogue.map(project => [project.id, project.project_name])); const companies = new Map(profiles.map(person => [person.id, person.company_name]));
    const badge = value => '<span class="status '+escapeHtml(String(value).replace(/[^a-z0-9-]/gi, '-').toLowerCase())+'">'+escapeHtml(retirementStatus(value))+'</span>';
    const rows = retirements.map(row => '<tr><td>'+escapeHtml(row.statement_reference)+'</td><td>'+escapeHtml(companies.get(row.user_id)||'SME')+'</td><td>'+escapeHtml(names.get(row.project_id)||row.project_id)+'</td><td>'+Number(row.quantity_tco2e).toFixed(2)+' tCO₂e</td><td>'+badge(row.status)+'</td><td>'+date(row.requested_at)+'</td><td class="row-actions">'+(['requested','processing'].includes(row.status) ? '<button class="btn primary" data-retirement-review="approve" data-retirement-id="'+row.id+'">Complete</button><button class="btn danger" data-retirement-review="reject" data-retirement-id="'+row.id+'">Reject</button>' : '—')+'</td></tr>').join('');
    const poolRows = pools.map(pool => '<tr><td>'+escapeHtml(pool.pool_reference)+'</td><td>'+escapeHtml(names.get(pool.project_id)||pool.project_id)+'</td><td>'+Number(pool.total_tco2e).toFixed(2)+' / 1.00 tCO₂e</td><td>'+badge(pool.status)+'</td></tr>').join('');
    $('#demoProjectCatalog').innerHTML='<div class="page-heading"><div><span class="eyebrow">DEMONSTRATION OVERSIGHT</span><h1>Retirements & certificates</h1><p>Admin-reviewed simulated retirements only. No real registry retirement, payment, or certificate is produced.</p></div></div><section class="holdings-summary"><article><span>Pending review</span><strong>'+retirements.filter(row => ['requested','processing'].includes(row.status)).length+'</strong></article><article><span>Completed retirements</span><strong>'+retirements.filter(row=>row.status==='completed').length+'</strong></article><article><span>Completed fractional pools</span><strong>'+pools.filter(pool=>pool.status==='completed').length+'</strong></article></section><section class="revenue-section"><h2>Retirement requests</h2>'+(rows?'<div class="table-wrap"><table><thead><tr><th>Statement</th><th>SME</th><th>Project</th><th>Quantity</th><th>Status</th><th>Requested</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="muted">No simulated retirement requests.</p>')+'</section><section class="revenue-section"><h2>Fractional retirement pools</h2>'+(poolRows?'<div class="table-wrap"><table><thead><tr><th>Pool</th><th>Project</th><th>Total</th><th>Status</th></tr></thead><tbody>'+poolRows+'</tbody></table></div>':'<p class="muted">No fractional pools have been created.</p>')+'</section>';
    $$('[data-retirement-review]').forEach(button => button.onclick = () => { const row = retirements.find(item => item.id === button.dataset.retirementId); const decision = button.dataset.retirementReview; const dialog = modal('<h2>'+(decision==='approve'?'Complete':'Reject')+' simulated retirement</h2><p>'+escapeHtml(names.get(row?.project_id)||'Project')+' · '+Number(row?.quantity_tco2e||0).toFixed(2)+' tCO₂e</p><p class="fine-print">DEMO / SIMULATED only. '+(decision==='approve'?'Completion permanently retires the reserved simulated holdings.':'Rejection releases the reserved simulated holdings.')+'</p><form id="retirementReviewForm" class="dialog-form"><label>Admin review note<textarea name="note" minlength="3" required></textarea></label><div class="purchase-actions"><button class="btn secondary" type="button" data-retirement-review-cancel>Cancel</button><button class="btn '+(decision==='approve'?'primary':'danger')+'" type="submit">'+(decision==='approve'?'Complete retirement':'Reject retirement')+'</button></div><p id="retirementReviewResult" class="feedback-message" hidden></p></form>'); dialog.querySelector('[data-retirement-review-cancel]').onclick=()=>dialog.close(); dialog.querySelector('#retirementReviewForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,note=form.elements.note.value.trim(),submit=form.querySelector('[type="submit"]'),result=form.querySelector('#retirementReviewResult');if(note.length<3)return;submit.disabled=true;submit.textContent='Saving…';try{await rpc('canopy_admin_review_demo_retirement',{p_admin_id:context.profile.id,p_request_id:row.id,p_decision:decision,p_note:note});dialog.close();context.toast('✓ Simulated retirement '+(decision==='approve'?'completed':'rejected')+'.','success');await mount('retirements',context);}catch(error){submit.disabled=false;result.hidden=false;result.className='feedback-message feedback-error';result.textContent=error?.message||'Could not review this retirement.';}}; });
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
      } else if (view === 'retirements') {
        await adminRetirementsView();
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
