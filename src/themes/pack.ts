// ============================================================
// Theme Pack Loader
// - 支持用户上传 zip 或文件夹(theme.json + assets)
// - 解析为 ThemeDefinition 并注册到 themeRegistry
// ============================================================

import JSZip from 'jszip';
import type { ThemeDefinition } from './types';
import { themeRegistry } from './index';

export interface ThemePackMeta {
  id: string;
  name: string;
  source: 'zip' | 'folder';
  importedAt: number;
}

export interface ThemePack {
  meta: ThemePackMeta;
  theme: ThemeDefinition;
  assets: Record<string, string>; // path -> dataURL
}

type RawThemeJson = any;

function normalizeHex(hex?: string): string {
  if (!hex || typeof hex !== 'string') return '';
  const trimmed = hex.trim();
  if (!trimmed) return '';
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return '';
}

function safeId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `data:${file.type || 'application/octet-stream'};base64,${b64}`;
}

function buildThemeDefinition(raw: RawThemeJson, fallbackName: string): ThemeDefinition {
  const name = String(raw?.name ?? raw?.themeName ?? fallbackName);
  const id = safeId(String(raw?.id ?? name)) || `theme-${Date.now()}`;

  const primaryColor = normalizeHex(raw?.palette?.primary ?? raw?.primaryColor) || '#1A3C6E';
  const accentColor = normalizeHex(raw?.palette?.accent ?? raw?.accentColor) || '#2B6CB0';
  const backgroundColor = normalizeHex(raw?.palette?.background ?? raw?.backgroundColor) || '#FFFFFF';
  const fontFamily = String(raw?.typography?.fontFamily ?? raw?.fontFamily ?? '微软雅黑');

  const titleSize = Number(raw?.typography?.title?.fontSize ?? 36);
  const bodySize = Number(raw?.typography?.body?.fontSize ?? 20);

  return {
    id,
    name,
    primaryColor,
    backgroundColor,
    accentColor,
    fontFamily,
    defaults: {
      backgroundColor,
      title: {
        fontFamily,
        fontSize: Number.isFinite(titleSize) ? titleSize : 36,
        bold: true,
        color: primaryColor,
        alignment: 'left',
      },
      body: {
        fontFamily,
        fontSize: Number.isFinite(bodySize) ? bodySize : 20,
        color: '#1F2937',
        alignment: 'left',
        lineSpacing: 1.2,
      },
    },
  };
}

export async function importThemePackFromZip(file: File): Promise<ThemePack> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // 找 theme.json（允许嵌套目录）
  const themeEntry = Object.values(zip.files).find((f) => !f.dir && /(^|\/)theme\.json$/i.test(f.name));
  if (!themeEntry) throw new Error('zip 内未找到 theme.json');

  const themeText = await themeEntry.async('string');
  const raw = JSON.parse(themeText);

  // assets
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

  const theme = buildThemeDefinition(raw, file.name.replace(/\.zip$/i, ''));
  themeRegistry.register(theme);

  return {
    meta: {
      id: theme.id,
      name: theme.name,
      source: 'zip',
      importedAt: Date.now(),
    },
    theme,
    assets,
  };
}

export async function importThemePackFromFolder(files: FileList): Promise<ThemePack> {
  const all = Array.from(files);
  const themeFile = all.find((f) => /(^|\/)theme\.json$/i.test((f as any).webkitRelativePath || f.name));
  if (!themeFile) throw new Error('文件夹内未找到 theme.json');
  const raw = JSON.parse(await themeFile.text());

  const assets: Record<string, string> = {};
  const assetFiles = all.filter((f) => /(^|\/)assets\//i.test((f as any).webkitRelativePath || f.name));
  for (const f of assetFiles) {
    const rel = (f as any).webkitRelativePath || f.name;
    assets[rel] = await fileToDataUrl(f);
  }

  const theme = buildThemeDefinition(raw, (themeFile as any).webkitRelativePath?.split('/')[0] ?? themeFile.name);
  themeRegistry.register(theme);

  return {
    meta: {
      id: theme.id,
      name: theme.name,
      source: 'folder',
      importedAt: Date.now(),
    },
    theme,
    assets,
  };
}

