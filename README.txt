CANOPY CARBON PLATFORM - SME CARBON MARKETPLACE
VERSION 0.3 - LOGIN, MULTI-ROLE PLATFORM & 5-STREAM REVENUE MODEL

Open index.html in a modern browser. No installation is needed.

LOGIN & ROLES
The platform now starts with a login page. Choose a role:
  SME Business  - Browse and trade carbon credits, manage portfolio
  Canopy Admin  - Oversee marketplace, approve requests, billing
  Partner Portal - Refer SMEs, track client activity, earn commissions
Use the Quick Login buttons for instant demo access.

REVENUE STREAMS
1. SME Transaction Fee (1.5%)
   Buy: Credit value + 1.5% platform fee = Total payable
   Sell: Gross value - 1.5% fee = Net proceeds to SME

2. Premium Subscription (RM150/month)
   Free plan: Basic browsing and tracking
   Premium: Advanced analytics, BCX benchmarks, 48h early access to new projects

3. Carbon & ESG Reports (RM100)
   Free snapshot or comprehensive paid report with holdings, transactions,
   retired credits, sustainability summary and verification QR code

4. Project Developer Commission (1%)
   Platform earns 1% commission on developer credit sales
   Admin dashboard tracks per-developer billing and settlement

5. Partner Portal (RM500/month)
   Partners refer SMEs, earn 20% of platform fees on client trades
   Full dashboard with referral management, client ESG data, reporting tools

ADMIN FEATURES
Dashboard, project management, request queue, company verification,
developer billing, revenue analytics (5-stream breakdown with ledger)

SME FEATURES
Carbon credit marketplace, portfolio with analytics, buy/sell/retire,
premium subscription, ESG report generation, transaction history

PARTNER FEATURES
Dashboard overview, SME referral management, client ESG data,
reporting tools, carbon project information, partner analytics

DISCLAIMER
Browser-local data persists when storage is available. Use one tab at a time.
All projects, prices, companies, holdings, trades and records are fictional.
This is not secure authentication or production custody/accounting.
No real payment, BCX connection, registry transaction or legally verified
company check occurs. Sample records must not support environmental claims.

Source files: index.html, style.css, model.js, app.js
Google Fonts are optional; fallback fonts work offline.

PROGRESSIVE WEB APP
Deploy the site files at the domain root over HTTPS. On Android, open the site
in Chrome and use its Install app option to add Canopy to the app launcher.
The manifest requests standalone display, which hides browser navigation when
the installed app is launched. Service workers require HTTPS; localhost is also
supported for development.

The service worker caches only the local public app shell and icons, uses the
network first while online, and falls back to cached pages/assets offline. It
does not cache configuration, authentication responses, or API data. When a
new service-worker version is deployed, Canopy offers an Update button. The QR
page remains available, but its generated QR image requires an internet
connection because it is supplied by an external QR image service.
For each release, update the cache version in sw.js so browsers detect the new
worker and refresh the offline app shell.
