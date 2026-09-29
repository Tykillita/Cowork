/** Characters that walk along the path; each one is a separate item of the collection. */

import type { SpriteLayer } from "./pixelArt";
import { blinkRow, closeEyes, compose, replaceRow, withLegs } from "./pixelArt";
import type { PixelCharacter } from "./types";

// ─── Farolero ───────────────────────────────────────────────────────────────

export const LANTERN_BEARER_BODY = [
  "....oooo....",
  "...ohhhho...",
  "..ohhhhhho..",
  ".oHHHHHHHHo.",
  "..osssseso..",
  "..osssssso..",
  ".bokkkkkko..",
  "obbccccccoL.",
  "obbcCccccoll",
  "oBbcCccccoL.",
  ".oocccccco..",
];
export const STANDING_LEGS = ["..oppppppo..", "..oppooppo..", "..opo..opo..", ".offo..offo."];
export const STRIDE_A = ["..oppppppo..", ".oppo..oppo.", ".opo....opo.", "offo....offo"];
export const PASSING = ["..oppppppo..", "...opppo....", "...oppo.....", "...offfo...."];
export const STRIDE_B = ["..oppppppo..", "..opo.oppo..", "..opo..opo..", ".offo...offo"];

// ─── Gato explorador ────────────────────────────────────────────────────────

export const CAT_BODY = [
  "........o...o.",
  "........ofoofo",
  ".......offfffo",
  ".......ofefefo",
  ".......ofwnwfo",
  "o.oooookkkkkko",
  "ofbbffffffFFo.",
  ".obbffwwwwffo.",
];
export const CAT_STAND = ["..ofo....ofo..", "..owo....owo.."];
export const CAT_STRIDE_A = [".ofo.....ofo..", "owo.......owo."];
export const CAT_STRIDE_B = ["...ofo..ofo...", "...owo..owo..."];
export const CAT_TAIL_DOWN = CAT_BODY.map((line, index) => index === 5 ? `.${line.slice(1)}` : index === 6 ? `o${line.slice(1)}` : line);

// ─── Robot jardinero ────────────────────────────────────────────────────────

export const ROBOT_BODY = [
  ".....a......",
  ".....o......",
  "...oooooo...",
  "..ommmmmmo..",
  "..ovvvvvvo..",
  "..ommmmmmo..",
  "...oooooo...",
  ".oMmmmmmMo..",
  ".oMmgmmmMocc",
  ".oMmmmmmMoc.",
  ".oMMMMMMMo..",
  "..otttttto..",
];
export const ROBOT_WHEELS_A = ["..otot.otot.", "...oo...oo.."];
export const ROBOT_WHEELS_B = ["..toto.toto.", "...oo...oo.."];
export const ROBOT_WATERING = ROBOT_BODY.map((line, index) => index === 9 ? ".oMmmmmmMocw" : line);

