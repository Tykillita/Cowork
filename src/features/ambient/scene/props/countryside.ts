/**
 * Farm, village and train station. Sizes follow scale.ts: the walker is 15
 * rows tall, so doors are 16–18 rows, buildings 40+ and the train 37.
 */
import type { Fill } from "../pixelArt";
import { compose, disc, line, mirror, outline, paint, rowsBetween } from "../pixelArt";
import { CAT_ASLEEP } from "./capybaras";
import { frames } from "./shared";
import type { SceneProp } from "../types";

// ─── Granja al amanecer ─────────────────────────────────────────────────────

/** Gambrel roof, board walls, a hayloft and big double doors. 48×45. */
export const BARN = outline(paint(48, 45, [
  ...[6, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 22].map((half, row): Fill => ["R", 24 - half, 1 + row, half * 2, 1]),
  ...[3, 6, 9, 12, 15].map((row): Fill => ["Q", 24 - [6, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 22][row - 1] + 1, row, [6, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 22][row - 1] * 2 - 2, 1]),
  ["w", 2, 16, 44, 1],
  ["w", 18, 5, 12, 10], ["d", 19, 6, 10, 8], ["y", 19, 11, 10, 3], ["y", 20, 10, 2, 1], ["y", 25, 10, 3, 1], ["k", 22, 3, 4, 1], ["k", 23, 4, 1, 2],
  ["r", 3, 17, 42, 25],
  ...[7, 11, 15, 32, 36, 40].map((x): Fill => ["q", x, 18, 1, 24]),
  ["w", 3, 17, 42, 1], ["w", 3, 17, 1, 25], ["w", 44, 17, 1, 25],
  ["w", 6, 22, 7, 7], ["d", 7, 23, 5, 5], ["w", 9, 23, 1, 5], ["w", 7, 25, 5, 1],
  ["w", 35, 22, 7, 7], ["d", 36, 23, 5, 5], ["w", 38, 23, 1, 5], ["w", 36, 25, 5, 1],
  ["y", 23, 23, 2, 2], ["k", 23, 22, 2, 1],
  ["w", 15, 26, 18, 16], ["r", 16, 27, 8, 15], ["r", 24, 27, 8, 15], ["w", 23, 27, 2, 15],
  ...[16, 24].flatMap((left) => [...line("w", left, 27, left + 7, 41), ...line("w", left + 7, 27, left, 41)]),
  ["S", 3, 42, 42, 2], ["s", 6, 42, 2, 1], ["s", 20, 43, 3, 1], ["s", 37, 42, 2, 1],
]));

/** Windmill with four lattice sails: `+` and `×` alternate so they seem to turn. 37×53. */
const windmillArm = (dx: number, dy: number, length: number): Fill[] => {
  const hubX = 18;
  const hubY = 16;
  const px = -dy;
  const py = dx;
  const fills: Fill[] = [];
  for (let step = 1; step <= length; step += 1) {
    fills.push(["k", hubX + dx * step, hubY + dy * step]);
    if (step < 4 || step > length - 1) continue;
    for (let depth = 1; depth <= 3; depth += 1) fills.push([step % 3 === 0 || depth === 3 ? "W" : "w", hubX + dx * step + px * depth, hubY + dy * step + py * depth]);
  }
  return fills;
};
const WINDMILL_BODY: Fill[] = [
  ...Array.from({ length: 33 }, (_, row): Fill => {
    const half = 6 + Math.round((row / 32) * 4);
    return ["s", 18 - half, 18 + row, half * 2 + 1, 1];
  }),
  ...Array.from({ length: 33 }, (_, row): Fill => {
    const half = 6 + Math.round((row / 32) * 4);
    return ["S", 18 + Math.ceil(half * 0.4), 18 + row, half - Math.ceil(half * 0.4) + 1, 1];
  }),
  ...[2, 4, 5, 6, 7, 7, 8].map((half, row): Fill => ["R", 18 - half, 11 + row, half * 2 + 1, 1]),
  ["Q", 11, 17, 15, 1],
  ["y", 17, 23, 3, 3], ["k", 18, 23, 1, 3], ["y", 17, 32, 3, 3], ["k", 18, 32, 1, 3],
  ["d", 15, 35, 7, 16], ["d", 16, 34, 5, 1], ["k", 20, 43],
  ["S", 7, 49, 23, 2],
];
export const WINDMILL_PLUS = outline(paint(37, 53, [
  ...WINDMILL_BODY,
  ...windmillArm(0, -1, 16), ...windmillArm(0, 1, 16), ...windmillArm(-1, 0, 16), ...windmillArm(1, 0, 16),
  ["k", 17, 15, 3, 3], ["y", 18, 16],
]));
export const WINDMILL_CROSS = outline(paint(37, 53, [
  ...WINDMILL_BODY,
  ...windmillArm(1, -1, 12), ...windmillArm(-1, 1, 12), ...windmillArm(-1, -1, 12), ...windmillArm(1, 1, 12),
  ["k", 17, 15, 3, 3], ["y", 18, 16],
]));

