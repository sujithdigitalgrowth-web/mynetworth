'use strict';
const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const mammoth = require('mammoth');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT) || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'worthscale2026';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN   || '';
const GITHUB_OWNER   = process.env.GITHUB_OWNER   || 'sujithdigitalgrowth-web';
const GITHUB_REPO    = process.env.GITHUB_REPO    || 'mynetworth';
const DEV_MODE       = !GITHUB_TOKEN;

const ROOT       = path.resolve(__dirname);
const BLOGS_JSON = path.join(ROOT, 'blogs-data.json');
const BLOG_INDEX = path.join(ROOT, 'blog', 'index.html');
const BLOG_DIR   = path.join(ROOT, 'blog');
const MARKER     = '<!-- ADMIN_NEW_BLOGS_END -->';

if (DEV_MODE) {
  console.log('⚠️  Running in LOCAL mode (no GITHUB_TOKEN). Blog files written to disk.');
} else {
  console.log(`✅ GitHub mode: commits to ${GITHUB_OWNER}/${GITHUB_REPO}`);
}

// ── Session auth ──────────────────────────────────────────────────────────────
const sessions = new Set();
function createSession() { const t = crypto.randomBytes(24).toString('hex'); sessions.add(t); return t; }
function isAuth(req) { const m = (req.headers.cookie || '').match(/ws_adm=([a-f0-9]+)/); return !!(m && sessions.has(m[1])); }

// ── GitHub API ────────────────────────────────────────────────────────────────
function ghRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path: apiPath, method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'WorthScale-Admin',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ghGetFile(filePath) {
  const r = await ghRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GitHub GET ${filePath}: HTTP ${r.status}`);
  return r.body;
}

async function ghPutFile(filePath, content, message, sha) {
  const body = { message, content: Buffer.from(content, 'utf8').toString('base64'), ...(sha ? { sha } : {}) };
  const r = await ghRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`, body);
  if (r.status !== 200 && r.status !== 201) throw new Error(`GitHub PUT ${filePath}: HTTP ${r.status} — ${JSON.stringify(r.body?.message || r.body)}`);
  return r.body;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function isoDate() { return new Date().toISOString().split('T')[0]; }
function escRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
  });
}

// ── Category config ───────────────────────────────────────────────────────────
const CAT = {
  guide:     { label: '📚 Finance Guide',      style: 'background:rgba(34,197,94,.1);color:var(--green)',    tagClass: 'tag-guide',     badge: 'Guide'     },
  celebrity: { label: '⭐ Celebrity Net Worth', style: 'background:rgba(245,158,11,.12);color:var(--orange)', tagClass: 'tag-celebrity', badge: 'Celebrity' },
  company:   { label: '🏢 Company Net Worth',  style: 'background:rgba(139,92,246,.12);color:var(--purple)', tagClass: 'tag-company',   badge: 'Company'   },
  planning:  { label: '📅 Financial Planning', style: 'background:rgba(59,130,246,.1);color:var(--blue)',    tagClass: 'tag-planning',  badge: 'Planning'  },
  strategy:  { label: '📐 Strategy',           style: 'background:rgba(168,85,247,.1);color:var(--purple)',  tagClass: 'tag-strategy',  badge: 'Strategy'  },
  mindset:   { label: '🧠 Mindset',            style: 'background:rgba(245,158,11,.1);color:var(--orange)',  tagClass: 'tag-mindset',   badge: 'Mindset'   },
};

// ── Blog HTML generator ───────────────────────────────────────────────────────
function generateBlogHTML(b) {
  const cat = CAT[b.category] || CAT.guide;
  const canonical = `https://worthscale.in/blog/${b.slug}`;
  const dateStr = b.date || isoDate();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateDisplay = new Date(y, m - 1, d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const sectionsHTML = (b.sections || []).filter(s => s.h2 || s.content).map(s => `\n      <h2>${esc(s.h2)}</h2>\n      ${s.content || ''}`).join('\n');
  const faqsHTML = (b.faqs || []).filter(f => f.q).map(f => `
        <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
          <div class="faq-q" itemprop="name">${esc(f.q)}</div>
          <div class="faq-a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><div itemprop="text">${esc(f.a)}</div></div>
        </div>`).join('');
  const disclaimerHTML = b.disclaimer ? `\n      <div class="disclaimer" style="margin-top:32px;padding:16px 20px;background:var(--bg2);border-radius:10px;font-size:.78rem;color:var(--muted);line-height:1.7"><strong>Disclaimer:</strong> ${esc(b.disclaimer)}</div>` : '';
  const faqJsonItems = (b.faqs || []).filter(f => f.q).map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="google-adsense-account" content="ca-pub-4837443132966026">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(b.metaTitle)} | WorthScale</title>
<meta name="description" content="${esc(b.metaDesc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(b.metaTitle)}">
<meta property="og:description" content="${esc(b.metaDesc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Article", "headline": b.h1 || b.metaTitle, "description": b.metaDesc, "author": { "@type": "Organization", "name": "WorthScale" }, "publisher": { "@type": "Organization", "name": "WorthScale" }, "datePublished": dateStr, "dateModified": dateStr, "mainEntityOfPage": canonical })}</script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqJsonItems })}</script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://worthscale.in/" }, { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://worthscale.in/blog" }, { "@type": "ListItem", "position": 3, "name": b.cardTitle || b.h1, "item": canonical }] })}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4837443132966026" crossorigin="anonymous"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-34VQNGQFDY"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-34VQNGQFDY');</script>
</head>
<body>
<nav class="site-nav"><div class="nav-inner">
  <a href="/" class="nav-logo">⚖️ WorthScale</a>
  <div class="nav-links">
    <a href="/">Home</a>
    <div class="nav-dropdown">
      <button class="nav-drop-trigger" onclick="event.stopPropagation();this.closest('.nav-dropdown').classList.toggle('open')">Tools &#9662;</button>
      <div class="nav-drop-menu">
        <a href="/net-worth-calculator">&#129518; Net Worth Calculator</a>
        <a href="/emergency-fund-calculator">&#128735; Emergency Fund Calculator</a>
        <a href="/house-down-payment-calculator">&#127968; Down Payment Calculator</a>
      </div>
    </div>
    <a href="/blog" class="active">Blog</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="/app" class="nav-cta">Open Dashboard</a>
  </div>
  <button class="nav-toggle" onclick="this.closest('.nav-inner').classList.toggle('open')">&#9776;</button>
</div></nav>
<main>
<div class="container-sm" style="padding:40px 0 60px">
  <div class="breadcrumbs"><a href="/">Home</a> › <a href="/blog">Blog</a> — ${esc(b.cardTitle || b.h1)}</div>
  <article>
    <div class="page-hero" style="padding-top:0">
      <span style="display:inline-block;${cat.style};font-size:.72rem;font-weight:700;text-transform:uppercase;padding:4px 10px;border-radius:5px;margin-bottom:12px">${cat.label}</span>
      <h1>${esc(b.h1)}</h1>
      <p style="font-size:.85rem;color:var(--muted);margin-top:8px">Updated ${dateDisplay} &middot; ${esc(b.readTime)}</p>
      ${b.intro ? `<p>${b.intro}</p>` : ''}
    </div>
    <div class="article-content">
      <div class="ad-wrap" style="text-align:center;padding:8px 0 20px">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-4837443132966026" data-ad-slot="7020661960" data-ad-format="auto" data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      </div>
${sectionsHTML}
      <ins class="adsbygoogle" style="display:block;text-align:center;" data-ad-layout="in-article" data-ad-format="fluid" data-ad-client="ca-pub-4837443132966026" data-ad-slot="1004776314"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      <h2>Frequently Asked Questions</h2>
      <div class="faq-accordion" itemscope itemtype="https://schema.org/FAQPage">
${faqsHTML}
      </div>
${disclaimerHTML}
    </div>
    <div class="cta-banner" style="margin-top:40px">
      <h3>Calculate your own net worth for free</h3>
      <p>Track assets, liabilities, and goals — built for Indian households.</p>
      <a href="/net-worth-calculator" class="btn btn-primary">Try Net Worth Calculator →</a>
    </div>
  </article>
