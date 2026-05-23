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

// Local paths (DEV_MODE only)
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

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  return token;
}

function isAuth(req) {
  const m = (req.headers.cookie || '').match(/ws_adm=([a-f0-9]+)/);
  return !!(m && sessions.has(m[1]));
}

// ── GitHub API ────────────────────────────────────────────────────────────────
function ghRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path:     apiPath,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept':        'application/vnd.github.v3+json',
        'User-Agent':    'WorthScale-Admin',
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
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
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    ...(sha ? { sha } : {})
  };
  const r = await ghRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`, body);
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`GitHub PUT ${filePath}: HTTP ${r.status} — ${JSON.stringify(r.body?.message || r.body)}`);
  }
  return r.body;
}

// ── String helpers ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isoDate() {
  return new Date().toISOString().split('T')[0];
}

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
  const cat     = CAT[b.category] || CAT.guide;
  const canonical = `https://worthscale.in/blog/${b.slug}`;
  const dateStr = b.date || isoDate();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateDisplay = new Date(y, m - 1, d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const sectionsHTML = (b.sections || []).filter(s => s.h2 || s.content)
    .map(s => `\n      <h2>${esc(s.h2)}</h2>\n      ${s.content || ''}`).join('\n');

  const faqsHTML = (b.faqs || []).filter(f => f.q).map(f => `
        <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
          <div class="faq-q" itemprop="name">${esc(f.q)}</div>
          <div class="faq-a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><div itemprop="text">${esc(f.a)}</div></div>
        </div>`).join('');

  const disclaimerHTML = b.disclaimer ? `
      <div class="disclaimer" style="margin-top:32px;padding:16px 20px;background:var(--bg2);border-radius:10px;font-size:.78rem;color:var(--muted);line-height:1.7">
        <strong>Disclaimer:</strong> ${esc(b.disclaimer)}
      </div>` : '';

  const faqJsonItems = (b.faqs || []).filter(f => f.q)
    .map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }));

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
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(b.metaTitle)}">
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
<div class="ad-wrap" style="text-align:center;padding:16px 0">
  <ins class="adsbygoogle" style="display:block" data-ad-format="autorelaxed" data-ad-client="ca-pub-4837443132966026" data-ad-slot="2014605657"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>
<footer class="site-footer"><div class="footer-inner footer-grid">
  <div class="footer-about">
    <div class="footer-brand">⚖️ WorthScale</div>
    <p class="footer-desc">Free personal finance platform for Indians. Track net worth, plan goals, and build wealth with simple tools and guides.</p>
  </div>
  <div class="footer-col"><h4>Free Tools</h4>
    <a href="/net-worth-calculator">Net Worth Calculator</a>
    <a href="/emergency-fund-calculator">Emergency Fund Calculator</a>
    <a href="/house-down-payment-calculator">Down Payment Calculator</a>
    <a href="/app">Dashboard</a>
  </div>
  <div class="footer-col"><h4>Learn</h4>
    <a href="/blog">All Articles</a>
    <a href="/blog/how-to-calculate-net-worth">How to Calculate Net Worth</a>
    <a href="/blog/emergency-fund-guide">Emergency Fund Guide</a>
    <a href="/blog/financial-freedom-steps">Steps to Financial Freedom</a>
  </div>
  <div class="footer-col"><h4>Company</h4>
    <a href="/about">About</a>
    <a href="/contact">Contact Us</a>
    <a href="/privacy-policy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
    <a href="/sitemap">Sitemap</a>
  </div>
</div><div class="footer-bottom">
  <p>&copy; 2026 WorthScale. All rights reserved. Built with &#10084;&#65039; in India.</p>
</div></footer>
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

