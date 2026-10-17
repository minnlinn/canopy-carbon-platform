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

2. Premium Subscription (RM250/month)
   Free plan: Basic browsing and tracking
   Premium: Advanced analytics, BCX benchmarks, 48h early access to new projects

3. Carbon & ESG Reports (RM500/report)
   Free snapshot or comprehensive paid report with holdings, transactions,
   retired credits, sustainability summary and verification QR code

4. Project Developer Commission (1.5%)
   Platform earns a separate 1.5% commission on developer credit sales
   Admin dashboard tracks per-developer billing and settlement

5. Partner Portal (RM500/month)
   Partners refer SMEs; any referral reward is configured by an Admin and is
   disabled until a rate is approved.
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

ACCOUNT VERIFICATION EMAILS (SUPABASE + RESEND)
The account-notification migration is additive. It creates a Canopy-prefixed
notification outbox and triggers only for profiles created after deployment;
it does not backfill existing accounts or change their verification states.
The website source does not include a database schema snapshot or live Supabase
access. Before applying the migration, inspect the current profiles table in
Supabase SQL Editor and confirm it has id (UUID matching auth.users.id), role,
verification_status, and review_note. The app currently expects SME/Partner
roles and lowercase pending/verified status values. Resolve any schema mismatch
before applying the migration; do not drop or replace existing policies.

Example schema inspection:
  select column_name, data_type, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
  order by ordinal_position;

The migration sets newly registered non-service profiles to SME + pending,
blocks browser-side changes to role/verification_status, and grants approval
to a service-only database function. Existing Partner accounts are supported
by the review/email flow; this website currently has no Partner self-registration
form, so Partner accounts must continue to be provisioned through a trusted
administrative process.

Setup steps:
1. Install the Supabase CLI and link this folder to the existing project after
   backing up the schema: `supabase link --project-ref <project-ref>`. Review
   supabase/migrations/202610170001_canopy_account_notifications.sql, then apply
   it with `supabase db push`.
2. In Resend, add a sending domain you control. Publish the DNS records Resend
   supplies (DKIM and SPF, plus DMARC recommended), wait for domain verification,
   create an API key, and choose a From address on that verified domain, such as
   `Canopy <notifications@your-domain.example>`. Resend's shared test sender is
   not suitable for arbitrary production recipients.
3. Generate a random webhook secret locally. In PowerShell:
   `$secret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
   Keep it private; do not put it in config.js or frontend JavaScript.
4. Set Edge Function secrets and deploy:
   `supabase secrets set RESEND_API_KEY=<resend-key> CANOPY_EMAIL_FROM="Canopy <notifications@your-domain.example>" CANOPY_WEBHOOK_SECRET=<secret>`
   `supabase functions deploy account-workflow --no-verify-jwt`
   The function validates browser requests using the user's Supabase JWT and
   admin profile role. The database webhook uses the separate random secret.
5. In Supabase Database > Webhooks, create an INSERT webhook for
   public.canopy_email_notifications. Set URL to
   `https://<project-ref>.supabase.co/functions/v1/account-workflow`, method
   POST, Content-Type `application/json`, and header
   `x-canopy-webhook-secret: <the-same-secret>`.
6. Configure Supabase Auth email confirmation separately (including custom SMTP
   if production delivery is required). Email-address confirmation never grants
   Canopy verification or Admin permissions.

The outbox records recipient, type, creation time, attempts, provider message ID,
and pending/sending/sent/failed delivery state. Duplicate triggers and approval
clicks are constrained by unique keys and a row-locked approval function.
Delivery failures do not reverse account verification. Failed messages are
recorded and an Admin can retry them from the deployed Edge Function; Resend's
idempotency key prevents a duplicate send for the same notification.

Registration and verification emails cannot be confirmed as delivered until the
migration, Database Webhook, Resend domain, API key, and sender address are
configured in the target Supabase project. A newly deployed trigger does not
send welcome messages for existing users.

FIVE-STREAM REVENUE WORKFLOW
The official prices are: 1.5% SME transaction fee, RM250/month Premium,
RM500/report Carbon & ESG, 1.5% separate project-developer commission, and
RM500/month Partner Portal. The UI previews purchase fee as an addition and
sale fee as a deduction. Existing carbon request RPCs continue to approve and
settle trades. On future completed buy/sell requests, the additive revenue
migration records charges and developer invoices; an Admin must assign a
developer to a project before developer commission is invoiced.

The included checkout is explicitly sandbox/demo. It stores sandbox_paid, does
not collect money, and is excluded from actual revenue totals. A live payment
provider is not configured. Do not change sandbox orders to paid; connect a
server-side provider webhook before accepting real recurring payments. Never
add payment secrets or card data to the browser. Report PDFs are assembled from
Supabase records only and explicitly make no unsupported emissions/impact
claims; download authorization is checked by canopy_report_data.

