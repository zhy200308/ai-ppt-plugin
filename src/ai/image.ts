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

  // Determine model based on provider or URL
  let targetModel = 'dall-e-3';
  let targetSize = opts?.size ?? '1024x1024';
  
  if (baseUrl.includes('siliconflow')) {
    targetModel = 'black-forest-labs/FLUX.1-schnell';
    targetSize = opts?.size ?? '1024x576';
  } else if (baseUrl.includes('aliyun')) {
    targetModel = 'wanx-v1';
  }

  const body: any = {
    model: targetModel,
    prompt,
    size: targetSize,
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

// ============================================================
//  Iconify 获取 SVG 矢量图标
// ============================================================

export async function fetchSvgIconBase64(
  keyword: string,
  color: string = 'currentColor'
): Promise<GeneratedImage> {
  // Translate common words to typical lucide or material icon names
  const fallbackIcons = ['star', 'check', 'circle', 'box', 'zap', 'activity'];
  const query = keyword || fallbackIcons[Math.floor(Math.random() * fallbackIcons.length)];
  
  try {
    // 1. Search for the icon via Iconify API
    const searchRes = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=1`);
    const searchJson = await searchRes.json();
    
    let iconName = 'lucide:zap'; // default fallback
    if (searchJson.icons && searchJson.icons.length > 0) {
      iconName = searchJson.icons[0];
    }
    
    // 2. Fetch the SVG content
    const svgRes = await fetch(`https://api.iconify.design/${iconName}.svg?color=${encodeURIComponent(color)}&width=256&height=256`);
    if (!svgRes.ok) throw new Error('Failed to fetch SVG');
    
    const svgText = await svgRes.text();
    
    // 3. Encode to base64
    // For inserting into PPT via standard image mechanisms, we need base64 of the SVG.
    // NOTE: For some environments, 'image/svg+xml' is supported. If not, it needs to be rasterized via canvas.
    const base64 = btoa(unescape(encodeURIComponent(svgText)));
    
    return {
      base64,
      mimeType: 'image/svg+xml' as any // Using as any since the current type only defines png/jpeg, but adapters may support svg
    };
  } catch (err) {
    console.error('Failed to fetch SVG icon:', err);
    // Return a dummy transparent PNG if it fails
    return {
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      mimeType: 'image/png'
    };
  }
}

export async function fetchStockImageBase64(
  keyword: string,
  width = 800,
  height = 600,
): Promise<GeneratedImage> {
  // Check if it's requesting an icon rather than a photo
  if (keyword.startsWith('icon:')) {
    return fetchSvgIconBase64(keyword.replace('icon:', '').trim());
  }

  // 优先尝试 Unsplash (注意：部分环境可能有跨域限制，若有则降级)
  // 此处使用基于关键字的免费代理 API 或 picsum 占位符
  const url = `https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=${width}&h=${height}&fit=crop&q=80`; 
  // 真实生产环境可接入 Unsplash Developer API
  // 这里使用一个支持 CORS 的优质图库代理，如果 keyword 为空则随机
  const fetchUrl = keyword 
    ? `https://source.unsplash.com/random/${width}x${height}/?${encodeURIComponent(keyword)}`
    : `https://picsum.photos/seed/${Math.random()}/${width}/${height}`;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Failed to fetch image');
    const blob = await res.blob();
    return new Promise<GeneratedImage>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(',');
        let mimeType: 'image/png' | 'image/jpeg' = 'image/jpeg';
        if (header.includes('image/png')) mimeType = 'image/png';
        resolve({ base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    // 降级为 Picsum
    const fallbackUrl = `https://picsum.photos/seed/${encodeURIComponent(keyword || Math.random().toString())}/${width}/${height}`;
    const res = await fetch(fallbackUrl);
    const blob = await res.blob();
    return new Promise<GeneratedImage>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const [, base64] = dataUrl.split(',');
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

