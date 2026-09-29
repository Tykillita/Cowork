/**
 * Kyoto street, neon Tokyo, the mountain temple and the night market.
 * Sizes follow scale.ts: a torii leaves three walkers of room under its beam,
 * a vending machine is just taller than a person, stalls have their roof
 * above head height.
 */
import type { Fill } from "../pixelArt";
import { blinkRow, disc, outline, paint } from "../pixelArt";
import { frames } from "./shared";
import type { SceneProp } from "../types";

// ─── Calle de Kioto ─────────────────────────────────────────────────────────

/** Vermilion torii: black kasagi with upturned ends, plaque and stone-capped posts. 44×46. */
export const TORII = outline(paint(44, 46, [
  ["k", 1, 1, 2, 1], ["k", 41, 1, 2, 1], ["k", 1, 2, 5, 1], ["k", 38, 2, 5, 1],
  ["k", 2, 3, 40, 2], ["K", 2, 3, 40, 1],
  ["r", 3, 5, 38, 2],
  ["r", 20, 7, 4, 6], ["g", 17, 7, 10, 7], ["k", 18, 8, 8, 5], ["g", 20, 9, 4, 1], ["g", 20, 11, 4, 1],
  ["r", 3, 14, 38, 2], ["R", 3, 15, 38, 1],
  ["r", 8, 5, 4, 36], ["R", 11, 5, 1, 36], ["r", 32, 5, 4, 36], ["R", 35, 5, 1, 36],
  ["k", 7, 41, 6, 4], ["k", 31, 41, 6, 4],
]));

/** Ramen cart: noren curtains, a red lantern, bowls on the counter and a steaming pot. 34×30. */
export const ramenStall = (core: string) => outline(paint(34, 30, [
  ["R", 1, 1, 32, 3], ["Q", 1, 2, 32, 1],
  ...Array.from({ length: 5 }, (_, panel): Fill[] => [["n", 4 + panel * 6, 4, 5, 7], ["w", 6 + panel * 6, 6, 1, 3]]).flat(),
  ["b", 2, 4, 1, 15], ["b", 31, 4, 1, 15],
  ["k", 4, 4, 1, 2], ["L", 3, 6, 3, 5], ["D", 3, 8, 3, 1], [core, 4, 7, 1, 3],
  ["w", 8, 16, 4, 2], ["y", 9, 16, 2, 1], ["w", 15, 16, 4, 2], ["y", 16, 16, 2, 1],
  ["k", 23, 14, 6, 4], ["m", 23, 14, 6, 1],
  ["B", 1, 18, 32, 1],
  ["b", 2, 19, 30, 6], ["B", 2, 21, 30, 1], ...[9, 16, 23].map((x): Fill => ["B", x, 19, 1, 6]),
  ...disc("k", 8, 25, 3), ["s", 8, 25], ...disc("k", 26, 25, 3), ["s", 26, 25],
]));

/** Maneki-neko figurine waving its paw on a red cushion. 11×12. */
export const manekiNeko = (pawUp: boolean) => outline(paint(11, 12, [
  ["w", 2, 1], ["w", 7, 1], ["p", 2, 1], ["p", 7, 1],
  ["w", 2, 2, 6, 4], ["k", 3, 3], ["k", 6, 3], ["p", 4, 4, 2, 1],
  ["w", 2, 6, 6, 4], ["r", 2, 6, 6, 1], ["y", 4, 7, 2, 1], ["y", 3, 8, 2, 2],
  pawUp ? ["w", 8, 2, 1, 3] : ["w", 8, 5, 1, 3],
  ["r", 1, 10, 8, 1],
]));

/** Drink vending machine, a little taller than the walker. 13×20. */
export const vendingMachine = (buttons: string) => outline(paint(13, 20, [
  ["v", 1, 1, 11, 18], ["s", 1, 1, 11, 1],
  ["g", 2, 2, 9, 7],
  ...Array.from({ length: 8 }, (_, index): Fill => ["abcd"[(index + Math.floor(index / 4)) % 4], 3 + (index % 4) * 2, 3 + Math.floor(index / 4) * 3, 1, 2]),
  ...[0, 1, 2, 3].map((index): Fill => [index % 2 ? "k" : buttons, 3 + index * 2, 9]),
  ["k", 9, 11, 1, 2], ["k", 2, 14, 9, 2], ["k", 1, 17, 11, 1],
]));

