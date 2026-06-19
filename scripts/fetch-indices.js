/**
 * Fetches EOD index data from NSE India's official archive CSV.
 * NSE publishes ind_close_all_DDMMYYYY.csv after every market session.
 * No API key, no auth, no rate limiting — just a plain HTTPS download.
 * Sensex (BSE) is fetched separately via Yahoo Finance as a bonus; if that
 * fails, the last known value is kept.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT_PATH = path.join(__dirname, '..', 'data', 'market.json');

// NSE CSV "Index Name" column → our key + label
const NSE_MAP = {
  'Nifty 50':         { key: 'nifty50',     label: 'Nifty 50'         },
  'Nifty Bank':       { key: 'banknifty',   label: 'Bank Nifty'       },
  'Nifty IT':         { key: 'niftyit',     label: 'Nifty IT'         },
  'Nifty Pharma':     { key: 'niftypharma', label: 'Nifty Pharma'     },
  'Nifty Auto':       { key: 'niftyauto',   label: 'Nifty Auto'       },
  'Nifty FMCG':       { key: 'niftyfmcg',   label: 'Nifty FMCG'       },
  'NIFTY Midcap 100': { key: 'niftymidcap', label: 'Nifty Midcap 100' },
  'India VIX':        { key: 'indiavix',    label: 'India VIX'        },
  'Nifty Energy':     { key: 'niftyenergy', label: 'Nifty Energy'     },
};

// ── helpers ────────────────────────────────────────────────────────────────

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent'    : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept'        : '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
      timeout: 20000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function toDateStr(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;             // DDMMYYYY — NSE archive format
}

function prevBusinessDay(d) {
  const prev = new Date(d);
  do { prev.setDate(prev.getDate() - 1); } while ([0, 6].includes(prev.getDay()));
  return prev;
}

// ── NSE archive CSV ────────────────────────────────────────────────────────

async function fetchNseCSV() {
  // Try today, then previous business day (in case today's file isn't out yet)
  const candidates = [new Date(), prevBusinessDay(new Date())];

  for (const d of candidates) {
    const dateStr = toDateStr(d);
    const url = `https://archives.nseindia.com/content/indices/ind_close_all_${dateStr}.csv`;
    console.log(`Trying NSE archive: ${url}`);
    try {
      const r = await get(url);
      if (r.status === 200 && r.body.includes('Index Name')) {
        console.log(`  ✓ Got NSE CSV for ${dateStr}`);
        return r.body;
      }
      console.log(`  ✗ HTTP ${r.status}`);
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
    }
  }
  return null;
}

function parseNseCSV(csv) {
  const lines  = csv.trim().split('\n');
  const results = {};

  // Columns: Index Name, Index Date, Open, High, Low, Close, Points Change, Change(%), ...
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 8) continue;

    const name   = cols[0].trim();
    const entry  = NSE_MAP[name];
    if (!entry) continue;

    const close     = parseFloat(cols[5]);
    const change    = parseFloat(cols[6]);
    const changePct = parseFloat(cols[7]);
    if (isNaN(close)) continue;

    results[entry.key] = {
      label     : entry.label,
      value     : +close.toFixed(2),
      change    : +change.toFixed(2),
      changePct : +changePct.toFixed(2),
    };
  }
  return results;
}

// ── Sensex via Yahoo Finance (bonus — keep last known if blocked) ──────────

async function fetchSensex(fallback) {
  try {
    const r = await get(
      'https://query2.finance.yahoo.com/v8/finance/chart/%5EBSESN?interval=1d&range=1d',
      { Referer: 'https://finance.yahoo.com/' }
    );
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const meta  = JSON.parse(r.body).chart?.result?.[0]?.meta;
    if (!meta)  throw new Error('Empty response');
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const chg   = +(price - prev).toFixed(2);
    const pct   = +((chg / prev) * 100).toFixed(2);
    console.log(`✓  Sensex               ${price}  ${pct >= 0 ? '▲' : '▼'} ${pct}%`);
    return { label: 'Sensex', value: +price.toFixed(2), change: chg, changePct: pct };
  } catch (e) {
    console.log(`  Sensex Yahoo fallback (${e.message})`);
    return fallback || null;
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load existing data so we always have fallback values
  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')).indices || {}; } catch {}
  }

  const out = {
    updated : new Date().toISOString().split('T')[0],
    indices : { ...existing },                          // start with fallback
  };

  // ── Step 1: NSE CSV (9 indices)
  let nseCount = 0;
  const csv = await fetchNseCSV();
  if (csv) {
    const parsed = parseNseCSV(csv);
    for (const [key, data] of Object.entries(parsed)) {
      out.indices[key] = data;
      nseCount++;
      const arrow = data.changePct >= 0 ? '▲' : '▼';
      console.log(`✓  ${data.label.padEnd(20)} ${data.value}  ${arrow} ${data.changePct}%`);
    }
    console.log(`\nNSE: ${nseCount}/${Object.keys(NSE_MAP).length} indices parsed.`);
  } else {
    console.log('\nNSE CSV unavailable — using cached values for NSE indices.');
  }

  // ── Step 2: Sensex (BSE — not in NSE CSV)
  out.indices.sensex = await fetchSensex(existing.sensex) || out.indices.sensex;

  // ── Write
  if (Object.keys(out.indices).length === 0) {
    console.error('No data at all. Aborting.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
