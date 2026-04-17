// ============================================================
//  Google Gemini Provider
//  使用 Google Generative AI REST API 格式
// ============================================================

import type {
  IAIProviderAdapter,
  AIProvider,
  AIRequestParams,
  AIResponse,
  ProviderConfig,
} from '../types';
import { getProxiedFetch } from '../proxy';

export class GoogleGeminiProvider implements IAIProviderAdapter {
  readonly provider: AIProvider = 'google';

  async chat(params: AIRequestParams, config: ProviderConfig): Promise<AIResponse> {
    const fetchFn = getProxiedFetch();
    const url = `${config.baseUrl.replace(/\/+$/, '')}/models/${config.model}:generateContent?key=${config.apiKey}`;

    const systemMsgs = params.messages
      .filter(m => m.role === 'system')
      .map(m => m.content.trim())
      .filter(Boolean);
    const chatMsgs = params.messages.filter(m => m.role !== 'system');

    const body: Record<string, any> = {
      contents: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        ...this._buildMaxTokensPayload(config.maxTokens),
      },
    };

    if (systemMsgs.length > 0) {
      body.systemInstruction = { parts: [{ text: systemMsgs.join('\n\n') }] };
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Gemini] API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((p: any) => p.text ?? '')
      .join('') ?? '';

    return {
      content: text,
      model: config.model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0,
      } : undefined,
    };
  }

  async chatStream(params: AIRequestParams, config: ProviderConfig): Promise<void> {
    if (!params.callbacks) throw new Error('Stream callbacks required');

    const fetchFn = getProxiedFetch();
    const url = `${config.baseUrl.replace(/\/+$/, '')}/models/${config.model}:streamGenerateContent?key=${config.apiKey}&alt=sse`;

    const systemMsgs = params.messages
      .filter(m => m.role === 'system')
      .map(m => m.content.trim())
      .filter(Boolean);
    const chatMsgs = params.messages.filter(m => m.role !== 'system');

    const body: Record<string, any> = {
      contents: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        ...this._buildMaxTokensPayload(config.maxTokens),
      },
    };
    if (systemMsgs.length > 0) {
      body.systemInstruction = { parts: [{ text: systemMsgs.join('\n\n') }] };
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Gemini] Stream error ${res.status}: ${errText}`);
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
            const chunk = JSON.parse(jsonStr);
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  fullText += part.text;
                  params.callbacks!.onToken(part.text);
                }
              }
            }
          } catch { /* skip */ }
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

  private _buildMaxTokensPayload(maxTokens?: number): Record<string, number> {
    if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
      return { maxOutputTokens: maxTokens };
    }
    return {};
  }
}
