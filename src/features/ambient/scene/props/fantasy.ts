/**
 * Giant mushroom forest and the dragon's nest. The mushroom folk (the
 * walking mushroom is 12 rows) live in a house whose door is taller than
 * them; the little dragons are babies next to their huge sleeping mother.
 */
import { DRAGON_BLINK, DRAGON_BODY, DRAGON_FLAME, DRAGON_PALETTE, DRAGON_STAND, DRAGON_WING_DOWN, DRAGON_WING_UP, GHOST_BLINK, GHOST_BODY, GHOST_PALETTE, GHOST_WAVE_A, GHOST_WAVE_B, MUSHROOM_BLINK, MUSHROOM_BODY, MUSHROOM_FEET, MUSHROOM_PALETTE, dragonFrame } from "../characters";
import type { Fill } from "../pixelArt";
import { compose, disc, line, mirror, outline, paint } from "../pixelArt";
import { frames } from "./shared";
import type { SceneProp } from "../types";

// ─── Bosque de setas ────────────────────────────────────────────────────────

/** Toadstool house: spotted cap, round windows, a tall arched door. 34×38. */
export const mushroomHouse = (glass: string) => outline(paint(34, 38, [
  ...[6, 9, 11, 12, 13, 14, 15, 15, 16, 16, 16, 16].map((half, row): Fill => ["r", 17 - half, 1 + row, half * 2, 1]),
  ["R", 3, 13, 28, 1], ...Array.from({ length: 9 }, (_, index): Fill => ["R", 5 + index * 3, 12]),
  ...disc("w", 9, 5, 2), ...disc("w", 20, 3, 1), ...disc("w", 26, 8, 2), ["w", 13, 9, 2, 1], ["w", 5, 10, 2, 1], ["w", 17, 7],
  ...[7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10].map((half, row): Fill => ["s", 17 - half, 14 + row, half * 2 + 1, 1]),
  ...[7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10].map((half, row): Fill => ["S", 17 + half - 2, 14 + row, 3, 1]),
  ...disc("S", 11, 19, 3), ...disc(glass, 11, 19, 2), ["S", 11, 17, 1, 5], ["S", 9, 19, 5, 1],
  ...disc("S", 24, 24, 3), ...disc(glass, 24, 24, 2), ["S", 24, 22, 1, 5], ["S", 22, 24, 5, 1],
  ["g", 20, 28, 7, 1], ["f", 21, 27], ["f", 24, 27],
  ["d", 14, 21, 7, 15], ["d", 15, 20, 5, 1], ["d", 16, 19, 3, 1], ["D", 19, 28],
  ["S", 12, 35, 11, 1], ["g", 6, 35, 4, 1], ["g", 26, 35, 3, 1],
]));
export const chatFrame = (left: string[], right: string[], leftY: number, rightY: number) =>
  compose(30, 13, [{ rows: [...left, ...MUSHROOM_FEET], y: leftY }, { rows: mirror([...right, ...MUSHROOM_FEET]), x: 16, y: rightY }]);

// ─── Nido del dragón ────────────────────────────────────────────────────────

export const EGG = [".oo.", "oEEo", "oEso", "oEEo", ".oo."];
export const EGG_CRACK = [".oo.", "oEoo", "ooEo", "oEso", ".oo."];
export const NEST = ["NnNnNnNnNnNnNnNn", ".nNnNnNnNnNnNnN."];
export const nestFrame = (middleX: number, middle: string[]) => compose(16, 8, [{ rows: middle, x: middleX }, { rows: EGG, x: 1, y: 1 }, { rows: EGG, x: 11, y: 1 }, { rows: NEST, y: 6 }]);
export const STICK = (top: string) => [top, top, ".k", ".k", ".k", ".k", ".k", ".k", ".k", ".k", ".k", ".k"];
export const roastFrame = (flame: boolean, top: string) => compose(25, 13, [
  { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_DOWN, flame ? [DRAGON_FLAME] : []) },
  { rows: STICK(top), x: 21, y: 1 },
]);

