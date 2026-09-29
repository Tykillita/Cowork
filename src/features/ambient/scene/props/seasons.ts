import type { Fill } from "../pixelArt";
import { compose, disc, line, outline, paint } from "../pixelArt";
import { MARKET_STALL, cottage } from "./countryside";
import { frames } from "./shared";
import type { SceneProp } from "../types";

// Pueblo navideño
/** Christmas tree about twice the walker's height: four tiers, snowy tips, tinsel and blinking ornaments. 25×35. */
const XMAS_TIER_HALF = (row: number) => Math.min(11, 2 + Math.floor(row / 6) * 2 + Math.floor((row % 6) * 0.9));
export const XMAS_ORNAMENTS: [number, number][] = [
  [12, 7], [10, 10], [14, 9], [9, 14], [15, 13], [12, 16], [7, 19], [12, 20], [17, 18], [6, 25], [10, 24], [15, 25], [19, 24], [12, 27],
];
export const xmasTree = (shift: number) => outline(paint(25, 35, [
  ["Y", 12, 0], ["Y", 11, 1, 3, 1], ["Y", 12, 2], ["y", 11, 2], ["y", 13, 2],
  ...Array.from({ length: 25 }, (_, row): Fill => ["g", 12 - XMAS_TIER_HALF(row), 4 + row, XMAS_TIER_HALF(row) * 2 + 1, 1]),
  ...Array.from({ length: 25 }, (_, row): Fill => ["G", 12 + Math.ceil(XMAS_TIER_HALF(row) / 2), 4 + row, Math.floor(XMAS_TIER_HALF(row) / 2) + 1, 1]),
  ...[9, 15, 21, 28].flatMap((row): Fill[] => {
    const half = XMAS_TIER_HALF(row - 4);
    return [["w", 12 - half, row, 2, 1], ["w", 11 + half, row, 2, 1]];
  }),
  ...line("y", 8, 11, 16, 14), ...line("y", 6, 18, 18, 21), ...line("y", 4, 24, 20, 27),
  ...XMAS_ORNAMENTS.map(([x, y], index): Fill => ["rbY"[(index + shift) % 3], x, y]),
  ["k", 11, 29, 3, 3], ["r", 8, 31, 9, 3], ["y", 8, 32, 9, 1],
]));
export const snowman = (wave: boolean) => outline(paint(15, 22, [
  ...disc("w", 7, 16, 4), ...disc("w", 7, 11, 3), ...disc("w", 7, 6, 2),
  ["k", 5, 1, 5, 2], ["k", 4, 3, 7, 1],
  ["k", 6, 5], ["k", 8, 5], ["n", 9, 6, 2, 1],
  ["r", 5, 8, 5, 1], ["r", 9, 9, 1, 2],
  ["k", 7, 11], ["k", 7, 13], ["k", 7, 16],
  ["b", 3, 11], ["b", 2, 10], ["b", 1, 9],
  ...(wave ? [["b", 11, 10], ["b", 12, 9], ["b", 13, 8]] : [["b", 11, 11], ["b", 12, 11], ["b", 13, 12]]) as Fill[],
]));
export const skater = (stride: boolean) => outline(paint(11, 16, [
  ["w", 5, 1], ["r", 3, 2, 4, 2],
  ["s", 3, 4, 4, 3], ["k", 6, 5],
  ["c", 2, 8, 6, 4], ["c", 8, 8, 1, 3],
  ["y", 2, 7, 6, 1], ["y", 1, 8, 1, 2],
  ...(stride
    ? [["k", 3, 12, 1, 2], ["k", 6, 12, 1, 2], ["w", 2, 14, 3, 1], ["w", 5, 14, 3, 1]]
    : [["k", 2, 12, 1, 2], ["k", 7, 12, 1, 2], ["w", 1, 14, 3, 1], ["w", 6, 14, 3, 1]]) as Fill[],
]));

