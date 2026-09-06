const app = require('../src/app');

module.exports = (req, res) => {
  // Test endpoint to inspect incoming Vercel headers
  if (req.url.includes('test-headers') || req.headers['x-matched-path'] === '/api/test-headers') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      reqUrl: req.url,
      matchedPath: req.headers['x-matched-path'],
      headers: req.headers
    }, null, 2));
  }

  // Restore the real incoming request URL when rewritten by Vercel
  const realUrl = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.headers['x-original-url'];
  if (realUrl) {
    req.url = realUrl;
  }

  return app(req, res);
};