</div>
</main>
<footer class="site-footer"><div class="footer-inner footer-grid">
  <div class="footer-about"><div class="footer-brand">⚖️ WorthScale</div><p class="footer-desc">Free personal finance platform for Indians.</p></div>
  <div class="footer-col"><h4>Free Tools</h4><a href="/net-worth-calculator">Net Worth Calculator</a><a href="/emergency-fund-calculator">Emergency Fund Calculator</a><a href="/house-down-payment-calculator">Down Payment Calculator</a></div>
  <div class="footer-col"><h4>Learn</h4><a href="/blog">All Articles</a></div>
  <div class="footer-col"><h4>Company</h4><a href="/about">About</a><a href="/contact">Contact Us</a><a href="/privacy-policy">Privacy Policy</a></div>
</div><div class="footer-bottom"><p>&copy; 2026 WorthScale. All rights reserved.</p></div></footer>
<script src="/nav.js"></script>
</body>
</html>`;
}

// ── Card HTML generator ───────────────────────────────────────────────────────
function generateCardHTML(b) {
  const cat = CAT[b.category] || CAT.guide;
  const iconHTML = b.iconType === 'image'
    ? `<img src="/assets/logos/${esc(b.icon)}" alt="${esc(b.cardTitle)} logo" loading="lazy" width="28" height="28">`
    : (b.icon || '📝');
  return `    <a href="/blog/${esc(b.slug)}" class="bc" data-cat="${esc(b.category)}">
      <div class="bc-top">
        <div class="bc-icon">${iconHTML}</div>
        <span class="bc-tag ${cat.tagClass}">${cat.badge}</span>
      </div>
      <h3>${esc(b.cardTitle)}</h3>
      <p>${esc(b.cardDesc)}</p>
      <div class="bc-foot">
        <span class="bc-meta">${esc(b.readTime)}</span>
        <span class="bc-read">Read →</span>
      </div>
    </a>`;
}

// ── Publish blog ──────────────────────────────────────────────────────────────
async function publishBlog(b) {
  const blogPath = `blog/${b.slug}.html`;
  const blogHTML = generateBlogHTML(b);
  const cardHTML = generateCardHTML(b);
  const meta = { slug: b.slug, category: b.category, icon: b.icon, iconType: b.iconType, cardTitle: b.cardTitle, cardDesc: b.cardDesc, readTime: b.readTime, date: b.date };
  if (DEV_MODE) {
    const fp = path.join(BLOG_DIR, b.slug + '.html');
    if (fs.existsSync(fp)) throw new Error(`Blog "${b.slug}" already exists`);
    fs.writeFileSync(fp, blogHTML, 'utf8');
    const idx = fs.readFileSync(BLOG_INDEX, 'utf8');
    if (!idx.includes(MARKER)) throw new Error('Marker not found in blog/index.html');
    fs.writeFileSync(BLOG_INDEX, idx.replace(MARKER, cardHTML + '\n\n    ' + MARKER), 'utf8');
    const blogs = fs.existsSync(BLOGS_JSON) ? JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')) : [];
    blogs.unshift(meta);
    fs.writeFileSync(BLOGS_JSON, JSON.stringify(blogs, null, 2), 'utf8');
    return;
  }
  const existing = await ghGetFile(blogPath);
  if (existing) throw new Error(`Blog "${b.slug}" already exists on GitHub`);
  await ghPutFile(blogPath, blogHTML, `blog: add ${b.slug}`);
  const idxFile = await ghGetFile('blog/index.html');
  if (!idxFile) throw new Error('blog/index.html not found on GitHub');
  const idxContent = Buffer.from(idxFile.content, 'base64').toString('utf8');
  if (!idxContent.includes(MARKER)) throw new Error(`Marker not found in blog/index.html`);
  await ghPutFile('blog/index.html', idxContent.replace(MARKER, cardHTML + '\n\n    ' + MARKER), `blog: add card for ${b.cardTitle}`, idxFile.sha);
  const dataFile = await ghGetFile('blogs-data.json');
  const blogs = dataFile ? JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8')) : [];
  blogs.unshift(meta);
  await ghPutFile('blogs-data.json', JSON.stringify(blogs, null, 2), `blog: update index`, dataFile?.sha);
}

// ── Load admin blogs ──────────────────────────────────────────────────────────
async function loadBlogs() {
  if (DEV_MODE) { try { return JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')); } catch { return []; } }
  const f = await ghGetFile('blogs-data.json');
  if (!f) return [];
  try { return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch { return []; }
}

// ── Parse cards from blog/index.html ─────────────────────────────────────────
function parseCardsFromIndex(indexContent) {
  const cards = {};
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim();
  for (const m of indexContent.matchAll(/<a([^>]+href="\/blog\/([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi)) {
    const inner = m[3];
    if (!inner.includes('<h3')) continue;
    const attrs = m[1], slug = m[2];
    const catM  = attrs.match(/data-cat="([^"]*)"/);
    const h3M   = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const pM    = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const metaM = inner.match(/<span class="bc-meta"[^>]*>([\s\S]*?)<\/span>/i);
    cards[slug] = { slug, cardTitle: h3M ? strip(h3M[1]) : slug, cardDesc: pM ? strip(pM[1]) : '', category: catM ? catM[1] : 'guide', readTime: metaM ? strip(metaM[1]) : '' };
  }
  return cards;
}

// ── Parse blog HTML → editable fields ────────────────────────────────────────
function parseBlogHTML(html, slug) {
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim();
  const m1 = re => { const x = html.match(re); return x ? x[1].trim() : ''; };
  const r = { slug, metaTitle: m1(/<title>([^<]+?)\s*\|\s*WorthScale<\/title>/i), metaDesc: m1(/<meta name="description" content="([^"]+)"/i), date: m1(/"datePublished":"([^"]+)"/), category: 'guide', icon: '📝', iconType: 'emoji', cardTitle: '', cardDesc: '', readTime: '8 min read', h1: '', intro: '', sections: [], faqs: [], disclaimer: '' };
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1M) r.h1 = strip(h1M[1]);
  const catLabelMap = { 'Finance Guide': 'guide', 'Celebrity Net Worth': 'celebrity', 'Company Net Worth': 'company', 'Financial Planning': 'planning', 'Strategy': 'strategy', 'Mindset': 'mindset' };
  const badgeM = html.match(/<span[^>]+border-radius:5px[^>]*>([^<]+)<\/span>/i);
  if (badgeM) { for (const [k, v] of Object.entries(catLabelMap)) { if (badgeM[1].includes(k)) { r.category = v; break; } } }
  const readM = html.match(/&middot;\s*([^<&]+?)\s*<\/p>/i);
  if (readM) r.readTime = readM[1].trim();
  const bcM = html.match(/Blog<\/a>[^<]*—\s*([\s\S]*?)\s*<\/div>/i);
  if (bcM) r.cardTitle = strip(bcM[1]);
  r.cardTitle = r.cardTitle || r.h1 || r.metaTitle;
  r.cardDesc = r.metaDesc;
  const introM = html.match(/&middot;[^<]+<\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<div class="article-content"/i);
  if (introM) r.intro = introM[1].trim();
  if (!r.date) r.date = isoDate();
  const contentM = html.match(/<div class="article-content">([\s\S]*?)(?:<div class="cta-banner"|<\/article>)/i);
  if (contentM) {
    let content = contentM[1].replace(/<div class="ad-wrap"[\s\S]*?<\/script>\s*<\/div>/gi, '').replace(/<ins\b[\s\S]*?<\/ins>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const part of content.split(/(?=<h2[\s>])/i)) {
      const h2M = part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (!h2M) continue;
      const heading = strip(h2M[1]), body = part.substring(h2M[0].length).trim(), hl = heading.toLowerCase();
      if (hl.includes('frequently asked') || hl === 'faq' || hl === 'faqs') {
        for (const fM of body.matchAll(/<div class="faq-q"[^>]*>([\s\S]*?)<\/div>[\s\S]*?itemprop="text"[^>]*>([\s\S]*?)<\/div>/gi))
          r.faqs.push({ q: strip(fM[1]), a: strip(fM[2]) });
      } else {
        r.sections.push({ h2: heading, content: body.replace(/<div class="disclaimer"[\s\S]*?<\/div>/gi, '').trim() });
      }
    }
    const disM = content.match(/<strong>Disclaimer:<\/strong>\s*([\s\S]*?)<\/div>/i);
    if (disM) r.disclaimer = strip(disM[1]);
  }
  if (!r.faqs.length) {
    for (const schM of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
      try { const schema = JSON.parse(schM[1]); if (schema['@type'] === 'FAQPage' && Array.isArray(schema.mainEntity)) { r.faqs = schema.mainEntity.map(item => ({ q: item.name || '', a: (item.acceptedAnswer && item.acceptedAnswer.text) || '' })).filter(f => f.q); break; } } catch { /**/ }
    }
  }
  return r;
}

// ── Card helpers ──────────────────────────────────────────────────────────────
function removeCardBySlug(indexContent, slug) {
  return indexContent.replace(new RegExp('[ \\t]*<a[^>]+href="/blog/' + escRegex(slug) + '"[\\s\\S]*?<\\/a>\\r?\\n?', ''), '');
}
function replaceCardBySlug(indexContent, slug, newCardHTML) {
  const re = new RegExp('[ \\t]*<a[^>]+href="/blog/' + escRegex(slug) + '"[\\s\\S]*?<\\/a>', '');
  if (re.test(indexContent)) return indexContent.replace(re, newCardHTML);
  if (indexContent.includes(MARKER)) return indexContent.replace(MARKER, newCardHTML + '\n\n    ' + MARKER);
  return indexContent;
}

// ── Delete blog ───────────────────────────────────────────────────────────────
async function deleteBlog(slug) {
  const blogPath = `blog/${slug}.html`;
  if (DEV_MODE) {
    const fp = path.join(BLOG_DIR, slug + '.html');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    if (fs.existsSync(BLOG_INDEX)) fs.writeFileSync(BLOG_INDEX, removeCardBySlug(fs.readFileSync(BLOG_INDEX, 'utf8'), slug), 'utf8');
    if (fs.existsSync(BLOGS_JSON)) { const bl = JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')); fs.writeFileSync(BLOGS_JSON, JSON.stringify(bl.filter(b => b.slug !== slug), null, 2), 'utf8'); }
    return;
  }
  const existing = await ghGetFile(blogPath);
  if (existing) { const r = await ghRequest('DELETE', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(blogPath)}`, { message: `blog: delete ${slug}`, sha: existing.sha }); if (r.status !== 200) throw new Error(`GitHub DELETE failed: HTTP ${r.status}`); }
  const idxFile = await ghGetFile('blog/index.html');
  if (idxFile) { const ic = Buffer.from(idxFile.content, 'base64').toString('utf8'); const upd = removeCardBySlug(ic, slug); if (upd !== ic) await ghPutFile('blog/index.html', upd, `blog: remove card for ${slug}`, idxFile.sha); }
  const dataFile = await ghGetFile('blogs-data.json');
  if (dataFile) { const bl = JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8')); const fl = bl.filter(b => b.slug !== slug); if (fl.length !== bl.length) await ghPutFile('blogs-data.json', JSON.stringify(fl, null, 2), `blog: remove ${slug} from index`, dataFile.sha); }
}

