'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const config = window.CANOPY_CONFIG || {};
const configured = config.supabaseUrl && !config.supabaseUrl.includes('YOUR_') && config.supabaseAnonKey && !config.supabaseAnonKey.includes('YOUR_');
const db = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
let profile, projects = [], holdings = [], requests = [], currentView = 'market';
const money = value => new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('en-MY',{dateStyle:'medium'}).format(new Date(value)) : '—';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let toastTimer;
const toast = (message, type='success') => { const el=$('#toast'); clearTimeout(toastTimer); el.textContent=message; el.className=`toast-${type} show`; toastTimer=setTimeout(()=>el.classList.remove('show'),4500); };
const fail = error => { console.error(error); toast(error?.message || 'Something went wrong. Please try again.','error'); };

function isStaff(){ return profile && ['admin','partner'].includes(profile.role); }
function isAdmin(){ return profile?.role === 'admin'; }
function normalizeRole(value){ const role=String(value??'').trim().toLowerCase(); return ['admin','sme','partner'].includes(role)?role:null; }
function roleHome(role){ return ({admin:'queue',sme:'market',partner:'partner'})[role]||null; }
function roleName(){ return profile?.role === 'admin' ? 'Administrator · Admin' : profile?.role === 'partner' ? 'BCX partner · Partner' : profile?.role === 'sme' ? 'SME account · SME' : 'Unrecognized account role'; }
function statusLabel(status){ return ({pending:'Pending Verification','pending verification':'Pending Verification',verified:'Verified',rejected:'Rejected',suspended:'Suspended'})[String(status||'').toLowerCase()]||String(status||'Unknown'); }
function statusBadge(status){ const value=String(status||'unknown'); const key=value.toLowerCase(); const tone=key==='verified'?'good':key.includes('pending')?'pending':['rejected','suspended','failed'].includes(key)?'bad':key.replace(/[^a-z0-9-]/g,'-'); return `<span class="status ${esc(tone)}">${esc(statusLabel(value))}</span>`; }
function projectById(id){ return projects.find(p=>p.id===id); }
function empty(message){ return `<div class="empty"><h3>Nothing here yet</h3><p>${esc(message)}</p></div>`; }

function setupScreen(){
  $('#setupMessage').hidden=false; $('#authForms').hidden=true;
  $('#setupMessage').innerHTML='<h2>Connect Canopy to Supabase</h2><p>This deployment needs its public Supabase URL and anon key in <code>dist/config.js</code>. The keys are deliberately not stored in this website source.</p><p>Follow the setup guide in the project README, then redeploy.</p>';
}

async function loadData(){
  const [holdingRes, requestRes] = await Promise.all([
    db.from('holdings').select('*').order('updated_at',{ascending:false}),
    db.from('carbon_requests').select('*').order('created_at',{ascending:false})
  ]);
  let projectRes=await db.rpc('canopy_list_projects');
  if(projectRes.error) throw projectRes.error; if(holdingRes.error) throw holdingRes.error; if(requestRes.error) throw requestRes.error;
  projects=projectRes.data; holdings=holdingRes.data; requests=requestRes.data;
}

async function start(){
  if(!configured){ setupScreen(); return; }
  bindAuth();
  const {data:{session}}=await db.auth.getSession();
  if(session) await enterApp();
  db.auth.onAuthStateChange((_event, session)=>{ if(!session) leaveApp(); });
}
function bindAuth(){
  $$('[data-auth-tab]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b===button));
    $('#loginForm').hidden=button.dataset.authTab!=='login'; $('#registerForm').hidden=button.dataset.authTab!=='register'; $('#partnerRegisterForm').hidden=button.dataset.authTab!=='partner'; $('#authFeedback').textContent='';
  }));
  const referralCode=new URLSearchParams(location.search).get('ref');
  if(referralCode){ $('#registerForm [name="referral_code"]').value=referralCode; $('[data-auth-tab="register"]').click(); }
  $('#loginForm').addEventListener('submit', async event=>{
    event.preventDefault(); const form=new FormData(event.currentTarget); $('#authFeedback').textContent='Signing in…';
    const {error}=await db.auth.signInWithPassword({email:form.get('email'),password:form.get('password')});
    if(error){ $('#authFeedback').textContent=error.message==='Failed to fetch' ? 'Cannot reach the configured Supabase Auth server. Check the Supabase project URL and network connection, then retry.' : error.message; return; } await enterApp();
  });
  $('#registerForm').addEventListener('submit', async event=>{
    event.preventDefault(); const submitter=event.currentTarget.querySelector('[type="submit"]'); if(submitter?.disabled)return; if(submitter)submitter.disabled=true; const form=new FormData(event.currentTarget); $('#authFeedback').textContent='Creating your account…';
    const metadata={canopy_account_type:'sme',company_name:form.get('company_name'),registration_number:form.get('registration_number'),contact_name:form.get('contact_name'),sector:form.get('sector'),referral_code:form.get('referral_code')||null};
    const {data,error}=await db.auth.signUp({email:form.get('email'),password:form.get('password'),options:{data:metadata}});
    if(error){ $('#authFeedback').textContent=error.message; if(submitter)submitter.disabled=false; return; }
    const emailNote=data.session?'':' Confirm your email if Supabase requires it.'; event.currentTarget.reset(); $('#authFeedback').textContent=`Account created successfully! Your registration is pending Admin verification.${emailNote}`; window.alert(`Account created successfully! Your registration is pending Admin verification.${emailNote}`); if(submitter)submitter.disabled=false;
  });
  $('#partnerRegisterForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;const submitter=form.querySelector('[type="submit"]');if(submitter?.disabled)return;if(submitter)submitter.disabled=true;const values=new FormData(form);const feedback=$('#authFeedback');feedback.textContent='Submitting Partner registration…';
    const metadata={canopy_account_type:'partner',company_name:values.get('company_name'),registration_number:values.get('registration_number'),organization_type:values.get('organization_type'),contact_name:values.get('contact_name'),phone:values.get('phone'),business_description:values.get('business_description')};
    const {data,error}=await db.auth.signUp({email:values.get('email'),password:values.get('password'),options:{data:metadata}});
    if(error){feedback.textContent=error.message;if(submitter)submitter.disabled=false;return;}
    const emailNote=data.session?'':' Confirm your email if Supabase requires it.';form.reset();feedback.textContent=`Account created successfully! Your registration is pending Admin verification.${emailNote}`;window.alert(`Account created successfully! Your registration is pending Admin verification.${emailNote}`);if(submitter)submitter.disabled=false;
  });
}

