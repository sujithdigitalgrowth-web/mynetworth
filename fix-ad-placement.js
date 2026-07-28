// Ad placement migration — see WorthScale ad placement fix (2026-07).
// Rewrites AdSense markup across the static site:
//   1. Removes Multiplex (data-ad-format="autorelaxed") units entirely.
//   2. Wraps the remaining Display auto-unit and the in-article fluid unit in
//      the new .ad-container styling (bordered, labeled — see styles.css).
//   3. Blog posts only: restructures the article body into a two-column
//      layout with a new Vertical ad unit in a sticky sidebar.
//   4. Pages that currently carry no ads at all get one Display unit added
//      just above the footer.
//
// Idempotent — a file already containing `class="ad-container` is skipped.
// Run with --dry to preview changes without writing (prints a per-file diff summary).

const fs = require('fs');
const path = require('path');

const root = __dirname;
const DRY = process.argv.includes('--dry');
const ONLY = process.argv.find(a => a.startsWith('--only='));
const onlyFiles = ONLY ? ONLY.slice('--only='.length).split(',') : null;

const CLIENT = 'ca-pub-4837443132966026';
const SLOT_VERTICAL = '7576504580'; // Vertical_DisplayAd — new unit, blog sidebar only

// Pages that already carry ad units — Multiplex removal + ad-wrap → ad-container upgrade.
const BLOG_FILES = fs.readdirSync(path.join(root, 'blog'))
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .map(f => 'blog/' + f);

const CALCULATORS_WITH_ADS = [
  'net-worth-calculator.html',
  'emergency-fund-calculator.html',
  'house-down-payment-calculator.html',
];

// Pages with zero ad units today — get one Display unit added above the footer.
// Slot choice matches the "family" the page already belongs to, reusing existing
// inventory rather than minting new AdSense units.
const AD_FREE_PAGES = [
  { file: 'index.html', slot: '7020661960' },
  { file: 'home-loan-emi-calculator.html', slot: '6196347060' },
  { file: 'new-tax-regime-calculator.html', slot: '6196347060' },
  { file: 'income-tax-calculator.html', slot: '6196347060' },
  { file: 'sip-calculator.html', slot: '6196347060' },
  { file: 'markets.html', slot: '7020661960' },
  { file: 'companies.html', slot: '7020661960' },
  { file: 'crypto.html', slot: '7020661960' },
  { file: 'richest-indians.html', slot: '7020661960' },
  { file: 'nifty-50.html', slot: '7020661960' },
  { file: 'about.html', slot: '7020661960' },
  { file: 'contact.html', slot: '7020661960' },
  ...fs.readdirSync(path.join(root, 'sectors'))
    .filter(f => f.endsWith('.html'))
    .map(f => ({ file: 'sectors/' + f, slot: '7020661960' })),
];

const summary = { migrated: 0, adFreeUpdated: 0, skippedAlready: 0, skippedNoMatch: 0, sidebarMissing: [], errors: [] };

function readFile(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function writeFile(rel, content) {
  if (DRY) return;
  fs.writeFileSync(path.join(root, rel), content, 'utf8');
}

// Finds the index just past the matching closing </div> for the <div ...> tag
// that starts at openIdx, by tracking nesting depth. Needed because regex alone
// can't safely balance nested divs inside 100+ hand-written article bodies.
function findMatchingCloseDivEnd(html, openIdx) {
  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = openIdx;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].toLowerCase() === '</div>') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

// Step A: remove Multiplex ad-wrap blocks entirely (with an optional preceding comment line).
// The inner-content group is bounded with a "not <div" lookahead so it can never span past
// this block's own closing </div> into a later, unrelated ad-wrap block (there are usually
// two ad-wrap divs per page — this must only ever match the one that is actually Multiplex).
function removeMultiplex(html) {
  const re = /(?:[ \t]*<!--[^\n]*-->\s*\n)?[ \t]*<div class="ad-wrap"[^>]*>((?:(?!<div)[\s\S])*?)<\/div>\s*\n?/g;
  let changed = false;
  html = html.replace(re, (match, inner) => {
    if (!inner.includes('data-ad-format="autorelaxed"')) return match;
    changed = true;
    return '';
  });
  return { html, changed };
}

// Step B: upgrade the remaining ad-wrap div (the Display "auto" unit) to .ad-container.
function upgradeAutoUnit(html) {
  const re = /<div class="ad-wrap"[^>]*>(\s*<ins class="adsbygoogle")/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  html = html.replace(
    re,
    '<div class="ad-container ad-container--top">\n  <span class="ad-label">Advertisement</span>$1'
  );
  return { html, changed: true };
}

// Step C: wrap the bare in-article fluid <ins> (never had a div wrapper) in .ad-container.
function wrapInArticleUnit(html) {
  const re = /<ins class="adsbygoogle"[^>]*data-ad-layout="in-article"[^>]*><\/ins>\s*<script>\(adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\);<\/script>/;
  const m = html.match(re);
  if (!m) return { html, changed: false };
  const replacement =
    '<div class="ad-container ad-container--in-article">\n' +
    '  <span class="ad-label">Advertisement</span>\n' +
    '  ' + m[0] + '\n' +
    '</div>';
  html = html.replace(re, replacement);
  return { html, changed: true };
}