/** A cow about as tall as the walker; she lowers her head to graze. 30×19. */
export const cowFrame = (grazing: boolean) => outline(paint(30, 19, [
  ["w", 3, 5, 1, 7], ["k", 2, 11, 2, 2],
  ["w", 4, 5, 19, 9], ["W", 6, 13, 15, 1],
  ["k", 6, 5, 5, 3], ["k", 7, 8, 3, 2], ["k", 14, 7, 4, 4], ["k", 19, 5, 3, 2], ["k", 5, 11, 2, 2],
  ["p", 16, 14, 3, 1], ["p", 16, 15], ["p", 18, 15],
  ["w", 5, 14, 2, 3], ["w", 8, 14, 2, 3], ["w", 18, 14, 2, 3], ["w", 21, 14, 2, 3],
  ["k", 5, 17, 2, 1], ["k", 8, 17, 2, 1], ["k", 18, 17, 2, 1], ["k", 21, 17, 2, 1],
  ...(grazing
    ? [["w", 22, 6, 2, 5], ["w", 23, 9, 5, 6], ["k", 23, 9, 2, 2], ["p", 25, 13, 4, 3], ["k", 27, 14], ["k", 25, 10], ["h", 23, 7, 1, 2], ["h", 26, 7, 1, 2], ["k", 21, 9, 2, 1], ["g", 27, 17, 2, 1], ["g", 28, 16]]
    : [["w", 22, 5, 2, 4], ["w", 23, 3, 5, 6], ["k", 23, 3, 2, 2], ["p", 25, 7, 4, 3], ["k", 27, 8], ["k", 25, 4], ["h", 23, 1, 1, 2], ["h", 26, 1, 1, 2], ["k", 21, 3, 2, 1]]) as Fill[],
]));

export const chicken = (pecking: boolean) => outline(paint(11, 9, [
  ["w", 1, 2, 1, 3], ["w", 3, 3, 3, 1], ["w", 2, 4, 6, 3], ["W", 3, 5, 3, 1],
  ["y", 4, 7], ["y", 6, 7],
  ...(pecking
    ? [["r", 7, 3, 2, 1], ["w", 7, 4, 2, 2], ["k", 8, 4], ["y", 9, 5]] as Fill[]
    : [["r", 6, 0, 2, 1], ["w", 6, 1, 2, 3], ["k", 7, 1], ["y", 8, 2]] as Fill[]),
]));
export const CHICK = outline(paint(7, 6, [["c", 1, 2, 3, 2], ["c", 3, 1, 2, 2], ["k", 4, 1], ["y", 5, 2], ["y", 2, 4], ["y", 3, 4]]));
export const flockFrame = (first: boolean, second: boolean, chickY: number) => compose(28, 9, [
  { rows: chicken(first) },
  { rows: mirror(chicken(second)), x: 11 },
  { rows: CHICK, x: 21, y: chickY },
]);

export const sheep = (eyeKey: string) => outline(paint(16, 11, [
  ["w", 3, 2, 8, 1], ["w", 2, 3, 10, 4], ["w", 3, 7, 8, 1],
  ["W", 4, 4], ["W", 7, 3], ["W", 9, 5], ["W", 5, 6],
  ["w", 11, 1, 2, 1], ["k", 11, 2, 3, 3], ["k", 10, 2], [eyeKey, 13, 3],
  ["k", 4, 8, 1, 2], ["k", 9, 8, 1, 2],
]));

