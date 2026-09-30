import { PENGUIN_PALETTE, PENGUIN_STANDING, RABBIT_BLINK, RABBIT_BODY, RABBIT_EARS_BACK, RABBIT_HOP, RABBIT_PALETTE, RABBIT_SIT, RABBIT_SITTING } from "../characters";
import { blinkRow, closeEyes, compose, mirror } from "../pixelArt";
import { frames } from "./shared";
import type { SceneProp } from "../types";

// Glaciar
export const PENGUIN_CHICK = [
  "..oooo..",
  ".okkkko.",
  ".okwwwey",
  ".okwwwo.",
  ".oggggo.",
  "oggGgggo",
  "oggggggo",
  ".oggggo.",
  "..oooo..",
  "..y..y..",
];
export const PENGUIN_SLIDE = [
  "...oooooo.....",
  ".ookkkkkkooo..",
  "okkkkkkkkkweyy",
  "okwwwwwwwwkko.",
  ".oooooooooooo.",
];
export const FISH_A = [".ss.s", "ssSss", ".ss.s"];
export const FISH_B = [".ss..", "ssSss", ".ss.s"];
export const ICE_FLOE = ["..IIIIIIIIIIIIII..", ".iiiiiiiiiiiiiiii.", "..vvVvvvvvvvvvVvv.."];
export const pairFrame = (adult: string[], chick: string[], chickY = 2) => compose(20, 12, [{ rows: adult }, { rows: chick, x: 12, y: chickY }]);
export const slideFrame = (x: number, facingLeft = false) => compose(24, 5, [{ rows: facingLeft ? mirror(PENGUIN_SLIDE) : PENGUIN_SLIDE, x }]);

// Pradera
export const BUNNY = [
  ".....o.o",
  "....owow",
  "...owwwo",
  "...owewn",
  ".oowwwo.",
  "owwwwwo.",
  ".ooooo..",
];
export const CARROT_A = ["g..", "gaa", ".aa", "..a"];
export const CARROT_B = ["g..", "ga.", ".a."];
export const BURROW_BACK = ["...hhhhhhhhhh...", ".hhhhhhhhhhhhhh."];
export const BURROW_FRONT = [".mmmmmmmmmmmmmm.", "mmMmmmmmmmmmMmmm"];
export const burrowFrame = (head: string[], y: number) => compose(16, 11, [{ rows: BURROW_BACK, y: 7 }, { rows: head.slice(0, 6), x: -3, y }, { rows: BURROW_FRONT, y: 9 }]);


export const WILDLIFE_PROPS = {
  penguinPair: {
    size: "medium",
    palette: PENGUIN_PALETTE,
    frames: frames(
      pairFrame(PENGUIN_STANDING, PENGUIN_CHICK),
      pairFrame(PENGUIN_STANDING, PENGUIN_CHICK, 1),
      pairFrame(closeEyes(PENGUIN_STANDING, 2), PENGUIN_CHICK),
      pairFrame(PENGUIN_STANDING, blinkRow(PENGUIN_CHICK, 2, "e", "w")),
    ),
    fps: 1.6,
  },
  penguinSlide: {
    size: "small",
    palette: PENGUIN_PALETTE,
    frames: frames(...[0, 2, 4, 6, 8, 10].map((x) => slideFrame(x)), ...[10, 8, 6, 4, 2, 0].map((x) => slideFrame(x, true))),
    fps: 4,
  },
  penguinFisher: {
    size: "medium",
    palette: { ...PENGUIN_PALETTE, s: "#b8c8d8", S: "#7f93a8" },
    frames: frames(
      compose(17, 12, [{ rows: PENGUIN_STANDING }, { rows: FISH_A, x: 11, y: 1 }]),
      compose(17, 12, [{ rows: PENGUIN_STANDING }, { rows: FISH_B, x: 11, y: 1 }]),
      compose(17, 12, [{ rows: closeEyes(PENGUIN_STANDING, 2) }, { rows: FISH_A, x: 11, y: 1 }]),
    ),
    fps: 2.5,
  },
  penguinFloe: {
    size: "medium",
    palette: { ...PENGUIN_PALETTE, I: "#f4f8fc", i: "#bcd3e6", v: "#2f5f8a", V: "#bfe3ff" },
    frames: [
      { rows: compose(18, 15, [{ rows: PENGUIN_STANDING, x: 3 }, { rows: ICE_FLOE, y: 12 }]) },
      { rows: compose(18, 15, [{ rows: PENGUIN_STANDING, x: 3 }, { rows: ICE_FLOE, y: 12 }]), bob: 1 },
      { rows: compose(18, 15, [{ rows: closeEyes(PENGUIN_STANDING, 2), x: 3 }, { rows: ICE_FLOE, y: 12 }]), bob: 1 },
      { rows: compose(18, 15, [{ rows: PENGUIN_STANDING, x: 3 }, { rows: ICE_FLOE, y: 12 }]) },
    ],
    fps: 1.2,
  },
  rabbitCarrot: {
    size: "medium",
    palette: { ...RABBIT_PALETTE, a: "#f08a2c", g: "#5aa05a" },
    frames: frames(
      compose(17, 13, [{ rows: RABBIT_SITTING }, { rows: CARROT_A, x: 13, y: 4 }]),
      compose(17, 13, [{ rows: RABBIT_SITTING }, { rows: CARROT_B, x: 13, y: 4 }]),
      compose(17, 13, [{ rows: [...RABBIT_BLINK, ...RABBIT_SIT] }, { rows: CARROT_A, x: 13, y: 4 }]),
    ),
    fps: 3,
  },
  rabbitBurrow: {
    size: "medium",
    palette: { ...RABBIT_PALETTE, h: "#2e2218", m: "#9a7a4e", M: "#7a5e3a" },
    frames: frames(burrowFrame(RABBIT_BODY, 3), burrowFrame(RABBIT_BLINK, 3), burrowFrame(RABBIT_EARS_BACK, 3), burrowFrame(RABBIT_BODY, 5), burrowFrame(RABBIT_BODY, 8), burrowFrame(RABBIT_BODY, 5)),
    fps: 1.5,
  },
  rabbitHopper: {
    size: "medium",
    palette: RABBIT_PALETTE,
    frames: [
      { rows: RABBIT_SITTING },
      { rows: RABBIT_SITTING },
      { rows: [...RABBIT_BODY, ...RABBIT_HOP], bob: -3 },
      { rows: [...RABBIT_EARS_BACK, ...RABBIT_HOP], bob: -5 },
      { rows: [...RABBIT_EARS_BACK, ...RABBIT_HOP], bob: -3 },
      { rows: RABBIT_SITTING },
    ],
    fps: 4,
  },
  rabbitFamily: {
    size: "medium",
    palette: RABBIT_PALETTE,
    frames: frames(
      compose(22, 13, [{ rows: RABBIT_SITTING }, { rows: BUNNY, x: 14, y: 6 }]),
      compose(22, 13, [{ rows: RABBIT_SITTING }, { rows: BUNNY, x: 14, y: 4 }]),
      compose(22, 13, [{ rows: [...RABBIT_EARS_BACK, ...RABBIT_SIT] }, { rows: blinkRow(BUNNY, 3, "e", "w"), x: 14, y: 6 }]),
      compose(22, 13, [{ rows: [...RABBIT_BLINK, ...RABBIT_SIT] }, { rows: BUNNY, x: 14, y: 6 }]),
    ),
    fps: 1.6,
  },
} satisfies Record<string, SceneProp>;
