/**
 * One-time script: patches all 6 sector HTML pages to add LTP column.
 * Run locally — not part of the daily pipeline.
 */
const fs   = require('fs');
const path = require('path');

const SECTORS_DIR = path.join(__dirname, '..', 'sectors');

const CSS = `
.ltp-cell{min-width:88px}
.ltp-v{font-weight:700;color:var(--text);font-size:.85rem}
.ltp-c{font-size:.68rem;margin-top:1px;font-weight:600}`;

const JS = `<script>
fetch('/data/stocks.json').then(r=>r.json()).then(d=>{
  document.querySelectorAll('tr[data-sym]').forEach(function(row){
    var s=d.stocks&&d.stocks[row.dataset.sym];
    if(!s)return;
    var up=s.changePct>=0;
    var price='₹'+Math.round(s.ltp).toLocaleString('en-IN');
    var pct=(up?'+':'')+s.changePct+'%';
    row.querySelector('.ltp-cell').innerHTML=
      '<div class="ltp-v">'+price+'<\/div>'+
      '<div class="ltp-c '+(up?'chg-pos':'chg-neg')+'">'+(up?'▲':'▼')+' '+pct+'<\/div>';
  });
}).catch(function(){});
<\/script>`;

// Extract NSE symbol from the company-cell div content
function extractSym(companyCellHtml) {
  // Matches: <div class="ct">SYMBOL · or <div class="ct">SYMBOL&amp; or with hyphen
  const m = companyCellHtml.match(/class="ct">([A-Z0-9&;-]+)\s*·/);
  if (!m) return null;
  // Decode &amp; → &
  return m[1].replace(/&amp;/g, '&');
}

function patchFile(file) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;

  // 1 — add CSS before closing </style>
  if (!html.includes('.ltp-cell')) {
    html = html.replace(/(<\/style>)/, CSS + '\n$1');
  }

  // 2 — update <thead> to add LTP column header
  html = html.replace(
    /(<th>#<\/th>\s*<th>Company<\/th>\s*)(<th>Market Cap<\/th>)/g,
    '$1<th>LTP<\/th>$2'
  );
  // multi-line thead variant
  html = html.replace(
    /(<th>Company<\/th>\s*\n\s*)(<th>Market Cap<\/th>)/g,
    '$1<th>LTP<\/th>\n          $2'
  );

  // 3 — patch single-line <tr> rows in tbody
  // Pattern: <tr><td class="rank-cell">...<td class="company-cell">COMPANY</td><td class="mcap-cell">
  html = html.replace(
    /<tr>(<td class="rank-cell">[\s\S]*?<\/td>)(<td class="company-cell">([\s\S]*?)<\/td>)(<td class="mcap-cell">)/g,
    function(_, rank, companyFull, companyInner, mcap) {
      const sym = extractSym(companyInner);
      const symAttr = sym ? ` data-sym="${sym}"` : '';
      return `<tr${symAttr}>${rank}${companyFull}<td class="ltp-cell">—</td>${mcap}`;
    }
  );

  // 4 — patch multi-line <tr> rows
  // These have <tr>\n          <td class="rank-cell"> on separate lines
  html = html.replace(
    /<tr>\n(\s+<td class="rank-cell">[\s\S]*?<\/td>\n\s+)(<td class="company-cell">([\s\S]*?)<\/td>\n)(\s+<td class="mcap-cell">)/g,
    function(_, rank, companyFull, companyInner, mcap) {
      const sym = extractSym(companyInner);
      const symAttr = sym ? ` data-sym="${sym}"` : '';
      const indent = mcap.match(/^\s+/)[0];
      return `<tr${symAttr}>\n${rank}${companyFull}${indent}<td class="ltp-cell">—</td>\n${mcap}`;
    }
  );

  // 5 — add JS snippet before </body>
  if (!html.includes('stocks.json')) {
    html = html.replace(/<\/body>/, JS + '\n</body>');
  }

  if (html !== orig) {
    fs.writeFileSync(file, html);
    console.log(`✓ Patched: ${path.basename(file)}`);
  } else {
    console.log(`  No change: ${path.basename(file)}`);
  }
}

const files = fs.readdirSync(SECTORS_DIR)
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(SECTORS_DIR, f));

files.forEach(patchFile);
console.log('\nDone.');
