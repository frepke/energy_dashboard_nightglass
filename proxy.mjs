/**
 * weather-proxy.mjs — tiny CORS proxy for the energy dashboard.
 *
 * Forwards requests to external weather endpoints that don't send
 * Access-Control-Allow-Origin headers (Weerstation Vierlingsbeek).
 *
 * Run:  node proxy.mjs
 * Default port: 8881  (change via PORT env var)
 *
 * The dashboard config must point to this proxy:
 *   weatherProxyUrl: 'http://10.54.1.10:8881'
 *
 * Allowed upstream hosts (whitelist — nothing else is forwarded):
 *   - www.weerstationvierlingsbeek.nl
 *
 * Health check: GET /health  → 200 { status: 'ok', uptime, requests, errors }
 *
 * Install (once):  no extra packages needed — uses built-in Node http/https
 * Node >= 18 required.
 */

import http    from 'http';
import https   from 'https';
import { URL } from 'url';

const PORT = Number(process.env.PORT) || 8881;

const ALLOWED_HOSTS = new Set([
  'www.weerstationvierlingsbeek.nl',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple metrics for health endpoint
const metrics = { requests: 0, errors: 0, startTime: Date.now() };

function log(level, msg) {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${level.toUpperCase()} ${msg}\n`);
}

http.createServer((req, res) => {
  // ---- Health check endpoint ----------------------------------------
  if (req.url === '/health' || req.url === '/health/') {
    const body = JSON.stringify({
      status:   'ok',
      uptime:   Math.floor((Date.now() - metrics.startTime) / 1000),
      requests: metrics.requests,
      errors:   metrics.errors,
    });
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, CORS_HEADERS);
    res.end('Method Not Allowed');
    return;
  }

  metrics.requests++;

  // ?url=https://www.weerstationvierlingsbeek.nl/pwsWD12/...
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const target = reqUrl.searchParams.get('url');

  if (!target) {
    res.writeHead(400, CORS_HEADERS);
    res.end('Missing ?url= parameter');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, CORS_HEADERS);
    res.end('Invalid URL');
    return;
  }

  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    log('warn', `Blocked: ${targetUrl.hostname}`);
    res.writeHead(403, CORS_HEADERS);
    res.end(`Host not allowed: ${targetUrl.hostname}`);
    return;
  }

  const lib = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(
    { hostname: targetUrl.hostname, path: targetUrl.pathname + targetUrl.search, method: 'GET' },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...CORS_HEADERS,
        'Content-Type': proxyRes.headers['content-type'] || 'text/plain',
        'Cache-Control': 'no-store',
      });
      proxyRes.pipe(res);
      log('info', `${proxyRes.statusCode} ${targetUrl.hostname}${targetUrl.pathname}`);
    }
  );

  proxyReq.on('error', (err) => {
    metrics.errors++;
    log('error', `Proxy error for ${targetUrl.hostname}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, CORS_HEADERS);
      res.end('Bad Gateway');
    }
  });

  proxyReq.end();

}).listen(PORT, () => {
  log('info', `Weather proxy running on http://localhost:${PORT}`);
  log('info', `Allowed hosts: ${[...ALLOWED_HOSTS].join(', ')}`);
  log('info', `Health check:  http://localhost:${PORT}/health`);
});

// Graceful shutdown
function shutdown(signal) {
  log('info', `Received ${signal} — shutting down gracefully`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log('error', `Uncaught exception: ${err.message}`);
  process.exit(1);
});
