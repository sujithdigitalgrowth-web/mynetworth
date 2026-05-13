const fs = require('fs');
const path = require('path');

const root = __dirname;
const domain = 'https://worthscale.in';

const mainPages = [
  { route: '/', file: 'index.html', changefreq: 'weekly', priority: '1.0' },
  { route: '/app', file: 'app.html', changefreq: 'weekly', priority: '0.9' },
  { route: '/net-worth-calculator', file: 'net-worth-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/emergency-fund-calculator', file: 'emergency-fund-calculator.html', changefreq: 'monthly', priority: '0.9' },
  { route: '/house-down-payment-calculator', file: 'house-down-payment-calculator.html', changefreq: 'monthly', priority: '0.9' },
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

function generateSitemap() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ''];

  lines.push('  <!-- Main Pages -->');
  for (const page of mainPages) {
    const filePath = path.join(root, page.file);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const stat = fs.statSync(filePath);
    lines.push(pageXml(`${domain}${page.route}`, toDateString(stat.mtimeMs), page.changefreq, page.priority));
  }

  lines.push('');
  lines.push('  <!-- Blog Pages -->');

  const blogDir = path.join(root, 'blog');
  const blogFiles = fs
    .readdirSync(blogDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .sort((a, b) => a.localeCompare(b));

  for (const file of blogFiles) {
    const slug = file.replace(/\.html$/, '');
    const stat = fs.statSync(path.join(blogDir, file));
    lines.push(pageXml(`${domain}/blog/${slug}`, toDateString(stat.mtimeMs), 'monthly', '0.7'));
  }

  lines.push('');
  lines.push('</urlset>');

  fs.writeFileSync(path.join(root, 'sitemap.xml'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`sitemap.xml regenerated with ${blogFiles.length} blog URLs.`);
}

generateSitemap();
