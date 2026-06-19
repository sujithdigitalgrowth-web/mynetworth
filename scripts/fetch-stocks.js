/**
 * Fetches EOD closing prices for all stocks shown on WorthScale sector pages.
 * Source: NSE sec_bhavdata_full_DDMMYYYY.csv — public, no auth, no ZIP.
 * Writes data/stocks.json, committed by GitHub Actions daily.
 *
 * Columns: SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE,
 *          LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, ...
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT_PATH = path.join(__dirname, '..', 'data', 'stocks.json');

// All NSE symbols shown across the 6 sector pages
const WATCH = new Set([
  // FMCG
  'HINDUNILVR','ITC','NESTLEIND','TATACONSUM','GODREJCP',
  'BRITANNIA','DABUR','MARICO','COLPAL','EMAMILTD',
  // Banking
  'HDFCBANK','ICICIBANK','SBIN','KOTAKBANK','AXISBANK',
  'BANKBARODA','PNB','CANBK','INDUSINDBK','FEDERALBNK',
  // IT
  'TCS','INFY','HCLTECH','WIPRO','TECHM',
  'LTIM','PERSISTENT','COFORGE','MPHASIS','HEXAWARE',
  // Pharma
  'SUNPHARMA','DRREDDY','CIPLA','DIVISLAB','LUPIN',
  'AUROPHARMA','TORNTPHARM','ALKEM','IPCALAB','ABBOTINDIA',
  // Auto
  'MARUTI','TATAMOTORS','HYUNDAI','EICHERMOT','HEROMOTOCO',
  'TVSMOTOR','BOSCHLTD','ASHOKLEY','BAJAJ-AUTO','M&M',
  // Energy
  'RELIANCE','ONGC','BPCL','IOC','NTPC',
  'POWERGRID','ADANIGREEN','ADANIPOWER','TATAPOWER','COALINDIA',
]);

function toDateStr(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function prevBusinessDay(d) {
  const p = new Date(d);
  do { p.setDate(p.getDate() - 1); } while ([0, 6].includes(p.getDay()));
  return p;
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent'    : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept'        : '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseCsv(csv) {
  const lines   = csv.trim().split('\n');
  const results = {};

  for (let i = 1; i < lines.length; i++) {
    // Fields have trailing spaces — trim each
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < 9) continue;

    const symbol    = cols[0];
    const series    = cols[1];
    if (series !== 'EQ') continue;
    if (!WATCH.has(symbol)) continue;

    const prevClose = parseFloat(cols[3]);
    const ltp       = parseFloat(cols[8]);   // CLOSE_PRICE (official close)
    if (isNaN(ltp) || isNaN(prevClose) || prevClose === 0) continue;

    const change    = +(ltp - prevClose).toFixed(2);
    const changePct = +((change / prevClose) * 100).toFixed(2);

    results[symbol] = { ltp: +ltp.toFixed(2), change, changePct };
  }
  return results;
}

async function main() {
  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')).stocks || {}; } catch {}
  }

  const out = {
    updated : new Date().toISOString().split('T')[0],
    stocks  : { ...existing },
  };

  const candidates = [new Date(), prevBusinessDay(new Date())];
  let fresh = {};

  for (const d of candidates) {
    const dateStr = toDateStr(d);
    const url = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dateStr}.csv`;
    console.log(`Trying: ${url}`);

    try {
      const r = await get(url);
      if (r.status !== 200 || !r.body.includes('SYMBOL')) {
        console.log(`  ✗ HTTP ${r.status}`);
        continue;
      }
      fresh = parseCsv(r.body);
      console.log(`  ✓ Parsed ${Object.keys(fresh).length} matching symbols`);

      for (const [sym, data] of Object.entries(fresh)) {
        out.stocks[sym] = data;
        const arrow = data.changePct >= 0 ? '▲' : '▼';
        console.log(`  ${sym.padEnd(16)} ₹${data.ltp}  ${arrow} ${data.changePct}%`);
      }
      break;
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
    }
  }

  if (Object.keys(fresh).length === 0) {
    console.log('Using cached fallback values.');
  }

  if (Object.keys(out.stocks).length === 0) {
    console.error('No data at all. Aborting.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
