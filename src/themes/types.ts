import type { TextStyle } from '../adapters/interface';

export interface ThemeSpec {
  themeName?: string;
  primaryColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  fontFamily?: string;
  styleSummary?: string;
  layoutRules?: string[];
}

export interface ThemeDefinition {
  id: string;
  name: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor: string;
  fontFamily: string;
  /**
   * 插件/默认样式使用
   * - 注意：这里只存“默认值”，不强制覆盖 AI 显式给出的 style
   */
  defaults: {
    backgroundColor: string;
    title: TextStyle;
    body: TextStyle;
  };
}

