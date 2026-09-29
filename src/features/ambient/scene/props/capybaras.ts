import { CAPYBARA_BABY, CAPYBARA_BODY, CAPYBARA_EAR_FLICK, CAPYBARA_PALETTE, CAPYBARA_SLEEP, CAPYBARA_STAND, CAPYBARA_STRIDE_B } from "../characters";
import type { SpriteLayer } from "../pixelArt";
import { blinkRow, closeEyes, compose } from "../pixelArt";
import { STONE_LANTERN } from "./japan";
import { LAKE_WATER, frames } from "./shared";
import type { SceneProp } from "../types";

// Capibaras de la laguna
export const YUZU = [".g.", "uuu", "uUu"];
export const RIPPLE_A = [".vvVvvvvvvvvvvvvvvVvv.", "vvvvvvVvvvvvvvVvvvvvvv"];
export const RIPPLE_B = [".vvvvVvvvvvvvvvvVvvvv.", "vvVvvvvvvvvvVvvvvvvVvv"];
export const puddleFrame = (body: string[], water: string[]) => compose(22, 11, [{ rows: body.slice(0, 7), y: 2 }, { rows: YUZU, x: 15, y: 0 }, { rows: water, y: 9 }]);
export const swimFrame = (body: string[], water: string[]) => compose(22, 9, [{ rows: body.slice(0, 7) }, { rows: water, y: 7 }]);

export const CROCODILE = [
  "..........................oyo.....",
  "......kKkKkKkKkKkKkKkKkK.okkko....",
  "..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkn",
  "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
  ".ggggggggggggggggggggggggtgtgtgtk.",
  "..vvVvvvvvvvvvvvvvvvvvvvvvvvvVvv..",
];
export const crocodileFrame = (capybara: string[], crocodile: string[]) => compose(34, 16, [{ rows: crocodile, y: 10 }, { rows: capybara, x: 2 }]);

export const BIRD_A = [".oo..", "oyyyx", ".yy.."];
export const BIRD_B = ["..oo.", ".oyyx", ".yy.."];
export const sleeperFrame = (capybara: string[], bird: string[], birdX: number) => compose(22, 13, [{ rows: capybara, y: 2 }, { rows: bird, x: birdX }]);

export const familyFrame = (mother: string[], baby: string[]) => compose(22, 18, [{ rows: [...mother, ...CAPYBARA_STAND], y: 5 }, { rows: baby, x: 2 }]);

// Onsen de los capibaras (the Japanese zoos' yuzu baths)
export const ONSEN_WATER = { v: "#5fa8b8", V: "#cfeff5" };
export const TOWEL = ["ttttt", "uuuuu", "tTTTt"];
export const TOWEL_PALETTE = { t: "#f4f0e8", T: "#d8d0c4", u: "#6fa8d8" };
export const YUZU_PALETTE = { u: "#f39a2b", U: "#ffc46b", g: "#5aa05a" };
export const bathFrame = (body: string[], water: string[], extras: SpriteLayer[] = []) => compose(22, 11, [{ rows: body.slice(0, 7), y: 2 }, ...extras, { rows: water, y: 9 }]);
export const towelOnLand = (body: string[]) => compose(22, 16, [{ rows: [...body, ...CAPYBARA_STAND], y: 3 }, { rows: TOWEL, x: 14, y: 1 }]);
export const YUZU_BALL = ["uuu", "uUu"];
export const floatingYuzus = (outer: number, middle: number) => compose(14, 4, [
  { rows: YUZU_BALL, y: outer },
  { rows: YUZU_BALL, x: 5, y: middle },
  { rows: YUZU_BALL, x: 10, y: outer },
  { rows: ["vvVvvvvvvvVvvv"], y: 3 },
]);

