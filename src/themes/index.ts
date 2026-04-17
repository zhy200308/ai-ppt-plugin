export * from './types';
export { BUILTIN_THEMES } from './builtins';
export * from './pack';
export * from './pptx';

import { BUILTIN_THEMES } from './builtins';
import type { ThemeDefinition, ThemeSpec } from './types';

// ============================================================
// Theme Registry（支持运行时注册用户主题包）
// ============================================================

class ThemeRegistry {
  private _themes: Map<string, ThemeDefinition> = new Map();

  constructor() {
    BUILTIN_THEMES.forEach((t) => this._themes.set(t.id, t));
  }

  all(): ThemeDefinition[] {
    return Array.from(this._themes.values());
  }

  get(idOrName?: string): ThemeDefinition | undefined {
    if (!idOrName) return undefined;
    const key = idOrName.trim().toLowerCase();
    return this.all().find((t) => t.id === key || t.name.toLowerCase() === key);
  }

  register(theme: ThemeDefinition) {
    this._themes.set(theme.id, theme);
  }

  unregister(id: string) {
    this._themes.delete(id);
  }
}

export const themeRegistry = new ThemeRegistry();

function normalizeHex(hex?: string): string | undefined {
  if (!hex || typeof hex !== 'string') return undefined;
  const trimmed = hex.trim();
  if (!trimmed) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return undefined;
}

export function resolveTheme(spec?: ThemeSpec): ThemeDefinition {
  const name = spec?.themeName?.trim().toLowerCase();
  const byName = name ? themeRegistry.get(name) : undefined;
  const base = byName ?? themeRegistry.all()[0];

  const primaryColor = normalizeHex(spec?.primaryColor) ?? base.primaryColor;
  const backgroundColor = normalizeHex(spec?.backgroundColor) ?? base.backgroundColor;
  const accentColor = normalizeHex(spec?.accentColor) ?? base.accentColor;
  const fontFamily = spec?.fontFamily?.trim() || base.fontFamily;

  return {
    ...base,
    primaryColor,
    backgroundColor,
    accentColor,
    fontFamily,
    defaults: {
      ...base.defaults,
      backgroundColor,
      title: {
        ...base.defaults.title,
        fontFamily,
        color: primaryColor,
      },
      body: {
        ...base.defaults.body,
        fontFamily,
      },
    },
  };
}