// ─── Aldea del valle ────────────────────────────────────────────────────────

/** Half-timbered cottage with a shingled roof, chimney and a 17-row door. 38×43. */
export const cottage = (windowKey: string) => outline(paint(38, 43, [
  ["c", 26, 3, 3, 10], ["C", 25, 2, 5, 1],
  ...Array.from({ length: 16 }, (_, row): Fill => [row % 3 === 2 ? "Q" : "R", 18 - (2 + row), 4 + row, (2 + row) * 2 + 1, 1]),
  ["b", 15, 11, 7, 5], [windowKey, 16, 12, 5, 3], ["b", 18, 12, 1, 3],
  ["w", 4, 20, 30, 20],
  ["b", 4, 20, 30, 1], ["b", 4, 29, 30, 1], ["b", 4, 20, 1, 20], ["b", 33, 20, 1, 20], ["b", 13, 20, 1, 20], ["b", 24, 20, 1, 20],
  ...line("b", 5, 28, 12, 21), ...line("b", 25, 21, 32, 28),
  [windowKey, 27, 22, 5, 5], ["b", 29, 22, 1, 5], ["b", 27, 24, 5, 1],
  [windowKey, 6, 31, 5, 5], ["b", 8, 31, 1, 5], ["b", 6, 33, 5, 1], ["g", 5, 36, 7, 1], ["f", 6, 35], ["f", 9, 35],
  [windowKey, 27, 31, 5, 5], ["b", 29, 31, 1, 5], ["b", 27, 33, 5, 1], ["g", 26, 36, 7, 1], ["f", 28, 35], ["f", 31, 35],
  ["d", 15, 24, 7, 16], ["d", 16, 23, 5, 1], ["D", 18, 24, 1, 16], ["y", 20, 32],
  ["S", 4, 40, 30, 1], ["S", 13, 41, 11, 1],
]));

/** Stone well with a roof, a crank and a bucket that goes up and down. 22×25. */
export const well = (rope: number) => outline(paint(22, 25, [
  ...[2, 4, 6, 8, 9, 10].map((half, row): Fill => [row === 3 ? "Q" : "R", 11 - half, 1 + row, half * 2, 1]),
  ["b", 3, 7, 1, 10], ["b", 18, 7, 1, 10], ["b", 3, 8, 16, 1], ["k", 19, 8, 2, 1], ["k", 20, 9],
  ["k", 11, 9, 1, rope], ["B", 10, 9 + rope, 3, 3], ["k", 10, 9 + rope, 3, 1],
  ["s", 2, 16, 18, 7], ["S", 2, 16, 18, 1],
  ...[[4, 17], [9, 18], [14, 17], [6, 19], [12, 20], [17, 19], [3, 21], [9, 21], [15, 22]].map(([x, y]): Fill => ["S", x, y, 2, 1]),
]));

/** Iron street lamp, about twice the walker's height. 9×33. */
export const lamppost = (glass: string) => outline(paint(9, 33, [
  ["k", 4, 1], ["k", 2, 2, 5, 1], ["k", 1, 3, 7, 1],
  [glass, 2, 4, 5, 4], ["k", 4, 4, 1, 4],
  ["k", 1, 8, 7, 1], ["k", 3, 9, 3, 1],
  ["k", 4, 10, 1, 19], ["k", 3, 19, 3, 1],
  ["k", 3, 29, 3, 2], ["k", 2, 31, 5, 1],
]));