export const MILESTONE_CHARACTERS: PixelCharacter[] = [
  {
    id: "farolero",
    name: "Farolero",
    description: "Recorre el camino con su farol. Disponible desde el inicio.",
    unlockDays: 0,
    palette: {
      o: "#141826", h: "#d8a657", H: "#a8753a", s: "#f0c39a", e: "#141826", z: "#b98962", k: "#8de7bd",
      c: "#4d86a8", C: "#35607d", b: "#8c5e3c", B: "#6b4429", p: "#3a3f5c", f: "#241f2e", l: "#ffe08a", L: "#8a6a3a",
    },
    idle: [
      withLegs(LANTERN_BEARER_BODY, STANDING_LEGS),
      withLegs(LANTERN_BEARER_BODY, STANDING_LEGS),
      withLegs(LANTERN_BEARER_BODY, STANDING_LEGS),
      withLegs(blinkRow(LANTERN_BEARER_BODY, 4, "e", "z"), STANDING_LEGS),
    ],
    walk: [
      withLegs(LANTERN_BEARER_BODY, STRIDE_A),
      withLegs(LANTERN_BEARER_BODY, PASSING, -1),
      withLegs(LANTERN_BEARER_BODY, STRIDE_B),
      withLegs(LANTERN_BEARER_BODY, PASSING, -1),
    ],
    fps: { idle: 2.5, walk: 7 },
    speed: 11,
    light: { x: 11, y: 8, color: "255, 214, 128", radius: 15 },
  },
  {
    id: "gato-explorador",
    name: "Gato explorador",
    description: "Curioso y ligero, con mochila y bufanda. Sus ojos brillan en la oscuridad.",
    unlockDays: 3,
    palette: {
      o: "#1b1a24", f: "#e39a4f", F: "#b8733a", w: "#f3e6d3", e: "#8de7bd", n: "#e87a8a", k: "#8de7bd", b: "#6d5a8c",
    },
    idle: [
      withLegs(CAT_BODY, CAT_STAND),
      withLegs(CAT_TAIL_DOWN, CAT_STAND),
      withLegs(CAT_BODY, CAT_STAND),
      withLegs(blinkRow(CAT_BODY, 3, "e", "f"), CAT_STAND),
    ],
    walk: [
      withLegs(CAT_BODY, CAT_STRIDE_A),
      withLegs(CAT_TAIL_DOWN, CAT_STRIDE_B, -1),
      withLegs(CAT_BODY, CAT_STRIDE_A),
      withLegs(CAT_TAIL_DOWN, CAT_STRIDE_B, -1),
    ],
    fps: { idle: 2, walk: 9 },
    speed: 15,
    light: { x: 10, y: 3, color: "141, 231, 189", radius: 5 },
  },
  {
    id: "robot-jardinero",
    name: "Robot jardinero",
    description: "Rueda despacio regando brotes con su regadera.",
    unlockDays: 14,
    palette: {
      o: "#1a1d26", m: "#9fb3c8", M: "#6f8399", v: "#8de7bd", a: "#ff7c87", g: "#6fcf7f", c: "#d8a657", t: "#3a3f4f", w: "#7fc8ff",
    },
    idle: [
      withLegs(ROBOT_BODY, ROBOT_WHEELS_A),
      withLegs(ROBOT_WATERING, ROBOT_WHEELS_A),
      withLegs(ROBOT_BODY, ROBOT_WHEELS_A),
      withLegs(blinkRow(ROBOT_BODY, 4, "v", "m"), ROBOT_WHEELS_A),
    ],
    walk: [
      withLegs(ROBOT_BODY, ROBOT_WHEELS_A),
      withLegs(ROBOT_BODY, ROBOT_WHEELS_B),
    ],
    fps: { idle: 1.6, walk: 6 },
    speed: 8,
    light: { x: 5, y: 4, color: "141, 231, 189", radius: 9 },
  },
];

// ─── Espíritu del bosque (tienda) ───────────────────────────────────────────

export const SPIRIT_BODY = [
  ".....l......",
  "....lLl.....",
  ".....l......",
  "...oooooo...",
  "..oggwgggo..",
  ".oggwggggGo.",
  ".ogegggegGo.",
  ".oggggggggo.",
  ".oGggggggGo.",
  "..oGGGGGGo..",
  "...oooooo...",
];
export const SPIRIT_SWAY = SPIRIT_BODY.map((line, index) => index === 1 ? ".....lLl...." : line);

// ─── Capibara (tienda) ──────────────────────────────────────────────────────
// Big square head with a blunt muzzle, the eye high up with a glint, small
// round ears, a highlight along the back and short dark legs.

export const CAPYBARA_PALETTE = {
  o: "#2e1a0e", b: "#9c6538", h: "#b8804b", B: "#7a4a26", l: "#c4935e", m: "#6b4225",
  n: "#1a0d06", e: "#0e0704", w: "#f5ead8", r: "#5a351c", f: "#3a2212", c: "#4a2c16",
};

export const CAPYBARA_BODY = [
  ".............oo.......",
  "......ooooooooroooo...",
  "....oohhhhhhhhbbbbbo..",
  "...ohhhhhhhhhbbbbwebo.",
  "..obbbbbbbbbbbbbbbbbmo",
  ".obbbbBbbbbbbbbbbbbmmn",
  ".obbbbbbbbbBbbBbbbmmmo",
  ".oBbbbbbbbbbbbBbbBmmo.",
  ".oBBbbbbbbbbbbbbBBoo..",
  "..oBBBllllllllBBBo....",
  "...ooooooooooooooo....",
];
export const CAPYBARA_STAND = ["....oBBo....oBBo......", "....offo....offo......"];
export const CAPYBARA_STRIDE_A = ["...oBBo......oBBo.....", "..offo........offo...."];
export const CAPYBARA_STRIDE_B = [".....oBBo..oBBo.......", ".....offo..offo......."];
export const CAPYBARA_EAR_FLICK = replaceRow(CAPYBARA_BODY, 0, "..............o.......");
export const CAPYBARA_SLEEP = closeEyes(CAPYBARA_BODY, 3);

