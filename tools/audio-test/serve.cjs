// Tiny static file server for the audio test harness (serves the repo root).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };

function start(port = 5199) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let p = path.normalize(path.join(ROOT, u));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html'); } catch (e) { /* 404 below */ }
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start(+process.argv[2] || 5199).then(() => console.log('serving', ROOT));