/** Market stall: striped awning above head height, counter at waist height. 30×29. */
export const MARKET_STALL = outline(paint(30, 29, [
  ...Array.from({ length: 9 }, (_, stripe): Fill => [stripe % 2 ? "w" : "r", 1 + stripe * 3, 1, 3, 6]),
  ...Array.from({ length: 9 }, (_, stripe): Fill => [stripe % 2 ? "w" : "r", 2 + stripe * 3, 7, 1, 1]),
  ["b", 3, 7, 1, 11], ["b", 26, 7, 1, 11],
  ["k", 9, 7, 1, 2], ["y", 8, 9, 3, 2], ["k", 20, 7, 1, 3], ["p", 19, 10, 3, 2],
  ["Y", 4, 15, 4, 1], ["y", 4, 16, 4, 2], ["Y", 9, 14, 4, 1], ["y", 9, 15, 4, 3],
  ["k", 15, 16, 6, 2], ["p", 15, 15, 2, 1], ["p", 18, 15, 2, 1], ["p", 16, 14, 2, 1],
  ["y", 22, 15, 3, 3], ["Y", 22, 15, 3, 1],
  ["b", 1, 18, 28, 1], ["B", 1, 19, 28, 9], ["b", 1, 23, 28, 1],
  ...[5, 11, 17, 23].map((x): Fill => ["b", x, 19, 1, 9]),
]));
export const BARREL = outline(paint(13, 12, [["b", 1, 1, 11, 10], ["B", 4, 1, 1, 10], ["B", 8, 1, 1, 10], ["k", 1, 2, 11, 1], ["k", 1, 8, 11, 1]]));
export const catOnBarrel = (cat: string[]) => compose(13, 17, [{ rows: BARREL, y: 5 }, { rows: cat, x: 2, y: 1 }]);

// ─── Estación de tren ───────────────────────────────────────────────────────

/** Country station: ticket hall, platform canopy, clock and a bench with a sleeping cat. 50×43. */
export const station = (cat: string[]) => compose(50, 43, [
  { rows: outline(paint(50, 43, [
    ["T", 8, 3, 18, 1],
    ...rowsBetween("R", 4, [[6, 27], [5, 28], [4, 29], [3, 30], [2, 31], [1, 32]]),
    ["R", 28, 9, 21, 3], ...Array.from({ length: 10 }, (_, index): Fill => ["w", 29 + index * 2, 12]),
    ["w", 3, 10, 27, 30], ["W", 3, 32, 27, 8], ["b", 3, 31, 27, 1],
    ["s", 7, 12, 19, 4], ...[9, 10, 12, 14, 15, 17, 19, 20, 22, 23].map((x): Fill => ["k", x, 13 + (x % 2), 1, 1]),
    ["y", 5, 20, 6, 9], ["b", 7, 20, 1, 9], ["b", 5, 24, 6, 1],
    ["y", 23, 20, 5, 9], ["b", 25, 20, 1, 9], ["b", 23, 24, 5, 1],
    ["d", 13, 22, 7, 18], ["d", 14, 21, 5, 1], ["y", 14, 24, 5, 4], ["b", 16, 24, 1, 4], ["y", 18, 31],
    ["b", 31, 12, 1, 28], ["b", 46, 12, 1, 28],
    ["k", 39, 12, 1, 2], ...disc("w", 39, 17, 3), ["k", 39, 15, 1, 3], ["k", 40, 17],
    ["b", 33, 29, 12, 2], ["b", 33, 34, 12, 1], ["k", 34, 35, 1, 4], ["k", 43, 35, 1, 4], ["k", 33, 31, 1, 3], ["k", 44, 31, 1, 3],
    ["S", 1, 40, 48, 2], ["y", 1, 40, 48, 1],
  ])) },
  { rows: cat, x: 35, y: 29 },
]);

