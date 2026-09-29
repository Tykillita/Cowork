/**
 * Guilin mountains: a paifang gate, a pavilion, pandas, lantern posts and koi.
 * Sizes follow scale.ts: the gate and the pavilion leave plenty of room over
 * the walker's head; the panda is mascot-sized.
 */
import type { Fill } from "../pixelArt";
import { disc, mirror, outline, paint, rowsBetween } from "../pixelArt";
import { frames } from "./shared";
import type { SceneProp } from "../types";

/** Three-bay paifang: tiled roofs with upturned eaves, painted beams, a gold plaque. 48×44. */
export const PAIFANG = outline(paint(48, 44, [
  ["y", 14, 1], ["y", 33, 1],
  ["R", 14, 2, 20, 1], ["R", 12, 3, 24, 2], ["R", 10, 4, 2, 1], ["R", 36, 4, 2, 1], ["R", 9, 3], ["R", 38, 3], ["Q", 12, 5, 24, 1],
  ["r", 13, 6, 22, 3], ["b", 13, 7, 22, 1],
  ["y", 19, 9, 10, 5], ["k", 20, 10, 8, 3], ["y", 22, 11], ["y", 25, 11], ["y", 23, 10, 2, 1],
  ["R", 3, 13, 14, 2], ["R", 1, 12, 2, 1], ["Q", 3, 14, 14, 1],
  ["R", 31, 13, 14, 2], ["R", 45, 12, 2, 1], ["Q", 31, 14, 14, 1],
  ["r", 4, 16, 40, 2], ...Array.from({ length: 10 }, (_, index): Fill => [index % 2 ? "b" : "g", 4 + index * 4, 18, 4, 1]),
  ...[5, 16, 29, 40].flatMap((x): Fill[] => [["r", x, 19, 3, 22], ["D", x + 2, 19, 1, 22], ["s", x - 1, 40, 5, 3]]),
]));

/** Hexagonal pavilion: curved tiled roof, painted beam, red columns, a railing and two lanterns. 40×40. */
export const pavilion = (core: string) => outline(paint(40, 40, [
  ["y", 19, 0, 2, 3],
  ...rowsBetween("R", 3, [[17, 22], [15, 24], [13, 26], [11, 28], [9, 30], [7, 32], [5, 34], [3, 36], [2, 37]]),
  ["Q", 14, 5, 12, 1], ["Q", 10, 7, 20, 1], ["Q", 6, 9, 28, 1],
  ["R", 1, 10, 2, 1], ["R", 37, 10, 2, 1], ["R", 1, 9], ["R", 38, 9],
  ["D", 4, 12, 32, 1],
  ["r", 5, 13, 30, 1], ...Array.from({ length: 10 }, (_, index): Fill => [index % 2 ? "b" : "g", 5 + index * 3, 14, 3, 1]),
  ...[6, 14, 24, 32].flatMap((x): Fill[] => [["r", x, 15, 2, 20], ["D", x + 1, 15, 1, 20]]),
  ["r", 5, 29, 30, 1], ...Array.from({ length: 10 }, (_, index): Fill => ["D", 6 + index * 3, 30, 1, 4]),
  ...[10, 29].flatMap((x): Fill[] => [["k", x, 15, 1, 2], ["L", x - 1, 17, 3, 4], ["y", x - 1, 17, 3, 1], [core, x, 18, 1, 2], ["y", x, 21]]),
  ["s", 2, 35, 36, 3], ["S", 2, 35, 36, 1], ["S", 14, 37, 12, 1],
]));

/** Panda sitting in the bamboo, chewing a stalk. 20×16. */
export const panda = (chewing: boolean) => outline(paint(20, 16, [
  ["g", 16, 1 + (chewing ? 1 : 0), 1, 13 - (chewing ? 1 : 0)], ["G", 16, 5], ["G", 16, 9], ["l", 17, 2 + (chewing ? 1 : 0), 2, 1], ["l", 14, 1 + (chewing ? 1 : 0), 2, 1],
  ["w", 5, 7, 9, 6], ["k", 5, 7, 9, 2],
  ["k", 7, 1, 2, 2], ["k", 12, 1, 2, 2],
  ["w", 7, 2 + (chewing ? 1 : 0), 7, 5], ["w", 13, 4 + (chewing ? 1 : 0), 2, 2], ["k", 14, 4 + (chewing ? 1 : 0)],
  ["k", 9, 3 + (chewing ? 1 : 0), 2, 2], ["k", 12, 3 + (chewing ? 1 : 0), 1, 2], ["e", 9, 3 + (chewing ? 1 : 0)],
  ["k", 13, 8, 3, 3],
  ["k", 4, 11, 4, 3], ["p", 4, 13, 2, 1], ["k", 11, 12, 4, 2],
]));

