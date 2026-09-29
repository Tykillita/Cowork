import type { Fill } from "../pixelArt";
import { cone, disc, line, outline, paint } from "../pixelArt";
import { WINDMILL_CROSS, WINDMILL_PLUS } from "./countryside";
import { frames } from "./shared";
import type { SceneProp } from "../types";

/**
 * Fishing port, medieval castle, desert oasis, cloud city and space port.
 * Sizes follow scale.ts: the lighthouse, castle and rocket are landmarks
 * three to four walkers tall; doors and gates are taller than the walker.
 */

// ─── Puerto pesquero ────────────────────────────────────────────────────────
/** Striped lighthouse on its rock: lantern room, balcony, windows and a tall door. 19×55. */
export const LIGHTHOUSE = outline(paint(19, 55, [
  ["k", 9, 1], ["R", 8, 2, 3, 1], ["R", 7, 3, 5, 1], ["R", 6, 4, 7, 1], ["R", 5, 5, 9, 1],
  ["y", 6, 6, 7, 5], ["k", 6, 6, 1, 5], ["k", 9, 6, 1, 5], ["k", 12, 6, 1, 5],
  ["k", 3, 10, 1, 2], ["k", 15, 10, 1, 2], ["k", 3, 11, 13, 1], ["k", 4, 12, 11, 1],
  ...Array.from({ length: 36 }, (_, row): Fill => {
    const half = 4 + Math.round((row / 35) * 3);
    const band = Math.floor(row / 6) % 2 ? "w" : "r";
    return [band, 9 - half, 13 + row, half * 2 + 1, 1];
  }),
  ...Array.from({ length: 36 }, (_, row): Fill => {
    const half = 4 + Math.round((row / 35) * 3);
    const band = Math.floor(row / 6) % 2 ? "W" : "R";
    return [band, 9 + Math.ceil(half / 2), 13 + row, half - Math.ceil(half / 2) + 1, 1];
  }),
  ["k", 8, 18, 3, 3], ["y", 9, 19], ["k", 8, 28, 3, 3], ["y", 9, 29],
  ["d", 7, 33, 5, 16], ["d", 8, 32, 3, 1], ["y", 10, 41],
  ["s", 1, 49, 17, 4], ["S", 2, 49, 4, 1], ["S", 11, 50, 3, 1], ["S", 5, 51, 2, 1], ["S", 14, 52, 2, 1],
]));

export const fishThief = (tailUp: boolean) => outline(paint(21, 12, [
  ["b", 2, 2, 6, 4], ["B", 2, 3, 6, 1], ["f", 3, 1], ["F", 4, 1], ["f", 6, 1],
  ["b", 1, 6, 8, 5], ["B", 1, 8, 8, 1],
  tailUp ? ["g", 10, 4, 1, 3] : ["g", 10, 6, 1, 3],
  ["g", 11, 7, 6, 3], ["g", 15, 4, 3, 3], ["g", 15, 3], ["g", 17, 3], ["e", 17, 5],
  ["g", 12, 10], ["g", 16, 10],
  ["f", 18, 6, 2, 1], ["F", 19, 5],
]));
export const gullOnPost = (lookUp: boolean) => outline(paint(10, 13, [
  ["k", 2, 8, 5, 4], ["K", 2, 9, 5, 1],
  ["G", 1, 4], ["w", 2, 4, 5, 3], ["G", 2, 5, 3, 1],
  ["w", 5, 2, 2, 2], ["e", 6, 2], ["y", 7, lookUp ? 2 : 3],
  ["y", 4, 7],
]));

/** Sailboat with a mast twice the walker's height, mainsail, jib and a pennant. 34×30. */
export const SAILBOAT = outline(paint(34, 30, [
  ["r", 17, 1, 3, 1], ["r", 17, 2, 2, 1],
  ["k", 16, 1, 1, 23],
  ...Array.from({ length: 20 }, (_, row): Fill => ["S", 17, 3 + row, Math.round(1 + row * 0.7), 1]),
  ...[7, 12, 17].map((row): Fill => ["U", 17, row, Math.round(1 + (row - 3) * 0.7), 1]),
  ...Array.from({ length: 16 }, (_, row): Fill => {
    const width = Math.round(1 + row * 0.65);
    return ["s", 16 - width, 7 + row, width, 1];
  }),
  ["k", 16, 23, 15, 1],
  ["w", 2, 24, 30, 1], ["h", 2, 25, 30, 1], ["h", 3, 26, 28, 1], ["H", 5, 27, 24, 1], ["h", 7, 28, 20, 1],
  ["k", 10, 26], ["k", 16, 26], ["k", 22, 26],
]));

