/**
 * Fetches EOD closing values for Indian market indices from Yahoo Finance.
 * Run by GitHub Actions daily at 4:00 PM IST (after NSE closes at 3:30 PM IST).
 * Writes results to data/market.json — committed to repo so Vercel redeploys.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const INDICES = [
  { key: 'nifty50',     symbol: '^NSEI',            label: 'Nifty 50'        },
  { key: 'sensex',      symbol: '^BSESN',            label: 'Sensex'          },
  { key: 'banknifty',   symbol: '^NSEBANK',          label: 'Bank Nifty'      },
  { key: 'niftyit',     symbol: '^CNXIT',            label: 'Nifty IT'        },
  { key: 'niftymidcap', symbol: 'NIFTYMIDCAP100.NS', label: 'Nifty Midcap 100'},
  { key: 'niftyauto',   symbol: '^CNXAUTO',          label: 'Nifty Auto'      },
  { key: 'niftypharma', symbol: '^CNXPHARMA',        label: 'Nifty Pharma'    },
  { key: 'indiavix',    symbol: '^INDIAVIX',         label: 'India VIX'       },
  { key: 'niftyfmcg',   symbol: '^CNXFMCG',          label: 'Nifty FMCG'      },
  { key: 'niftyenergy', symbol: '^CNXENERGY',        label: 'Nifty Energy'    },
];

const OUT_PATH = path.join(__dirname, '..', 'data', 'market.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchQuote(symbol) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${symbol}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const result = json.chart?.result?.[0];
          if (!result) throw new Error('Empty result');

          const meta = result.meta;
          const price = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

          resolve({
            value:     +price.toFixed(2),
            change:    +(price - prevClose).toFixed(2),
            changePct: +((price - prevClose) / prevClose * 100).toFixed(2),
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${symbol}`)); });
  });
}

async function main() {
  // Load existing data so failed fetches fall back to last known value
  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')).indices || {}; } catch {}
  }

  const out = { updated: new Date().toISOString().split('T')[0], indices: {} };
  let successCount = 0;

  for (const idx of INDICES) {
    await sleep(900); // avoid Yahoo Finance rate-limiting
    try {
      const data = await fetchQuote(idx.symbol);
      out.indices[idx.key] = { label: idx.label, ...data };
      const arrow = data.changePct >= 0 ? '▲' : '▼';
      console.log(`✓  ${idx.label.padEnd(20)} ${data.value}  ${arrow} ${data.changePct}%`);
      successCount++;
    } catch (e) {
      console.error(`✗  ${idx.label.padEnd(20)} ${e.message}`);
      if (existing[idx.key]) {
        out.indices[idx.key] = { ...existing[idx.key], label: idx.label };
        console.log(`   ↳ kept last known: ${existing[idx.key].value}`);
      }
    }
  }

  if (successCount === 0) {
    console.error('\nAll fetches failed — not writing file to avoid overwriting good data.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_PATH}  (${successCount}/${INDICES.length} live, rest from cache)`);
}

main().catch(e => { console.error(e); process.exit(1); });