export const CAPYBARA_BABY = [
  "......or...",
  "..oooooooo.",
  ".ohhhhbbweo",
  ".obbbbbbbmn",
  ".oBbbbbbmmo",
  "..oBllllBo.",
  "...oooooo..",
];

// ─── Zorro viajero ──────────────────────────────────────────────────────────

export const FOX_PALETTE = { o: "#2a160c", f: "#e0772f", F: "#b5551f", w: "#f4ebe0", e: "#140a05", n: "#140a05", k: "#2a1a14", s: "#4fae9a" };
export const FOX_BODY = [
  "...........o..o...",
  "..........ofooFo..",
  "..........offffo..",
  ".oo.......ofeffffo",
  "owwo......offfwwwn",
  "owffo.oooooffwwwo.",
  ".offfoffffffsssso.",
  "..offffffffffwwo..",
  "...oFFFFFFFFFwo...",
  "....ooooooooooo...",
];
export const FOX_TAIL_UP = replaceRow(replaceRow(replaceRow(FOX_BODY, 3, "owwo......ofeffffo"), 4, "owffo.....offfwwwn"), 5, ".offo.oooooffwwwo.");
export const FOX_STAND = [".....ok.....ok....", ".....kk.....kk...."];
export const FOX_STRIDE_A = ["....ok.......ok...", "...kk.........kk.."];
export const FOX_STRIDE_B = ["......ok...ok.....", "......kk...kk....."];

// ─── Pingüino ───────────────────────────────────────────────────────────────

export const PENGUIN_PALETTE = {
  o: "#10131c", k: "#1f2533", K: "#2e3648", w: "#f2f4f7", W: "#cfd6e2", y: "#f2a93b", Y: "#f7d56b",
  e: "#10131c", c: "#1f2533", g: "#9aa3b2", G: "#7d8697",
};
export const PENGUIN_BODY = [
  "....oooo....",
  "...okkkkoo..",
  "..okkkkwekyy",
  "..okkkkkkoy.",
  "..okkYwwwo..",
  ".okkkwwwwwo.",
  "okkkkwwwwwo.",
  "okKkkwwwwwo.",
  ".okKkwwwwWo.",
  "..okkwwwWo..",
  "...oooooo...",
];
export const PENGUIN_FEET = ["...yy..yy..."];
export const PENGUIN_STEP_A = ["..yy.....yy."];
export const PENGUIN_STEP_B = ["....yy.yy..."];
export const PENGUIN_STANDING = [...PENGUIN_BODY, ...PENGUIN_FEET];

// ─── Conejo saltarín ────────────────────────────────────────────────────────

export const RABBIT_PALETTE = { o: "#3a3036", w: "#ece5db", W: "#cbbfb2", p: "#e8a0a8", e: "#1a1216", n: "#e87a8a", c: "#8a7f76" };
export const RABBIT_BODY = [
  "........oo.oo.",
  "........op.po.",
  "........op.po.",
  "........owowo.",
  ".......owwwwwo",
  ".......owewwwn",
  "..ooo..owwwwo.",
  ".owwwoowwwwwo.",
  "owwwwwwwwwwWo.",
  ".oWwwwwwwwWo..",
  "..ooooooooo...",
];
export const RABBIT_EARS_BACK = replaceRow(replaceRow(replaceRow(RABBIT_BODY, 0, "......oo.oo..."), 1, ".......op.po.."), 2, "........op.po.");
export const RABBIT_BLINK = blinkRow(RABBIT_BODY, 5, "e", "c");
export const RABBIT_SIT = ["..owwwo.owo...", "..ooooo.ooo..."];
export const RABBIT_HOP = ["...owo...owo..", "...ooo...ooo.."];
export const RABBIT_SITTING = [...RABBIT_BODY, ...RABBIT_SIT];

// ─── Fantasmita ─────────────────────────────────────────────────────────────