// ── Publish blog (local or GitHub) ────────────────────────────────────────────
async function publishBlog(b) {
  const blogPath = `blog/${b.slug}.html`;
  const blogHTML = generateBlogHTML(b);
  const cardHTML = generateCardHTML(b);
  const meta     = { slug: b.slug, category: b.category, icon: b.icon, iconType: b.iconType, cardTitle: b.cardTitle, cardDesc: b.cardDesc, readTime: b.readTime, date: b.date };

  if (DEV_MODE) {
    const filePath = path.join(BLOG_DIR, b.slug + '.html');
    if (fs.existsSync(filePath)) throw new Error(`Blog "${b.slug}" already exists`);
    fs.writeFileSync(filePath, blogHTML, 'utf8');
    const idx = fs.readFileSync(BLOG_INDEX, 'utf8');
    if (!idx.includes(MARKER)) throw new Error(`Marker not found in blog/index.html`);
    fs.writeFileSync(BLOG_INDEX, idx.replace(MARKER, cardHTML + '\n\n    ' + MARKER), 'utf8');
    const blogs = fs.existsSync(BLOGS_JSON) ? JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')) : [];
    blogs.unshift(meta);
    fs.writeFileSync(BLOGS_JSON, JSON.stringify(blogs, null, 2), 'utf8');
    console.log(`✅ [LOCAL] Created: blog/${b.slug}.html`);
    return;
  }

  // GitHub mode — three commits
  const existing = await ghGetFile(blogPath);
  if (existing) throw new Error(`Blog "${b.slug}" already exists on GitHub`);

  // 1. Blog HTML file
  await ghPutFile(blogPath, blogHTML, `blog: add ${b.slug}`);

  // 2. blog/index.html — inject card
  const idxFile = await ghGetFile('blog/index.html');
  if (!idxFile) throw new Error('blog/index.html not found on GitHub');
  const idxContent = Buffer.from(idxFile.content, 'base64').toString('utf8');
  if (!idxContent.includes(MARKER)) throw new Error(`Marker "${MARKER}" not found in blog/index.html on GitHub`);
  await ghPutFile('blog/index.html', idxContent.replace(MARKER, cardHTML + '\n\n    ' + MARKER), `blog: add card for ${b.cardTitle}`, idxFile.sha);

  // 3. blogs-data.json
  const dataFile = await ghGetFile('blogs-data.json');
  const blogs = dataFile ? JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8')) : [];
  blogs.unshift(meta);
  await ghPutFile('blogs-data.json', JSON.stringify(blogs, null, 2), `blog: update index`, dataFile?.sha);

  console.log(`✅ [GITHUB] Committed: ${blogPath}`);
}

