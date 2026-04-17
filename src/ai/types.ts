// ============================================================
//  AI 服务层 — 类型定义
// ============================================================

/** 支持的 AI 平台 */
export type AIProvider =
  | 'openai'             // OpenAI 官方 (写死 URL + Bearer)
  | 'anthropic'          // Anthropic 官方 (写死 URL + x-api-key)
  | 'google'             // Google Gemini 官方 (写死 URL + URL 参数)
  | 'deepseek'           // DeepSeek 官方 (写死 URL + Bearer)
  | 'qwen'               // 通义千问官方 (写死 URL + Bearer)
  | 'claude-relay'       // Claude 中转站 (用户自定义 URL + 可选鉴权方式)
  | 'openai-relay';      // OpenAI 格式中转站 (用户自定义 URL + Bearer)

/** API 鉴权方式 */
export type AuthStyle =
  | 'bearer'          // Authorization: Bearer xxx  (OpenAI / Claude Code / AnyRouter)
  | 'x-api-key'       // x-api-key: xxx             (Anthropic / lanyiapi 等原生风格中转)
  | 'api-key-param';  // ?key=xxx                   (Google Gemini)

/** 单个 Provider 的配置 */
export interface ProviderConfig {
  provider: AIProvider;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  /** 协议类型（决定请求体格式） */
  protocol?: 'openai' | 'anthropic' | 'google';
  /** 鉴权方式（仅中转站可改，官方固定） */
  authStyle?: AuthStyle;
}

/** Provider 健康状态 */
export interface ProviderHealth {
  status: 'unknown' | 'healthy' | 'slow' | 'degraded' | 'down';
  latencyMs: number | null;
  lastChecked: number;
  errorMessage?: string;
  model?: string;
}

/** 代理配置 */
export interface ProxyConfig {
  enabled: boolean;
  mode: 'system' | 'http' | 'socks5' | 'pac';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  pacUrl?: string;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  operations?: import('../adapters/interface').SlideOperation[];
  documentContext?: string;
  streaming?: boolean;
}

/** 流式回调 */
export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onCompleteRaw?: (rawText: string, cleanText: string) => void;
  onError: (error: Error) => void;
}

/** AI 请求参数 */
export interface AIRequestParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  stream?: boolean;
  callbacks?: StreamCallbacks;
  signal?: AbortSignal;
}

/** AI 响应 */
export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** 连接测试结果 */
export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  errorMessage?: string;
}

/** AI Provider 适配器接口 */
export interface IAIProviderAdapter {
  readonly provider: AIProvider;
  chat(params: AIRequestParams, config: ProviderConfig): Promise<AIResponse>;
  chatStream(params: AIRequestParams, config: ProviderConfig): Promise<void>;
  testConnection(config: ProviderConfig): Promise<ConnectionTestResult>;
}

type EditableField = 'apiKey' | 'model' | 'baseUrl' | 'authStyle' | 'temperature' | 'maxTokens';

/**
 * 官方平台的预设配置 —— URL 和鉴权方式都写死。
 * 用户只需要填 apiKey，最多改模型名。
 */
export const OFFICIAL_PRESETS: Record<string, Partial<ProviderConfig> & {
  editableFields: EditableField[];
}> = {
  openai: {
    provider: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    protocol: 'openai',
    authStyle: 'bearer',
    editableFields: ['apiKey', 'model', 'temperature', 'maxTokens'],
  },
  anthropic: {
    provider: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    protocol: 'anthropic',
    authStyle: 'x-api-key',
    editableFields: ['apiKey', 'model', 'temperature', 'maxTokens'],
  },
  google: {
    provider: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    protocol: 'google',
    authStyle: 'api-key-param',
    editableFields: ['apiKey', 'model', 'temperature', 'maxTokens'],
  },
  deepseek: {
    provider: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    protocol: 'openai',
    authStyle: 'bearer',
    editableFields: ['apiKey', 'model', 'temperature', 'maxTokens'],
  },
  qwen: {
    provider: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    protocol: 'openai',
    authStyle: 'bearer',
    editableFields: ['apiKey', 'model', 'temperature', 'maxTokens'],
  },
};

/**
 * 中转站模板 —— 所有字段都可编辑，让用户自由配置。
 */
export const RELAY_TEMPLATES: Record<string, Partial<ProviderConfig> & {
  description: string;
  editableFields: EditableField[];
}> = {
  'claude-relay': {
    provider: 'claude-relay',
    label: 'Claude 中转站',
    description: '使用 Anthropic 协议的中转站（lanyiapi、AnyRouter 等）。Base URL 填到根域名即可，代码会自动拼接 /v1/messages',
    baseUrl: 'https://lanyiapi.com',
    model: 'claude-sonnet-4-20250514',
    protocol: 'anthropic',
    authStyle: 'x-api-key',
    editableFields: ['apiKey', 'model', 'baseUrl', 'authStyle', 'temperature', 'maxTokens'],
  },
  'openai-relay': {
    provider: 'openai-relay',
    label: 'OpenAI 格式中转站',
    description: '使用 OpenAI 协议的中转站（one-api、new-api 等）',
    baseUrl: '',
    model: 'gpt-4o',
    protocol: 'openai',
    authStyle: 'bearer',
    editableFields: ['apiKey', 'model', 'baseUrl', 'temperature', 'maxTokens'],
  },
};

/** 合并所有 provider 预设（兼容旧代码） */
export const PROVIDER_PRESETS: Record<string, Partial<ProviderConfig>> = {
  ...Object.fromEntries(
    Object.entries(OFFICIAL_PRESETS).map(([k, v]) => {
      const { editableFields: _e, ...rest } = v;
      return [k, rest as Partial<ProviderConfig>];
    })
  ),
  ...Object.fromEntries(
    Object.entries(RELAY_TEMPLATES).map(([k, v]) => {
      const { editableFields: _e, description: _d, ...rest } = v;
      return [k, rest as Partial<ProviderConfig>];
    })
  ),
};

/** 判断某个字段是否可编辑 */
export function isFieldEditable(
  provider: AIProvider,
  field: EditableField,
): boolean {
  const preset = OFFICIAL_PRESETS[provider] || RELAY_TEMPLATES[provider];
  if (!preset) return true;
  return preset.editableFields.includes(field);
}

/** 判断 provider 是否是中转站 */
export function isRelayProvider(provider: AIProvider): boolean {
  return provider === 'claude-relay' || provider === 'openai-relay';
}

/** 判断 provider 是否是官方服务 */
export function isOfficialProvider(provider: AIProvider): boolean {
  return provider in OFFICIAL_PRESETS;
}
