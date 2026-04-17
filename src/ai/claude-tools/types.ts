export type ClaudeTextBlock = { type: 'text'; text: string };

export type ClaudeToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
};

export type ClaudeToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock;

export type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
};

export type ClaudeToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, any>;
  strict?: boolean;
  input_examples?: Array<Record<string, any>>;
};

export type ClaudeToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | { type: 'none' };

export type ClaudeResponse = {
  id: string;
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | string;
  content: ClaudeContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