// ── Update blog ───────────────────────────────────────────────────────────────
async function updateBlog(b) {
  const blogPath = `blog/${b.slug}.html`;
  const blogHTML = generateBlogHTML(b);
  const cardHTML = generateCardHTML(b);
  const meta = { slug: b.slug, category: b.category, icon: b.icon, iconType: b.iconType, cardTitle: b.cardTitle, cardDesc: b.cardDesc, readTime: b.readTime, date: b.date };
  if (DEV_MODE) {
    fs.writeFileSync(path.join(BLOG_DIR, b.slug + '.html'), blogHTML, 'utf8');
    const idx = fs.readFileSync(BLOG_INDEX, 'utf8');
    fs.writeFileSync(BLOG_INDEX, replaceCardBySlug(idx, b.slug, cardHTML), 'utf8');
    const blogs = fs.existsSync(BLOGS_JSON) ? JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')) : [];
    const i = blogs.findIndex(x => x.slug === b.slug);
    if (i >= 0) blogs[i] = meta; else blogs.unshift(meta);
    fs.writeFileSync(BLOGS_JSON, JSON.stringify(blogs, null, 2), 'utf8');
    return;
  }
  const existing = await ghGetFile(blogPath);
  await ghPutFile(blogPath, blogHTML, `blog: update ${b.slug}`, existing ? existing.sha : undefined);
  const idxFile = await ghGetFile('blog/index.html');
  if (idxFile) { const ic = Buffer.from(idxFile.content, 'base64').toString('utf8'); await ghPutFile('blog/index.html', replaceCardBySlug(ic, b.slug, cardHTML), `blog: update card for ${b.cardTitle}`, idxFile.sha); }
  const dataFile = await ghGetFile('blogs-data.json');
  const blogs = dataFile ? JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8')) : [];
  const i = blogs.findIndex(x => x.slug === b.slug);
  if (i >= 0) blogs[i] = meta; else blogs.unshift(meta);
  await ghPutFile('blogs-data.json', JSON.stringify(blogs, null, 2), `blog: update index`, dataFile ? dataFile.sha : undefined);
}