/** Shiba inu sitting: curled tail, white cheeks and chest. 13×12. */
export const shiba = (tailUp: boolean, eye: string) => outline(paint(13, 12, [
  tailUp ? ["f", 1, 2, 2, 2] : ["f", 1, 4, 2, 2], tailUp ? ["w", 1, 2] : ["w", 1, 4],
  ["f", 2, 5, 6, 5], ["w", 6, 6, 2, 3],
  ["f", 7, 1], ["f", 10, 1], ["f", 6, 2, 5, 4],
  ["w", 9, 4, 3, 2], ["w", 7, 4], ["k", 11, 4], [eye, 8, 3],
  ["w", 6, 9, 2, 2], ["F", 2, 10, 3, 1],
]));

/** Tōrō stone lantern with a lit fire box, a bit taller than a person. 13×22. */
export const STONE_LANTERN = outline(paint(13, 22, [
  ["s", 6, 1], ["s", 5, 2, 3, 1],
  ["s", 3, 3, 7, 1], ["s", 1, 4, 11, 1], ["S", 1, 5, 11, 1], ["s", 1, 3], ["s", 11, 3],
  ["s", 3, 6, 7, 5], ["y", 5, 7, 3, 3], ["S", 3, 7, 1, 3], ["S", 9, 7, 1, 3],
  ["s", 2, 11, 9, 2], ["S", 2, 12, 9, 1],
  ["s", 5, 13, 3, 5], ["S", 5, 15, 3, 1],
  ["S", 2, 18, 9, 1], ["s", 2, 19, 9, 2],
]));

// ─── Tokio de neón ──────────────────────────────────────────────────────────

/** Convenience store: striped sign, a lit shop window with shelves and a clerk, sliding door. 48×41. */
export const KONBINI = outline(paint(48, 41, [
  ["b", 1, 1, 46, 3], ["m", 36, 0, 6, 1],
  ["s", 1, 4, 46, 6], ["G", 1, 6, 46, 1], ["O", 1, 7, 46, 1], ["B", 1, 8, 46, 1], ["B", 4, 4, 8, 2],
  ["b", 1, 10, 46, 30],
  ["g", 4, 13, 24, 24], ["k", 4, 19, 16, 1], ["k", 4, 25, 16, 1], ["k", 4, 31, 16, 1],
  ...Array.from({ length: 5 }, (_, index): Fill[] => [
    ["abcd"[index % 4], 5 + index * 3, 17, 2, 2], ["abcd"[(index + 2) % 4], 5 + index * 3, 23, 2, 2], ["abcd"[(index + 1) % 4], 5 + index * 3, 29, 2, 2],
  ]).flat(),
  ["p", 22, 21, 2, 2], ["P", 21, 23, 4, 6], ["K", 19, 29, 9, 8], ["a", 20, 28, 2, 1],
  ["a", 5, 34, 4, 3], ["c", 11, 34, 4, 3],
  ["k", 30, 17, 14, 23], ["g", 31, 18, 12, 22], ["k", 37, 18, 1, 22], ["D", 30, 39, 14, 1],
]));

/** Vertical neon sign on a pole; its tubes blink and change colour. 14×35. */
export const neonSign = (border: string, top: string, middle: string, bottom: string) => outline(paint(14, 35, [
  [border, 1, 1, 12, 20], ["b", 2, 2, 10, 18],
  [top, 4, 3, 6, 1], [top, 6, 3, 2, 4], [top, 4, 6, 6, 1],
  [middle, 4, 8, 1, 4], [middle, 9, 8, 1, 4], [middle, 4, 9, 6, 1], [middle, 4, 11, 6, 1],
  [bottom, 5, 14, 4, 1], [bottom, 4, 15, 1, 4], [bottom, 9, 15, 1, 4], [bottom, 4, 18, 6, 1],
  ["k", 6, 21, 2, 11], ["k", 4, 32, 6, 2],
]));

