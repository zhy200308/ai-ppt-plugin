import { get, set } from 'idb-keyval';

export type WordArtAsset = {
  id: string;
  text: string;
  svg: string;
  pngBase64: string;
  createdAt: number;
  updatedAt: number;
};

const KEY_PREFIX = 'wordart:asset:v1:';

export async function saveWordArtAsset(asset: WordArtAsset): Promise<void> {
  await set(`${KEY_PREFIX}${asset.id}`, asset);
}

export async function loadWordArtAsset(id: string): Promise<WordArtAsset | null> {
  return (await get<WordArtAsset>(`${KEY_PREFIX}${id}`)) ?? null;
}

