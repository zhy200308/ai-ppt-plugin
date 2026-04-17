// ============================================================
//  统一 AI 服务 — 多平台调度 & PPT 操作指令解析
// ============================================================

import type {
  IAIProviderAdapter,
  AIProvider,
  AIRequestParams,
  AIResponse,
  ProviderConfig,
  StreamCallbacks,
} from './types';
import type {
  SlideOperation,
  PresentationInfo,
  SlideInfo,
  SelectionInfo,
  ShapeInfo,
  TextStyle,
} from '../adapters/interface';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleGeminiProvider } from './providers/google';
import { themeRegistry, resolveTheme } from '../themes';
import { loadAllSkills, toolDefsFromSkills, findSkill } from '../skills';
import { runClaudeToolLoop } from './claude-tools/runtime';
import { generateWordArtSvg, svgToPngBase64 } from './wordart';
import { saveWordArtAsset } from '../skills/builtins/wordart_store';

// ---- Context Scope ----

export type ContextScope = 'full' | 'current' | 'selection';

export interface PptContext {
  scope: ContextScope;
  presentation?: PresentationInfo | null;
  currentSlide?: SlideInfo | null;
  selection?: SelectionInfo | null;
  capturedAt?: number;
}

export interface EnterpriseThemeSpec {
  themeName?: string;
  primaryColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  fontFamily?: string;
  styleSummary?: string;
  layoutRules?: string[];
}

export interface EnterprisePagePlan {
  pageNumber: number;
  title: string;
  purpose?: string;
  contentSummary?: string;
  designNotes?: string;
  targetMode?: 'replace' | 'append' | 'create';
}

export interface EnterpriseDeckPlan {
  totalPages: number;
  theme: EnterpriseThemeSpec;
  pages: EnterprisePagePlan[];
}

// ============================================================
//  Style Wizard（生成前风格决策）
// ============================================================

export type LanguageTone = 'default' | 'academic' | 'business' | 'teaching';
export type TableStyle = 'default' | 'academic' | 'finance' | 'teaching';
export type LayoutPreset = 'standard' | 'defense' | 'report' | 'teaching';

export interface StyleOption {
  id: string;
  name: string;
  summary: string;
  theme: EnterpriseThemeSpec;
  languageTone: LanguageTone;
  tableStyle: TableStyle;
  layoutPreset: LayoutPreset;
}

export interface StyleOptionsResult {
  recommendedId?: string;
  options: StyleOption[];
}

// ============================================================
//  Clarifications（高级问题澄清列表）
// ============================================================

export type ClarificationKind = 'text' | 'select' | 'boolean';

export interface ClarificationItem {
  id: string;
  question: string;
  kind: ClarificationKind;
  options?: string[];
  required?: boolean;
}

export const SCOPE_LABELS: Record<ContextScope, string> = {
  full: '整个 PPT',
  current: '当前页',
  selection: '选中内容',
};

const ENTERPRISE_PAGE_MODE_RE = /(企业版|企业版本|按页|逐页|每一页|整套|全套|全部\d*页|完整\d*页|重新生成|统一风格|整份|封面|目录|致谢|总结与展望)/i;