/** Steam train: two carriages with passengers, then the locomotive. 112×38. */
const carriage = (left: number, faces: number[]): Fill[] => [
  ["R", left + 1, 4, 31, 1], ["R", left, 5, 33, 2],
  ["g", left, 7, 33, 22], ["G", left, 20, 33, 2], ["G", left, 27, 33, 2],
  ...[0, 1, 2, 3].flatMap((index): Fill[] => {
    const x = left + 3 + index * 8;
    return [
      ["y", x, 10, 6, 8], ["Y", x, 10, 6, 1],
      ...(faces.includes(index) ? [["p", x + 2, 12, 2, 2], ["P", x + 1, 14, 4, 4]] as Fill[] : []),
    ];
  }),
  ["k", left + 1, 29, 31, 2],
  ...[6, 11, 22, 27].flatMap((offset): Fill[] => [...disc("k", left + offset, 33, 2), ["m", left + offset, 33]]),
];
export const train = (rodLow: boolean) => outline(paint(112, 38, [
  ...carriage(1, [0, 2]), ["k", 34, 24, 3, 2],
  ...carriage(37, [1, 3]), ["k", 70, 24, 3, 2],
  ["R", 71, 4, 16, 2], ["r", 72, 6, 14, 23], ["y", 75, 9, 8, 7], ["r", 78, 9, 1, 7], ["p", 76, 11, 2, 2], ["P", 75, 13, 3, 3],
  ["k", 86, 12, 20, 16], ["K", 86, 12, 20, 2], ["m", 92, 12, 1, 16], ["m", 99, 12, 1, 16],
  ["k", 98, 2, 6, 2], ["k", 99, 4, 4, 8], ["y", 91, 9, 4, 3],
  ["y", 106, 14, 2, 3], ["k", 106, 12, 2, 16],
  ["m", 72, 28, 36, 1],
  ...rowsBetween("m", 27, [[104, 106], [104, 107], [104, 108], [104, 109], [104, 110]]),
  ...[78, 88, 98].flatMap((x): Fill[] => [...disc("k", x, 32, 4), ["m", x - 1, 32, 3, 1], ["m", x, 31, 1, 3]]),
  ...disc("k", 105, 34, 2),
  ["M", 78, rodLow ? 33 : 31, 21, 1],
]));

/** Two-lamp railway signal on a tall post. 9×31. */
export const railSignal = (red: boolean) => outline(paint(9, 31, [
  ["k", 2, 1, 5, 10], ["K", 1, 2, 1, 2], ["K", 1, 6, 1, 2],
  [red ? "r" : "x", 3, 2, 3, 3], [red ? "z" : "g", 3, 6, 3, 3],
  ["m", 4, 11, 1, 17], ["m", 3, 16, 3, 1], ["k", 2, 28, 5, 2],
]));
export const LUGGAGE = outline(paint(16, 11, [
  ["k", 5, 1, 2, 1], ["u", 3, 2, 6, 3], ["U", 3, 3, 6, 1],
  ["b", 1, 5, 9, 5], ["B", 1, 7, 9, 1],
  ["r", 11, 6, 4, 4], ["R", 11, 7, 4, 1],
]));