export const catInBox = (eyes: string) => outline(paint(12, 11, [
  ["g", 3, 1], ["g", 8, 1], ["g", 3, 2, 6, 3], [eyes, 4, 3], [eyes, 7, 3], ["p", 5, 4, 2, 1],
  ["C", 1, 4, 2, 1], ["C", 9, 4, 2, 1],
  ["c", 1, 5, 10, 5], ["t", 5, 5, 2, 1],
]));

/** Tokyo taxi with its roof sign and a driver, about as tall as a person. 38×18. */
export const taxi = (tail: string) => outline(paint(38, 18, [
  ["y", 17, 1, 5, 2], ["k", 19, 1],
  ...[[12, 26], [11, 27], [10, 28], [10, 28], [10, 28], [10, 28]].map(([left, right], row): Fill => ["b", left, 3 + row, right - left + 1, 1]),
  ["g", 12, 5, 4, 3], ["g", 17, 4, 4, 4], ["g", 22, 4, 5, 4], ["p", 24, 5, 2, 2],
  ["b", 2, 9, 34, 5], ["B", 2, 12, 34, 1], ["B", 17, 9, 1, 4], ["B", 23, 9, 1, 4], ["m", 20, 10, 2, 1], ["m", 26, 10, 2, 1],
  ["m", 1, 12, 2, 2], ["m", 35, 12, 2, 2],
  ["h", 34, 9, 2, 2], [tail, 2, 9, 1, 2],
  ...disc("k", 9, 14, 2), ["s", 9, 14], ...disc("k", 29, 14, 2), ["s", 29, 14],
]));

// ─── Templo en la montaña ───────────────────────────────────────────────────

/** Waterfall down a mossy cliff into a foaming pool. 20×49 (no outline: it is rock and water). */
export const waterfall = (shift: number) => paint(20, 49, [
  ["s", 0, 0, 5, 45], ["s", 15, 0, 5, 45],
  ...[[1, 6], [3, 14], [1, 24], [2, 33], [16, 9], [17, 19], [16, 28], [17, 38]].map(([x, y]): Fill => ["S", x, y, 2, 3]),
  ["v", 5, 2, 10, 43],
  ...Array.from({ length: 16 }, (_, index): Fill => ["V", 5 + (index % 5) * 2, 2 + ((index * 7 + shift * 4) % 40), 1, 3 + (index % 2)]),
  ["S", 0, 1, 20, 2], ["g", 0, 0, 20, 1], ["g", 2, 1, 2, 1], ["g", 16, 1, 2, 1], ["V", 6, 2, 8, 1],
  ["v", 0, 45, 20, 4], ["W", 4, 44, 3, 1], ["W", 12, 44, 3, 1], ["W", 8 + (shift % 2), 45, 3, 1], ["V", 2, 46, 4, 1], ["V", 13, 47, 4, 1],
]);

export const monk = (broomLeft: boolean) => outline(paint(15, 15, [
  ["s", 5, 1, 4, 4], ["k", 7, 2],
  ["r", 4, 5, 6, 8], ["R", 4, 5, 2, 8], ["r", 9, 6, 2, 2],
  ["k", 5, 13, 2, 1], ["k", 8, 13, 2, 1],
  ...(broomLeft
    ? [...Array.from({ length: 6 }, (_, step): Fill => ["b", 9 - step, 6 + step]), ["y", 1, 12, 4, 2]]
    : [...Array.from({ length: 6 }, (_, step): Fill => ["b", 10 + Math.floor(step / 2), 6 + step]), ["y", 11, 12, 3, 2]]) as Fill[],
]));

/** Bell pavilion: curved roof, a bronze bell and the log that strikes it. 30×31. */
export const templeBell = (swing: boolean) => outline(paint(30, 31, [
  ["R", 5, 1, 20, 1], ["R", 3, 2, 24, 1], ["R", 2, 3, 26, 1], ["R", 1, 4, 28, 2], ["R", 1, 3], ["R", 28, 3],
  ["b", 3, 6, 24, 2],
  ["b", 4, 8, 2, 20], ["b", 24, 8, 2, 20],
  ["k", 15, 8], ["m", 12, 9, 7, 2], ["m", 11, 11, 9, 8], ["M", 10, 19, 11, 1], ["M", 11, 13, 9, 1], ["M", 11, 16, 9, 1],
  ...[12, 14, 16, 18].map((x): Fill => ["M", x, 11]),
  ["k", 7, 8, 1, 5], ["k", 9, 8, 1, 5], ["l", swing ? 4 : 6, 13, 6, 2], ["L", swing ? 4 : 6, 13, 1, 2],
  ["s", 2, 28, 26, 2], ["S", 2, 28, 26, 1],
]));

