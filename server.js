const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const mime = {
  html: 'text/html', css: 'text/css', js: 'application/javascript',
  txt: 'text/plain', xml: 'text/xml', json: 'application/json',
  ico: 'image/x-icon', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp'
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  let filePath = path.join(root, url);

  // Resolve directory → index.html
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) {
    // Try appending .html for clean URLs like /blog/emergency-fund-guide
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    }
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const contentType = mime[ext] || 'text/html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + url);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });

}).listen(3000, () => {
  console.log('✅ Local server running at http://localhost:3000');
  console.log('   Blog page: http://localhost:3000/blog');
});
