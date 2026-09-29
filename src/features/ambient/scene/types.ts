/** Data shapes shared by the scene catalog and the pixel engine. */

import type { PropSize } from "./scale";

export type Rarity = "comun" | "rara" | "epica";

/** How an item is obtained; shared by characters and landscapes. */
export interface Obtainable {
  id: string;
  name: string;
  description: string;
  /** Active days needed for milestone items; null for shop items. */
  unlockDays: number | null;
  /** Shop items only. */
  rarity?: Rarity;
  /** Cosmetic variant of another item (same shapes, other colours). */
  variantOf?: string;
}

export interface SpriteFrame {
  /** Rows of palette keys; `.` is transparent. */
  rows: string[];
  /** Vertical offset in scene pixels, used for the walking bob. */
  bob?: number;
}

export interface PixelCharacter extends Obtainable {
  palette: Record<string, string>;
  idle: SpriteFrame[];
  walk: SpriteFrame[];
  /** Frames per second for each animation. */
  fps: { idle: number; walk: number };
  /** Scene pixels per second while walking. */
  speed: number;
  /** Optional light source relative to the sprite's top-left corner (facing right). */
  light?: { x: number; y: number; color: string; radius: number };
}

export interface RidgeLayer {
  kind: "ridge";
  color: string;
  /** Distance from the ground line to the ridge's average height, in scene pixels. */
  height: number;
  amplitude: number;
  /** Horizontal period of the main wave, in scene pixels. */
  period: number;
  seed: number;
}

export interface TreeLayer {
  kind: "trees";
  color: string;
  height: number;
  spacing: number;
  seed: number;
}

/** Small glowing plants standing on the ground line. */
export interface SproutLayer {
  kind: "sprouts";
  stem: string;
  bloom: string;
  spacing: number;
  seed: number;
  /** Soft mint halo around each bloom; off for wheat or daylight flowers. */
  glow?: boolean;
}

/** Giant mushrooms: a stem and a spotted, rounded cap. */
export interface MushroomLayer {
  kind: "mushrooms";
  cap: string;
  spot: string;
  stem: string;
  height: number;
  spacing: number;
  seed: number;
}

/** Palm trees with a slightly bent trunk and drooping fronds. */
export interface PalmLayer {
  kind: "palms";
  trunk: string;
  leaves: string;
  height: number;
  spacing: number;
  seed: number;
}

/** Silhouettes of a village, a city skyline or a Japanese street, with lit windows. */
export interface BuildingLayer {
  kind: "buildings";
  style: "cottage" | "tower" | "machiya" | "pagoda";
  wall: string;
  roof: string;
  window: string;
  /** Share of windows that are lit (0–1). */
  lit: number;
  /** Red lanterns on Japanese houses, beacon lights on towers. */
  accent?: string;
  height: number;
  spacing: number;
  seed: number;
}

export interface FenceLayer {
  kind: "fence";
  color: string;
  spacing: number;
  height: number;
}

/** Puffy clouds in the sky. `top` and `spread` are scene rows from the top. */
export interface CloudLayer {
  kind: "clouds";
  color: string;
  shade: string;
  top: number;
  spread: number;
  size: number;
  spacing: number;
  seed: number;
}

/** A string of little lights hanging across the scene, `height` rows above the ground. */
export interface GarlandLayer {
  kind: "garland";
  cord: string;
  lights: string[];
  height: number;
  span: number;
  sag: number;
}

/** Tall round-topped karst mountains placed by hand (x as a fraction of the width, sizes in rows). */
export interface PeakLayer {
  kind: "peaks";
  color: string;
  shade: string;
  peaks: { x: number; height: number; width: number }[];
}

/** A grove of bamboo: jointed stalks with leaves at the nodes. */
export interface BambooLayer {
  kind: "bamboo";
  color: string;
  node: string;
  leaves: string;
  height: number;
  spacing: number;
  seed: number;
}

export type LandscapeLayer = RidgeLayer | TreeLayer | SproutLayer | MushroomLayer | PalmLayer | BuildingLayer | FenceLayer | CloudLayer | GarlandLayer | PeakLayer | BambooLayer;

/**
 * A long Chinese dragon flying far away: it crosses the sky, lands coiled on
 * top of a mountain (`perch`, matching a peak of a PeakLayer), rests there a
 * while, then takes off again.
 */
export interface SkyDragon {
  body: string;
  scales: string;
  belly: string;
  mane: string;
  horn: string;
  /** Rows above the ground line while flying. */
  altitude: number;
  perch: { x: number; height: number };
}

/**
 * How a prop moves: `bob` floats up and down (boats, balloons), `sway` paces
 * back and forth facing its way (a knight on guard), `cross` travels across
 * the whole scene and wraps around (a train, birds, a spaceship).
 */
export interface PropMotion {
  kind: "bob" | "sway" | "cross";
  amount?: number;
  /** Seconds per cycle for bob and sway. */
  period?: number;
  /** Scene pixels per second for cross. */
  speed?: number;
}

/** Glyphs rising over a figure: sleep, music or affection. `x`/`y` are sprite pixels. */
export interface PropEffect {
  kind: "zzz" | "notes" | "hearts" | "smoke";
  x: number;
  y: number;
}

/** Animated figure that belongs to a landscape (it never walks). Sprites face right. */
export interface SceneProp {
  /** Scale class checked against the walker (see scale.ts). */
  size: PropSize;
  palette: Record<string, string>;
  frames: SpriteFrame[];
  fps: number;
  effect?: PropEffect;
  /** Soft flickering light, e.g. a lantern or a lit window (rgb triplet). */
  glow?: { x: number; y: number; color: string; radius: number };
  /** A lighthouse beam that sweeps from side to side (rgb triplet, length in scene pixels). */
  beam?: { x: number; y: number; color: string; length: number };
}

export interface PropPlacement {
  prop: SceneProp;
  /** Left edge as a fraction of the scene width. */
  x: number;
  flip?: boolean;
  /** Rows below the usual standing line, e.g. to float in the lake; negative lifts it into the sky. */
  sink?: number;
  motion?: PropMotion;
}

/** Water covering the ground from `from` (fraction of the width) to the right edge. */
export interface Lake {
  from: number;
  color: string;
  shade: string;
  shine: string;
  shore: string;
  pads?: string;
  /** Hot water: wisps of steam rise from the surface. */
  steam?: boolean;
}

export interface Landscape extends Obtainable {
  /** Sky bands from top to bottom; the engine dithers between neighbours. */
  sky: string[];
  stars: { colors: string[]; density: number };
  /** Moon, sun or planet. `glow` draws a soft halo (rgb triplet). */
  orb: { x: number; y: number; radius: number; color: string; shade: string; glow?: string; ring?: string };
  layers: LandscapeLayer[];
  ground: { color: string; path: string; speck: string; height: number };
  fireflies: { color: string; count: number };
  seed: number;
  /** The walking character never enters the lake. */
  lake?: Lake;
  /** Rockets that burst in the sky, in these colours. */
  fireworks?: { colors: string[]; count: number };
  skyDragon?: SkyDragon;
  /** Rain streaks falling in front of the whole scene. */
  rain?: { color: string; count: number };
  /** Drawn behind the walking character; skipped when they would overlap on narrow scenes. */
  props?: PropPlacement[];
}
