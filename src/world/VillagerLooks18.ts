import { VILLAGER } from '../data';
import type { CharacterLook } from '../systems/State';

/**
 * How the six villagers look when the mail agent draws them (the daily visitor and letter portraits). If
 * villagers.json gives a villager a `look`, that wins, so every screen shows the same face.
 */
const LOOKS: Record<string, CharacterLook> = {
  rosa: { body: 'female-b', skin: '#f6c9a0', hair: '#8a5a33', top: '#ff8fb4', bottom: '#f7f1e3', hat: 'chef', accessory: 'none', pet: 'none' },
  tom: { body: 'male-c', skin: '#e8b38a', hair: '#9aa5b1', top: '#1f4e9c', bottom: '#3b3b45', hat: 'cap', accessory: 'none', pet: 'none' },
  juniper: { body: 'female-d', skin: '#a26a43', hair: '#a77bf3', top: '#2fbfa8', bottom: '#3b3b45', hat: 'none', accessory: 'none', pet: 'none' },
  pip: { body: 'male-a', skin: '#ffe0c2', hair: '#e8c06a', top: '#ffc93c', bottom: '#3fa9f5', hat: 'bucket', accessory: 'none', pet: 'none' },
  hazel: { body: 'female-e', skin: '#c98a5e', hair: '#f2e2b0', top: '#a77bf3', bottom: '#8a5528', hat: 'none', accessory: 'none', pet: 'none' },
  bram: { body: 'male-e', skin: '#7a4b2c', hair: '#2b2622', top: '#e2533c', bottom: '#3b3b45', hat: 'none', accessory: 'none', pet: 'none' },
};

export function villagerLook(id: string): CharacterLook {
  const custom = (VILLAGER[id] as { look?: Partial<CharacterLook> } | undefined)?.look;
  const base = LOOKS[id] ?? LOOKS.rosa;
  return custom && typeof custom === 'object' ? { ...base, ...custom, accessory: custom.accessory ?? 'none', pet: 'none' } : base;
}

/** Thumbnail key for a villager's portrait (rendered by world/Thumbs.ts). */
export function villagerPortraitKey(id: string): string {
  const l = villagerLook(id);
  return `look:${JSON.stringify({ body: l.body, skin: l.skin, hair: l.hair, top: l.top, bottom: l.bottom, hat: l.hat })}`;
}
