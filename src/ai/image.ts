// ============================================================
//  Image Generation (Web 优先)
//  - 目前先支持 OpenAI / OpenAI-compatible images endpoint
//  - 生成结果返回 base64 + mimeType，供 insertImage / setBackground 使用
// ============================================================

import type { ProviderConfig } from './types';

export type GeneratedImage = {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg';
};

function isOpenAIProtocol(config: ProviderConfig): boolean {
  return config.protocol === 'openai' || config.provider === 'openai' || config.provider === 'openai-relay';
}

function getAuthHeader(config: ProviderConfig): Record<string, string> {
  const style = config.authStyle ?? 'bearer';
  if (style === 'x-api-key') return { 'x-api-key': config.apiKey };
  return { Authorization: `Bearer ${config.apiKey}` };
}

export async function generateImage(
  prompt: string,
  config: ProviderConfig,
  opts?: { size?: '1024x1024' | '1024x576' | '768x1024' },
): Promise<GeneratedImage> {
  if (!config.apiKey) throw new Error('缺少 API Key');
  if (!isOpenAIProtocol(config)) throw new Error('当前 Provider 暂不支持图片生成（仅支持 OpenAI/兼容接口）');

  const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const url = `${baseUrl}/images/generations`;

  // 兼容 OpenAI Images API（gpt-image-1 / dall-e-3 等）
  const body: any = {
    model: 'gpt-image-1',
    prompt,
    size: opts?.size ?? '1024x576',
    // 要求返回 base64
    response_format: 'b64_json',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(config),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`图片生成失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('图片生成失败：未返回 b64_json');
  return { base64: b64, mimeType: 'image/png' };
}

