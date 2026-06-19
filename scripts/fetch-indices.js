/**
 * Fetches EOD closing values for Indian market indices from Yahoo Finance.
 * Uses the crumb-authenticated v7 quote API (all symbols in one request).
 * Run by GitHub Actions daily at 4:00 PM IST after NSE closes.
 * Writes to data/market.json — committed so Vercel redeploys.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SYMBOLS = [
  { key: 'nifty50',     symbol: '^NSEI',            label: 'Nifty 50'         },
  { key: 'sensex',      symbol: '^BSESN',            label: 'Sensex'           },
  { key: 'banknifty',   symbol: '^NSEBANK',          label: 'Bank Nifty'       },
  { key: 'niftyit',     symbol: '^CNXIT',            label: 'Nifty IT'         },
  { key: 'niftymidcap', symbol: 'NIFTYMIDCAP100.NS', label: 'Nifty Midcap 100' },
  { key: 'niftyauto',   symbol: '^CNXAUTO',          label: 'Nifty Auto'       },
  { key: 'niftypharma', symbol: '^CNXPHARMA',        label: 'Nifty Pharma'     },
  { key: 'indiavix',    symbol: '^INDIAVIX',         label: 'India VIX'        },
  { key: 'niftyfmcg',   symbol: '^CNXFMCG',          label: 'Nifty FMCG'       },
  { key: 'niftyenergy', symbol: '^CNXENERGY',        label: 'Nifty Energy'     },
];

const OUT_PATH = path.join(__dirname, '..', 'data', 'market.json');

const BASE_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language' : 'en-US,en;q=0.9',
  'Accept-Encoding' : 'identity',
};

function get(url, extra = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { ...BASE_HEADERS, ...extra }, timeout: 20000 }, (res) => {
      const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, cookies }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function getSession() {
  // Step 1 — hit the Yahoo Finance homepage to get a valid session cookie
  const r1 = await get('https://finance.yahoo.com/', {
    'Accept' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });
  const cookies = r1.cookies;
  if (!cookies) throw new Error('No cookies from finance.yahoo.com');
  console.log('Session cookie obtained.');

  // Step 2 — exchange cookie for a crumb
  const r2 = await get('https://query2.finance.yahoo.com/v1/finance/getCrumb', {
    'Accept'  : 'text/plain, */*',
    'Cookie'  : cookies,
    'Referer' : 'https://finance.yahoo.com/',
  });
  if (r2.status !== 200 || !r2.body.trim()) {
    throw new Error(`getCrumb returned HTTP ${r2.status}: "${r2.body.slice(0, 120)}"`);
  }
  const crumb = r2.body.trim();
  console.log(`Crumb: ${crumb}`);
  return { cookies, crumb };
}

async function fetchQuotes(session) {
  // Fetch all symbols in a single v7 batch call
  const symbolList = SYMBOLS.map(s => encodeURIComponent(s.symbol)).join('%2C');
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbolList}&crumb=${encodeURIComponent(session.crumb)}`;

  const r = await get(url, {
    'Accept'  : 'application/json',
    'Cookie'  : session.cookies,
    'Referer' : 'https://finance.yahoo.com/',
  });
  if (r.status !== 200) throw new Error(`Quote API returned HTTP ${r.status}`);

  const json = JSON.parse(r.body);
  return json.quoteResponse?.result || [];
}

async function main() {
  // Load existing file as fallback so stale data is better than empty
  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')).indices || {}; } catch {}
  }

  const today = new Date().toISOString().split('T')[0];
  const out = { updated: today, indices: {} };

  // Pre-fill with existing (fallback) values
  for (const s of SYMBOLS) {
    if (existing[s.key]) out.indices[s.key] = { ...existing[s.key], label: s.label };
  }

  let successCount = 0;

  try {
    const session = await getSession();
    const quotes  = await fetchQuotes(session);

    for (const q of quotes) {
      const sym = SYMBOLS.find(s => s.symbol.toUpperCase() === q.symbol.toUpperCase());
      if (!sym || q.regularMarketPrice == null) continue;

      out.indices[sym.key] = {
        label     : sym.label,
        value     : +q.regularMarketPrice.toFixed(2),
        change    : +q.regularMarketChange.toFixed(2),
        changePct : +q.regularMarketChangePercent.toFixed(2),
      };
      successCount++;
      const arrow = q.regularMarketChangePercent >= 0 ? '▲' : '▼';
      console.log(`✓  ${sym.label.padEnd(20)} ${q.regularMarketPrice}  ${arrow} ${q.regularMarketChangePercent.toFixed(2)}%`);
    }

    if (successCount === 0) console.warn('\nWarning: quote API returned 0 matching symbols.');

  } catch (e) {
    console.error(`\nFetch error: ${e.message}`);
    console.log('Falling back to last-known values from existing data/market.json.');
  }

  // Always write — if fetch failed we still commit fallback so Vercel doesn't break
  if (Object.keys(out.indices).length === 0) {
    console.error('Fatal: no existing data and fetch failed. Cannot write market.json.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  const src = successCount > 0
    ? `${successCount}/${SYMBOLS.length} live values`
    : 'all fallback — check logs above';
  console.log(`\nWrote ${OUT_PATH}  (${src})`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
