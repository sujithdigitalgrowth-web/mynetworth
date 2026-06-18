// Vercel serverless function — live market cap, P/E, and 52W change for sector stock tables.
// CDN-cached for 5 minutes.

const SECTORS = {
  pharma:  ['SUNPHARMA.NS','DRREDDY.NS','TORNTPHARM.NS','DIVISLAB.NS','CIPLA.NS','LUPIN.NS','ABBOTINDIA.NS','AUROPHARMA.NS','ALKEM.NS','IPCALAB.NS'],
  banking: ['HDFCBANK.NS','ICICIBANK.NS','SBIN.NS','KOTAKBANK.NS','AXISBANK.NS','BANKBARODA.NS','PNB.NS','CANBK.NS','INDUSINDBK.NS','FEDERALBNK.NS'],
  it:      ['TCS.NS','INFY.NS','HCLTECH.NS','WIPRO.NS','LTIM.NS','TECHM.NS','PERSISTENT.NS','MPHASIS.NS','COFORGE.NS','HEXAWARE.NS'],
  fmcg:    ['HINDUNILVR.NS','ITC.NS','NESTLEIND.NS','TATACONSUM.NS','GODREJCP.NS','BRITANNIA.NS','DABUR.NS','MARICO.NS','COLPAL.NS','EMAMILTD.NS'],
  auto:    ['MARUTI.NS','BAJAJ-AUTO.NS','M%26M.NS','TATAMOTORS.NS','EICHERMOT.NS','HYUNDAI.NS','TVSMOTOR.NS','HEROMOTOCO.NS','BOSCHLTD.NS','ASHOKLEY.NS'],
  energy:  ['RELIANCE.NS','NTPC.NS','POWERGRID.NS','ONGC.NS','COALINDIA.NS','ADANIGREEN.NS','ADANIPOWER.NS','IOC.NS','TATAPOWER.NS','BPCL.NS'],
};

module.exports = async function handler(req, res) {
  const s = (req.query.s || '').toLowerCase();
  if (!SECTORS[s]) return res.status(400).json({ error: 'Unknown sector' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const syms = SECTORS[s];
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,marketCap,trailingPE,52WeekChange,ytdReturn`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();

    const bySymbol = {};
    for (const q of data?.quoteResponse?.result ?? []) {
      bySymbol[q.symbol] = {
        marketCap:   q.marketCap                  ?? null,
        pe:          q.trailingPE                 ?? null,
        change52w:   q['52WeekChange']            ?? null, // decimal: 0.198 = +19.8%
        pctChange:   q.regularMarketChangePercent ?? null, // already in %: 1.23 = +1.23%
        ytd:         q.ytdReturn                  ?? null, // decimal: 0.124 = +12.4%
      };
    }

    // Return in the same order as the symbols array so the sector page
    // can match stocks[i] → table row[i] without needing data-sym attrs
    const stocks = syms.map(sym => bySymbol[sym] || null);

    return res.json({ stocks, updatedAt: Date.now() });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
