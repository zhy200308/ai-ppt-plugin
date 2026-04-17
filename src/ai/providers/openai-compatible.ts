// ============================================================
//  OpenAI 兼容 Provider
//  适用于: OpenAI / DeepSeek / 通义千问 / 所有 OpenAI 格式的中转平台
// ============================================================

import type {
  IAIProviderAdapter,
  AIProvider,
  AIRequestParams,
  AIResponse,
  ProviderConfig,
} from '../types';
import { getProxiedFetch } from '../proxy';

export class OpenAICompatibleProvider implements IAIProviderAdapter {
  readonly provider: AIProvider;

  constructor(provider: AIProvider = 'openai') {
    this.provider = provider;
  }

  async chat(params: AIRequestParams, config: ProviderConfig): Promise<AIResponse> {
    const fetchFn = getProxiedFetch();
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const res = await fetchFn(url, {
      method: 'POST',
      headers: this._buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: config.temperature ?? 0.7,
        stream: false,
        ...this._buildMaxTokensPayload(config.maxTokens),
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[${this.provider}] API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? config.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
    };
  }

  async chatStream(params: AIRequestParams, config: ProviderConfig): Promise<void> {
    if (!params.callbacks) throw new Error('Stream callbacks required');

    const fetchFn = getProxiedFetch();
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const res = await fetchFn(url, {
      method: 'POST',
      headers: this._buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: config.temperature ?? 0.7,
        stream: true,
        ...this._buildMaxTokensPayload(config.maxTokens),
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[${this.provider}] Stream error ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              params.callbacks.onToken(delta);
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
      params.callbacks.onComplete(fullText);
    } catch (err: any) {
      params.callbacks.onError(err);
    }
  }

  async testConnection(config: ProviderConfig): Promise<import('../types').ConnectionTestResult> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await this.chat({
        messages: [{ role: 'user', content: 'ping' }],
        signal: controller.signal,
      }, { ...config, maxTokens: 8 });

      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);

      return {
        ok: !!res.content,
        latencyMs: latency,
        model: res.model,
      };
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      return {
        ok: false,
        latencyMs: latency,
        errorMessage: err.message ?? String(err),
      };
    }
  }

  private _buildHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 默认 Bearer；某些国产 API 可能用 api-key 头
    const authStyle = config.authStyle ?? 'bearer';
    if (authStyle === 'bearer') {
      const token = config.apiKey.startsWith('Bearer ')
        ? config.apiKey
        : `Bearer ${config.apiKey}`;
      headers['Authorization'] = token;
    } else if (authStyle === 'x-api-key') {
      headers['x-api-key'] = config.apiKey;
    }

    return headers;
  }

  private _buildMaxTokensPayload(maxTokens?: number): Record<string, number> {
    if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
      return { max_tokens: maxTokens };
    }
    return {};
  }
}