// ── Load blogs list ───────────────────────────────────────────────────────────
async function loadBlogs() {
  if (DEV_MODE) {
    try { return JSON.parse(fs.readFileSync(BLOGS_JSON, 'utf8')); } catch { return []; }
  }
  const f = await ghGetFile('blogs-data.json');
  if (!f) return [];
  try { return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch { return []; }
}

// ── Word doc parser ───────────────────────────────────────────────────────────
function parseDocxContent(html) {
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim();
  const result = { slug: '', category: 'guide', icon: '', iconType: 'emoji', cardTitle: '', cardDesc: '', readTime: '8 min read', date: isoDate(), metaTitle: '', metaDesc: '', h1: '', intro: '', sections: [], faqs: [], disclaimer: '' };

  const h1Idx = html.search(/<h1[\s>]/i);
  if (h1Idx === -1) return { error: 'No Heading 1 found. In Word, apply "Heading 1" style to your article title.' };

  for (const m of html.substring(0, h1Idx).matchAll(/<p[^>]*>(.*?)<\/p>/gi)) {
    const text = strip(m[1]);
    const colon = text.indexOf(':');
    if (colon < 1) continue;
    const key = text.substring(0, colon).trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = text.substring(colon + 1).trim();
    switch (key) {
      case 'slug':            result.slug      = slugify(val); break;
      case 'category':        result.category  = val.toLowerCase(); break;
      case 'icon':            result.icon      = val; break;
      case 'cardtitle':       result.cardTitle = val; break;
      case 'carddesc':
      case 'carddescription': result.cardDesc  = val; break;
      case 'readtime':        result.readTime  = val; break;
      case 'date':            result.date      = val; break;
      case 'metatitle':       result.metaTitle = val; break;
      case 'metadesc':
      case 'metadescription': result.metaDesc  = val; break;
    }
  }

  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  result.h1 = strip(h1Match[1]);
  if (!result.slug)      result.slug      = slugify(result.h1);
  if (!result.cardTitle) result.cardTitle = result.h1;
  if (!result.metaTitle) result.metaTitle = result.h1;

  const afterH1 = html.substring(h1Idx + h1Match[0].length);
  const h2Parts = afterH1.split(/(?=<h2[\s>])/i);

  if (h2Parts[0]) {
    result.intro = [...h2Parts[0].matchAll(/<p[^>]*>(.*?)<\/p>/gi)]
      .map(m => strip(m[1])).filter(Boolean).join(' ');
  }

  for (let i = 1; i < h2Parts.length; i++) {
    const part    = h2Parts[i];
    const h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (!h2Match) continue;
    const heading = strip(h2Match[1]);
    const body    = part.substring(h2Match[0].length).trim();
    const hl      = heading.toLowerCase();

    if (hl.includes('frequently asked') || hl === 'faq' || hl === 'faqs') {
      const lines = body.replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
      let curQ = null;
      for (const line of lines) {
        if (/^q\s*[:.]/i.test(line))       curQ = line.replace(/^q\s*[:.]\s*/i, '').trim();
        else if (/^a\s*[:.]/i.test(line) && curQ) {
          result.faqs.push({ q: curQ, a: line.replace(/^a\s*[:.]\s*/i, '').trim() });
          curQ = null;
        }
      }
    } else if (hl === 'disclaimer') {
      result.disclaimer = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      result.sections.push({ h2: heading, content: body });
    }
  }
  return result;
}

// ── Login page HTML ───────────────────────────────────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  <form id="loginForm">
    <label>Password</label>
    <input type="password" id="pw" placeholder="••••••••" autofocus>
    <button type="submit">Sign In →</button>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('pw').value })
  });
  if (res.ok) {
    window.location.href = '/';
  } else {
    document.getElementById('err').style.display = 'block';
    btn.textContent = 'Sign In →';
    btn.disabled = false;
  }
});
</script>
</body>
</html>`;

// ── Admin UI ──────────────────────────────────────────────────────────────────
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WorthScale Blog Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fa;color:#1a1a2e;min-height:100vh}
  .header{background:#1a1a2e;color:#fff;padding:16px 32px;display:flex;align-items:center;gap:12px}
  .header h1{font-size:1.1rem;font-weight:700}
  .header-right{margin-left:auto;display:flex;align-items:center;gap:16px}
  .header a{color:#a5b4fc;font-size:.85rem;text-decoration:none}
  .header a:hover{color:#fff}
  .mode-badge{font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:4px;background:${DEV_MODE ? 'rgba(245,158,11,.2)' : 'rgba(34,197,94,.2)'};color:${DEV_MODE ? '#fbbf24' : '#4ade80'}}
  .wrap{max-width:860px;margin:32px auto;padding:0 20px 80px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:20px}
  .card h2{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #f3f4f6}
  label{display:block;font-size:.82rem;font-weight:600;color:#374151;margin-bottom:5px}
  label span{font-weight:400;color:#9ca3af;margin-left:4px}
  input[type=text],input[type=date],select,textarea{width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.875rem;font-family:inherit;color:#1a1a2e;transition:border-color .15s;resize:vertical}
  input[type=text]:focus,input[type=date]:focus,select:focus,textarea:focus{outline:none;border-color:#6366f1}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .field{margin-bottom:14px}
  .char-count{font-size:.72rem;color:#9ca3af;text-align:right;margin-top:3px}
  .char-count.warn{color:#ef4444}
  .divider{height:1px;background:#f3f4f6;margin:8px 0 18px}
  .section-label{font-size:.78rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
  .icon-toggle{display:flex;gap:0;margin-bottom:8px}
  .icon-toggle button{flex:1;padding:7px;font-size:.78rem;font-weight:600;border:1.5px solid #e5e7eb;background:#f9fafb;cursor:pointer;transition:all .15s;font-family:inherit}
  .icon-toggle button:first-child{border-radius:6px 0 0 6px}
  .icon-toggle button:last-child{border-radius:0 6px 6px 0;border-left:none}
  .icon-toggle button.active{background:#6366f1;color:#fff;border-color:#6366f1}
  .dyn-item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:10px;position:relative}
  .dyn-item h4{font-size:.75rem;font-weight:700;color:#6b7280;margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em}
  .btn-remove{position:absolute;top:12px;right:12px;background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;line-height:1;padding:2px 6px;border-radius:4px}
  .btn-remove:hover{background:#fef2f2}
  .btn-add{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:.8rem;font-weight:600;color:#6366f1;background:rgba(99,102,241,.07);border:1.5px dashed #c7d2fe;border-radius:8px;cursor:pointer;font-family:inherit;margin-top:4px;transition:all .15s}
  .btn-add:hover{background:rgba(99,102,241,.12)}
  .submit-row{display:flex;gap:12px;align-items:center;margin-top:24px}
  .btn-submit{padding:12px 28px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s}
  .btn-submit:hover{background:#4f46e5}
  .btn-submit:disabled{background:#a5b4fc;cursor:not-allowed}
  #toast{display:none;padding:14px 20px;border-radius:10px;font-size:.875rem;font-weight:500;margin-top:16px;line-height:1.5}
  #toast.ok{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
  #toast.err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
  #toast a{color:inherit;font-weight:700}
  .blogs-table{width:100%;border-collapse:collapse;font-size:.82rem}
  .blogs-table th{text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}
  .blogs-table td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
  .blogs-table tr:hover td{background:#f9fafb}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.65rem;font-weight:700;text-transform:uppercase}
  .tag-guide{background:rgba(34,197,94,.1);color:#15803d}
  .tag-celebrity{background:rgba(245,158,11,.12);color:#b45309}
  .tag-company{background:rgba(139,92,246,.12);color:#7c3aed}
  .tag-planning{background:rgba(59,130,246,.1);color:#1d4ed8}
  .tag-strategy{background:rgba(168,85,247,.1);color:#7c3aed}
  .tag-mindset{background:rgba(245,158,11,.1);color:#b45309}
  .slug-preview{font-size:.72rem;color:#9ca3af;margin-top:3px}
  .empty{color:#9ca3af;font-size:.85rem;font-style:italic;padding:8px 0}
  .upload-zone{border:2px dashed #c7d2fe;border-radius:12px;padding:28px 20px;text-align:center;cursor:pointer;transition:all .18s;margin-bottom:4px;background:rgba(99,102,241,.02)}
  .upload-zone:hover,.upload-zone.drag{border-color:#6366f1;background:rgba(99,102,241,.07)}
  .upload-zone .uz-icon{font-size:2rem;margin-bottom:8px}
  .upload-zone strong{display:block;font-size:.88rem;color:#374151;margin-bottom:4px}
  .upload-zone small{color:#9ca3af;font-size:.76rem;line-height:1.6}
  .parse-status{padding:11px 16px;border-radius:8px;font-size:.84rem;font-weight:500;margin:10px 0 4px;display:none}
  .ps-ok{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;display:block}
  .ps-err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;display:block}
  .ps-loading{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;display:block}
  .format-hint{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:.76rem;color:#92400e;line-height:1.8;margin-bottom:16px}
  .format-hint strong{color:#78350f}
</style>
</head>
<body>

<div class="header">
  <span style="font-size:1.3rem">⚖️</span>
  <h1>WorthScale — Blog Admin</h1>
  <div class="header-right">
    <span class="mode-badge">${DEV_MODE ? 'LOCAL MODE' : 'LIVE → GitHub'}</span>
    <a href="https://worthscale.in/blog" target="_blank">↗ View Blog</a>
    <a href="/logout" style="color:#ef9090">Sign out</a>
  </div>
</div>

<div class="wrap">

  <div class="card">
    <h2>📋 Blogs Published via Admin</h2>
    <div id="blogList"><span class="empty">Loading...</span></div>
  </div>

  <div class="card">
    <h2>✏️ Create New Blog Post</h2>

    <p class="section-label" style="margin-bottom:10px">Upload Word Document <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.78rem;color:#9ca3af">— auto-fills all fields</span></p>

    <div class="upload-zone" id="uploadZone"
         onclick="document.getElementById('docxInput').click()"
         ondragover="event.preventDefault();this.classList.add('drag')"
         ondragleave="this.classList.remove('drag')"
         ondrop="handleDrop(event)">
      <div class="uz-icon">📄</div>
      <strong>Drop your .docx file here, or click to browse</strong>
      <small>
        Heading 1 = article title &nbsp;·&nbsp; Heading 2 = sections<br>
        "Frequently Asked Questions" section with Q: / A: pairs
      </small>
    </div>
    <input type="file" id="docxInput" accept=".docx" style="display:none" onchange="handleFile(this.files[0])">
    <div class="parse-status" id="parseStatus"></div>

    <div class="format-hint">
      <strong>First lines of your Word doc (before Heading 1):</strong><br>
      Meta Title: Your full SEO title<br>
      Meta Description: 1–2 sentence Google summary<br>
      Slug: your-url-slug &nbsp;·&nbsp; Category: celebrity &nbsp;·&nbsp; Icon: ⭐<br>
      Card Title: Short index title &nbsp;·&nbsp; Card Description: One line teaser &nbsp;·&nbsp; Read Time: 8 min read
    </div>

    <div class="divider"></div>
    <p class="section-label" style="margin-bottom:14px">Or fill manually</p>

    <div class="row">
      <div class="field">
        <label>URL Slug <span>* auto-filled from card title</span></label>
        <input type="text" id="slug" placeholder="elon-musk-net-worth">
        <div class="slug-preview">Preview: /blog/<span id="slugPreview">...</span></div>
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
        <button type="button" class="active" onclick="setIconType('emoji')">😀 Emoji</button>
        <button type="button" onclick="setIconType('image')">🖼 Logo Image</button>
      </div>
      <input type="text" id="iconEmoji" placeholder="e.g. ⭐ or 🏢 or 💰">
      <input type="text" id="iconImage" placeholder="Filename in /assets/logos/ — e.g. elon.png" style="display:none;margin-top:6px">
    </div>

    <div class="row">
      <div class="field">
        <label>Card Title <span>* shown on blog index</span></label>
        <input type="text" id="cardTitle" placeholder="Elon Musk Net Worth in Rupees 2026: ₹17 Lakh Crore" oninput="autoSlug(this.value)">
      </div>
      <div class="field">
        <label>Card Description <span>* 1–2 lines</span></label>
        <input type="text" id="cardDesc" placeholder="Tesla, SpaceX, X.com — how $213B was built.">
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
    <p class="section-label">SEO</p>

    <div class="field">
      <label>Meta Title <span>* shown in Google</span></label>
      <input type="text" id="metaTitle" placeholder="Elon Musk Net Worth: Inside the $213 Billion Empire" oninput="charCount('metaTitle','metaTitleCount',60)">
      <div class="char-count" id="metaTitleCount">0 / 60 chars</div>
    </div>
    <div class="field">
      <label>Meta Description <span>* shown under title in Google</span></label>
      <textarea id="metaDesc" rows="2" placeholder="Elon Musk's net worth is $213B as of 2026. Tesla, SpaceX, X — the full breakdown." oninput="charCount('metaDesc','metaDescCount',160)"></textarea>
      <div class="char-count" id="metaDescCount">0 / 160 chars</div>
    </div>

    <div class="divider"></div>
    <p class="section-label">Article Content</p>

    <div class="field">
      <label>H1 Heading <span>*</span></label>
      <input type="text" id="h1" placeholder="Elon Musk Net Worth in 2026: Inside the $213 Billion Empire">
    </div>
    <div class="field">
      <label>Intro Paragraph <span>HTML allowed</span></label>
      <textarea id="intro" rows="3" placeholder="Elon Musk is the world's richest person..."></textarea>
    </div>

    <div class="divider"></div>
    <p class="section-label">Sections <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.78rem;color:#9ca3af">— H2 heading + HTML content</span></p>
    <div id="sections"></div>
    <button class="btn-add" onclick="addSection()">+ Add Section</button>

    <div class="divider" style="margin-top:20px"></div>
    <p class="section-label">FAQs</p>
    <div id="faqs"></div>
    <button class="btn-add" onclick="addFaq()">+ Add FAQ</button>

    <div class="divider" style="margin-top:20px"></div>
    <div class="field">
      <label>Disclaimer <span>optional</span></label>
      <textarea id="disclaimer" rows="2" placeholder="All figures are based on publicly available data as of 2026..."></textarea>
    </div>

    <div class="submit-row">
      <button class="btn-submit" onclick="submitBlog()">Publish Blog Post</button>
      <span style="font-size:.8rem;color:#9ca3af">${DEV_MODE ? 'Writes HTML file to disk locally' : 'Commits to GitHub → Vercel redeploys worthscale.in in ~30s'}</span>
    </div>
    <div id="toast"></div>
  </div>

</div>

<script>
let sectionCount = 0, faqCount = 0, iconType = 'emoji';
const LIVE = ${!DEV_MODE};

document.getElementById('date').value = new Date().toISOString().split('T')[0];

function setIconType(t) {
  iconType = t;
  const btns = document.querySelectorAll('.icon-toggle button');
  btns[0].classList.toggle('active', t === 'emoji');
  btns[1].classList.toggle('active', t === 'image');
  document.getElementById('iconEmoji').style.display = t === 'emoji' ? '' : 'none';
  document.getElementById('iconImage').style.display = t === 'image' ? '' : 'none';
}

function autoSlug(val) {
  const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  document.getElementById('slug').value = slug;
  document.getElementById('slugPreview').textContent = slug || '...';
}

function charCount(fieldId, countId, max) {
  const len = document.getElementById(fieldId).value.length;
  const el  = document.getElementById(countId);
  el.textContent = len + ' / ' + max + ' chars';
  el.classList.toggle('warn', len > max);
}

function addSection() {
  const i = sectionCount++;
  const div = document.createElement('div');
  div.className = 'dyn-item'; div.id = 'sec-' + i;
  div.innerHTML =
    '<h4>Section ' + (i+1) + '</h4>' +
    '<button class="btn-remove" onclick="this.closest(\\'.dyn-item\\').remove()" title="Remove">✕</button>' +
    '<div class="field"><label>H2 Heading</label><input type="text" id="sec_h2_' + i + '" placeholder="The Numbers in 2026"></div>' +
    '<div class="field"><label>Content <span>HTML — &lt;p&gt;, &lt;ul&gt;&lt;li&gt;, &lt;strong&gt;, &lt;a href&gt;</span></label>' +
    '<textarea id="sec_content_' + i + '" rows="6" placeholder="&lt;p&gt;...&lt;/p&gt;"></textarea></div>';
  document.getElementById('sections').appendChild(div);
}

function addFaq() {
  const i = faqCount++;
  const div = document.createElement('div');
  div.className = 'dyn-item'; div.id = 'faq-' + i;
  div.innerHTML =
    '<h4>FAQ ' + (i+1) + '</h4>' +
    '<button class="btn-remove" onclick="this.closest(\\'.dyn-item\\').remove()" title="Remove">✕</button>' +
    '<div class="field"><label>Question</label><input type="text" id="faq_q_' + i + '" placeholder="What is the net worth?"></div>' +
    '<div class="field"><label>Answer</label><textarea id="faq_a_' + i + '" rows="3"></textarea></div>';
  document.getElementById('faqs').appendChild(div);
}

function collectSections() {
  return Array.from(document.querySelectorAll('[id^="sec-"]')).map(el => {
    const i = el.id.replace('sec-','');
    const h2El = document.getElementById('sec_h2_'+i), cEl = document.getElementById('sec_content_'+i);
    return { h2: h2El ? h2El.value : '', content: cEl ? cEl.value : '' };
  }).filter(s => s.h2 || s.content);
}

function collectFaqs() {
  return Array.from(document.querySelectorAll('[id^="faq-"]')).map(el => {
    const i = el.id.replace('faq-','');
    const qEl = document.getElementById('faq_q_'+i), aEl = document.getElementById('faq_a_'+i);
    return { q: qEl ? qEl.value.trim() : '', a: aEl ? aEl.value.trim() : '' };
  }).filter(f => f.q);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.className = type; t.style.display = 'block';
  if (type === 'ok') setTimeout(() => { t.style.display = 'none'; }, 15000);
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function submitBlog() {
  const btn = document.querySelector('.btn-submit');
  const v = id => document.getElementById(id).value.trim();
  const payload = {
    slug: v('slug'), category: document.getElementById('category').value,
    iconType, icon: iconType==='emoji' ? v('iconEmoji') : v('iconImage'),
    cardTitle: v('cardTitle'), cardDesc: v('cardDesc'),
    readTime: v('readTime')||'8 min read', date: v('date')||new Date().toISOString().split('T')[0],
    metaTitle: v('metaTitle'), metaDesc: v('metaDesc'),
    h1: v('h1'), intro: document.getElementById('intro').value.trim(),
    disclaimer: v('disclaimer'), sections: collectSections(), faqs: collectFaqs()
  };
  const missing = ['slug','cardTitle','cardDesc','metaTitle','metaDesc','h1'].filter(k => !payload[k]);
  if (missing.length) { showToast('Please fill in: ' + missing.join(', '), 'err'); return; }

  btn.disabled = true;
  btn.textContent = LIVE ? 'Committing to GitHub...' : 'Publishing...';
  try {
    const res  = await fetch('/api/blog', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (res.ok) {
      const blogUrl = LIVE ? 'https://worthscale.in/blog/' + payload.slug : 'http://localhost:3000/blog/' + payload.slug;
      showToast(
        (LIVE ? '✅ Committed to GitHub! Vercel is redeploying — live in ~30 seconds.<br>' : '✅ Published locally!<br>') +
        '<a href="' + blogUrl + '" target="_blank">View post →</a>',
        'ok'
      );
      loadBlogs(); resetForm();
    } else {
      showToast('Error: ' + escHtml(data.error || 'Unknown error'), 'err');
    }
  } catch(e) { showToast('Network error: ' + escHtml(e.message), 'err'); }
  btn.disabled = false;
  btn.textContent = 'Publish Blog Post';
}

function resetForm() {
  ['slug','cardTitle','cardDesc','metaTitle','metaDesc','h1','intro','disclaimer','iconEmoji','iconImage'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('slugPreview').textContent='...';
  document.getElementById('category').selectedIndex=0;
  document.getElementById('date').value=new Date().toISOString().split('T')[0];
  document.getElementById('readTime').value='8 min read';
  document.getElementById('sections').innerHTML=''; document.getElementById('faqs').innerHTML='';
  document.getElementById('metaTitleCount').textContent='0 / 60 chars';
  document.getElementById('metaDescCount').textContent='0 / 160 chars';
  sectionCount=0; faqCount=0; addSection(); addFaq();
}

async function loadBlogs() {
  try {
    const res = await fetch('/api/blogs'), blogs = await res.json();
    const el  = document.getElementById('blogList');
    if (!blogs.length) { el.innerHTML='<span class="empty">No blogs published via admin yet.</span>'; return; }
    el.innerHTML = '<table class="blogs-table"><thead><tr><th>Title</th><th>Category</th><th>Slug</th><th>Date</th></tr></thead><tbody>' +
      blogs.map(b => '<tr><td><a href="' + (LIVE?'https://worthscale.in':'http://localhost:3000') + '/blog/'+escHtml(b.slug)+'" target="_blank" style="color:#6366f1;text-decoration:none;font-weight:600">' + escHtml(b.cardTitle) + '</a></td>' +
        '<td><span class="tag tag-'+escHtml(b.category)+'">'+escHtml(b.category)+'</span></td>' +
        '<td style="font-family:monospace;font-size:.75rem;color:#6b7280">'+escHtml(b.slug)+'</td>' +
        '<td style="font-size:.78rem;color:#9ca3af">'+escHtml(b.date)+'</td></tr>').join('') +
      '</tbody></table>';
  } catch { document.getElementById('blogList').innerHTML='<span class="empty">Could not load blogs.</span>'; }
}

// Word doc upload
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}

function setParseStatus(msg, type) {
  const el = document.getElementById('parseStatus');
  el.textContent = msg;
  el.className = 'parse-status ' + (type==='ok'?'ps-ok':type==='err'?'ps-err':'ps-loading');
}

function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.docx')) { setParseStatus('Please select a .docx (Word) file.', 'err'); return; }
  setParseStatus('Reading ' + file.name + '...', 'loading');
  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result.split(',')[1];
    try {
      const res  = await fetch('/api/parse-docx', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ file:base64, name:file.name }) });
      const data = await res.json();
      if (!res.ok || data.error) { setParseStatus('Error: ' + (data.error||'Could not parse'), 'err'); return; }
      fillFormFromParsed(data);
      setParseStatus('✅ Document parsed — all fields filled. Review and click Publish.', 'ok');
    } catch(err) { setParseStatus('Network error: ' + err.message, 'err'); }
  };
  reader.readAsDataURL(file);
}

function fillFormFromParsed(d) {
  const set = (id, val) => { const el=document.getElementById(id); if(el && val!=null) el.value=val; };
  set('slug',d.slug); set('cardTitle',d.cardTitle); set('cardDesc',d.cardDesc);
  set('readTime',d.readTime); set('date',d.date); set('metaTitle',d.metaTitle);
  set('metaDesc',d.metaDesc); set('h1',d.h1); set('intro',d.intro); set('disclaimer',d.disclaimer);
  document.getElementById('slugPreview').textContent = d.slug||'...';
  if (d.category) document.getElementById('category').value = d.category;
  if (d.icon) { document.getElementById('iconEmoji').value=d.icon; setIconType('emoji'); }
  document.getElementById('sections').innerHTML=''; sectionCount=0;
  (d.sections||[]).forEach(s => { addSection(); const i=sectionCount-1; const h2=document.getElementById('sec_h2_'+i),c=document.getElementById('sec_content_'+i); if(h2)h2.value=s.h2||''; if(c)c.value=s.content||''; });
  if (!(d.sections||[]).length) addSection();
  document.getElementById('faqs').innerHTML=''; faqCount=0;
  (d.faqs||[]).forEach(f => { addFaq(); const i=faqCount-1; const q=document.getElementById('faq_q_'+i),a=document.getElementById('faq_a_'+i); if(q)q.value=f.q||''; if(a)a.value=f.a||''; });
  if (!(d.faqs||[]).length) addFaq();
  charCount('metaTitle','metaTitleCount',60); charCount('metaDesc','metaDescCount',160);
}

addSection(); addFaq(); loadBlogs();
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // Public routes (no auth needed)
  if (url === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LOGIN_HTML);
    return;
  }

  if (req.method === 'POST' && url === '/api/login') {
    try {
      const body = await readJSON(req);
      if (body.password === ADMIN_PASSWORD) {
        const token = createSession();
        res.writeHead(200, {
          'Set-Cookie': `ws_adm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Incorrect password' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Auth gate — redirect to /login if not authenticated
  if (!isAuth(req)) {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  // Logout
  if (url === '/logout') {
    const m = (req.headers.cookie || '').match(/ws_adm=([a-f0-9]+)/);
    if (m) sessions.delete(m[1]);
    res.writeHead(302, {
      'Set-Cookie': 'ws_adm=; HttpOnly; Max-Age=0; Path=/',
      'Location': '/login'
    });
    res.end();
    return;
  }

  // Admin UI
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ADMIN_HTML);
    return;
  }

  // List blogs
  if (req.method === 'GET' && url === '/api/blogs') {
    try {
      const blogs = await loadBlogs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(blogs));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Parse .docx
  if (req.method === 'POST' && url === '/api/parse-docx') {
    try {
      const body   = await readJSON(req);
      const buffer = Buffer.from(body.file, 'base64');
      const result = await mammoth.convertToHtml({ buffer });
      const parsed = parseDocxContent(result.value);
      if (parsed.error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: parsed.error }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(parsed));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Create blog
  if (req.method === 'POST' && url === '/api/blog') {
    try {
      const b = await readJSON(req);
      if (!b.slug || !b.cardTitle || !b.metaTitle || !b.h1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: slug, cardTitle, metaTitle, h1' }));
        return;
      }
      b.slug = slugify(b.slug);
      b.date = b.date || isoDate();
      await publishBlog(b);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, slug: b.slug }));
    } catch (e) {
      console.error('Publish error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');

}).listen(PORT, () => {
  console.log('');
  console.log(`✅ WorthScale Admin → http://localhost:${PORT}`);
  console.log(`   Password: ${ADMIN_PASSWORD === 'admin' ? '⚠️  "admin" (set ADMIN_PASSWORD env var)' : '(set via env)'}`);
  console.log('');
});
