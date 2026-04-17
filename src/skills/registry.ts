import type { SkillPackage, ToolDefinition } from './types';
import { BUILTIN_SKILLS } from './builtins';
import { listUserSkillMetas, loadUserSkill } from './storage';

export async function loadAllSkills(): Promise<SkillPackage[]> {
  const userMetas = await listUserSkillMetas();
  const userPkgs: SkillPackage[] = [];
  for (const meta of userMetas) {
    const pkg = await loadUserSkill(meta.name);
    if (pkg) userPkgs.push(pkg);
  }
  return [...BUILTIN_SKILLS, ...userPkgs];
}

export function toolDefsFromSkills(skills: SkillPackage[], enabledOnly = true): ToolDefinition[] {
  return skills
    .filter((s) => (enabledOnly ? s.enabled : true))
    .map((s) => s.tool);
}

export function findSkill(skills: SkillPackage[], name: string): SkillPackage | undefined {
  return skills.find((s) => s.meta.name === name);
}

