// ============================================================
// Skills / Tools (Claude Tool Use compatible)
// ============================================================

export type JsonSchema = Record<string, any>;

export interface ToolDefinition {
  name: string; // ^[a-zA-Z0-9_-]{1,64}$
  description: string;
  input_schema: JsonSchema;
  strict?: boolean;
  input_examples?: Array<Record<string, any>>;
}

export interface SkillMeta {
  name: string;
  title: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  source: 'builtin' | 'user';
}

export interface SkillPackage {
  meta: SkillMeta;
  tool: ToolDefinition;
  /** 用于“子模型调用/提示模板”的 prompt（用户导入技能或内置技能都可带） */
  promptMarkdown: string;
  /** 支持资源文件（可选）：路径 -> dataURL/base64 */
  assets?: Record<string, string>;
  enabled: boolean;
}

