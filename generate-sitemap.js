const fs = require('fs');
const path = require('path');

const root = __dirname;
const domain = 'https://worthscale.in';

const mainPages = [
  { route: '/', file: 'index.html', changefreq: 'weekly', priority: '1.0' },
  { route: '/markets', file: 'markets.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/companies', file: 'companies.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/crypto', file: 'crypto.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/nifty-50', file: 'nifty-50.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/richest-indians', file: 'richest-indians.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/app', file: 'app.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/net-worth-calculator', file: 'net-worth-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/emergency-fund-calculator', file: 'emergency-fund-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/house-down-payment-calculator', file: 'house-down-payment-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/sip-calculator', file: 'sip-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/income-tax-calculator', file: 'income-tax-calculator.html', changefreq: 'yearly', priority: '0.9' },
  { route: '/about', file: 'about.html', changefreq: 'monthly', priority: '0.6' },
  { route: '/contact', file: 'contact.html', changefreq: 'monthly', priority: '0.5' },
  { route: '/share', file: 'share.html', changefreq: 'monthly', priority: '0.5' },
  { route: '/privacy-policy', file: 'privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { route: '/terms', file: 'terms.html', changefreq: 'yearly', priority: '0.3' },
  { route: '/sitemap', file: 'sitemap.html', changefreq: 'weekly', priority: '0.6' },
  { route: '/blog', file: path.join('blog', 'index.html'), changefreq: 'daily', priority: '0.8' }
];

function toDateString(mtimeMs) {
  const d = new Date(mtimeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pageXml(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n');
}

// A blog file is only sitemap-worthy if it doesn't declare a canonical URL
// pointing somewhere else (that marks it as a non-canonical duplicate of
// another post, e.g. an old re-generated slug for the same article).
function getCanonicalPath(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const match = html.match(/<link rel="canonical" href="([^"]+)">/);
  if (!match) return null;
  try {
    return new URL(match[1]).pathname.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function generateSitemap() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ''];

  lines.push('  <!-- Main Pages -->');
  for (const page of mainPages) {
    const filePath = path.join(root, page.file);
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    lines.push(pageXml(`${domain}${page.route}`, toDateString(stat.mtimeMs), page.changefreq, page.priority));
  }

  lines.push('');
  lines.push('  <!-- Sector Pages -->');
  const sectorsDir = path.join(root, 'sectors');
  const sectorFiles = fs.existsSync(sectorsDir)
    ? fs.readdirSync(sectorsDir).filter((name) => name.endsWith('.html')).sort((a, b) => a.localeCompare(b))
    : [];
  for (const file of sectorFiles) {
    const slug = file.replace(/\.html$/, '');
    const stat = fs.statSync(path.join(sectorsDir, file));
    lines.push(pageXml(`${domain}/sectors/${slug}`, toDateString(stat.mtimeMs), 'weekly', '0.8'));
  }

  lines.push('');
  lines.push('  <!-- Blog Pages -->');

  const blogDir = path.join(root, 'blog');
  const blogEntries = fs
    .readdirSync(blogDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((file) => {
      const slug = file.replace(/\.html$/, '');
      const filePath = path.join(blogDir, file);
      const canonicalPath = getCanonicalPath(filePath);
      const isCanonical = !canonicalPath || canonicalPath === `/blog/${slug}`;
      return { file, slug, filePath, isCanonical };
    })
    .filter((entry) => entry.isCanonical)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  for (const entry of blogEntries) {
    const stat = fs.statSync(entry.filePath);
    lines.push(pageXml(`${domain}/blog/${entry.slug}`, toDateString(stat.mtimeMs), 'monthly', '0.7'));
  }

  lines.push('');
  lines.push('</urlset>');

  fs.writeFileSync(path.join(root, 'sitemap.xml'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`sitemap.xml regenerated: ${mainPages.length} main pages, ${sectorFiles.length} sector pages, ${blogEntries.length} blog posts.`);

  return blogEntries;
}

function updateSitemapPage(blogEntries) {
  const sitemapPagePath = path.join(root, 'sitemap.html');
  if (!fs.existsSync(sitemapPagePath)) return;
  let html = fs.readFileSync(sitemapPagePath, 'utf8');

  const linksHtml = blogEntries
    .map((entry) => {
      const title = entry.slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      return `        <li><a href="/blog/${entry.slug}">${title}</a></li>`;
    })
    .join('\n');

  html = html.replace(
    /<!-- BLOG_LINKS_START -->[\s\S]*?<!-- BLOG_LINKS_END -->/,
    `<!-- BLOG_LINKS_START -->\n${linksHtml}\n        <!-- BLOG_LINKS_END -->`
  );
  html = html.replace(
    /<!-- BLOG_COUNT_START -->[\s\S]*?<!-- BLOG_COUNT_END -->/,
    `<!-- BLOG_COUNT_START -->${blogEntries.length} articles<!-- BLOG_COUNT_END -->`
  );

  fs.writeFileSync(sitemapPagePath, html, 'utf8');
  console.log(`sitemap.html updated with ${blogEntries.length} static blog links.`);
}

const blogEntries = generateSitemap();
updateSitemapPage(blogEntries);