export const rowboat = (bite: boolean) => outline(paint(20, 11, [
  ["g", 5, 2, 4, 3], ["g", 5, 1], ["g", 8, 1], ["e", 8, 2],
  ["k", 9, 3], ["k", 10, 2], ["k", 11, 1], ["k", 12, 1], ["k", 13, 1],
  ["k", 14, 2, 1, bite ? 5 : 4], ["r", 14, bite ? 7 : 6],
  ["b", 1, 5, 12, 2], ["B", 2, 7, 10, 1],
]));
export const gullFlying = (up: boolean) => paint(9, 5, [
  ["w", 3, 2, 3, 1], ["w", 6, 1], ["y", 7, 1],
  ...(up ? [["G", 1, 0], ["G", 2, 1], ["G", 5, 0], ["G", 4, 1]] : [["G", 1, 3], ["G", 2, 2], ["G", 5, 3], ["G", 4, 2]]) as Fill[],
]);

// ─── Castillo medieval ───────────────────────────────────────────────────────
/** Castle with two round towers, a crenellated keep, banners and a gate taller than the walker. 64×56. */
export const castle = (flagA: boolean) => outline(paint(64, 56, [
  ["k", 9, 0, 1, 2], ["k", 55, 0, 1, 2],
  ...(flagA
    ? [["f", 10, 0, 3, 1], ["f", 10, 1, 2, 1], ["f", 56, 0, 3, 1], ["f", 56, 1, 2, 1]]
    : [["f", 10, 0, 2, 1], ["f", 10, 1, 3, 1], ["f", 56, 0, 2, 1], ["f", 56, 1, 3, 1]]) as Fill[],
  ...cone("R", 9, 2, 10, 0.65), ...cone("R", 55, 2, 10, 0.65), ["R", 2, 12, 15, 1], ["R", 48, 12, 15, 1],
  ["s", 3, 13, 13, 41], ["s", 49, 13, 13, 41], ["S", 13, 13, 3, 41], ["S", 59, 13, 3, 41],
  ...[0, 1, 2, 3, 4, 5, 6].map((index): Fill => ["s", 16 + index * 5, 17, 3, 3]),
  ["s", 16, 20, 33, 34], ["S", 16, 20, 33, 1],
  ...Array.from({ length: 18 }, (_, index): Fill => ["S", 18 + (index % 6) * 5 + (Math.floor(index / 6) % 2) * 2, 24 + Math.floor(index / 6) * 9, 2, 1]),
  ...[[6, 20], [9, 34], [5, 44], [52, 22], [57, 36], [53, 46]].map(([x, y]): Fill => ["S", x, y, 2, 1]),
  ["k", 9, 18, 1, 4], ["k", 55, 18, 1, 4], ["y", 8, 30, 3, 4], ["y", 54, 30, 3, 4], ["k", 9, 30, 1, 4], ["k", 55, 30, 1, 4],
  ["f", 20, 22, 4, 10], ["f", 20, 32], ["f", 23, 32], ["y", 21, 25, 2, 2],
  ["f", 41, 22, 4, 10], ["f", 41, 32], ["f", 44, 32], ["y", 42, 25, 2, 2],
  ["y", 30, 23, 5, 4], ["k", 32, 23, 1, 4], ["k", 30, 25, 5, 1],
  ["S", 25, 30, 15, 2], ["S", 24, 32, 17, 1],
  ["d", 29, 31, 7, 1], ["d", 28, 32, 9, 1], ["d", 27, 33, 11, 21],
  ...[28, 30, 32, 34, 36].map((x): Fill => ["k", x, 33, 1, 13]), ...[36, 40, 44].map((y): Fill => ["k", 27, y, 11, 1]),
]));

