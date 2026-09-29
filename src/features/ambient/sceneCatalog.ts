/**
 * Public catalog of scene items: characters that walk the path and the
 * landscapes they walk through. Items are obtained with active days
 * (milestones) or bought in the shop. Firestore rules keep the same tables.
 * The data lives in ./scene; this module is the entry point for the app.
 */
import type { Landscape, PixelCharacter, Rarity } from "./scene/types";
import { CHARACTERS } from "./scene/characters";
import { LANDSCAPES } from "./scene/landscapes";

export type * from "./scene/types";
export { CHARACTERS } from "./scene/characters";
export { LANDSCAPES } from "./scene/landscapes";
export { SCENE_PROPS } from "./scene/props";

export const RARITIES: Record<Rarity, { label: string; price: number }> = {
  comun: { label: "Común", price: 10 },
  rara: { label: "Rara", price: 25 },
  epica: { label: "Épica", price: 40 },
};

export const DEFAULT_SCENE = { characterId: "farolero", landscapeId: "valle-nocturno" } as const;

export function findCharacter(id: string) {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

export function findLandscape(id: string) {
  return LANDSCAPES.find((landscape) => landscape.id === id) ?? LANDSCAPES[0];
}

/** Unlocked by active days; shop items never unlock this way. */
export function isUnlocked(item: { unlockDays: number | null }, activeDays: number) {
  return item.unlockDays !== null && activeDays >= item.unlockDays;
}

/** Usable by the person: unlocked by days or bought in the shop. */
export function isAvailable(item: { id: string; unlockDays: number | null }, activeDays: number, owned: ReadonlySet<string>) {
  return isUnlocked(item, activeDays) || owned.has(item.id);
}

export function priceOf(item: { rarity?: Rarity }) {
  return item.rarity ? RARITIES[item.rarity].price : null;
}

export function findItem(id: string) {
  return [...CHARACTERS, ...LANDSCAPES].find((item) => item.id === id) ?? null;
}

/** Milestone items still locked, ordered by requirement, to show "next unlock". */
export function nextUnlock(activeDays: number) {
  return [...CHARACTERS, ...LANDSCAPES]
    .filter((item): item is (PixelCharacter | Landscape) & { unlockDays: number } => item.unlockDays !== null && item.unlockDays > activeDays)
    .sort((a, b) => a.unlockDays - b.unlockDays)[0] ?? null;
}
