#!/usr/bin/env node

// ============================================================
//  Sidecar 代理服务
//  独立的 Node.js 进程，监听 127.0.0.1:18921
//  职责：
//    1. 转发 AI API 请求（通过用户配置的代理）
//    2. 检测系统代理设置
//    3. PAC 脚本解析
// ============================================================

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const os = require('os');

const PORT = 18921;
const HOST = '127.0.0.1';

// ---- 系统代理检测 ----

function detectSystemProxy() {
  const platform = os.platform();
  const result = { httpProxy: null, httpsProxy: null, socksProxy: null, noProxy: null };

  try {
    if (platform === 'win32') {
      // Windows: 从注册表读取
      const regOutput = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: 'utf8', timeout: 3000 }
      );

      const enabled = regOutput.includes('0x1');
      if (enabled) {
        const serverOutput = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
          { encoding: 'utf8', timeout: 3000 }
        );
        const match = serverOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/);
        if (match) {
          const proxy = match[1].trim();
          result.httpProxy = proxy.startsWith('http') ? proxy : `http://${proxy}`;
          result.httpsProxy = result.httpProxy;
        }
      }

    } else if (platform === 'darwin') {
      // macOS: 使用 scutil
      const output = execSync('scutil --proxy', { encoding: 'utf8', timeout: 3000 });

      // HTTP 代理
      if (output.includes('HTTPEnable : 1')) {
        const hostMatch = output.match(/HTTPProxy\s*:\s*(\S+)/);
        const portMatch = output.match(/HTTPPort\s*:\s*(\d+)/);
        if (hostMatch) {
          const host = hostMatch[1];
          const port = portMatch ? portMatch[1] : '80';
          result.httpProxy = `http://${host}:${port}`;
        }
      }

      // HTTPS 代理
      if (output.includes('HTTPSEnable : 1')) {
        const hostMatch = output.match(/HTTPSProxy\s*:\s*(\S+)/);
        const portMatch = output.match(/HTTPSPort\s*:\s*(\d+)/);
        if (hostMatch) {
          const host = hostMatch[1];
          const port = portMatch ? portMatch[1] : '443';
          result.httpsProxy = `http://${host}:${port}`;
        }
      }

      // SOCKS 代理
      if (output.includes('SOCKSEnable : 1')) {
        const hostMatch = output.match(/SOCKSProxy\s*:\s*(\S+)/);
        const portMatch = output.match(/SOCKSPort\s*:\s*(\d+)/);
        if (hostMatch) {
          const host = hostMatch[1];
          const port = portMatch ? portMatch[1] : '1080';
          result.socksProxy = `socks5://${host}:${port}`;
        }
      }

    } else {
      // Linux: 环境变量
      result.httpProxy = process.env.http_proxy || process.env.HTTP_PROXY || null;
      result.httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY || null;
      result.noProxy = process.env.no_proxy || process.env.NO_PROXY || null;
    }
  } catch (err) {
    console.error('[Sidecar] System proxy detection error:', err.message);
  }

  return result;
}

// ---- 代理转发 ----

async function proxyRequest(targetUrl, method, headers, body, proxyConfig) {
  // 动态加载代理 Agent
  let agent = null;

  if (proxyConfig && proxyConfig.host && proxyConfig.port) {
    const proxyUrl = proxyConfig.mode === 'socks5'
      ? `socks5://${proxyConfig.host}:${proxyConfig.port}`
      : `http://${proxyConfig.host}:${proxyConfig.port}`;

    try {
      if (proxyConfig.mode === 'socks5') {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      }
    } catch (err) {
      console.error('[Sidecar] Failed to create proxy agent:', err.message);
      console.log('[Sidecar] Install dependencies: npm install https-proxy-agent socks-proxy-agent');
    }
  }

  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  // 清理 headers
  const cleanHeaders = { ...headers };
  delete cleanHeaders['host'];
  delete cleanHeaders['content-length'];
  if (body) {
    cleanHeaders['content-length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: cleanHeaders,
      agent: agent || undefined,
      timeout: 60000,
    };

    const req = lib.request(options, (res) => {
      // 收集响应
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ---- 流式代理转发 ----

function proxyRequestStream(targetUrl, method, headers, body, proxyConfig, res) {
  let agent = null;

  if (proxyConfig && proxyConfig.host && proxyConfig.port) {
    const proxyUrl = proxyConfig.mode === 'socks5'
      ? `socks5://${proxyConfig.host}:${proxyConfig.port}`
      : `http://${proxyConfig.host}:${proxyConfig.port}`;

    try {
      if (proxyConfig.mode === 'socks5') {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      }
    } catch (err) {
      console.error('[Sidecar] Proxy agent error:', err.message);
    }
  }

  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const cleanHeaders = { ...headers };
  delete cleanHeaders['host'];
  delete cleanHeaders['content-length'];
  if (body) {
    cleanHeaders['content-length'] = Buffer.byteLength(body);
  }

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: method || 'POST',
    headers: cleanHeaders,
    agent: agent || undefined,
    timeout: 120000,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    // 透传响应头
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    // 直接 pipe 流
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Sidecar] Stream proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: err.message }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// ---- HTTP Server ----

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 路由
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // 健康检查
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
    return;
  }

  // 系统代理检测
  if (url.pathname === '/system-proxy') {
    const proxy = detectSystemProxy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(proxy));
    return;
  }

  // 代理转发
  if (url.pathname === '/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { url: targetUrl, method, headers: targetHeaders, body: targetBody, proxy } = payload;

        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing url' }));
          return;
        }

        const result = await proxyRequest(targetUrl, method, targetHeaders || {}, targetBody, proxy);

        // 透传响应
        res.writeHead(result.status, {
          'Content-Type': result.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(result.body);
      } catch (err) {
        console.error('[Sidecar] Proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 流式代理转发
  if (url.pathname === '/proxy-stream' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { url: targetUrl, method, headers: targetHeaders, body: targetBody, proxy } = payload;

        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing url' }));
          return;
        }

        proxyRequestStream(targetUrl, method, targetHeaders || {}, targetBody, proxy, res);
      } catch (err) {
        console.error('[Sidecar] Stream proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Sidecar] 代理服务已启动: http://${HOST}:${PORT}`);
  console.log('[Sidecar] 端点:');
  console.log(`  GET  /health        — 健康检查`);
  console.log(`  GET  /system-proxy  — 检测系统代理`);
  console.log(`  POST /proxy         — 转发 API 请求`);
  console.log(`  POST /proxy-stream  — 流式转发请求`);
});

// 优雅退出
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