export const knight = (stride: boolean) => outline(paint(13, 16, [
  ["w", 10, 1], ["k", 10, 2, 1, 13],
  ["r", 3, 1, 3, 1],
  ["m", 4, 2, 4, 4], ["k", 6, 3, 2, 1],
  ["m", 3, 6, 6, 5], ["f", 4, 6, 4, 5], ["y", 5, 8, 2, 1],
  ["M", 9, 7, 1, 3],
  ["b", 1, 7, 3, 4], ["y", 2, 8],
  ...(stride
    ? [["m", 3, 11, 1, 3], ["m", 8, 11, 1, 3], ["k", 2, 14, 2, 1], ["k", 8, 14, 2, 1]]
    : [["m", 4, 11, 1, 3], ["m", 7, 11, 1, 3], ["k", 3, 14, 2, 1], ["k", 7, 14, 2, 1]]) as Fill[],
]));
export const archeryTarget = (arrow: boolean) => outline(paint(12, 15, [
  ["b", 3, 9, 1, 5], ["b", 7, 9, 1, 5],
  ...disc("w", 5, 5, 4), ...disc("r", 5, 5, 3), ...disc("w", 5, 5, 2), ...disc("y", 5, 5, 1),
  ...(arrow ? [["k", 6, 4, 4, 1], ["f", 10, 3], ["f", 10, 5]] : []) as Fill[],
]));
export const banner = (ripple: boolean) => outline(paint(9, 26, [
  ["y", 1, 1], ["k", 1, 2, 1, 23],
  ...(ripple ? [5, 4, 5, 4, 5, 4, 3] : [4, 5, 4, 5, 4, 5, 3]).map((width, row): Fill => ["f", 2, 3 + row, width, 1]),
  ["y", 3, 5, 2, 2],
]));

// ─── Oasis del desierto ──────────────────────────────────────────────────────
export const camel = (tailUp: boolean, eye: string) => outline(paint(23, 19, [
  ["c", 8, 3, 3, 1], ["c", 7, 4, 5, 1], ["c", 6, 5, 7, 1],
  ["c", 3, 6, 13, 5], ["C", 4, 10, 11, 1],
  ["r", 6, 6, 5, 2], ["y", 6, 8], ["y", 8, 8], ["y", 10, 8],
  ["c", 15, 4, 2, 5], ["c", 16, 2, 4, 3], ["c", 16, 1], [eye, 18, 2], ["C", 19, 3, 2, 2], ["k", 20, 3],
  tailUp ? ["C", 2, 6, 1, 3] : ["C", 2, 7, 1, 3],
  ["c", 4, 11, 1, 6], ["c", 6, 11, 1, 6], ["c", 12, 11, 1, 6], ["c", 14, 11, 1, 6],
  ["C", 4, 17], ["C", 6, 17], ["C", 12, 17], ["C", 14, 17],
]));
export const camelResting = (eye: string) => outline(paint(23, 12, [
  ["c", 8, 2, 3, 1], ["c", 7, 3, 5, 1], ["c", 6, 4, 7, 1],
  ["c", 3, 5, 13, 5], ["C", 2, 10, 16, 1],
  ["r", 6, 5, 5, 2], ["y", 6, 7], ["y", 8, 7], ["y", 10, 7],
  ["c", 15, 3, 2, 5], ["c", 16, 1, 4, 3], ["c", 16, 0], [eye, 18, 1], ["C", 19, 2, 2, 2], ["k", 20, 2],
]));
/** Market tent: striped canopy, a hanging rug, clay jars, spice sacks and a lamp. 32×29. */
export const desertTent = (lamp: string) => outline(paint(32, 29, [
  ...[[7, 24], [5, 26], [4, 27], [3, 28], [2, 29], [1, 30], [1, 30]].flatMap(([left, right], row): Fill[] =>
    Array.from({ length: right - left + 1 }, (_, column): Fill => [Math.floor((left + column) / 3) % 2 ? "w" : "u", left + column, 1 + row])),
  ...Array.from({ length: 10 }, (_, index): Fill => [index % 2 ? "w" : "u", 1 + index * 3, 8, 2, 1]),
  ["b", 3, 8, 1, 19], ["b", 28, 8, 1, 19],
  ["r", 6, 10, 8, 11], ["y", 7, 11, 6, 1], ["y", 7, 19, 6, 1], ["Y", 9, 13, 2, 1], ["Y", 8, 14, 4, 2], ["Y", 9, 16, 2, 1],
  ["k", 24, 8, 1, 2], [lamp, 23, 10, 3, 3], ["k", 23, 13, 3, 1],
  ["p", 16, 18, 4, 9], ["p", 17, 16, 2, 2], ["P", 16, 21, 4, 1],
  ["p", 21, 22, 3, 5], ["P", 21, 23, 3, 1],
  ["y", 25, 22, 4, 5], ["Y", 25, 22, 4, 1],
  ["r", 1, 27, 30, 1],
]));

