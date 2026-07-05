#!/usr/bin/env node
/**
 * generate-og-images.js
 *
 * Generates a 1200x630 OG/Article-schema image for every post in blog/*.html
 * that doesn't already have one, then injects og:image, twitter:image, and
 * the JSON-LD Article "image" field into the post file.
 *
 * Usage:
 *   node generate-og-images.js            // only generates missing images
 *   node generate-og-images.js --force    // regenerates all images, even existing ones
 *
 * Requires: npm install sharp
 *
 * Wire this into your deploy step the same way generate-sitemap.js is wired
 * in vercel.json's buildCommand, so every future post gets an image for free.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BLOG_DIR = path.join(__dirname, 'blog');
const OUTPUT_DIR = path.join(__dirname, 'assets', 'og');
const SITE_URL = 'https://worthscale.in';
const FORCE = process.argv.includes('--force');

// ---------- Category templates ----------
// Each template is a function returning an SVG string. Keep it simple:
// dark background, accent color per category, entity name, figure (optional).
const TEMPLATES = {
  company: { accent: '#4F7CFF', badge: 'COMPANY VALUATION' },
  celebrity: { accent: '#B266FF', badge: 'CELEBRITY NET WORTH' },
  guide: { accent: '#2DD4BF', badge: 'FINANCE GUIDE' },
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvg({ name, figure, category }) {
  const tpl = TEMPLATES[category] || TEMPLATES.guide;

  // Measure/truncate on the raw name (not the XML-escaped one — "&" etc.
  // would otherwise inflate the length and shrink the font unnecessarily).
  // Guide titles in particular can run long ("Why Net Worth Matters More
  // Than Salary (India Guide)" is 54 chars), so this needs more than two
  // tiers, plus a hard ellipsis cutoff as a safety net against any string
  // long enough to overflow the 1200px canvas regardless of font size.
  const MAX_NAME_CHARS = 60;
  const trimmedName = name.length > MAX_NAME_CHARS
    ? name.slice(0, MAX_NAME_CHARS - 1).trim() + '…'
    : name;
  const safeName = escapeXml(trimmedName);
  const safeFigure = figure ? escapeXml(figure) : null;

  const len = trimmedName.length;
  const nameFontSize = len > 48 ? 30 : len > 34 ? 38 : len > 22 ? 52 : 72;

  return `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B0F1A"/>
      <stop offset="100%" stop-color="#161B2E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- accent bar -->
  <rect x="0" y="0" width="12" height="630" fill="${tpl.accent}"/>

  <!-- badge -->
  <rect x="80" y="80" width="${tpl.badge.length * 13 + 40}" height="44" rx="22" fill="${tpl.accent}" opacity="0.15"/>
  <text x="100" y="108" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="${tpl.accent}">${tpl.badge}</text>

  <!-- entity name -->
  <text x="80" y="290" font-family="Arial, sans-serif" font-size="${nameFontSize}" font-weight="800" fill="#FFFFFF">${safeName}</text>

  ${safeFigure ? `
  <!-- figure -->
  <text x="80" y="390" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="${tpl.accent}">${safeFigure}</text>
  ` : ''}

  <!-- footer -->
  <text x="80" y="560" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF" opacity="0.85">WorthScale</text>
  <text x="80" y="590" font-family="Arial, sans-serif" font-size="20" fill="#FFFFFF" opacity="0.5">India's Finance Hub &#8226; worthscale.in</text>
</svg>`.trim();
}

// ---------- Extraction from post HTML ----------
function extractCategory(html) {
  // Scope the search to just the hero badge area. Searching the whole
  // document is unsafe: every page's footer has a "Company" nav heading
  // (<h4>Company</h4>), so if the real badge fails to match for any reason
  // it silently false-matches that instead of falling through to 'guide'.
  const heroMatch = html.match(/class="page-hero"[\s\S]{0,400}?<h1/i);
  const heroHtml = heroMatch ? heroMatch[0] : '';

  // The badge prefix before the category word is inconsistent across posts
  // — a literal emoji, an HTML entity (&#127962;), or even a mangled
  // character — so skip any non-letter prefix rather than whitelisting
  // specific emoji. Also covers "Individual Net Worth" and "Content Creator
  // Net Worth", both of which are filed under "celebrity" site-wide.
  const badgeMatch = heroHtml.match(/>[^A-Za-z<]{0,12}(Company|Celebrity|Individual|Content Creator)[^<]{0,20}</i);
  if (badgeMatch) {
    const word = badgeMatch[1].toLowerCase();
    if (word === 'company') return 'company';
    if (word === 'celebrity' || word === 'individual' || word === 'content creator') return 'celebrity';
  }
  return 'guide';
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractNameAndFigure(title, category) {
  if (!title) return { name: 'WorthScale', figure: null };

  // Strip trailing " | WorthScale" or similar
  let clean = title.split('|')[0].trim();

  // Guide posts (e.g. "How to Calculate Net Worth...", "Why Net Worth Matters
  // More Than Salary...") aren't about a single named entity, and their titles
  // often contain "Net Worth" as an incidental substring rather than a
  // "<Entity> Net Worth" header. Matching against that pattern there produces
  // garbage ("How to Calculate", "Why"), so use the plain title/prefix for
  // guides and skip figure extraction — there's no single figure to show.
  if (category === 'guide') {
    const name = clean.split(':')[0].trim() || clean;
    return { name: name || 'WorthScale', figure: null };
  }

  // Name is usually everything before " Net Worth"
  const nameMatch = clean.match(/^(.*?)\s+Net Worth/i);
  const name = nameMatch ? nameMatch[1].trim() : clean.split(':')[0].trim();

  // Figure: currency amount with unit, e.g. ₹19.77 Lakh Crore, $267 Billion,
  // ₹1,415 Crore, $3.07 Trillion — also handles ranges like ₹5-10 Crore or
  // ₹100–150 Crore (hyphen or en dash), and abbreviated units some titles
  // use instead of the full word: $14.5B, $8B (letter glued to the number),
  // ₹70,178 Cr. Full words are listed before the abbreviations so those are
  // preferred when both could match at the same position.
  const figureMatch = clean.match(
    /(₹|\$)\s?[\d,.]+(?:\s*(?:-|–|—|to)\s*[\d,.]+)?\s?(lakh crores?|crores?|billions?|trillions?|millions?|cr|bn|tn|b|m|t)?/i
  );
  const figure = figureMatch ? figureMatch[0].trim() : null;

  return { name: name || 'WorthScale', figure };
}

// ---------- Injection into post HTML ----------
function injectImageTags(html, imageUrl) {
  let updated = html;

  // og:image
  if (/<meta property="og:image"/i.test(updated)) {
    updated = updated.replace(
      /<meta property="og:image"[^>]*>/i,
      `<meta property="og:image" content="${imageUrl}">`
    );
  } else {
    updated = updated.replace(
      /<\/head>/i,
      `  <meta property="og:image" content="${imageUrl}">\n</head>`
    );
  }

  // twitter:image
  if (/<meta name="twitter:image"/i.test(updated)) {
    updated = updated.replace(
      /<meta name="twitter:image"[^>]*>/i,
      `<meta name="twitter:image" content="${imageUrl}">`
    );
  } else {
    updated = updated.replace(
      /<\/head>/i,
      `  <meta name="twitter:image" content="${imageUrl}">\n</head>`
    );
  }

  // JSON-LD Article "image" field — only touch the Article block, not
  // FAQPage/BreadcrumbList. Each <script type="application/ld+json"> tag is
  // matched as its own isolated unit first (script tags don't nest), so
  // there's no risk of a naive brace-scan stopping at a nested object's `}`
  // (e.g. the "author" sub-object) instead of the Article object's own end —
  // that's what caused the "image" field to land inside "author" before.
  updated = updated.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (fullScript, jsonContent) => {
      if (!/"@type"\s*:\s*"Article"/.test(jsonContent)) return fullScript;
      let newContent;
      if (/"image"\s*:/.test(jsonContent)) {
        newContent = jsonContent.replace(/"image"\s*:\s*"[^"]*"/, `"image":"${imageUrl}"`);
      } else {
        newContent = jsonContent.replace(
          /(\{\s*"@context"\s*:\s*"https:\/\/schema\.org"\s*,\s*"@type"\s*:\s*"Article"\s*,)/,
          `$1"image":"${imageUrl}",`
        );
      }
      return `<script type="application/ld+json">${newContent}</script>`;
    }
  );

  return updated;
}

// blog/index.html's data-cat attribute is the curated, authoritative
// category per post (also what drives the live filter tabs) — badge text
// inside each post is hand-written and drifts a lot in practice (plurals,
// custom descriptive badges with no keyword at all, stray emoji/HTML-entity
// prefixes), so prefer the index and only fall back to badge-parsing for
// posts that aren't listed there (e.g. a canonicalized duplicate).
function loadIndexCategoryMap() {
  const indexPath = path.join(BLOG_DIR, 'index.html');
  const map = {};
  if (!fs.existsSync(indexPath)) return map;
  const html = fs.readFileSync(indexPath, 'utf8');
  for (const m of html.matchAll(/href="\/blog\/([^"]+)" class="bc" data-cat="([a-z]+)"/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

// ---------- Main ----------
async function run() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`Blog directory not found at ${BLOG_DIR}. Update BLOG_DIR at the top of this script.`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const indexCategoryMap = loadIndexCategoryMap();
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.html') && f !== 'index.html');
  console.log(`Found ${files.length} post files.\n`);

  let generated = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = file.replace(/\.html$/, '');
    const filePath = path.join(BLOG_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, `${slug}.png`);
    const imageUrl = `${SITE_URL}/assets/og/${slug}.png`;

    if (fs.existsSync(outputPath) && !FORCE) {
      skipped++;
      continue;
    }

    const html = fs.readFileSync(filePath, 'utf8');
    const category = indexCategoryMap[slug] || extractCategory(html);
    const title = extractTitle(html);
    const { name, figure } = extractNameAndFigure(title, category);

    const svg = buildSvg({ name, figure, category });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);

    const updatedHtml = injectImageTags(html, imageUrl);
    fs.writeFileSync(filePath, updatedHtml, 'utf8');

    generated++;
    console.log(`✓ ${slug}  [${category}]  ${name}${figure ? ' — ' + figure : ''}`);
  }

  console.log(`\nDone. Generated: ${generated}, skipped (already had image): ${skipped}.`);
  if (!FORCE && skipped > 0) {
    console.log(`Run with --force to regenerate existing images.`);
  }
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
