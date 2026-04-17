import type { SkillPackage } from '../types';

export const WORDART_GENERATE_SKILL: SkillPackage = {
  meta: {
    name: 'wordart_generate',
    title: '艺术字生成',
    description: '生成 SVG/PNG 艺术字资产，并返回 base64；可用于插入 PPT 并支持二次编辑替换。',
    version: '1.0.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: 'builtin',
  },
  tool: {
    name: 'wordart_generate',
    description:
      'Generate WordArt as SVG/PNG. Use when you need stylized title text. Returns pngBase64 and recommended box. After tool_result, insert it as an image shape and set name to wordart:<assetId> so it can be edited later.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '艺术字文本内容' },
        width: { type: 'number', description: '导出图片宽度（像素），建议 800-1400' },
        height: { type: 'number', description: '导出图片高度（像素），建议 200-500' },
        style: {
          type: 'object',
          properties: {
            primaryColor: { type: 'string' },
            accentColor: { type: 'string' },
            fontFamily: { type: 'string' },
            strokeColor: { type: 'string' },
            strokeWidth: { type: 'number' },
            glow: { type: 'boolean' },
            shadow: { type: 'boolean' },
          },
        },
      },
      required: ['text'],
    },
    input_examples: [
      { text: '研究进展', width: 1200, height: 320, style: { primaryColor: '#0F4C81', accentColor: '#2563EB' } },
    ],
  },
  promptMarkdown: [
    '你是艺术字生成工具。',
    '- 输入为文本与风格参数；',
    '- 输出为 PNG base64（用于 insertImage）与 assetId（用于二次编辑）。',
  ].join('\n'),
  enabled: true,
};