/** Fennec fox sitting: huge pink-lined ears, pointed snout, bushy tail. 13×13. */
export const fennec = (earTwitch: boolean) => outline(paint(13, 13, [
  ["f", 5, 1, 2, 3], ["p", 6, 2, 1, 2],
  ...(earTwitch ? [["f", 9, 2, 2, 2], ["p", 9, 3]] : [["f", 8, 1, 2, 3], ["p", 8, 2, 1, 2]]) as Fill[],
  ["f", 5, 4, 5, 3], ["f", 10, 5, 1, 2], ["k", 11, 5], ["k", 8, 5], ["w", 9, 6, 2, 1],
  ["f", 2, 7, 6, 4], ["w", 6, 7, 2, 3], ["F", 2, 10, 5, 1],
  ["f", 1, 6, 1, 4], ["w", 1, 9],
  ["F", 3, 11], ["F", 6, 11],
]));

// ─── Ciudad en las nubes ─────────────────────────────────────────────────────
export const envelope = (cx: number, cy: number, radius: number): Fill[] => Array.from({ length: radius * 2 + 1 }, (_, index) => {
  const dy = index - radius;
  const span = Math.round(Math.sqrt(radius * radius - dy * dy));
  return Array.from({ length: span * 2 + 1 }, (_, column): Fill => [Math.floor((column + radius - span) / 3) % 2 ? "b" : "a", cx - span + column, cy + dy]);
}).flat();
export const balloon = (burning: boolean) => outline(paint(15, 21, [
  ...envelope(7, 7, 6), ["a", 5, 14, 5, 1],
  ["k", 5, 15, 1, 3], ["k", 9, 15, 1, 3],
  ["f", 7, 16], ...(burning ? [["y", 7, 15]] : []) as Fill[],
  ["t", 5, 18, 5, 2],
]));
export const FLOATING_ISLAND = outline(paint(28, 24, [
  ...disc("t", 22, 5, 3), ["T", 22, 9, 1, 3],
  ...cone("R", 9, 2, 5), ["w", 5, 7, 9, 5], ["d", 8, 9, 2, 3], ["y", 6, 8], ["y", 11, 8],
  ["g", 2, 12, 24, 2],
  ...[12, 11, 9, 8, 6, 4, 3, 1].map((half, row): Fill => ["s", 14 - half, 14 + row, half * 2, 1]),
  ["S", 8, 15, 3, 1], ["S", 16, 17, 2, 1], ["S", 12, 19, 2, 1],
  ["v", 6, 15, 1, 3], ["v", 20, 15, 1, 4], ["c", 24, 14, 1, 6],
]));
export const SMALL_ISLAND = outline(paint(16, 17, [
  ...disc("t", 6, 4, 3), ["T", 6, 8, 1, 2],
  ["g", 1, 10, 14, 1],
  ...[7, 6, 4, 3, 1].map((half, row): Fill => ["s", 8 - half, 11 + row, half * 2, 1]),
  ["S", 6, 12, 2, 1], ["v", 11, 11, 1, 3],
]));

// ─── Puerto espacial ─────────────────────────────────────────────────────────
/** Rocket on its pad beside a lattice gantry; the flame flickers under the nozzle. 26×55. */
export const rocket = (flame: number) => outline(paint(26, 55, [
  ["m", 1, 6, 1, 42], ["m", 4, 6, 1, 42],
  ...Array.from({ length: 10 }, (_, index): Fill[] => [...line("M", 1, 6 + index * 4, 4, 10 + index * 4)]).flat(),
  ["m", 5, 14, 4, 1], ["m", 5, 30, 4, 1],
  ...cone("r", 13, 1, 9, 0.5),
  ["w", 9, 10, 9, 31], ["W", 16, 10, 2, 31], ["r", 9, 22, 9, 1], ["r", 9, 34, 9, 1],
  ...disc("k", 13, 15, 2), ...disc("b", 13, 15, 1), ["c", 12, 14],
  ...disc("k", 13, 27, 2), ...disc("b", 13, 27, 1), ["c", 12, 26],
  ...Array.from({ length: 12 }, (_, row): Fill[] => [["r", 8 - Math.floor(row / 3), 32 + row, Math.floor(row / 3) + 1, 1], ["r", 18, 32 + row, Math.floor(row / 3) + 1, 1]]).flat(),
  ["k", 10, 41, 7, 3],
  ["M", 2, 47, 23, 3], ...Array.from({ length: 6 }, (_, index): Fill => ["y", 3 + index * 4, 47, 2, 1]),
  ["k", 4, 50, 1, 3], ["k", 21, 50, 1, 3],
  ["f", 10, 44, 7, 1 + flame * 2], ["y", 11, 44, 5, flame * 2], ["F", 12, 44, 3, flame],
]));