export const GHOST_PALETTE = { o: "#5a5a7a", w: "#f4f4ff", W: "#c9c9e8", e: "#2a2a44", p: "#f5a8c0", c: "#8a8aa8" };
export const GHOST_BODY = [
  "...oooooo...",
  "..owwwwwwo..",
  ".owwwwwwwwo.",
  ".owwwewwewo.",
  ".owwpwwwpwo.",
  ".owwwwwowwo.",
  ".owwwwwwwwo.",
  ".oWwwwwwwWo.",
  ".oWWwwwwWWo.",
];
export const GHOST_WAVE_A = ["oWo.oWo.oWo."];
export const GHOST_WAVE_B = [".oWo.oWo.oWo"];
export const GHOST_BLINK = blinkRow(GHOST_BODY, 3, "e", "c");

// ─── Seta andante ───────────────────────────────────────────────────────────

export const MUSHROOM_PALETTE = {
  o: "#3a1a1a", r: "#d9433f", R: "#a82f2f", w: "#f7efe0", s: "#efe2c8", S: "#cdb998",
  e: "#2a1410", p: "#f09a9a", f: "#8a5a3a", c: "#b89a7a",
};
export const MUSHROOM_BODY = [
  "....oooooo....",
  "..oorrwrrroo..",
  ".orrrrrrwwrro.",
  "orwwrrrrrrrrro",
  "oRRRRRwRRRRRRo",
  ".oooooooooooo.",
  "...osssssso...",
  "...ossesseo...",
  "...ospssspo...",
  "...oSssssSo...",
  "....oooooo....",
];
export const MUSHROOM_FEET = ["....ff..ff...."];
export const MUSHROOM_STRIDE_A = ["...ff....ff..."];
export const MUSHROOM_STRIDE_B = [".....ffff....."];
export const MUSHROOM_BLINK = blinkRow(MUSHROOM_BODY, 7, "e", "c");

// ─── Dragoncito ─────────────────────────────────────────────────────────────

export const DRAGON_PALETTE = {
  o: "#1c1a2e", d: "#7c5cd6", D: "#5a3fb0", b: "#f2c46b", w: "#b59bf0", W: "#8c6fe0",
  e: "#1c1a2e", n: "#1c1a2e", h: "#f7efe0", f: "#ff9a3c", F: "#ffe07a", c: "#5a3fb0",
};
export const DRAGON_BODY = [
  "............h.h...",
  "...........odddo..",
  "...........odeddo.",
  "..........oddddddn",
  "...........oddbbo.",
  "......oooooddbbo..",
  ".o...odddddddbbo..",
  "odo.oddddddddbbo..",
  ".oddddDDddddbbbo..",
  "..ooDDDDDDDbbbo...",
  "....oooooooooo....",
];
export const DRAGON_STAND = [".....DD....DD.....", ".....oo....oo....."];
export const DRAGON_STRIDE_A = ["....DD......DD....", "...oo........oo..."];
export const DRAGON_STRIDE_B = ["......DD..DD......", "......oo..oo......"];
export const DRAGON_WING_UP: SpriteLayer = { rows: ["oo...", "owWo.", "owwWo", ".owwo", "..oo."], x: 5, y: 2 };
export const DRAGON_WING_DOWN: SpriteLayer = { rows: [".ooo.", "owwWo", "owWo.", "oo..."], x: 5, y: 5 };
export const DRAGON_FLAME: SpriteLayer = { rows: [".F.", "fFf", ".f."], x: 18, y: 2 };
export const DRAGON_BLINK = blinkRow(DRAGON_BODY, 2, "e", "c");
export const dragonFrame = (body: string[], legs: string[], wing: SpriteLayer, extra: SpriteLayer[] = []) =>
  compose(21, body.length + legs.length, [{ rows: [...body, ...legs] }, wing, ...extra]);

export const variantCharacter = (baseId: string, patch: Partial<PixelCharacter> & Pick<PixelCharacter, "id" | "name" | "description">): PixelCharacter => {
  const base = MILESTONE_CHARACTERS.find((character) => character.id === baseId)!;
  return { ...base, unlockDays: null, rarity: "comun", variantOf: baseId, ...patch, palette: { ...base.palette, ...patch.palette } };
};