/**
 * The mother dragon, asleep: a long body with a folded wing, back spikes and
 * a strong haunch; her big head rests on her front paws, horns swept back;
 * her tail curls round the front, and a baby sleeps in the curl. `breath`
 * lifts her back and wing one row. 86×38.
 */
const ellipseRows = (key: string, cx: number, cy: number, rx: number, ry: number): Fill[] =>
  Array.from({ length: ry * 2 + 1 }, (_, index): Fill => {
    const dy = index - ry;
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    return [key, cx - span, cy + dy, span * 2 + 1, 1];
  });
export const giantDragon = (breath: 0 | 1) => {
  const lift = breath;
  const body = paint(86, 38, [
    // Tail: from the rump, round the front, ending in a spade.
    ...[[12, 27, 3], [7, 30, 3], [6, 34, 2], [11, 35, 2], [18, 35, 2], [25, 35, 2], [31, 35, 2]].flatMap(([x, y, r]) => ellipseRows("d", x, y, r + 1, r)),
    ["D", 34, 33, 2, 4], ["D", 36, 34, 2, 2], ["D", 38, 35],
    // Body, scales and belly.
    ...ellipseRows("d", 36, 25 - lift, 24, 10 + lift),
    ...Array.from({ length: 21 }, (_, index): Fill => ["D", 16 + (index % 7) * 6 + (Math.floor(index / 7) % 2) * 3, 19 + Math.floor(index / 7) * 4]),
    ...ellipseRows("b", 38, 32, 18, 3), ...Array.from({ length: 6 }, (_, index): Fill => ["B", 26 + index * 5, 30, 1, 5]),
    // Haunch and hind foot.
    ...ellipseRows("D", 21, 28, 8, 6), ...ellipseRows("d", 21, 28, 7, 5), ["D", 17, 26, 3, 1],
    ["d", 13, 32, 12, 3], ["h", 13, 35], ["h", 16, 35], ["h", 19, 35],
    // Folded wing: dark membrane, light bones, a claw at the joint.
    ...Array.from({ length: 16 }, (_, row): Fill => {
      const y = 6 - lift + row;
      const left = Math.round(52 - (row / 15) * 34);
      const right = Math.round(56 + (row < 8 ? row * 0.3 : (15 - row) * 0.3));
      return ["M", left, y, right - left + 1, 1];
    }),
    ...line("w", 55, 6 - lift, 18, 21 - lift), ...line("w", 55, 6 - lift, 30, 21 - lift), ...line("w", 55, 6 - lift, 43, 21 - lift),
    ["h", 55, 5 - lift, 2, 1], ["h", 56, 4 - lift],
    // Spikes along the rump and the neck.
    ...[14, 19, 58, 62].flatMap((x): Fill[] => [["h", x, 13 - lift, 1, 2], ["h", x - 1, 14 - lift, 3, 1]]),
    // Neck and head resting on the front paws.
    ...ellipseRows("d", 61, 23, 6, 7),
    ["d", 58, 31, 14, 4], ["D", 58, 34, 14, 1], ["h", 59, 35], ["h", 62, 35], ["h", 65, 35], ["h", 68, 35],
    ...ellipseRows("d", 70, 26, 6, 4),
    ...[[72, 80], [72, 82], [72, 82], [72, 82], [72, 82], [73, 81]].map(([left, right], row): Fill => ["d", left, 26 + row, right - left + 1, 1]),
    ["E", 74, 29, 8, 1], ["D", 70, 31, 12, 1], ["n", 81, 27],
    ["D", 66, 24, 6, 1], ["c", 67, 25, 4, 1],
    ...line("W", 63, 24, 63, 29), ...line("W", 64, 23, 64, 28),
    ...line("h", 66, 22, 58, 15), ...line("h", 67, 22, 59, 15), ["H", 58, 15], ["H", 58, 14],
    ...line("h", 70, 22, 64, 17), ["H", 64, 16],
  ]);
  const baby = compose(21, 11, [{ rows: DRAGON_BLINK }, DRAGON_WING_DOWN]);
  return compose(86, 38, [{ rows: outline(body) }, { rows: baby, x: 37, y: 26 }]);
};