export const robot = (boxUp: boolean) => outline(paint(15, 16, [
  ["r", 6, 1], ["k", 6, 2],
  ["m", 4, 3, 6, 4], ["c", 5, 4, 4, 1],
  ["M", 6, 7, 2, 1],
  ["m", 3, 8, 8, 5], ["M", 3, 11, 8, 1], ["y", 5, 9, 2, 1],
  ["b", 9, boxUp ? 4 : 6, 5, 4], ["B", 9, boxUp ? 5 : 7, 5, 1],
  ["k", 3, 13, 8, 2], ["m", 4, 13], ["m", 8, 13],
]));
export const SPACE_CRATES = outline(paint(16, 13, [
  ["u", 3, 1, 6, 4], ["c", 4, 2, 4, 1],
  ["b", 1, 5, 7, 7], ["y", 1, 5, 7, 1], ["y", 1, 11, 7, 1], ["k", 3, 7, 3, 3],
  ["b", 8, 7, 7, 5], ["B", 8, 9, 7, 1],
]));
/** Radar dish that turns from side to side on its mast, with a blinking control box. 21×27. */
export const dish = (facing: -1 | 0 | 1) => outline(paint(21, 27, [
  ["m", 9, 15, 3, 9], ["k", 5, 24, 11, 2], ["M", 13, 19, 5, 4], ["r", 14, 20],
  ...(facing === 0
    ? [...disc("w", 10, 8, 7), ...disc("W", 11, 9, 4), ["k", 10, 8], ...line("k", 10, 8, 10, 3)]
    : [
      ...Array.from({ length: 15 }, (_, index): Fill => {
        const dy = index - 7;
        return ["w", 10 + facing * Math.round((dy * dy) / 12) - (facing < 0 ? 2 : 0), 8 + dy, 3, 1];
      }),
      ...line("k", 10, 8, 10 - facing * 6, 8), ["k", 10 - facing * 6, 7, 1, 3],
    ]) as Fill[],
]));

export const spaceship = (flame: boolean) => outline(paint(22, 9, [
  ["W", 5, 1, 3, 2],
  ["w", 4, 3, 13, 3], ["w", 17, 3, 2, 2], ["w", 19, 4, 1, 1], ["c", 12, 3, 3, 1],
  ["W", 7, 6, 6, 2],
  ["f", flame ? 1 : 2, 3, flame ? 3 : 2, 3], ["y", 2, 4, 2, 1],
]));
export const alien = (waveUp: boolean) => outline(paint(12, 14, [
  ["y", 3, 1], ["y", 9, 1], ["a", 4, 2], ["a", 8, 2],
  ["a", 3, 3, 7, 4], ["k", 4, 4, 2, 2], ["k", 7, 4, 2, 2], ["w", 4, 4], ["w", 7, 4],
  ["a", 4, 7, 5, 4], ["s", 4, 8, 5, 3],
  waveUp ? ["a", 9, 5, 1, 3] : ["a", 9, 8, 1, 3], ["a", 3, 8, 1, 3],
  ["a", 5, 11, 1, 2], ["a", 7, 11, 1, 2],
]));


