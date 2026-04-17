import type { ProviderConfig } from '../types';
import { getProxiedFetch } from '../proxy';
import type {
  ClaudeMessage,
  ClaudeToolChoice,
  ClaudeToolDefinition,
  ClaudeToolResultBlock,
  ClaudeToolUseBlock,
  ClaudeResponse,
} from './types';

function buildUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/messages')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function buildHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  const style = config.authStyle ?? 'x-api-key';
  if (style === 'bearer') headers.Authorization = `Bearer ${config.apiKey}`;
  else headers['x-api-key'] = config.apiKey;
  return headers;
}

function splitSystem(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): { system: string; chat: ClaudeMessage[] } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const chat = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, chat };
}

export type ToolHandler = (params: { name: string; input: any; toolUseId: string }) => Promise<{ content: string; is_error?: boolean }>;

export async function runClaudeToolLoop(params: {
  config: ProviderConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tools: ClaudeToolDefinition[];
  tool_choice?: ClaudeToolChoice;
  max_turns?: number;
  handler: ToolHandler;
}): Promise<{ finalText: string; raw: ClaudeResponse }> {
  const fetchFn = getProxiedFetch();
  const url = buildUrl(params.config.baseUrl);
  const maxTurns = params.max_turns ?? 6;

  const { system, chat } = splitSystem(params.messages);
  const workingMessages: ClaudeMessage[] = [...chat];

  let lastResp: ClaudeResponse | null = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const body: any = {
      model: params.config.model,
      messages: workingMessages,
      max_tokens: params.config.maxTokens ?? 2048,
      tools: params.tools,
    };
    if (system) body.system = system;
    if (params.config.temperature !== undefined) body.temperature = params.config.temperature;
    if (params.tool_choice) body.tool_choice = params.tool_choice;

    const res = await fetchFn(url, {
      method: 'POST',
      headers: buildHeaders(params.config),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[ClaudeTools] API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as ClaudeResponse;
    lastResp = data;

    const toolUses = (data.content ?? []).filter((c: any) => c.type === 'tool_use') as ClaudeToolUseBlock[];
    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const finalText = (data.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      return { finalText, raw: data };
    }

    // 追加 assistant 原始 content（包含 tool_use）
    workingMessages.push({ role: 'assistant', content: data.content });

    // tool_result 必须作为下一条 user message 的 content 数组第一项（严格遵循 Anthropic 规范）
    const toolResults: ClaudeToolResultBlock[] = [];
    for (const tu of toolUses) {
      try {
        const out = await params.handler({ name: tu.name, input: tu.input, toolUseId: tu.id });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: out.content,
          is_error: out.is_error,
        });
      } catch (e: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: e?.message ?? String(e),
          is_error: true,
        });
      }
    }
    workingMessages.push({ role: 'user', content: toolResults });
    // 下一轮不强制 tool_choice（让模型继续完成）
    params.tool_choice = { type: 'auto' };
  }

  if (!lastResp) throw new Error('[ClaudeTools] No response');
  const finalText = (lastResp.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  return { finalText, raw: lastResp };
}

