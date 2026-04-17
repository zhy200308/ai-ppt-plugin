import { del, get, set } from 'idb-keyval';
import type { SkillPackage, SkillMeta } from './types';

const INDEX_KEY = 'skills:index:v1';
const PKG_KEY_PREFIX = 'skills:pkg:v1:';

type SkillIndex = {
  metas: SkillMeta[];
};

async function loadIndex(): Promise<SkillIndex> {
  const idx = await get<SkillIndex>(INDEX_KEY);
  if (idx && Array.isArray(idx.metas)) return idx;
  return { metas: [] };
}

async function saveIndex(index: SkillIndex): Promise<void> {
  await set(INDEX_KEY, index);
}

export async function listUserSkillMetas(): Promise<SkillMeta[]> {
  const idx = await loadIndex();
  return idx.metas.filter((m) => m.source === 'user');
}

export async function loadUserSkill(name: string): Promise<SkillPackage | null> {
  const pkg = await get<SkillPackage>(`${PKG_KEY_PREFIX}${name}`);
  return pkg ?? null;
}

export async function saveUserSkill(pkg: SkillPackage): Promise<void> {
  await set(`${PKG_KEY_PREFIX}${pkg.meta.name}`, pkg);
  const idx = await loadIndex();
  const metas = idx.metas.filter((m) => m.name !== pkg.meta.name);
  metas.unshift(pkg.meta);
  await saveIndex({ metas });
}

export async function deleteUserSkill(name: string): Promise<void> {
  await del(`${PKG_KEY_PREFIX}${name}`);
  const idx = await loadIndex();
  await saveIndex({ metas: idx.metas.filter((m) => m.name !== name) });
}