// Step D (blog posts only): wrap .article-content in a two-column layout with a new
// Vertical ad unit in a sticky sidebar.
function addSidebar(html, fileLabel) {
  const marker = '<div class="article-content">';
  const openIdx = html.indexOf(marker);
  if (openIdx === -1) {
    summary.sidebarMissing.push(fileLabel);
    return { html, changed: false };
  }
  const endIdx = findMatchingCloseDivEnd(html, openIdx);
  if (endIdx === -1) {
    summary.sidebarMissing.push(fileLabel + ' (unbalanced divs)');
    return { html, changed: false };
  }
  const contentBlock = html.slice(openIdx, endIdx);
  const wrapped =
    '<div class="content-with-sidebar">\n' +
    '  <div class="main-column">\n' +
    '    ' + contentBlock + '\n' +
    '  </div>\n' +
    '  <div class="ad-sidebar">\n' +
    '    <div class="ad-container ad-container--vertical">\n' +
    '      <span class="ad-label">Advertisement</span>\n' +
    `      <ins class="adsbygoogle" style="display:block" data-ad-client="${CLIENT}" data-ad-slot="${SLOT_VERTICAL}" data-ad-format="auto" data-full-width-responsive="true"></ins>\n` +
    '      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</div>';
  html = html.slice(0, openIdx) + wrapped + html.slice(endIdx);
  return { html, changed: true };
}

function migrateExistingAdPage(rel, { sidebar }) {
  let html = readFile(rel);
  if (html.includes('class="ad-container')) {
    summary.skippedAlready++;
    return;
  }

  let changedAny = false;
  let r;

  r = removeMultiplex(html); html = r.html; changedAny = changedAny || r.changed;
  r = upgradeAutoUnit(html); html = r.html; changedAny = changedAny || r.changed;
  r = wrapInArticleUnit(html); html = r.html; changedAny = changedAny || r.changed;
  if (sidebar) {
    r = addSidebar(html, rel); html = r.html; changedAny = changedAny || r.changed;
  }

  if (!changedAny) {
    summary.skippedNoMatch++;
    return;
  }

  writeFile(rel, html);
  summary.migrated++;
}

function addAdToFreePage(rel, slot) {
  let html = readFile(rel);
  if (html.includes('class="ad-container')) {
    summary.skippedAlready++;
    return;
  }
  const footerMarker = '<footer class="site-footer">';
  if (!html.includes(footerMarker)) {
    summary.errors.push(`${rel}: no <footer class="site-footer"> anchor found`);
    return;
  }
  const block =
    '<div class="ad-container ad-container--top" style="margin:32px auto">\n' +
    '  <span class="ad-label">Advertisement</span>\n' +
    `  <ins class="adsbygoogle" style="display:block" data-ad-client="${CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>\n` +
    '  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>\n' +
    '</div>\n\n';
  html = html.replace(footerMarker, block + footerMarker);
  writeFile(rel, html);
  summary.adFreeUpdated++;
}

// ── Run ──────────────────────────────────────────────────────────────────

const blogTargets = onlyFiles ? BLOG_FILES.filter(f => onlyFiles.includes(f)) : BLOG_FILES;
const calcTargets = onlyFiles ? CALCULATORS_WITH_ADS.filter(f => onlyFiles.includes(f)) : CALCULATORS_WITH_ADS;
const freeTargets = onlyFiles ? AD_FREE_PAGES.filter(p => onlyFiles.includes(p.file)) : AD_FREE_PAGES;

blogTargets.forEach(f => migrateExistingAdPage(f, { sidebar: true }));
calcTargets.forEach(f => migrateExistingAdPage(f, { sidebar: false }));
freeTargets.forEach(p => addAdToFreePage(p.file, p.slot));

console.log(`${DRY ? '[DRY RUN] ' : ''}Ad placement migration summary`);
console.log('─'.repeat(50));
console.log(`Blog posts targeted:        ${blogTargets.length}`);
console.log(`Calculators targeted:       ${calcTargets.length}`);
console.log(`Ad-free pages targeted:     ${freeTargets.length}`);
console.log(`Migrated (existing ads):    ${summary.migrated}`);
console.log(`Ad-free pages updated:      ${summary.adFreeUpdated}`);
console.log(`Skipped (already migrated): ${summary.skippedAlready}`);
console.log(`Skipped (no ad markup):     ${summary.skippedNoMatch}`);
if (summary.sidebarMissing.length) {
  console.log(`\nSidebar NOT applied (needs manual check):`);
  summary.sidebarMissing.forEach(f => console.log(`  - ${f}`));
}
if (summary.errors.length) {
  console.log(`\nErrors:`);
  summary.errors.forEach(e => console.log(`  - ${e}`));
}
