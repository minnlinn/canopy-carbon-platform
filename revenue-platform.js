'use strict';

(() => {
  const cash = value => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => value ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  let context;

  function content(html) { document.querySelector('#content').innerHTML = html; }
  function status(value) { return `<span class="status ${escapeHtml(String(value || 'pending').toLowerCase().replace(/[^a-z0-9-]/g, '-'))}">${escapeHtml(value || 'Pending')}</span>`; }
  function showError(error) { context.toast(error?.message || 'Could not load this section.'); }
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
    context.toast('Sandbox checkout created. No payment has been taken.');
    await mount(context.view, context);
  }
  async function completeDemo(orderId) {
    await rpc('canopy_simulate_billing_payment', { p_order_id: orderId });
    context.toast('Sandbox flow complete. This is not collected revenue.');
    await context.refresh();
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
      try { await completeDemo(button.dataset.demoOrder); } catch (error) { button.disabled = false; showError(error); }
    }));
    document.querySelectorAll('[data-subscribe]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await createCheckout(button.dataset.subscribe); } catch (error) { button.disabled = false; showError(error); }
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
    const [plan, history, entitled] = await Promise.all([subscription('premium'), billingHistory('premium_subscription'), rpc('canopy_has_subscription', { p_plan: 'premium' })]);
    const active = isActive(plan) && Boolean(entitled);
    const openOrder = history.find(row => row.payment_status === 'pending');
    const checkoutOrder = context.pendingOrder?.order_type === 'premium_subscription' ? context.pendingOrder : openOrder;
    const newProjects = context.projects.filter(project => project.created_at && Date.now() - new Date(project.created_at).getTime() < 48 * 60 * 60 * 1000);
    const earlyNotice = newProjects.length ? `<div class="notice"><span class="notice-icon">✦</span><span><strong>Early project access</strong> ${newProjects.map(project => `${escapeHtml(project.name)} (${date(project.created_at)})`).join(', ')}. Availability is subject to inventory.</span></div>` : '<p class="revenue-note">No new project releases in the past 48 hours.</p>';
    const contentStats = active ? `<section class="revenue-section"><h2>Premium tools</h2>${earlyNotice}<div class="metric-grid"><article><span>Tracked holdings</span><strong>${context.holdings.length}</strong></article><article><span>Credits held</span><strong>${context.holdings.reduce((total, item) => total + Number(item.quantity_tco2e || 0), 0).toLocaleString()} tCO₂e</strong></article><article><span>Available projects</span><strong>${context.projects.length}</strong></article></div><h3>Advanced market overview</h3><p>Price and availability are based only on current project listings. No market forecast is inferred.</p><div class="table-wrap"><table><thead><tr><th>Project</th><th>Type</th><th>Price</th><th>Available</th></tr></thead><tbody>${context.projects.map(project => `<tr><td>${escapeHtml(project.name)}</td><td>${escapeHtml(project.project_type)}</td><td>${cash(project.price_myr)} / tCO₂e</td><td>${Number(project.inventory_tco2e || 0).toLocaleString()} tCO₂e</td></tr>`).join('')}</tbody></table></div><p>Premium early access: newly published projects open to Premium immediately and to Free users after 48 hours, subject to inventory. Existing listings remain available to all eligible accounts.</p></section>` : `<section class="revenue-locked"><h2>Premium features are locked</h2><p>Detailed analytics, advanced market information and early project access require an active Premium subscription.</p></section>`;
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
  async function reportsView() {
    const rows = await getReportRows();
    const orderIds = rows.map(row => row.billing_order_id);
    const orders = orderIds.length ? await query('canopy_billing_orders', table => table.select('*').in('id', orderIds)) : [];
    const orderMap = new Map(orders.map(order => [order.id, order]));
    const canDownload = row => ['ready', 'ready_demo'].includes(row.status) && ['paid', 'sandbox_paid'].includes(orderMap.get(row.billing_order_id)?.payment_status);
    content(`<div class="page-heading"><div><span class="eyebrow">CARBON & ESG REPORTING</span><h1>Reports</h1><p>Request an evidence-based report using available Canopy records.</p></div></div><section class="revenue-checkout"><div><h2>Carbon & ESG report</h2><p>Report fee: <strong>${cash(500)}</strong></p><p>Includes company details, holdings, purchased/sold/retired credits, project information, transaction history and reporting period. Missing source data is labelled; no unsupported impact claims are generated.</p></div><form id="reportOrderForm" class="revenue-period"><label>From<input type="date" name="start" required value="${new Date().getFullYear()}-01-01"></label><label>To<input type="date" name="end" required value="${new Date().toISOString().slice(0, 10)}"></label><button class="btn primary" type="submit">Generate report</button></form></section>${demoLabel}${context.pendingOrder?.order_type === 'esg_report' ? checkout(context.pendingOrder, 'Carbon & ESG report') : ''}<section class="revenue-section"><h2>Report history</h2>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Requested</th><th>Period</th><th>Fee</th><th>Payment</th><th>Report</th></tr></thead><tbody>${rows.map(row => { const order = orderMap.get(row.billing_order_id); return `<tr><td>${date(row.created_at)}</td><td>${escapeHtml(row.period_start)} – ${escapeHtml(row.period_end)}</td><td>${cash(order?.amount_myr)}</td><td>${status(order?.payment_status || row.status)}</td><td>${canDownload(row) ? `<button class="btn secondary" data-download-report="${row.id}">Download PDF</button>` : row.status === 'pending' ? `<button class="btn primary" data-demo-order="${row.billing_order_id}">Complete sandbox checkout</button>` : 'Not authorized'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No reports requested yet.</p>'}</section>`);
    document.querySelector('#reportOrderForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = form.get('start');
      const end = form.get('end');
      if (end < start) { context.toast('The report end date must be on or after the start date.'); return; }
      const button = event.submitter;
      if (button) button.disabled = true;
      try { await createCheckout('esg_report', start, end); } catch (error) { if (button) button.disabled = false; showError(error); }
    });
    document.querySelectorAll('[data-download-report]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const data = await rpc('canopy_report_data', { p_report_id: button.dataset.downloadReport });
        downloadPdf(`Canopy Carbon & ESG Report · ${data.company.company_name || 'SME'}`, reportLines(data), `canopy-report-${data.report.period_start}-${data.report.period_end}.pdf`);
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    }));
    bindCommon();
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
    if (active) {
      [code, clients] = await Promise.all([
        rpc('canopy_create_partner_code'), rpc('canopy_partner_clients')
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
    content(`<div class="page-heading"><div><span class="eyebrow">PARTNER PORTAL</span><h1>Partner dashboard</h1><p>Manage referrals, authorized client data and your subscription.</p></div></div><div class="revenue-plan"><div><p class="eyebrow">PARTNER SUBSCRIPTION</p><h2>${cash(500)} / month</h2><p>Referral management, client analytics, project information and reporting tools.</p></div><div><strong>Subscription status</strong><p>${status(plan?.status || 'Inactive')}</p><small>Renewal: ${date(plan?.renewal_at)}</small>${active && plan.status === 'active_demo' ? `<p>${demoLabel}</p>` : ''}${active ? '<button class="btn secondary" data-cancel-plan="partner">Cancel subscription</button>' : '<button class="btn primary" data-subscribe="partner_subscription">Subscribe</button>'}</div></div>${checkout(checkoutOrder, 'Partner Portal monthly subscription')}${portal}<section class="revenue-section"><h2>Billing history</h2>${historyTable(history)}</section>`);
    if (active) {
      document.querySelector('#copyReferral').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkValue()); context.toast('Referral link copied.'); } catch { context.toast('Copy the referral link from the field.'); }
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
    content(`<div class="page-heading"><div><span class="eyebrow">PARTNER REPORTING</span><h1>Authorized client reports</h1><p>Summaries are available only for SMEs that granted data permission.</p></div></div>${clients.some(client => client.consent_granted) ? `<div class="table-wrap"><table><thead><tr><th>SME</th><th>Verification</th><th>Permission</th><th>Report</th></tr></thead><tbody>${clients.filter(client => client.consent_granted).map(client => `<tr><td>${escapeHtml(client.company_name)}</td><td>${escapeHtml(client.verification_status)}</td><td>Authorized</td><td><button class="btn primary" data-authorized-report="${client.sme_id}">Generate summary</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No SMEs have authorized data access.</p>'}<section id="partnerReportDetail" class="revenue-section" hidden></section>`);
    document.querySelectorAll('[data-authorized-report]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const data = await rpc('canopy_partner_client_data', { p_sme_id: button.dataset.authorizedReport });
        const lines = [`SME: ${data.profile.company_name || 'Not supplied'}`, `Verification status: ${data.profile.verification_status || 'Unknown'}`, 'Source: current Canopy Supabase records; only SME-authorized data included.', '', 'Holdings:', ...data.holdings.map(item => `${item.project?.name || item.project_id}: ${item.quantity_tco2e || 0} tCO₂e`), '', 'Transactions:', ...data.requests.map(item => `${item.created_at || ''} · ${item.request_type} · ${item.quantity_tco2e || 0} tCO₂e · ${item.status}`), '', 'No emissions or environmental impact claims are inferred.'];
        downloadPdf('Canopy Authorized SME Carbon Summary', lines, `canopy-sme-summary-${button.dataset.authorizedReport}.pdf`);
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    }));
  }

  async function partnerProjectsView() {
    if (!await rpc('canopy_has_subscription', { p_plan: 'partner' })) {
      content('<div class="revenue-locked"><h2>Partner Portal is locked</h2><p>An active Partner Portal subscription is required to view project details.</p></div>');
      return;
    }
    content(`<div class="page-heading"><div><span class="eyebrow">PROJECT INFORMATION</span><h1>Carbon projects</h1><p>Published projects, their availability, pricing and available documents.</p></div></div>${context.projects.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Description</th><th>Price</th><th>Available</th><th>Status</th><th>Document</th></tr></thead><tbody>${context.projects.map(project => `<tr><td>${escapeHtml(project.name)}</td><td>${escapeHtml(project.description || 'Description not supplied')}</td><td>${cash(project.price_myr)} / tCO₂e</td><td>${Number(project.inventory_tco2e || 0).toLocaleString()} tCO₂e</td><td>${escapeHtml(project.listing_status)}</td><td>${project.certificate_url ? `<a href="${escapeHtml(project.certificate_url)}" target="_blank" rel="noreferrer">Open certificate</a>` : 'Not available'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No projects are currently available.</p>'}`);
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

  async function mount(view, values) {
    context = { ...values, view };
    try {
      if (context.profile?.role === 'partner' && context.profile?.verification_status !== 'verified') {
        content(`<div class="page-heading"><div><span class="eyebrow">PARTNER PORTAL</span><h1>Verification required</h1><p>Your Partner application is ${escapeHtml(context.profile?.verification_status || 'pending')}. An Admin must verify the organisation before Partner Portal or subscription features can be used.</p></div></div><section class="revenue-locked"><h2>Partner access is unavailable</h2><p>You can sign out while the application is being reviewed. No subscription, referral, client-data, project-information, or reporting action is available until verification is complete.</p></section>`);
        return;
      }
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