export const ADVENTURE_PROPS = {
  harborLighthouse: {
    size: "landmark",
    palette: { o: "#1a1e2a", R: "#a8302a", k: "#2a2e38", y: "#fff2b0", r: "#d8402e", w: "#f2f4f7", W: "#c8ccd6", d: "#4a3020", s: "#6a6a74", S: "#4a4a54" },
    frames: frames(LIGHTHOUSE),
    fps: 1,
    glow: { x: 9, y: 8, color: "255, 240, 180", radius: 10 },
    beam: { x: 9, y: 8, color: "255, 240, 180", length: 70 },
  },
  harborCat: {
    size: "small",
    palette: { o: "#1e1a18", b: "#8a6a44", B: "#6a4e30", f: "#b8c8d8", F: "#8aa0b8", g: "#8a8a96", e: "#f2d04a" },
    frames: frames(fishThief(false), fishThief(true)),
    fps: 2,
  },
  harborGull: {
    size: "small",
    palette: { o: "#2a2a30", k: "#3a3a44", K: "#5a4a3a", w: "#f7f7f2", G: "#9aa3ae", y: "#f2a93b", e: "#1a1a1a" },
    frames: frames(gullOnPost(false), gullOnPost(false), gullOnPost(true)),
    fps: 1.5,
  },
  harborSailboat: {
    size: "vehicle",
    palette: { o: "#1a1e2a", h: "#c84a3a", H: "#f2ece0", w: "#8a6a44", k: "#5a4030", S: "#f7f2e8", U: "#d8d0c0", s: "#e8e0d0", r: "#e84a3a" },
    frames: frames(SAILBOAT),
    fps: 1,
  },
  harborRowboat: {
    size: "vehicle",
    palette: { o: "#1a1e2a", g: "#8a8a96", e: "#f2d04a", k: "#3a2e24", r: "#e84a3a", b: "#8a6a44", B: "#6a4e30" },
    frames: frames(rowboat(false), rowboat(false), rowboat(true)),
    fps: 1.2,
  },
  seagull: {
    size: "sky",
    palette: { w: "#f7f7f2", G: "#9aa3ae", y: "#f2a93b" },
    frames: frames(gullFlying(true), gullFlying(false)),
    fps: 4,
  },
  castleKeep: {
    size: "landmark",
    palette: { o: "#2a2a30", R: "#3a5ab8", s: "#b8b0a0", S: "#9a9284", y: "#ffd97a", f: "#d8402e", d: "#3a2a20", k: "#2a2226" },
    frames: frames(castle(true), castle(false)),
    fps: 2,
  },
  castleKnight: {
    size: "person",
    palette: { o: "#1e1e26", m: "#b8c0cc", M: "#8a94a4", k: "#3a3a44", w: "#f2f4f7", r: "#d8402e", f: "#3a5ab8", y: "#e8c25a", b: "#8a5a34" },
    frames: frames(knight(true), knight(false)),
    fps: 4,
  },
  castleTarget: {
    size: "person",
    palette: { o: "#2a2420", b: "#8a5a34", w: "#f2ece0", r: "#d8402e", y: "#f2c84a", k: "#3a2e24", f: "#f2f4f7" },
    frames: frames(archeryTarget(false), archeryTarget(true), archeryTarget(true), archeryTarget(true)),
    fps: 1,
  },
  castleBanner: {
    size: "fixture",
    palette: { o: "#2a2226", y: "#e8c25a", k: "#5a4030", f: "#3a5ab8" },
    frames: frames(banner(false), banner(true)),
    fps: 2.5,
  },
  oasisCamelResting: {
    size: "large",
    palette: { o: "#3a2a1a", c: "#d8a868", C: "#b8884a", r: "#b8402e", y: "#e8c25a", k: "#2a1a10" },
    frames: frames(camelResting("k"), camelResting("k"), camelResting("C")),
    fps: 1,
  },
  oasisCamel: {
    size: "large",
    palette: { o: "#3a2a1a", c: "#d8a868", C: "#b8884a", r: "#3a6ab8", y: "#e8c25a", k: "#2a1a10" },
    frames: frames(camel(false, "k"), camel(true, "k"), camel(false, "C")),
    fps: 1.3,
  },
  oasisTent: {
    size: "stall",
    palette: { o: "#2a1e1a", u: "#3a6ab8", w: "#f2ece0", b: "#6a4428", r: "#b8402e", y: "#e8c25a", Y: "#3a6ab8", p: "#c8784a", P: "#9a5a34", l: "#ffd97a", L: "#ffb84a", k: "#3a2e24" },
    frames: frames(desertTent("l"), desertTent("L")),
    fps: 1.4,
    glow: { x: 24, y: 11, color: "255, 214, 140", radius: 10 },
  },
  oasisFennec: {
    size: "small",
    palette: { o: "#3a2a1a", f: "#e8c48a", F: "#c8a06a", p: "#f0a0a8", k: "#2a1a10", w: "#f7f0e4" },
    frames: frames(fennec(true), fennec(true), fennec(false)),
    fps: 1.5,
  },
  cloudWindmill: {
    size: "landmark",
    palette: { o: "#6a5a7a", s: "#fbf4fa", S: "#e8dcee", R: "#e88fb0", Q: "#c86d94", d: "#8a6a9a", y: "#ffe08a", k: "#9a7aa8", w: "#ffffff", W: "#e8dcee" },
    frames: frames(WINDMILL_PLUS, WINDMILL_CROSS),
    fps: 2,
  },
  balloonRed: {
    size: "sky",
    palette: { o: "#3a2a2a", a: "#e84a4a", b: "#f7f2ea", k: "#5a4030", f: "#ff8a3a", y: "#ffe08a", t: "#8a5a34" },
    frames: frames(balloon(true), balloon(false), balloon(false)),
    fps: 2,
  },
  balloonBlue: {
    size: "sky",
    palette: { o: "#2a2a3a", a: "#3a8ae8", b: "#f2c84a", k: "#5a4030", f: "#ff8a3a", y: "#ffe08a", t: "#8a5a34" },
    frames: frames(balloon(false), balloon(true), balloon(false)),
    fps: 2,
  },
  floatingIsland: {
    size: "sky",
    palette: { o: "#4a4a5a", t: "#5aa05a", T: "#6a4428", R: "#d8603a", w: "#f2ece0", d: "#6a4428", y: "#ffd97a", g: "#7cc05a", s: "#a89a8a", S: "#8a7c6e", v: "#4a8a3a", c: "#bfe3ff" },
    frames: frames(FLOATING_ISLAND),
    fps: 1,
  },
  smallIsland: {
    size: "sky",
    palette: { o: "#4a4a5a", t: "#e88fb0", T: "#6a4428", g: "#7cc05a", s: "#a89a8a", S: "#8a7c6e", v: "#4a8a3a" },
    frames: frames(SMALL_ISLAND),
    fps: 1,
  },
  spaceRocket: {
    size: "landmark",
    palette: { o: "#0e0e18", w: "#f2f4f7", W: "#c8ccd6", r: "#d8402e", b: "#2a3a5a", c: "#6ae8ff", k: "#2a2a34", f: "#ff8a3a", F: "#ffffff", y: "#ffe08a", m: "#6a6e7a", M: "#8a8e9a" },
    frames: frames(rocket(1), rocket(2), rocket(1), rocket(2)),
    fps: 6,
    effect: { kind: "smoke", x: 8, y: 46 },
    glow: { x: 13, y: 46, color: "255, 170, 90", radius: 9 },
  },
  spaceRobot: {
    size: "person",
    palette: { o: "#141420", m: "#9aa3b2", M: "#6a7282", c: "#6ae8ff", r: "#ff4a6a", k: "#2a2a34", y: "#f2c84a", b: "#c8864a", B: "#9a6230" },
    frames: frames(robot(true), robot(false)),
    fps: 2,
  },
  spaceCrates: {
    size: "small",
    palette: { o: "#141420", u: "#3a4a6a", c: "#6ae8ff", b: "#5a6272", B: "#3e4452", y: "#f2c84a", k: "#2a2a34" },
    frames: frames(SPACE_CRATES),
    fps: 1,
    glow: { x: 6, y: 2, color: "106, 232, 255", radius: 6 },
  },
  spaceDish: {
    size: "fixture",
    palette: { o: "#141420", w: "#e8eef5", W: "#c8d0dc", m: "#9aa3b2", M: "#6a7282", k: "#3a3e4a", r: "#ff4a6a" },
    frames: frames(dish(-1), dish(0), dish(1), dish(0)),
    fps: 1,
  },
  spaceship: {
    size: "sky",
    palette: { o: "#141420", w: "#e8eef5", W: "#9aa3b2", c: "#6ae8ff", f: "#ff8a3a", y: "#ffe08a" },
    frames: frames(spaceship(true), spaceship(false)),
    fps: 8,
  },
  spaceAlien: {
    size: "person",
    palette: { o: "#142014", a: "#8de78a", k: "#1a2a1a", w: "#ffffff", y: "#f2e84a", s: "#b8c0cc" },
    frames: frames(alien(true), alien(false)),
    fps: 3,
  },
} satisfies Record<string, SceneProp>;