// Huerto de Halloween
export const pumpkin = (face: string | null) => outline(paint(11, 10, [
  ["g", 5, 1, 1, 2],
  ...disc("p", 5, 5, 3), ["p", 1, 4, 9, 3],
  ["P", 3, 3, 1, 5], ["P", 7, 3, 1, 5],
  ...(face ? [[face, 3, 4], [face, 7, 4], [face, 5, 5], [face, 3, 7, 5, 1], ["p", 4, 7], ["p", 6, 7]] : []) as Fill[],
]));
export const pumpkinPatch = (face: string) => compose(27, 11, [
  { rows: pumpkin(null), y: 1 },
  { rows: pumpkin(face), x: 8 },
  { rows: pumpkin(face), x: 16, y: 1 },
]);
export const scarecrow = (tilt: boolean) => outline(paint(17, 22, [
  ["b", 8, 8, 1, 13],
  ["c", 2, 9, 13, 2], ["C", 4, 9, 1, 2], ["C", 8, 9, 1, 2], ["C", 12, 9, 1, 2],
  ["y", 1, 9, 1, 2], ["y", 15, 9, 1, 2],
  ["c", 6, 11, 5, 5], ["C", 6, 13, 5, 1], ["y", 6, 16, 5, 1],
  ["s", 6, 4, 5, 4], ["k", 7, 5], ["k", 9, 5], ["k", 7, 7, 3, 1],
  ["k", tilt ? 7 : 6, 1, 3, 2], ["k", 5, 3, 7, 1],
]));
/** Bat with pointed ears and red eyes; its wings flap between two poses. 11×6. */
export const bat = (up: boolean) => paint(11, 6, [
  ["k", 4, 2, 3, 3], ["k", 4, 1], ["k", 6, 1], ["e", 4, 3], ["e", 6, 3],
  ...(up
    ? [["K", 1, 0], ["k", 2, 1, 2, 1], ["k", 3, 2], ["K", 9, 0], ["k", 7, 1, 2, 1], ["k", 7, 2]]
    : [["K", 0, 4, 2, 1], ["k", 2, 3, 2, 1], ["K", 9, 4, 2, 1], ["k", 7, 3, 2, 1]]) as Fill[],
]);
export const blackCat = (eye: string, tailUp: boolean) => outline(paint(11, 17, [
  ["b", 2, 11, 7, 5], ["B", 2, 12, 7, 1],
  ["k", 3, 1], ["k", 7, 1], ["k", 3, 2, 5, 4], [eye, 4, 3], [eye, 6, 3],
  ["k", 3, 6, 5, 5],
  tailUp ? ["k", 8, 5, 1, 5] : ["k", 8, 8, 2, 2],
]));


export const SEASONS_PROPS = {
  xmasTree: {
    size: "fixture",
    palette: { o: "#0e1a12", Y: "#ffe08a", g: "#2a6a3a", G: "#1e5230", w: "#f4f8fc", r: "#e84a4a", b: "#6ab0ff", y: "#f2d04a", k: "#5a3a20" },
    frames: frames(xmasTree(0), xmasTree(1), xmasTree(2)),
    fps: 1.5,
    glow: { x: 12, y: 18, color: "255, 220, 150", radius: 15 },
  },
  xmasStall: {
    size: "stall",
    palette: { o: "#1a1e1a", r: "#2a8a4a", w: "#f2ece0", b: "#6a4428", B: "#8a5a34", y: "#b8783a", Y: "#e8c25a", p: "#d8402e", k: "#5a3a20" },
    frames: frames(MARKET_STALL),
    fps: 1,
    glow: { x: 9, y: 10, color: "255, 210, 140", radius: 10 },
  },
  xmasSnowman: {
    size: "person",
    palette: { o: "#3a4a5a", w: "#f7fbff", k: "#2a2a30", n: "#f08a2c", r: "#d8402e", b: "#6a4428" },
    frames: frames(snowman(false), snowman(true)),
    fps: 1.4,
  },
  xmasCottage: {
    size: "building",
    palette: { o: "#2a1e1a", R: "#e8eef5", Q: "#c8d2de", c: "#6a5a52", C: "#4a3e38", w: "#efe2c6", b: "#6a4428", d: "#4a2e1c", D: "#3a2214", y: "#ffd97a", Y: "#ffc05a", g: "#2a6a3a", f: "#e84a4a", S: "#8a8078" },
    frames: frames(cottage("y"), cottage("Y")),
    fps: 1.2,
    effect: { kind: "smoke", x: 27, y: 1 },
    glow: { x: 8, y: 33, color: "255, 200, 120", radius: 10 },
  },
  xmasSkater: {
    size: "person",
    palette: { o: "#1e2a3a", w: "#f4f8fc", r: "#d8402e", s: "#f0c39a", k: "#2a2a34", y: "#f2c84a", c: "#3a8ae8" },
    frames: frames(skater(true), skater(false)),
    fps: 2,
  },
  halloweenPumpkins: {
    size: "small",
    palette: { o: "#1a1008", g: "#4a7a3a", p: "#e8842a", P: "#b8621e", y: "#ffe08a", Y: "#ffb84a" },
    frames: frames(pumpkinPatch("y"), pumpkinPatch("Y")),
    fps: 2,
    glow: { x: 13, y: 5, color: "255, 150, 60", radius: 11 },
  },
  halloweenScarecrow: {
    size: "person",
    palette: { o: "#1a1008", k: "#2a2226", s: "#d8b878", c: "#b8402e", C: "#7a2a1e", y: "#e8c25a", b: "#6a4428" },
    frames: frames(scarecrow(false), scarecrow(false), scarecrow(true)),
    fps: 1,
  },
  halloweenBat: {
    size: "sky",
    palette: { k: "#3a2448", K: "#5a3a6a", e: "#ff5a5a" },
    frames: frames(bat(true), bat(false)),
    fps: 6,
  },
  halloweenCat: {
    size: "medium",
    palette: { o: "#0a0610", k: "#1a1620", e: "#f2d04a", b: "#6a4428", B: "#4a2e1c" },
    frames: frames(blackCat("e", false), blackCat("e", true), blackCat("k", false)),
    fps: 1.2,
  },
} satisfies Record<string, SceneProp>;
