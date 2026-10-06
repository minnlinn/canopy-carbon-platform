/* Canopy Carbon Platform — Domain Model v3.0
   Malaysian SME & Partner Fractional Carbon Asset Workspace
   Includes:
   - 1.5% SME Platform Transaction Fee
   - RM150/month SME Premium Subscription (Analytics, Market Intel, Priority Access)
   - RM100 Carbon & ESG Compliance Report Generation
   - 1% Project Developer Commission & Partner/Developer Billing
   - RM500/month Partner Portal (Advisory, Client Dashboard, Referral Tracking)
   - Multi-role Authentication & Session Management (Admin, SME, Partner)
*/
(function(root){
'use strict';

const active = r => ['Submitted','Approved'].includes(r.status);
const ensure = (v, m) => { if (!v) throw new Error(m); };
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);

function seed() {
  return {
    version: 3,
    seq: 50,
    currentUser: null, // null = show login screen. When set: { id, role, name, email }
    
    // Curated Projects (Aligned with Malaysian BCX & VCM Standards)
    projects: [
      {
        id: 'kuamut',
        name: 'Kuamut Rainforest Conservation',
        type: 'Forest conservation',
        location: 'Sabah, Malaysia',
        price: 6500, // RM65.00 per tCO2e
        vintage: '2025',
        method: 'VCS VM0007 / REDD+ Avoided Deforestation',
        description: 'Landmark Malaysian forest conservation initiative protecting 83,381 hectares of tropical rainforest in Tongod and Kinabatangan, generating certified high-integrity carbon credits on Bursa Carbon Exchange (BCX).',
        inventory: 3500, // 350.0 tCO2e available
        status: 'Published',
        registry: 'VERRA-VCS-2485',
        developer: 'Rakyat Berjaya / Permian Malaysia',
        developerId: 'dev1',
        developerEmail: 'carbon@permian.my',
        earlyAccess: true, // Priority early access for Premium SMEs!
        documents: []
      },
      {
        id: 'forest',
        name: 'Borneo Peatland & Habitat Preservation',
        type: 'Forest conservation',
        location: 'Sarawak, Malaysia',
        price: 4800, // RM48.00 per tCO2e
        vintage: '2024',
        method: 'Avoided deforestation & peatland restoration',
        description: 'An illustrative forest conservation project focused on protecting critical peat swamp habitat, avoiding wildfires and supporting indigenous community stewardship.',
        inventory: 2500,
        status: 'Published',
        registry: 'DEMO-FOR-001',
        developer: 'Borneo Eco-Forestry Ltd',
        developerId: 'dev2',
        developerEmail: 'contact@borneo-ecoforest.com',
        earlyAccess: false,
        documents: []
      },
      {
        id: 'methane',
        name: 'Peninsula Palm Oil Biogas Recovery',
        type: 'Methane avoidance',
        location: 'Perak, Malaysia',
        price: 3600, // RM36.00 per tCO2e
        vintage: '2025',
        method: 'Anaerobic digestion & methane capture',
        description: 'Capturing fugitive methane emissions from palm oil mill effluent (POME) in Perak and converting it into clean electricity for the national grid.',
        inventory: 4000,
        status: 'Published',
        registry: 'DEMO-BIO-002',
        developer: 'Perak BioEnergy Developers Sdn Bhd',
        developerId: 'dev3',
        developerEmail: 'projects@perakbioenergy.my',
        earlyAccess: false,
        documents: []
      },
      {
        id: 'biochar',
        name: 'Circular Agro-Biomass Biochar',
        type: 'Biochar removal',
        location: 'Johor, Malaysia',
        price: 12000, // RM120.00 per tCO2e
        vintage: '2025',
        method: 'Biomass pyrolysis & long-term soil storage',
        description: 'High-durability carbon removal converting agricultural residues into biochar, sequestering carbon permanently while regenerating agricultural soils in Johor.',
        inventory: 1500,
        status: 'Published',
        registry: 'DEMO-REM-003',
        developer: 'Southern Agro-Carbon Tech',
        developerId: 'dev4',
        developerEmail: 'info@southerncarbon.my',
        earlyAccess: false,
        documents: []
      }
    ],

    // SME Accounts
    accounts: [
      {
        id: 'sme1',
        name: 'Meranti Manufacturing Sdn Bhd',
        registration: '201801045892 (1298451-A)',
        contact: 'Aina Tan',
        email: 'aina@meranti.com.my',
        role: 'sme',
        status: 'Verified',
        sector: 'Precision Manufacturing',
        location: 'Shah Alam, Selangor',
        plan: 'Premium', // RM150/mo
        planRenewsAt: '2026-11-01',
        partnerId: 'partner1', // Referred by EcoPartner Advisory
        documents: [],
        note: 'Seeded verified demo SME. Active Premium subscriber.'
      },
      {
        id: 'sme2',
        name: 'Kita Foods Sdn Bhd',
        registration: '202001019342 (1365821-M)',
        contact: 'Daniel Lim',
        email: 'daniel@kitafoods.my',
        role: 'sme',
        status: 'Verified',
        sector: 'Food & Beverage Production',
        location: 'Bayan Lepas, Penang',
        plan: 'Free',
        partnerId: null,
        documents: [],
        note: 'Seeded verified demo company on Free Plan.'
      },
      {
        id: 'sme3',
        name: 'Rimba Packaging Solutions',
        registration: '202201089234 (1452901-T)',
        contact: 'Mei Lee',
        email: 'mei@rimbapack.com',
        role: 'sme',
        status: 'Pending',
        sector: 'Industrial Packaging',
        location: 'Johor Bahru, Johor',
        plan: 'Free',
        partnerId: 'partner1',
        documents: [],
        note: 'Awaiting KYB review & business verification.'
      }
    ],

    // Partner Accounts (Sustainability Consultants, Green Banks & ESG Advisors paying RM500/mo)
    partners: [
      {
        id: 'partner1',
        name: 'EcoPartner ESG Advisory Sdn Bhd',
        registration: '201901024589 (1325678-K)',
        contact: 'Azlan Rahman',
        email: 'azlan@ecopartner.my',
        role: 'partner',
        plan: 'Partner Portal (RM500/mo)',
        subscriptionStatus: 'Active',
        referralCode: 'ECO-CANOPY-88',
        referredCount: 8,
        activeClients: 5,
        totalClientVolume: 420, // 42.0 tCO2e
        commissionEarned: 24500 // RM245.00
      },
      {
        id: 'partner2',
        name: 'CIMB Green SME Desk',
        registration: '201501099881 (1154210-P)',
        contact: 'Farah Zainal',
        email: 'farah@cimb-green.my',
        role: 'partner',
        plan: 'Partner Portal (RM500/mo)',
        subscriptionStatus: 'Active',
        referralCode: 'CIMB-GREEN-SME',
        referredCount: 14,
        activeClients: 11,
        totalClientVolume: 890,
        commissionEarned: 58000
      }
    ],

    // Holdings (Integer tenths of tCO2e: 150 = 15.0 tCO2e)
    balances: {
      sme1: { kuamut: 150, forest: 125, methane: 80 },
      sme2: { forest: 50 },
      sme3: {}
    },

    requests: [],

    retirements: [
      {
        id: 'CERT-0001',
        requestId: 'REQ-SEED-01',
        accountId: 'sme1',
        projectId: 'kuamut',
        units: 50, // 5.0 tCO2e
        beneficiary: 'Meranti Manufacturing Sdn Bhd',
        purpose: 'Annual Scope 2 Facility Decarbonisation & ESG Audit 2026',
        date: '2026-09-28T10:15:00.000Z',
        reference: 'BCX-RET-2026-KUAMUT-091'
      }
    ],

    audit: [],

    ledger: [
      { id: 'OPEN-1', type: 'Opening allocation', accountId: 'sme1', projectId: 'kuamut', units: 150, amount: 0, date: '2026-10-01T00:00:00.000Z', reference: 'Initial BCX seed balance' },
      { id: 'OPEN-2', type: 'Opening allocation', accountId: 'sme1', projectId: 'forest', units: 125, amount: 0, date: '2026-10-01T00:00:00.000Z', reference: 'Initial seed balance' },
      { id: 'OPEN-3', type: 'Opening allocation', accountId: 'sme1', projectId: 'methane', units: 80, amount: 0, date: '2026-10-01T00:00:00.000Z', reference: 'Initial seed balance' },
      { id: 'OPEN-4', type: 'Opening allocation', accountId: 'sme2', projectId: 'forest', units: 50, amount: 0, date: '2026-10-01T00:00:00.000Z', reference: 'Initial seed balance' }
    ],

    // 5-Pillar Platform Revenue Tracking
    platformRevenue: [
      { id: 'REV-SUB-01', category: 'sme_subscription', source: 'SME Premium Subscription', payer: 'Meranti Manufacturing', amount: 15000, date: '2026-09-01T08:00:00.000Z', reference: 'SUB-SME1-M09' },
      { id: 'REV-SUB-02', category: 'partner_subscription', source: 'Partner Portal Subscription', payer: 'EcoPartner ESG Advisory', amount: 50000, date: '2026-09-01T09:00:00.000Z', reference: 'SUB-PARTNER1-M09' },
      { id: 'REV-SUB-03', category: 'partner_subscription', source: 'Partner Portal Subscription', payer: 'CIMB Green SME Desk', amount: 50000, date: '2026-09-01T09:30:00.000Z', reference: 'SUB-PARTNER2-M09' },
      { id: 'REV-RPT-01', category: 'esg_report', source: 'Carbon & ESG Report Fee', payer: 'Meranti Manufacturing', amount: 10000, date: '2026-09-25T14:20:00.000Z', reference: 'RPT-INV-2026-001' },
      { id: 'REV-DEV-01', category: 'developer_commission', source: 'Project Developer Commission (1%)', payer: 'Rakyat Berjaya / Permian Malaysia', amount: 975, date: '2026-09-28T10:15:00.000Z', reference: 'DEV-COM-KUAMUT-01' },
      { id: 'REV-FEE-01', category: 'transaction_fee', source: 'SME Transaction Fee (1.5%)', payer: 'Meranti Manufacturing', amount: 1463, date: '2026-09-28T10:15:00.000Z', reference: 'FEE-TRD-2026-001' }
    ],

    // Project Developer 1% Commission Billing Ledger
    developerBilling: [
      {
        id: 'DEV-BILL-001',
        developer: 'Rakyat Berjaya / Permian Malaysia',
        projectId: 'kuamut',
        projectName: 'Kuamut Rainforest Conservation',
        creditsSold: 150, // 15.0 tCO2e
        transactionValue: 97500, // RM975.00
        commissionRate: 0.01,
        commissionEarned: 975, // RM9.75
        date: '2026-09-28T10:15:00.000Z',
        status: 'Settled',
        reference: 'DEV-REC-001'
      },
      {
        id: 'DEV-BILL-002',
        developer: 'Borneo Eco-Forestry Ltd',
        projectId: 'forest',
        projectName: 'Borneo Peatland & Habitat Preservation',
        creditsSold: 125, // 12.5 tCO2e
        transactionValue: 60000, // RM600.00
        commissionRate: 0.01,
        commissionEarned: 600, // RM6.00
        date: '2026-10-01T11:00:00.000Z',
        status: 'Invoiced',
        reference: 'DEV-INV-002'
      },
      {
        id: 'DEV-BILL-003',
        developer: 'Perak BioEnergy Developers Sdn Bhd',
        projectId: 'methane',
        projectName: 'Peninsula Palm Oil Biogas Recovery',
        creditsSold: 80, // 8.0 tCO2e
        transactionValue: 28800, // RM288.00
        commissionRate: 0.01,
        commissionEarned: 288, // RM2.88
        date: '2026-10-02T15:30:00.000Z',
        status: 'Pending Settlement',
        reference: 'DEV-PEND-003'
      }
    ],

    // Carbon & ESG Compliance Reports (RM100 advanced)
    esgReports: [
      {
        id: 'ESG-RPT-001',
        accountId: 'sme1',
        title: 'Bursa / BNM JC3 Aligned Carbon & ESG Compliance Report',
        tier: 'Comprehensive Audit (RM100)',
        period: 'Q3 2026 (July - September 2026)',
        generatedAt: '2026-09-25T14:20:00.000Z',
        cost: 10000,
        reference: 'ESG-AUDIT-2026-MERANTI',
        holdingsSnapshot: [
          { project: 'Kuamut Rainforest Conservation', units: 15.0, registry: 'VERRA-VCS-2485' },
          { project: 'Borneo Peatland Preservation', units: 12.5, registry: 'DEMO-FOR-001' },
          { project: 'Peninsula Biogas Recovery', units: 8.0, registry: 'DEMO-BIO-002' }
        ],
        retiredUnits: 5.0,
        netEmissionsAvoided: 35.5,
        sustainabilityScore: 'Tier 1 - Supply Chain Compliant'
      }
    ],

    // SME Referral Pipeline for Partners
    referrals: [
      {
        id: 'REF-001',
        partnerId: 'partner1',
        smeName: 'Meranti Manufacturing Sdn Bhd',
        email: 'aina@meranti.com.my',
        contact: 'Aina Tan',
        sector: 'Precision Manufacturing',
        date: '2026-08-15T09:00:00.000Z',
        status: 'Onboarded & Trading',
        reward: 1500, // RM15.00
        completedTrades: 3
      },
      {
        id: 'REF-002',
        partnerId: 'partner1',
        smeName: 'Rimba Packaging Solutions',
        email: 'mei@rimbapack.com',
        contact: 'Mei Lee',
        sector: 'Industrial Packaging',
        date: '2026-09-20T11:30:00.000Z',
        status: 'Pending Verification',
        reward: 0,
        completedTrades: 0
      },
      {
        id: 'REF-003',
        partnerId: 'partner1',
        smeName: 'Apex Precision Plastic Sdn Bhd',
        email: 'admin@apexplastic.my',
        contact: 'Kenneth Chong',
        sector: 'Plastics & Polymers',
        date: '2026-09-29T14:00:00.000Z',
        status: 'Registered',
        reward: 0,
        completedTrades: 0
      },
      {
        id: 'REF-004',
        partnerId: 'partner2',
        smeName: 'Southern Cold Chain Logistics',
        email: 'sustainability@southerncold.com.my',
        contact: 'Hafiz Mansor',
        sector: 'Transport & Logistics',
        date: '2026-09-10T16:20:00.000Z',
        status: 'Onboarded & Trading',
        reward: 3500,
        completedTrades: 4
      }
    ]
  };
}

class Store {
  constructor(data) {
    this.data = data || seed();
  }

  // Lookups
  project(id) {
    const p = this.data.projects.find(p => p.id === id);
    ensure(p, 'Project not found.');
    return p;
  }

  account(id) {
    const a = this.data.accounts.find(a => a.id === id);
    ensure(a, 'Company not found.');
    return a;
  }

  partner(id) {
    const pt = this.data.partners.find(p => p.id === id);
    ensure(pt, 'Partner not found.');
    return pt;
  }

  verified(id) {
    ensure(this.account(id).status === 'Verified', 'This company must be verified before transacting.');
  }

  admin(actor) {
    ensure(actor === 'admin', 'Administrator access required.');
  }

  next(prefix) {
    return prefix + '-' + String(++this.data.seq).padStart(4, '0');
  }

  log(actor, action, detail) {
    this.data.audit.unshift({
      id: this.next('AUD'),
      actor,
      action,
      detail,
      date: new Date().toISOString()
    });
  }

  balance(accountId, projectId) {
    return this.data.balances[accountId]?.[projectId] || 0;
  }

  reserved(accountId, projectId) {
    return this.data.requests
      .filter(r => r.accountId === accountId && r.projectId === projectId && r.type !== 'Buy' && active(r))
      .reduce((s, r) => s + r.units, 0);
  }

  available(accountId, projectId) {
    return this.balance(accountId, projectId) - this.reserved(accountId, projectId);
  }

  inventory(projectId) {
    return this.project(projectId).inventory - this.data.requests
      .filter(r => r.projectId === projectId && r.type === 'Buy' && active(r))
      .reduce((s, r) => s + r.units, 0);
  }

  /* Price & Fee Quote:
     - subtotal: credit value (cents)
     - fee: 1.5% SME platform fee (cents)
     - devCommission: 1.0% Project developer commission (cents)
     - total: buyer payable = subtotal + fee
     - net: seller proceeds = subtotal - fee
  */
  quote(projectId, units, customPrice) {
    const p = this.project(projectId);
    const unitPrice = customPrice ?? p.price;
    const subtotal = Math.round(unitPrice * units / 10);
    const fee = Math.round(subtotal * 0.015); // 1.5% SME Platform fee
    const devCommission = Math.round(subtotal * 0.01); // 1.0% Project Developer Commission
    return {
      subtotal,
      fee,
      devCommission,
      total: subtotal + fee,
      net: subtotal - fee
    };
  }

  // Request Submission
  submit(actor, input) {
    const a = this.account(actor);
    this.verified(actor);
    const p = this.project(input.projectId);
    const type = input.type;
    ensure(['Buy', 'Sell', 'Transfer', 'Retire'].includes(type), 'Unknown request type.');

    const units = Number(input.units);
    ensure(Number.isSafeInteger(units) && units > 0 && units <= 1000000, 'Use quantities from 0.1 to 100,000 in increments of 0.1 tCO₂e.');

    if (type === 'Buy') {
      ensure(p.status === 'Published', 'Project is not available for purchase.');
      // Priority project check for Premium SMEs
      if (p.earlyAccess && a.plan !== 'Premium') {
        throw new Error('This project is currently in Early Access for Canopy Premium members. Upgrade to Premium for priority access, or wait for public opening.');
      }
      ensure(this.inventory(p.id) >= units, 'Not enough unreserved project inventory.');
    } else {
      ensure(this.available(actor, p.id) >= units, 'Not enough available credits. Open requests reserve credits.');
    }

    const price = type === 'Sell' ? Number(input.price) : p.price;
    if (type === 'Sell') {
      ensure(Number.isSafeInteger(price) && price > 0 && price <= 100000000, 'Enter a valid asking price.');
    }
    if (type === 'Transfer') {
      this.verified(input.recipientId);
      ensure(input.recipientId !== actor, 'Choose a different recipient company.');
    }
    if (type === 'Retire') {
      ensure(clean(input.purpose).length >= 5, 'Explain the purpose of retirement (at least 5 characters).');
    }

    const r = {
      id: this.next('REQ'),
      accountId: actor,
      projectId: p.id,
      type,
      units,
      price,
      recipientId: type === 'Transfer' ? input.recipientId : null,
      purpose: clean(input.purpose),
      status: 'Submitted',
      date: new Date().toISOString(),
      reviewNote: '',
      reference: '',
      quote: this.quote(p.id, units, price)
    };

    this.data.requests.unshift(r);
    this.log(actor, type + ' request submitted', r.id + ' · ' + a.name + ' (' + (units/10) + ' tCO₂e)');
    return r;
  }

  request(id) {
    const r = this.data.requests.find(r => r.id === id);
    ensure(r, 'Request not found.');
    return r;
  }

  cancel(actor, id) {
    const r = this.request(id);
    ensure(r.accountId === actor, 'You can cancel only your own requests.');
    ensure(r.status === 'Submitted', 'Only submitted requests can be cancelled.');
    r.status = 'Cancelled';
    this.log(actor, 'Request cancelled', id);
  }

  review(actor, id, decision, note) {
    this.admin(actor);
    const r = this.request(id);
    ensure(active(r), 'This request is already closed.');
    ensure(['Approve', 'Reject'].includes(decision), 'Invalid decision.');
    ensure(clean(note).length >= 3, 'Add a review note.');

    if (decision === 'Approve') {
      ensure(r.status === 'Submitted', 'Request is already approved.');
      this.verified(r.accountId);
      if (r.type === 'Transfer') this.verified(r.recipientId);
      r.status = 'Approved';
    } else {
      r.status = 'Rejected';
    }
    r.reviewNote = clean(note);
    this.log(actor, 'Request ' + r.status.toLowerCase(), id + ' · ' + r.reviewNote);
  }

  // Trade Settlement & Revenue Recording
  settle(actor, id, input) {
    this.admin(actor);
    const r = this.request(id);
    ensure(r.status === 'Approved', 'Approve this request before completing settlement.');
    this.verified(r.accountId);

    const p = this.project(r.projectId);
    const reference = clean(input.reference, 100);
    ensure(reference.length >= 4, 'Enter a demo execution or BCX registry reference.');
    ensure(!this.data.requests.some(x => x.id !== id && x.status === 'Completed' && x.reference === reference), 'That execution reference has already been used.');

    let recipient = r.recipientId;
    if (r.type === 'Sell') {
      recipient = input.buyerId;
      ensure(recipient && recipient !== r.accountId, 'Select a different verified buying company.');
      this.verified(recipient);
    }
    if (r.type === 'Transfer') this.verified(recipient);
    if (r.type === 'Buy') ensure(p.inventory >= r.units, 'Insufficient project inventory.');
    else ensure(this.balance(r.accountId, p.id) >= r.units, 'Insufficient holdings.');
    if (r.type === 'Retire') ensure(input.confirmRetirement === true, 'Confirm the simulated retirement is irreversible.');

    const date = new Date().toISOString();
    const change = (a, n, type, amount) => {
      this.data.balances[a] ??= {};
      this.data.balances[a][p.id] = this.balance(a, p.id) + n;
      this.data.ledger.unshift({
        id: this.next('TXN'),
        requestId: id,
        accountId: a,
        projectId: p.id,
        units: n,
        type,
        amount,
        date,
        reference
      });
    };

    if (r.type === 'Buy') {
      p.inventory -= r.units;
      change(r.accountId, r.units, 'Buy', -r.quote.total);

      // Record 1.5% SME Platform Transaction Fee
      this.data.platformRevenue.unshift({
        id: this.next('REV'),
        category: 'transaction_fee',
        source: 'SME Transaction Fee (1.5%)',
        payer: this.account(r.accountId).name,
        amount: r.quote.fee,
        date,
        reference: 'FEE-' + r.id
      });

      // Record 1.0% Project Developer Commission
      const devCom = r.quote.devCommission;
      this.data.developerBilling.unshift({
        id: this.next('DEV-BILL'),
        developer: p.developer,
        projectId: p.id,
        projectName: p.name,
        creditsSold: r.units,
        transactionValue: r.quote.subtotal,
        commissionRate: 0.01,
        commissionEarned: devCom,
        date,
        status: 'Pending Settlement',
        reference: 'DEV-' + r.id
      });

      this.data.platformRevenue.unshift({
        id: this.next('REV'),
        category: 'developer_commission',
        source: 'Project Developer Commission (1%)',
        payer: p.developer,
        amount: devCom,
        date,
        reference: 'DEV-' + r.id
      });

      // Partner referral incentive if applicable
      const buyerAccount = this.account(r.accountId);
      if (buyerAccount.partnerId) {
        const partnerRef = this.data.referrals.find(ref => ref.partnerId === buyerAccount.partnerId && ref.email === buyerAccount.email);
        if (partnerRef) {
          partnerRef.completedTrades = (partnerRef.completedTrades || 0) + 1;
          const reward = Math.round(r.quote.fee * 0.2); // 20% of fee shared with partner
          partnerRef.reward = (partnerRef.reward || 0) + reward;
          const pt = this.partner(buyerAccount.partnerId);
          pt.commissionEarned = (pt.commissionEarned || 0) + reward;
          pt.totalClientVolume = (pt.totalClientVolume || 0) + r.units;
        }
      }
    }

    if (r.type === 'Sell') {
      change(r.accountId, -r.units, 'Sell', r.quote.net);
      change(recipient, r.units, 'Buy from SME', -r.quote.subtotal);

      // Record 1.5% SME Platform Transaction Fee on sell proceeds
      this.data.platformRevenue.unshift({
        id: this.next('REV'),
        category: 'transaction_fee',
        source: 'SME Transaction Fee (1.5%)',
        payer: this.account(r.accountId).name,
        amount: r.quote.fee,
        date,
        reference: 'FEE-' + r.id
      });
    }

    if (r.type === 'Transfer') {
      change(r.accountId, -r.units, 'Transfer out', 0);
      change(recipient, r.units, 'Transfer in', 0);
    }

    if (r.type === 'Retire') {
      change(r.accountId, -r.units, 'Retire', 0);
      this.data.retirements.unshift({
        id: this.next('CERT'),
        requestId: id,
        accountId: r.accountId,
        projectId: p.id,
        units: r.units,
        beneficiary: this.account(r.accountId).name,
        purpose: r.purpose,
        date,
        reference
      });
    }

    r.status = 'Completed';
    r.reference = reference;
    r.completedAt = date;
    r.recipientId = recipient || null;
    this.log(actor, 'Demo ' + r.type.toLowerCase() + ' completed', id + ' · ' + reference);
    return r;
  }

  // Premium Subscription (RM150 / month)
  subscribePremium(actor, smeId) {
    const a = this.account(smeId);
    ensure(a.status === 'Verified', 'Only verified companies can subscribe to Canopy Premium.');
    a.plan = 'Premium';
    a.planRenewsAt = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    const date = new Date().toISOString();

    // Record RM150 (15,000 cents) Revenue
    this.data.platformRevenue.unshift({
      id: this.next('REV'),
      category: 'sme_subscription',
      source: 'SME Premium Subscription (RM150/mo)',
      payer: a.name,
      amount: 15000,
      date,
      reference: 'SUB-' + a.id + '-' + String(Date.now()).slice(-6)
    });

    // Add entry to SME ledger
    this.data.ledger.unshift({
      id: this.next('TXN'),
      requestId: 'SUB-PREMIUM',
      accountId: a.id,
      projectId: 'forest',
      units: 0,
      type: 'Premium Subscription (1 Month)',
      amount: -15000,
      date,
      reference: 'Canopy Premium Tier'
    });

    this.log(actor, 'SME Premium Activated', a.name + ' · RM150 monthly plan');
    return a;
  }

  // Generate / Purchase Carbon & ESG Report (RM100 for Comprehensive Audit)
  generateEsgReport(actor, smeId, input) {
    const a = this.account(smeId);
    const date = new Date().toISOString();
    const isAdvanced = input.tier === 'Comprehensive Audit (RM100)';
    const cost = isAdvanced ? 10000 : 0; // RM100.00 in cents

    if (isAdvanced) {
      this.data.platformRevenue.unshift({
        id: this.next('REV'),
        category: 'esg_report',
        source: 'Carbon & ESG Compliance Report Fee',
        payer: a.name,
        amount: cost,
        date,
        reference: 'RPT-INV-' + String(Date.now()).slice(-6)
      });

      this.data.ledger.unshift({
        id: this.next('TXN'),
        requestId: 'RPT-FEE',
        accountId: a.id,
        projectId: 'kuamut',
        units: 0,
        type: 'ESG Compliance Audit Report Fee',
        amount: -cost,
        date,
        reference: 'Bursa / BNM JC3 Audit Pack'
      });
    }

    const heldProjects = this.data.projects.filter(p => this.balance(smeId, p.id) > 0);
    const snapshot = heldProjects.map(p => ({
      project: p.name,
      units: this.balance(smeId, p.id) / 10,
      registry: p.registry
    }));
    const totalHeld = Object.values(this.data.balances[smeId] || {}).reduce((s, u) => s + u, 0) / 10;
    const totalRetired = this.data.retirements.filter(r => r.accountId === smeId).reduce((s, r) => s + r.units, 0) / 10;

    const report = {
      id: this.next('ESG-RPT'),
      accountId: smeId,
      title: input.title || (isAdvanced ? 'Bursa / BNM JC3 Aligned Carbon & ESG Compliance Report' : 'Basic Sustainability Snapshot'),
      tier: input.tier || 'Comprehensive Audit (RM100)',
      period: input.period || 'Current FY 2026',
      generatedAt: date,
      cost,
      reference: 'ESG-' + String(Date.now()).slice(-7),
      holdingsSnapshot: snapshot,
      retiredUnits: totalRetired,
      totalHeld,
      netEmissionsAvoided: totalHeld + totalRetired,
      sustainabilityScore: totalRetired > 0 ? 'Tier 1 - Supply Chain Compliant' : 'Tier 2 - Transitioning'
    };

    this.data.esgReports.unshift(report);
    this.log(actor, 'ESG Report Generated', a.name + ' · ' + report.id + (isAdvanced ? ' (RM100)' : ' (Free)'));
    return report;
  }

  // Developer Billing Settle / Invoice
  settleDeveloperBill(actor, billId, actionType = 'Settled') {
    this.admin(actor);
    const bill = this.data.developerBilling.find(b => b.id === billId);
    ensure(bill, 'Billing entry not found.');
    bill.status = actionType;
    this.log(actor, 'Developer Commission ' + actionType, bill.developer + ' · RM' + (bill.commissionEarned / 100).toFixed(2));
    return bill;
  }

  // Partner: Refer a new Malaysian SME
  addReferral(partnerId, input) {
    const pt = this.partner(partnerId);
    const email = clean(input.email, 120);
    ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
    ensure(clean(input.smeName).length >= 3, 'Enter company name.');
    ensure(clean(input.contact).length >= 2, 'Enter contact person name.');

    const ref = {
      id: this.next('REF'),
      partnerId,
      smeName: clean(input.smeName, 100),
      email,
      contact: clean(input.contact, 100),
      sector: clean(input.sector || 'General Commerce', 80),
      date: new Date().toISOString(),
      status: 'Registered',
      reward: 0,
      completedTrades: 0
    };

    this.data.referrals.unshift(ref);
    pt.referredCount = (pt.referredCount || 0) + 1;
    this.log(partnerId, 'Malaysian SME Referred', ref.smeName + ' · Code ' + pt.referralCode);
    return ref;
  }

  // Account Management
  addAccount(actor, input) {
    const email = clean(input.email, 120);
    ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email.');
    const registration = clean(input.registration, 60);
    ensure(registration.length >= 3, 'Enter a company registration reference.');
    ensure(!this.data.accounts.some(a => a.registration.toLowerCase() === registration.toLowerCase()), 'Registration reference already exists.');
    ensure(clean(input.name).length >= 3 && clean(input.contact).length >= 2, 'Enter company and contact names.');

    const a = {
      id: this.next('SME'),
      name: clean(input.name, 100),
      registration,
      email,
      contact: clean(input.contact, 100),
      sector: clean(input.sector, 80),
      role: 'sme',
      status: 'Pending',
      plan: 'Free',
      location: clean(input.location || 'Malaysia', 100),
      documents: [],
      note: 'Awaiting KYB review & verification.'
    };

    this.data.accounts.push(a);
    this.data.balances[a.id] = {};
    this.log(actor, 'Company registered for verification', a.name);
    return a;
  }

  verify(actor, id, status, note) {
    this.admin(actor);
    ensure(['Verified', 'Pending', 'Suspended', 'Rejected'].includes(status), 'Invalid company status.');
    ensure(clean(note).length >= 3, 'Add a verification decision note.');
    const a = this.account(id);
    a.status = status;
    a.note = clean(note);
    this.log(actor, 'Company ' + status.toLowerCase(), a.name + ' · ' + a.note);
  }

  saveProject(actor, input, id) {
    this.admin(actor);
    ensure(clean(input.name).length >= 3, 'Project name is required.');
    ensure(['Draft', 'Published', 'Paused'].includes(input.status), 'Invalid listing status.');
    ensure(Number.isSafeInteger(input.price) && input.price > 0 && input.price <= 100000000, 'Enter a valid price.');
    ensure(Number.isSafeInteger(input.inventory) && input.inventory >= 0 && input.inventory <= 10000000, 'Enter a valid inventory quantity.');
    ensure(/^\d{4}$/.test(input.vintage), 'Vintage must be a four-digit year.');
    ensure(clean(input.description).length >= 10, 'Add a project description.');

    const existing = id ? this.project(id) : null;
    if (existing) {
      const reserved = existing.inventory - this.inventory(id);
      ensure(input.inventory >= reserved, 'Inventory cannot be lower than pending buy reservations.');
    }

    const fields = {
      name: clean(input.name, 100),
      location: clean(input.location, 100),
      type: clean(input.type, 60),
      method: clean(input.method, 100),
      description: clean(input.description, 1500),
      registry: clean(input.registry, 100),
      developer: clean(input.developer || 'Verified Carbon Developer', 100),
      developerEmail: clean(input.developerEmail || 'developer@canopy.eco', 100),
      vintage: input.vintage,
      status: input.status,
      price: input.price,
      inventory: input.inventory,
      earlyAccess: Boolean(input.earlyAccess)
    };

    let p;
    if (existing) {
      Object.assign(existing, fields);
      p = existing;
    } else {
      p = { ...fields, id: this.next('PRJ'), documents: [] };
      this.data.projects.push(p);
    }
    this.log(actor, 'Project ' + (id ? 'updated' : 'created'), p.name);
    return p;
  }

  attach(actor, kind, id, doc) {
    if (kind === 'project') this.admin(actor);
    else ensure(actor === 'admin' || actor === id, 'Cannot upload for another company.');
    ensure(['project', 'account'].includes(kind), 'Invalid document destination.');
    ensure(doc.name && ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(doc.mime), 'Use PDF, PNG, JPG or TXT.');
    ensure(doc.size <= 500000 && doc.size > 0, 'Files must be under 500 KB.');
    ensure(/^data:(application\/pdf|image\/(png|jpeg)|text\/plain);base64,/.test(doc.data), 'Invalid file format.');

    const item = kind === 'project' ? this.project(id) : this.account(id);
    ensure(item.documents.length < 5, 'Maximum five documents per item.');
    item.documents.push({ ...doc, id: this.next('DOC') });
    this.log(actor, 'Demo document attached', item.name + ' · ' + doc.name);
  }
}

root.CanopyModel = { Store, seed, active };
if (typeof module !== 'undefined') module.exports = root.CanopyModel;
})(typeof window !== 'undefined' ? window : globalThis);
