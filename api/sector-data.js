// Vercel serverless — live sector stock data via Yahoo Finance crumb-authenticated v7 API.
// 52W change is calculated from v8 chart (1-year monthly data) in parallel.
// CDN-cached 5 minutes.

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com/',
};

const SECTORS = {
  pharma:  ['SUNPHARMA.NS','DRREDDY.NS','TORNTPHARM.NS','DIVISLAB.NS','CIPLA.NS','LUPIN.NS','ABBOTINDIA.NS','AUROPHARMA.NS','ALKEM.NS','IPCALAB.NS'],
  banking: ['HDFCBANK.NS','ICICIBANK.NS','SBIN.NS','KOTAKBANK.NS','AXISBANK.NS','BANKBARODA.NS','PNB.NS','CANBK.NS','INDUSINDBK.NS','FEDERALBNK.NS'],
  it:      ['TCS.NS','INFY.NS','HCLTECH.NS','WIPRO.NS','LTIM.NS','TECHM.NS','PERSISTENT.NS','MPHASIS.NS','COFORGE.NS','HEXAWARE.NS'],
  fmcg:    ['HINDUNILVR.NS','ITC.NS','NESTLEIND.NS','TATACONSUM.NS','GODREJCP.NS','BRITANNIA.NS','DABUR.NS','MARICO.NS','COLPAL.NS','EMAMILTD.NS'],
  auto:    ['MARUTI.NS','BAJAJ-AUTO.NS','M%26M.NS','TATAMOTORS.NS','EICHERMOT.NS','HYUNDAI.NS','TVSMOTOR.NS','HEROMOTOCO.NS','BOSCHLTD.NS','ASHOKLEY.NS'],
  energy:  ['RELIANCE.NS','NTPC.NS','POWERGRID.NS','ONGC.NS','COALINDIA.NS','ADANIGREEN.NS','ADANIPOWER.NS','IOC.NS','TATAPOWER.NS','BPCL.NS'],
};

// Crumb cache — reused across warm Vercel invocations
let _crumb = null;
let _crumbTs = 0;

async function getCrumb() {
  if (_crumb && Date.now() - _crumbTs < 25 * 60 * 1000) return _crumb;
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: YF_HEADERS,
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`crumb failed: ${r.status}`);
  _crumb = await r.text();
  _crumbTs = Date.now();
  return _crumb;
}

// Fetch 1-year monthly chart and calculate 52W price change as a decimal.
async function fetch52W(sym) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1mo&range=1y`;
    const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!closes || closes.length < 2) return null;
    const first = closes.find(c => c != null);
    const last  = [...closes].reverse().find(c => c != null);
    if (!first || !last) return null;
    return (last - first) / first; // decimal: 0.198 = +19.8%
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const s = (req.query.s || '').toLowerCase();
  if (!SECTORS[s]) return res.status(400).json({ error: 'Unknown sector' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const syms = SECTORS[s];
    const crumb = await getCrumb();

    // Parallel: single v7 call (all 10 stocks) + 10 v8 chart calls for 52W
    const [v7Res, ...charts] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,marketCap,trailingPE&crumb=${encodeURIComponent(crumb)}`,
        { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) }
      ),
      ...syms.map(sym => fetch52W(sym)),
    ]);

    if (!v7Res.ok) throw new Error(`upstream ${v7Res.status}`);
    const v7Data = await v7Res.json();

    const bySymbol = {};
    for (const q of v7Data?.quoteResponse?.result ?? []) {
      bySymbol[q.symbol] = {
        marketCap: q.marketCap                  ?? null,
        pe:        q.trailingPE                 ?? null,
        pctChange: q.regularMarketChangePercent ?? null, // already in %
        ytd:       null, // not available from v7 quote endpoint
      };
    }

    // Return in table order so sector pages match stocks[i] → row[i]
    const stocks = syms.map((sym, i) => {
      const q = bySymbol[sym] || null;
      if (!q) return null;
      return { ...q, change52w: charts[i] ?? null };
    });

    return res.json({ stocks, updatedAt: Date.now() });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
