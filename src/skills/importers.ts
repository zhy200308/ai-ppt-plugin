import JSZip from 'jszip';
import type { SkillPackage, ToolDefinition } from './types';

function now() {
  return Date.now();
}

function safeName(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  if (!n) throw new Error('技能 name 为空');
  if (!/^[a-z0-9_-]{1,64}$/i.test(n)) throw new Error('技能 name 不符合规范（仅允许 a-zA-Z0-9_-，长度<=64）');
  return n;
}

function parseToolBlock(markdown: string): ToolDefinition {
  const m = markdown.match(/```(?:json:tool|tool)\s*([\s\S]*?)```/i);
  if (!m) throw new Error('未找到 ```json:tool 代码块');
  const json = JSON.parse(m[1]);
  if (!json?.name || !json?.description || !json?.input_schema) throw new Error('tool 定义缺少 name/description/input_schema');
  json.name = safeName(String(json.name));
  return json as ToolDefinition;
}

function stripToolBlock(markdown: string): string {
  return markdown.replace(/```(?:json:tool|tool)\s*[\s\S]*?```/i, '').trim();
}

export async function importSkillFromMarkdown(file: File): Promise<SkillPackage> {
  const text = await file.text();
  const tool = parseToolBlock(text);
  const promptMarkdown = stripToolBlock(text);
  const ts = now();

  return {
    meta: {
      name: tool.name,
      title: tool.name,
      description: tool.description,
      version: '1.0.0',
      createdAt: ts,
      updatedAt: ts,
      source: 'user',
    },
    tool,
    promptMarkdown,
    enabled: true,
  };
}

export async function importSkillFromZip(file: File): Promise<SkillPackage> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const skillJsonEntry = zip.file('skill.json') ?? Object.values(zip.files).find((f) => !f.dir && /(^|\/)skill\.json$/i.test(f.name));
  const promptEntry = zip.file('prompt.md') ?? zip.file('skill.md')
    ?? Object.values(zip.files).find((f) => !f.dir && /(^|\/)(prompt|skill)\.md$/i.test(f.name));

  let tool: ToolDefinition | null = null;
  let promptMarkdown = '';

  if (skillJsonEntry) {
    const json = JSON.parse(await skillJsonEntry.async('string'));
    const toolRaw = json?.tool ?? json;
    if (!toolRaw?.name || !toolRaw?.description || !toolRaw?.input_schema) {
      throw new Error('skill.json 缺少 tool 定义（name/description/input_schema）');
    }
    tool = {
      ...toolRaw,
      name: safeName(String(toolRaw.name)),
    };
    promptMarkdown = String(json?.promptMarkdown ?? '');
  }

  if (promptEntry) {
    const md = await promptEntry.async('string');
    // 如果 zip 里没有 skill.json，则 md 必须带 json:tool 块
    if (!tool) tool = parseToolBlock(md);
    if (!promptMarkdown) promptMarkdown = stripToolBlock(md);
  }

  if (!tool) throw new Error('zip 内未找到 tool 定义（skill.json 或 markdown 内 json:tool）');

  // assets：收集 assets/ 下的文件为 dataURL
  const assets: Record<string, string> = {};
  const assetEntries = Object.values(zip.files).filter((f) => !f.dir && /(^|\/)assets\//i.test(f.name));
  for (const entry of assetEntries) {
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const mime =
      ext === 'png' ? 'image/png' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
          ext === 'svg' ? 'image/svg+xml' :
            ext === 'gif' ? 'image/gif' :
              'application/octet-stream';
    const buf = await entry.async('uint8array');
    const b64 = btoa(String.fromCharCode(...buf));
    assets[entry.name] = `data:${mime};base64,${b64}`;
  }

  const ts = now();
  return {
    meta: {
      name: tool.name,
      title: tool.name,
      description: tool.description,
      version: '1.0.0',
      createdAt: ts,
      updatedAt: ts,
      source: 'user',
    },
    tool,
    promptMarkdown,
    assets,
    enabled: true,
  };
}