async function enterApp(){
  const {data:{user}}=await db.auth.getUser(); if(!user) return leaveApp();
  let result;
  try{
    result=await db.from('profiles').select('*').eq('id',user.id).single();
    if(result.error) throw new Error(`Could not load the profile for authenticated user ${user.id}: ${result.error.message}`);
    if(!result.data) throw new Error(`No public.profiles row exists for authenticated user ${user.id}.`);
    if(result.data.id!==user.id) throw new Error('The loaded profile does not match the authenticated Supabase user.');
    const role=normalizeRole(result.data.role);
    if(!role) throw new Error(`Profile ${user.id} has an unsupported role (${String(result.data.role??'empty')}). Ask an Admin to correct public.profiles.role.`);
    profile={...result.data,role};
    const application=await db.from('canopy_account_applications').select('review_status,review_note').eq('user_id',user.id).maybeSingle();
    if(!application.error) profile.account_review_status=application.data?.review_status||null;
    const accountStatus=await db.rpc('canopy_current_account_status');
    if(!accountStatus.error && accountStatus.data) profile.effective_status=accountStatus.data;
  }catch(error){
    profile=null; $('#appShell').hidden=true; $('#authShell').hidden=false;
    $('#authFeedback').textContent=error.message; console.error(error); return;
  }
  if(profile.role==='sme'&&user.user_metadata?.referral_code){const {error}=await db.rpc('canopy_claim_partner_referral',{p_code:user.user_metadata.referral_code});if(error)console.warn('Partner referral could not be linked:',error.message);}
  currentView=roleHome(profile.role);
  $('#authShell').hidden=true; $('#appShell').hidden=false;
  const workspaceName=profile.company_name||user.email||roleName();
  $('#workspaceName').textContent=workspaceName; $('#workspaceRole').textContent=roleName(); $('#avatar').textContent=workspaceName.slice(0,1).toUpperCase();
  $('#navLabel').textContent=profile.role==='admin'?'ADMINISTRATOR WORKSPACE':profile.role==='partner'?'PARTNER WORKSPACE':'SME WORKSPACE';
  const displayedVerification=profile.effective_status || (profile.account_review_status==='rejected'?'rejected':profile.verification_status);
  $('#appNotice').innerHTML=displayedVerification==='verified' ? '<span class="notice-icon">✓</span><span><strong>Verified account.</strong> Transaction requests are recorded and await administrator review and settlement.</span>' : `<span class="notice-icon">i</span><span><strong>Account ${esc(statusLabel(displayedVerification))}.</strong> You can browse projects while Canopy reviews your account details.</span>`;
  $('#signOut').onclick=async()=>{ await db.auth.signOut(); };
  await refresh();
}
function leaveApp(){ profile=null; $('#appShell').hidden=true; $('#authShell').hidden=false; }
async function refresh(){ try{ await loadData(); }catch(error){ fail(error); } renderNavigation(); render(); }
function legacyRenderNavigation(){
  const base=profile?.role==='admin'?[['queue','Transaction approvals'],['smes','Account verification'],['projects','Projects'],['demo-projects','Demo project management'],['admin-subscriptions','Subscription management'],['developer-billing','Developer billing'],['revenue','Revenue dashboard'],['reports','Platform activity']]:profile?.role==='partner'?[['partner','Partner dashboard'],['partner-projects','Carbon projects'],['partner-reports','Client reports']]:profile?.role==='sme'?[['market','Marketplace'],['holdings','My holdings'],['requests','My requests'],['reports','Carbon & ESG reports'],['premium','Premium'],['partner-access','Partner access'],['profile','Company profile']]:[];
  $('#navigation').innerHTML=base.map(([id,label])=>`<button class="nav-item ${id===currentView?'active':''}" data-view="${id}">${label}</button>`).join('');
  $$('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;renderNavigation();render();});
}
function legacyRender(){ $('#crumb').textContent=$(`[data-view="${currentView}"]`)?.textContent||'Workspace'; if(window.CanopyProjects&&(currentView==='market'||currentView==='demo-projects')){if(currentView==='demo-projects'&&!isAdmin()){currentView=roleHome(profile?.role);return render();}$('#content').innerHTML=currentView==='market'?`<div id="demoProjectCatalog"></div><section class="revenue-section legacy-project-list"><h2>Other Canopy sample projects</h2><p>Illustrative sample records only; they do not represent current registry inventory.</p>${market()}</section>`:'<div id="demoProjectCatalog"></div>';if(currentView==='market')bindView();window.CanopyProjects.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh});return;}const revenueViews=['premium','revenue','developer-billing','admin-subscriptions','partner','partner-projects','partner-reports','partner-access']; if(window.CanopyRevenue&&(revenueViews.includes(currentView)||(currentView==='reports'&&profile?.role!=='admin'))){ $('#content').innerHTML='<div class="revenue-loading">Loading account data…</div>'; window.CanopyRevenue.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh}); return; } const views={market:market,holdings:holdingList,requests:requestList,profile:companyProfile,queue:queue,projects:projectAdmin,smes:smeAdmin,reports:reports}; const view=views[currentView]; if(!view){ $('#content').innerHTML=empty('Your account role does not have a dashboard configured.'); return; } $('#content').innerHTML=view(); bindView(); }

