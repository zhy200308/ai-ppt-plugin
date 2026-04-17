// ============================================================
//  快速配置解析器
//  支持从环境变量脚本一键导入配置
//  兼容 ccswitch / Claude Code / OpenAI SDK / lanyiapi 等格式
// ============================================================

import type { ProviderConfig, AIProvider, AuthStyle } from './types';

export interface QuickSetupResult {
  success: boolean;
  provider?: AIProvider;
  config?: Partial<ProviderConfig>;
  detectedFrom: string;
  message: string;
}

/**
 * 从粘贴的文本中识别环境变量赋值。
 */
function extractEnvVars(text: string): Record<string, string> {
  const vars: Record<string, string> = {};

  const patterns = [
    // export KEY=value / export KEY="value" / $env:KEY="value"
    /(?:^|\n)\s*(?:export\s+)?\$?env?:?\s*([A-Z_][A-Z0-9_]+)\s*[=:]\s*["']?([^"'\n]+?)["']?\s*(?:$|\n)/gi,
    // set KEY=value
    /(?:^|\n)\s*set\s+([A-Z_][A-Z0-9_]+)\s*=\s*["']?([^"'\n]+?)["']?\s*(?:$|\n)/gi,
    // KEY=VALUE
    /(?:^|\n)\s*([A-Z_][A-Z0-9_]{3,})\s*=\s*["']?([^"'\n]+?)["']?\s*(?:$|\n)/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(text)) !== null) {
      const key = m[1].toUpperCase();
      const value = m[2].trim();
      if (value && !vars[key]) {
        vars[key] = value;
      }
    }
  }

  return vars;
}

/**
 * 从环境变量映射推断 Provider 类型和配置。
 */
function inferProviderFromEnv(vars: Record<string, string>): QuickSetupResult {
  // ---- Claude / Anthropic 类 ----
  const anthropicToken =
    vars.ANTHROPIC_AUTH_TOKEN ||
    vars.ANTHROPIC_API_KEY ||
    vars.CLAUDE_API_KEY;

  const anthropicUrl =
    vars.ANTHROPIC_BASE_URL ||
    vars.ANTHROPIC_API_URL ||
    vars.CLAUDE_BASE_URL;

  if (anthropicToken) {
    const isOfficial = !anthropicUrl ||
      anthropicUrl.includes('api.anthropic.com');

    // 鉴权方式推断：
    //   - 用户用 ANTHROPIC_AUTH_TOKEN → Bearer（Claude Code / AnyRouter 风格）
    //   - 用户用 ANTHROPIC_API_KEY → x-api-key（官方 / lanyi 风格）
    const usedBearerVar = !!vars.ANTHROPIC_AUTH_TOKEN;
    const authStyle: AuthStyle = usedBearerVar ? 'bearer' : 'x-api-key';

    const provider: AIProvider = isOfficial ? 'anthropic' : 'claude-relay';

    let label = isOfficial ? 'Anthropic Claude' : 'Claude 中转';
    if (anthropicUrl && !isOfficial) {
      try {
        const hostname = new URL(anthropicUrl).hostname;
        label = `Claude 中转 · ${hostname}`;
      } catch { /* ignore */ }
    }

    return {
      success: true,
      provider,
      detectedFrom: usedBearerVar ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY',
      message: `识别为 ${label}（${authStyle === 'bearer' ? 'Bearer 鉴权' : 'x-api-key 鉴权'}）`,
      config: {
        provider,
        label,
        apiKey: anthropicToken,
        baseUrl: anthropicUrl || 'https://api.anthropic.com',
        model: vars.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        protocol: 'anthropic',
        authStyle,
        maxTokens: vars.ANTHROPIC_MAX_TOKENS ? parseInt(vars.ANTHROPIC_MAX_TOKENS) : undefined,
        temperature: 0.7,
        enabled: true,
      },
    };
  }

  // ---- OpenAI 类 ----
  const openaiKey = vars.OPENAI_API_KEY || vars.OPENAI_KEY;
  const openaiUrl = vars.OPENAI_BASE_URL || vars.OPENAI_API_BASE || vars.OPENAI_API_URL;

  if (openaiKey) {
    const isOfficial = !openaiUrl || openaiUrl.includes('api.openai.com');

    const provider: AIProvider = isOfficial ? 'openai' : 'openai-relay';
    let label = isOfficial ? 'OpenAI' : 'OpenAI 中转';
    if (openaiUrl && !isOfficial) {
      try {
        const hostname = new URL(openaiUrl).hostname;
        label = `OpenAI 中转 · ${hostname}`;
      } catch { /* ignore */ }
    }

    return {
      success: true,
      provider,
      detectedFrom: 'OPENAI_API_KEY',
      message: `识别为 ${label}`,
      config: {
        provider,
        label,
        apiKey: openaiKey,
        baseUrl: openaiUrl || 'https://api.openai.com/v1',
        model: vars.OPENAI_MODEL || 'gpt-4o',
        protocol: 'openai',
        authStyle: 'bearer',
        maxTokens: vars.OPENAI_MAX_TOKENS ? parseInt(vars.OPENAI_MAX_TOKENS) : undefined,
        temperature: 0.7,
        enabled: true,
      },
    };
  }

  // ---- Google Gemini ----
  const googleKey =
    vars.GOOGLE_API_KEY ||
    vars.GEMINI_API_KEY ||
    vars.GOOGLE_GENERATIVE_AI_API_KEY;

  if (googleKey) {
    return {
      success: true,
      provider: 'google',
      detectedFrom: 'GEMINI_API_KEY',
      message: '识别为 Google Gemini',
      config: {
        provider: 'google',
        label: 'Google Gemini',
        apiKey: googleKey,
        baseUrl: vars.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
        model: vars.GEMINI_MODEL || 'gemini-2.0-flash',
        protocol: 'google',
        authStyle: 'api-key-param',
        maxTokens: vars.GEMINI_MAX_TOKENS ? parseInt(vars.GEMINI_MAX_TOKENS) : undefined,
        temperature: 0.7,
        enabled: true,
      },
    };
  }

  // ---- DeepSeek ----
  const deepseekKey = vars.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    return {
      success: true,
      provider: 'deepseek',
      detectedFrom: 'DEEPSEEK_API_KEY',
      message: '识别为 DeepSeek',
      config: {
        provider: 'deepseek',
        label: 'DeepSeek',
        apiKey: deepseekKey,
        baseUrl: vars.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
        model: vars.DEEPSEEK_MODEL || 'deepseek-chat',
        protocol: 'openai',
        authStyle: 'bearer',
        maxTokens: vars.DEEPSEEK_MAX_TOKENS ? parseInt(vars.DEEPSEEK_MAX_TOKENS) : undefined,
        temperature: 0.7,
        enabled: true,
      },
    };
  }

  return {
    success: false,
    detectedFrom: '',
    message: '未识别出支持的 API 配置，请检查粘贴的内容',
  };
}

/**
 * 解析粘贴的配置文本。
 */
export function parseQuickSetup(text: string): QuickSetupResult {
  if (!text || text.trim().length === 0) {
    return { success: false, detectedFrom: '', message: '请粘贴配置内容' };
  }

  const vars = extractEnvVars(text);
  if (Object.keys(vars).length === 0) {
    return { success: false, detectedFrom: '', message: '未找到环境变量赋值' };
  }

  return inferProviderFromEnv(vars);
}

/** 生成唯一的 provider key */
export function generateProviderKey(provider: AIProvider, baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/\./g, '_');
    return `${provider}_${host}_${Date.now().toString(36)}`;
  } catch {
    return `${provider}_${Date.now().toString(36)}`;
  }
}
