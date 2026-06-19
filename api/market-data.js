// Vercel serverless — live market data via Yahoo Finance crumb-authenticated v7 API.
// CDN-cached 5 minutes.
// Yahoo Finance requires: (1) cookie from fc.yahoo.com, (2) crumb from getcrumb using that cookie.

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

const YF_SYMBOLS = [
  '^NSEI',      // Nifty 50
  '^BSESN',     // Sensex
  '^NSEBANK',   // Bank Nifty
  '^CNXIT',     // Nifty IT
  '^NIFPHARMA', // Nifty Pharma
  '^CNXAUTO',   // Nifty Auto
  '^CNXFMCG',   // Nifty FMCG
  '^CNXENERGY', // Nifty Energy
  'USDINR=X',   // USD/INR
  'GC=F',       // Gold futures (USD/troy oz)
];

const CG_IDS = 'bitcoin,ethereum,solana,binancecoin';

// Session cache — persists across warm Vercel invocations (~30 min)
let _crumb  = null;
let _cookie = null;
let _ts     = 0;

async function getSession() {
  if (_crumb && _cookie && Date.now() - _ts < 25 * 60 * 1000) {
    return { crumb: _crumb, cookie: _cookie };
  }

  // Step 1: hit fc.yahoo.com to obtain the consent/session cookie
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: BASE_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(6000),
  });
  const rawCookie = cookieRes.headers.get('set-cookie') ?? '';
  // Extract cookie name=value pairs, drop attributes like Path/Domain/Expires
  const cookie = rawCookie
    .split(',')
    .map(s => s.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');

  // Step 2: fetch crumb using that cookie
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BASE_HEADERS, Cookie: cookie },
    signal: AbortSignal.timeout(6000),
  });
  if (!crumbRes.ok) throw new Error(`crumb fetch failed: ${crumbRes.status}`);
  const crumb = await crumbRes.text();
  if (!crumb || crumb.length < 4) throw new Error('invalid crumb received');

  _crumb  = crumb;
  _cookie = cookie;
  _ts     = Date.now();
  return { crumb, cookie };
}

// Troy oz → 10 grams in INR
function goldPer10g(usdPerOz, usdinr) {
  return Math.round((usdPerOz / 31.1035) * 10 * usdinr);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const { crumb, cookie } = await getSession();

    const yfHeaders = { ...BASE_HEADERS, Cookie: cookie };
    const yfUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${YF_SYMBOLS.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketTime&crumb=${encodeURIComponent(crumb)}`;

    const [yfRes, cgRes] = await Promise.all([
      fetch(yfUrl, { headers: yfHeaders, signal: AbortSignal.timeout(8000) }),
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${CG_IDS}&vs_currencies=usd,inr&include_24hr_change=true`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      ),
    ]);

    if (!yfRes.ok) {
      // Invalidate session so next request re-authenticates
      _crumb = null; _cookie = null; _ts = 0;
      throw new Error(`Yahoo Finance returned ${yfRes.status}`);
    }
    if (!cgRes.ok) throw new Error(`CoinGecko returned ${cgRes.status}`);

    const [yfData, cgData] = await Promise.all([yfRes.json(), cgRes.json()]);

    const q = {};
    for (const item of yfData?.quoteResponse?.result ?? []) {
      q[item.symbol] = {
        price:  item.regularMarketPrice,
        change: item.regularMarketChange,
        pct:    item.regularMarketChangePercent,
        time:   item.regularMarketTime,
      };
    }

    // If no results came back the crumb was rejected; force re-auth next call
    if (Object.keys(q).length === 0) {
      _crumb = null; _cookie = null; _ts = 0;
      throw new Error('Yahoo Finance returned empty result — crumb may be invalid');
    }

    const usdinr    = q['USDINR=X']?.price ?? 84;
    const goldUsdOz = q['GC=F']?.price;

    return res.json({
      indices: {
        nifty50:     q['^NSEI'],
        sensex:      q['^BSESN'],
        bankNifty:   q['^NSEBANK'],
        niftyIT:     q['^CNXIT'],
        niftyPharma: q['^NIFPHARMA'],
        niftyAuto:   q['^CNXAUTO'],
        niftyFMCG:   q['^CNXFMCG'],
        niftyEnergy: q['^CNXENERGY'],
      },
      forex: {
        usdinr: { price: usdinr, pct: q['USDINR=X']?.pct ?? 0 },
      },
      commodities: {
        gold: goldUsdOz
          ? { price10g: goldPer10g(goldUsdOz, usdinr), pct: q['GC=F']?.pct ?? 0 }
          : null,
      },
      crypto: {
        bitcoin:  cgData.bitcoin,
        ethereum: cgData.ethereum,
        solana:   cgData.solana,
        bnb:      cgData.binancecoin,
      },
      updatedAt: Date.now(),
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
