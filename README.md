# 💰 NetWorth — Personal Finance Dashboard

A single-file personal finance dashboard to track your net worth, cash flow, goals, and investments — built for Indian households.

## Features

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

## Tech Stack

- **Single HTML file** — No build tools, no frameworks, no dependencies to install
- **Chart.js 4.4.4** — Charts and visualizations
- **Firebase Firestore** — Cloud data persistence
- **Vanilla JS/CSS** — Zero framework overhead

## Getting Started

1. Open `index.html` in any browser
2. Log in with your name and email
3. Start adding your income, expenses, assets, and liabilities

## Deployment

Deployed on **Vercel** via GitHub auto-deploy from the `main` branch.

**Live URL**: Deploys automatically on every push to `main`.

## Project Structure

```
├── index.html          # Complete single-file application
├── index_backup.html   # Backup copy
└── README.md           # This file
```

## Data Storage

- **Local**: `localStorage` for instant access
- **Cloud**: Firebase Firestore (project: `mynetworth-a4a31`) keyed by email address
- Login is name + email (no OTP) — email serves as the sync identifier

## Currency

All amounts are in **Indian Rupees (₹)** with smart formatting:
- ₹1,00,000+ → ₹1.00 L (Lakhs)
- ₹1,00,00,000+ → ₹1.00 Cr (Crores)
