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
  function walletTypeLabel(row) { if (row.transaction_type === 'billing_payment') return /esg|report/i.test(row.note || '') ? 'ESG report payment' : 'Subscription payment'; return ({ top_up: 'Demo top-up', purchase_reserve: 'Purchase reservation', purchase_refund: 'Purchase refund' })[row.transaction_type] || row.transaction_type; }
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
    await context.refresh();
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
        button.textContent = 'Confirmed';
        await context.refresh();
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
    const earlyNotice = newProjects.length ? `<div class="notice"><span class="notice-icon">✦</span><span><strong>Early project access</strong> ${newProjects.map(project => `${escapeHtml(project.name)} (${date(project.created_at)})`).join(', ')}. Availability is subject to inventory.</span></div>` : '<p class="revenue-note">No new project releases in the past 48 hours.</p>';
    const demoHoldings = new Map(); demo.ledger.forEach(row => demoHoldings.set(row.project_id, (demoHoldings.get(row.project_id) || 0) + Number(row.delta_tco2e || 0))); const held = [...demoHoldings.entries()].filter(([, quantity]) => quantity > 0); const listed = [...demo.projects.values()].filter(project => Number(project.simulated_inventory_tco2e || 0) >= 0.01);
    const contentStats = active ? `<section class="revenue-section"><h2>Premium tools</h2>${earlyNotice}<p class="revenue-note">All values below are simulated only; no real carbon-credit ownership is represented.</p><div class="metric-grid"><article><span>Tracked demo holdings</span><strong>${held.length}</strong></article><article><span>Approved simulated tCO₂e</span><strong>${held.reduce((sum, [, quantity]) => sum + quantity, 0).toFixed(2)}</strong></article><article><span>Active demo listings</span><strong>${listed.length}</strong></article></div><h3>Approved simulated holdings</h3>${held.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Quantity</th></tr></thead><tbody>${held.map(([id, quantity]) => `<tr><td>${escapeHtml(demo.projects.get(id)?.project_name || id)}</td><td>${quantity.toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No Admin-approved simulated holdings yet.</p>'}<h3>Active demo marketplace listings</h3><div class="table-wrap"><table><thead><tr><th>Project</th><th>Simulated price</th><th>Simulated quantity</th></tr></thead><tbody>${listed.map(project => `<tr><td>${escapeHtml(project.project_name)}</td><td>${cash(project.simulated_price_myr)} / tCO₂e</td><td>${Number(project.simulated_inventory_tco2e).toFixed(2)} tCO₂e</td></tr>`).join('')}</tbody></table></div></section>` : `<section class="revenue-locked"><h2>Premium features are locked</h2><p>Detailed analytics, advanced market information and early project access require an active Premium subscription.</p></section>`;
    content(`<div class="page-heading"><div><span class="eyebrow">SME PLAN</span><h1>Premium</h1><p>Free plan includes project browsing, basic portfolio tracking and transaction history.</p></div></div><div class="revenue-plan"><div><p class="eyebrow">PREMIUM PLAN</p><h2>RM250 / month</h2><p>Detailed portfolio analytics, advanced carbon-market information, early project notifications and 48-hour priority access to eligible new projects.</p></div><div><strong>Subscription status</strong><p>${status(plan?.status || 'Free plan')}</p><small>Renewal: ${date(plan?.renewal_at)}</small>${active && plan.status === 'active_demo' ? `<p>${demoLabel}</p>` : ''}${active ? '<button class="btn secondary" data-cancel-plan="premium">Cancel subscription</button>' : '<button class="btn primary" data-subscribe="premium_subscription">Upgrade to Premium</button>'}</div></div>${checkout(checkoutOrder, 'Premium monthly subscription')}${contentStats}<section class="revenue-section"><h2>Billing history</h2>${historyTable(history)}</section>`);
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
  function xlsxBook(sheets, filename) {
    const XLSX = window.XLSX; if (!XLSX) throw new Error('Excel export support did not load. Reconnect and try again.');
    const book = XLSX.utils.book_new();
    sheets.forEach(({ name, rows, headerRow = 0, currencyColumns = [], filter = true }) => {
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const width = Math.max(...rows.map(row => row.length));
      if (filter) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: Math.max(headerRow, rows.length - 1), c: Math.max(0, width - 1) } }) };
      sheet['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
      sheet['!cols'] = Array.from({ length: width }, (_, index) => ({ wch: Math.min(42, Math.max(14, ...rows.map(row => String(row[index] ?? '').length + 2))) }));
      currencyColumns.forEach(column => { for (let row = headerRow + 1; row < rows.length; row += 1) { const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell && typeof cell.v === 'number') cell.z = 'RM #,##0.00'; } });
      XLSX.utils.book_append_sheet(book, sheet, name);
    });
    XLSX.writeFile(book, filename);
  }
  const inPeriod = (value, start, end) => { const day = String(value || '').slice(0, 10); return (!start || day >= start) && (!end || day <= end); };
  async function demoData(start = '', end = '') {
    const [purchases, ledger, demoProjects, wallet] = await Promise.all([
      query('canopy_demo_purchase_requests', table => table.select('*').order('created_at', { ascending: true })),
      query('canopy_demo_entitlement_ledger', table => table.select('*').eq('event_type', 'allocation').order('created_at', { ascending: true })),
      query('canopy_demo_projects', table => table.select('id,project_name,simulated_price_myr,simulated_inventory_tco2e').order('project_name')),
      query('canopy_demo_wallet_transactions', table => table.select('*').order('created_at', { ascending: true }))
    ]);
    return { purchases: purchases.filter(row => inPeriod(row.created_at, start, end)), ledger: ledger.filter(row => inPeriod(row.created_at, start, end)), projects: new Map(demoProjects.map(row => [row.id, row])), wallet: wallet.filter(row => inPeriod(row.created_at, start, end)) };
  }
  async function downloadReportExcel(report) {
    const data = await demoData(report.period_start, report.period_end); const company = context.profile.company_name || context.profile.contact_name || 'SME';
    const holdings = new Map(); data.ledger.forEach(row => holdings.set(row.project_id, (holdings.get(row.project_id) || 0) + Number(row.delta_tco2e || 0)));
    let running = 0; const walletRows = data.wallet.map(row => { running += Number(row.amount_myr || 0); return [date(row.created_at), walletTypeLabel(row), row.note, Number(row.amount_myr) > 0 ? Number(row.amount_myr) : '', Number(row.amount_myr) < 0 ? Math.abs(Number(row.amount_myr)) : '', running]; });
    xlsxBook([
      { name: 'Summary', filter: false, rows: [['CANOPY DEMO — SIMULATED DATA, NOT REAL CARBON CREDITS'], ['Company', company], ['Reporting period', `${report.period_start} to ${report.period_end}`], ['Note', 'No environmental impact, certificates, or real carbon-credit ownership is inferred.']] },
      { name: 'Transaction History', currencyColumns: [3, 4, 5, 6], rows: [['Date', 'Project', 'Quantity tCO2e', 'Unit price MYR', 'Credit value MYR', 'Fee MYR', 'Total MYR', 'Status'], ...data.purchases.map(row => { const project = data.projects.get(row.project_id); return [date(row.created_at), project?.project_name || row.project_id, Number(row.quantity_tco2e), Number(row.simulated_unit_price_myr), Number(row.simulated_credit_value_myr), Number(row.simulated_platform_fee_myr), Number(row.simulated_total_myr), row.request_status]; })] },
      { name: 'Carbon Holdings', rows: [['Project', 'Approved simulated quantity tCO2e'], ...[...holdings.entries()].map(([id, quantity]) => [data.projects.get(id)?.project_name || id, quantity])] },
      { name: 'Demo Wallet', currencyColumns: [3, 4, 5], rows: [['Date', 'Type', 'Description', 'Money in MYR', 'Money out MYR', 'Running balance MYR'], ...walletRows] }
    ], `Canopy_Demo_Carbon_ESG_Report_${report.period_start}_${report.period_end}.xlsx`);
  }
  function reportLines(data) {
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
    dialog.querySelector('#openWallet').onclick=()=>{dialog.close();context.openWallet?.();}; const button=dialog.querySelector('#confirmReport'); button.onclick=async()=>{button.disabled=true;button.textContent='Confirming…';try{await completeDemo(order.id);const feedback=dialog.querySelector('#reportPaymentResult');feedback.className='feedback-message feedback-success';feedback.textContent='✓ Demo payment confirmed. Your Excel report is ready in Report History.';context.toast('✓ Demo report payment confirmed. No real money was collected.','success');await context.refresh();}catch(error){button.disabled=false;button.textContent='Confirm demo payment';const feedback=dialog.querySelector('#reportPaymentResult');feedback.className='feedback-message feedback-error';feedback.textContent=error?.message||'Could not confirm this demo payment.';}};
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
        context.toast('✓ Demo Carbon & ESG Excel report downloaded. Simulated data only.', 'success');
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
    const [plan, history, entitled] = await Promise.all([subscription('partner'), billingHistory('partner_subscription'), rpc('canopy_has_subscription', { p_plan: 'partner' })]);
    const active = isActive(plan) && Boolean(entitled);
    const openOrder = history.find(row => row.payment_status === 'pending');
    const checkoutOrder = context.pendingOrder?.order_type === 'partner_subscription' ? context.pendingOrder : openOrder;
    let portal = `<section class="revenue-locked"><h2>Partner Portal is locked</h2><p>An active Partner subscription is required to use referral, client-data and reporting tools.</p></section>`;
    let code = '';
    let analytics = { total_referred: 0, verified_referred: 0, transaction_volume_myr: 0, credits_purchased: 0, credits_retired: 0, reward_type: 'disabled' };
    let clients = [];
    let insights = null;
    if (active) {
      [code, clients, insights] = await Promise.all([
        rpc('canopy_create_partner_code'), rpc('canopy_partner_clients'), rpc('canopy_partner_market_insights')
      ]);
      analytics = {
        ...analytics,
        total_referred: clients.length,
        verified_referred: clients.filter(client => client.verification_status === 'verified').length
      };
      const rewardEstimate = analytics.reward_type === 'percentage'
        ? Number(analytics.transaction_volume_myr || 0) * Number(analytics.reward_percent || 0)
        : analytics.reward_type === 'fixed_myr'
          ? Number(analytics.total_referred || 0) * Number(analytics.reward_fixed_myr || 0)
          : 0;
      const link = new URL('./', location.href);
      link.searchParams.set('ref', code);
      portal = `<section class="revenue-section"><h2>Your referral link</h2><div class="revenue-referral"><input id="partnerReferralLink" readonly value="${escapeHtml(link.href)}"><button class="btn secondary" id="copyReferral">Copy link</button></div></section><div class="metric-grid"><article><span>SMEs referred</span><strong>${analytics.total_referred || 0}</strong></article><article><span>Active (verified) SMEs</span><strong>${analytics.verified_referred || 0}</strong></article><article><span>Transaction volume</span><strong>${cash(analytics.transaction_volume_myr)}</strong></article><article><span>Credits purchased / retired</span><strong>${Number(analytics.credits_purchased || 0).toLocaleString()} / ${Number(analytics.credits_retired || 0).toLocaleString()} tCO₂e</strong></article><article><span>Configured reward estimate · not settled</span><strong>${analytics.reward_type === 'disabled' ? 'Not configured' : cash(rewardEstimate)}</strong></article></div><p class="revenue-note">Referral reward: ${analytics.reward_type === 'disabled' ? 'not configured by Admin' : analytics.reward_type === 'percentage' ? `${Number(analytics.reward_percent) * 100}% (Admin configured)` : `${cash(analytics.reward_fixed_myr)} per qualifying referral (Admin configured)`}. The estimate is not a settlement or payment obligation.</p><section class="revenue-section"><h2>Referred SMEs</h2>${clients.length ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Verification</th><th>Carbon data permission</th><th></th></tr></thead><tbody>${clients.map(client => `<tr><td>${escapeHtml(client.company_name)}</td><td>${escapeHtml(client.verification_status)}</td><td>${client.consent_granted ? 'Authorized' : 'Not authorized'}</td><td>${client.consent_granted ? `<button class="btn secondary" data-client-data="${client.sme_id}">View activity</button>` : 'Awaiting SME permission'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No referred SMEs yet.</p>'}</section><section id="partnerClientDetail" class="revenue-section" hidden></section>`;
    }
    content(`<div class="page-heading"><div><span class="eyebrow">PARTNER PORTAL</span><h1>Partner dashboard</h1><p>Manage referrals, authorized client data and your subscription.</p></div></div><div class="revenue-plan"><div><p class="eyebrow">PARTNER SUBSCRIPTION</p><h2>${cash(500)} / month</h2><p>Referral management, client analytics, project information and reporting tools.</p></div><div><strong>Subscription status</strong><p>${status(plan?.status || 'Inactive')}</p><small>Renewal: ${date(plan?.renewal_at)}</small>${active && plan.status === 'active_demo' ? `<p>${demoLabel}</p>` : ''}${active ? '<button class="btn secondary" data-cancel-plan="partner">Cancel subscription</button>' : '<button class="btn primary" data-subscribe="partner_subscription">Subscribe</button>'}</div></div>${checkout(checkoutOrder, 'Partner Portal monthly subscription')}${portal}${active ? marketInsightsMarkup(insights) : ''}<section class="revenue-section"><h2>Billing history</h2>${historyTable(history)}</section>`);
    if (active) {
      document.querySelector('#copyReferral').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkValue()); context.toast('✓ Referral link copied successfully!', 'success'); } catch { context.toast('Could not copy the referral link. Please copy it from the field.', 'error'); }
      });
      document.querySelectorAll('[data-client-data]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const data = await rpc('canopy_partner_client_data', { p_sme_id: button.dataset.clientData });
          const panel = document.querySelector('#partnerClientDetail');
          panel.hidden = false;
          panel.innerHTML = `<h2>${escapeHtml(data.profile.company_name || 'Authorized SME')} activity</h2><p>Registration: ${escapeHtml(data.profile.registration_number || 'Not supplied')} · Sector: ${escapeHtml(data.profile.sector || 'Not supplied')}</p><h3>Holdings</h3>${data.holdings.length ? `<ul>${data.holdings.map(item => `<li>${escapeHtml(item.project?.name || item.project_id)}: ${Number(item.quantity_tco2e || 0).toLocaleString()} tCO₂e</li>`).join('')}</ul>` : '<p>No holdings recorded.</p>'}<h3>Transactions</h3>${data.requests.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Quantity</th><th>Status</th><th>Project/certificate</th></tr></thead><tbody>${data.requests.map(item => `<tr><td>${date(item.created_at)}</td><td>${escapeHtml(item.request_type)}</td><td>${Number(item.quantity_tco2e || 0).toLocaleString()} tCO₂e</td><td>${escapeHtml(item.status)}</td><td>${item.project?.certificate_url ? `<a href="${escapeHtml(item.project.certificate_url)}" target="_blank" rel="noreferrer">Open certificate</a>` : escapeHtml(item.project?.name || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p>No transactions recorded.</p>'}<button class="btn secondary" data-client-pdf="${button.dataset.clientData}">Download authorized summary PDF</button>`;
          panel.querySelector('[data-client-pdf]').addEventListener('click', () => {
            const lines = [`Company: ${data.profile.company_name || 'Not supplied'}`, 'Access: SME-authorized Partner view', '', 'Holdings:', ...data.holdings.map(item => `${item.project?.name || item.project_id}: ${item.quantity_tco2e || 0} tCO₂e`), '', 'Transaction activity:', ...data.requests.map(item => `${item.created_at || ''} · ${item.request_type} · ${item.quantity_tco2e || 0} tCO₂e · ${item.status}`), '', 'No emissions or environmental impact claims are inferred.'];
            downloadPdf('Canopy Authorized Client Summary', lines, `canopy-authorized-summary-${button.dataset.clientData}.pdf`);
          });
        } catch (error) { showError(error); }
        finally { button.disabled = false; }
      }));
    }
    bindCommon();
  }
  function linkValue() { return document.querySelector('#partnerReferralLink')?.value || ''; }

  async function partnerAccessView() {
    const referrals = await query('canopy_partner_referrals', table => table.select('*').eq('sme_id', context.profile.id));
    const consents = await query('canopy_partner_client_consents', table => table.select('*').eq('sme_id', context.profile.id));
    content(`<div class="page-heading"><div><span class="eyebrow">DATA PERMISSIONS</span><h1>Partner access</h1><p>SME carbon data is never shared with a Partner without your explicit permission.</p></div></div>${referrals.length ? `<div class="table-wrap"><table><thead><tr><th>Referring Partner</th><th>Referral code</th><th>Data permission</th><th></th></tr></thead><tbody>${referrals.map(referral => { const consent = consents.find(row => row.partner_id === referral.partner_id); const granted = Boolean(consent?.granted_at && !consent.revoked_at); return `<tr><td>${escapeHtml(referral.partner_id)}</td><td>${escapeHtml(referral.code)}</td><td>${granted ? 'Authorized' : 'Not authorized'}</td><td><button class="btn ${granted ? 'danger' : 'primary'}" data-consent-partner="${referral.partner_id}" data-grant="${!granted}">${granted ? 'Revoke access' : 'Authorize access'}</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No referral is linked to this account.</p>'}`);
    document.querySelectorAll('[data-consent-partner]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await rpc('canopy_set_partner_client_consent', { p_partner_id: button.dataset.consentPartner, p_granted: button.dataset.grant === 'true' }); context.toast('Partner data permission updated.'); await mount(context.view, context); }
      catch (error) { button.disabled = false; showError(error); }
    }));
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

  async function adminDeveloperBillingView() {
    const [commissions, settlements] = await Promise.all([
      query('canopy_developer_commissions', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_billing_audit', table => table.select('*').eq('target_type', 'developer_commission').order('created_at', { ascending: false }).limit(50))
    ]);
    const developerIds = [...new Set(commissions.map(row => row.developer_id))];
    const profiles = developerIds.length ? await query('profiles', table => table.select('id,company_name,contact_name').in('id', developerIds)) : [];
    const profileMap = new Map(profiles.map(row => [row.id, row]));
    const projectMap = new Map(context.projects.map(row => [row.id, row]));
    const projects = context.projects;
    const outstanding = commissions.filter(row => ['pending','overdue'].includes(row.payment_status)).reduce((sum,row) => sum + Number(row.commission_myr || 0),0);
    content(`<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Partner / developer billing</h1><p>Developer commission is a separate 1.5% invoice and is never added to the SME checkout.</p></div></div><div class="metric-grid"><article><span>Developer commissions outstanding</span><strong>${cash(outstanding)}</strong></article><article><span>Developer invoices</span><strong>${commissions.length}</strong></article></div><section class="revenue-section"><h2>Assign a developer to a project</h2><form id="developerAssignForm" class="revenue-inline-form"><label>Project<select name="project" required>${projects.map(project => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('')}</select></label><label>Developer account UUID<input name="developer" required></label><button class="btn secondary" type="submit">Assign developer</button></form><p class="muted">Only purchases of projects with an Admin-assigned developer create a commission invoice.</p></section>${commissions.length ? `<div class="table-wrap"><table><thead><tr><th>Developer</th><th>Project</th><th>Credits sold</th><th>Transaction value</th><th>Rate</th><th>Commission</th><th>Invoice</th><th>Status / settlement</th></tr></thead><tbody>${commissions.map(row => `<tr><td>${escapeHtml(profileMap.get(row.developer_id)?.company_name || profileMap.get(row.developer_id)?.contact_name || row.developer_id)}</td><td>${escapeHtml(projectMap.get(row.project_id)?.name || row.project_id)}</td><td>${Number(row.quantity_tco2e).toLocaleString()} tCO₂e</td><td>${cash(row.transaction_value_myr)}</td><td>${(Number(row.commission_rate) * 100).toFixed(2)}%</td><td>${cash(row.commission_myr)}</td><td>${escapeHtml(row.invoice_reference)}</td><td>${status(row.payment_status)}<form class="developer-status-form" data-commission="${row.id}"><select name="status"><option value="pending" ${row.payment_status === 'pending' ? 'selected' : ''}>Pending</option><option value="paid" ${row.payment_status === 'paid' ? 'selected' : ''}>Paid</option><option value="overdue" ${row.payment_status === 'overdue' ? 'selected' : ''}>Overdue</option></select><input name="reference" placeholder="Settlement ref" value="${escapeHtml(row.payment_reference || '')}"><input name="note" placeholder="Audit note" required minlength="3"><button class="btn secondary" type="submit">Save</button></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No developer commissions recorded. Assign a developer to a project before new purchases to create invoices.</p>'}`);
    if (settlements.length) {
      const invoiceById = new Map(commissions.map(row => [row.id, row.invoice_reference]));
      document.querySelector('#content').insertAdjacentHTML('beforeend', `<section class="revenue-section"><h2>Settlement history</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Previous status</th><th>New status</th><th>Audit note</th></tr></thead><tbody>${settlements.map(row => `<tr><td>${date(row.created_at)}</td><td>${escapeHtml(invoiceById.get(row.target_id) || row.target_id)}</td><td>${escapeHtml(row.previous_status || '—')}</td><td>${escapeHtml(row.new_status)}</td><td>${escapeHtml(row.note)}</td></tr>`).join('')}</tbody></table></div></section>`);
    }
    document.querySelector('#developerAssignForm').addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      try { await rpc('canopy_admin_assign_project_developer', { p_project_id: values.get('project'), p_developer_id: values.get('developer') }); context.toast('Developer assignment saved.'); await context.refresh(); }
      catch (error) { showError(error); }
    });
    document.querySelectorAll('.developer-status-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form);
      const button = form.querySelector('button'); button.disabled = true;
      try { await rpc('canopy_admin_set_developer_status', { p_commission_id: form.dataset.commission, p_status: values.get('status'), p_reference: values.get('reference'), p_note: values.get('note') }); context.toast('Invoice status and audit record saved.'); await context.refresh(); }
      catch (error) { button.disabled = false; showError(error); }
    }));
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
    const [data, billing, charges, commissions, settings] = await Promise.all([
      rpc('canopy_admin_revenue_dashboard'),
      query('canopy_billing_orders', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_transaction_charges', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_developer_commissions', table => table.select('*').order('created_at', { ascending: false })),
      query('canopy_referral_settings', table => table.select('*').eq('singleton', true).limit(1))
    ]);
    const actual = data.paid_actuals || {};
    const names = { carbon_transaction_fees: 'Carbon transaction fees', premium_subscription: 'Premium subscriptions', esg_reporting: 'Carbon & ESG reports', developer_commissions: 'Developer commissions', partner_subscription: 'Partner Portal subscriptions' };
    const streams = Object.keys(names);
    const paidTotal = streams.reduce((sum, key) => sum + Number(actual[key] || 0), 0);
    const outstanding = billing.filter(row => ['pending', 'overdue'].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.amount_myr || 0), 0)
      + charges.filter(row => ['pending', 'overdue'].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.sme_fee_myr || 0), 0)
      + commissions.filter(row => ['pending', 'overdue'].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.commission_myr || 0), 0);
    const sandboxTotal = billing.filter(row => row.payment_status === 'sandbox_paid').reduce((sum, row) => sum + Number(row.amount_myr || 0), 0);
    const forecast = [600, 25000, 10000, 600, 5000];
    const forecastLabels = ['Transaction fees', 'Premium', 'ESG reports', 'Developer commissions', 'Partner subscriptions'];
    const forecastFormulas = ['500 active users × RM20 average transaction × 4 transactions monthly × 1.5%', '100 subscribers × RM250', '20 reports × RM500', '500 transactions/users × RM20 × 4 × 1.5%', '10 partners × RM500'];
    const monthly = data.monthly || [];
    const byMonth = new Map();
    monthly.forEach(row => byMonth.set(row.month, (byMonth.get(row.month) || 0) + Number(row.amount_myr || 0)));
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTotal = [...byMonth.entries()].filter(([month]) => month.startsWith(currentMonth)).reduce((sum, [, amount]) => sum + amount, 0);
    const peak = Math.max(1, ...byMonth.values());
    const setting = settings[0] || { reward_type: 'disabled', reward_percent: 0, reward_fixed_myr: 0 };
    content(`<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Revenue dashboard</h1><p>Collected revenue includes only provider-verified records marked paid. Sandbox checkouts are excluded.</p></div></div><div class="metric-grid"><article><span>Paid actual, all time</span><strong>${cash(paidTotal)}</strong></article><article><span>Paid actual this month</span><strong>${cash(monthTotal)}</strong></article><article><span>Pending / overdue</span><strong>${cash(outstanding)}</strong></article><article><span>Sandbox only · not collected</span><strong>${cash(sandboxTotal)}</strong></article><article><span>Forecast monthly</span><strong>${cash(forecast.reduce((sum, value) => sum + value, 0))}</strong></article></div><section class="revenue-section"><h2>Actual revenue by stream</h2><div class="table-wrap"><table><thead><tr><th>Stream</th><th>Paid and collected</th></tr></thead><tbody>${streams.map(key => `<tr><td>${names[key]}</td><td>${cash(actual[key])}</td></tr>`).join('')}<tr><th>Total</th><th>${cash(paidTotal)}</th></tr></tbody></table></div></section><section class="revenue-section"><h2>Monthly actual revenue</h2><div class="revenue-chart" aria-label="Paid revenue by month">${[...byMonth.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([month, amount]) => `<div class="revenue-chart-column"><span>${cash(amount)}</span><div style="height:${Math.max(2, amount / peak * 100)}%"></div><small>${escapeHtml(month)}</small></div>`).join('') || '<p class="muted">No paid revenue recorded.</p>'}</div></section><section class="revenue-section"><h2>Planning forecast · not actual revenue</h2><div class="table-wrap"><table><thead><tr><th>Stream</th><th>Planning assumption</th><th>Projected monthly</th></tr></thead><tbody>${forecastLabels.map((label, index) => `<tr><td>${label}</td><td>${forecastFormulas[index]}</td><td>${cash(forecast[index])}</td></tr>`).join('')}<tr><th colspan="2">Forecast total</th><th>${cash(41200)}</th></tr></tbody></table></div></section><section class="revenue-section"><h2>SME transaction fee settlement</h2>${charges.length ? `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Type</th><th>Transaction value</th><th>Fee</th><th>Status / audit</th></tr></thead><tbody>${charges.map(row => `<tr><td>${escapeHtml(row.request_id)}</td><td>${escapeHtml(row.transaction_type)}</td><td>${cash(row.transaction_value_myr)}</td><td>${cash(row.sme_fee_myr)}</td><td>${status(row.payment_status)}<form class="transaction-charge-form" data-charge="${row.id}"><select name="status"><option value="pending" ${row.payment_status === 'pending' ? 'selected' : ''}>Pending</option><option value="paid" ${row.payment_status === 'paid' ? 'selected' : ''}>Paid</option><option value="overdue" ${row.payment_status === 'overdue' ? 'selected' : ''}>Overdue</option><option value="needs_review" ${row.payment_status === 'needs_review' ? 'selected' : ''}>Needs review</option></select><input name="reference" placeholder="Settlement ref" value="${escapeHtml(row.payment_reference || '')}"><input name="note" placeholder="Audit note" required minlength="3"><button class="btn secondary" type="submit">Save</button></form></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No completed buy/sell fees recorded yet.</p>'}</section><section class="revenue-section"><h2>Referral reward configuration</h2><p>Rewards remain disabled until an Admin sets a rate. No default commission is assumed.</p><form id="referralRewardForm" class="revenue-inline-form"><label>Reward type<select name="type"><option value="disabled" ${setting.reward_type === 'disabled' ? 'selected' : ''}>Disabled</option><option value="percentage" ${setting.reward_type === 'percentage' ? 'selected' : ''}>Percentage of transaction value</option><option value="fixed_myr" ${setting.reward_type === 'fixed_myr' ? 'selected' : ''}>Fixed MYR per referral</option></select></label><label>Percent<input name="percent" type="number" min="0" max="100" step="0.01" value="${Number(setting.reward_percent || 0) * 100}"></label><label>Fixed MYR<input name="fixed" type="number" min="0" step="0.01" value="${Number(setting.reward_fixed_myr || 0)}"></label><button class="btn primary" type="submit">Save configuration</button></form></section>${charges.some(row => row.payment_status === 'needs_review') ? '<section class="warning">Some transaction values or owners need reconciliation against the existing carbon_requests schema. Those fees are not counted as revenue.</section>' : ''}`);
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
    document.querySelector('#walletExportForm').addEventListener('submit', async event => { event.preventDefault(); const button=event.submitter; if(button?.disabled)return; const values=new FormData(event.currentTarget); const start=values.get('start'); const end=values.get('end'); if(end&&start&&end<start){context.toast('The end date must be on or after the start date.','error');return;} const rows=transactions.filter(row=>inPeriod(row.created_at,start,end)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); if(!rows.length){context.toast('No wallet transactions match this date range.','error');return;} if(button)button.disabled=true; try{let running=transactions.filter(row=>start&&String(row.created_at).slice(0,10)<start).reduce((sum,row)=>sum+Number(row.amount_myr||0),0); const opening=running; const exported=rows.map(row=>{running+=Number(row.amount_myr||0);return [new Date(row.created_at).toLocaleString('en-MY'),walletTypeLabel(row),row.note||'',Number(row.amount_myr)>0?Number(row.amount_myr):'',Number(row.amount_myr)<0?Math.abs(Number(row.amount_myr)): '',running];}); const inflows=rows.filter(row=>Number(row.amount_myr)>0).reduce((sum,row)=>sum+Number(row.amount_myr),0);const outflows=rows.filter(row=>Number(row.amount_myr)<0).reduce((sum,row)=>sum+Math.abs(Number(row.amount_myr)),0);xlsxBook([{name:'Demo Wallet',headerRow:6,currencyColumns:[3,4,5],rows:[['DEMO ONLY — NO REAL MONEY'],['Opening balance MYR',opening],['Total inflows MYR',inflows],['Total outflows MYR',outflows],['Closing balance MYR',running],[],['Date / time','Transaction type','Description','Money in MYR','Money out MYR','Running balance MYR'],...exported]}],`Canopy_Demo_Wallet_Transactions_${new Date().toISOString().slice(0,10)}.xlsx`);context.toast('✓ Demo wallet transaction history downloaded. No real money.','success');}catch(error){context.toast(error?.message||'Could not create the Demo Wallet Excel export.','error');}finally{if(button)button.disabled=false;} });
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
      if (view === 'partner-reports') return await partnerReportsView();
      if (view === 'partner-projects') return await partnerProjectsView();
      if (view === 'developer-billing') return await adminDeveloperBillingView();
      if (view === 'admin-subscriptions') return await adminSubscriptionsView();
      if (view === 'revenue') return await adminRevenueView();
    } catch (error) {
      showError(error);
      content(`<div class="empty"><h3>Section unavailable</h3><p>${escapeHtml(error?.message || 'The service could not load this data.')}</p></div>`);
    }
  }

  window.CanopyRevenue = { mount };
})();
