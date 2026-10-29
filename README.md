# Canopy Carbon Platform

**University group-project prototype | Malaysian SME carbon-credit marketplace**

Canopy is a web-based prototype designed to help Malaysian small and medium-sized enterprises (SMEs) explore carbon projects and understand how fractional carbon-credit purchasing, portfolio tracking, trading and retirement could work. **All credits, balances, prices, transactions, subscriptions, approvals and retirement records in the prototype are simulated. No real carbon credits or payments are processed.**

## Live demo and source code

- Website: https://canopy-carbon-platform.vercel.app/
- Repository: https://github.com/minnlinn/canopy-carbon-platform

## Technology

- **Frontend:** HTML, CSS and JavaScript, developed in Visual Studio Code
- **Backend:** Supabase Authentication, PostgreSQL, Row Level Security (RLS), SQL functions and database migrations
- **Hosting and version control:** Vercel and GitHub
- **Mobile support:** Progressive Web App (PWA), including an installation QR page
- **Document generation:** locally bundled PDF and QR-code libraries

## Prototype features

### SME
- Browse demonstration carbon-project listings with indicative pricing and risk information.
- Request simulated fractional purchases starting from **0.01 tCO2e** using a demo wallet.
- View simulated holdings, transactions and portfolio analytics, including optional Premium features.
- Demonstrate SME-to-SME credit listings and trading using simulated transactions.
- Generate Carbon and ESG reports and request simulated credit retirement.
- Download a **Canopy Retirement Statement** with a QR code linking to a public verification page. This is **not** an official registry retirement certificate.
- Manage business profile details and permissions for Partner access.

### Partner
- Share referral links and monitor referred SMEs.
- Access permitted SME profile, contact and carbon-related information **only where the relevant SME consent and platform access conditions allow it**.
- View Partner dashboard features and simulated subscription information.

### Administrator
- Review account applications and business registration details for prototype KYB-style checks.
- Manage demonstration project availability and simulated inventory.
- Review simulated purchase, trade and retirement requests.
- Monitor demonstration transactions, revenue dashboards and platform activity.

## Database and access controls

The prototype records simulated holdings and transactions in Supabase PostgreSQL. Row Level Security (RLS) policies are configured on relevant tables, including profiles and holdings, to support controlled access. SQL functions and database validations support transaction processing, balance checks and credit reservations. These controls are part of a prototype and should not be interpreted as a production security certification.

Database migration files are included in [`supabase/migrations/`](supabase/migrations/). The repository contains **22 sequential SQL migration files**, covering account workflows, demo wallet and marketplace functionality, trading, referral permissions, reporting and retirement. The Supabase Edge Function source is in [`supabase/functions/account-workflow/`](supabase/functions/account-workflow/).

## How to run the frontend

1. Download or clone this repository.
2. Open the project folder in Visual Studio Code.
3. Serve the folder using a local web server (recommended for service-worker/PWA testing). For example, if Python is installed, run `python -m http.server 8765` from the project folder.
4. Open `http://localhost:8765/` in a browser.

The frontend uses the Supabase project URL and **publishable** client key configured in `config.js`. Features requiring authentication and database access also require an appropriately configured Supabase project, database schema, RLS policies and, where applicable, Edge Function settings. **Opening the HTML files alone does not recreate the hosted backend or its data.**

### Supabase setup notes

- Review `supabase/config.toml`, the migrations and the application code before configuring a separate Supabase project.
- Migrations are provided as source documentation and should be applied **in filename order**, only to a suitable test project after reviewing dependencies and the existing schema.
- Some account-notification functionality depends on separately configured email/webhook services and secrets. Such settings are **not included** in this repository.
- Never place Supabase service-role keys, database passwords, email-provider API keys or webhook secrets in browser files or in a public submission.

## Important limitations and proposed future development

- **No live BCX or carbon registry integration:** project references and inventory are for demonstration; the prototype does not establish actual registry ownership or credit custody.
- **No live DLT:** simulated fractional ownership and transaction records are currently stored in PostgreSQL. An **in-house distributed ledger technology (DLT)** system is proposed for future tracking of credit ownership and transfers.
- **No real payments:** wallet balances, purchases, subscriptions and revenue records are simulated. A production payment gateway has not been integrated.
- **Trading restrictions:** actual SME-to-SME trading is a proposed future activity, subject to clarification of the platform's regulatory position and any required approvals from the Securities Commission Malaysia.
- **Retirement documentation:** current PDF statements and QR verification are demonstration records, not official registry certificates. Future BCX/registry integration is proposed to support registry-backed retirement documentation for whole-tonne retirements and appropriately evidenced pooled fractional retirements.

## Submission and demonstration

The repository provides the frontend files, PWA assets, Supabase migrations and supporting Edge Function source. It does **not** include the live Supabase database contents or any production secrets. For evaluation, use the hosted demo and the dedicated SME, Partner and Administrator test accounts supplied separately by the project group.

## Academic project notice

Canopy was developed for educational demonstration. Nothing in the prototype represents a real offer to buy or sell carbon credits, an investment product, an official environmental claim or evidence of actual carbon-credit retirement.