export const FANTASY_PROPS = {
  mushroomHouse: {
    size: "building",
    palette: { ...MUSHROOM_PALETTE, y: "#ffd97a", Y: "#ffb84a", d: "#6a3a2a", D: "#ffd97a", g: "#4a7a4a", f: "#e86aa0" },
    frames: frames(mushroomHouse("y"), mushroomHouse("Y")),
    fps: 1.1,
    glow: { x: 11, y: 19, color: "255, 200, 120", radius: 11 },
  },
  mushroomChat: {
    size: "medium",
    palette: MUSHROOM_PALETTE,
    frames: frames(
      chatFrame(MUSHROOM_BODY, MUSHROOM_BODY, 1, 1),
      chatFrame(MUSHROOM_BODY, MUSHROOM_BODY, 0, 1),
      chatFrame(MUSHROOM_BODY, MUSHROOM_BLINK, 1, 1),
      chatFrame(MUSHROOM_BLINK, MUSHROOM_BODY, 1, 0),
    ),
    fps: 2,
  },
  mushroomSleeper: {
    size: "medium",
    palette: MUSHROOM_PALETTE,
    frames: frames(MUSHROOM_BLINK),
    fps: 1,
    effect: { kind: "zzz", x: 11, y: 0 },
  },
  ghost: {
    size: "medium",
    palette: GHOST_PALETTE,
    frames: [
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -3 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_B], bob: -4 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -5 },
      { rows: [...GHOST_BLINK, ...GHOST_WAVE_B], bob: -4 },
    ],
    fps: 2.5,
  },
  dragonMother: {
    size: "building",
    palette: { ...DRAGON_PALETTE, B: "#d8a64a", E: "#2e2250", H: "#b8ad9a", M: "#5a40b8", h: "#f2e6c8" },
    frames: frames(giantDragon(0), giantDragon(0), giantDragon(1), giantDragon(1)),
    fps: 0.8,
    effect: { kind: "zzz", x: 74, y: 21 },
  },
  dragonNest: {
    size: "small",
    palette: { o: "#2a1a12", E: "#f2e6c8", s: "#b58be8", n: "#5a3a20", N: "#8a6238" },
    frames: frames(nestFrame(6, EGG), nestFrame(7, EGG), nestFrame(5, EGG), nestFrame(6, EGG_CRACK)),
    fps: 3,
  },
  dragonSleeper: {
    size: "medium",
    palette: DRAGON_PALETTE,
    frames: frames(compose(21, 11, [{ rows: DRAGON_BLINK }, DRAGON_WING_DOWN])),
    fps: 1,
    effect: { kind: "zzz", x: 15, y: 1 },
  },
  dragonRoaster: {
    size: "medium",
    palette: { ...DRAGON_PALETTE, k: "#7a5230", M: "#fff6ea", T: "#c98a4a" },
    frames: frames(roastFrame(false, "MM"), roastFrame(true, "MM"), roastFrame(true, "TT"), roastFrame(false, "TT")),
    fps: 1.6,
  },
  dragonFlyer: {
    size: "sky",
    palette: DRAGON_PALETTE,
    frames: [
      { rows: compose(21, 11, [{ rows: DRAGON_BODY }, DRAGON_WING_UP]) },
      { rows: compose(21, 11, [{ rows: DRAGON_BODY }, DRAGON_WING_DOWN]), bob: 2 },
    ],
    fps: 3,
  },
} satisfies Record<string, SceneProp>;