/** Baby panda wobbling on its bottom. 12×10. */
export const BABY_PANDA = outline(paint(12, 10, [
  ["k", 3, 1], ["k", 7, 1],
  ["w", 3, 2, 5, 3], ["k", 4, 3], ["k", 6, 3], ["k", 5, 4],
  ["w", 2, 5, 7, 3], ["k", 2, 5, 2, 2], ["k", 7, 5, 2, 2],
  ["k", 3, 8, 2, 1], ["k", 6, 8, 2, 1],
]));

/** Lantern post: a red pole with two round silk lanterns and their tassels. 13×29. */
export const lanternPost = (core: string) => outline(paint(13, 29, [
  ["b", 1, 3, 11, 1], ["b", 1, 2], ["b", 11, 2],
  ["b", 6, 3, 1, 23],
  ...[3, 9].flatMap((x): Fill[] => [["k", x, 4, 1, 2], ["y", x - 1, 6, 3, 1], ...disc("L", x, 8, 2), [core, x, 8, 1, 2], ["y", x - 1, 11, 3, 1], ["y", x, 12, 1, 2]]),
  ["k", 4, 26, 5, 2],
]));

/** A koi swimming just under the surface (no outline: it is seen through water). */
export const koi = (tail: boolean) => paint(8, 3, [
  ["o", 2, 1, 4, 1], ["w", 3, 1], ["o", 3, 0, 2, 1], ["o", 6, 1], ["k", 6, 0],
  tail ? ["o", 0, 0] : ["o", 0, 2], ["o", 1, 1],
]);

export const CHINA_PROPS = {
  chinaGate: {
    size: "building",
    palette: { o: "#1a0e0e", R: "#2e3a4a", Q: "#1e2836", y: "#e8c25a", r: "#c8302a", D: "#8a2018", b: "#3a8ae8", g: "#3ab87a", k: "#2a1414", s: "#8a8a80" },
    frames: frames(PAIFANG),
    fps: 1,
  },
  chinaPavilion: {
    size: "building",
    palette: { o: "#1a0e0e", R: "#2e3a4a", Q: "#1e2836", D: "#8a2018", y: "#e8c25a", r: "#c8302a", b: "#3a8ae8", g: "#3ab87a", k: "#2a1414", L: "#e84a3a", l: "#ffe08a", s: "#a8a08c", S: "#8a826e" },
    frames: frames(pavilion("l"), pavilion("L")),
    fps: 1.4,
    glow: { x: 10, y: 18, color: "255, 150, 100", radius: 10 },
  },
  chinaPanda: {
    size: "medium",
    palette: { o: "#141414", w: "#f4f2ee", k: "#1e1e22", e: "#f4f2ee", p: "#e8a0a8", g: "#5a9a4a", G: "#3e7a34", l: "#7ac05a" },
    frames: frames(panda(false), panda(true), panda(false), panda(true)),
    fps: 2,
  },
  chinaBabyPanda: {
    size: "small",
    palette: { o: "#141414", w: "#f4f2ee", k: "#1e1e22" },
    frames: [{ rows: BABY_PANDA }, { rows: mirror(BABY_PANDA), bob: -1 }, { rows: BABY_PANDA }, { rows: BABY_PANDA, bob: -1 }],
    fps: 2.5,
  },
  chinaLanterns: {
    size: "fixture",
    palette: { o: "#1a0e0e", b: "#a82820", k: "#2a1414", y: "#e8c25a", L: "#e84a3a", l: "#ffe08a" },
    frames: frames(lanternPost("l"), lanternPost("L")),
    fps: 1.6,
    glow: { x: 6, y: 8, color: "255, 120, 90", radius: 12 },
  },
  chinaKoi: {
    size: "tiny",
    palette: { o: "#f2702a", w: "#f7f2ea", k: "#1a1a1a" },
    frames: frames(koi(true), koi(false)),
    fps: 3,
  },
} satisfies Record<string, SceneProp>;