export const COUNTRYSIDE_PROPS = {
  farmBarn: {
    size: "building",
    palette: { o: "#2a1414", R: "#7a2626", Q: "#5e1c1c", r: "#b83a3a", q: "#9a2e2e", w: "#f2ece0", d: "#3a1a1a", y: "#e8c25a", k: "#3a2a20", S: "#8a8078", s: "#a89e94" },
    frames: frames(BARN),
    fps: 1,
  },
  farmWindmill: {
    size: "landmark",
    palette: { o: "#2a2420", s: "#efe6d4", S: "#d2c4aa", R: "#8a3a2a", Q: "#6a2a1e", d: "#4a3020", y: "#ffd97a", k: "#5a4030", w: "#f7f2e8", W: "#d8cdb8" },
    frames: frames(WINDMILL_PLUS, WINDMILL_CROSS),
    fps: 2.5,
  },
  farmCow: {
    size: "large",
    palette: { o: "#2a2420", w: "#f4f0e8", W: "#d8d2c6", k: "#2a2a2a", p: "#f0a8a8", h: "#e8dcc0", g: "#5a9a3a" },
    frames: frames(cowFrame(false), cowFrame(true), cowFrame(true), cowFrame(true)),
    fps: 0.8,
  },
  farmChickens: {
    size: "small",
    palette: { o: "#3a2a20", w: "#f7f2ea", W: "#d8cfc2", r: "#e04a3a", y: "#f0a030", k: "#1a1a1a", c: "#f7d54a" },
    frames: frames(flockFrame(false, false, 3), flockFrame(true, false, 2), flockFrame(false, true, 3), flockFrame(true, true, 3)),
    fps: 3,
  },
  farmSheep: {
    size: "medium",
    palette: { o: "#3a3434", w: "#f4f2ee", W: "#d6d2cc", k: "#2a2626", e: "#f4f0e8" },
    frames: frames(sheep("e"), sheep("e"), sheep("k")),
    fps: 1.2,
  },
  villageCottage: {
    size: "building",
    palette: { o: "#2a1e1a", R: "#7a3a2a", Q: "#5e2a1e", c: "#6a5a52", C: "#4a3e38", w: "#efe2c6", b: "#6a4428", d: "#4a2e1c", D: "#3a2214", y: "#ffd97a", Y: "#ffc05a", g: "#5a9a3a", f: "#f08aa8", S: "#8a8078" },
    frames: frames(cottage("y"), cottage("Y")),
    fps: 1.2,
    effect: { kind: "smoke", x: 27, y: 1 },
    glow: { x: 8, y: 33, color: "255, 200, 120", radius: 10 },
  },
  villageWell: {
    size: "fixture",
    palette: { o: "#2a2420", R: "#6a3a2a", Q: "#4e2a1e", b: "#6a4428", k: "#3a2e24", B: "#8a6a4a", s: "#9a9a9a", S: "#7a7a7a" },
    frames: frames(well(2), well(4), well(6), well(4)),
    fps: 1.5,
  },
  villageLamp: {
    size: "fixture",
    palette: { o: "#1a1a1e", k: "#3a3a44", y: "#ffe08a", Y: "#ffc85a" },
    frames: frames(lamppost("y"), lamppost("Y")),
    fps: 1.8,
    glow: { x: 4, y: 5, color: "255, 214, 140", radius: 14 },
  },
  villageStall: {
    size: "stall",
    palette: { o: "#2a1e1a", r: "#c84a4a", w: "#f2ece0", b: "#6a4428", B: "#8a5a34", y: "#e8b060", Y: "#c88a40", p: "#d84a5a", k: "#5a3a20" },
    frames: frames(MARKET_STALL),
    fps: 1,
    glow: { x: 9, y: 10, color: "255, 210, 140", radius: 10 },
  },
  villageCat: {
    size: "medium",
    palette: { o: "#2a1e1a", b: "#8a5a34", B: "#6a4428", k: "#3a2e24", q: "#e8923a", Q: "#b8682a", e: "#1a1a1a" },
    frames: frames(catOnBarrel(CAT_ASLEEP)),
    fps: 1,
    effect: { kind: "zzz", x: 9, y: 1 },
  },
  stationBuilding: {
    size: "building",
    palette: { o: "#1e1a18", R: "#8a3a2a", T: "#6a2a1e", w: "#efe2c6", W: "#d8c8a8", s: "#f7f4ee", k: "#2a2226", y: "#ffd97a", b: "#6a4428", d: "#4a2e1c", S: "#8a8a8a", q: "#e8923a", Q: "#b8682a", e: "#1a1a1a" },
    frames: frames(station(CAT_ASLEEP)),
    fps: 1,
    effect: { kind: "zzz", x: 42, y: 29 },
  },
  stationTrain: {
    size: "train",
    palette: { o: "#141418", R: "#3a2a2a", g: "#3a7a5a", G: "#2e5e46", y: "#ffd97a", Y: "#ffe8b0", p: "#3a3040", P: "#5a4a60", k: "#2a2a30", K: "#4a4a54", r: "#b83a3a", m: "#9aa3ae", M: "#c8ccd6" },
    frames: frames(train(false), train(true)),
    fps: 6,
    effect: { kind: "smoke", x: 100, y: 1 },
  },
  stationSignal: {
    size: "fixture",
    palette: { o: "#141418", k: "#2a2a30", K: "#1a1a1e", m: "#6a6e7a", r: "#ff4a4a", x: "#4a1a1a", g: "#4aff8a", z: "#1a4a2a" },
    frames: frames(railSignal(true), railSignal(true), railSignal(false)),
    fps: 0.7,
  },
  stationLuggage: {
    size: "small",
    palette: { o: "#1e1a18", k: "#2a2226", u: "#3a6ab8", U: "#2a4a88", b: "#8a5a34", B: "#6a4428", r: "#c84a4a", R: "#9a3030" },
    frames: frames(LUGGAGE),
    fps: 1,
  },
} satisfies Record<string, SceneProp>;
