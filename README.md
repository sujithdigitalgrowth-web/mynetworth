# 💰 NetWorth — Personal Finance Platform

A free personal finance platform for Indians — dashboard, SEO-optimized calculators, and blog content to help track net worth, manage assets, set goals, and plan your financial future.

**Live**: [mynetworth.vercel.app](https://mynetworth.vercel.app)

## Pages & Features

### Dashboard (/app)
- **Net Worth Tracking** — Assets, liabilities, and real-time net worth calculation
- **Family Mode** — Track finances for self, spouse, and joint ownership with contribution splits
- **Cash Flow** — Income, expenses, EMIs, and surplus tracking with visual breakdowns
- **Goals** — Set financial goals with progress bars and investment recommendations
- **Insurance** — Track term life, health, and other policies
- **Charts & Visuals** — Asset allocation, ownership split, category breakdowns
- **Insights** — Auto-generated financial insights based on your data
- **Reality Check** — Honest assessment of your financial health with severity ratings
- **Next Actions** — Prioritized action items with impact projections, urgency tags, and consequence warnings
- **Cloud Sync** — Silent auto-save to Firebase Firestore, synced across devices via email login
- **Dark & Light Themes** — Toggle between dark and light mode

### Calculator Tools (SEO pages)
- **Net Worth Calculator** (/net-worth-calculator) — Full SEO page: step-by-step guide, real Indian example, age-wise benchmarks, 7-question FAQ with FAQPage schema, dynamic result insights, internal linking
- **Emergency Fund Calculator** (/emergency-fund-calculator) — SEO-optimised with related reading section and internal links
- **House Down Payment Calculator** (/house-down-payment-calculator) — SEO-optimised with related reading section and internal links

### Blog (/blog)
- How to Calculate Your Net Worth in India
- Emergency Fund: How Much Do You Really Need?
- 5 Simple Steps to Financial Freedom
- Why Net Worth Matters More Than Salary

### Other Pages
- **Home** — Audience grid, trust grid, FAQPage schema (7 Q&As), AdSense disclaimer
- **About** — Mission callout, FAQPage schema (5 Q&As including AdSense transparency)
- **Contact** — FAQ section (5 Q&As)
- **Privacy Policy** — Full advertising/AdSense disclosure section (required for Google AdSense)
- **Terms of Service** — Section 14: Advertising disclosure

## SEO & AdSense Optimizations (April 2026)

All public pages have been improved for search ranking and Google AdSense approval:

- **Meta tags** — Unique, keyword-rich titles and descriptions on every page
- **Structured data** — `WebApplication`, `FAQPage`, `BreadcrumbList`, and `WebSite` JSON-LD schemas
- **Internal linking** — Cross-links between all calculators and blog posts
- **Content depth** — Each calculator page has 1,500+ words of original, useful content
- **AdSense readiness** — Privacy policy advertising disclosure, editorial disclaimers on all pages
- **Breadcrumbs** — Consistent breadcrumb nav on all calculator and blog pages
- **Canonical URLs** — Set on all public pages

## Tech Stack

- **HTML/CSS/JS** — No build tools, no frameworks
- **Chart.js 4.4.4** — Dashboard charts and visualizations
- **Firebase Firestore** — Cloud data persistence
- **Vercel** — Hosting with clean URLs
- **Shared CSS** — `styles.css` for all SEO pages; dashboard is self-contained

## Getting Started

1. Clone the repo
2. Open `index.html` in any browser, or run `npx serve . -p 3000`
3. Dashboard is at `/app.html`, home page is at `/index.html`

## Deployment

Deployed on **Vercel** via GitHub auto-deploy from the `main` branch. Clean URLs enabled via `vercel.json`.

## Project Structure

```
├── index.html                        # Home / landing page
├── app.html                          # Dashboard (main product)
├── styles.css                        # Shared styles for SEO pages
├── net-worth-calculator.html         # Net worth calculator
├── emergency-fund-calculator.html    # Emergency fund calculator
├── house-down-payment-calculator.html# Down payment calculator
├── about.html                        # About page
├── contact.html                      # Contact page
├── privacy-policy.html               # Privacy policy
├── terms.html                        # Terms of service
├── blog/
│   ├── index.html                    # Blog listing
│   ├── how-to-calculate-net-worth.html
│   ├── emergency-fund-guide.html
│   ├── financial-freedom-steps.html
│   └── net-worth-vs-salary.html
├── vercel.json                       # Vercel config (clean URLs)
└── README.md
```

## Data Storage

- **Local**: `localStorage` for instant access
- **Cloud**: Firebase Firestore (project: `mynetworth-a4a31`) keyed by email address
- Login is name + email (no password/OTP) — email serves as the cloud sync identifier

## Currency

All amounts are in **Indian Rupees (₹)** with smart formatting:
- ₹1,00,000+ → ₹1.00 L (Lakhs)
- ₹1,00,00,000+ → ₹1.00 Cr (Crores)