// El club de los capibaras (the capybara is everyone's friend)
export const RIVER_WATER = { v: "#5a7a9a", V: "#f6c88a" };
export const DUCKLING = ["..yy.", "..yex", "yyyy.", ".yyy."];
export const ducklingFrame = (first: number, second: number, third: number) => compose(22, 17, [
  { rows: [...CAPYBARA_BODY, ...CAPYBARA_STAND], y: 4 },
  { rows: DUCKLING, x: 4, y: first },
  { rows: DUCKLING, x: 9, y: second },
  { rows: DUCKLING, x: 15, y: third },
]);
export const SUNGLASSES = ["GGGGG", ".GgG."];
export const musicFrame = (legs: string[]) => compose(22, 13, [{ rows: [...CAPYBARA_BODY, ...legs] }, { rows: SUNGLASSES, x: 14, y: 3 }]);
export const CAT_LOAF = [
  "......o.o",
  "..oooooqo",
  ".oqqqqqeo",
  "oqqQqqqqo",
  ".ooooooo.",
];
export const CAT_ASLEEP = blinkRow(CAT_LOAF, 2, "e", "Q");
export const catFrame = (capybara: string[], cat: string[]) => compose(22, 18, [{ rows: [...capybara, ...CAPYBARA_STAND], y: 5 }, { rows: cat, x: 11, y: 1 }]);
export const WATERMELON = ["..ppp..", ".pkpkp.", "ppppppp", "LLLLLLL", "DDDDDDD"];
export const WATERMELON_BITE = ["....p..", "...kpp.", "..ppppp", "LLLLLLL", "DDDDDDD"];
export const WATERMELON_RIND = [".......", ".......", ".....pp", "..LLLLL", "DDDDDDD"];
export const melonFrame = (capybara: string[], melon: string[]) => compose(27, 13, [{ rows: [...capybara, ...CAPYBARA_STAND] }, { rows: melon, x: 20, y: 8 }]);
export const riverFrame = (capybara: string[], bird: string[], water: string[]) => compose(22, 12, [{ rows: capybara.slice(0, 7), y: 3 }, { rows: bird, x: 15, y: 1 }, { rows: water, y: 10 }]);


