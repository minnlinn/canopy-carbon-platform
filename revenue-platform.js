'use strict';

(() => {
  const cash = value => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => value ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  let context;

  function content(html) { document.querySelector('#content').innerHTML = html; }
  function modal(html) {
    const dialog = document.querySelector('#actionDialog');
    document.querySelector('#dialogBody').innerHTML = html;
    dialog.showModal();
    dialog.querySelector('.close').onclick = () => dialog.close();
    return dialog;
  }
  function status(value) { return `<span class="status ${escapeHtml(String(value || 'pending').toLowerCase().replace(/[^a-z0-9-]/g, '-'))}">${escapeHtml(value || 'Pending')}</span>`; }
  function showError(error) { context.toast(error?.message || 'Could not load this section.', 'error'); }
  function walletTypeLabel(row) { if (row.transaction_type === 'billing_payment') return /esg|report/i.test(row.note || '') ? 'ESG report payment' : 'Subscription payment'; return ({ top_up: 'Demo top-up', purchase_reserve: 'Purchase reservation', purchase_refund: 'Purchase refund', trade_reserve: 'SME trade reservation', trade_refund: 'SME trade refund', trade_sale_proceeds: 'SME trade sale proceeds' })[row.transaction_type] || row.transaction_type; }
  async function query(table, builder) {
    const result = await builder(context.db.from(table));
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function rpc(name, args = {}) {
    const { data, error } = await context.db.rpc(name, args);
    if (error) throw error;
    return data;
  }
  const isActive = subscription => subscription && ['active', 'active_demo'].includes(subscription.status) && (!subscription.renewal_at || new Date(subscription.renewal_at) > new Date());
  const demoLabel = '<span class="revenue-demo-label">SANDBOX / DEMO · NO MONEY COLLECTED</span>';
  function chartBars(items, label) { const peak=Math.max(0,...items.map(item=>Number(item.value||0))); if (!peak) return '<p class="muted">No confirmed simulated activity yet.</p>'; const gap=8, width=640, bar=Math.max(12,(width-48-gap*(items.length-1))/items.length); return `<svg viewBox="0 0 640 190" role="img" aria-label="${escapeHtml(label)}" style="width:100%;height:auto;display:block">${items.map((item,index)=>{const value=Math.max(0,Number(item.value||0)), h=Math.max(value?4:0,value/peak*122), x=24+index*(bar+gap), y=142-h; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#2e7657"></rect><text x="${(x+bar/2).toFixed(1)}" y="${Math.max(18,y-6).toFixed(1)}" text-anchor="middle" font-size="10" fill="#23442f">${escapeHtml(cash(value))}</text><text x="${(x+bar/2).toFixed(1)}" y="164" text-anchor="middle" font-size="10" fill="#52665a">${escapeHtml(item.label)}</text>`;}).join('')}</svg>`; }
  function chartDoughnut(items, label, unit = 'tCO₂e', format = value => Number(value).toFixed(2)) { const usable=items.filter(item=>Number(item.value||0)>0), total=usable.reduce((sum,item)=>sum+Number(item.value),0); if(!total)return '<p class="muted">No confirmed simulated activity yet.</p>'; const colors=['#2e7657','#73a65b','#b6cf9c','#b7d8c3','#699b82','#d2a64e'], radius=58, circumference=2*Math.PI*radius; let offset=0; const arcs=usable.map((item,index)=>{const length=Number(item.value)/total*circumference, arc=`<circle cx="88" cy="88" r="${radius}" fill="none" stroke="${colors[index%colors.length]}" stroke-width="26" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 88 88)"></circle>`;offset+=length;return arc;}).join(''); return `<div style="display:grid;grid-template-columns:minmax(170px,220px) minmax(0,1fr);gap:14px;align-items:center"><svg viewBox="0 0 176 176" role="img" aria-label="${escapeHtml(label)}" style="width:100%;max-width:220px;height:auto">${arcs}<text x="88" y="83" text-anchor="middle" font-size="15" fill="#23442f">${escapeHtml(format(total))}</text>${unit ? `<text x="88" y="103" text-anchor="middle" font-size="10" fill="#52665a">${escapeHtml(unit)}</text>` : ''}</svg><ul style="margin:0;padding-left:18px">${usable.map((item,index)=>`<li><span style="color:${colors[index%colors.length]}">●</span> ${escapeHtml(item.label)} · ${escapeHtml(format(item.value))}${unit ? ` ${escapeHtml(unit)}` : ''}</li>`).join('')}</ul></div>`; }
  function premiumIcon(name) { const paths = { crown: '<path d="m3 8 3 3 3-6 3 6 3-3-2 9H5L3 8Z"/><path d="M5 20h10"/>', pie: '<path d="M21.21 15.89A10 10 0 1 1 8.1 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10Z"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>', trend: '<path d="m4 16 5-5 4 3 7-8"/><path d="M15 6h5v5"/>', layers: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>', check: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.3 4.8-4.8"/>', tag: '<path d="m20 12-8 8-8-8V4h8l8 8Z"/><circle cx="8" cy="8" r="1"/>' }; return `<svg class="premium-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.layers}</svg>`; }
  function holdingsBars(items) { const rows = items.filter(item => item.value > 0).sort((a, b) => b.value - a.value); if (!rows.length) return '<p class="muted">No available simulated holdings yet.</p>'; const peak = Math.max(...rows.map(item => item.value)); return `<div class="premium-holdings-bars" role="img" aria-label="Available simulated holdings by project">${rows.map(item => `<div class="premium-holdings-bar"><span title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><div><i style="width:${Math.max(3, item.value / peak * 100)}%"></i></div><strong>${item.value.toFixed(2)} tCO₂e</strong></div>`).join('')}</div>`; }

  async function subscription(plan) {
    const rows = await query('canopy_subscriptions', table => table.select('*').eq('user_id', context.profile.id).eq('plan', plan).limit(1));
    return rows[0] || null;
  }
  async function billingHistory(orderType) {
    return query('canopy_billing_orders', table => table.select('*').eq('user_id', context.profile.id).eq('order_type', orderType).order('created_at', { ascending: false }));
  }
  async function createCheckout(orderType, start, end) {
    const order = await rpc('canopy_create_billing_order', {
      p_order_type: orderType,
      p_idempotency_key: crypto.randomUUID(),
      p_period_start: start,
      p_period_end: end
    });
    context.pendingOrder = order;
    return order;
  }
  async function completeDemo(orderId) {
    const payment = await rpc('canopy_simulate_billing_payment', { p_order_id: orderId });
    try { await context.refresh(); } catch (_) { /* Backend payment already succeeded. */ }
    return payment;
  }
  async function startSubscription(orderType, title, benefits) {
    const accountStatus = await rpc('canopy_current_account_status');
    if (accountStatus !== 'verified') throw new Error(`Subscription is unavailable while this account is ${accountStatus}. Admin verification is required.`);
    const order = await createCheckout(orderType);
    const wallet = await rpc('canopy_demo_wallet_summary');
    const balance = Number(wallet.balance_myr || 0); const price = Number(order.amount_myr || 0); const shortfall = Math.max(0, price - balance); const enough = balance >= price;
    const dialog = modal(`<h2>${escapeHtml(title)}</h2><p>${escapeHtml(benefits)}</p><dl class="details"><div><dt>Configured monthly price</dt><dd>${cash(price)}</dd></div><div><dt>Current Demo RM Wallet</dt><dd>${cash(balance)}</dd></div><div><dt>Remaining after payment</dt><dd>${cash(Math.max(0,balance-price))}</dd></div><div><dt>Payment status</dt><dd>Sandbox checkout pending</dd></div></dl><p class="fine-print">Demo only — no real payment or carbon-credit purchase. No card or bank details are collected.</p><button class="btn secondary" id="openWallet" type="button">Open Demo RM Wallet</button> <button class="btn primary" id="confirmSubscription" ${enough?'':'disabled'}>Confirm demo subscription</button><p id="subscriptionResult" class="feedback-message ${enough?'':'feedback-error'}" aria-live="polite">${enough?'':`Insufficient demo wallet balance. Please top up RM ${shortfall.toFixed(2)} to subscribe.`}</p>`);
    dialog.querySelector('#openWallet').onclick=()=>{dialog.close();context.openWallet?.();};
    const button = dialog.querySelector('#confirmSubscription');
    button.onclick = async () => {
      button.disabled = true; button.textContent = 'Confirming…';
      try {
        await completeDemo(order.id);
        const activePlan = await subscription(orderType === 'partner_subscription' ? 'partner' : 'premium');
        if (!isActive(activePlan)) throw new Error('Demo payment was confirmed, but the subscription is not active yet. Please refresh and try again.');
        const feedback = dialog.querySelector('#subscriptionResult'); feedback.className = 'feedback-message feedback-success'; feedback.textContent = '✓ Demo subscription confirmed. Your status and billing history are updating.';
        context.toast(`✓ ${orderType === 'partner_subscription' ? 'Partner Portal' : 'Premium'} subscription is active. Demo payment confirmed.`, 'success');
        button.className = 'account-action-label approved-label'; button.textContent = '✓ Done'; try { await context.refresh(); } catch (_) { /* Keep backend-confirmed payment visible. */ }
      } catch (error) { button.disabled = false; button.textContent = 'Confirm demo subscription'; const feedback = dialog.querySelector('#subscriptionResult'); feedback.className = 'feedback-message feedback-error'; feedback.textContent = error?.message || 'Could not confirm the demo subscription.'; }
    };
  }
  async function cancel(plan) {
    await rpc('canopy_cancel_subscription', { p_plan: plan });
    context.toast('Subscription cancelled. Premium/Partner access has ended.');
    await context.refresh();
  }
  function checkout(order, description) {
    if (!order || order.payment_status !== 'pending') return '';
    return `<section class="revenue-checkout"><div><p class="eyebrow">SANDBOX CHECKOUT</p><h2>${escapeHtml(description)}</h2><p>Charge: <strong>${cash(order.amount_myr)}</strong></p><p>This demo records a sandbox event only. No card details are collected and no cash is received.</p></div><button class="btn primary" data-demo-order="${order.id}">Complete sandbox checkout</button></section>`;
  }
  function bindCommon() {
    document.querySelectorAll('[data-demo-order]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await completeDemo(button.dataset.demoOrder); context.toast('✓ Demo payment confirmed. No real money was collected.', 'success'); } catch (error) { button.disabled = false; showError(error); }
    }));
    document.querySelectorAll('[data-subscribe]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const partner = button.dataset.subscribe === 'partner_subscription';
      try { await startSubscription(button.dataset.subscribe, partner ? 'Partner Portal subscription' : 'Premium subscription', partner ? 'Referral management, authorized client data and reporting tools.' : 'Early eligible project access and advanced portfolio tools.'); }
      catch (error) { button.disabled = false; showError(error); }
    }));
    document.querySelectorAll('[data-cancel-plan]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Cancel this subscription now? Access will end immediately.')) return;
      button.disabled = true;
      try { await cancel(button.dataset.cancelPlan); } catch (error) { button.disabled = false; showError(error); }
    }));
  }
  function historyTable(rows) {
    if (!rows.length) return '<p class="muted">No billing history yet.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Payment</th><th>Reference</th></tr></thead><tbody>${rows.map(row => `<tr><td>${date(row.created_at)}</td><td>${escapeHtml(row.order_type.replaceAll('_', ' '))}</td><td>${cash(row.amount_myr)}</td><td>${status(row.payment_status)}</td><td>${escapeHtml(row.payment_reference || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function premiumView() {
    const [plan, history, entitled, demo] = await Promise.all([subscription('premium'), billingHistory('premium_subscription'), rpc('canopy_has_subscription', { p_plan: 'premium' }), demoData()]);
    const active = isActive(plan) && Boolean(entitled);
    const openOrder = history.find(row => row.payment_status === 'pending');
    const checkoutOrder = context.pendingOrder?.order_type === 'premium_subscription' ? context.pendingOrder : openOrder;
    const newProjects = context.projects.filter(project => project.created_at && Date.now() - new Date(project.created_at).getTime() < 48 * 60 * 60 * 1000);
    const earlyNotice = newProjects.length ? `<div class="notice"><span class="notice-icon">✦</span><span><strong>Early project access</strong> ${newProjects.map(project => `${escapeHtml(project.name)} (${date(project.created_at)})`).join(', ')}. Availability is subject to inventory.</span></div>` : `<div class="premium-empty-state">${premiumIcon('bell')}<span><strong>No new project releases</strong><span>New eligible demo listings will appear here when they are published.</span></span></div>`;
    const demoHoldings = new Map(); demo.ledger.forEach(row => demoHoldings.set(row.project_id, (demoHoldings.get(row.project_id) || 0) + Number(row.delta_tco2e || 0))); const held = [...demoHoldings.entries()].filter(([, quantity]) => quantity > 0); const listed = [...demo.projects.values()].filter(project => Number(project.simulated_inventory_tco2e || 0) >= 0.01); const committed = new Map(); demo.listings.filter(row => row.status === 'active').forEach(row => committed.set(row.project_id, (committed.get(row.project_id) || 0) + Number(row.quantity_tco2e || 0))); demo.retirements.filter(row => ['requested', 'processing'].includes(row.status)).forEach(row => committed.set(row.project_id, (committed.get(row.project_id) || 0) + Number(row.quantity_tco2e || 0))); const available = held.map(([id, quantity]) => ({ label: demo.projects.get(id)?.project_name || id, value: Math.max(0, quantity - Number(committed.get(id) || 0)) }));
    const insights = `<section class="premium-insights"><div><h2>Portfolio Insights</h2><p>Available DEMO / SIMULATED holdings only. Pending retirement and active sell-listing reservations are excluded.</p></div><div class="premium-insight-grid"><article><h3>Portfolio distribution</h3>${chartDoughnut(available, 'Available simulated holdings by project')}</article><article><h3>Holdings by project</h3>${holdingsBars(available)}</article></div></section>`;
    const contentStats = active ? `<section class="revenue-section premium-tools"><h2>Premium tools</h2>${earlyNotice}<p class="revenue-note">All values below are simulated only; no real carbon-credit ownership is represented.</p><div class="metric-grid"><article>${premiumIcon('layers')}<span>Tracked demo holdings</span><strong>${held.length}</strong></article><article>${premiumIcon('check')}<span>Approved simulated tCO₂e</span><strong>${held.reduce((sum, [, quantity]) => sum + quantity, 0).toFixed(2)} <small>tCO₂e</small></strong></article><article>${premiumIcon('tag')}<span>Active demo listings</span><strong>${listed.length}</strong></article></div>${insights}<h3>Approved simulated holdings</h3>${held.length ? `<div class="table-wrap premium-table"><table><thead><tr><th>Project</th><th>Quantity</th></tr></thead><tbody>${held.map(([id, quantity]) => `<tr><td>${escapeHtml(demo.projects.get(id)?.project_name || id)}</td><td>${quantity.toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No Admin-approved simulated holdings yet.</p>'}<h3>Active demo marketplace listings</h3><div class="table-wrap premium-table"><table><thead><tr><th>Project</th><th>Simulated price</th><th>Simulated quantity</th></tr></thead><tbody>${listed.map(project => `<tr><td>${escapeHtml(project.project_name)}</td><td>${cash(project.simulated_price_myr)} / tCO₂e</td><td>${Number(project.simulated_inventory_tco2e).toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div></section>` : `<section class="revenue-locked"><h2>Premium features are locked</h2><p>Detailed analytics, advanced market information and early project access require an active Premium subscription.</p></section>`;
    const planLabel = !plan ? 'Free plan' : ({ active_demo: 'Active — Demo', active: 'Active', cancelled: 'Cancelled', expired: 'Expired' }[plan.status] || plan.status);
    const benefits = `<section class="premium-benefits"><h2>Included with Premium</h2><div class="premium-benefit-grid"><article>${premiumIcon('pie')}<h3>Portfolio Analytics</h3><p>Track approved simulated holdings, activity and project mix.</p><span>Available with active Premium</span></article><article>${premiumIcon('bell')}<h3>Early Project Notifications</h3><p>See recent eligible releases and their availability windows.</p><span>Current release information</span></article><article>${premiumIcon('clock')}<h3>Priority Project Access</h3><p>Eligible new demo listings may have a 48-hour Premium window.</p><span>Subject to listing rules and inventory</span></article><article>${premiumIcon('trend')}<h3>Market Insights</h3><p>Planning context only. canopy does not provide live exchange pricing or investment advice.</p><span>Proposed feature</span></article></div></section>`;
    content(`<div class="page-heading"><div><span class="eyebrow">SME PLAN</span><h1>Premium</h1><p>Free plan includes project browsing, basic portfolio tracking and transaction history.</p></div></div><section class="premium-hero"><div><span class="eyebrow">PREMIUM PLAN</span><div class="premium-title">${premiumIcon('crown')}<h2>canopy Premium</h2></div><p class="premium-price">RM250 <small>/ month</small></p><p>Premium expands your simulated portfolio tools while keeping all canopy activity clearly labelled as demo only.</p>${demoLabel}</div><div class="premium-status"><span>Subscription status</span>${status(planLabel)}<small>${premiumIcon('clock')} Renewal: ${date(plan?.renewal_at)}</small>${active ? '<button class="btn secondary" data-cancel-plan="premium">Cancel subscription</button>' : '<button class="btn primary" data-subscribe="premium_subscription">Upgrade to Premium</button>'}</div></section>${benefits}${checkout(checkoutOrder, 'Premium monthly subscription')}${contentStats}<section class="revenue-section"><h2>Billing history</h2>${historyTable(history)}</section>`);
    bindCommon();
  }

  function downloadPdf(title, lines, filename) {
    const JsPDF = window.jspdf?.jsPDF;
    if (!JsPDF) throw new Error('PDF support did not load. Reconnect and try again.');
    const doc = new JsPDF();
    doc.setTextColor(29, 81, 62);
    doc.setFontSize(20);
    doc.text(title, 16, 20);
    doc.setDrawColor(112, 165, 64);
    doc.line(16, 25, 194, 25);
    doc.setTextColor(35, 48, 41);
    doc.setFontSize(10);
    let y = 34;
    lines.forEach(line => {
      const wrapped = doc.splitTextToSize(String(line), 178);
      if (y + wrapped.length * 5 > 280) { doc.addPage(); y = 18; }
      doc.text(wrapped, 16, y);
      y += wrapped.length * 5 + 2;
    });
    doc.save(filename);
  }
  const excelNumber = value => { const number = Number(value); return Number.isFinite(number) ? number : ''; };
  function xlsxBook(sheets, filename) {
    const XLSX = window.XLSX; if (!XLSX?.utils || typeof XLSX.write !== 'function') throw new Error('Excel export support did not load. Reconnect and try again.');
    const book = XLSX.utils.book_new();
    sheets.forEach(({ name, rows, headerRow = 0, currencyColumns = [], filter = true }) => {
      const sheet = XLSX.utils.aoa_to_sheet(rows); const width = Math.max(1, ...rows.map(row => row.length));
      if (filter && rows.length > headerRow + 1) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: rows.length - 1, c: width - 1 } }) };
      sheet['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 }; sheet['!cols'] = Array.from({ length: width }, (_, index) => ({ wch: Math.min(42, Math.max(14, ...rows.map(row => String(row[index] ?? '').length + 2))) }));
      currencyColumns.forEach(column => { for (let row = headerRow + 1; row < rows.length; row += 1) { const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell && typeof cell.v === 'number') cell.z = 'RM #,##0.00'; } }); XLSX.utils.book_append_sheet(book, sheet, name);
    });
    const raw = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
    const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) : null;
    if (!bytes || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw new Error('Excel workbook generation failed validation. No file was downloaded.');
    if (!window.URL?.createObjectURL) throw new Error('This browser cannot start an Excel download.');
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (blob.size !== bytes.byteLength) throw new Error('Excel workbook generation failed validation. No file was downloaded.');
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.style.display = 'none'; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); return { bytes: bytes.byteLength, sheets: book.SheetNames.slice() };
  }  const inPeriod = (value, start, end) => { const day = String(value || '').slice(0, 10); return (!start || day >= start) && (!end || day <= end); };
  async function demoData(start = '', end = '') {
    const [purchases, ledger, demoProjects, wallet, listings] = await Promise.all([
      query('canopy_demo_purchase_requests', table => table.select('*').order('created_at', { ascending: true })),
      query('canopy_demo_entitlement_ledger', table => table.select('*').order('created_at', { ascending: true })),
      query('canopy_demo_projects', table => table.select('id,project_name,simulated_price_myr,simulated_inventory_tco2e').order('project_name')),
      query('canopy_demo_wallet_transactions', table => table.select('*').order('created_at', { ascending: true })),
      query('canopy_demo_trade_listings', table => table.select('*').eq('seller_id', context.profile.id).order('created_at', { ascending: true }))
    ]);
    let retirements = [];
    try { retirements = await query('canopy_demo_retirement_requests', table => table.select('*').order('requested_at', { ascending: true })); } catch (_) { /* Migration 019 may not be applied yet. */ }
    return { purchases: purchases.filter(row => inPeriod(row.created_at, start, end)), ledger, projects: new Map(demoProjects.map(row => [row.id, row])), wallet, listings, retirements: retirements.filter(row => inPeriod(row.requested_at, start, end)), start, end };
  }
  async function downloadReportExcel(report) {
    const data = await demoData(report.period_start, report.period_end); const company = context.profile.company_name || context.profile.contact_name || 'SME';
    const holdings = new Map(); data.ledger.forEach(row => holdings.set(row.project_id, (holdings.get(row.project_id) || 0) + Number(row.delta_tco2e || 0)));
    const walletRows = data.wallet.filter(row => inPeriod(row.created_at, report.period_start, report.period_end)); let running = data.wallet.filter(row => String(row.created_at || '').slice(0, 10) < report.period_start).reduce((sum, row) => sum + Number(row.amount_myr || 0), 0);
    const exportedWalletRows = walletRows.map(row => { running += Number(row.amount_myr || 0); return [date(row.created_at), walletTypeLabel(row), row.note, Number(row.amount_myr) > 0 ? Number(row.amount_myr) : '', Number(row.amount_myr) < 0 ? Math.abs(Number(row.amount_myr)) : '', running]; });
    return xlsxBook([{ name: 'Summary', filter: false, rows: [['CANOPY DEMO — SIMULATED DATA, NOT REAL CARBON CREDITS'], ['Company', company], ['Reporting period', `${report.period_start} to ${report.period_end}`], ['Note', 'No environmental impact, certificates, or real carbon-credit ownership is inferred.']] }, { name: 'Transaction History', currencyColumns: [3, 4, 5, 6], rows: [['Date', 'Project', 'Quantity tCO2e', 'Unit price MYR', 'Credit value MYR', 'Fee MYR', 'Total MYR', 'Status'], ...data.purchases.map(row => { const project = data.projects.get(row.project_id); return [date(row.created_at), project?.project_name || row.project_id, excelNumber(row.quantity_tco2e), excelNumber(row.simulated_unit_price_myr), excelNumber(row.simulated_credit_value_myr), excelNumber(row.simulated_platform_fee_myr), excelNumber(row.simulated_total_myr), row.request_status]; })] }, { name: 'Carbon Holdings', rows: [['Project', 'Available simulated quantity tCO2e'], ...[...holdings.entries()].filter(([, quantity]) => quantity > 0).map(([id, quantity]) => [data.projects.get(id)?.project_name || id, quantity])] }, { name: 'Simulated Retirements', rows: [['Requested date', 'Project', 'Quantity tCO2e', 'Status', 'Statement reference', 'Purpose'], ...data.retirements.map(row => [date(row.requested_at), data.projects.get(row.project_id)?.project_name || row.project_id, excelNumber(row.quantity_tco2e), row.status, row.statement_reference, row.retirement_purpose || ''])] }, { name: 'Demo Wallet', currencyColumns: [3, 4, 5], rows: [['Date', 'Type', 'Description', 'Money in MYR', 'Money out MYR', 'Running balance MYR'], ...exportedWalletRows] }], `Canopy_Demo_Carbon_ESG_Report_${report.period_start}_${report.period_end}.xlsx`);
  }  function reportLines(data) {
    const lines = [
      `Reporting period: ${data.report.period_start} to ${data.report.period_end}`,
      `Company: ${data.company.company_name || 'Not supplied'}`,
      `Registration: ${data.company.registration_number || 'Not supplied'}`,
      `Sector: ${data.company.sector || 'Not supplied'}`,
      'Data source: Canopy records currently stored in Supabase.',
      data.data_note,
      '',
      'Current holdings:'
    ];
    if (!data.holdings.length) lines.push('No holdings recorded.');
    data.holdings.forEach(item => lines.push(`${item.project?.name || item.project_id || 'Project'}: ${item.quantity_tco2e || 0} tCO₂e`));
    lines.push('', 'Transactions during reporting period:');
    if (!data.transactions.length) lines.push('No transactions recorded during this period.');
    data.transactions.forEach(item => lines.push(`${item.created_at || ''} · ${item.request_type || 'Transaction'} · ${item.quantity_tco2e || 0} tCO₂e · ${item.status || 'Unknown'} · ${item.project?.name || 'Project'}`));
    const purchased = data.transactions.filter(item => ['buy', 'purchase'].includes(String(item.request_type).toLowerCase()) && String(item.status).toLowerCase() === 'completed').reduce((sum, item) => sum + Number(item.quantity_tco2e || 0), 0);
    const sold = data.transactions.filter(item => ['sell', 'sale'].includes(String(item.request_type).toLowerCase()) && String(item.status).toLowerCase() === 'completed').reduce((sum, item) => sum + Number(item.quantity_tco2e || 0), 0);
    const retired = data.transactions.filter(item => ['retire', 'retirement'].includes(String(item.request_type).toLowerCase()) && String(item.status).toLowerCase() === 'completed').reduce((sum, item) => sum + Number(item.quantity_tco2e || 0), 0);
    lines.push('', `Completed credits purchased: ${purchased} tCO₂e`, `Completed credits sold: ${sold} tCO₂e`, `Completed credits retired: ${retired} tCO₂e`, '', 'No emissions reductions, avoided emissions, or environmental impact are estimated by this report.');
    return lines;
  }
  async function getReportRows() {
    return query('canopy_report_requests', table => table.select('*').eq('user_id', context.profile.id).order('created_at', { ascending: false }));
  }
  async function startReportPayment(start, end) {
    const order = await createCheckout('esg_report', start, end); const wallet = await rpc('canopy_demo_wallet_summary'); const balance = Number(wallet.balance_myr || 0); const amount = Number(order.amount_myr || 0); const shortfall = Math.max(0, amount - balance); const enough = balance >= amount;
    const dialog = modal(`<h2>Confirm Carbon & ESG report</h2><dl class="details"><div><dt>Report fee</dt><dd>${cash(amount)}</dd></div><div><dt>Demo RM Wallet</dt><dd>${cash(balance)}</dd></div><div><dt>Remaining after payment</dt><dd>${cash(Math.max(0,balance-amount))}</dd></div></dl><p class="fine-print">Demo only — no real payment. The workbook includes only available Canopy records.</p><button class="btn secondary" id="openWallet" type="button">Open Demo RM Wallet</button> <button class="btn primary" id="confirmReport" ${enough?'':'disabled'}>Confirm demo payment</button><p id="reportPaymentResult" class="feedback-message ${enough?'':'feedback-error'}">${enough?'':`Insufficient demo wallet balance. Please top up RM ${shortfall.toFixed(2)} to complete this demo purchase.`}</p>`);
    dialog.querySelector('#openWallet').onclick=()=>{dialog.close();context.openWallet?.();}; const button=dialog.querySelector('#confirmReport'); button.onclick=async()=>{button.disabled=true;button.textContent='Confirming…';try{await completeDemo(order.id);const feedback=dialog.querySelector('#reportPaymentResult');feedback.className='feedback-message feedback-success';feedback.textContent='✓ Demo payment confirmed. Use Download Excel in Report History to generate the workbook.';button.className='account-action-label approved-label';button.textContent='✓ Done';context.toast('✓ Demo report payment confirmed. No real money was collected.','success');try{await context.refresh();}catch(_){/* Keep backend-confirmed payment visible. */}}catch(error){button.disabled=false;button.textContent='Confirm demo payment';const feedback=dialog.querySelector('#reportPaymentResult');feedback.className='feedback-message feedback-error';feedback.textContent=error?.message||'Could not confirm this demo payment.';}};
  }
  async function reportsView() {
    const rows = await getReportRows();
    const orderIds = rows.map(row => row.billing_order_id);
    const orders = orderIds.length ? await query('canopy_billing_orders', table => table.select('*').in('id', orderIds)) : [];
    const orderMap = new Map(orders.map(order => [order.id, order]));
    const canDownload = row => ['ready', 'ready_demo'].includes(row.status) && ['paid', 'sandbox_paid'].includes(orderMap.get(row.billing_order_id)?.payment_status);
    content(`<div class="page-heading"><div><span class="eyebrow">CARBON & ESG REPORTING</span><h1>Reports</h1><p>Generate an Excel workbook from available simulated Canopy records.</p></div></div><section class="revenue-checkout"><div><h2>Carbon & ESG report</h2><p>Report fee: <strong>${cash(500)}</strong></p><p>Demo only — no real payment or carbon credits. Missing data is not invented.</p></div><form id="reportOrderForm" class="revenue-period"><label>From<input type="date" name="start" required value="${new Date().getFullYear()}-01-01"></label><label>To<input type="date" name="end" required value="${new Date().toISOString().slice(0, 10)}"></label><button class="btn primary" type="submit">Generate Excel report</button></form></section>${demoLabel}<section class="revenue-section"><h2>Report history</h2>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Requested</th><th>Period</th><th>Fee</th><th>Payment</th><th>Report</th></tr></thead><tbody>${rows.map(row => { const order = orderMap.get(row.billing_order_id); return `<tr><td>${date(row.created_at)}</td><td>${escapeHtml(row.period_start)} – ${escapeHtml(row.period_end)}</td><td>${cash(order?.amount_myr)}</td><td>${status(order?.payment_status || row.status)}</td><td>${canDownload(row) ? `<button class="btn secondary" data-download-report="${row.id}">Download Excel</button>` : row.status === 'pending' ? `<button class="btn primary" data-demo-order="${row.billing_order_id}">Complete demo payment</button>` : 'Not authorized'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No reports requested yet.</p>'}</section>`);
    document.querySelector('#reportOrderForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = form.get('start');
      const end = form.get('end');
      if (end < start) { context.toast('The report end date must be on or after the start date.', 'error'); return; }
      const button = event.submitter;
      if (button) button.disabled = true;
      try { await startReportPayment(start, end); } catch (error) { if (button) button.disabled = false; showError(error); }
    });
    document.querySelectorAll('[data-download-report]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await downloadReportExcel(rows.find(row => row.id === button.dataset.downloadReport));
        context.toast('✓ Demo Carbon & ESG Excel file generated and download started. Simulated data only.', 'success');
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    }));
    bindCommon();
  }

  function marketInsightsMarkup(data) {
    if (!data?.sufficient_data) return `<section class="revenue-section"><h2>Market Insights</h2><p class="muted">${escapeHtml(data?.message || 'Insufficient aggregated data.')}</p></section>`;
    const industries = data.industry_distribution || []; const types = data.popular_project_types || []; const trends = data.monthly_activity || []; const peak = Math.max(1, ...trends.flatMap(item => [Number(item.purchased_tco2e || 0), Number(item.retired_tco2e || 0)]));
    return `<section class="revenue-section"><h2>Market Insights</h2><p class="revenue-note">DEMO / SIMULATED platform aggregates only. Categories and months with fewer than three active SMEs are suppressed.</p><div class="metric-grid"><article><span>Total active SMEs</span><strong>${Number(data.total_active_smes).toLocaleString()}</strong></article>${data.activity_available ? `<article><span>Simulated tCO₂e purchased</span><strong>${Number(data.total_purchased_tco2e || 0).toFixed(2)}</strong></article><article><span>Recorded tCO₂e retired</span><strong>${Number(data.total_retired_tco2e || 0).toFixed(2)}</strong></article>` : '<article><span>Carbon activity</span><strong>Suppressed</strong></article>'}</div><h3>Industry distribution</h3>${industries.length ? `<div class="table-wrap"><table><thead><tr><th>Industry</th><th>Active SMEs</th></tr></thead><tbody>${industries.map(item => `<tr><td>${escapeHtml(item.industry)}</td><td>${Number(item.sme_count)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Insufficient aggregated data.</p>'}<h3>Malaysian state distribution</h3><p class="muted">${escapeHtml(data.state_note || 'Insufficient aggregated data.')}</p>${data.activity_available ? `<h3>Popular simulated project types</h3>${types.length ? `<div class="table-wrap"><table><thead><tr><th>Project type</th><th>SME group</th><th>Simulated tCO₂e</th></tr></thead><tbody>${types.map(item => `<tr><td>${escapeHtml(item.project_type)}</td><td>${Number(item.sme_count)}</td><td>${Number(item.quantity_tco2e).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Insufficient aggregated data.</p>'}<h3>Simulated carbon activity by month</h3>${trends.length ? `<div class="revenue-chart" role="img" aria-label="Monthly simulated tCO2e purchased and recorded retired, with small groups suppressed">${trends.map(item => `<div class="revenue-chart-column"><span>${Number(item.purchased_tco2e || 0).toFixed(1)} / ${Number(item.retired_tco2e || 0).toFixed(1)}</span><div style="height:${Math.max(2, Math.max(Number(item.purchased_tco2e || 0), Number(item.retired_tco2e || 0)) / peak * 100)}%"></div><small>${escapeHtml(item.month)}</small></div>`).join('')}</div>` : '<p class="muted">Insufficient aggregated data.</p>'}` : `<p class="muted">${escapeHtml(data.message || 'Insufficient aggregated activity data.')}</p>`}</section>`;
  }

  async function partnerView() {
    const [plan, history, entitled, partnerProfile] = await Promise.all([subscription('partner'), billingHistory('partner_subscription'), rpc('canopy_has_subscription', { p_plan: 'partner' }), rpc('canopy_partner_profile')]);
    const active = isActive(plan) && Boolean(entitled);
    const profileComplete = Boolean(partnerProfile?.contact_name && partnerProfile?.contact_email && (partnerProfile?.business_phone || partnerProfile?.website) && partnerProfile?.partner_contact_visible);
    const openOrder = history.find(row => row.payment_status === 'pending');
    const checkoutOrder = context.pendingOrder?.order_type === 'partner_subscription' ? context.pendingOrder : openOrder;
    let portal = `<section class="revenue-locked"><h2>Partner Portal is locked</h2><p>An active Partner subscription is required to use referral, client-data and reporting tools.</p></section>`;
    let code = '';
    let analytics = { total_referred: 0, verified_referred: 0, transaction_volume_myr: 0, credits_purchased: 0, credits_retired: 0, reward_type: 'disabled' };
    let referrals = [];
    let insights = null;
    let referralError = '';
    if (active) {
      try {
        const [statRows, partnerCode, referredRows, insightData] = await Promise.all([
          rpc('canopy_partner_referral_statistics'), rpc('canopy_create_partner_code'), rpc('canopy_partner_referred_smes'), rpc('canopy_partner_market_insights')
        ]);
        const referralStats = Array.isArray(statRows) ? statRows[0] : null;
        if (!referralStats) throw new Error('Referral statistics were unavailable.');
        code = partnerCode; referrals = referredRows; insights = insightData;
        analytics = { ...analytics, total_referred: Number(referralStats.total_referred || 0), verified_referred: Number(referralStats.verified_referred || 0) };
      } catch (error) { referralError = error?.message || 'Could not load referral statistics.'; }
      const rewardEstimate = analytics.reward_type === 'percentage'
        ? Number(analytics.transaction_volume_myr || 0) * Number(analytics.reward_percent || 0)
        : analytics.reward_type === 'fixed_myr'
          ? Number(analytics.total_referred || 0) * Number(analytics.reward_fixed_myr || 0)
          : 0;
      const link = new URL('./', location.href);
      link.searchParams.set('ref', code);
      portal = referralError ? `<section class="revenue-section"><h2>Referral tools unavailable</h2><p class="feedback-message feedback-error">${escapeHtml(referralError)}</p></section>` : `<section class="revenue-section"><h2>Your referral link</h2><div class="revenue-referral"><input id="partnerReferralLink" readonly value="${escapeHtml(link.href)}"><button class="btn secondary" id="copyReferral">Copy link</button></div></section><div class="metric-grid"><article><span>SMEs referred</span><strong>${analytics.total_referred}</strong></article><article><span>Active (verified) SMEs</span><strong>${analytics.verified_referred}</strong></article><article><span>Transaction volume</span><strong>${cash(analytics.transaction_volume_myr)}</strong></article><article><span>Credits purchased / retired</span><strong>${Number(analytics.credits_purchased || 0).toLocaleString()} / ${Number(analytics.credits_retired || 0).toLocaleString()} tCO₂e</strong></article><article><span>Configured reward estimate · not settled</span><strong>${analytics.reward_type === 'disabled' ? 'Not configured' : cash(rewardEstimate)}</strong></article></div><p class="revenue-note">Referral attribution never grants access to SME data. A business profile appears only while the SME has separately shared it.</p><section class="revenue-section"><h2>Referred SMEs</h2>${referrals.length ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Sector</th><th>Verification</th><th>Referral linked</th><th></th></tr></thead><tbody>${referrals.map(referral => `<tr><td>${referral.profile_shared ? escapeHtml(referral.company_name) : 'Company profile not shared'}</td><td>${referral.profile_shared ? escapeHtml(referral.sector || 'Not supplied') : '—'}</td><td>${escapeHtml(referral.verification_status)}</td><td>${date(referral.linked_at)}</td><td>${referral.profile_shared ? `<button class="btn secondary" data-referral-profile="${referral.sme_id}">View profile</button>` : 'Profile sharing not granted'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No SMEs have used your referral code yet.</p>'}</section>`;
    }
    content(`<div class="page-heading"><div><span class="eyebrow">PARTNER PORTAL</span><h1>Partner dashboard</h1><p>Manage referrals, authorized client data and your subscription.</p></div></div><div class="revenue-plan"><div><p class="eyebrow">PARTNER SUBSCRIPTION</p><h2>${cash(500)} / month</h2><p>Referral management, client analytics, project information and reporting tools.</p></div><div><strong>Subscription status</strong><p>${status(plan?.status || 'Inactive')}</p><small>Renewal: ${date(plan?.renewal_at)}</small>${active && plan.status === 'active_demo' ? `<p>${demoLabel}</p>` : ''}${active ? '<button class="btn secondary" data-cancel-plan="partner">Cancel subscription</button>' : '<button class="btn primary" data-subscribe="partner_subscription">Subscribe</button>'}</div></div>${!profileComplete ? '<section class="partner-profile-reminder"><div><strong>Complete your Partner profile</strong><p>Add contact details and choose whether referred SMEs can see them.</p></div><button class="btn secondary" data-open-partner-profile>Complete profile</button></section>' : ''}${checkout(checkoutOrder, 'Partner Portal monthly subscription')}${portal}${active ? marketInsightsMarkup(insights) : ''}<section class="revenue-section"><h2>Billing history</h2>${historyTable(history)}</section>`);
    document.querySelector('[data-open-partner-profile]')?.addEventListener('click', () => context.openPartnerProfile?.());
    if (active) {
      document.querySelector('#copyReferral')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkValue()); context.toast('✓ Referral link copied successfully!', 'success'); } catch { context.toast('Could not copy the referral link. Please copy it from the field.', 'error'); }
      });
      document.querySelectorAll('[data-referral-profile]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const data = await rpc('canopy_partner_referred_sme_profile', { p_sme_id: button.dataset.referralProfile });
          const dialog = modal(`<span class="eyebrow">SHARED BUSINESS PROFILE</span><h2>${escapeHtml(data.company_name || 'SME')}</h2><dl class="details"><div><dt>Sector</dt><dd>${escapeHtml(data.sector || 'Not supplied')}</dd></div><div><dt>Account status</dt><dd>${escapeHtml(data.verification_status || 'Unknown')}</dd></div></dl><p class="fine-print">Shared by the SME for this Partner. No contact details, holdings, transactions, or reports are shown here.</p>`);
        } catch (error) { showError(error); }
        finally { button.disabled = false; }
      }));
    }
    bindCommon();
  }
  function linkValue() { return document.querySelector('#partnerReferralLink')?.value || ''; }

  async function partnerProfileView() {
    const partner = await rpc('canopy_partner_profile');
    const value = item => escapeHtml(item || 'Not provided');
    const shared = partner.partner_contact_visible ? '<span class="status approved">Visible to referred SMEs</span>' : '<span class="status pending">Not shared with referred SMEs</span>';
    content(`<section class="profile-page partner-profile-page"><div class="profile-hero"><div><span class="eyebrow">PARTNER PROFILE</span><h1>${value(partner.company_name)}</h1><p>Manage the business information you choose to share with SMEs referred to your organisation.</p>${shared}</div><button class="btn primary" id="editPartnerProfile">Edit profile</button></div><section class="profile-card"><h2>Organisation details</h2><dl class="details"><div><dt>Legal company name</dt><dd>${value(partner.company_name)}</dd></div><div><dt>Registration number</dt><dd>${value(partner.registration_number)}</dd></div><div><dt>Account verification</dt><dd>${status(partner.verification_status || 'Pending')}</dd></div><div><dt>Referral code</dt><dd>${value(partner.referral_code)}</dd></div></dl></section><section class="profile-card"><h2>Business contact details</h2><dl class="details"><div><dt>Contact person</dt><dd>${value(partner.contact_name)}</dd></div><div><dt>Contact email</dt><dd>${value(partner.contact_email)}</dd></div><div><dt>Business phone</dt><dd>${value(partner.business_phone)}</dd></div><div><dt>Website</dt><dd>${partner.website ? `<a href="${escapeHtml(partner.website)}" target="_blank" rel="noopener">${escapeHtml(partner.website)}</a>` : 'Not provided'}</dd></div><div><dt>Business address</dt><dd>${value(partner.business_address)}</dd></div><div><dt>Company description</dt><dd>${value(partner.company_description)}</dd></div></dl><p class="fine-print">These contact details are visible to your referred SMEs only when you choose to share them. Their separate business-profile and full carbon-data consent controls remain unchanged.</p></section></section>`);
    document.querySelector('#editPartnerProfile')?.addEventListener('click', () => {
      const dialog = modal(`<h2>Edit Partner profile</h2><p class="fine-print">Legal company name, registration number, role, verification, and referral code cannot be changed here.</p><form id="partnerProfileForm" class="dialog-form"><label>Contact person<input name="contact_name" maxlength="160" value="${escapeHtml(partner.contact_name || '')}"></label><label>Contact email<input name="contact_email" type="email" maxlength="254" value="${escapeHtml(partner.contact_email || '')}"></label><label>Business phone<input name="phone" maxlength="50" value="${escapeHtml(partner.business_phone || '')}"></label><label>Business address<textarea name="address" maxlength="500">${escapeHtml(partner.business_address || '')}</textarea></label><label>Website (HTTPS)<input name="website" type="url" placeholder="https://example.com" maxlength="2048" value="${escapeHtml(partner.website || '')}"></label><label>Company description<textarea name="description" maxlength="2000">${escapeHtml(partner.company_description || '')}</textarea></label><label class="partner-profile-visibility"><input name="visible" type="checkbox" ${partner.partner_contact_visible ? 'checked' : ''}> Share these business contact details with SMEs referred to this Partner</label><div class="partner-profile-actions"><button class="btn secondary" id="cancelPartnerProfile" type="button">Cancel</button><button class="btn primary" type="submit">Save profile</button></div><p id="partnerProfileFeedback" class="feedback-message" aria-live="polite"></p></form>`);
      dialog.querySelector('#cancelPartnerProfile').onclick = () => dialog.close();
      dialog.querySelector('#partnerProfileForm').addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const button = form.querySelector('button[type="submit"]'); const feedback = dialog.querySelector('#partnerProfileFeedback');
        button.disabled = true; button.textContent = 'Saving…';
        try {
          await rpc('canopy_update_partner_profile', { p_contact_name: values.get('contact_name'), p_contact_email: values.get('contact_email'), p_phone: values.get('phone'), p_address: values.get('address'), p_website: values.get('website'), p_description: values.get('description'), p_partner_contact_visible: form.elements.visible.checked });
          dialog.close(); context.toast('Partner profile updated.', 'success'); await partnerProfileView();
        } catch (error) { button.disabled = false; button.textContent = 'Save profile'; feedback.className = 'feedback-message feedback-error'; feedback.textContent = error?.message || 'Could not update the Partner profile.'; }
      });
    });
  }

  async function partnerAccessView() {
    const partners = await rpc('canopy_sme_partner_access');
    const contactRow = (label, icon, value, href, type) => value ? `<div class="partner-contact-row"><span class="partner-contact-icon" aria-hidden="true">${icon}</span><div><strong>${label}</strong><a href="${escapeHtml(href)}" ${type === 'website' ? 'target="_blank" rel="noopener"' : ''}>${escapeHtml(value)}</a></div><button class="partner-contact-copy" type="button" data-copy-contact="${escapeHtml(value)}" aria-label="Copy ${label}">Copy</button></div>` : `<div class="partner-contact-row unavailable"><span class="partner-contact-icon" aria-hidden="true">${icon}</span><div><strong>${label}</strong><span>Not provided</span></div></div>`;
    const emailIcon = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
    const phoneIcon = '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.6a15 15 0 0 0 5.9 5.9L16 13l5 2v4c-9.4.5-16.5-6.6-16-16Z"/></svg>';
    const websiteIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg>';
    const contactInfo = partner => !partner.contact_visible ? '<section class="partner-contact-info"><h3>Partner Contact Information</h3><p class="muted">This Partner has not enabled contact-detail sharing.</p></section>' : `<section class="partner-contact-info"><h3>Partner Contact Information</h3>${contactRow('Business Email', emailIcon, partner.contact_email, `mailto:${partner.contact_email || ''}`, 'email')}${contactRow('Phone Number', phoneIcon, partner.business_phone, `tel:${partner.business_phone || ''}`, 'phone')}${contactRow('Website', websiteIcon, partner.website, partner.website || '', 'website')}</section>`;
    content(`<section class="partner-access-page"><div class="page-heading"><div><span class="eyebrow">DATA PERMISSIONS</span><h1>Partner access</h1><p>Referral attribution never grants access to your business profile, carbon holdings, transactions, or reports.</p></div></div>${partners.length ? partners.map(partner => `<article class="partner-access-card"><div><span class="eyebrow">REFERRING PARTNER</span><h2>${escapeHtml(partner.partner_name || 'Partner')}</h2>${partner.contact_visible ? `<p>${escapeHtml(partner.contact_name || 'Contact person not provided')}</p>${partner.company_description ? `<p>${escapeHtml(partner.company_description)}</p>` : ''}` : ''}<p>Referral code: <strong>${escapeHtml(partner.referral_code)}</strong></p>${contactInfo(partner)}</div><div class="consent-grid"><section><h3>Business Profile</h3><p>Allows this Partner to view your approved business profile details.</p><span class="status ${partner.profile_granted ? 'approved' : 'pending'}">${partner.profile_granted ? 'Sharing' : 'Not shared'}</span><button class="btn ${partner.profile_granted ? 'danger' : 'secondary'}" data-profile-consent-partner="${partner.partner_id}" data-grant="${!partner.profile_granted}">${partner.profile_granted ? 'Stop sharing profile' : 'Grant profile access'}</button></section><section><h3>Full Carbon Data Access</h3><p>Allows this Partner to view authorised carbon holdings, transaction activity and eligible reports.</p><span class="status ${partner.full_granted ? 'approved' : 'pending'}">${partner.full_granted ? 'Authorised' : 'Not authorised'}</span><button class="btn ${partner.full_granted ? 'danger' : 'primary'}" data-consent-partner="${partner.partner_id}" data-grant="${!partner.full_granted}">${partner.full_granted ? 'Revoke full access' : 'Grant full access'}</button></section></div></article>`).join('') : '<section class="revenue-locked"><h2>No referring Partner</h2><p>No referral is linked to this account.</p></section>'}</section>`);
    document.querySelectorAll('[data-copy-contact]').forEach(button => button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(button.dataset.copyContact); context.toast('Partner contact detail copied.', 'success'); }
      catch (_) { context.toast('Could not copy this contact detail. You can select it manually.', 'error'); }
    }));
    document.querySelectorAll('[data-consent-partner]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await rpc('canopy_set_partner_client_consent', { p_partner_id: button.dataset.consentPartner, p_granted: button.dataset.grant === 'true' }); context.toast('Partner data permission updated.', 'success'); await partnerAccessView(); }
      catch (error) { button.disabled = false; showError(error); }
    }));
    document.querySelectorAll('[data-profile-consent-partner]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; try { await rpc('canopy_set_partner_profile_consent', { p_partner_id: button.dataset.profileConsentPartner, p_granted: button.dataset.grant === 'true' }); context.toast('Business profile sharing updated.', 'success'); await partnerAccessView(); } catch (error) { button.disabled = false; showError(error); } }));
  }

  async function partnerReportsView() {
    const clients = await rpc('canopy_partner_clients');
    const authorized = clients.filter(client => client.consent_granted);
    const aggregate = '<p class="muted">Open an authorised SME record to view only the data that SME has explicitly permitted. Platform-wide anonymised insights are available on the Partner dashboard.</p>';
    content(`<div class="page-heading"><div><span class="eyebrow">PARTNER REPORTING</span><h1>Authorized client reports</h1><p>Client data is available only while the SME’s explicit consent remains active. A referral alone never grants access.</p></div></div>${aggregate}${authorized.length ? `<div class="table-wrap"><table><thead><tr><th>SME</th><th>Verification</th><th>Permission</th><th>Report</th></tr></thead><tbody>${authorized.map(client => `<tr><td>${escapeHtml(client.company_name)}</td><td>${escapeHtml(client.verification_status)}</td><td>Active consent</td><td><button class="btn primary" data-authorized-report="${client.sme_id}">View authorized data</button></td></tr>`).join('')}</tbody></table></div>` : '<section class="revenue-locked"><h2>No active SME consent</h2><p>Ask a referred SME to open Partner access and authorize your organisation. Access is removed immediately when that SME revokes permission.</p></section>'}<section id="partnerReportDetail" class="revenue-section" hidden></section>`);
    document.querySelectorAll('[data-authorized-report]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const data = await rpc('canopy_partner_client_data', { p_sme_id: button.dataset.authorizedReport });
        const panel = document.querySelector('#partnerReportDetail');
        const demoHoldings = data.demo_holdings || []; const purchases = data.demo_purchases || []; const retirements = data.retirements || []; const reports = data.reports || [];
        panel.hidden = false;
        panel.innerHTML = `<h2>${escapeHtml(data.profile.company_name || 'Authorized SME')} · authorized data</h2><p class="revenue-note">Demo only — no real carbon credits, certificates, or environmental impact are inferred.</p><h3>Simulated holdings</h3>${demoHoldings.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Registry</th><th>Quantity</th></tr></thead><tbody>${demoHoldings.map(item => `<tr><td>${escapeHtml(item.project_name)}</td><td>${escapeHtml(item.registry_reference)}</td><td>${Number(item.quantity_tco2e).toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No approved simulated holdings recorded.</p>'}<h3>Simulated purchases</h3>${purchases.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Project</th><th>Quantity</th><th>Simulated total</th><th>Status</th></tr></thead><tbody>${purchases.map(item => `<tr><td>${date(item.created_at)}</td><td>${escapeHtml(item.project_name)}</td><td>${Number(item.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${cash(item.simulated_total_myr)}</td><td>${escapeHtml(item.request_status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No simulated purchase records.</p>'}<h3>Retirement information</h3>${retirements.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Project</th><th>Quantity</th><th>Status</th></tr></thead><tbody>${retirements.map(item => `<tr><td>${date(item.created_at)}</td><td>${escapeHtml(item.project_name)}</td><td>${Number(item.quantity_tco2e || 0).toFixed(2)} tCO₂e</td><td>${escapeHtml(item.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No retirement requests recorded. No retirement certificate is implied.</p>'}<h3>Available reports</h3>${reports.length ? `<div class="table-wrap"><table><thead><tr><th>Requested</th><th>Period</th><th>Status</th></tr></thead><tbody>${reports.map(item => `<tr><td>${date(item.created_at)}</td><td>${escapeHtml(item.period_start)} – ${escapeHtml(item.period_end)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No available report records.</p>'}`;
      } catch (error) { document.querySelector('#partnerReportDetail').hidden = true; showError(error); }
      finally { button.disabled = false; }
    }));
  }

  async function partnerProjectsView() {
    if (!await rpc('canopy_has_subscription', { p_plan: 'partner' })) {
      content('<div class="revenue-locked"><h2>Partner Portal is locked</h2><p>An active Partner Portal subscription is required to view project details.</p></div>');
      return;
    }
    const projects = await query('canopy_demo_projects', table => table.select('project_name,location,project_type,description,registry_name,registry_project_id,simulated_price_myr,simulated_inventory_tco2e,public_reference_url,registry_url,demo_trading_enabled').eq('listing_active', true).order('project_name'));
    const types = [...new Set(projects.map(project => project.project_type))].sort(); const locations = [...new Set(projects.map(project => project.location))].sort();
    content(`<div class="page-heading"><div><span class="eyebrow">PROJECT INFORMATION</span><h1>Carbon projects</h1><p>Read-only demonstration catalogue. Prices, quantities and availability are simulated; no purchase or ownership is offered here.</p></div></div>${demoLabel}${projects.length ? `<form id="partnerProjectFilters" class="revenue-inline-form"><label>Search<input name="search" placeholder="Project or location"></label><label>Project type<select name="type"><option value="">All types</option>${types.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select></label><label>Location<select name="location"><option value="">All locations</option>${locations.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select></label></form><p id="partnerProjectEmpty" class="muted" hidden>No simulated projects match these filters.</p><div class="table-wrap"><table><thead><tr><th>Project</th><th>Location / type</th><th>Registry reference</th><th>Simulated price</th><th>Simulated availability</th><th>Documents</th></tr></thead><tbody>${projects.map(project => `<tr data-project-row data-name="${escapeHtml(`${project.project_name} ${project.location}`.toLowerCase())}" data-type="${escapeHtml(project.project_type)}" data-location="${escapeHtml(project.location)}"><td><strong>${escapeHtml(project.project_name)}</strong><details><summary>Project details</summary><p>${escapeHtml(project.description || 'No description supplied.')}</p></details></td><td>${escapeHtml(project.location)}<small>${escapeHtml(project.project_type)}</small></td><td>${escapeHtml(project.registry_name)} ${escapeHtml(project.registry_project_id)}</td><td>${cash(project.simulated_price_myr)} / tCO₂e</td><td>${Number(project.simulated_inventory_tco2e || 0).toFixed(2)} tCO₂e<small>${project.demo_trading_enabled ? 'Demo listing active' : 'Demo trading disabled'}</small></td><td><a href="${escapeHtml(project.public_reference_url)}" target="_blank" rel="noreferrer">Public reference</a><small><a href="${escapeHtml(project.registry_url)}" target="_blank" rel="noreferrer">Registry record</a></small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No simulated project listings are currently active.</p>'}`);
    const filters = document.querySelector('#partnerProjectFilters'); if (!filters) return;
    const applyFilters = () => { const values = new FormData(filters); const search = String(values.get('search') || '').trim().toLowerCase(); const type = values.get('type'); const location = values.get('location'); let shown = 0; document.querySelectorAll('[data-project-row]').forEach(row => { const visible = (!search || row.dataset.name.includes(search)) && (!type || row.dataset.type === type) && (!location || row.dataset.location === location); row.hidden = !visible; if (visible) shown += 1; }); document.querySelector('#partnerProjectEmpty').hidden = shown > 0; };
    filters.addEventListener('input', applyFilters); filters.addEventListener('change', applyFilters);
  }

  async function adminSubscriptionsView() {
    const [subscriptions, orders] = await Promise.all([
      query('canopy_subscriptions', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_billing_orders', table => table.select('*').in('order_type', ['premium_subscription', 'partner_subscription']).order('created_at', { ascending: false }))
    ]);
    const userIds = [...new Set([...subscriptions.map(row => row.user_id), ...orders.map(row => row.user_id)])];
    const profiles = userIds.length ? await query('profiles', table => table.select('id,company_name,contact_name,role,verification_status').in('id', userIds)) : [];
    const profileMap = new Map(profiles.map(row => [row.id, row]));
    const orderMap = new Map(orders.map(row => [row.id, row]));
    const activeCount = subscriptions.filter(row => isActive(row)).length;
    const pendingOrders = orders.filter(row => ['pending', 'overdue'].includes(row.payment_status));
    content(`<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Subscription management</h1><p>Review Premium and Partner entitlements, renewal dates and billing state. Sandbox orders are never treated as collected cash.</p></div></div><div class="metric-grid"><article><span>Active subscriptions</span><strong>${activeCount}</strong></article><article><span>Pending / overdue orders</span><strong>${pendingOrders.length}</strong></article></div>${subscriptions.length ? `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Plan</th><th>Subscription status</th><th>Monthly price</th><th>Renewal</th><th>Latest billing status</th></tr></thead><tbody>${subscriptions.map(row => { const account = profileMap.get(row.user_id); const order = orderMap.get(row.billing_order_id); return `<tr><td>${escapeHtml(account?.company_name || account?.contact_name || row.user_id)}</td><td>${escapeHtml(account?.role || 'Unknown')}</td><td>${escapeHtml(row.plan)}</td><td>${status(row.status)}</td><td>${cash(row.monthly_price_myr)}</td><td>${date(row.renewal_at)}</td><td>${order ? `${status(order.payment_status)}${order.payment_mode === 'sandbox' ? '<small>Demo only · no money collected</small>' : ''}` : 'No linked billing order'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No subscriptions recorded yet.</p>'}<section class="revenue-section"><h2>Subscription billing orders</h2>${orders.length ? `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Plan</th><th>Amount</th><th>Payment mode</th><th>Payment status</th><th>Reference / action</th></tr></thead><tbody>${orders.map(row => { const account = profileMap.get(row.user_id); const canManage = row.payment_mode === 'provider'; return `<tr><td>${escapeHtml(account?.company_name || account?.contact_name || row.user_id)}</td><td>${escapeHtml(row.order_type.replaceAll('_', ' '))}</td><td>${cash(row.amount_myr)}</td><td>${escapeHtml(row.payment_mode)}</td><td>${status(row.payment_status)}</td><td>${canManage ? `<form class="admin-subscription-order-form" data-order="${row.id}"><select name="status"><option value="pending" ${row.payment_status === 'pending' ? 'selected' : ''}>Pending</option><option value="paid" ${row.payment_status === 'paid' ? 'selected' : ''}>Paid</option><option value="overdue" ${row.payment_status === 'overdue' ? 'selected' : ''}>Overdue</option></select><input name="reference" placeholder="Provider reference" value="${escapeHtml(row.payment_reference || '')}"><input name="note" placeholder="Audit note" required minlength="3"><button class="btn secondary" type="submit">Save</button></form>` : '<small>Sandbox · not collected · status changes disabled</small>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No subscription billing orders recorded yet.</p>'}</section>`);
    document.querySelectorAll('.admin-subscription-order-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form);
      const button = form.querySelector('button'); button.disabled = true;
      try {
        await rpc('canopy_admin_set_billing_status', { p_order_id: form.dataset.order, p_status: values.get('status'), p_reference: values.get('reference'), p_note: values.get('note') });
        context.toast('Subscription billing status and audit record saved.');
        await context.refresh();
      } catch (error) { button.disabled = false; showError(error); }
    }));
  }

  async function adminRevenueView() {
    let simulatedCharts = null;
    let planning = null;
    try { simulatedCharts = await rpc('canopy_admin_simulated_revenue_charts'); } catch (_) { /* Migration 012 may not be applied yet. */ }
    try { planning = await rpc('canopy_admin_revenue_planning', { p_month: context.revenueTargetMonth || null }); } catch (_) { /* Migration 014 may not be applied yet. */ }
    const [data, billing, charges, settings] = await Promise.all([
      rpc('canopy_admin_revenue_dashboard'),
      query('canopy_billing_orders', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_transaction_charges', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_referral_settings', table => table.select('*').eq('singleton', true).limit(1))
    ]);
    const actual = data.paid_actuals || {};
    const names = { carbon_transaction_fees: 'Carbon transaction fees', premium_subscription: 'Premium subscriptions', esg_reporting: 'Carbon & ESG reports', partner_subscription: 'Partner Portal subscriptions' };
    const streams = Object.keys(names);
    const paidTotal = streams.reduce((sum, key) => sum + Number(actual[key] || 0), 0);
    const outstanding = billing.filter(row => ['pending', 'overdue'].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.amount_myr || 0), 0)
      + charges.filter(row => ['pending', 'overdue'].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.sme_fee_myr || 0), 0);
    const sandboxTotal = billing.filter(row => row.payment_status === 'sandbox_paid').reduce((sum, row) => sum + Number(row.amount_myr || 0), 0);
    const plan = planning?.forecast || null;
    const forecast = plan ? [Number(plan.active_smes) * Number(plan.average_transaction_value_myr) * Number(plan.transactions_per_sme) * .015, Number(plan.premium_subscribers) * Number(plan.premium_price_myr), Number(plan.report_count) * Number(plan.report_price_myr), Number(plan.partner_subscribers) * Number(plan.partner_price_myr)] : [0, 0, 0, 0];
    const forecastLabels = ['Transaction fees', 'Premium', 'ESG reports', 'Partner subscriptions'];
    const forecastFormulas = plan ? [`${plan.active_smes} SMEs × ${cash(plan.average_transaction_value_myr)} × ${plan.transactions_per_sme} transactions × 1.5%`, `${plan.premium_subscribers} subscribers × ${cash(plan.premium_price_myr)}`, `${plan.report_count} reports × ${cash(plan.report_price_myr)}`, `${plan.partner_subscribers} Partners × ${cash(plan.partner_price_myr)}`] : [];
    const monthly = data.monthly || [];
    const byMonth = new Map();
    monthly.forEach(row => byMonth.set(row.month, (byMonth.get(row.month) || 0) + Number(row.amount_myr || 0)));
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTotal = [...byMonth.entries()].filter(([month]) => month.startsWith(currentMonth)).reduce((sum, [, amount]) => sum + amount, 0);
    const peak = Math.max(1, ...byMonth.values());
    const setting = settings[0] || { reward_type: 'disabled', reward_percent: 0, reward_fixed_myr: 0 };
    const simulatedStreams = simulatedCharts?.streams || {};
    const simulatedNames = { transaction_fees: '1.5% transaction fees', premium: 'SME Premium', esg_reports: 'ESG report fees', partner_subscriptions: 'Partner subscriptions' };
    const simulatedRows = Object.keys(simulatedNames).map(key => ({ label: simulatedNames[key], value: Number(simulatedStreams[key] || 0) }));
    const simulatedTotal = simulatedRows.reduce((sum, row) => sum + row.value, 0);
    const recentSimulated = (simulatedCharts?.daily || []).map(row => ({ label: String(row.day || '').slice(5), value: Number(row.amount_myr || 0) }));
    const selectedMonth = planning?.month_start || context.revenueTargetMonth || new Date().toISOString().slice(0, 7) + '-01';
    const target = planning?.target_myr == null ? null : Number(planning.target_myr); const monthlyReceipts = Number(planning?.receipts_myr || 0); const achieved = target && target > 0 ? monthlyReceipts / target * 100 : null; const remaining = target == null ? null : Math.max(0, target - monthlyReceipts);
    const targetMonthNumber = Number(selectedMonth.slice(5, 7)); const targetYear = Number(selectedMonth.slice(0, 4));
    const targetMonthOptions = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((name, index) => `<option value="${index + 1}" ${targetMonthNumber === index + 1 ? 'selected' : ''}>${name}</option>`).join('');
    const targetSummary = planning ? `<article class="revenue-target-card"><div class="revenue-target-top"><div><span>Monthly target</span><strong>${target == null ? 'Target not configured' : cash(target)}</strong></div><details class="revenue-target-picker"><summary aria-label="Select target month and year">${escapeHtml(new Date(targetYear, targetMonthNumber - 1).toLocaleString('en-MY', { month: 'short', year: 'numeric' }))}</summary><div><select id="revenueTargetMonth" aria-label="Target month">${targetMonthOptions}</select><input id="revenueTargetYear" aria-label="Target year" type="number" min="2000" max="2100" step="1" value="${targetYear}"></div></details></div><button class="btn secondary" id="editRevenueTarget" type="button">Edit target</button></article>${target == null ? '' : `<article class="revenue-target-card"><span>${escapeHtml(selectedMonth.slice(0, 7))} receipts</span><strong>${cash(monthlyReceipts)} · ${achieved == null ? '—' : `${achieved.toFixed(1)}%`}</strong><div style="margin-top:10px;height:8px;border-radius:999px;background:#e4eee7"><span style="display:block;width:${Math.min(100, achieved || 0)}%;height:100%;border-radius:inherit;background:#73a65b"></span></div><small>${remaining > 0 ? `${cash(remaining)} remaining` : 'Target achieved'}</small></article>`}` : `<article class="revenue-target-card"><span>Monthly target</span><strong>Target settings unavailable</strong></article>`;
    const forecastPlanningSection = plan ? `<section class="revenue-section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h2>Revenue Planning & Forecast</h2><p class="revenue-note">Planning assumptions only — not actual or simulated collected revenue. Editing prices here never changes live billing.</p></div><button class="btn secondary" id="editRevenueForecast" type="button">Edit forecast</button></div><div class="table-wrap"><table><thead><tr><th>Stream</th><th>Saved formula / assumption</th><th>Projected monthly</th></tr></thead><tbody>${forecastLabels.map((label, index) => `<tr><td>${label}</td><td>${escapeHtml(forecastFormulas[index])}</td><td>${cash(forecast[index])}</td></tr>`).join('')}<tr><th colspan="2">Total forecast</th><th>${cash(forecast.reduce((sum, value) => sum + value, 0))}</th></tr></tbody></table></div></section>` : `<section class="revenue-section"><h2>Revenue Planning & Forecast</h2><p class="muted">Forecast settings will be available after Migration 014 is applied.</p></section>`;
    const simulatedChartSection = simulatedCharts ? `<section class="revenue-section"><h2>Confirmed simulated receipts</h2><p class="revenue-note">Demo / simulated activity only — not formal accounting revenue. Carbon-credit principal, wallet top-ups, pending, rejected and refunded amounts are excluded.</p><div class="metric-grid"><article><span>All-time simulated receipts</span><strong>${cash(simulatedTotal)}</strong></article>${targetSummary}</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px"><article class="revenue-section" style="margin:0;min-height:310px"><h3>Revenue by stream</h3>${chartDoughnut(simulatedRows, 'Confirmed simulated receipts by stream', '', cash)}</article><article class="revenue-section" style="margin:0;min-height:310px"><h3>Daily simulated receipts · 7 days</h3>${chartBars(recentSimulated, 'Last seven days of confirmed simulated receipts')}</article></div></section>` : `<section class="revenue-section"><h2>Confirmed simulated receipts</h2><p class="muted">Chart data will be available after the Admin chart migration is applied.</p></section>`;
    content(`<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Revenue dashboard</h1><p>Formal collected revenue and simulated prototype activity are shown separately.</p></div></div>${simulatedChartSection}<div class="metric-grid"><article><span>Paid actual, all time</span><strong>${cash(paidTotal)}</strong></article><article><span>Paid actual this month</span><strong>${cash(monthTotal)}</strong></article><article><span>Pending / overdue</span><strong>${cash(outstanding)}</strong></article><article><span>Sandbox only · not collected</span><strong>${cash(sandboxTotal)}</strong></article><article><span>Forecast monthly</span><strong>${cash(forecast.reduce((sum, value) => sum + value, 0))}</strong></article></div><section class="revenue-section"><h2>Actual revenue by stream</h2><div class="table-wrap"><table><thead><tr><th>Stream</th><th>Paid and collected</th></tr></thead><tbody>${streams.map(key => `<tr><td>${names[key]}</td><td>${cash(actual[key])}</td></tr>`).join('')}<tr><th>Total</th><th>${cash(paidTotal)}</th></tr></tbody></table></div></section>${forecastPlanningSection}<section class="revenue-section"><h2>SME transaction fee settlement</h2>${charges.length ? `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Type</th><th>Transaction value</th><th>Fee</th><th>Status / audit</th></tr></thead><tbody>${charges.map(row => `<tr><td>${escapeHtml(row.request_id)}</td><td>${escapeHtml(row.transaction_type)}</td><td>${cash(row.transaction_value_myr)}</td><td>${cash(row.sme_fee_myr)}</td><td>${status(row.payment_status)}<form class="transaction-charge-form" data-charge="${row.id}"><select name="status"><option value="pending" ${row.payment_status === 'pending' ? 'selected' : ''}>Pending</option><option value="paid" ${row.payment_status === 'paid' ? 'selected' : ''}>Paid</option><option value="overdue" ${row.payment_status === 'overdue' ? 'selected' : ''}>Overdue</option><option value="needs_review" ${row.payment_status === 'needs_review' ? 'selected' : ''}>Needs review</option></select><input name="reference" placeholder="Settlement ref" value="${escapeHtml(row.payment_reference || '')}"><input name="note" placeholder="Audit note" required minlength="3"><button class="btn secondary" type="submit">Save</button></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No completed buy/sell fees recorded yet.</p>'}</section><section class="revenue-section"><h2>Referral reward configuration</h2><p>Rewards remain disabled until an Admin sets a rate. No default commission is assumed.</p><form id="referralRewardForm" class="revenue-inline-form"><label>Reward type<select name="type"><option value="disabled" ${setting.reward_type === 'disabled' ? 'selected' : ''}>Disabled</option><option value="percentage" ${setting.reward_type === 'percentage' ? 'selected' : ''}>Percentage of transaction value</option><option value="fixed_myr" ${setting.reward_type === 'fixed_myr' ? 'selected' : ''}>Fixed MYR per referral</option></select></label><label>Percent<input name="percent" type="number" min="0" max="100" step="0.01" value="${Number(setting.reward_percent || 0) * 100}"></label><label>Fixed MYR<input name="fixed" type="number" min="0" step="0.01" value="${Number(setting.reward_fixed_myr || 0)}"></label><button class="btn primary" type="submit">Save configuration</button></form></section>${charges.some(row => row.payment_status === 'needs_review') ? '<section class="warning">Some transaction values or owners need reconciliation against the existing carbon_requests schema. Those fees are not counted as revenue.</section>' : ''}`);
    const refreshRevenueTargetMonth = () => {
      const month = Number(document.querySelector('#revenueTargetMonth')?.value);
      const year = Number(document.querySelector('#revenueTargetYear')?.value);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) return;
      context.revenueTargetMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      adminRevenueView();
    };
    document.querySelector('#revenueTargetMonth')?.addEventListener('change', refreshRevenueTargetMonth);
    document.querySelector('#revenueTargetYear')?.addEventListener('change', refreshRevenueTargetMonth);
    document.querySelector('#editRevenueTarget')?.addEventListener('click', () => {
      const dialog = modal(`<h2>Set monthly simulated target</h2><form id="revenueTargetModalForm" class="revenue-inline-form"><label>Month<select name="month">${targetMonthOptions}</select></label><label>Year<input name="year" type="number" min="2000" max="2100" step="1" required value="${targetYear}"></label><label>Target (RM)<input name="target" type="number" min="0" step="0.01" required value="${target == null ? '' : target}"></label><button class="btn primary" type="submit">Save target</button><button class="btn secondary" id="cancelRevenueTargetModal" type="button">Cancel</button><p id="revenueTargetModalFeedback" class="feedback-message" aria-live="polite"></p></form>`);
      dialog.querySelector('#cancelRevenueTargetModal').onclick = () => dialog.close();
      dialog.querySelector('#revenueTargetModalForm').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const month = Number(values.get('month')); const year = Number(values.get('year')); const feedback = dialog.querySelector('#revenueTargetModalFeedback'); if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) { feedback.className = 'feedback-message feedback-error'; feedback.textContent = 'Choose a valid month and year.'; return; } const monthKey = `${year}-${String(month).padStart(2, '0')}-01`; const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Saving…'; try { await rpc('canopy_admin_set_revenue_target', { p_month: monthKey, p_target_myr: Number(values.get('target')) }); context.revenueTargetMonth = monthKey; dialog.close(); context.toast('Simulated monthly revenue target saved.', 'success'); await adminRevenueView(); } catch (error) { button.disabled = false; button.textContent = 'Save target'; feedback.className = 'feedback-message feedback-error'; feedback.textContent = error?.message || 'Could not save the target.'; } });
    });
    document.querySelector('#editRevenueForecast')?.addEventListener('click', () => {
      const dialog = modal(`<h2>Edit revenue planning forecast</h2><p class="revenue-note">Planning assumptions only. These values never change live prices, billing, wallets, or subscriptions.</p><form id="revenueForecastModalForm" class="revenue-inline-form"><label>Active SMEs<input name="active_smes" type="number" min="0" step="1" required value="${plan.active_smes}"></label><label>Average transaction (RM)<input name="average_transaction_value_myr" type="number" min="0" step="0.01" required value="${plan.average_transaction_value_myr}"></label><label>Transactions / SME<input name="transactions_per_sme" type="number" min="0" step="0.01" required value="${plan.transactions_per_sme}"></label><label>Premium subscribers<input name="premium_subscribers" type="number" min="0" step="1" required value="${plan.premium_subscribers}"></label><label>Premium price (RM)<input name="premium_price_myr" type="number" min="0" step="0.01" required value="${plan.premium_price_myr}"></label><label>Paid reports<input name="report_count" type="number" min="0" step="1" required value="${plan.report_count}"></label><label>Report fee (RM)<input name="report_price_myr" type="number" min="0" step="0.01" required value="${plan.report_price_myr}"></label><label>Paying Partners<input name="partner_subscribers" type="number" min="0" step="1" required value="${plan.partner_subscribers}"></label><label>Partner price (RM)<input name="partner_price_myr" type="number" min="0" step="0.01" required value="${plan.partner_price_myr}"></label><p id="forecastModalTotal" class="revenue-note"></p><button class="btn primary" type="submit">Save forecast</button><button class="btn secondary" id="cancelRevenueForecastModal" type="button">Cancel</button><p id="revenueForecastModalFeedback" class="feedback-message" aria-live="polite"></p></form>`);
      const form = dialog.querySelector('#revenueForecastModalForm'); const preview = () => { const v = name => Number(new FormData(form).get(name) || 0); dialog.querySelector('#forecastModalTotal').textContent = `Live forecast total: ${cash(v('active_smes') * v('average_transaction_value_myr') * v('transactions_per_sme') * .015 + v('premium_subscribers') * v('premium_price_myr') + v('report_count') * v('report_price_myr') + v('partner_subscribers') * v('partner_price_myr'))}`; }; preview(); form.addEventListener('input', preview); dialog.querySelector('#cancelRevenueForecastModal').onclick = () => dialog.close();
      form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button[type="submit"]'); const feedback = dialog.querySelector('#revenueForecastModalFeedback'); button.disabled = true; button.textContent = 'Saving…'; try { await rpc('canopy_admin_set_revenue_forecast', { p_assumptions: Object.fromEntries(new FormData(form)) }); dialog.close(); context.toast('Revenue planning assumptions saved.', 'success'); await adminRevenueView(); } catch (error) { button.disabled = false; button.textContent = 'Save forecast'; feedback.className = 'feedback-message feedback-error'; feedback.textContent = error?.message || 'Could not save the forecast.'; } });
    });
    document.querySelector('#referralRewardForm').addEventListener('submit', async event => {
      event.preventDefault(); const values = new FormData(event.currentTarget); const button = event.submitter; if (button) button.disabled = true;
      try { await rpc('canopy_admin_set_referral_reward', { p_type: values.get('type'), p_percent: Number(values.get('percent')) / 100, p_fixed_myr: Number(values.get('fixed')) }); context.toast('Referral reward configuration saved.'); await context.refresh(); }
      catch (error) { if (button) button.disabled = false; showError(error); }
    });
    document.querySelectorAll('.transaction-charge-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); const values = new FormData(form); const button = form.querySelector('button'); button.disabled = true;
      try { await rpc('canopy_admin_set_transaction_fee_status', { p_charge_id: form.dataset.charge, p_status: values.get('status'), p_reference: values.get('reference'), p_note: values.get('note') }); context.toast('Transaction fee status and audit record saved.'); await context.refresh(); }
      catch (error) { button.disabled = false; showError(error); }
    }));
  }

  async function walletView() {
    const wallet = await rpc('canopy_demo_wallet_summary');
    const transactions = wallet.transactions || [];
    const feedback=context.walletNotice||null; context.walletNotice=null;
    content(`<div class="page-heading"><div><span class="eyebrow">SIMULATED FUNDS</span><h1>Demo RM Wallet</h1><p>Demo only — no real money. Wallet funds support simulated Canopy actions only.</p></div></div><div class="metric-grid"><article><span>Demo balance</span><strong>${cash(wallet.balance_myr)}</strong></article></div><section class="revenue-section"><h2>Top up demo balance</h2><form id="walletTopUpForm" class="revenue-inline-form"><label>Amount (MYR)<input name="amount" type="number" min="1" step="0.01" required></label><button class="btn primary" type="submit">Add demo funds</button></form>${feedback?`<p class="feedback-message feedback-${feedback.type}" aria-live="polite">${escapeHtml(feedback.text)}</p>`:''}</section><section class="revenue-section"><h2>Wallet transactions</h2><form id="walletExportForm" class="revenue-inline-form"><label>From<input name="start" type="date"></label><label>To<input name="end" type="date"></label><button class="btn secondary" type="submit">Download Transaction History (Excel)</button></form>${transactions.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead><tbody>${transactions.map(row=>`<tr><td>${date(row.created_at)}</td><td>${escapeHtml(walletTypeLabel(row))}</td><td>${cash(row.amount_myr)}</td><td>${escapeHtml(row.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No demo wallet transactions yet.</p>'}</section>`);
    document.querySelector('#walletTopUpForm').addEventListener('submit', async event => { event.preventDefault(); const button=event.submitter; if(button)button.disabled=true; try { await rpc('canopy_demo_wallet_top_up',{p_amount_myr:Number(new FormData(event.currentTarget).get('amount')),p_idempotency_key:crypto.randomUUID()}); context.walletNotice={type:'success',text:'✓ Demo wallet top-up recorded. No real money was received.'}; context.toast(context.walletNotice.text,'success'); await mount('wallet',context); } catch(error) { if(button)button.disabled=false; context.walletNotice={type:'error',text:error?.message||'Could not add demo funds.'}; context.toast(context.walletNotice.text,'error'); await mount('wallet',context); } });
    document.querySelector('#walletExportForm').addEventListener('submit', async event => { event.preventDefault(); const button=event.submitter; if(button?.disabled)return; const values=new FormData(event.currentTarget); const start=values.get('start'); const end=values.get('end'); if(end&&start&&end<start){context.toast('The end date must be on or after the start date.','error');return;} const rows=transactions.filter(row=>inPeriod(row.created_at,start,end)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); if(!rows.length){context.toast('No wallet transactions match this date range.','error');return;} if(button)button.disabled=true; try{let running=transactions.filter(row=>start&&String(row.created_at).slice(0,10)<start).reduce((sum,row)=>sum+Number(row.amount_myr||0),0); const opening=running; const exported=rows.map(row=>{running+=Number(row.amount_myr||0);return [new Date(row.created_at).toLocaleString('en-MY'),walletTypeLabel(row),row.note||'',Number(row.amount_myr)>0?Number(row.amount_myr):'',Number(row.amount_myr)<0?Math.abs(Number(row.amount_myr)): '',running];}); const inflows=rows.filter(row=>Number(row.amount_myr)>0).reduce((sum,row)=>sum+Number(row.amount_myr),0);const outflows=rows.filter(row=>Number(row.amount_myr)<0).reduce((sum,row)=>sum+Math.abs(Number(row.amount_myr)),0);xlsxBook([{name:'Demo Wallet',headerRow:6,currencyColumns:[3,4,5],rows:[['DEMO ONLY — NO REAL MONEY'],['Opening balance MYR',opening],['Total inflows MYR',inflows],['Total outflows MYR',outflows],['Closing balance MYR',running],[],['Date / time','Transaction type','Description','Money in MYR','Money out MYR','Running balance MYR'],...exported]}],`Canopy_Demo_Wallet_Transactions_${new Date().toISOString().slice(0,10)}.xlsx`);context.toast('✓ Demo wallet Excel file generated and download started. No real money.','success');}catch(error){context.toast(error?.message||'Could not create the Demo Wallet Excel export.','error');}finally{if(button)button.disabled=false;} });
  }

  async function mount(view, values) {
    context = { ...values, view };
    try {
      if (context.profile?.role === 'partner' && context.profile?.verification_status !== 'verified') {
        content(`<div class="page-heading"><div><span class="eyebrow">PARTNER PORTAL</span><h1>Verification required</h1><p>Your Partner application is ${escapeHtml(context.profile?.verification_status || 'pending')}. An Admin must verify the organisation before Partner Portal or subscription features can be used.</p></div></div><section class="revenue-locked"><h2>Partner access is unavailable</h2><p>You can sign out while the application is being reviewed. No subscription, referral, client-data, project-information, or reporting action is available until verification is complete.</p></section>`);
        return;
      }
      if (view === 'wallet') return await walletView();
      if (view === 'premium') return await premiumView();
      if (view === 'reports') return await reportsView();
      if (view === 'partner') return await partnerView();
      if (view === 'partner-access') return await partnerAccessView();
      if (view === 'partner-profile') return await partnerProfileView();
      if (view === 'partner-reports') return await partnerReportsView();
      if (view === 'partner-projects') return await partnerProjectsView();
      if (view === 'admin-subscriptions') return await adminSubscriptionsView();
      if (view === 'revenue') return await adminRevenueView();
    } catch (error) {
      showError(error);
      content(`<div class="empty"><h3>Section unavailable</h3><p>${escapeHtml(error?.message || 'The service could not load this data.')}</p></div>`);
    }
  }

  window.CanopyRevenue = { mount };
})();
