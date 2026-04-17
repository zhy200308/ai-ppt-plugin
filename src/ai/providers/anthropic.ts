// ============================================================
//  Anthropic Claude Provider
//  使用 Anthropic Messages API 格式
//
//  URL 拼接规则（严格按主流中转站约定）：
//    - 用户填 https://api.anthropic.com          → POST https://api.anthropic.com/v1/messages
//    - 用户填 https://api.anthropic.com/v1       → POST https://api.anthropic.com/v1/messages
//    - 用户填 https://lanyiapi.com               → POST https://lanyiapi.com/v1/messages
//    - 用户填 https://lanyiapi.com/v1            → POST https://lanyiapi.com/v1/messages
//    - 用户填 https://relay.com/v1/messages      → POST https://relay.com/v1/messages (原样)
//
//  鉴权方式（由 config.authStyle 决定）：
//    - 'x-api-key':  x-api-key: sk-xxx                (lanyiapi / Anthropic 官方)
//    - 'bearer':     Authorization: Bearer sk-xxx     (AnyRouter / Claude Code)
//
//  必需请求头：
//    - content-type: application/json
//    - anthropic-version: 2023-06-01
// ============================================================

import type {
  IAIProviderAdapter,
  AIProvider,
  AIRequestParams,
  AIResponse,
  ProviderConfig,
  ConnectionTestResult,
} from '../types';
import { getProxiedFetch } from '../proxy';

export class AnthropicProvider implements IAIProviderAdapter {
  readonly provider: AIProvider = 'anthropic';

  async chat(params: AIRequestParams, config: ProviderConfig): Promise<AIResponse> {
    const fetchFn = getProxiedFetch();
    const url = this._buildUrl(config.baseUrl);

    const systemMsgs = params.messages
      .filter(m => m.role === 'system')
      .map(m => m.content.trim())
      .filter(Boolean);
    const chatMsgs = params.messages.filter(m => m.role !== 'system');

    const body: Record<string, any> = {
      model: config.model,
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      ...this._buildMaxTokensPayload(config.maxTokens),
    };
    if (systemMsgs.length > 0) body.system = systemMsgs.join('\n\n');
    if (config.temperature !== undefined) body.temperature = config.temperature;

    const res = await fetchFn(url, {
      method: 'POST',
      headers: this._buildHeaders(config),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Anthropic] API error ${res.status}: ${errText}`);
    }

    const data = await res.json();

    return {
      content: data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') ?? '',
      model: data.model ?? config.model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      } : undefined,
    };
  }

  async chatStream(params: AIRequestParams, config: ProviderConfig): Promise<void> {
    if (!params.callbacks) throw new Error('Stream callbacks required');

    const fetchFn = getProxiedFetch();
    const url = this._buildUrl(config.baseUrl);

    const systemMsgs = params.messages
      .filter(m => m.role === 'system')
      .map(m => m.content.trim())
      .filter(Boolean);
    const chatMsgs = params.messages.filter(m => m.role !== 'system');

    const body: Record<string, any> = {
      model: config.model,
      stream: true,
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      ...this._buildMaxTokensPayload(config.maxTokens),
    };
    if (systemMsgs.length > 0) body.system = systemMsgs.join('\n\n');
    if (config.temperature !== undefined) body.temperature = config.temperature;

    const res = await fetchFn(url, {
      method: 'POST',
      headers: this._buildHeaders(config),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Anthropic] Stream error ${res.status}: ${errText}`);
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
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const evt = JSON.parse(jsonStr);

            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const text = evt.delta.text;
              if (text) {
                fullText += text;
                params.callbacks!.onToken(text);
              }
            }
            if (evt.type === 'message_stop') break;
          } catch { /* skip */ }
        }
      }
      params.callbacks.onComplete(fullText);
    } catch (err: any) {
      params.callbacks.onError(err);
    }
  }

  async testConnection(config: ProviderConfig): Promise<ConnectionTestResult> {
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

  // ---- private ----

  /**
   * 智能拼接请求 URL。
   * 用户输入 → 最终请求地址：
   *   https://api.anthropic.com          → https://api.anthropic.com/v1/messages
   *   https://api.anthropic.com/         → https://api.anthropic.com/v1/messages
   *   https://api.anthropic.com/v1       → https://api.anthropic.com/v1/messages
   *   https://lanyiapi.com               → https://lanyiapi.com/v1/messages
   *   https://lanyiapi.com/v1            → https://lanyiapi.com/v1/messages
   *   https://lanyiapi.com/v1/messages   → https://lanyiapi.com/v1/messages (原样)
   */
  private _buildUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');

    // 用户已经填到 /v1/messages，直接用
    if (trimmed.endsWith('/v1/messages') || trimmed.endsWith('/messages')) {
      return trimmed;
    }

    // 已经有 /v1 后缀，只补 /messages
    if (trimmed.endsWith('/v1')) {
      return `${trimmed}/messages`;
    }

    // 根路径，补全 /v1/messages
    return `${trimmed}/v1/messages`;
  }

  /**
   * 构造请求头。
   * 严格按 Anthropic Messages API 规范 + 中转站主流约定。
   */
  private _buildHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    // 鉴权方式由 config.authStyle 决定
    // 官方和 lanyi 等用 x-api-key；AnyRouter / Claude Code 用 Bearer
    const authStyle = config.authStyle ?? 'x-api-key';

    if (authStyle === 'bearer') {
      const token = config.apiKey.startsWith('Bearer ')
        ? config.apiKey
        : `Bearer ${config.apiKey}`;
      headers['Authorization'] = token;
    } else {
      // 默认 x-api-key（与截图中的 lanyiapi 一致）
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