export const CAPYBARAS_PROPS = {
  capybaraPuddle: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...LAKE_WATER, u: "#f39a2b", U: "#ffc46b", g: "#5aa05a" },
    frames: frames(puddleFrame(CAPYBARA_BODY, RIPPLE_A), puddleFrame(CAPYBARA_BODY, RIPPLE_B), puddleFrame(CAPYBARA_SLEEP, RIPPLE_A), puddleFrame(CAPYBARA_SLEEP, RIPPLE_B)),
    fps: 1.2,
  },
  capybaraFamily: {
    size: "medium",
    palette: CAPYBARA_PALETTE,
    frames: frames(
      familyFrame(CAPYBARA_BODY, CAPYBARA_BABY),
      familyFrame(CAPYBARA_BODY, closeEyes(CAPYBARA_BABY, 2)),
      familyFrame(CAPYBARA_EAR_FLICK, CAPYBARA_BABY),
      familyFrame(CAPYBARA_SLEEP, CAPYBARA_BABY),
    ),
    fps: 1.3,
    effect: { kind: "hearts", x: 7, y: 0 },
  },
  capybaraSleeper: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, x: "#e8743a", y: "#f2c94c" },
    frames: frames(
      sleeperFrame(CAPYBARA_SLEEP, BIRD_A, 7),
      sleeperFrame(CAPYBARA_SLEEP, BIRD_B, 7),
      sleeperFrame(CAPYBARA_SLEEP, BIRD_A, 9),
      sleeperFrame(CAPYBARA_SLEEP, BIRD_A, 9),
    ),
    fps: 1,
    effect: { kind: "zzz", x: 18, y: 3 },
  },
  capybaraOnCrocodile: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...LAKE_WATER, k: "#5a8f45", K: "#3f6e31", g: "#9bbb72", y: "#f0d860", t: "#f2f0e0" },
    frames: frames(
      crocodileFrame(CAPYBARA_BODY, CROCODILE),
      crocodileFrame(CAPYBARA_BODY, blinkRow(CROCODILE, 0, "y", "k")),
      crocodileFrame(CAPYBARA_SLEEP, CROCODILE),
      crocodileFrame(CAPYBARA_BODY, CROCODILE),
    ),
    fps: 1.2,
  },
  capybaraSwimmer: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...LAKE_WATER },
    frames: frames(swimFrame(CAPYBARA_BODY, RIPPLE_A), swimFrame(CAPYBARA_BODY, RIPPLE_B), swimFrame(CAPYBARA_SLEEP, RIPPLE_A)),
    fps: 1.4,
  },
  onsenLantern: {
    size: "fixture",
    palette: { o: "#2a2e38", s: "#8a8f9c", S: "#6b707c", y: "#ffd97a", Y: "#ffb84a" },
    frames: frames(STONE_LANTERN, blinkRow(blinkRow(blinkRow(STONE_LANTERN, 7, "y", "Y"), 8, "y", "Y"), 9, "y", "Y")),
    fps: 1.3,
    glow: { x: 6, y: 8, color: "255, 200, 120", radius: 11 },
  },
  onsenTowelWalk: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...TOWEL_PALETTE },
    frames: frames(towelOnLand(CAPYBARA_BODY), towelOnLand(CAPYBARA_BODY), towelOnLand(CAPYBARA_SLEEP), towelOnLand(CAPYBARA_EAR_FLICK)),
    fps: 1.2,
  },
  onsenYuzuBath: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...ONSEN_WATER, ...YUZU_PALETTE },
    frames: frames(
      bathFrame(CAPYBARA_SLEEP, RIPPLE_A, [{ rows: YUZU, x: 15, y: 0 }]),
      bathFrame(CAPYBARA_SLEEP, RIPPLE_B, [{ rows: YUZU, x: 15, y: 0 }]),
      bathFrame(CAPYBARA_SLEEP, RIPPLE_A, [{ rows: YUZU, x: 15, y: 0 }]),
      bathFrame(CAPYBARA_BODY, RIPPLE_B, [{ rows: YUZU, x: 15, y: 0 }]),
    ),
    fps: 1,
    effect: { kind: "hearts", x: 12, y: 1 },
  },
  onsenTowelBath: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...ONSEN_WATER, ...TOWEL_PALETTE },
    frames: frames(
      bathFrame(CAPYBARA_SLEEP, RIPPLE_B, [{ rows: TOWEL, x: 14, y: 0 }]),
      bathFrame(CAPYBARA_SLEEP, RIPPLE_A, [{ rows: TOWEL, x: 14, y: 0 }]),
    ),
    fps: 0.9,
    effect: { kind: "zzz", x: 19, y: 1 },
  },
  onsenFloatingYuzus: {
    size: "tiny",
    palette: { ...ONSEN_WATER, ...YUZU_PALETTE },
    frames: frames(floatingYuzus(1, 2), floatingYuzus(2, 1)),
    fps: 1.4,
  },
  clubDucklings: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, y: "#f7d54a", x: "#e8743a" },
    frames: frames(ducklingFrame(1, 1, 1), ducklingFrame(0, 1, 1), ducklingFrame(1, 0, 1), ducklingFrame(1, 1, 0)),
    fps: 3,
  },
  clubMusic: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, G: "#111111", g: "#6fd0ff" },
    frames: [
      { rows: musicFrame(CAPYBARA_STAND) },
      { rows: musicFrame(CAPYBARA_STAND), bob: -1 },
      { rows: musicFrame(CAPYBARA_STRIDE_B) },
      { rows: musicFrame(CAPYBARA_STAND), bob: -1 },
    ],
    fps: 4,
    effect: { kind: "notes", x: 17, y: 0 },
  },
  clubCat: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, q: "#e8923a", Q: "#b8682a" },
    frames: frames(catFrame(CAPYBARA_BODY, CAT_ASLEEP), catFrame(CAPYBARA_BODY, CAT_ASLEEP), catFrame(CAPYBARA_EAR_FLICK, CAT_ASLEEP), catFrame(CAPYBARA_SLEEP, CAT_LOAF)),
    fps: 1.1,
    effect: { kind: "zzz", x: 17, y: 0 },
  },
  clubWatermelon: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, p: "#e8455a", k: "#1a1a1a", L: "#b8e08a", D: "#3f8a3a" },
    frames: frames(
      melonFrame(CAPYBARA_BODY, WATERMELON),
      melonFrame(CAPYBARA_SLEEP, WATERMELON),
      melonFrame(CAPYBARA_BODY, WATERMELON_BITE),
      melonFrame(CAPYBARA_SLEEP, WATERMELON_RIND),
    ),
    fps: 1.2,
    effect: { kind: "hearts", x: 18, y: 2 },
  },
  clubRiverBird: {
    size: "medium",
    palette: { ...CAPYBARA_PALETTE, ...RIVER_WATER, y: "#5ab0e8", x: "#e8743a" },
    frames: frames(riverFrame(CAPYBARA_BODY, BIRD_A, RIPPLE_A), riverFrame(CAPYBARA_BODY, BIRD_B, RIPPLE_B), riverFrame(CAPYBARA_SLEEP, BIRD_A, RIPPLE_A)),
    fps: 1.3,
  },
} satisfies Record<string, SceneProp>;