/** 估算 token 数 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const otherChars = text.length - chineseChars;
  return chineseChars + Math.ceil(otherChars / 4);
}

// ---- Provider 注册表 ----

const providerAdapters: Record<AIProvider, IAIProviderAdapter> = {
  openai:          new OpenAICompatibleProvider('openai'),
  deepseek:        new OpenAICompatibleProvider('deepseek'),
  qwen:            new OpenAICompatibleProvider('qwen'),
  'openai-relay':  new OpenAICompatibleProvider('openai-relay'),
  anthropic:       new AnthropicProvider(),
  'claude-relay':  new AnthropicProvider(),     // 使用 Anthropic 协议（URL 拼接 + 鉴权方式由 config 决定）
  google:          new GoogleGeminiProvider(),
};

function getAdapter(provider: AIProvider): IAIProviderAdapter {
  const adapter = providerAdapters[provider];
  if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);
  return adapter;
}

// ---- System Prompt ----

const SYSTEM_PROMPT = `你是一个专业的 PPT 助手，运行在 PowerPoint / WPS 演示插件内。
你的核心能力是根据用户的自然语言指令，理解并修改当前打开的演示文稿。

## 你的工作方式

1. 用户会提供当前 PPT 的结构信息（每页的文本内容、形状ID等）
2. 用户可能上传参考文档，你需要理解文档内容并据此修改 PPT
3. 你需要返回具体的操作指令来修改 PPT

## 企业级生成原则（必须遵守）

1. **先定风格，再生成内容**：当用户尚未确认主题/模版/配色/受众等关键要素时，必须先输出 "json:questions" 让用户确认；确认后再生成 operations。
2. **模版驱动布局**：优先使用内置版式插件（callPlugin）生成稳定布局，避免每页随机摆放导致不可控。
3. **页型收敛**：优先按 5 类基础页型组织：Title / Agenda / Content / Section / Conclusion，并在生成时保持风格一致。
4. **严格遵循约束**：主题色、背景图（场景）、页数范围、仅改某一页/元素、语言风格（学术/汇报/教学）等都是硬性要求。

## 输出格式

### A) 当信息不足，需要用户确认时

你必须输出一个“待确认问题列表”，用于前端在聊天框上方渲染并让用户逐条填写。
只输出一个代码块，不要输出自然语言解释：

\`\`\`json:questions
{
  "questions": [
    {"id":"audience","question":"这份 PPT 的受众是谁？","kind":"text","required":true},
    {"id":"theme","question":"请选择主题风格","kind":"select","options":["Edu Thesis Blue","Edu Defense Green","Minimal Light"],"required":true},
    {"id":"need_images","question":"是否需要生成场景背景图？","kind":"boolean","required":false}
  ]
}
\`\`\`

规则：
- 仅在“无法安全生成或会显著偏离用户意图”时才输出 questions；
- questions 必须尽量少，但覆盖关键缺口；
- id 必须稳定可读（小写字母/下划线）；
- kind 只允许 text/select/boolean；
- select 必须给 options；

### B) 当需要修改 PPT 时

当需要修改 PPT 时，你必须在回复中包含一个 JSON 操作块，格式如下：

\`\`\`json:operations
[
  {"action": "updateText", "slideIndex": 0, "shapeId": "title1", "text": "新标题", "style": {"bold": true, "color": "#0066CC"}},
  {"action": "insertText", "params": {"slideIndex": 1, "text": "新内容", "left": 60, "top": 200, "width": 840, "height": 100}},
  {"action": "addSlide", "afterIndex": 2},
  {"action": "callPlugin", "slideIndex": 3, "pluginId": "title-content", "args": {"title": "关键结论", "bullets": ["要点1", "要点2"]}},
  {"action": "deleteShape", "slideIndex": 1, "shapeId": "shape5"},
  {"action": "setNotes", "slideIndex": 0, "notes": "演讲备注"},
  {"action": "setBackground", "slideIndex": 0, "color": "#F0F4F8"}
]
\`\`\`

## 支持的操作

- updateText: 更新已有文本框内容和样式
- updateGeometry: 更新形状位置/尺寸（Web 预览区拖拽/缩放会用到）
- insertText: 插入新文本框
- insertImage: 插入图片
- replaceImage: 替换图片内容（Web 端用于艺术字/插图二次编辑）
- deleteShape: 删除形状
- callPlugin: 调用内置页面操作插件（用于快速生成常见版式/组件）
- addSlide: 添加新幻灯片
- deleteSlide: 删除幻灯片
- reorderSlide: 调整幻灯片顺序
- setNotes: 设置备注
- setBackground: 设置背景

### callPlugin 可用插件列表（pluginId）

- cover：封面（args: title, subtitle?, author?, date?）
- section：章节页（args: title, subtitle?）
- title-content：标题+要点（args: title, bullets?: string[], body?: string）
- two-column：双栏对比（args: title, leftTitle?, leftBullets?: string[], rightTitle?, rightBullets?: string[], imageKeyword?: string）
- image-text：图文排版，左图右文或左文右图（args: title, content, imageKeyword: string, imagePosition?: 'left'|'right'）
- big-number：大字报/核心数据（args: number, title, subtitle?）
- grid-4：四象限/四宫格（args: title, items: [{title, content}]）
- thank-you：致谢页（args: title?, contact?）
- auto-layout：自定义弹性布局（高级用法，args: { layout: SlideLayoutNode }）
- bg-image：生成并应用背景图（args: prompt, apply="background"）

## 重要规则

- 必须严格遵循用户最新指令中的硬性要求（例如：主题色、背景图、场景风格、页数范围、仅改某一页等）。如做不到，必须在输出前先提出澄清问题。
- 在决定页面排版前，建议先思考内容的逻辑结构，然后再选择最合适的 callPlugin 模板。如果需要配图，必须在 args 中提供 imageKeyword（英文）。
- 只要用户要求你修改 PPT，就必须输出可执行的 JSON 操作块，不能只给文字建议
- 默认只输出 \`\`\`json:operations ... \`\`\` 代码块，不要输出说明文字、页名列表、总结或“我将分批输出”等自然语言
- 操作块必须使用 \`\`\`json:operations 包裹，且内容必须是合法 JSON 数组
- 如果内容很多，也要直接输出操作 JSON；不要先输出目录说明再输出操作
- 只有当用户的问题不明确、无法安全执行时，才可以先提问确认
- 修改文本时保持专业的排版和用语
- 如果用户上传了参考文档，仔细理解文档内容后再修改 PPT
- updateText 只能使用上下文中明确出现过的真实 shapeId，严禁猜测不存在的 shapeId
- 如果拿不到可靠的 shapeId，请改用 insertText / addSlide / setBackground 等更稳妥的操作
- 文本样式字段只使用这些键：fontSize, fontFamily, bold, italic, underline, color, alignment, backgroundColor, lineSpacing
- 使用 alignment，不要使用 align；不要输出插件未支持的任意自定义字段
- 不要直接声称“我已经修改完成”，而是输出待应用的操作，由用户确认后再应用`;

// ---- 上下文构建 ----

function buildContextMessage(
  ctx: PptContext,
  documentContext?: string,
  sessionContext?: string,
): string {
  let text = '';

  const slideCount = ctx.presentation?.slideCount ?? 0;
  const currentSlideIndex = ctx.currentSlide ? ctx.currentSlide.index + 1 : null;
  const selectionCount = ctx.selection?.hasSelection ? ctx.selection.shapes.length : 0;

  text += '## 当前工作区快照\n\n';
  text += `- 聚焦模式: ${SCOPE_LABELS[ctx.scope]}\n`;
  if (slideCount > 0) {
    text += `- 演示文稿总页数: ${slideCount} 页\n`;
  }
  if (currentSlideIndex !== null) {
    text += `- 当前活动页: 第 ${currentSlideIndex} 页\n`;
  }
  text += `- 当前选中元素: ${selectionCount} 项\n`;
  if (ctx.capturedAt) {
    text += `- 上下文采集时间: ${new Date(ctx.capturedAt).toLocaleString('zh-CN', { hour12: false })}\n`;
  }
  text += '\n';

  if (ctx.selection?.hasSelection) {
    text += '## 当前选中内容摘要\n\n';
    for (const shape of ctx.selection.shapes) {
      text += `- [${shape.type}] 第 ${ctx.selection.slideIndex + 1} 页 · id="${shape.id}" · name="${shape.name}"`;
      if (shape.text) text += ` · 内容: "${shape.text.slice(0, 160)}"`;
      text += '\n';
    }
    text += '\n';
  }

  if (ctx.scope === 'full' && ctx.presentation) {
    text += `## 当前 PPT 结构（完整读取，共 ${ctx.presentation.slideCount} 页）\n\n`;
    for (const slide of ctx.presentation.slides) {
      text += formatSlide(slide);
    }
  }

  else if (ctx.scope === 'current') {
    const slide = ctx.currentSlide;
    if (slide) {
      text += `## 当前页（第 ${slide.index + 1} 页，ID: ${slide.id}）\n\n`;
      text += formatSlide(slide, true);
    }

    if (ctx.presentation) {
      text += `\n## 其他页面概览（仅标题，共 ${ctx.presentation.slideCount} 页）\n\n`;
      for (const s of ctx.presentation.slides) {
        if (s.index === slide?.index) continue;
        const titleShape = s.shapes.find((sh) => sh.text);
        const titlePreview = titleShape?.text?.slice(0, 50) ?? '(无文本)';
        text += `- 第 ${s.index + 1} 页: ${titlePreview}\n`;
      }
    }
  }

  else if (ctx.scope === 'selection') {
    const sel = ctx.selection;
    if (sel?.hasSelection && sel.shapes.length > 0) {
      text += `## 当前选中的形状（在第 ${sel.slideIndex + 1} 页，共 ${sel.shapes.length} 个）\n\n`;
      for (const shape of sel.shapes) {
        text += `- [${shape.type}] id="${shape.id}" name="${shape.name}"\n`;
        text += `  位置: left=${Math.round(shape.left)}, top=${Math.round(shape.top)}, `;
        text += `width=${Math.round(shape.width)}, height=${Math.round(shape.height)}\n`;
        if (shape.text) {
          text += `  内容: "${shape.text}"\n`;
        }
        text += '\n';
      }

      if (ctx.currentSlide) {
        const others = ctx.currentSlide.shapes.filter(
          (s) => !sel.shapeIds.includes(s.id),
        );
        if (others.length > 0) {
          text += `## 同一页的其他元素（供参考，请勿修改除非明确要求）\n\n`;
          for (const s of others) {
            if (s.text) {
              text += `- [${s.type}] id="${s.id}": "${s.text.slice(0, 100)}"\n`;
            }
          }
          text += '\n';
        }
      }
    } else {
      text += `## 提示：用户没有选中任何形状，已退化为"当前页"模式\n\n`;
      if (ctx.currentSlide) {
        text += `### 当前页（第 ${ctx.currentSlide.index + 1} 页）\n\n`;
        text += formatSlide(ctx.currentSlide, true);
      }
    }
  }

  if (documentContext) {
    text += '\n## 用户上传的参考文档\n\n';
    text += documentContext + '\n\n';
  }

  if (sessionContext) {
    text += '\n## 对话上下文管理\n\n';
    text += sessionContext + '\n\n';
  }

  return text;
}

function formatSlide(slide: SlideInfo, detailed = false): string {
  let text = `### 第 ${slide.index + 1} 页 (ID: ${slide.id})\n`;
  if (slide.layoutName) text += `布局: ${slide.layoutName}\n`;

  for (const shape of slide.shapes) {
    if (shape.text || detailed) {
      text += `- [${shape.type}] id="${shape.id}" name="${shape.name}"`;
      if (detailed) {
        text += ` · 位置(${Math.round(shape.left)},${Math.round(shape.top)}) · 尺寸(${Math.round(shape.width)}×${Math.round(shape.height)})`;
      }
      if (shape.text) {
        const preview = detailed ? shape.text : shape.text.slice(0, 200);
        text += `: "${preview}"`;
      }
      text += '\n';
    }
  }

  if (slide.notes) {
    text += `备注: "${slide.notes.slice(0, 200)}"\n`;
  }

  text += '\n';
  return text;
}

// ---- 操作指令解析 ----

export function parseOperations(content: string): SlideOperation[] {
  const fencedPatterns = [
    /```json:operations\s*\n([\s\S]*?)```/i,
    /```json\s*\n([\s\S]*?)```/i,
    /```\s*\n([\s\S]*?)```/i,
  ];

  for (const pattern of fencedPatterns) {
    const match = pattern.exec(content);
    const parsed = normalizeOperations(tryParseOperationsBlock(match?.[1]));
    if (parsed.length > 0) return parsed;
  }

  const arrayMatch = content.match(/\[\s*\{[\s\S]*"action"[\s\S]*\}\s*\]/);
  const fallbackParsed = normalizeOperations(tryParseOperationsBlock(arrayMatch?.[0]));
  if (fallbackParsed.length > 0) return fallbackParsed;

  return [];
}

export function hasOperationsStarted(content: string): boolean {
  return /json:operations|```json|"\s*action"\s*:|\{\s*"action"\s*:|\[\s*\{/i.test(content);
}

export function isLikelyIncompleteOperations(content: string): boolean {
  if (!hasOperationsStarted(content) || parseOperations(content).length > 0) {
    return false;
  }

  const trimmed = content.trim();
  const codeFenceCount = (trimmed.match(/```/g) ?? []).length;
  const openBrackets = (trimmed.match(/\[/g) ?? []).length;
  const closeBrackets = (trimmed.match(/\]/g) ?? []).length;
  const openBraces = (trimmed.match(/\{/g) ?? []).length;
  const closeBraces = (trimmed.match(/\}/g) ?? []).length;

  return (
    codeFenceCount % 2 === 1 ||
    openBrackets > closeBrackets ||
    openBraces > closeBraces ||
    /[:,{\[]\s*$/.test(trimmed) ||
    /"[^"]*$/.test(trimmed)
  );
}

function getOperationsCandidateBlock(content: string): string | undefined {
  const fenceMatch = content.match(/```json:operations\s*\n([\s\S]*)$/i)
    || content.match(/```json\s*\n([\s\S]*)$/i)
    || content.match(/```\s*\n([\s\S]*)$/i);
  if (fenceMatch?.[1]) return fenceMatch[1];

  const actionIdx = content.search(/"action"\s*:/i);
  if (actionIdx >= 0) {
    const arrayStart = content.lastIndexOf('[', actionIdx);
    if (arrayStart >= 0) return content.slice(arrayStart);
  }

  return undefined;
}

export function extractCompleteOperationsFromPartial(content: string): SlideOperation[] {
  const candidate = getOperationsCandidateBlock(content);
  if (!candidate) return [];

  const arrayStart = candidate.indexOf('[');
  if (arrayStart < 0) return [];

  const text = candidate.slice(arrayStart);
  const operations: SlideOperation[] = [];
  let inString = false;
  let escaped = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let objectStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === '{') {
      if (bracketDepth === 1 && braceDepth === 0) {
        objectStart = i;
      }
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (bracketDepth === 1 && braceDepth === 0 && objectStart >= 0) {
        const objectText = text.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objectText);
          if (parsed && typeof parsed === 'object' && 'action' in parsed) {
            operations.push(parsed as SlideOperation);
          }
        } catch {
          // Ignore incomplete or invalid trailing object.
        }
        objectStart = -1;
      }
    }
  }

  return normalizeOperations(operations);
}

function getOperationSlideIndex(op: SlideOperation): number | null {
  switch (op.action) {
    case 'updateText':
    case 'deleteShape':
    case 'deleteSlide':
    case 'setNotes':
    case 'setBackground':
      return op.slideIndex;
    case 'insertText':
    case 'insertImage':
      return op.params.slideIndex;
    case 'addSlide':
      return op.afterIndex !== undefined ? op.afterIndex + 1 : null;
    case 'reorderSlide':
      return op.toIndex;
    default:
      return null;
  }
}

export interface OperationBatch {
  batchKey: string;
  slideIndex: number | null;
  operations: SlideOperation[];
}

export function groupOperationsBySequentialSlide(operations: SlideOperation[]): OperationBatch[] {
  const batches: OperationBatch[] = [];
  let current: OperationBatch | null = null;

  operations.forEach((op, index) => {
    const slideIndex = getOperationSlideIndex(op);
    const batchKey = `${slideIndex ?? 'global'}:${index}`;

    if (!current || current.slideIndex !== slideIndex) {
      current = {
        batchKey,
        slideIndex,
        operations: [op],
      };
      batches.push(current);
      return;
    }

    current.operations.push(op);
  });

  return batches;
}

export function normalizeOperations(operations: SlideOperation[], ctx?: PptContext): SlideOperation[] {
  return operations
    .map((op) => normalizeOperation(op, ctx))
    .filter((op): op is SlideOperation => Boolean(op));
}

function normalizeOperation(op: SlideOperation, ctx?: PptContext): SlideOperation | null {
  switch (op.action) {
    case 'updateText': {
      const style = normalizeTextStyle(op.style);
      const resolvedShape = resolveTargetShape(op.slideIndex, op.shapeId, ctx);
      if (resolvedShape) {
        return {
          ...op,
          shapeId: resolvedShape.id,
          style,
        };
      }

      return {
        action: 'insertText',
        params: buildFallbackInsertParams(op.slideIndex, op.text, style, ctx),
      };
    }
    case 'insertText':
      const insertStyle = normalizeTextStyle(op.params.style ?? (op as any).style);
      return {
        ...op,
        params: {
          ...op.params,
          style: insertStyle,
        },
      };
    case 'insertImage':
      return op;
    case 'deleteShape': {
      const resolvedShape = resolveTargetShape(op.slideIndex, op.shapeId, ctx);
      return resolvedShape ? { ...op, shapeId: resolvedShape.id } : null;
    }
    case 'setBackground':
    case 'setNotes':
    case 'addSlide':
    case 'deleteSlide':
    case 'reorderSlide':
      return op;
    default:
      return op;
  }
}

function normalizeTextStyle(style: unknown): TextStyle | undefined {
  if (!style || typeof style !== 'object') return undefined;

  const raw = style as Record<string, unknown>;
  const alignment = normalizeAlignment(raw.alignment ?? raw.align);

  const normalized: TextStyle = {
    fontSize: toPositiveNumber(raw.fontSize),
    fontFamily: asString(raw.fontFamily),
    bold: asBoolean(raw.bold),
    italic: asBoolean(raw.italic),
    underline: asBoolean(raw.underline),
    color: normalizeColor(raw.color),
    alignment,
    backgroundColor: normalizeColor(raw.backgroundColor),
    lineSpacing: toPositiveNumber(raw.lineSpacing),
  };

  const entries = Object.entries(normalized).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as TextStyle : undefined;
}

function normalizeAlignment(value: unknown): TextStyle['alignment'] | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'left' || normalized === 'center' || normalized === 'right') {
    return normalized;
  }
  return undefined;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function resolveTargetShape(slideIndex: number, requestedShapeId: string, ctx?: PptContext): ShapeInfo | null {
  const slide = getSlideFromContext(slideIndex, ctx);
  if (!slide) return null;

  const exact = slide.shapes.find((shape) => shape.id === requestedShapeId);
  if (exact) return exact;

  if (ctx?.selection?.hasSelection && ctx.selection.slideIndex === slideIndex) {
    const selectedTextShapes = ctx.selection.shapes.filter((shape) => shape.type === 'textBox' || shape.text);
    if (selectedTextShapes.length === 1) return selectedTextShapes[0];
  }

  const textShapes = slide.shapes
    .filter((shape) => shape.type === 'textBox' || shape.text)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  if (textShapes.length === 1) return textShapes[0];
  return textShapes[0] ?? null;
}

function getSlideFromContext(slideIndex: number, ctx?: PptContext): SlideInfo | null {
  if (!ctx) return null;
  if (ctx.currentSlide?.index === slideIndex) return ctx.currentSlide;
  return ctx.presentation?.slides.find((slide) => slide.index === slideIndex) ?? null;
}

function buildFallbackInsertParams(
  slideIndex: number,
  text: string,
  style: TextStyle | undefined,
  ctx?: PptContext,
) {
  const width = ctx?.presentation?.slideWidth ?? 960;
  const shortText = text.trim().length <= 40;
  const defaultWidth = Math.round(width * 0.78);
  const left = Math.round((width - defaultWidth) / 2);

  return {
    slideIndex,
    text,
    left,
    top: shortText ? 70 : 120,
    width: defaultWidth,
    height: shortText ? 72 : 220,
    style,
  };
}

export function shouldUseEnterprisePageMode(userMessage: string, ctx?: PptContext): boolean {
  const normalized = userMessage.trim();
  if (!normalized) return false;
  if (ENTERPRISE_PAGE_MODE_RE.test(normalized)) return true;

  const slideCount = ctx?.presentation?.slideCount ?? 0;
  return slideCount >= 6 && /(生成|改写|重做|重构|统一|重排|重置|设计)/.test(normalized);
}

export function parseEnterpriseDeckPlan(content: string): EnterpriseDeckPlan | null {
  const block = extractJsonBlock(content, ['ppt-plan', 'json:ppt-plan', 'json']);
  if (!block) return null;

  try {
    const parsed = JSON.parse(block) as EnterpriseDeckPlan;
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) return null;
    const pages = parsed.pages
      .map((page, idx) => {
        const targetMode: EnterprisePagePlan['targetMode'] =
          page.targetMode === 'append' || page.targetMode === 'create'
            ? page.targetMode
            : 'replace';

        return {
        pageNumber: typeof page.pageNumber === 'number' ? page.pageNumber : idx + 1,
        title: String(page.title ?? `第 ${idx + 1} 页`),
        purpose: page.purpose ? String(page.purpose) : undefined,
        contentSummary: page.contentSummary ? String(page.contentSummary) : undefined,
        designNotes: page.designNotes ? String(page.designNotes) : undefined,
          targetMode,
        };
      })
      .sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      totalPages: typeof parsed.totalPages === 'number' && parsed.totalPages > 0 ? parsed.totalPages : pages.length,
      theme: parsed.theme ?? {},
      pages,
    };
  } catch {
    return null;
  }
}

export function parseStyleOptions(content: string): StyleOptionsResult | null {
  const block = extractJsonBlock(content, ['style-options', 'json:style-options', 'json']);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block) as StyleOptionsResult;
    if (!parsed || !Array.isArray(parsed.options) || parsed.options.length === 0) return null;
    return {
      recommendedId: typeof parsed.recommendedId === 'string' ? parsed.recommendedId : undefined,
      options: parsed.options
        .map((o, idx) => ({
          id: String(o.id ?? `opt-${idx + 1}`),
          name: String(o.name ?? `方案 ${idx + 1}`),
          summary: String((o as any).summary ?? ''),
          theme: (o as any).theme ?? {},
          languageTone: (o as any).languageTone ?? 'default',
          tableStyle: (o as any).tableStyle ?? 'default',
          layoutPreset: (o as any).layoutPreset ?? 'standard',
        }))
        .slice(0, 6),
    };
  } catch {
    return null;
  }
}

export function parseClarifications(content: string): { questions: ClarificationItem[] } | null {
  const block = extractJsonBlock(content, ['questions', 'json:questions', 'clarifications', 'json:clarifications', 'json']);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    const arr: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const questions: ClarificationItem[] = arr
      .map((q, idx) => {
        const kind = q?.kind === 'select' || q?.kind === 'boolean' ? q.kind : 'text';
        const options = kind === 'select' && Array.isArray(q?.options)
          ? q.options.map((s: any) => String(s)).filter(Boolean)
          : undefined;
        return {
          id: String(q?.id ?? `q_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
          question: String(q?.question ?? ''),
          kind,
          options,
          required: Boolean(q?.required),
        };
      })
      .filter((q) => q.question.trim().length > 0);

    return questions.length > 0 ? { questions } : null;
  } catch {
    return null;
  }
}

function extractJsonBlock(content: string, tags: string[]): string | null {
  for (const tag of tags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\`\`\`${escaped}\\s*\\n([\\s\\S]*?)\`\`\``, 'i');
    const match = content.match(regex);
    if (match?.[1]) return match[1].trim();
  }

  const genericJson = content.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (genericJson?.[1]) return genericJson[1].trim();
  return null;
}

export function extractTextContent(content: string): string {
  return content
    .replace(/```json:operations\s*\n[\s\S]*?```/g, '')
    .replace(/```json\s*\n\[[\s\S]*?\]\s*```/g, '')
    .replace(/```json:questions\s*\n[\s\S]*?```/g, '')
    .replace(/```questions\s*\n[\s\S]*?```/g, '')
    .replace(/```style-options\s*\n[\s\S]*?```/g, '')
    .trim();
}

function tryParseOperationsBlock(block?: string): SlideOperation[] {
  if (!block) return [];

  const trimmed = block.trim();
  if (!trimmed) return [];

  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json(?::operations)?)?/i, '').replace(/```$/i, '').trim(),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((item) => item && typeof item === 'object' && 'action' in item)) {
        return parsed as SlideOperation[];
      }
    } catch {
      // continue
    }
  }

  return [];
}

// ---- 主服务类 ----

export class AIService {
  private _config: ProviderConfig;
  private _adapter: IAIProviderAdapter;

  constructor(config: ProviderConfig) {
    this._config = config;
    this._adapter = getAdapter(config.provider);
  }

  setConfig(config: ProviderConfig): void {
    this._config = config;
    this._adapter = getAdapter(config.provider);
  }

  private _buildMessages(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
    extraSystemMessages: string[] = [],
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): { messages: AIRequestParams['messages']; contextTokens: number } {
    const contextMsg = buildContextMessage(pptContext, documentContext, sessionContext);
    const contextTokens = estimateTokens(contextMsg);

    const availableThemes = themeRegistry.all()
      .slice(0, 30)
      .map((t) => ({ id: t.id, name: t.name, primaryColor: t.primaryColor, backgroundColor: t.backgroundColor, accentColor: t.accentColor, fontFamily: t.fontFamily }));

    const styleSystem = styleProfile
      ? [
          '## 风格锁定（必须严格遵守）',
          styleProfile.themeSpec ? `主题规范：${JSON.stringify(styleProfile.themeSpec)}` : '',
          styleProfile.languageTone ? `语言风格：${styleProfile.languageTone}` : '',
          styleProfile.tableStyle ? `表格风格：${styleProfile.tableStyle}` : '',
          styleProfile.layoutPreset ? `布局预设：${styleProfile.layoutPreset}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const themeCatalogSystem = [
      '## 可用主题列表（你必须从中选择或严格遵守用户锁定的主题）',
      JSON.stringify(availableThemes, null, 2),
      '规则：当用户说“使用内置主题/某某主题/教育答辩风格”等，优先选用与其最匹配的主题；若已锁定 themeSpec，则不得自行更改。',
    ].join('\n');

    const messages: AIRequestParams['messages'] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...extraSystemMessages.map((content) => ({ role: 'system' as const, content })),
    ];
    if (contextMsg) messages.push({ role: 'system', content: contextMsg });
    if (styleSystem) messages.push({ role: 'system', content: styleSystem });
    messages.push({ role: 'system', content: themeCatalogSystem });

    try {
      const { useStore } = require('../store');
      const canvaConfig = useStore.getState().canvaConfig;
      if (canvaConfig && canvaConfig.enabled && canvaConfig.accessToken && Object.keys(canvaConfig.templates).length > 0) {
        const canvaSystem = [
          '\n## Canva Brand Templates (可用的高级版式)',
          '当前系统已配置了高级 Canva 模板，你可以使用 pluginId="canva-render" 插件。',
          '可用模板映射如下（key是模板名，value是ID）：',
          JSON.stringify(canvaConfig.templates, null, 2),
          '当你想使用某个版式时（比如 "cover" 或 "two-column"），如果映射中存在，你可以生成类似下面的指令：',
          `{
  "action": "callPlugin",
  "slideIndex": 0,
  "pluginId": "canva-render",
  "args": {
    "templateId": "DAxxxxxx",
    "title": "这一页的主标题",
    "textVariables": { "title": "主标题", "subtitle": "副标题等" }
  }
}`
        ].join('\n');
        messages.push({ role: 'system', content: canvaSystem });
      }
    } catch (e) {
      // ignore
    }

    messages.push(...history);
    messages.push({ role: 'user', content: userMessage });
    return { messages, contextTokens };
  }

  private _needsBackgroundImage(userMessage: string): boolean {
    return /(背景图|背景圖片|场景图|场景圖片|作为背景|图片背景|插图|配图|生成图片|生成圖)/.test(userMessage);
  }

  private _needsThemeColor(userMessage: string): boolean {
    return /(主题色|主题颜色|统一配色|配色方案|主色|辅色|企业色)/.test(userMessage);
  }

  private _validateOps(userMessage: string, ops: SlideOperation[], styleProfile?: { themeSpec?: EnterpriseThemeSpec }): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (this._needsBackgroundImage(userMessage)) {
      const hasImg = ops.some((op) =>
        (op.action === 'insertImage') ||
        (op.action === 'setBackground' && Boolean((op as any).imageBase64)),
      );
      if (!hasImg) issues.push('用户要求背景/场景图片，但操作中没有 insertImage 或 setBackground(imageBase64)。');
    }

    if (this._needsThemeColor(userMessage) || styleProfile?.themeSpec) {
      const theme = styleProfile?.themeSpec ? resolveTheme(styleProfile.themeSpec) : undefined;
      const hasColor = ops.some((op) => {
        if (op.action === 'setBackground' && (op as any).color) return true;
        if (op.action === 'insertText' && op.params?.style?.color) return true;
        if (op.action === 'updateText' && (op as any).style?.color) return true;
        return false;
      });
      if (!hasColor) issues.push('用户要求主题色/统一配色，但操作中几乎没有设置颜色（setBackground 或文本颜色）。');
      if (theme) {
        const usesPrimary = ops.some((op) => {
          if (op.action === 'setBackground' && (op as any).color?.toUpperCase() === theme.backgroundColor) return true;
          if (op.action === 'insertText' && op.params?.style?.color?.toUpperCase() === theme.primaryColor) return true;
          if (op.action === 'updateText' && (op as any).style?.color?.toUpperCase() === theme.primaryColor) return true;
          return false;
        });
        if (!usesPrimary) issues.push(`已锁定主题，但操作未明显使用主题主色 ${theme.primaryColor}。`);
      }
    }

    return { ok: issues.length === 0, issues };
  }

  private async _repairOperationsIfNeeded(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext: string | undefined,
    sessionContext: string | undefined,
    ops: SlideOperation[],
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): Promise<SlideOperation[]> {
    const check = this._validateOps(userMessage, ops, styleProfile);
    if (check.ok) return ops;

    const repairSystem = [
      '你上一轮输出的操作未能满足用户硬性要求，需要你“修复操作”。',
      '你必须只输出一个 ```json:operations 代码块（合法 JSON 数组），不要解释。',
      '请根据以下问题修复：',
      ...check.issues.map((s, i) => `${i + 1}. ${s}`),
      '规则：',
      '- 尽量在原有基础上补齐缺失操作（例如补 setBackground / insertImage / 调整文本颜色），不要完全推翻重做；',
      '- 如需要背景图，但你无法直接提供 base64，请用 callPlugin 插件 "bg-image" 输出图片生成指令：',
      '  {"action":"callPlugin","slideIndex":0,"pluginId":"bg-image","args":{"prompt":"图片提示词","apply":"background"}}',
      '- 必须遵守锁定主题（如有）。',
    ].join('\n');

    const { messages } = this._buildMessages(
      userMessage,
      history.slice(-8),
      pptContext,
      documentContext,
      sessionContext,
      [repairSystem],
      styleProfile,
    );

    const response = await this._adapter.chat({ messages }, this._config);
    const repaired = normalizeOperations(parseOperations(response.content), pptContext);
    return repaired.length > 0 ? repaired : ops;
  }

  async generateStyleOptions(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
  ): Promise<{ result: StyleOptionsResult; response: AIResponse; contextTokens: number }> {
    const styleSystem = [
      '你现在进入“生成前风格决策（Style Wizard）”模式。',
      '目标：为用户需求提供 3 套可选的主题/配色/字体/语言风格/表格风格/布局预设。',
      '只输出一个 ```style-options 代码块，不要输出任何自然语言说明。',
      '输出 JSON 结构如下：',
      '{',
      '  "recommendedId": "opt-1",',
      '  "options": [',
      '    {',
      '      "id": "opt-1",',
      '      "name": "方案名称",',
      '      "summary": "一句话概述风格与适用场景",',
      '      "theme": { "themeName": "Edu Thesis Blue", "primaryColor": "#0F4C81", "backgroundColor": "#FFFFFF", "accentColor": "#2563EB", "fontFamily": "微软雅黑" },',
      '      "languageTone": "academic",',
      '      "tableStyle": "academic",',
      '      "layoutPreset": "defense"',
      '    }',
      '  ]',
      '}',
      '要求：',
      '1) options 必须正好 3 套；2) 每套主题颜色必须给出可用的 hex；3) 风格要显著不同且都合理；4) 优先教育/答辩/教学/学术汇报场景。',
    ].join('\n');

    const { messages, contextTokens } = this._buildMessages(
      userMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      [styleSystem],
    );

    const response = await this._adapter.chat({ messages }, this._config);
    const result = parseStyleOptions(response.content);
    if (!result) throw new Error('未能解析 style-options，请重试');
    return { result, response, contextTokens };
  }

  async generateDeckPlan(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): Promise<{ plan: EnterpriseDeckPlan; response: AIResponse; contextTokens: number }> {
    const plannerSystem = [
      '【Researcher & Copywriter Agent 模式】',
      '任务：作为研究员和资深文案，先为整套 PPT 生成一份极其严密的页级逻辑蓝图 (Markdown大纲转结构化JSON)。',
      '只输出一个 ```ppt-plan 代码块，不要输出任何自然语言说明。',
      '输出 JSON 结构如下：',
      '{',
      '  "totalPages": 12,',
      '  "theme": {',
      '    "themeName": "主题名称",',
      '    "primaryColor": "#1A3C6E",',
      '    "backgroundColor": "#F0F4F8",',
      '    "accentColor": "#2B6CB0",',
      '    "fontFamily": "微软雅黑",',
      '    "styleSummary": "一句话概述整体风格",',
      '    "layoutRules": ["规则1", "规则2"]',
      '  },',
      '  "pages": [',
      '    {',
      '      "pageNumber": 1,',
      '      "title": "封面",',
      '      "purpose": "这一页的用途",',
      '      "contentSummary": "这一页需要呈现的核心要点（3-5条）、金句或数据，内容要详实且富有洞见",',
      '      "designNotes": "推荐的版式(如two-column, grid-4)和配图关键词(imageKeyword)",',
      '      "targetMode": "replace"',
      '    }',
      '  ]',
      '}',
      '要求：',
      '1. pages 必须覆盖整套页面，页码连续；',
      '2. targetMode 只允许 replace / append / create；',
      '3. contentSummary 必须深入扩写，不要只有一句话，要像专家一样提炼出每页的核心论点；',
      '4. 不要输出操作 JSON，不要输出解释。',
    ].join('\n');

    const { messages, contextTokens } = this._buildMessages(
      userMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      [plannerSystem],
      styleProfile,
    );

    const response = await this._adapter.chat({ messages }, this._config);
    const plan = parseEnterpriseDeckPlan(response.content);
    if (!plan) {
      throw new Error('未能解析页级蓝图，请重试或缩小需求范围');
    }

    return { plan, response, contextTokens };
  }

  async generatePageOperations(
    userMessage: string,
    plan: EnterpriseDeckPlan,
    page: EnterprisePagePlan,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): Promise<{ text: string; operations: SlideOperation[]; response: AIResponse; contextTokens: number }> {
    const pageSystem = [
      '【Art Director Agent 模式】',
      '任务：作为顶级美术指导，你现在的目标是将 Copywriter 提供的页面内容(contentSummary)映射到最合适的弹性排版(Layout)中。',
      '你必须只输出一个 ```json:operations 代码块。',
      `当前目标页: 第 ${page.pageNumber} 页 / 共 ${plan.totalPages} 页`,
      `目标页标题: ${page.title}`,
      `本页详实内容: ${page.contentSummary ?? '未提供'}`,
      `版式推荐与配图: ${page.designNotes ?? '未提供'}`,
      '主题规范：',
      JSON.stringify(plan.theme, null, 2),
      '核心规则：',
      '1. 优先使用 callPlugin 调用内置排版(如 two-column, image-text, grid-4, big-number)，将内容填入对应的参数中；',
      '2. 若内容包含需要配图或具象化表达的场景，必须在 callPlugin 中设置 imageKeyword="英文关键词"(如果需要图标，设置 imageKeyword="icon:lucide-zap" 等)；',
      '3. 【重要】如果需要生成高水准的背景图(如使用 bg-image 插件)，prompt 参数必须是专为 Flux/SDXL 优化的高质量生图提示词（全英文），例如："abstract cyberpunk technology background, dark blue gradient, glowing neon lines, isometric 3D, empty space for text, 8k resolution, masterpiece --ar 16:9"；',
      '4. 如果检测到有可用的 Canva 模板（参考下文的 Canva 模板列表），你也可以使用 canva-render 插件，将提取的内容填入 textVariables 字典中，获得降维打击的极高排版质量。',
      '5. 如果内置版式无法满足，使用 auto-layout 插件，自己编写 SlideLayoutNode 弹性布局结构；',
      '6. 必须输出合法 JSON 数组，不要解释。',
    ].join('\n');

    const pageUserMessage = [
      `原始用户需求：${userMessage}`,
      `请生成第 ${page.pageNumber} 页的最终操作。`,
      `这一页的标题是：${page.title}`,
      page.contentSummary ? `这一页要表达的内容：${page.contentSummary}` : '',
      page.designNotes ? `这一页的设计要求：${page.designNotes}` : '',
    ].filter(Boolean).join('\n');

    const { messages, contextTokens } = this._buildMessages(
      pageUserMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      [pageSystem],
      styleProfile,
    );

    const response = await this._adapter.chat({ messages }, this._config);
    const operationsRaw = normalizeOperations(parseOperations(response.content), pptContext);
    const operations = await this._repairOperationsIfNeeded(
      userMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      operationsRaw,
      styleProfile,
    );
    const text = extractTextContent(response.content);
    return { text, operations, response, contextTokens };
  }

  async chat(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): Promise<{ text: string; operations: SlideOperation[]; response: AIResponse; contextTokens: number }> {
    const { messages, contextTokens } = this._buildMessages(
      userMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      [],
      styleProfile,
    );

    const response = await this._adapter.chat({ messages }, this._config);
    const operations = normalizeOperations(parseOperations(response.content), pptContext);
    const text = extractTextContent(response.content);

    return { text, operations, response, contextTokens };
  }

  async chatStream(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: StreamCallbacks & {
      onOperations?: (ops: SlideOperation[]) => void;
      onContextReady?: (info: { tokens: number; scope: ContextScope }) => void;
    },
    pptContext: PptContext,
    documentContext?: string,
    sessionContext?: string,
    signal?: AbortSignal,
    styleProfile?: {
      themeSpec?: EnterpriseThemeSpec;
      languageTone?: LanguageTone;
      tableStyle?: TableStyle;
      layoutPreset?: LayoutPreset;
    },
  ): Promise<void> {
    const { messages, contextTokens } = this._buildMessages(
      userMessage,
      history,
      pptContext,
      documentContext,
      sessionContext,
      [],
      styleProfile,
    );

    callbacks.onContextReady?.({ tokens: contextTokens, scope: pptContext.scope });

    // ============================================================
    // Claude Tool Use（仅在显式 /skill-name 时启用，避免影响现有流式链路）
    // ============================================================
    if (this._config.protocol === 'anthropic' && userMessage.trim().startsWith('/')) {
      const m = userMessage.trim().match(/^\/([a-zA-Z0-9_-]{1,64})\s*(.*)$/);
      if (!m) throw new Error('无效的 /skill-name 格式');
      const skillName = m[1];
      const rest = (m[2] ?? '').trim();
      let input: Record<string, any> = {};
      if (rest) {
        try {
          input = JSON.parse(rest);
        } catch {
          // 允许用户直接写自然语言参数
          input = { text: rest };
        }
      }

      const skills = await loadAllSkills();
      const skill = findSkill(skills, skillName);
      if (!skill) {
        const msg = `未找到技能：${skillName}。请在“设置 → 技能”中导入或启用。`;
        callbacks.onCompleteRaw?.(msg, msg);
        callbacks.onComplete(msg);
        return;
      }

      // 若 required 参数缺失，则用 questions 交给前端补齐
      const required: string[] = Array.isArray(skill.tool.input_schema?.required)
        ? skill.tool.input_schema.required
        : [];
      const missing = required.filter((k) => input?.[k] === undefined || input?.[k] === null || String(input?.[k]).trim() === '');
      if (missing.length > 0) {
        const questions = {
          questions: missing.map((k) => ({
            id: k,
            question: `请提供参数：${k}`,
            kind: 'text',
            required: true,
          })),
        };
        const block = `\n\`\`\`json:questions\n${JSON.stringify(questions, null, 2)}\n\`\`\`\n`;
        callbacks.onCompleteRaw?.(block, block);
        callbacks.onComplete(block);
        return;
      }

      const tools = toolDefsFromSkills(skills, true);
      const user = skillName === 'wordart_generate'
        ? [
          `你正在执行技能：${skillName}`,
          `你必须先调用工具 ${skillName}。工具返回后，你必须输出一个 json:operations 代码块，将艺术字作为图片插入到当前页。`,
          `要求：插入图片时 params.name 必须设置为 "wordart:<assetId>"（assetId 来自 tool_result）。`,
          `插入位置建议：居中，宽度≈720，高度≈200（或按 tool_result 推荐尺寸折算）。`,
          `技能输入参数（JSON）：${JSON.stringify(input)}`,
        ].join('\n')
        : [
          `你正在执行技能：${skillName}`,
          `要求：你必须先调用工具 ${skillName}，并在收到 tool_result 后，将工具结果原样作为你的最终输出（尤其是 json:operations）。`,
          `技能输入参数（JSON）：${JSON.stringify(input)}`,
        ].join('\n');

      const toolLoop = await runClaudeToolLoop({
        config: this._config,
        messages: [
          ...messages,
          { role: 'user', content: user },
        ],
        tools,
        tool_choice: { type: 'tool', name: skillName },
        handler: async ({ name, input }) => {
          if (name !== skillName) {
            return { content: `未知工具：${name}`, is_error: true };
          }

          if (skillName === 'wordart_generate') {
            const theme = resolveTheme(styleProfile?.themeSpec);
            const assetId = crypto.randomUUID();
            const text = String((input as any)?.text ?? '').trim();
            if (!text) return { content: 'wordart_generate 缺少 text', is_error: true };
            const width = Number((input as any)?.width ?? 1200);
            const height = Number((input as any)?.height ?? 320);
            const svg = generateWordArtSvg({
              text,
              width,
              height,
              style: {
                primaryColor: String((input as any)?.style?.primaryColor ?? theme.primaryColor),
                accentColor: String((input as any)?.style?.accentColor ?? theme.accentColor),
                fontFamily: String((input as any)?.style?.fontFamily ?? theme.fontFamily),
              },
            });
            const pngBase64 = await svgToPngBase64(svg, width, height);
            await saveWordArtAsset({
              id: assetId,
              text,
              svg,
              pngBase64,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            return {
              content: JSON.stringify({
                assetId,
                pngBase64,
                mimeType: 'image/png',
                width,
                height,
              }),
            };
          }

          // 目前用户导入技能按“prompt 技能执行器”方式运行：内部再调用一次模型生成 operations
          const contextMsg = buildContextMessage(pptContext, documentContext, sessionContext);
          const sys = [
            '你是一个“技能执行器”。你将收到技能说明与输入参数，请产出最终可直接执行的 operations。',
            '要求：只输出一个 json:operations 代码块，不要解释。',
            '',
            '## 技能说明（prompt）',
            skill.promptMarkdown || '(无)',
          ].join('\n');

          const resp = await this._adapter.chat({
            messages: [
              { role: 'system', content: sys },
              ...(contextMsg ? [{ role: 'system' as const, content: contextMsg }] : []),
              { role: 'user', content: JSON.stringify(input ?? {}, null, 2) },
            ],
          }, this._config);

          const ops = normalizeOperations(parseOperations(resp.content), pptContext);
          const block = `\n\`\`\`json:operations\n${JSON.stringify(ops, null, 2)}\n\`\`\`\n`;
          return { content: block };
        },
      });

      const clean = extractTextContent(toolLoop.finalText) || toolLoop.finalText;
      callbacks.onCompleteRaw?.(toolLoop.finalText, clean);
      callbacks.onComplete(clean);
      return;
    }

    await this._adapter.chatStream({
      messages,
      stream: true,
      signal,
      callbacks: {
        onToken: callbacks.onToken,
        onComplete: (fullText) => {
          const operations = normalizeOperations(parseOperations(fullText), pptContext);
          const cleanText = extractTextContent(fullText);
          if (operations.length > 0 && callbacks.onOperations) {
            callbacks.onOperations(operations);
          }
          callbacks.onCompleteRaw?.(fullText, cleanText);
          callbacks.onComplete(cleanText);
        },
        onError: callbacks.onError,
      },
    }, this._config);
  }

  async testConnection(): Promise<import('./types').ConnectionTestResult> {
    return this._adapter.testConnection(this._config);
  }
}

// ---- 导出 ----

export * from './types';
export { setProxyConfig, getProxyConfig, detectSystemProxy, parseProxyUrl } from './proxy';
export { parseQuickSetup, generateProviderKey } from './quick-setup';
export * from './image';
