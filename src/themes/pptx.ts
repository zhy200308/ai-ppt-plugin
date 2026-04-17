// ============================================================
//  PPTX Theme Importer (v1)
//  - 从 .pptx 模板中提取主题色/字体（尽量）
//  - 作为 ThemePack 注册到 themeRegistry，供 Style Wizard/生成使用
// ============================================================

import JSZip from 'jszip';
import type { ThemePack } from './pack';
import type { ThemeDefinition } from './types';
import { themeRegistry } from './index';

function safeId(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9\-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `pptx-${Date.now()}`;
}

function pickHex(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(/[0-9a-fA-F]{6}/);
  return m ? `#${m[0].toUpperCase()}` : null;
}

function getText(doc: Document, selector: string): string | null {
  const el = doc.querySelector(selector);
  return el?.textContent ?? null;
}

export async function importThemePackFromPptx(file: File): Promise<ThemePack> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const themeEntry = zip.file('ppt/theme/theme1.xml')
    ?? Object.values(zip.files).find((f) => !f.dir && /ppt\/theme\/theme\d+\.xml$/i.test(f.name));
  if (!themeEntry) throw new Error('未在 pptx 中找到主题文件（ppt/theme/theme*.xml）');

  const xml = await themeEntry.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  // 颜色：优先 accent1 作为 primary，accent2 作为 accent，lt1 作为 background
  const accent1 = pickHex(getText(doc, 'a\\:clrScheme a\\:accent1 a\\:srgbClr') || getText(doc, 'accent1 srgbClr'));
  const accent2 = pickHex(getText(doc, 'a\\:clrScheme a\\:accent2 a\\:srgbClr') || getText(doc, 'accent2 srgbClr'));
  const lt1 = pickHex(getText(doc, 'a\\:clrScheme a\\:lt1 a\\:srgbClr') || getText(doc, 'lt1 srgbClr')) || '#FFFFFF';
  const dk1 = pickHex(getText(doc, 'a\\:clrScheme a\\:dk1 a\\:srgbClr') || getText(doc, 'dk1 srgbClr')) || '#111827';

  // 字体：majorFont / minorFont 的 latin typeface
  const major = doc.querySelector('a\\:fontScheme a\\:majorFont a\\:latin')?.getAttribute('typeface')
    ?? doc.querySelector('majorFont latin')?.getAttribute('typeface')
    ?? null;
  const minor = doc.querySelector('a\\:fontScheme a\\:minorFont a\\:latin')?.getAttribute('typeface')
    ?? doc.querySelector('minorFont latin')?.getAttribute('typeface')
    ?? null;
  const fontFamily = minor || major || '微软雅黑';

  const name = file.name.replace(/\.pptx$/i, '');
  const theme: ThemeDefinition = {
    id: safeId(name),
    name,
    primaryColor: accent1 || '#2563EB',
    accentColor: accent2 || (accent1 || '#2563EB'),
    backgroundColor: lt1,
    fontFamily,
    defaults: {
      backgroundColor: lt1,
      title: { fontFamily, fontSize: 36, bold: true, color: accent1 || '#2563EB', alignment: 'left' },
      body: { fontFamily, fontSize: 20, color: dk1, alignment: 'left', lineSpacing: 1.2 },
    },
  };

  themeRegistry.register(theme);

  return {
    meta: {
      id: theme.id,
      name: theme.name,
      source: 'zip', // 语义上仍是“文件包”
      importedAt: Date.now(),
    },
    theme,
    assets: {},
  };
}

