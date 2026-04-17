// ============================================================
//  网络代理配置
//  支持系统代理检测、HTTP/SOCKS5 代理、PAC 脚本
// ============================================================

import type { ProxyConfig } from './types';

/** 全局代理配置（模块级单例） */
let _proxyConfig: ProxyConfig = {
  enabled: false,
  mode: 'system',
};

/** 设置代理配置 */
export function setProxyConfig(config: ProxyConfig): void {
  _proxyConfig = { ...config };
}

/** 获取当前代理配置 */
export function getProxyConfig(): ProxyConfig {
  return { ..._proxyConfig };
}

/**
 * 获取带代理的 fetch 函数。
 *
 * 在浏览器 (Office Add-in / WPS Taskpane) 环境下，
 * fetch 请求自动走 WebView 的系统代理设置，所以：
 *  - mode = 'system' → 直接用原生 fetch
 *  - mode = 'http' / 'socks5' → 需要 sidecar 服务转发
 *
 * 如果运行在 Node.js sidecar 环境，可使用 undici + proxy-agent。
 */
export function getProxiedFetch(): typeof fetch {
  if (!_proxyConfig.enabled || _proxyConfig.mode === 'system') {
    return globalThis.fetch.bind(globalThis);
  }

  // 如果有自定义代理，走 sidecar 转发
  if (_proxyConfig.mode === 'http' || _proxyConfig.mode === 'socks5') {
    return createSidecarProxiedFetch(_proxyConfig);
  }

  // PAC 模式在浏览器端也是走系统代理
  return globalThis.fetch.bind(globalThis);
}

/**
 * 通过本地 sidecar 服务转发请求（适用于自定义代理场景）。
 * sidecar 是一个独立的 Node.js 进程，监听 localhost:18921。
 */
function createSidecarProxiedFetch(proxy: ProxyConfig): typeof fetch {
  const sidecarBase = 'http://127.0.0.1:18921';

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const targetUrl = typeof input === 'string' ? input : input.toString();

    // 向 sidecar 发送转发请求
    return globalThis.fetch(`${sidecarBase}/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        method: init?.method ?? 'GET',
        headers: init?.headers ?? {},
        body: init?.body ? String(init.body) : undefined,
        proxy: {
          mode: proxy.mode,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
        },
      }),
      signal: init?.signal,
    });
  };
}

/**
 * 检测系统代理设置。
 * 在浏览器环境下通过调用 sidecar 的 /system-proxy 端点获取。
 */
export async function detectSystemProxy(): Promise<{
  httpProxy?: string;
  httpsProxy?: string;
  socksProxy?: string;
  noProxy?: string;
} | null> {
  try {
    const res = await globalThis.fetch('http://127.0.0.1:18921/system-proxy');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // sidecar 可能未启动
  }
  return null;
}

/**
 * 解析代理 URL 为结构化配置。
 * 例如 "http://user:pass@127.0.0.1:7890" → { mode: 'http', host: '127.0.0.1', port: 7890, ... }
 */
export function parseProxyUrl(proxyUrl: string): Partial<ProxyConfig> {
  try {
    const url = new URL(proxyUrl);
    const mode = url.protocol.startsWith('socks') ? 'socks5' : 'http';
    return {
      mode,
      host: url.hostname,
      port: parseInt(url.port, 10) || (mode === 'http' ? 7890 : 1080),
      username: url.username || undefined,
      password: url.password || undefined,
    };
  } catch {
    return {};
  }
}