export const CHARACTERS: PixelCharacter[] = [
  ...MILESTONE_CHARACTERS,
  variantCharacter("farolero", {
    id: "farolero-invernal",
    name: "Farolero invernal",
    description: "El farolero con abrigo rojo, gorro de lana y bufanda blanca.",
    palette: { h: "#e8eef5", H: "#b9c6d6", k: "#f3f0e6", c: "#b8434e", C: "#8a2f3a", b: "#5a6b7d", B: "#43505f" },
  }),
  variantCharacter("gato-explorador", {
    id: "gato-medianoche",
    name: "Gato de medianoche",
    description: "Un gato negro con bufanda dorada y ojos de ámbar.",
    palette: { o: "#0d0c14", f: "#2c2a3a", F: "#1f1d2b", w: "#4a4760", e: "#ffd166", n: "#b56576", k: "#ffd166", b: "#8c5e3c" },
    light: { x: 10, y: 3, color: "255, 209, 102", radius: 5 },
  }),
  {
    id: "espiritu-bosque",
    name: "Espíritu del bosque",
    description: "Flota sobre el camino con un brote en la cabeza y brilla suavemente.",
    unlockDays: null,
    rarity: "epica",
    palette: { o: "#12261d", g: "#8de7bd", G: "#4fae86", w: "#e6fff3", e: "#12261d", l: "#6fcf7f", L: "#b6f29a" },
    idle: [
      { rows: SPIRIT_BODY },
      { rows: SPIRIT_SWAY, bob: -1 },
      { rows: SPIRIT_BODY },
      { rows: blinkRow(SPIRIT_BODY, 6, "e", "g"), bob: -1 },
    ],
    walk: [
      { rows: SPIRIT_BODY },
      { rows: SPIRIT_SWAY, bob: -1 },
      { rows: SPIRIT_BODY, bob: -2 },
      { rows: SPIRIT_SWAY, bob: -1 },
    ],
    fps: { idle: 2, walk: 6 },
    speed: 9,
    light: { x: 6, y: 6, color: "141, 231, 189", radius: 12 },
  },
  {
    id: "capibara",
    name: "Capibara",
    description: "Tranquilo y sin prisa, recorre el camino saludando a todo el mundo.",
    unlockDays: null,
    rarity: "epica",
    palette: CAPYBARA_PALETTE,
    idle: [
      withLegs(CAPYBARA_BODY, CAPYBARA_STAND),
      withLegs(CAPYBARA_BODY, CAPYBARA_STAND),
      withLegs(CAPYBARA_EAR_FLICK, CAPYBARA_STAND),
      withLegs(CAPYBARA_SLEEP, CAPYBARA_STAND),
    ],
    walk: [
      withLegs(CAPYBARA_BODY, CAPYBARA_STRIDE_A),
      withLegs(CAPYBARA_BODY, CAPYBARA_STAND, -1),
      withLegs(CAPYBARA_BODY, CAPYBARA_STRIDE_B),
      withLegs(CAPYBARA_BODY, CAPYBARA_STAND, -1),
    ],
    fps: { idle: 1.8, walk: 6 },
    speed: 7,
  },
  {
    id: "zorro",
    name: "Zorro viajero",
    description: "Un zorro curioso con bufanda que recorre el camino moviendo la cola.",
    unlockDays: null,
    rarity: "rara",
    palette: FOX_PALETTE,
    idle: [
      withLegs(FOX_BODY, FOX_STAND),
      withLegs(FOX_TAIL_UP, FOX_STAND),
      withLegs(FOX_BODY, FOX_STAND),
      withLegs(blinkRow(FOX_BODY, 3, "e", "f"), FOX_STAND),
    ],
    walk: [
      withLegs(FOX_BODY, FOX_STRIDE_A),
      withLegs(FOX_TAIL_UP, FOX_STAND, -1),
      withLegs(FOX_BODY, FOX_STRIDE_B),
      withLegs(FOX_TAIL_UP, FOX_STAND, -1),
    ],
    fps: { idle: 2, walk: 8 },
    speed: 14,
  },
  {
    id: "pinguino",
    name: "Pingüino",
    description: "Camina a pasitos cortos y se balancea a cada paso.",
    unlockDays: null,
    rarity: "rara",
    palette: PENGUIN_PALETTE,
    idle: [
      withLegs(PENGUIN_BODY, PENGUIN_FEET),
      withLegs(PENGUIN_BODY, PENGUIN_FEET),
      withLegs(closeEyes(PENGUIN_BODY, 2), PENGUIN_FEET),
    ],
    walk: [
      withLegs(PENGUIN_BODY, PENGUIN_STEP_A),
      withLegs(PENGUIN_BODY, PENGUIN_FEET, -1),
      withLegs(PENGUIN_BODY, PENGUIN_STEP_B),
      withLegs(PENGUIN_BODY, PENGUIN_FEET, -1),
    ],
    fps: { idle: 2, walk: 6 },
    speed: 6,
  },
  {
    id: "conejo",
    name: "Conejo saltarín",
    description: "Avanza a saltitos y mueve las orejas cuando se detiene.",
    unlockDays: null,
    rarity: "comun",
    palette: RABBIT_PALETTE,
    idle: [
      withLegs(RABBIT_BODY, RABBIT_SIT),
      withLegs(RABBIT_EARS_BACK, RABBIT_SIT),
      withLegs(RABBIT_BODY, RABBIT_SIT),
      withLegs(RABBIT_BLINK, RABBIT_SIT),
    ],
    walk: [
      withLegs(RABBIT_BODY, RABBIT_SIT),
      withLegs(RABBIT_BODY, RABBIT_HOP, -2),
      withLegs(RABBIT_EARS_BACK, RABBIT_HOP, -3),
      withLegs(RABBIT_BODY, RABBIT_HOP, -1),
    ],
    fps: { idle: 2, walk: 8 },
    speed: 13,
  },
  {
    id: "fantasmita",
    name: "Fantasmita",
    description: "Un fantasma tímido y sonrojado que flota sin tocar el suelo.",
    unlockDays: null,
    rarity: "comun",
    palette: GHOST_PALETTE,
    idle: [
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -3 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_B], bob: -4 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -5 },
      { rows: [...GHOST_BLINK, ...GHOST_WAVE_B], bob: -4 },
    ],
    walk: [
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -3 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_B], bob: -4 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_A], bob: -5 },
      { rows: [...GHOST_BODY, ...GHOST_WAVE_B], bob: -4 },
    ],
    fps: { idle: 3, walk: 5 },
    speed: 9,
    light: { x: 6, y: 5, color: "220, 220, 255", radius: 8 },
  },
  {
    id: "seta-andante",
    name: "Seta andante",
    description: "Una seta con piernitas y mejillas sonrosadas que pasea por el bosque.",
    unlockDays: null,
    rarity: "rara",
    palette: MUSHROOM_PALETTE,
    idle: [
      withLegs(MUSHROOM_BODY, MUSHROOM_FEET),
      withLegs(MUSHROOM_BODY, MUSHROOM_FEET),
      withLegs(MUSHROOM_BLINK, MUSHROOM_FEET),
    ],
    walk: [
      withLegs(MUSHROOM_BODY, MUSHROOM_STRIDE_A),
      withLegs(MUSHROOM_BODY, MUSHROOM_FEET, -1),
      withLegs(MUSHROOM_BODY, MUSHROOM_STRIDE_B),
      withLegs(MUSHROOM_BODY, MUSHROOM_FEET, -1),
    ],
    fps: { idle: 2, walk: 7 },
    speed: 8,
  },
  {
    id: "dragoncito",
    name: "Dragoncito",
    description: "Un dragón bebé que agita las alas al caminar y a veces suelta una chispa.",
    unlockDays: null,
    rarity: "epica",
    palette: DRAGON_PALETTE,
    idle: [
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_DOWN) },
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_UP) },
      { rows: dragonFrame(DRAGON_BLINK, DRAGON_STAND, DRAGON_WING_DOWN) },
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_DOWN, [DRAGON_FLAME]) },
    ],
    walk: [
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STRIDE_A, DRAGON_WING_UP) },
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_DOWN), bob: -1 },
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STRIDE_B, DRAGON_WING_UP) },
      { rows: dragonFrame(DRAGON_BODY, DRAGON_STAND, DRAGON_WING_DOWN), bob: -1 },
    ],
    fps: { idle: 1.6, walk: 7 },
    speed: 10,
  },
];