function market(){ const listed=projects.filter(p=>p.listing_status==='published'); const accountStatus=profile.effective_status||profile.verification_status; return `<div class="page-heading"><div><span class="eyebrow">MARKETPLACE</span><h1>Available carbon projects</h1><p>Fractional credits are requested here and settled after administrator review.</p></div></div><div class="project-grid">${listed.length?listed.map(p=>`<article class="project-card"><div class="project-top"><span class="pill">${esc(p.project_type)}</span>${statusBadge(p.listing_status)}</div><h2>${esc(p.name)}</h2><p>${esc(p.location)} · Vintage ${p.vintage}</p><p class="project-description">${esc(p.description)}</p><dl><div><dt>Price</dt><dd>${money(p.price_myr)} <small>/ tCO₂e</small></dd></div><div><dt>Available</dt><dd>${Number(p.inventory_tco2e).toLocaleString()} <small>tCO₂e</small></dd></div></dl><div class="card-actions"><button class="btn secondary" data-project-info="${p.id}">View details</button><button class="btn primary" data-buy="${p.id}" ${accountStatus!=='verified'?'disabled':''}>Request to buy</button></div></article>`).join(''):empty('The administrator has not published any projects yet.')}</div>`; }
function holdingList(){ const accountStatus=profile.effective_status||profile.verification_status; return `<div class="page-heading"><div><span class="eyebrow">PORTFOLIO</span><h1>My carbon holdings</h1><p>Holdings update when administrators complete a settled request.</p></div></div>${holdings.length?`<div class="table-wrap"><table><thead><tr><th>Project</th><th>Held</th><th>Last updated</th><th></th></tr></thead><tbody>${holdings.map(h=>{const p=projectById(h.project_id)||{};return `<tr><td><strong>${esc(p.name||'Project')}</strong><small>${esc(p.location||'')}</small></td><td>${Number(h.quantity_tco2e).toLocaleString()} tCO₂e</td><td>${date(h.updated_at)}</td><td><button class="btn secondary" data-manage-holding="${h.project_id}" ${accountStatus!=='verified'?'disabled':''}>Manage</button></td></tr>`}).join('')}</tbody></table></div>`:empty('Buy requests that have been completed will appear here.')}`; }
function requestList(){ return `<div class="page-heading"><div><span class="eyebrow">ACTIVITY</span><h1>My requests</h1><p>Track all buy, sell, transfer, and retirement requests.</p></div></div>${requests.length?`<div class="table-wrap"><table><thead><tr><th>Type</th><th>Project</th><th>Quantity</th><th>Status</th><th>Submitted</th><th>Reference</th></tr></thead><tbody>${requests.map(r=>`<tr><td><strong>${esc(r.request_type)}</strong></td><td>${esc(projectById(r.project_id)?.name||'Project')}</td><td>${Number(r.quantity_tco2e).toLocaleString()} tCO₂e</td><td>${statusBadge(r.status)}</td><td>${date(r.created_at)}</td><td>${esc(r.execution_reference||'—')}</td></tr>`).join('')}</tbody></table></div>`:empty('Your submitted requests will appear here.')}`; }
function companyProfile(){ return `<div class="page-heading"><div><span class="eyebrow">ACCOUNT</span><h1>${esc(profile.company_name)}</h1><p>Account verification status: ${statusBadge(profile.verification_status)}</p></div></div><div class="detail-card"><dl class="details"><div><dt>Registration number</dt><dd>${esc(profile.registration_number||'Not supplied')}</dd></div><div><dt>Contact name</dt><dd>${esc(profile.contact_name||'Not supplied')}</dd></div><div><dt>Sector</dt><dd>${esc(profile.sector||'Not supplied')}</dd></div><div><dt>Review note</dt><dd>${esc(profile.review_note||'No note yet')}</dd></div></dl></div>`; }
function queue(){ const open=requests.filter(r=>r.status==='submitted'||r.status==='approved'); return `<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Transaction queue</h1><p>Review submitted requests and simulated demo purchases.</p></div></div>${open.length?`<section class="revenue-section"><h2>Transaction requests</h2><div class="table-wrap"><table><thead><tr><th>Request</th><th>Project</th><th>Quantity</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>${open.map(r=>`<tr><td><strong>${esc(r.request_type)}</strong></td><td>${esc(projectById(r.project_id)?.name||'Project')}</td><td>${Number(r.quantity_tco2e).toLocaleString()} tCO₂e</td><td>${statusBadge(r.status)}</td><td>${date(r.created_at)}</td><td><button class="btn primary" data-review="${r.id}">${r.status==='submitted'?'Review':'Complete'}</button></td></tr>`).join('')}</tbody></table></div></section>`:empty('No standard transaction requests need action.')}<section class="revenue-section"><h2>Demo purchase requests</h2><p>Demo only — no real payment or carbon credits.</p><div id="demoApprovalQueue">Loading demo purchase requests…</div></section>`; }
async function loadDemoApprovalQueue(){
  const target=$('#demoApprovalQueue'); if(!target)return;
  const [purchaseResult,projectResult,profileResult]=await Promise.all([
    db.from('canopy_demo_purchase_requests').select('*').eq('request_status','pending_admin_review').order('created_at',{ascending:false}),
    db.from('canopy_demo_projects').select('id,project_name'),
    db.from('profiles').select('id,company_name,contact_name')
  ]);
  if(purchaseResult.error||projectResult.error||profileResult.error){target.innerHTML='<p class="feedback-message feedback-error">Could not load demo purchase requests.</p>';return fail(purchaseResult.error||projectResult.error||profileResult.error);}
  const projectNames=new Map(projectResult.data.map(row=>[row.id,row.project_name])); const companies=new Map(profileResult.data.map(row=>[row.id,row.company_name||row.contact_name||row.id])); const rows=purchaseResult.data;
  target.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>SME</th><th>Project</th><th>Quantity</th><th>Simulated total</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(companies.get(row.user_id)||row.user_id)}</td><td>${esc(projectNames.get(row.project_id)||row.project_id)}</td><td>${Number(row.quantity_tco2e).toFixed(2)} tCO₂e</td><td>${money(row.simulated_total_myr)} <small>Demo only</small></td><td>${statusBadge('Pending Admin Review')}</td><td>${date(row.created_at)}</td><td><button class="btn primary" data-demo-review="${row.id}" data-demo-decision="approve">Approve</button> <button class="btn danger" data-demo-review="${row.id}" data-demo-decision="reject">Reject</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No pending demo purchase requests.</p>';
  $$('[data-demo-review]').forEach(button=>button.onclick=()=>reviewDemoPurchase(button.dataset.demoReview,button.dataset.demoDecision));
}
function reviewDemoPurchase(requestId,decision){
  const verb=decision==='approve'?'Approve':'Reject';
  dialog(`<h2>${verb} demo purchase</h2><p>Demo only — no real payment or carbon credits. ${decision==='approve'?'Approval creates a simulated entitlement.':'Rejection returns the reserved Demo RM Wallet funds.'}</p><form id="demoReviewForm" class="dialog-form"><label>Admin review note<textarea name="note" required minlength="3"></textarea></label><button class="btn ${decision==='approve'?'primary':'danger'}" type="submit">${verb} demo purchase</button><p id="demoReviewResult" class="feedback-message" aria-live="polite"></p></form>`);
  $('#demoReviewForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');const note=new FormData(event.currentTarget).get('note').trim();if(note.length<3)return;button.disabled=true;button.textContent='Saving…';const {error}=await db.rpc('canopy_admin_review_demo_purchase',{p_admin_id:profile.id,p_request_id:requestId,p_decision:decision,p_note:note});const feedback=$('#demoReviewResult');if(error){button.disabled=false;button.textContent=`${verb} demo purchase`;feedback.className='feedback-message feedback-error';feedback.textContent=error.message||'Could not review this demo purchase.';return;}const message=`✓ Demo purchase ${decision==='approve'?'approved; simulated holding allocated.':'rejected; Demo RM Wallet funds restored.'}`;feedback.className='feedback-message feedback-success';feedback.textContent=message;toast(message,'success');await refresh();};
}
function projectAdmin(){ return `<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Carbon projects</h1><p>Create listings, manage availability, and link certificates.</p></div>${isAdmin()?'<button class="btn primary" id="newProject">Add project</button>':''}</div><div class="table-wrap"><table><thead><tr><th>Project</th><th>Inventory</th><th>Price</th><th>Listing</th><th></th></tr></thead><tbody>${projects.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.location)} · ${p.vintage}</small></td><td>${Number(p.inventory_tco2e).toLocaleString()} tCO₂e</td><td>${money(p.price_myr)}</td><td>${statusBadge(p.listing_status)}</td><td>${isAdmin()?`<button class="btn secondary" data-edit-project="${p.id}">Edit</button>`:''}</td></tr>`).join('')}</tbody></table></div>`; }
function legacySmeAdmin(){ return `<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Account verification</h1><p>Review SME and Partner registrations. Decisions are recorded by the Admin service.</p></div></div><div class="auth-tabs account-review-tabs" role="tablist" aria-label="Account verification lists"><button class="active" data-account-filter="pending-sme">Pending SMEs</button><button data-account-filter="pending-partner">Pending Partners</button><button data-account-filter="verified">Verified</button><button data-account-filter="rejected">Rejected</button></div><div id="smeTable">Loading account records…</div>`; }
function reports(){ const completed=requests.filter(r=>r.status==='completed'); const quantity=completed.reduce((sum,r)=>sum+Number(r.quantity_tco2e),0); return `<div class="page-heading"><div><span class="eyebrow">REPORTS</span><h1>Platform activity</h1><p>Live figures from completed transaction records.</p></div></div><div class="metric-grid"><article><span>Completed requests</span><strong>${completed.length}</strong></article><article><span>tCO₂e processed</span><strong>${quantity.toLocaleString()}</strong></article><article><span>Published projects</span><strong>${projects.filter(p=>p.listing_status==='published').length}</strong></article></div>`; }

function bindView(){
  $$('[data-project-info]').forEach(b=>b.onclick=()=>projectDetails(projectById(b.dataset.projectInfo)));
  $$('[data-buy]').forEach(b=>b.onclick=()=>requestForm('buy',projectById(b.dataset.buy)));
  $$('[data-manage-holding]').forEach(b=>b.onclick=()=>manageHolding(projectById(b.dataset.manageHolding)));
  $$('[data-review]').forEach(b=>b.onclick=()=>reviewForm(requests.find(r=>r.id===b.dataset.review)));
  if(currentView==='queue') loadDemoApprovalQueue();
  $('#newProject')?.addEventListener('click',()=>projectForm());
  $$('[data-edit-project]').forEach(b=>b.onclick=()=>projectForm(projectById(b.dataset.editProject)));
  if(currentView==='smes') loadSMEs();
}
function dialog(html){ $('#dialogBody').innerHTML=html; $('#actionDialog').showModal(); $('.close').onclick=()=>$('#actionDialog').close(); }
function projectDetails(p){ dialog(`<h2>${esc(p.name)}</h2><p>${esc(p.description)}</p><dl class="details"><div><dt>Project type</dt><dd>${esc(p.project_type)}</dd></div><div><dt>Location</dt><dd>${esc(p.location)}</dd></div><div><dt>Vintage</dt><dd>${p.vintage}</dd></div><div><dt>Methodology</dt><dd>${esc(p.methodology)}</dd></div><div><dt>Registry reference</dt><dd>${esc(p.registry_reference)}</dd></div><div><dt>Certificate</dt><dd>${p.certificate_url?`<a href="${esc(p.certificate_url)}" target="_blank" rel="noreferrer">Open certificate</a>`:'Not linked'}</dd></div></dl>`); }
function requestForm(type,p){
  const extra=type==='transfer'?'<label>Recipient SME ID<input name="recipient" required placeholder="UUID from administrator"></label>':type==='retire'?'<label>Retirement purpose<textarea name="purpose" required minlength="5"></textarea></label>':type==='sell'?`<label>Requested price (MYR/tCO₂e)<input name="price" type="number" min="1" step="0.01" value="${Number(p.price_myr||0)}" required></label>`:'';
  const charge=type==='buy'||type==='sell'?`<dl class="transaction-quote"><div><dt>Carbon credit value</dt><dd id="quoteValue">${money(0)}</dd></div><div><dt>Platform transaction fee (1.5%)</dt><dd id="quoteFee">${money(0)}</dd></div><div><dt>${type==='buy'?'Total payable':'Net proceeds after platform fee'}</dt><dd id="quoteTotal">${money(0)}</dd></div></dl><p class="muted">${type==='buy'?'The platform fee is added to the credit value.':'The platform fee is deducted from seller proceeds.'} Final charges are recorded after settlement.</p>`:'';
  dialog(`<h2>${type[0].toUpperCase()+type.slice(1)} request</h2><p><strong>${esc(p.name)}</strong> · ${Number(p.inventory_tco2e||0).toLocaleString()} tCO₂e listed</p><form id="requestForm" class="dialog-form"><label>Quantity (tCO₂e)<input name="quantity" type="number" min="0.1" step="0.1" required></label>${extra}${charge}<button class="btn primary" type="submit">Submit request</button></form>`);
  const form=$('#requestForm');
  const updateQuote=()=>{ if(!charge)return;const values=new FormData(form);const quantity=Number(values.get('quantity')||0);const price=type==='buy'?Number(p.price_myr||0):Number(values.get('price')||0);const value=Math.round(quantity*price*100)/100;const fee=Math.round(value*0.015*100)/100;$('#quoteValue').textContent=money(value);$('#quoteFee').textContent=money(fee);$('#quoteTotal').textContent=money(type==='buy'?value+fee:value-fee); };
  form.addEventListener('input',updateQuote);
  form.onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;const f=new FormData(e.currentTarget);const args={p_project_id:p.id,p_type:type,p_quantity:Number(f.get('quantity')),p_price:f.get('price')?Number(f.get('price')):null,p_recipient:f.get('recipient')||null,p_purpose:f.get('purpose')||null};const {error}=await db.rpc('submit_carbon_request',args);if(error){button.disabled=false;return fail(error);}$('#actionDialog').close();toast('Request submitted for administrator review.');await refresh();};
}
function manageHolding(p){ dialog(`<h2>Manage ${esc(p.name)}</h2><p>Choose a regulated request to submit.</p><div class="stack-actions"><button class="btn primary" data-action="sell">Sell</button><button class="btn secondary" data-action="transfer">Transfer</button><button class="btn secondary" data-action="retire">Retire</button></div>`); $$('[data-action]').forEach(b=>b.onclick=()=>requestForm(b.dataset.action,p)); }
function reviewForm(r){ const p=projectById(r.project_id); if(r.status==='approved'){ dialog(`<h2>Complete request</h2><p>${esc(r.request_type)} · ${esc(p?.name||'Project')} · ${r.quantity_tco2e} tCO₂e</p><form id="completeForm" class="dialog-form"><label>BCX/execution reference<input name="reference" required minlength="4"></label>${r.request_type==='sell'?'<label>Buyer SME ID<input name="buyer" required placeholder="UUID from administrator"></label>':''}<button class="btn primary" type="submit">Complete settlement</button></form>`); $('#completeForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await db.rpc('complete_carbon_request',{p_request:r.id,p_reference:f.get('reference'),p_buyer:f.get('buyer')||null});if(error)return fail(error);$('#actionDialog').close();toast('Request completed.');await refresh();}; return; }
  dialog(`<h2>Review request</h2><p>${esc(r.request_type)} · ${esc(p?.name||'Project')} · ${r.quantity_tco2e} tCO₂e</p><form id="reviewForm" class="dialog-form"><label>Review note<textarea name="note"></textarea></label><div class="stack-actions"><button class="btn primary" name="decision" value="approved">Approve</button><button class="btn danger" name="decision" value="rejected">Reject</button></div></form>`); $('#reviewForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await db.rpc('review_carbon_request',{p_request:r.id,p_status:f.get('decision'),p_note:f.get('note')});if(error)return fail(error);$('#actionDialog').close();toast('Request reviewed.');await refresh();}; }
function projectForm(p={}){ dialog(`<h2>${p.id?'Edit':'Add'} project</h2><form id="projectForm" class="dialog-form"><label>Name<input name="name" required value="${esc(p.name||'')}"></label><label>Project type<input name="project_type" required value="${esc(p.project_type||'')}"></label><label>Location<input name="location" required value="${esc(p.location||'')}"></label><label>Vintage<input name="vintage" type="number" required value="${p.vintage||2024}"></label><label>Methodology<input name="methodology" required value="${esc(p.methodology||'')}"></label><label>Registry reference<input name="registry_reference" required value="${esc(p.registry_reference||'')}"></label><label>Certificate URL<input name="certificate_url" type="url" value="${esc(p.certificate_url||'')}"></label><label>Price MYR/tCO₂e<input name="price_myr" type="number" min="1" required value="${p.price_myr||''}"></label><label>Inventory tCO₂e<input name="inventory_tco2e" type="number" min="0" step="0.1" required value="${p.inventory_tco2e||''}"></label><label>Listing status<select name="listing_status"><option ${p.listing_status==='draft'?'selected':''}>draft</option><option ${p.listing_status==='published'?'selected':''}>published</option><option ${p.listing_status==='paused'?'selected':''}>paused</option></select></label><label>Description<textarea name="description" required>${esc(p.description||'')}</textarea></label><button class="btn primary">Save project</button></form>`); $('#projectForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));f.vintage=Number(f.vintage);f.price_myr=Number(f.price_myr);f.inventory_tco2e=Number(f.inventory_tco2e); if(!p.id)f.created_by=profile.id;const res=p.id?await db.from('projects').update(f).eq('id',p.id):await db.from('projects').insert(f);if(res.error)return fail(res.error);$('#actionDialog').close();toast('Project saved.');await refresh();}; }
async function legacyLoadSMEs(filter='pending-sme'){
  const [profileResult,applicationResult]=await Promise.all([
    db.from('profiles').select('*').in('role',['sme','partner']).order('created_at',{ascending:false}),
    db.from('canopy_account_applications').select('*').order('submitted_at',{ascending:false})
  ]);
  if(profileResult.error)return fail(profileResult.error);
  if(applicationResult.error)return fail(applicationResult.error);
  const applications=new Map(applicationResult.data.map(row=>[row.user_id,row]));
  const records=profileResult.data.map(row=>({...row,application:applications.get(row.id)}));
  const getStatus=row=>row.application?.review_status||(row.verification_status==='verified'?'approved':row.verification_status==='rejected'?'rejected':'pending');
  const filtered=records.filter(row=>filter==='pending-sme'?row.role==='sme'&&getStatus(row)==='pending':filter==='pending-partner'?row.role==='partner'&&getStatus(row)==='pending':filter==='verified'?getStatus(row)==='approved'||row.verification_status==='verified':getStatus(row)==='rejected');
  const el=$('#smeTable');if(!el)return;
  el.innerHTML=filtered.length?`<div class="table-wrap"><table><thead><tr><th>Organisation</th><th>Type</th><th>Registration</th><th>Organisation details</th><th>Status</th><th>Review</th></tr></thead><tbody>${filtered.map(row=>{const app=row.application;const isPartner=row.role==='partner';return `<tr><td><strong>${esc(row.company_name)}</strong><small>${esc(row.contact_name||'')}</small></td><td>${isPartner?'Partner':'SME'}</td><td>${esc(row.registration_number||'—')}</td><td>${isPartner?`${esc(app?.organization_type||'Not supplied')} · ${esc(app?.phone||'Not supplied')}<small>${esc(app?.business_description||'No business description')}</small>`:esc(row.sector||'—')}</td><td>${statusBadge(getStatus(row))}</td><td>${filter.startsWith('pending')&&isAdmin()?`<button class="btn primary" data-account-decision="approve" data-account-id="${row.id}">Approve</button> <button class="btn danger" data-account-decision="reject" data-account-id="${row.id}">Reject</button>`:esc(app?.review_note||'—')}</td></tr>`}).join('')}</tbody></table></div>`:empty(filter==='pending-sme'?'No SME registrations are awaiting review.':filter==='pending-partner'?'No Partner registrations are awaiting review.':filter==='verified'?'No verified SME or Partner accounts found.':'No rejected registrations found.');
  $$('[data-account-filter]').forEach(button=>{button.classList.toggle('active',button.dataset.accountFilter===filter);button.onclick=()=>loadSMEs(button.dataset.accountFilter);});
  $$('[data-account-decision]').forEach(button=>button.onclick=async()=>{
    const decision=button.dataset.accountDecision;
    if(!window.confirm(`${decision==='approve'?'Approve':'Reject'} this ${filter==='pending-partner'?'Partner':'SME'} registration?`))return;
    const note=window.prompt('Add an Admin review note (at least 3 characters):');
    if(!note||note.trim().length<3)return;
    button.disabled=true;
    const {error}=await db.functions.invoke('account-workflow',{body:{action:'review-registration',profileId:button.dataset.accountId,decision,reviewNote:note.trim()}});
    if(error){button.disabled=false;return fail(error);}
    toast(`Registration ${decision==='approve'?'approved':'rejected'} and audit recorded.`);
    await loadSMEs(filter);
  });
}
function renderNavigation(){
  const base=profile?.role==='admin'?[['queue','Transaction approvals'],['smes','Account verification'],['projects','Projects'],['admin-subscriptions','Subscription management'],['developer-billing','Developer billing'],['revenue','Revenue dashboard'],['reports','Platform activity']]:profile?.role==='partner'?[['partner','Partner dashboard'],['partner-projects','Carbon projects'],['partner-reports','Client reports']]:profile?.role==='sme'?[['market','Marketplace'],['holdings','My holdings'],['requests','My requests'],['reports','Carbon & ESG reports'],['premium','Premium'],['partner-access','Partner access'],['profile','Company profile']]:[];
  $('#navigation').innerHTML=base.map(([id,label])=>`<button class="nav-item ${id===currentView?'active':''}" data-view="${id}">${label}</button>`).join('');
  $$('[data-view]').forEach(button=>button.onclick=()=>{currentView=button.dataset.view;renderNavigation();render();});
}
function render(){
  $('#crumb').textContent=$(`[data-view="${currentView}"]`)?.textContent||'Workspace';
  const projectCatalogueView=currentView==='market'||(currentView==='projects'&&isAdmin());
  if(window.CanopyProjects&&projectCatalogueView){
    $('#content').innerHTML=currentView==='market'?`<div id="demoProjectCatalog"></div><section class="revenue-section legacy-project-list"><h2>Other Canopy sample projects</h2><p>Illustrative sample records only; they do not represent current registry inventory.</p>${market()}</section>`:'<div id="demoProjectCatalog"></div>';
    if(currentView==='market')bindView();
    window.CanopyProjects.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh}); return;
  }
  const revenueViews=['premium','revenue','developer-billing','admin-subscriptions','partner','partner-projects','partner-reports','partner-access'];
  if(window.CanopyRevenue&&(revenueViews.includes(currentView)||(currentView==='reports'&&profile?.role!=='admin'))){ $('#content').innerHTML='<div class="revenue-loading">Loading account data…</div>'; window.CanopyRevenue.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh}); return; }
  const views={market:market,holdings:holdingList,requests:requestList,profile:companyProfile,queue:queue,projects:projectAdmin,smes:smeAdmin,reports:reports}; const view=views[currentView];
  if(!view){ $('#content').innerHTML=empty('Your account role does not have a dashboard configured.'); return; } $('#content').innerHTML=view(); bindView();
}
function smeAdmin(){ return `<div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Account verification</h1><p>Review SME and Partner accounts. Every account decision requires an Admin reason and is retained in the audit record.</p></div></div><div class="auth-tabs account-review-tabs" role="tablist" aria-label="Account verification lists"><button class="active" data-account-filter="all">All</button><button data-account-filter="pending">Pending</button><button data-account-filter="verified">Verified</button><button data-account-filter="rejected">Rejected</button><button data-account-filter="suspended">Suspended</button></div><div id="smeTable">Loading account records…</div>`; }
async function loadSMEs(filter='all'){
  const el=$('#smeTable'); if(!el) return;
  const {data,error}=await db.functions.invoke('account-workflow',{body:{action:'list-account-verification'}});
  if(error){ el.innerHTML=empty('Account records require the deployed account workflow service.'); return fail(error); }
  const records=data?.data||[];
  const filtered=records.filter(row=>filter==='all'||row.effective_status===filter);
  const emptyText={all:'No SME or Partner accounts found.',pending:'No accounts are awaiting review.',verified:'No verified accounts found.',rejected:'No rejected accounts found.',suspended:'No suspended accounts found.'}[filter];
  el.innerHTML=filtered.length?`<div class="table-wrap"><table><thead><tr><th>Organisation</th><th>Email</th><th>Type</th><th>Registration</th><th>Details</th><th>Status</th><th>Latest audit</th><th>Admin action</th></tr></thead><tbody>${filtered.map(row=>{const app=row.application;const audit=row.audit;const isOwn=row.id===profile.id;const actionMarkup=isOwn?'Your account':row.effective_status==='pending'?`<button class="btn primary" data-account-action="approve" data-account-id="${row.id}">Approve</button> <button class="btn danger" data-account-action="reject" data-account-id="${row.id}">Reject</button>`:row.effective_status==='verified'?`<span class="account-action-label approved-label">Approved</span> <button class="btn danger" data-account-action="suspend" data-account-id="${row.id}">Suspend</button>`:row.effective_status==='suspended'?`<span class="account-action-label suspended-label">Suspended</span> <button class="btn primary" data-account-action="reactivate" data-account-id="${row.id}">Revert</button>`:'—'; const auditText=audit?`${esc(audit.previous_status)} → ${esc(audit.new_status)}<small>${esc(audit.reason)} · ${esc(audit.created_at)}</small>`:'—'; return `<tr><td><strong>${esc(row.company_name||'—')}</strong><small>${esc(row.contact_name||'')}</small></td><td>${esc(row.email||'—')}</td><td>${row.role==='partner'?'Partner':'SME'}</td><td>${esc(row.registration_number||'—')}</td><td>${row.role==='partner'?`${esc(app?.organization_type||'Not supplied')} · ${esc(app?.phone||'Not supplied')}<small>${esc(app?.business_description||'No business description')}</small>`:esc(row.sector||'—')}</td><td>${statusBadge(row.effective_status)}</td><td>${auditText}</td><td>${actionMarkup}</td></tr>`;}).join('')}</tbody></table></div>`:empty(emptyText);
  $$('[data-account-filter]').forEach(button=>{button.classList.toggle('active',button.dataset.accountFilter===filter);button.onclick=()=>loadSMEs(button.dataset.accountFilter);});
  $$('[data-account-action]').forEach(button=>button.onclick=async()=>{
    const action=button.dataset.accountAction;
    if(!window.confirm(`${action[0].toUpperCase()+action.slice(1)} this account? This decision will be audited.`)) return;
    const reason=window.prompt(`Enter the reason for ${action} (at least 3 characters):`);
    if(!reason||reason.trim().length<3) return;
    button.disabled=true;
    const {error:actionError}=await db.functions.invoke('account-workflow',{body:{action:'change-account-status',profileId:button.dataset.accountId,changeAction:action,reviewNote:reason.trim()}});
    if(actionError){button.disabled=false;return fail(actionError);}
    toast(`Account ${({approve:'approved',reject:'rejected',suspend:'suspended',reactivate:'reactivated'})[action]} and audit recorded.`); await loadSMEs(filter);
  });
}
function renderNavigation(){
  const base=profile?.role==='admin'?[['queue','Transaction approvals'],['smes','Account verification'],['projects','Projects'],['admin-subscriptions','Subscription management'],['developer-billing','Developer billing'],['revenue','Revenue dashboard'],['reports','Platform activity']]:profile?.role==='partner'?[['partner','Partner dashboard'],['wallet','Demo RM Wallet'],['partner-projects','Carbon projects'],['partner-reports','Client reports']]:profile?.role==='sme'?[['market','Marketplace'],['wallet','Demo RM Wallet'],['holdings','My holdings'],['requests','My requests'],['reports','Carbon & ESG reports'],['premium','Premium'],['partner-access','Partner access'],['profile','Company profile']]:[];
  $('#navigation').innerHTML=base.map(([id,label])=>`<button class="nav-item ${id===currentView?'active':''}" data-view="${id}">${label}</button>`).join('');
  $$('[data-view]').forEach(button=>button.onclick=()=>{currentView=button.dataset.view;renderNavigation();render();});
}
function render(){
  $('#crumb').textContent=$(`[data-view="${currentView}"]`)?.textContent||'Workspace'; const projectCatalogueView=currentView==='market'||(currentView==='projects'&&isAdmin())||(['holdings','requests'].includes(currentView)&&profile?.role==='sme');
  if(window.CanopyProjects&&projectCatalogueView){$('#content').innerHTML=currentView==='market'?`<div id="demoProjectCatalog"></div><section class="revenue-section legacy-project-list"><h2>Other Canopy sample projects</h2><p>Illustrative sample records only; they do not represent current registry inventory.</p>${market()}</section>`:'<div id="demoProjectCatalog"></div>';if(currentView==='market')bindView();window.CanopyProjects.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh});return;}
  const revenueViews=['wallet','premium','revenue','developer-billing','admin-subscriptions','partner','partner-projects','partner-reports','partner-access']; if(window.CanopyRevenue&&(revenueViews.includes(currentView)||(currentView==='reports'&&profile?.role!=='admin'))){$('#content').innerHTML='<div class="revenue-loading">Loading account data…</div>';window.CanopyRevenue.mount(currentView,{db,profile,projects,holdings,requests,toast,refresh,openWallet:()=>{currentView='wallet';renderNavigation();render();}});return;}
  const views={market:market,holdings:holdingList,requests:requestList,profile:companyProfile,queue:queue,projects:projectAdmin,smes:smeAdmin,reports:reports};const view=views[currentView];if(!view){$('#content').innerHTML=empty('Your account role does not have a dashboard configured.');return;}$('#content').innerHTML=view();bindView();
}
start().catch(fail);