export const crane = (up: boolean) => paint(13, 6, [
  ["w", 3, 3, 6, 1], ["w", 9, 2, 2, 1], ["k", 11, 2], ["r", 10, 1], ["k", 1, 3, 2, 1],
  ...(up ? [["w", 4, 0], ["w", 5, 1, 2, 2], ["k", 3, 0]] : [["w", 4, 4, 3, 1], ["w", 5, 5], ["k", 3, 5]]) as Fill[],
]);

// ─── Mercado nocturno ───────────────────────────────────────────────────────

/** Dumpling stall: bamboo steamers, buns, a red lantern and a cloth skirt. 26×27. */
export const steamerStall = (core: string) => outline(paint(26, 27, [
  ["R", 1, 1, 24, 2], ["b", 2, 3, 1, 22], ["b", 23, 3, 1, 22],
  ["k", 20, 3, 1, 2], ["L", 19, 5, 3, 4], [core, 20, 6, 1, 2],
  ["B", 10, 6], ["b", 6, 7, 9, 1],
  ["b", 5, 8, 11, 9], ["B", 5, 10, 11, 1], ["B", 5, 13, 11, 1], ["B", 5, 16, 11, 1],
  ["w", 17, 15, 2, 2], ["w", 19, 15, 2, 2], ["W", 17, 15], ["W", 19, 15],
  ["t", 1, 17, 24, 2],
  ["n", 3, 19, 20, 6], ["N", 3, 19, 20, 1],
  ["t", 2, 19, 1, 7], ["t", 23, 19, 1, 7],
]));

/** Paper lantern stall: a rack of glowing lanterns above a counter. 28×29. */
export const lanternStall = (core: string) => outline(paint(28, 29, [
  ["R", 1, 1, 26, 3], ["b", 2, 4, 1, 21], ["b", 25, 4, 1, 21], ["b", 2, 5, 24, 1],
  ...[0, 1, 2, 3, 4].flatMap((index): Fill[] => {
    const x = 4 + index * 4;
    const top = 7 + (index % 2) * 3;
    return [["k", x + 1, 6, 1, top - 6], ["abcad"[index], x, top, 3, 5], ["K", x, top + 2, 3, 1], [core, x + 1, top + 1, 1, 3]];
  }),
  ["a", 6, 18, 3, 2], ["c", 12, 18, 3, 2], ["d", 18, 18, 3, 2],
  ["T", 1, 20, 26, 1], ["t", 1, 21, 26, 7], ...[7, 13, 19].map((x): Fill => ["T", x, 21, 1, 7]),
]));

/** Yakitori grill with skewers over glowing coals, under a small awning. 24×25. */
export const grill = (coal: string) => outline(paint(24, 25, [
  ["R", 1, 1, 22, 2], ["b", 2, 3, 1, 10], ["b", 21, 3, 1, 10],
  ...[0, 1, 2, 3, 4].flatMap((index): Fill[] => [["b", 5 + index * 3, 7, 1, 5], ["m", 4 + index * 3, 8, 3, 1], ["M", 4 + index * 3, 10, 3, 1]]),
  ...Array.from({ length: 16 }, (_, index): Fill => [index % 2 ? coal : "r", 4 + index, 12]),
  ["k", 3, 13, 18, 4], ["K", 3, 13, 18, 1],
  ["k", 4, 17, 1, 7], ["k", 19, 17, 1, 7], ["k", 4, 20, 16, 1],
]));