// ── Word doc parser ───────────────────────────────────────────────────────────
function parseDocxContent(html) {
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim();
  const result = { slug: '', category: 'guide', icon: '', iconType: 'emoji', cardTitle: '', cardDesc: '', readTime: '8 min read', date: isoDate(), metaTitle: '', metaDesc: '', h1: '', intro: '', sections: [], faqs: [], disclaimer: '' };
  const h1Idx = html.search(/<h1[\s>]/i);
  if (h1Idx === -1) return { error: 'No Heading 1 found. In Word, apply "Heading 1" style to your article title.' };
  for (const m of html.substring(0, h1Idx).matchAll(/<p[^>]*>(.*?)<\/p>/gi)) {
    const text = strip(m[1]); const colon = text.indexOf(':'); if (colon < 1) continue;
    const key = text.substring(0, colon).trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = text.substring(colon + 1).trim();
    switch (key) {
      case 'slug': result.slug = slugify(val); break; case 'category': result.category = val.toLowerCase(); break;
      case 'icon': result.icon = val; break; case 'cardtitle': result.cardTitle = val; break;
      case 'carddesc': case 'carddescription': result.cardDesc = val; break; case 'readtime': result.readTime = val; break;
      case 'date': result.date = val; break; case 'metatitle': result.metaTitle = val; break;
      case 'metadesc': case 'metadescription': result.metaDesc = val; break;
    }
  }
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  result.h1 = strip(h1Match[1]);
  if (!result.slug)      result.slug      = slugify(result.h1);
  if (!result.cardTitle) result.cardTitle = result.h1;
  if (!result.metaTitle) result.metaTitle = result.h1;
  const afterH1 = html.substring(h1Idx + h1Match[0].length);
  const h2Parts = afterH1.split(/(?=<h2[\s>])/i);
  if (h2Parts[0]) result.intro = [...h2Parts[0].matchAll(/<p[^>]*>(.*?)<\/p>/gi)].map(m => strip(m[1])).filter(Boolean).join(' ');
  for (let i = 1; i < h2Parts.length; i++) {
    const part = h2Parts[i], h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (!h2Match) continue;
    const heading = strip(h2Match[1]), body = part.substring(h2Match[0].length).trim(), hl = heading.toLowerCase();
    if (hl.includes('frequently asked') || hl === 'faq' || hl === 'faqs') {
      const lines = body.replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
      let curQ = null;
      for (const line of lines) {
        if (/^q\s*[:.]/i.test(line)) curQ = line.replace(/^q\s*[:.]\s*/i, '').trim();
        else if (/^a\s*[:.]/i.test(line) && curQ) { result.faqs.push({ q: curQ, a: line.replace(/^a\s*[:.]\s*/i, '').trim() }); curQ = null; }
      }
    } else if (hl === 'disclaimer') {
      result.disclaimer = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else { result.sections.push({ h2: heading, content: body }); }
  }
  return result;
}

// ── Login page ────────────────────────────────────────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WorthScale Admin — Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fa;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .box{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px 36px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.07)}
  .logo{font-size:2rem;text-align:center;margin-bottom:6px}
  h1{font-size:1.2rem;font-weight:700;color:#1a1a2e;text-align:center;margin-bottom:4px}
  p{font-size:.82rem;color:#9ca3af;text-align:center;margin-bottom:28px}
  label{display:block;font-size:.82rem;font-weight:600;color:#374151;margin-bottom:5px}
  input{width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.9rem;font-family:inherit;color:#1a1a2e;margin-bottom:16px}
  input:focus{outline:none;border-color:#6366f1}
  button{width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit}
  button:hover{background:#4f46e5}
  .err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:.82rem;margin-bottom:16px;display:none}
</style>
</head>
<body>
<div class="box">
  <div class="logo">⚖️</div>
  <h1>WorthScale Admin</h1>
  <p>Enter your admin password to continue</p>
  <div class="err" id="err">Incorrect password. Try again.</div>
  <form id="f">
    <label>Password</label>
    <input type="password" id="pw" placeholder="••••••••" autofocus>
    <button type="submit">Sign In →</button>
  </form>
</div>
<script>
document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.textContent = 'Signing in...'; btn.disabled = true;
  const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password: document.getElementById('pw').value }) });
  if (res.ok) { window.location.href = '/'; } else { document.getElementById('err').style.display = 'block'; btn.textContent = 'Sign In →'; btn.disabled = false; }
});
</script>
</body>
</html>`;

// ── Admin UI — sidebar layout ─────────────────────────────────────────────────
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WorthScale Blog Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e;background:#f0f2f5;height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* ── Header ── */
.hdr{background:#1a1a2e;color:#fff;padding:0 24px;height:54px;display:flex;align-items:center;gap:12px;flex-shrink:0;box-shadow:0 1px 0 rgba(255,255,255,.08)}
.hdr-logo{display:flex;align-items:center;gap:8px;font-size:1rem;font-weight:800;letter-spacing:-.01em}
.hdr-logo span{font-size:1.4rem}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:14px}
.hdr a{color:#a5b4fc;font-size:.82rem;text-decoration:none;transition:color .15s}
.hdr a:hover{color:#fff}
.mode-pill{font-size:.65rem;font-weight:700;padding:3px 9px;border-radius:999px;background:${DEV_MODE ? 'rgba(245,158,11,.18)' : 'rgba(34,197,94,.18)'};color:${DEV_MODE ? '#fbbf24' : '#4ade80'};letter-spacing:.04em}

/* ── Layout ── */
.layout{display:flex;flex:1;overflow:hidden}

/* ── Sidebar ── */
.sidebar{width:230px;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;flex-shrink:0;overflow-y:auto}
.sb-section{padding:14px 16px 6px;font-size:.6rem;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 18px;font-size:.855rem;font-weight:600;color:#6b7280;cursor:pointer;border-left:3px solid transparent;transition:all .15s;user-select:none;position:relative}
.nav-item:hover{background:#f9fafb;color:#374151}
.nav-item.active{background:#eff6ff;color:#6366f1;border-left-color:#6366f1}
.nav-icon{font-size:.95rem;width:20px;text-align:center;flex-shrink:0}
.nav-badge{margin-left:auto;font-size:.63rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#9ca3af;min-width:24px;text-align:center}
.nav-item.active .nav-badge{background:rgba(99,102,241,.15);color:#6366f1}
.edit-pill{margin:6px 12px 10px;padding:9px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:.73rem;color:#1d4ed8;font-weight:600;line-height:1.4;display:none}
.edit-pill .pill-slug{font-family:monospace;font-size:.72rem;color:#3b82f6;display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-footer{margin-top:auto;padding:12px;border-top:1px solid #f3f4f6}
.sb-link{display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:.8rem;color:#9ca3af;text-decoration:none;border-radius:7px;transition:all .15s;font-weight:500}
.sb-link:hover{background:#f9fafb;color:#6b7280}

/* ── Main content ── */
.main{flex:1;overflow-y:auto;padding:28px 32px 60px;background:#f0f2f5}
.panel{display:none}.panel.active{display:block}

/* ── Page heading ── */
.pg-hd{margin-bottom:20px}
.pg-hd h2{font-size:1.25rem;font-weight:800;color:#1a1a2e;margin-bottom:3px}
.pg-hd p{font-size:.83rem;color:#9ca3af}

/* ── Cards ── */
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.card-hd{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:8px}

/* ── Form ── */
label{display:block;font-size:.82rem;font-weight:600;color:#374151;margin-bottom:5px}
label span{font-weight:400;color:#9ca3af;margin-left:4px}
input[type=text],input[type=date],select,textarea{width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.875rem;font-family:inherit;color:#1a1a2e;background:#fff;transition:border-color .15s;resize:vertical}
input[type=text]:focus,input[type=date]:focus,select:focus,textarea:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.08)}
input[readonly]{background:#f9fafb!important;color:#6b7280;cursor:not-allowed}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.field{margin-bottom:14px}
.char-count{font-size:.72rem;color:#9ca3af;text-align:right;margin-top:3px}
.char-count.warn{color:#ef4444}
.divider{height:1px;background:#f3f4f6;margin:6px 0 18px}
.sec-lbl{font-size:.7rem;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.slug-tip{font-size:.72rem;color:#9ca3af;margin-top:3px}

/* Icon toggle */
.icon-toggle{display:flex;margin-bottom:8px}
.icon-toggle button{flex:1;padding:7px;font-size:.78rem;font-weight:600;border:1.5px solid #e5e7eb;background:#f9fafb;cursor:pointer;transition:all .15s;font-family:inherit}
.icon-toggle button:first-child{border-radius:6px 0 0 6px}
.icon-toggle button:last-child{border-radius:0 6px 6px 0;border-left:none}
.icon-toggle button.active{background:#6366f1;color:#fff;border-color:#6366f1}

/* Dynamic items */
.dyn-item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:10px;position:relative}
.dyn-item h4{font-size:.7rem;font-weight:800;color:#9ca3af;margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em}
.btn-rm{position:absolute;top:12px;right:12px;background:none;border:none;color:#ef4444;cursor:pointer;font-size:.9rem;padding:3px 7px;border-radius:4px;font-family:inherit}
.btn-rm:hover{background:#fef2f2}
.btn-add{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:.8rem;font-weight:600;color:#6366f1;background:rgba(99,102,241,.07);border:1.5px dashed #c7d2fe;border-radius:8px;cursor:pointer;font-family:inherit;margin-top:4px;transition:all .15s}
.btn-add:hover{background:rgba(99,102,241,.12)}

/* Submit row */
.sub-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:22px;padding-top:18px;border-top:1px solid #f3f4f6}
.btn-pub{padding:11px 26px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s}
.btn-pub:hover{background:#4f46e5}
.btn-pub:disabled{background:#a5b4fc;cursor:not-allowed}
.btn-sec{padding:10px 20px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
.btn-sec:hover{background:#f9fafb}

/* Toast */
#toast{display:none;padding:13px 18px;border-radius:10px;font-size:.875rem;font-weight:500;margin-top:14px;line-height:1.5}
#toast.ok{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
#toast.err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
#toast a{color:inherit;font-weight:700}

/* Edit banner */
.edit-banner{background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:10px 16px;font-size:.855rem;font-weight:600;color:#1d4ed8;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.edit-status{padding:10px 14px;background:#f3f4f6;border-radius:8px;font-size:.83rem;color:#6b7280;margin-bottom:12px}

/* Blog table */
.tbl-bar{display:flex;gap:10px;margin-bottom:14px}
.tbl-bar input{flex:1;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.875rem;font-family:inherit;color:#1a1a2e;background:#fff}
.tbl-bar input:focus{outline:none;border-color:#6366f1}
.btn-ref{padding:8px 16px;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;color:#374151;white-space:nowrap}
.btn-ref:hover{background:#f9fafb}
.tbl{width:100%;border-collapse:collapse;font-size:.82rem}
.tbl th{text-align:left;padding:9px 12px;border-bottom:2px solid #e5e7eb;color:#9ca3af;font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.tbl td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
.tbl tr:hover td{background:#fafbfc}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.62rem;font-weight:700;text-transform:uppercase;white-space:nowrap}
.tag-guide{background:rgba(34,197,94,.1);color:#15803d}
.tag-celebrity{background:rgba(245,158,11,.12);color:#b45309}
.tag-company{background:rgba(139,92,246,.12);color:#7c3aed}
.tag-planning{background:rgba(59,130,246,.1);color:#1d4ed8}
.tag-strategy{background:rgba(168,85,247,.1);color:#7c3aed}
.tag-mindset{background:rgba(245,158,11,.1);color:#b45309}
.btn-ed{padding:4px 10px;font-size:.72rem;font-weight:600;border:1.5px solid #c7d2fe;background:rgba(99,102,241,.07);color:#6366f1;border-radius:6px;cursor:pointer;font-family:inherit;margin-right:4px;transition:all .15s}
.btn-ed:hover{background:rgba(99,102,241,.18)}
.btn-dl{padding:4px 10px;font-size:.72rem;font-weight:600;border:1.5px solid #fca5a5;background:rgba(239,68,68,.05);color:#ef4444;border-radius:6px;cursor:pointer;font-family:inherit;transition:all .15s}
.btn-dl:hover{background:rgba(239,68,68,.12)}
.btn-dl:disabled,.btn-ed:disabled{opacity:.45;cursor:not-allowed}
.empty{color:#9ca3af;font-size:.83rem;font-style:italic;padding:8px 0;display:block}

/* Upload zone */
.upload-zone{border:2px dashed #c7d2fe;border-radius:12px;padding:26px 20px;text-align:center;cursor:pointer;transition:all .18s;background:rgba(99,102,241,.02)}
.upload-zone:hover,.upload-zone.drag{border-color:#6366f1;background:rgba(99,102,241,.07)}
.uz-icon{font-size:1.8rem;margin-bottom:8px}
.upload-zone strong{display:block;font-size:.875rem;color:#374151;margin-bottom:4px}
.upload-zone small{color:#9ca3af;font-size:.76rem;line-height:1.6}
.ps{padding:10px 14px;border-radius:8px;font-size:.84rem;font-weight:500;margin:10px 0 4px;display:none}
.ps-ok{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;display:block}
.ps-err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;display:block}
.ps-load{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;display:block}
.fmt-hint{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:.76rem;color:#92400e;line-height:1.8;margin-top:14px}
.fmt-hint strong{color:#78350f}

@media(max-width:680px){.sidebar{display:none}.row,.row3{grid-template-columns:1fr}.main{padding:16px 14px}}
</style>
</head>
<body>

<!-- HEADER -->
<div class="hdr">
  <div class="hdr-logo"><span>⚖️</span> WorthScale Admin</div>
  <div class="hdr-right">
    <span class="mode-pill">${DEV_MODE ? 'LOCAL MODE' : 'LIVE → GitHub'}</span>
    <a href="https://worthscale.in" target="_blank">↗ View Site</a>
    <a href="/logout" style="color:#f87171">Sign out</a>
  </div>
</div>

<div class="layout">

  <!-- SIDEBAR -->
  <nav class="sidebar">
    <div class="sb-section">Menu</div>

    <div class="nav-item active" data-panel="blogs" onclick="showPanel('blogs')">
      <span class="nav-icon">📋</span>
      All Blogs
      <span class="nav-badge" id="sbCount">—</span>
    </div>

    <div class="nav-item" data-panel="new" onclick="goNew()">
      <span class="nav-icon" id="navNewIcon">➕</span>
      <span id="navNewLabel">New Blog</span>
    </div>

    <div class="edit-pill" id="editPill">
      ✏️ Editing blog
      <span class="pill-slug" id="editPillSlug"></span>
    </div>

    <div class="sb-footer">
      <a href="https://worthscale.in/blog" target="_blank" class="sb-link">🌐 View Blog</a>
      <a href="/logout" class="sb-link" style="color:#ef4444">🚪 Sign Out</a>
    </div>
  </nav>

  <!-- MAIN CONTENT -->
  <main class="main">

    <!-- PANEL: ALL BLOGS -->
    <div class="panel active" id="panel-blogs">
      <div class="pg-hd">
        <h2>All Blog Posts</h2>
        <p>Browse, edit, or delete any post. Click ✏️ Edit to open a post in the editor.</p>
      </div>
      <div class="card">
        <div class="tbl-bar">
          <input type="text" id="blogSearch" placeholder="Search by title or slug…" oninput="filterBlogs(this.value)">
          <button class="btn-ref" onclick="loadAllBlogs()">↺ Refresh</button>
        </div>
        <div id="blogList"><span class="empty">Loading…</span></div>
      </div>
    </div>

    <!-- PANEL: NEW / EDIT BLOG -->
    <div class="panel" id="panel-new">
      <div class="pg-hd">
        <h2 id="frmTitle">New Blog Post</h2>
        <p id="frmSub">Upload a Word document or fill the fields manually.</p>
      </div>

      <div class="edit-banner" id="editBanner" style="display:none">
        ✏️ <span id="editBannerTxt">Editing blog</span>
        <span style="margin-left:auto;font-size:.74rem;font-weight:400;color:#60a5fa">Slug is locked during edit</span>
      </div>
      <div class="edit-status" id="editStatus" style="display:none"></div>

      <!-- Upload Word doc -->
      <div class="card">
        <div class="card-hd">📄 Upload Word Document <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.78rem;color:#9ca3af">— auto-fills all fields below</span></div>
        <div class="upload-zone" id="uploadZone"
             onclick="document.getElementById('docxIn').click()"
             ondragover="event.preventDefault();this.classList.add('drag')"
             ondragleave="this.classList.remove('drag')"
             ondrop="handleDrop(event)">
          <div class="uz-icon">📄</div>
          <strong>Drop .docx here, or click to browse</strong>
          <small>Heading 1 = article title &nbsp;·&nbsp; Heading 2 = sections<br>"Frequently Asked Questions" section → Q: / A: pairs</small>
        </div>
        <input type="file" id="docxIn" accept=".docx" style="display:none" onchange="handleFile(this.files[0])">
        <div class="ps" id="parseStatus"></div>
        <div class="fmt-hint">
          <strong>First lines of your Word doc (before Heading 1):</strong><br>
          Meta Title: Full SEO title &nbsp;·&nbsp; Meta Description: 1–2 sentence Google summary<br>
          Slug: your-url-slug &nbsp;·&nbsp; Category: celebrity &nbsp;·&nbsp; Icon: ⭐ &nbsp;·&nbsp; Read Time: 8 min read<br>
          Card Title: Short blog index title &nbsp;·&nbsp; Card Description: One-line teaser
        </div>
      </div>

      <!-- Blog fields -->
      <div class="card">
        <div class="card-hd">📝 Blog Details</div>

        <div class="row">
          <div class="field">
            <label>URL Slug <span>* locked while editing</span></label>
            <input type="text" id="slug" placeholder="elon-musk-net-worth">
            <div class="slug-tip">/blog/<span id="slugPrv">…</span></div>
          </div>
          <div class="field">
            <label>Category <span>*</span></label>
            <select id="category">
              <option value="guide">📚 Finance Guide</option>
              <option value="celebrity">⭐ Celebrity Net Worth</option>
              <option value="company">🏢 Company Net Worth</option>
              <option value="planning">📅 Financial Planning</option>
              <option value="strategy">📐 Strategy</option>
              <option value="mindset">🧠 Mindset</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Icon</label>
          <div class="icon-toggle">
            <button type="button" class="active" onclick="setIT('emoji')">😀 Emoji</button>
            <button type="button" onclick="setIT('image')">🖼 Logo Image</button>
          </div>
          <input type="text" id="iconEmoji" placeholder="e.g. ⭐ 🏢 💰">
          <input type="text" id="iconImage" placeholder="Filename in /assets/logos/ e.g. elon.png" style="display:none;margin-top:6px">
        </div>

        <div class="row">
          <div class="field">
            <label>Card Title <span>* shown on blog index</span></label>
            <input type="text" id="cardTitle" placeholder="Elon Musk Net Worth 2026: ₹17 Lakh Crore" oninput="autoSlug(this.value)">
          </div>
          <div class="field">
            <label>Card Description <span>* 1–2 lines</span></label>
            <input type="text" id="cardDesc" placeholder="Tesla, SpaceX, X — how \\$213B was built.">
          </div>
        </div>

        <div class="row3">
          <div class="field">
            <label>Read Time</label>
            <input type="text" id="readTime" value="8 min read">
          </div>
          <div class="field">
            <label>Date Published</label>
            <input type="date" id="date">
          </div>
          <div></div>
        </div>

        <div class="divider"></div>
        <div class="sec-lbl">SEO Metadata</div>

        <div class="field">
          <label>Meta Title <span>* shown in Google</span></label>
          <input type="text" id="metaTitle" placeholder="Elon Musk Net Worth: Inside the \\$213 Billion Empire" oninput="cc('metaTitle','mtc',60)">
          <div class="char-count" id="mtc">0 / 60 chars</div>
        </div>
        <div class="field">
          <label>Meta Description <span>* shown under title in Google</span></label>
          <textarea id="metaDesc" rows="2" placeholder="Elon Musk's net worth is \\$213B as of 2026. Tesla, SpaceX, X — the full breakdown." oninput="cc('metaDesc','mdc',160)"></textarea>
          <div class="char-count" id="mdc">0 / 160 chars</div>
        </div>

        <div class="divider"></div>
        <div class="sec-lbl">Article Content</div>

        <div class="field">
          <label>H1 Heading <span>*</span></label>
          <input type="text" id="h1" placeholder="Elon Musk Net Worth in 2026: Inside the \\$213 Billion Empire">
        </div>
        <div class="field">
          <label>Intro Paragraph <span>HTML allowed</span></label>
          <textarea id="intro" rows="3" placeholder="Elon Musk is the world's richest person…"></textarea>
        </div>

        <div class="divider"></div>
        <div class="sec-lbl">Sections <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#9ca3af;font-size:.78rem">H2 heading + HTML content</span></div>
        <div id="sections"></div>
        <button class="btn-add" onclick="addSection()">+ Add Section</button>

        <div class="divider" style="margin-top:18px"></div>
        <div class="sec-lbl">FAQs</div>
        <div id="faqs"></div>
        <button class="btn-add" onclick="addFaq()">+ Add FAQ</button>

        <div class="divider" style="margin-top:18px"></div>
        <div class="field">
          <label>Disclaimer <span>optional</span></label>
          <textarea id="disclaimer" rows="2" placeholder="All figures are based on publicly available data…"></textarea>
        </div>

        <div class="sub-row">
          <button class="btn-pub" id="submitBtn" onclick="submitBlog()">Publish Blog Post</button>
          <button class="btn-sec" id="cancelBtn" onclick="cancelEdit()" style="display:none">Cancel Edit</button>
          <span id="submitHint" style="font-size:.8rem;color:#9ca3af">${DEV_MODE ? 'Writes HTML to disk locally' : 'Commits to GitHub → Vercel redeploys in ~30s'}</span>
        </div>
        <div id="toast"></div>
      </div>
    </div>

  </main>
</div>

<script>
var SC = 0, FC = 0, IT = 'emoji';
var editMode = false, editSlug = '';
var allCache = [];
var LIVE = ${!DEV_MODE};
var H_PUB = '${DEV_MODE ? 'Writes HTML to disk locally' : 'Commits to GitHub → Vercel redeploys in ~30s'}';
var H_UPD = '${DEV_MODE ? 'Overwrites local file' : 'Overwrites on GitHub → Vercel redeploys in ~30s'}';

document.getElementById('date').value = new Date().toISOString().split('T')[0];

// ── Panel switching ───────────────────────────────────────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(function(el){ el.classList.remove('active'); });
  var p = document.getElementById('panel-' + name); if(p) p.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.toggle('active', el.dataset.panel === name); });
  if (name === 'blogs') loadAllBlogs();
}

function goNew() {
  if (editMode) { showPanel('new'); return; }
  resetForm(); showPanel('new');
}

// ── Form helpers ──────────────────────────────────────────────────────────────
function setIT(t) {
  IT = t;
  var b = document.querySelectorAll('.icon-toggle button');
  b[0].classList.toggle('active', t==='emoji'); b[1].classList.toggle('active', t==='image');
  document.getElementById('iconEmoji').style.display = t==='emoji' ? '' : 'none';
  document.getElementById('iconImage').style.display = t==='image' ? '' : 'none';
}

function autoSlug(v) {
  if (editMode) return;
  var s = v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  document.getElementById('slug').value = s;
  document.getElementById('slugPrv').textContent = s || '…';
}

function cc(fid, cid, max) {
  var len = document.getElementById(fid).value.length;
  var el = document.getElementById(cid);
  el.textContent = len + ' / ' + max + ' chars';
  el.classList.toggle('warn', len > max);
}

function addSection() {
  var i = SC++;
  var div = document.createElement('div');
  div.className = 'dyn-item'; div.id = 'sec-' + i;
  div.innerHTML = '<h4>Section ' + (i+1) + '</h4>' +
    '<button class="btn-rm" onclick="this.closest(\\'.dyn-item\\').remove()">✕</button>' +
    '<div class="field"><label>H2 Heading</label><input type="text" id="sh_'+i+'" placeholder="The Numbers in 2026"></div>' +
    '<div class="field"><label>Content <span>HTML allowed</span></label><textarea id="sc_'+i+'" rows="6" placeholder="&lt;p&gt;…&lt;/p&gt;"></textarea></div>';
  document.getElementById('sections').appendChild(div);
}

function addFaq() {
  var i = FC++;
  var div = document.createElement('div');
  div.className = 'dyn-item'; div.id = 'faq-' + i;
  div.innerHTML = '<h4>FAQ ' + (i+1) + '</h4>' +
    '<button class="btn-rm" onclick="this.closest(\\'.dyn-item\\').remove()">✕</button>' +
    '<div class="field"><label>Question</label><input type="text" id="fq_'+i+'" placeholder="What is the net worth?"></div>' +
    '<div class="field"><label>Answer</label><textarea id="fa_'+i+'" rows="3"></textarea></div>';
  document.getElementById('faqs').appendChild(div);
}

function getSections() {
  return Array.from(document.querySelectorAll('[id^="sec-"]')).map(function(el){
    var i=el.id.replace('sec-',''); return { h2:(document.getElementById('sh_'+i)||{value:''}).value, content:(document.getElementById('sc_'+i)||{value:''}).value };
  }).filter(function(s){ return s.h2||s.content; });
}

function getFaqs() {
  return Array.from(document.querySelectorAll('[id^="faq-"]')).map(function(el){
    var i=el.id.replace('faq-',''); return { q:((document.getElementById('fq_'+i)||{}).value||'').trim(), a:((document.getElementById('fa_'+i)||{}).value||'').trim() };
  }).filter(function(f){ return f.q; });
}

function toast(msg, type) {
  var t=document.getElementById('toast'); t.innerHTML=msg; t.className=type; t.style.display='block';
  if(type==='ok') setTimeout(function(){ t.style.display='none'; }, 18000);
}

function eh(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function v(id){ return document.getElementById(id).value.trim(); }

// ── Blog table ────────────────────────────────────────────────────────────────
function renderTable(list) {
  var el = document.getElementById('blogList');
  if (!list.length) { el.innerHTML='<span class="empty">No blogs found.</span>'; return; }
  var base = LIVE ? 'https://worthscale.in' : 'http://localhost:3000';
  el.innerHTML = '<table class="tbl"><thead><tr><th>Title / Slug</th><th>Category</th><th>Date</th><th style="text-align:right">Actions</th></tr></thead><tbody>' +
    list.map(function(b){
      var title = (b.cardTitle && b.cardTitle !== b.slug) ? b.cardTitle : b.slug;
      return '<tr>' +
        '<td><a href="'+base+'/blog/'+eh(b.slug)+'" target="_blank" style="color:#6366f1;text-decoration:none;font-weight:600">'+eh(title)+'</a>' +
        '<div style="font-size:.68rem;color:#9ca3af;font-family:monospace;margin-top:1px">'+eh(b.slug)+'</div></td>' +
        '<td><span class="tag tag-'+eh(b.category||'guide')+'">'+eh(b.category||'—')+'</span></td>' +
        '<td style="font-size:.78rem;color:#9ca3af;white-space:nowrap">'+eh(b.date||'')+'</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
        '<button class="btn-ed" data-slug="'+eh(b.slug)+'" onclick="editBlog(this.dataset.slug)">✏️ Edit</button>' +
        '<button class="btn-dl" data-slug="'+eh(b.slug)+'" data-title="'+eh(title)+'" onclick="delBlog(this.dataset.slug,this.dataset.title)">🗑 Delete</button>' +
        '</td></tr>';
    }).join('') + '</tbody></table>';
}

async function loadAllBlogs() {
  var el=document.getElementById('blogList'), cnt=document.getElementById('sbCount');
  el.innerHTML='<span class="empty">Loading…</span>';
  try {
    var res=await fetch('/api/all-blogs'); allCache=await res.json();
    if(cnt) cnt.textContent=allCache.length;
    var s=document.getElementById('blogSearch').value.trim().toLowerCase();
    renderTable(s ? allCache.filter(function(b){ return (b.cardTitle||b.slug).toLowerCase().includes(s)||b.slug.toLowerCase().includes(s); }) : allCache);
  } catch(e){ el.innerHTML='<span class="empty">Error: '+eh(e.message)+'</span>'; }
}

function filterBlogs(s) {
  s=s.toLowerCase();
  renderTable(s ? allCache.filter(function(b){ return (b.cardTitle||b.slug).toLowerCase().includes(s)||b.slug.toLowerCase().includes(s); }) : allCache);
}

// ── Edit ──────────────────────────────────────────────────────────────────────
async function editBlog(slug) {
  showPanel('new');
  var st=document.getElementById('editStatus');
  st.style.display='block'; st.textContent='Loading '+slug+'…';

  try {
    var res=await fetch('/api/blog-content?slug='+encodeURIComponent(slug));
    if(!res.ok){ st.textContent='Error loading (HTTP '+res.status+')'; return; }
    var d=await res.json();
    if(d.error){ st.textContent='Error: '+d.error; return; }

    fillForm(d);
    editMode=true; editSlug=slug;
    document.getElementById('slug').readOnly=true;
    document.getElementById('editBanner').style.display='flex';
    document.getElementById('editBannerTxt').textContent='Editing: '+slug;
    document.getElementById('frmTitle').textContent='Edit Blog Post';
    document.getElementById('frmSub').textContent='Fields pre-filled. Review and click Update.';
    document.getElementById('submitBtn').textContent='Update Blog Post';
    document.getElementById('cancelBtn').style.display='';
    document.getElementById('submitHint').textContent=H_UPD;
    document.getElementById('navNewIcon').textContent='✏️';
    document.getElementById('navNewLabel').textContent='Edit Blog';
    document.getElementById('editPill').style.display='block';
    document.getElementById('editPillSlug').textContent=slug;
    st.style.display='none';
  } catch(e){ st.textContent='Error: '+e.message; }
}

function cancelEdit() {
  editMode=false; editSlug='';
  document.getElementById('slug').readOnly=false;
  document.getElementById('editBanner').style.display='none';
  document.getElementById('editStatus').style.display='none';
  document.getElementById('frmTitle').textContent='New Blog Post';
  document.getElementById('frmSub').textContent='Upload a Word document or fill the fields manually.';
  document.getElementById('submitBtn').textContent='Publish Blog Post';
  document.getElementById('cancelBtn').style.display='none';
  document.getElementById('submitHint').textContent=H_PUB;
  document.getElementById('navNewIcon').textContent='➕';
  document.getElementById('navNewLabel').textContent='New Blog';
  document.getElementById('editPill').style.display='none';
  resetForm();
  showPanel('blogs');
}

async function delBlog(slug, title) {
  if(!confirm('Delete "'+title+'"?\\n\\nThis permanently removes the blog and its card from the index.')) return;
  var btn=document.querySelector('.btn-dl[data-slug="'+slug+'"]');
  if(btn){ btn.textContent='⏳'; btn.disabled=true; }
  try {
    var res=await fetch('/api/blog?slug='+encodeURIComponent(slug), { method:'DELETE' });
    var d=await res.json();
    if(res.ok){ toast('✅ Deleted "'+eh(title)+'"'+(LIVE?' — committed to GitHub.':'.'), 'ok'); if(editSlug===slug) cancelEdit(); loadAllBlogs(); }
    else { toast('Error: '+eh(d.error||'Unknown'), 'err'); if(btn){ btn.textContent='🗑 Delete'; btn.disabled=false; } }
  } catch(e){ toast('Network error: '+eh(e.message), 'err'); if(btn){ btn.textContent='🗑 Delete'; btn.disabled=false; } }
}

// ── Submit ────────────────────────────────────────────────────────────────────
function buildPayload() {
  return { slug: editMode ? editSlug : v('slug'), category: document.getElementById('category').value,
    iconType:IT, icon: IT==='emoji' ? v('iconEmoji') : v('iconImage'),
    cardTitle:v('cardTitle'), cardDesc:v('cardDesc'), readTime:v('readTime')||'8 min read',
    date:v('date')||new Date().toISOString().split('T')[0], metaTitle:v('metaTitle'), metaDesc:v('metaDesc'),
    h1:v('h1'), intro:document.getElementById('intro').value.trim(),
    disclaimer:v('disclaimer'), sections:getSections(), faqs:getFaqs() };
}

async function submitBlog() { editMode ? await doUpdate() : await doPublish(); }

async function doPublish() {
  var btn=document.getElementById('submitBtn'), pl=buildPayload();
  var miss=['slug','cardTitle','cardDesc','metaTitle','metaDesc','h1'].filter(function(k){ return !pl[k]; });
  if(miss.length){ toast('Please fill in: '+miss.join(', '),'err'); return; }
  btn.disabled=true; btn.textContent=LIVE?'Committing…':'Publishing…';
  try {
    var res=await fetch('/api/blog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pl)});
    var d=await res.json();
    if(res.ok){ var u=(LIVE?'https://worthscale.in':'http://localhost:3000')+'/blog/'+pl.slug; toast((LIVE?'✅ Committed! Vercel redeploys in ~30s.<br>':'✅ Published!<br>')+'<a href="'+u+'" target="_blank">View post →</a>','ok'); resetForm(); showPanel('blogs'); }
    else toast('Error: '+eh(d.error||'Unknown'),'err');
  } catch(e){ toast('Network error: '+eh(e.message),'err'); }
  btn.disabled=false; btn.textContent='Publish Blog Post';
}

async function doUpdate() {
  var btn=document.getElementById('submitBtn'), pl=buildPayload();
  var miss=['cardTitle','cardDesc','metaTitle','metaDesc','h1'].filter(function(k){ return !pl[k]; });
  if(miss.length){ toast('Please fill in: '+miss.join(', '),'err'); return; }
  btn.disabled=true; btn.textContent=LIVE?'Updating on GitHub…':'Updating…';
  try {
    var res=await fetch('/api/blog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(pl)});
    var d=await res.json();
    if(res.ok){ var u=(LIVE?'https://worthscale.in':'http://localhost:3000')+'/blog/'+pl.slug; toast((LIVE?'✅ Updated! Vercel redeploys in ~30s.<br>':'✅ Updated!<br>')+'<a href="'+u+'" target="_blank">View post →</a>','ok'); cancelEdit(); }
    else toast('Error: '+eh(d.error||'Unknown'),'err');
  } catch(e){ toast('Network error: '+eh(e.message),'err'); }
  btn.disabled=false; btn.textContent='Update Blog Post';
}

function resetForm() {
  ['slug','cardTitle','cardDesc','metaTitle','metaDesc','h1','intro','disclaimer','iconEmoji','iconImage'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('slugPrv').textContent='…';
  document.getElementById('category').selectedIndex=0;
  document.getElementById('date').value=new Date().toISOString().split('T')[0];
  document.getElementById('readTime').value='8 min read';
  document.getElementById('sections').innerHTML='';
  document.getElementById('faqs').innerHTML='';
  document.getElementById('mtc').textContent='0 / 60 chars';
  document.getElementById('mdc').textContent='0 / 160 chars';
  document.getElementById('toast').style.display='none';
  document.getElementById('parseStatus').className='ps';
  SC=0; FC=0; addSection(); addFaq();
}

// ── Word doc upload ───────────────────────────────────────────────────────────
function handleDrop(e){ e.preventDefault(); document.getElementById('uploadZone').classList.remove('drag'); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }

function setParse(msg, type){ var el=document.getElementById('parseStatus'); el.textContent=msg; el.className='ps '+(type==='ok'?'ps-ok':type==='err'?'ps-err':'ps-load'); }

function handleFile(file) {
  if(!file) return;
  if(!file.name.toLowerCase().endsWith('.docx')){ setParse('Please select a .docx (Word) file.','err'); return; }
  setParse('Reading '+file.name+'…','loading');
  var rdr=new FileReader();
  rdr.onload=async function(e){
    var b64=e.target.result.split(',')[1];
    try {
      var res=await fetch('/api/parse-docx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:b64,name:file.name})});
      var d=await res.json();
      if(!res.ok||d.error){ setParse('Error: '+(d.error||'Could not parse'),'err'); return; }
      fillForm(d); setParse('✅ Parsed! Review fields and click Publish.','ok');
    } catch(err){ setParse('Network error: '+err.message,'err'); }
  };
  rdr.readAsDataURL(file);
}

function fillForm(d) {
  var s=function(id,val){ var el=document.getElementById(id); if(el&&val!=null) el.value=val; };
  s('slug',d.slug); s('cardTitle',d.cardTitle); s('cardDesc',d.cardDesc);
  s('readTime',d.readTime); s('date',d.date); s('metaTitle',d.metaTitle);
  s('metaDesc',d.metaDesc); s('h1',d.h1); s('intro',d.intro); s('disclaimer',d.disclaimer);
  document.getElementById('slugPrv').textContent=d.slug||'…';
  if(d.category) document.getElementById('category').value=d.category;
  if(d.icon){ document.getElementById('iconEmoji').value=d.icon; setIT(d.iconType||'emoji'); }
  document.getElementById('sections').innerHTML=''; SC=0;
  (d.sections||[]).forEach(function(sec){ addSection(); var i=SC-1; var h=document.getElementById('sh_'+i),c=document.getElementById('sc_'+i); if(h)h.value=sec.h2||''; if(c)c.value=sec.content||''; });
  if(!(d.sections||[]).length) addSection();
  document.getElementById('faqs').innerHTML=''; FC=0;
  (d.faqs||[]).forEach(function(f){ addFaq(); var i=FC-1; var q=document.getElementById('fq_'+i),a=document.getElementById('fa_'+i); if(q)q.value=f.q||''; if(a)a.value=f.a||''; });
  if(!(d.faqs||[]).length) addFaq();
  cc('metaTitle','mtc',60); cc('metaDesc','mdc',160);
}

addSection(); addFaq(); loadAllBlogs();
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const rawUrl = req.url;
  const url    = rawUrl.split('?')[0];

  if (url === '/login') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(LOGIN_HTML); return; }

  if (req.method === 'POST' && url === '/api/login') {
    try {
      const body = await readJSON(req);
      if (body.password === ADMIN_PASSWORD) {
        const token = createSession();
        res.writeHead(200, { 'Set-Cookie': `ws_adm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Incorrect password' })); }
    } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (!isAuth(req)) { res.writeHead(302, { Location: '/login' }); res.end(); return; }

  if (url === '/logout') {
    const m = (req.headers.cookie || '').match(/ws_adm=([a-f0-9]+)/);
    if (m) sessions.delete(m[1]);
    res.writeHead(302, { 'Set-Cookie': 'ws_adm=; HttpOnly; Max-Age=0; Path=/', 'Location': '/login' });
    res.end(); return;
  }

  if (req.method === 'GET' && url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(ADMIN_HTML); return; }

  // GET /api/all-blogs
  if (req.method === 'GET' && url === '/api/all-blogs') {
    try {
      let indexContent = '', slugs = [], adminBlogs = [];
      if (DEV_MODE) {
        indexContent = fs.existsSync(BLOG_INDEX) ? fs.readFileSync(BLOG_INDEX, 'utf8') : '';
        slugs = fs.existsSync(BLOG_DIR) ? fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => f.replace('.html', '')) : [];
        adminBlogs = fs.existsSync(BLOGS_JSON) ? JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')) : [];
      } else {
        const [idxFile, cr, df] = await Promise.all([ghGetFile('blog/index.html'), ghRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/blog`), ghGetFile('blogs-data.json')]);
        indexContent = idxFile ? Buffer.from(idxFile.content, 'base64').toString('utf8') : '';
        slugs = (Array.isArray(cr.body) ? cr.body : []).filter(f => f.type === 'file' && f.name.endsWith('.html') && f.name !== 'index.html').map(f => f.name.replace('.html', ''));
        adminBlogs = df ? JSON.parse(Buffer.from(df.content, 'base64').toString('utf8')) : [];
      }
      const cm = parseCardsFromIndex(indexContent);
      const am = new Map(adminBlogs.map(b => [b.slug, b]));
      const all = slugs.map(slug => { const a = am.get(slug) || {}, c = cm[slug] || {}; return { slug, cardTitle: a.cardTitle || c.cardTitle || slug, cardDesc: a.cardDesc || c.cardDesc || '', category: a.category || c.category || 'guide', readTime: a.readTime || c.readTime || '', date: a.date || c.date || '', icon: a.icon || '', iconType: a.iconType || 'emoji' }; }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(all));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // GET /api/blogs (legacy)
  if (req.method === 'GET' && url === '/api/blogs') {
    try { const b = await loadBlogs(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); }
    catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // GET /api/blog-content?slug=X
  if (req.method === 'GET' && url === '/api/blog-content') {
    const qs = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
    const slug = new URLSearchParams(qs).get('slug');
    if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug' })); return; }
    try {
      let html = '', ic = '';
      if (DEV_MODE) {
        const fp = path.join(BLOG_DIR, slug + '.html');
        if (!fs.existsSync(fp)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Blog not found' })); return; }
        html = fs.readFileSync(fp, 'utf8');
        ic = fs.existsSync(BLOG_INDEX) ? fs.readFileSync(BLOG_INDEX, 'utf8') : '';
      } else {
        const [f, idxFile] = await Promise.all([ghGetFile(`blog/${slug}.html`), ghGetFile('blog/index.html')]);
        if (!f) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Blog not found on GitHub' })); return; }
        html = Buffer.from(f.content, 'base64').toString('utf8');
        ic = idxFile ? Buffer.from(idxFile.content, 'base64').toString('utf8') : '';
      }
      const parsed = parseBlogHTML(html, slug);
      const card = parseCardsFromIndex(ic)[slug];
      if (card) { if (card.cardTitle) parsed.cardTitle = card.cardTitle; if (card.cardDesc && !parsed.cardDesc) parsed.cardDesc = card.cardDesc; if (card.category) parsed.category = card.category; if (card.readTime && !parsed.readTime) parsed.readTime = card.readTime; }
      const meta = (await loadBlogs()).find(b => b.slug === slug);
      if (meta && meta.icon) { parsed.icon = meta.icon; parsed.iconType = meta.iconType || 'emoji'; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(parsed));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // POST /api/parse-docx
  if (req.method === 'POST' && url === '/api/parse-docx') {
    try {
      const body = await readJSON(req);
      const buffer = Buffer.from(body.file, 'base64');
      const result = await mammoth.convertToHtml({ buffer });
      const parsed = parseDocxContent(result.value);
      if (parsed.error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: parsed.error })); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(parsed)); }
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // POST /api/blog
  if (req.method === 'POST' && url === '/api/blog') {
    try {
      const b = await readJSON(req);
      if (!b.slug || !b.cardTitle || !b.metaTitle || !b.h1) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing required fields' })); return; }
      b.slug = slugify(b.slug); b.date = b.date || isoDate();
      await publishBlog(b);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, slug: b.slug }));
    } catch (e) { console.error('Publish error:', e.message); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // PUT /api/blog
  if (req.method === 'PUT' && url === '/api/blog') {
    try {
      const b = await readJSON(req);
      if (!b.slug || !b.cardTitle || !b.metaTitle || !b.h1) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing required fields' })); return; }
      b.slug = slugify(b.slug); b.date = b.date || isoDate();
      await updateBlog(b);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, slug: b.slug }));
    } catch (e) { console.error('Update error:', e.message); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // DELETE /api/blog?slug=X
  if (req.method === 'DELETE' && url === '/api/blog') {
    const qs = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
    const slug = new URLSearchParams(qs).get('slug');
    if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug' })); return; }
    try {
      await deleteBlog(slug);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
    } catch (e) { console.error('Delete error:', e.message); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');

}).listen(PORT, () => {
  console.log('');
  console.log(`✅ WorthScale Admin → http://localhost:${PORT}`);
  console.log(`   Password: ${ADMIN_PASSWORD === 'admin' ? '⚠️  change ADMIN_PASSWORD env var' : '(set via env)'}`);
  console.log('');
});
