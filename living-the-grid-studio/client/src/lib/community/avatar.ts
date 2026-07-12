const BACKGROUNDS = [
  ["#f36b5f", "#ffd3cd"],
  ["#69b7ef", "#dff1ff"],
  ["#f7cd57", "#fff1bb"],
  ["#79d2ad", "#dcf5e9"],
  ["#a992dc", "#eee7ff"],
  ["#35a8a2", "#c7f1ed"],
] as const;

const SKIN_TONES = [
  "#ffd9bb",
  "#f4c49e",
  "#d99c72",
  "#ad6f49",
  "#71442e",
  "#4b2d24",
] as const;
const HAIR_COLORS = [
  "#20202a",
  "#51362c",
  "#7c4d2e",
  "#c46a3e",
  "#30526f",
  "#6c4b86",
] as const;
const SHIRT_COLORS = [
  "#f36b5f",
  "#69b7ef",
  "#f7cd57",
  "#79d2ad",
  "#a992dc",
  "#35a8a2",
] as const;

// The avatar seed is permanent account data, so this recipe version is also a
// visual compatibility contract. Add an explicit migration instead of
// changing the version after public profiles launch.
export const ISLAND_AVATAR_VERSION = 2;

export type IslandAvatarRecipe = {
  accessory: number;
  accent: string;
  background: string;
  backgroundDetail: string;
  backgroundPattern: number;
  eyeStyle: number;
  hair: string;
  hairStyle: number;
  mouthStyle: number;
  shirt: string;
  skin: string;
};

function seedNumber(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function mixedIndex(value: number, salt: number, length: number): number {
  let mixed = (value ^ salt) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
  return ((mixed ^ (mixed >>> 16)) >>> 0) % length;
}

export function islandAvatarRecipe(seed: string): IslandAvatarRecipe {
  const value = seedNumber(`v${ISLAND_AVATAR_VERSION}:${seed || "islander"}`);
  const background = BACKGROUNDS[mixedIndex(value, 0x11, BACKGROUNDS.length)];
  const shirtIndex = mixedIndex(value, 0x33, SHIRT_COLORS.length);
  const accentIndex =
    (shirtIndex + 2 + mixedIndex(value, 0x44, 3)) % SHIRT_COLORS.length;

  return {
    accessory: mixedIndex(value, 0x99, 6),
    accent: SHIRT_COLORS[accentIndex],
    background: background[0],
    backgroundDetail: background[1],
    backgroundPattern: mixedIndex(value, 0x22, 5),
    eyeStyle: mixedIndex(value, 0x77, 4),
    hair: HAIR_COLORS[mixedIndex(value, 0x66, HAIR_COLORS.length)],
    hairStyle: mixedIndex(value, 0x55, 5),
    mouthStyle: mixedIndex(value, 0x88, 4),
    shirt: SHIRT_COLORS[shirtIndex],
    skin: SKIN_TONES[mixedIndex(value, 0xaa, SKIN_TONES.length)],
  };
}
