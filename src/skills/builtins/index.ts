import type { SkillPackage } from '../types';
import { WORDART_GENERATE_SKILL } from './wordart_generate';

/**
 * 内置技能列表
 * - 注意：这里的技能会被视为“工具”（Claude tool use），因此 tool.name 必须稳定。
 */
export const BUILTIN_SKILLS: SkillPackage[] = [
  WORDART_GENERATE_SKILL,
];