export const JAPAN_PROPS = {
  kyotoTorii: {
    size: "building",
    palette: { o: "#1a0e0e", k: "#2a2226", K: "#3e3438", r: "#d8402e", R: "#a8301e", g: "#e8c25a" },
    frames: frames(TORII),
    fps: 1,
  },
  kyotoRamen: {
    size: "stall",
    palette: { o: "#1a1210", R: "#4a2e22", Q: "#3a2218", n: "#b83030", w: "#f2ece0", b: "#7a5030", B: "#a06a3a", k: "#2a2226", m: "#6a6e7a", s: "#8a8a8a", L: "#e84a3a", D: "#b83028", l: "#ffd07a", y: "#f2d06a" },
    frames: frames(ramenStall("l"), ramenStall("L")),
    fps: 1.5,
    effect: { kind: "smoke", x: 25, y: 11 },
    glow: { x: 4, y: 8, color: "255, 120, 90", radius: 10 },
  },
  kyotoManeki: {
    size: "small",
    palette: { o: "#2a2226", w: "#f7f4ee", k: "#1a1a1a", p: "#f0a0a8", r: "#d8402e", y: "#e8c25a" },
    frames: frames(manekiNeko(true), manekiNeko(false)),
    fps: 3,
  },
  kyotoVending: {
    size: "person",
    palette: { o: "#1a1a22", v: "#e8eef5", g: "#cfeaff", a: "#e84a4a", b: "#3a8ae8", c: "#f2c84a", d: "#4ac27a", k: "#2a2a34", y: "#ff6ad5", s: "#d8402e" },
    frames: frames(vendingMachine("y"), vendingMachine("k")),
    fps: 1.5,
    glow: { x: 6, y: 6, color: "180, 220, 255", radius: 12 },
  },
  kyotoShiba: {
    size: "small",
    palette: { o: "#2a1a10", f: "#d98a3a", F: "#b86a2a", w: "#f4ece0", k: "#1a1a1a" },
    frames: frames(shiba(false, "k"), shiba(true, "k"), shiba(false, "k"), shiba(true, "F")),
    fps: 2.5,
  },
  kyotoLantern: {
    size: "fixture",
    palette: { o: "#2a2e38", s: "#8a8f9c", S: "#6b707c", y: "#ffd97a", Y: "#ffb84a" },
    frames: frames(STONE_LANTERN, blinkRow(blinkRow(blinkRow(STONE_LANTERN, 7, "y", "Y"), 8, "y", "Y"), 9, "y", "Y")),
    fps: 1.3,
    glow: { x: 6, y: 8, color: "255, 200, 120", radius: 11 },
  },
  tokyoKonbini: {
    size: "building",
    palette: { o: "#14141c", b: "#3a3a48", m: "#6a6e7a", s: "#f2f4f7", G: "#3ac27a", O: "#f28a3a", B: "#3a8ae8", g: "#e8f4ff", k: "#9aa8b8", K: "#5a6272", p: "#f0c39a", P: "#3a8ae8", D: "#2a2a34", a: "#e84a4a", c: "#f2c84a", d: "#4ac27a" },
    frames: frames(KONBINI),
    fps: 1,
    glow: { x: 16, y: 25, color: "220, 240, 255", radius: 20 },
  },
  tokyoNeon: {
    size: "fixture",
    palette: { o: "#0a0a12", b: "#1a1626", k: "#3a3a44", n: "#ff6ad5", m: "#6ae8ff", x: "#4a2e4a" },
    frames: frames(neonSign("m", "n", "n", "n"), neonSign("m", "n", "n", "x"), neonSign("n", "m", "m", "m"), neonSign("x", "n", "m", "n")),
    fps: 1.6,
    glow: { x: 7, y: 10, color: "255, 106, 213", radius: 15 },
  },
  tokyoVending: {
    size: "person",
    palette: { o: "#1a1a22", v: "#e84a4a", g: "#ffe8e8", a: "#3a8ae8", b: "#f2c84a", c: "#4ac27a", d: "#f7f7f7", k: "#2a2a34", y: "#6ae8ff", s: "#f7f7f7" },
    frames: frames(vendingMachine("y"), vendingMachine("k")),
    fps: 1.2,
    glow: { x: 6, y: 6, color: "255, 170, 170", radius: 12 },
  },
  tokyoCat: {
    size: "small",
    palette: { o: "#1a1410", c: "#b8864a", C: "#9a6a38", t: "#d8c090", g: "#7a7a86", e: "#f2d04a", p: "#f0a0a8" },
    frames: frames(catInBox("e"), catInBox("e"), catInBox("g")),
    fps: 0.9,
  },
  tokyoTaxi: {
    size: "vehicle",
    palette: { o: "#0e0e14", b: "#2a3a5a", B: "#1e2a44", y: "#f2d04a", k: "#1a1a1e", g: "#9ad0f0", p: "#2a2a34", m: "#9a9aa6", h: "#fff2b0", r: "#e84a4a", s: "#9a9aa6" },
    frames: frames(taxi("r"), taxi("k")),
    fps: 1.5,
    glow: { x: 35, y: 10, color: "255, 240, 180", radius: 11 },
  },
  templeWaterfall: {
    size: "landmark",
    palette: { s: "#5a5a66", S: "#4a4a54", g: "#4a7a4a", v: "#6ab0e0", V: "#d8f0ff", W: "#ffffff" },
    frames: frames(waterfall(0), waterfall(1), waterfall(2)),
    fps: 6,
  },
  templeMonk: {
    size: "person",
    palette: { o: "#2a1a10", s: "#e8c09a", k: "#2a1a10", r: "#e8923a", R: "#c8702a", b: "#8a5a34", y: "#e8c25a" },
    frames: frames(monk(true), monk(false)),
    fps: 1.6,
  },
  templeBell: {
    size: "stall",
    palette: { o: "#1a1210", R: "#3a2a2a", b: "#8a3a2a", k: "#2a2226", m: "#b8863a", M: "#8a6228", l: "#a0784a", L: "#7a5a34", s: "#8a8a80", S: "#6a6a62" },
    frames: frames(templeBell(true), templeBell(false), templeBell(true), templeBell(true)),
    fps: 1.2,
    effect: { kind: "notes", x: 15, y: 9 },
  },
  crane: {
    size: "sky",
    palette: { w: "#f7f7f2", k: "#1a1a1a", r: "#e84a3a" },
    frames: frames(crane(true), crane(false)),
    fps: 2.5,
  },
  marketNoodles: {
    size: "stall",
    palette: { o: "#1a1210", R: "#4a2e22", Q: "#3a2218", n: "#e8b83a", w: "#f2ece0", b: "#7a5030", B: "#a06a3a", k: "#2a2226", m: "#6a6e7a", s: "#8a8a8a", L: "#e84a3a", D: "#b83028", l: "#ffd07a", y: "#f2d06a" },
    frames: frames(ramenStall("l"), ramenStall("L")),
    fps: 1.5,
    effect: { kind: "smoke", x: 25, y: 11 },
    glow: { x: 4, y: 8, color: "255, 120, 90", radius: 10 },
  },
  marketSteamer: {
    size: "stall",
    palette: { o: "#1a1210", R: "#4a2e22", b: "#c8a060", B: "#9a7a40", t: "#6a4428", k: "#2a2226", L: "#e84a3a", l: "#ffd07a", w: "#f7f2ea", W: "#e8d8c0", n: "#b83030", N: "#8a2222" },
    frames: frames(steamerStall("l"), steamerStall("L")),
    fps: 1.3,
    effect: { kind: "smoke", x: 9, y: 5 },
    glow: { x: 20, y: 6, color: "255, 120, 90", radius: 9 },
  },
  marketLanterns: {
    size: "stall",
    palette: { o: "#1a1210", R: "#4a2e22", b: "#7a5030", k: "#2a2226", K: "#a8302a", a: "#e84a3a", c: "#f28a3a", d: "#e86aa0", y: "#ffe08a", Y: "#ffb84a", t: "#6a4428", T: "#8a5a34" },
    frames: frames(lanternStall("y"), lanternStall("Y")),
    fps: 1.4,
    glow: { x: 13, y: 10, color: "255, 170, 120", radius: 14 },
  },
  marketGrill: {
    size: "stall",
    palette: { o: "#1a1210", R: "#4a2e22", b: "#c8a060", k: "#2a2226", K: "#4a3e44", r: "#e84a2a", y: "#ffb84a", m: "#8a3a2a", M: "#5a2418" },
    frames: frames(grill("y"), grill("r")),
    fps: 3,
    effect: { kind: "smoke", x: 11, y: 5 },
    glow: { x: 11, y: 12, color: "255, 120, 60", radius: 10 },
  },
} satisfies Record<string, SceneProp>;