The revenue migration is additive and starts with a preflight check for the
profiles, projects, holdings and carbon_requests columns and UUID types used by
this app. It also requires the profile-security triggers from migration 001 and
RLS already enabled on projects. It creates new billing tables and adds
release/read policies plus exception-safe triggers on existing projects and
carbon_requests; it does not rewrite, delete or backfill existing rows. Before
running it, export the current schema and review current RLS on those legacy
tables. Apply migrations in filename order (after linking the CLI to the correct
project):
   supabase/migrations/202610170001_canopy_account_notifications.sql
   supabase/migrations/202610170002_five_stream_revenue.sql
   supabase/migrations/202610170003_demo_projects_and_partner_registration.sql
You may run the SQL files in Supabase SQL Editor in that order instead. Do not
re-run migration 001 if it was already applied manually; check Supabase
migration history first. Stop if the preflight check fails; compare the live
schema with app.js and adapt the mapping before retrying. The transaction
trigger is exception-safe and writes unmapped completion details to
canopy_reconciliation_alerts rather than blocking the existing settlement RPC.

Project developers are linked to projects through the new Admin billing
section; the legacy projects table is not modified. Newly published projects
receive a 48-hour Premium early-access window. Existing projects remain open
under their current listing rules. SME referral codes are optional at signup;
Partner client holdings and transactions are returned only after the SME grants
consent. Referral rewards start disabled and require an Admin-configured rate.

When deploying, ensure Vercel serves revenue.css, revenue-platform.js,
canopy-projects.css and canopy-projects.js and wait for the Canopy PWA shell v8
update. PDF export requires the jsPDF CDN while online; the rest of the
workspace shell is cached for offline launch.

REAL MALAYSIAN PROJECT REFERENCES (DEMO ONLY)
Migration 202610170003_demo_projects_and_partner_registration.sql adds a
separate canopy_demo_projects catalog and seeds the four public Verra project
references (VCS 2609, 672, 4279 and 5542) with ON CONFLICT DO NOTHING. Project
facts include public source URLs. The catalog starts with no simulated price,
zero simulated inventory and demo trading disabled. It makes no claim that
Canopy owns credits, has acquired inventory, has a developer relationship, or
is authorized by BCX. The old projects, holdings and carbon_requests rows are
not rewritten. New demo purchases use separate demo request and entitlement
ledger tables and never enter collected-revenue calculations.

Marketplace photos are generic representative Unsplash images, with visible
captions stating they are not photographs of the named projects. They are not
used as evidence of project characteristics. All four cards are marked
“Demonstration Listings — No Real Carbon Credits Sold”. Admin changes to
catalog facts and simulated price/inventory/trading settings use audited RPCs.

PARTNER SIGNUP AND REVIEW (MIGRATION 003)
The Partner signup form sends only an allowlisted account type and application
fields. A database trigger assigns either SME or Partner and pending status;
Admin is not a public option. Admin review/rejection is authenticated by the
existing account-workflow Edge Function and recorded in a new audit table.
Rejected accounts remain non-verified; their rejection state is stored in the
application record. Apply migrations 001, 002 and 003 in order only after
checking migration history and reviewing the live schema/policies. Migration
003 stops at preflight if required enums, Admin helper, subscriptions or Partner
consent tables are missing. It adds restrictive consent policies because the
existing policies shown in the schema export allow partners broad holdings and
request reads; review those policies and test the new gates before production.

The checked-in Supabase key previously returned HTTP 401, so none of these SQL
migrations has been applied or tested against the live database. Run them in
SQL Editor only after reviewing the complete migration and confirming the
preflight requirements. No BCX purchase, external registry retirement, or
real-credit transfer is implemented; all newly added marketplace trading is
simulated and must be enabled/configured by an Admin.

PASSWORD RECOVERY AND SUPABASE AUTH
The recovery email redirects to:
   https://canopy-carbon-platform.vercel.app/reset-password.html

In Supabase Dashboard > Authentication > URL Configuration, set Site URL to:
   https://canopy-carbon-platform.vercel.app

Add this exact Redirect URL to the allowed redirect URLs:
   https://canopy-carbon-platform.vercel.app/reset-password.html

Ensure the password recovery email template links through Supabase's
{{ .ConfirmationURL }} so the requested redirect URL is honored.

For local testing on port 8765, also allow:
   http://localhost:8765/reset-password.html

The Supabase REST endpoint in config.js resolved during inspection but returned
401 for the checked-in publishable key, so database schema and live workflows
could not be authenticated here. Replace both supabaseUrl and supabaseAnonKey
with the Project URL and publishable key from the same active project in
Supabase Dashboard > Project Settings > API, then update the deployed config.js
in Vercel. Password reset emails also require email delivery to be enabled;
configure custom SMTP for production delivery if the default Supabase mail
service is insufficient.
