import type { BuildingLayer, Landscape, PixelCharacter, PropEffect, PropMotion, SceneProp, SpriteFrame } from "./scene/types";

/** Scene rows rendered for the whole card; the pixel size adapts to fill it. */
const SCENE_ROWS = 72;
const MAX_STEP = 0.1;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic value for a given column, so resizing never reshuffles the scenery. */
function hash(x: number, seed: number) {
  let h = Math.imul(x ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Star = { x: number; y: number; color: string; phase: number; speed: number };
type Firefly = { x: number; y: number; phase: number; drift: number; speed: number };
type Walker = { x: number; dir: 1 | -1; mode: "idle" | "walk"; timer: number; frameTime: number };
type PlacedProp = {
  prop: SceneProp; x: number; y: number; width: number; height: number; flip: boolean; phase: number;
  motion?: PropMotion;
  /** Extra room a swaying prop needs on each side. */
  reach: number;
};

const spriteSize = (frames: SpriteFrame[]) => ({
  width: Math.max(...frames.flatMap((entry) => entry.rows.map((row) => row.length))),
  height: Math.max(...frames.map((entry) => entry.rows.length)),
});

/** Small glyphs that rise and fade above a figure: sleep, music or affection. */
const EFFECTS: Record<PropEffect["kind"], { glyph: string[]; color: string; speed: number; rise: number }> = {
  zzz: { glyph: ["###", ".#.", "###"], color: "#eef4ff", speed: 0.35, rise: 9 },
  notes: { glyph: ["..##", "..#.", ".##.", ".##."], color: "#ffe08a", speed: 0.45, rise: 10 },
  hearts: { glyph: [".#.#.", "#####", ".###.", "..#.."], color: "#ff8fb1", speed: 0.3, rise: 8 },
  smoke: { glyph: [".##.", "####", ".##."], color: "#c9ced8", speed: 0.2, rise: 16 },
};

export interface SceneOptions {
  character: PixelCharacter;
  landscape: Landscape;
}

/**
 * Canvas renderer for the ambient card. It owns no DOM besides the canvas and
 * knows nothing about React: the host decides when it runs, pauses or resizes.
 */
export class PixelSceneEngine {
  private readonly context: CanvasRenderingContext2D;
  private readonly buffer = document.createElement("canvas");
  private readonly bufferContext: CanvasRenderingContext2D;
  private readonly backdrop = document.createElement("canvas");
  private readonly random: () => number;
  private width = 0;
  private height = SCENE_ROWS;
  private groundY = SCENE_ROWS - 12;
  private stars: Star[] = [];
  private fireflies: Firefly[] = [];
  private props: PlacedProp[] = [];
  private walker: Walker = { x: 20, dir: 1, mode: "idle", timer: 1.2, frameTime: 0 };
  private frame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private running = false;
  private readonly spriteWidth: number;
  private readonly spriteHeight: number;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: SceneOptions) {
    const context = canvas.getContext("2d");
    const bufferContext = this.buffer.getContext("2d");
    if (!context || !bufferContext) throw new Error("Canvas 2D no está disponible.");
    this.context = context;
    this.bufferContext = bufferContext;
    this.random = mulberry32(options.landscape.seed * 7919 + 17);
    const size = spriteSize([...options.character.idle, ...options.character.walk]);
    this.spriteWidth = size.width;
    this.spriteHeight = size.height;
  }

  /** Sizes the canvas to its CSS box and rebuilds the static backdrop. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
    if (cssWidth <= 0 || cssHeight <= 0) return;
    const deviceWidth = Math.round(cssWidth * devicePixelRatio);
    const deviceHeight = Math.round(cssHeight * devicePixelRatio);
    const pixel = Math.max(1, Math.floor(deviceHeight / SCENE_ROWS));
    const width = Math.ceil(deviceWidth / pixel);
    const height = Math.ceil(deviceHeight / pixel);
    // ResizeObserver may report the same box repeatedly. Resetting canvas size
    // clears its pixels and rebuilds every static layer, even when unchanged.
    if (this.width === width && this.height === height
      && this.canvas.width === width * pixel && this.canvas.height === height * pixel) return;
    this.canvas.width = width * pixel;
    this.canvas.height = height * pixel;
    const previousWidth = this.width;
    this.width = width;
    this.height = height;
    this.groundY = height - this.options.landscape.ground.height;
    this.buffer.width = width;
    this.buffer.height = height;
    this.backdrop.width = width;
    this.backdrop.height = height;
    this.context.imageSmoothingEnabled = false;
    this.paintBackdrop();
    this.placeLights();
    this.placeProps();
    this.walker.x = previousWidth ? Math.min(this.walker.x, this.maxX()) : Math.round(width * 0.3);
    this.draw();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (time: number) => {
      if (!this.running) return;
      // The first RAF timestamp can precede start() within the same browser frame.
      // Never let that move the sprite clock backwards into a negative frame index.
      const delta = Math.max(0, Math.min(MAX_STEP, (time - this.lastTime) / 1000));
      this.lastTime = time;
      this.update(delta);
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Still composition for reduced motion: the character rests beside the path. */
  renderStill() {
    this.stop();
    this.walker = { ...this.walker, mode: "idle", frameTime: 0, x: Math.round(this.width * 0.3) };
    this.elapsed = 0;
    this.draw();
  }

  /** The walker stays on land: it turns back before the lake. */
  private maxX() {
    const lake = this.options.landscape.lake;
    const edge = lake ? Math.round(this.width * lake.from) - 2 : this.width - 4;
    return Math.max(4, edge - this.spriteWidth);
  }

  /**
   * Where the far-away Chinese dragon's head is at a given time. One cycle:
   * fly in from the left, land and coil on the mountain top, rest, take off
   * to the right, then stay out of sight for a moment.
   */
  private skyDragonAt(time: number) {
    const dragon = this.options.landscape.skyDragon!;
    const cycle = 30;
    const t = ((time % cycle) + cycle) % cycle;
    const peakX = this.width * dragon.perch.x;
    const peakY = this.groundY - dragon.perch.height - 3;
    const skyY = this.groundY - dragon.altitude;
    const ease = (value: number) => value * value * (3 - 2 * value);
    if (t < 9) {
      const progress = t / 9;
      return { x: -30 + (peakX + 30) * progress, y: skyY + (peakY - skyY) * ease(progress) + Math.sin(t * 3) * 4 * (1 - progress) };
    }
    if (t < 16) {
      // Coiled round the summit: the body wraps the peak while the head slowly circles.
      const angle = (t - 9) * 0.65;
      return { x: peakX + Math.cos(angle) * 8, y: peakY + 1 + Math.sin(angle) * 3 };
    }
    if (t < 25) {
      const progress = (t - 16) / 9;
      return { x: peakX + (this.width + 40 - peakX) * progress, y: peakY + (skyY - 6 - peakY) * ease(progress) + Math.sin(t * 3) * 4 * progress };
    }
    return { x: this.width + 80, y: skyY };
  }

  /** The body follows the head's path a little later, segment by segment; the tail tapers. */
  private drawSkyDragon(context: CanvasRenderingContext2D) {
    const dragon = this.options.landscape.skyDragon;
    if (!dragon) return;
    const segments = 22;
    for (let index = segments; index >= 1; index -= 1) {
      const point = this.skyDragonAt(this.elapsed - index * 0.13);
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < -4 || x > this.width + 4) continue;
      const radius = index > segments - 5 ? 1 : 2;
      context.fillStyle = dragon.body;
      this.fillDisc(context, x, y, radius);
      context.fillStyle = index % 3 === 0 ? dragon.scales : dragon.belly;
      context.fillRect(x - 1, y + radius, 2, 1);
      if (index % 2 === 0 && radius > 1) {
        context.fillStyle = dragon.mane;
        context.fillRect(x, y - radius - 1, 1, 1);
      }
    }
    const head = this.skyDragonAt(this.elapsed);
    const before = this.skyDragonAt(this.elapsed - 0.05);
    const facing = head.x >= before.x ? 1 : -1;
    const x = Math.round(head.x);
    const y = Math.round(head.y);
    if (x < -8 || x > this.width + 8) return;
    // Head: snout pointing the way it flies, horns, a flowing mane and whiskers.
    const pixel = (dx: number, dy: number, color: string) => {
      context.fillStyle = color;
      context.fillRect(x + dx * facing, y + dy, 1, 1);
    };
    for (let dy = -2; dy <= 1; dy += 1) for (let dx = -1; dx <= 3; dx += 1) pixel(dx, dy, dragon.body);
    for (let dx = 4; dx <= 5; dx += 1) { pixel(dx, 0, dragon.body); pixel(dx, 1, dragon.belly); }
    pixel(2, -1, "#1a1010");
    pixel(0, -3, dragon.horn); pixel(-1, -4, dragon.horn); pixel(2, -3, dragon.horn); pixel(1, -4, dragon.horn);
    pixel(-2, -2, dragon.mane); pixel(-3, -1, dragon.mane); pixel(-2, 0, dragon.mane);
    pixel(6, 1, dragon.mane); pixel(7, 2, dragon.mane); pixel(5, 2, dragon.mane);
  }

  /** A tilted ring around the planet: the back half behind it, the front half over it. */
  private paintRing(context: CanvasRenderingContext2D, orbX: number, half: "back" | "front") {
    const { orb } = this.options.landscape;
    if (!orb.ring) return;
    context.fillStyle = orb.ring;
    for (let step = 0; step < 120; step += 1) {
      const angle = (step / 120) * Math.PI * 2;
      if ((Math.sin(angle) < 0) !== (half === "back")) continue;
      const x = Math.round(orbX + Math.cos(angle) * orb.radius * 2);
      const y = Math.round(orb.y + Math.sin(angle) * orb.radius * 0.45 - Math.cos(angle) * orb.radius * 0.25);
      context.fillRect(x, y, 1, 1);
    }
  }

  /** Rockets that climb, then burst into a ring of sparks that falls and fades. */
  private drawFireworks(context: CanvasRenderingContext2D) {
    const fireworks = this.options.landscape.fireworks;
    if (!fireworks) return;
    for (let index = 0; index < fireworks.count; index += 1) {
      const period = 3.2 + hash(index, 5) * 1.6;
      const time = this.elapsed / period + hash(index, 7);
      const cycle = Math.floor(time);
      const progress = time - cycle;
      const x = Math.round(8 + hash(index * 13 + cycle, 11) * Math.max(1, this.width - 16));
      const peak = Math.round(6 + hash(index * 17 + cycle, 19) * this.groundY * 0.35);
      context.fillStyle = fireworks.colors[Math.floor(hash(index + cycle, 23) * fireworks.colors.length)];
      if (progress < 0.3) {
        context.globalAlpha = 0.8;
        context.fillRect(x, Math.round(this.groundY - (this.groundY - peak) * (progress / 0.3)), 1, 2);
      } else {
        const burst = (progress - 0.3) / 0.7;
        const radius = 2 + burst * 9;
        context.globalAlpha = Math.max(0, 1 - burst);
        for (let ray = 0; ray < 10; ray += 1) {
          const angle = (ray / 10) * Math.PI * 2;
          context.fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(peak + Math.sin(angle) * radius + burst * 3), 1, 1);
        }
        if (burst < 0.25) context.fillRect(x - 1, peak - 1, 3, 3);
      }
    }
    context.globalAlpha = 1;
  }

  /** Silhouettes of houses, towers or Japanese buildings, with some lit windows. */
  private paintBuildings(context: CanvasRenderingContext2D, layer: BuildingLayer) {
    const { width, groundY } = this;
    const lit = (x: number, y: number) => hash(x * 31 + y * 7, layer.seed + 9) < layer.lit;
    const skip = layer.style === "pagoda" ? 0.7 : 0.12;
    for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
      if (hash(slot, layer.seed) < skip) continue;
      const left = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.3);
      const scale = 0.7 + hash(slot, layer.seed + 2) * 0.6;
      const lightWindow = (x: number, y: number, w: number, h: number) => {
        if (!lit(x, y)) return;
        context.fillStyle = layer.window;
        context.fillRect(x, y, w, h);
      };
      if (layer.style === "tower") {
        const w = Math.max(5, Math.round(layer.spacing * (0.5 + hash(slot, layer.seed + 3) * 0.45)));
        const h = Math.round(layer.height * (0.45 + hash(slot, layer.seed + 4) * 0.7));
        const top = groundY - h;
        context.fillStyle = layer.wall;
        context.fillRect(left, top, w, h);
        if (hash(slot, layer.seed + 5) < 0.35) context.fillRect(left + 1, top - 2, w - 2, 2);
        if (hash(slot, layer.seed + 6) < 0.25) {
          context.fillRect(left + Math.floor(w / 2), top - 6, 1, 6);
          context.fillStyle = layer.accent ?? layer.window;
          context.fillRect(left + Math.floor(w / 2), top - 7, 1, 1);
        }
        for (let y = top + 2; y < groundY - 1; y += 3) for (let x = left + 1; x < left + w - 1; x += 2) lightWindow(x, y, 1, 1);
      } else if (layer.style === "cottage") {
        const w = Math.max(7, Math.round(layer.spacing * 0.6 * scale));
        const h = Math.max(5, Math.round(layer.height * 0.55 * scale));
        const top = groundY - h;
        const roof = Math.ceil(w / 2) + 1;
        if (hash(slot, layer.seed + 5) < 0.5) {
          context.fillStyle = layer.roof;
          context.fillRect(left + w - 3, top - roof + 1, 2, roof);
        }
        context.fillStyle = layer.wall;
        context.fillRect(left, top, w, h);
        context.fillStyle = layer.roof;
        for (let row = 0; row < roof; row += 1) {
          const span = w + 2 - row * 2;
          if (span <= 0) break;
          context.fillRect(left - 1 + row, top - 1 - row, span, 1);
        }
        for (let y = top + 1; y < groundY - 2; y += 4) for (let x = left + 2; x < left + w - 2; x += 3) lightWindow(x, y, 1, 2);
        // A belfry now and then gives the village a centre.
        if (hash(slot, layer.seed + 6) < 0.12) {
          const towerX = left + Math.floor(w / 2) - 1;
          context.fillStyle = layer.wall;
          context.fillRect(towerX, top - roof - 8, 3, 9);
          context.fillStyle = layer.roof;
          context.fillRect(towerX - 1, top - roof - 9, 5, 1);
          context.fillRect(towerX, top - roof - 11, 3, 2);
          context.fillRect(towerX + 1, top - roof - 13, 1, 2);
        }
      } else if (layer.style === "machiya") {
        const w = Math.max(10, Math.round(layer.spacing * 0.75 * scale));
        const lower = Math.max(5, Math.round(layer.height * 0.5 * scale));
        const upper = Math.max(4, Math.round(lower * 0.8));
        const top = groundY - lower;
        const upperTop = top - 2 - upper;
        context.fillStyle = layer.wall;
        context.fillRect(left, top, w, lower);
        context.fillRect(left + 2, upperTop, w - 4, upper + 2);
        context.fillStyle = layer.roof;
        context.fillRect(left - 2, top - 2, w + 4, 2);
        context.fillRect(left - 3, top - 3, 1, 1);
        context.fillRect(left + w + 2, top - 3, 1, 1);
        context.fillRect(left, upperTop - 2, w, 2);
        context.fillRect(left - 1, upperTop - 3, 1, 1);
        context.fillRect(left + w, upperTop - 3, 1, 1);
        lightWindow(left + 2, top + 1, w - 4, 2);
        lightWindow(left + 4, upperTop + 1, Math.max(1, w - 8), 2);
        if (layer.accent && hash(slot, layer.seed + 7) < 0.6) {
          context.fillStyle = layer.accent;
          context.fillRect(left + 1, top, 2, 3);
        }
      } else {
        // Pagoda: stacked storeys, each with a wide roof and upturned eaves.
        const levels = 3 + Math.floor(hash(slot, layer.seed + 3) * 3);
        const center = left + Math.round(layer.spacing * 0.3);
        let base = groundY;
        for (let level = 0; level < levels; level += 1) {
          const half = Math.max(2, Math.round(layer.height * 0.18) - level * 2);
          const storey = Math.max(3, Math.round(layer.height * 0.1));
          context.fillStyle = layer.wall;
          context.fillRect(center - half, base - storey, half * 2 + 1, storey);
          lightWindow(center - 1, base - storey + 1, 3, 1);
          context.fillStyle = layer.roof;
          context.fillRect(center - half - 3, base - storey - 2, half * 2 + 7, 2);
          context.fillRect(center - half - 4, base - storey - 3, 1, 1);
          context.fillRect(center + half + 4, base - storey - 3, 1, 1);
          base -= storey + 2;
        }
        context.fillStyle = layer.roof;
        context.fillRect(center, base - 6, 1, 6);
      }
    }
  }

  private drawRain(context: CanvasRenderingContext2D) {
    const rain = this.options.landscape.rain;
    if (!rain) return;
    context.fillStyle = rain.color;
    for (let index = 0; index < rain.count; index += 1) {
      const progress = (this.elapsed * (0.9 + hash(index, 11) * 0.5) + hash(index, 13)) % 1;
      const y = Math.round(progress * (this.groundY + 6)) - 3;
      const x = Math.round(hash(index, 17) * (this.width + 8)) - Math.round(progress * 5);
      context.fillRect(x, y, 1, 3);
      if (y > this.groundY) context.fillRect(x - 1, this.groundY + 1, 3, 1);
    }
  }

  /** Wisps of steam rising from hot water. */
  private drawSteam(context: CanvasRenderingContext2D) {
    const lake = this.options.landscape.lake;
    if (!lake?.steam) return;
    const start = Math.round(this.width * lake.from) + 3;
    const span = this.width - start;
    const count = Math.max(4, Math.round(span / 6));
    for (let index = 0; index < count; index += 1) {
      const progress = (this.elapsed * 0.22 + hash(index, 71)) % 1;
      const x = start + Math.round(hash(index, 73) * span + Math.sin(progress * 6 + index) * 2);
      const y = this.groundY - 2 - Math.round(progress * 18);
      context.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - progress)})`;
      context.fillRect(x, y, 2, 2);
      context.fillRect(x + (index % 2 ? 2 : -1), y - 2, 1, 2);
    }
  }

  /** Props keep their order; one that would overlap an earlier one is left out on narrow scenes. */
  private placeProps() {
    this.props = [];
    (this.options.landscape.props ?? []).forEach((placement, index) => {
      const { width, height } = spriteSize(placement.prop.frames);
      const x = Math.round(this.width * placement.x);
      const y = this.groundY + 2 - height + (placement.sink ?? 0);
      const motion = placement.motion;
      const placed: PlacedProp = { prop: placement.prop, x, y, width, height, flip: Boolean(placement.flip), phase: index * 1.37, motion, reach: 0 };
      // Figures crossing the scene travel over everything and are never left out.
      if (motion?.kind === "cross") {
        this.props.push(placed);
        return;
      }
      placed.reach = motion?.kind === "sway" ? motion.amount ?? 6 : 0;
      if (x + width + placed.reach > this.width) return;
      const overlaps = (other: PlacedProp) => other.motion?.kind !== "cross"
        && x - placed.reach < other.x + other.width + other.reach + 1 && other.x - other.reach < x + width + placed.reach + 1
        && y < other.y + other.height && other.y < y + height;
      if (this.props.some(overlaps)) return;
      this.props.push(placed);
    });
  }

  private update(delta: number) {
    this.elapsed += delta;
    const walker = this.walker;
    const { character } = this.options;
    walker.timer -= delta;
    walker.frameTime += delta;

    if (walker.mode === "walk") {
      walker.x += walker.dir * character.speed * delta;
      if (walker.x <= 4 || walker.x >= this.maxX()) {
        walker.x = Math.min(this.maxX(), Math.max(4, walker.x));
        this.rest();
      }
    }
    if (walker.timer > 0) return;
    if (walker.mode === "walk") this.rest();
    else {
      // Change direction now and then, and always when a wall is close.
      const nearEdge = walker.dir === 1 ? walker.x > this.maxX() - 14 : walker.x < 18;
      if (nearEdge || this.random() < 0.35) walker.dir = walker.dir === 1 ? -1 : 1;
      walker.mode = "walk";
      walker.timer = 2.5 + this.random() * 5;
      walker.frameTime = 0;
    }
  }

  private rest() {
    this.walker.mode = "idle";
    this.walker.timer = 1.4 + this.random() * 3.2;
    this.walker.frameTime = 0;
  }

  private placeLights() {
    const { stars, fireflies } = this.options.landscape;
    const random = mulberry32(this.options.landscape.seed);
    const skyBottom = this.groundY - 22;
    this.stars = [];
    const count = Math.round(this.width * skyBottom * stars.density);
    for (let index = 0; index < count; index += 1) {
      this.stars.push({
        x: Math.floor(random() * this.width),
        y: Math.floor(random() * Math.max(4, skyBottom)),
        color: stars.colors[Math.floor(random() * stars.colors.length)],
        phase: random() * Math.PI * 2,
        speed: 0.6 + random() * 1.6,
      });
    }
    this.fireflies = Array.from({ length: fireflies.count }, () => ({
      x: random() * this.width,
      y: this.groundY - 4 - random() * 16,
      phase: random() * Math.PI * 2,
      drift: 0.3 + random() * 0.7,
      speed: 0.4 + random() * 0.8,
    }));
  }

  private paintBackdrop() {
    const context = this.backdrop.getContext("2d");
    if (!context) return;
    const { landscape } = this.options;
    const { width, height, groundY } = this;

    // Sky bands with a two-row checker dither at each boundary.
    const band = groundY / landscape.sky.length;
    for (let y = 0; y < groundY; y += 1) {
      const index = Math.min(landscape.sky.length - 1, Math.floor(y / band));
      context.fillStyle = landscape.sky[index];
      context.fillRect(0, y, width, 1);
      const next = landscape.sky[index + 1];
      const intoBand = y - index * band;
      if (next && intoBand > band - 2) {
        context.fillStyle = next;
        for (let x = (y % 2); x < width; x += 2) context.fillRect(x, y, 1, 1);
      }
    }

    const orb = landscape.orb;
    const orbX = Math.round(width * orb.x);
    if (orb.ring) this.paintRing(context, orbX, "back");
    if (orb.glow) {
      for (let ring = 4; ring >= 1; ring -= 1) {
        context.fillStyle = `rgba(${orb.glow}, ${0.06 * (5 - ring)})`;
        this.fillDisc(context, orbX, orb.y, orb.radius + ring * 3);
      }
    }
    for (let y = -orb.radius; y <= orb.radius; y += 1) {
      for (let x = -orb.radius; x <= orb.radius; x += 1) {
        if (x * x + y * y > orb.radius * orb.radius) continue;
        const shaded = (x + 2) * (x + 2) + (y - 1) * (y - 1) > (orb.radius - 1) * (orb.radius - 1) && x > 0;
        context.fillStyle = shaded ? orb.shade : orb.color;
        context.fillRect(orbX + x, orb.y + y, 1, 1);
      }
    }
    if (orb.ring) this.paintRing(context, orbX, "front");

    for (const layer of landscape.layers) {
      if (layer.kind === "sprouts") {
        for (let slot = 0; slot * layer.spacing < width; slot += 1) {
          if (hash(slot, layer.seed) < 0.3) continue;
          const x = Math.round(slot * layer.spacing + hash(slot, layer.seed + 3) * layer.spacing * 0.7);
          const tall = 2 + Math.floor(hash(slot, layer.seed + 5) * 4);
          context.fillStyle = layer.stem;
          context.fillRect(x, groundY - tall, 1, tall);
          if (tall > 3) context.fillRect(x + 1, groundY - tall + 2, 1, 1);
          context.fillStyle = layer.bloom;
          context.fillRect(x, groundY - tall - 1, 1, 1);
          if (layer.glow !== false) {
            context.fillStyle = "rgba(141, 231, 189, .18)";
            context.fillRect(x - 1, groundY - tall - 2, 3, 3);
          }
        }
        continue;
      }
      if (layer.kind === "peaks") {
        for (const peak of layer.peaks) {
          const center = Math.round(width * peak.x);
          const top = groundY - peak.height;
          for (let row = 0; row < peak.height; row += 1) {
            const t = row / peak.height;
            const half = Math.max(1, Math.round((peak.width / 2) * (0.3 + 0.7 * Math.pow(t, 0.6))) - (row < 2 ? 2 - row : 0));
            context.fillStyle = layer.color;
            context.fillRect(center - half, top + row, half * 2 + 1, 1);
            context.fillStyle = layer.shade;
            context.fillRect(center + Math.ceil(half / 3), top + row, half - Math.ceil(half / 3) + 1, 1);
          }
        }
        continue;
      }
      if (layer.kind === "bamboo") {
        for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
          if (hash(slot, layer.seed) < 0.25) continue;
          const x = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.6);
          const tall = Math.round(layer.height * (0.6 + hash(slot, layer.seed + 2) * 0.5));
          context.fillStyle = layer.color;
          context.fillRect(x, groundY - tall, 1, tall);
          for (let y = groundY - 3; y > groundY - tall; y -= 4) {
            context.fillStyle = layer.node;
            context.fillRect(x, y, 1, 1);
            if (hash(x + y, layer.seed + 3) < 0.45) {
              const side = hash(y, layer.seed + 4) < 0.5 ? -1 : 1;
              context.fillStyle = layer.leaves;
              context.fillRect(x + side, y - 1, 1, 1);
              context.fillRect(x + side * 2, y - 1, 1, 1);
              context.fillRect(x + side * 3, y, 1, 1);
            }
          }
          context.fillStyle = layer.leaves;
          context.fillRect(x - 1, groundY - tall - 1, 3, 1);
          context.fillRect(x, groundY - tall - 2, 1, 1);
        }
        continue;
      }
      if (layer.kind === "clouds") {
        for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
          if (hash(slot, layer.seed) < 0.35) continue;
          const cx = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.5);
          const cy = layer.top + Math.round(hash(slot, layer.seed + 2) * layer.spread);
          const radius = Math.max(2, Math.round(layer.size * (0.6 + hash(slot, layer.seed + 3) * 0.5)));
          for (const [key, lift] of [[layer.shade, 1], [layer.color, 0]] as const) {
            context.fillStyle = key;
            this.fillDisc(context, cx, cy + lift, radius);
            this.fillDisc(context, cx - radius, cy + 1 + lift, Math.round(radius * 0.7));
            this.fillDisc(context, cx + radius, cy + 1 + lift, Math.round(radius * 0.75));
            context.fillRect(cx - Math.round(radius * 1.6), cy + 1 + lift, Math.round(radius * 3.2), Math.max(1, Math.round(radius * 0.7)));
          }
        }
        continue;
      }
      if (layer.kind === "garland") {
        const lineAt = (x: number) => groundY - layer.height + Math.round(Math.sin(((x % layer.span) / layer.span) * Math.PI) * layer.sag);
        context.fillStyle = layer.cord;
        for (let x = 0; x < width; x += 1) context.fillRect(x, lineAt(x), 1, 1);
        for (let x = 2, index = 0; x < width; x += 5, index += 1) {
          context.fillStyle = layer.lights[index % layer.lights.length];
          context.fillRect(x, lineAt(x) + 1, 2, 2);
        }
        continue;
      }
      if (layer.kind === "buildings") {
        this.paintBuildings(context, layer);
        continue;
      }
      if (layer.kind === "fence") {
        context.fillStyle = layer.color;
        for (let x = 1; x < width; x += layer.spacing) context.fillRect(x, groundY - layer.height, 1, layer.height);
        context.fillRect(0, groundY - layer.height + 1, width, 1);
        context.fillRect(0, groundY - 3, width, 1);
        continue;
      }
      if (layer.kind === "palms") {
        for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
          if (hash(slot, layer.seed) < 0.35) continue;
          const base = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.6);
          const tall = Math.round(layer.height * (0.65 + hash(slot, layer.seed + 2) * 0.45));
          const lean = hash(slot, layer.seed + 3) < 0.5 ? -1 : 1;
          // A trunk that bends slightly, then drooping fronds from the crown.
          context.fillStyle = layer.trunk;
          let topX = base;
          for (let row = 0; row < tall; row += 1) {
            topX = base + Math.round(lean * ((row / tall) ** 2) * 4);
            context.fillRect(topX, groundY - row - 1, row < tall * 0.3 ? 2 : 1, 1);
          }
          const topY = groundY - tall;
          context.fillStyle = layer.leaves;
          for (const direction of [-1, 1]) {
            for (let step = 0; step <= 9; step += 1) context.fillRect(topX + direction * step, topY + Math.round((step * step) / 8), 1, 2);
            for (let step = 0; step <= 6; step += 1) context.fillRect(topX + direction * step, topY - 1 + Math.round((step * step) / 3), 1, 1);
            for (let step = 0; step <= 5; step += 1) context.fillRect(topX + direction * Math.round(step / 2), topY - 1 - step + Math.round((step * step) / 6), 1, 1);
          }
          context.fillRect(topX - 1, topY - 2, 3, 2);
        }
        continue;
      }
      if (layer.kind === "mushrooms") {
        for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
          if (hash(slot, layer.seed) < 0.3) continue;
          const center = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.5);
          const tall = Math.round(layer.height * (0.55 + hash(slot, layer.seed + 2) * 0.5));
          const radius = Math.max(3, Math.round(tall * 0.42));
          const capHeight = Math.max(2, Math.round(radius * 0.7));
          context.fillStyle = layer.stem;
          context.fillRect(center - 1, groundY - tall, 3, tall);
          context.fillStyle = layer.cap;
          for (let row = 0; row <= capHeight; row += 1) {
            const span = Math.round(radius * Math.sqrt(1 - (row / (capHeight + 1)) ** 2));
            context.fillRect(center - span, groundY - tall - row, span * 2 + 1, 1);
          }
          context.fillStyle = layer.spot;
          for (let spot = 0; spot < 3; spot += 1) {
            const row = 1 + Math.floor(hash(slot * 3 + spot, layer.seed + 5) * (capHeight - 1));
            const span = Math.round(radius * Math.sqrt(1 - (row / (capHeight + 1)) ** 2)) - 1;
            const offset = Math.round((hash(slot * 3 + spot, layer.seed + 4) * 2 - 1) * Math.max(0, span));
            context.fillRect(center + offset, groundY - tall - row, 1, 1);
          }
        }
        continue;
      }
      context.fillStyle = layer.color;
      if (layer.kind === "ridge") {
        for (let x = 0; x < width; x += 1) {
          const wave = Math.sin((x / layer.period) * Math.PI * 2 + layer.seed)
            + 0.5 * Math.sin((x / (layer.period * 0.43)) * Math.PI * 2 + layer.seed * 1.7)
            + 0.18 * (hash(x >> 2, layer.seed) - 0.5);
          const top = Math.round(groundY - layer.height - wave * layer.amplitude);
          context.fillRect(x, top, 1, groundY - top);
        }
      } else {
        for (let slot = -1; slot * layer.spacing < width + layer.spacing; slot += 1) {
          if (hash(slot, layer.seed) < 0.28) continue;
          const center = Math.round(slot * layer.spacing + hash(slot, layer.seed + 1) * layer.spacing * 0.6);
          const tall = Math.round(layer.height * (0.6 + hash(slot, layer.seed + 2) * 0.5));
          for (let row = 0; row < tall; row += 1) {
            const halfWidth = Math.floor((row / tall) * (tall / 2.6)) + (row % 3 === 2 ? 0 : 1) - 1;
            context.fillRect(center - Math.max(0, halfWidth), groundY - tall + row, Math.max(1, halfWidth * 2 + 1), 1);
          }
          context.fillRect(center, groundY - 2, 1, 2);
        }
      }
    }

    const ground = landscape.ground;
    context.fillStyle = ground.color;
    context.fillRect(0, groundY, width, height - groundY);
    context.fillStyle = ground.path;
    context.fillRect(0, groundY + 3, width, 3);
    context.fillStyle = ground.speck;
    for (let x = 0; x < width; x += 1) {
      const value = hash(x, landscape.seed + 101);
      if (value < 0.12) context.fillRect(x, groundY + 7 + Math.floor(value * 40) % Math.max(1, height - groundY - 7), 1, 1);
      if (value > 0.9) context.fillRect(x, groundY + 3 + (x % 3), 1, 1);
    }
    context.fillStyle = "rgba(255,255,255,.08)";
    context.fillRect(0, groundY, width, 1);
    if (landscape.lake) this.paintLake(context);
  }

  /** Water from the lake's edge to the right side, with a sandy shore, depth bands and lily pads. */
  private paintLake(context: CanvasRenderingContext2D) {
    const lake = this.options.landscape.lake!;
    const { width, height, groundY } = this;
    const start = Math.round(width * lake.from);
    for (let y = groundY - 1; y < height; y += 1) {
      // The shore slopes outwards so the water reads as a basin, not a box.
      const edge = start + Math.max(0, Math.min(4, y - groundY));
      context.fillStyle = lake.shore;
      context.fillRect(edge - 2, y, 2, 1);
      context.fillStyle = y === groundY - 1 ? lake.shine : (y - groundY) % 4 === 3 ? lake.shade : lake.color;
      context.fillRect(edge, y, width - edge, 1);
    }
    if (!lake.pads) return;
    context.fillStyle = lake.pads;
    for (let x = start + 6; x < width - 3; x += 1) {
      const value = hash(x, this.options.landscape.seed + 211);
      if (value > 0.06) continue;
      const y = groundY + 4 + Math.floor(hash(x, 5) * Math.max(1, height - groundY - 6));
      context.fillRect(x, y, 3, 1);
      context.fillRect(x + 1, y - 1, 1, 1);
    }
  }

  private drawLakeShimmer(context: CanvasRenderingContext2D) {
    const lake = this.options.landscape.lake;
    if (!lake) return;
    const start = Math.round(this.width * lake.from) + 4;
    const step = Math.floor(this.elapsed * 1.5);
    context.fillStyle = lake.shine;
    for (let x = start; x < this.width - 1; x += 1) {
      const value = hash(x + step * 7, this.options.landscape.seed + 307);
      if (value > 0.035) continue;
      const y = this.groundY + 1 + Math.floor(value * 1000) % Math.max(1, this.height - this.groundY - 2);
      context.fillRect(x, y, 2, 1);
    }
  }

  private drawProps(context: CanvasRenderingContext2D) {
    for (const placed of this.props) {
      const { prop } = placed;
      const frame = prop.frames[Math.floor(this.elapsed * prop.fps + placed.phase) % prop.frames.length];
      const view = this.moved(placed);
      if (prop.glow) this.drawPropGlow(context, view, prop.glow);
      if (prop.beam) this.drawBeam(context, view, prop.beam);
      this.drawSprite(context, frame, prop.palette, view.x, view.y + (frame.bob ?? 0), view.flip, placed.width);
      if (prop.effect) this.drawEffect(context, view, prop.effect);
    }
  }

  /** Where a prop is now: bobbing, pacing back and forth (facing its way) or crossing the scene. */
  private moved(placed: PlacedProp): PlacedProp {
    const { motion } = placed;
    if (!motion) return placed;
    const angle = (this.elapsed / (motion.period ?? 4)) * Math.PI * 2 + placed.phase;
    if (motion.kind === "bob") return { ...placed, y: placed.y + Math.round(Math.sin(angle) * (motion.amount ?? 1)) };
    if (motion.kind === "sway") {
      const facingLeft = Math.cos(angle) < 0;
      return { ...placed, x: placed.x + Math.round(Math.sin(angle) * (motion.amount ?? 6)), flip: facingLeft !== placed.flip };
    }
    const track = this.width + placed.width * 2;
    const travelled = (this.elapsed * (motion.speed ?? 12) + placed.phase * 97) % track;
    return { ...placed, x: Math.round(placed.flip ? this.width + placed.width - travelled : travelled - placed.width) };
  }

  /** A lighthouse beam sweeping around: it stretches to one side, shrinks, then the other. */
  private drawBeam(context: CanvasRenderingContext2D, view: PlacedProp, beam: NonNullable<SceneProp["beam"]>) {
    const direction = Math.cos(this.elapsed * 0.9 + view.phase);
    const length = Math.round(Math.abs(direction) * beam.length);
    const sign = direction < 0 ? -1 : 1;
    const originX = view.flip ? view.x + view.width - 1 - beam.x : view.x + beam.x;
    const originY = view.y + beam.y;
    for (let step = 2; step < length; step += 1) {
      const spread = Math.floor(step / 6);
      context.fillStyle = `rgba(${beam.color}, ${0.3 * (1 - step / (length + 1))})`;
      context.fillRect(originX + sign * step, originY - spread, 1, spread * 2 + 1);
    }
  }

  private drawPropGlow(context: CanvasRenderingContext2D, placed: PlacedProp, glow: NonNullable<SceneProp["glow"]>) {
    const flicker = 0.85 + 0.15 * Math.sin(this.elapsed * 7 + placed.phase) * Math.sin(this.elapsed * 2.3);
    const x = placed.flip ? placed.x + placed.width - 1 - glow.x : placed.x + glow.x;
    for (let ring = 3; ring >= 1; ring -= 1) {
      context.fillStyle = `rgba(${glow.color}, ${0.05 * (4 - ring) * flicker})`;
      this.fillDisc(context, x, placed.y + glow.y, Math.round((glow.radius * flicker * ring) / 3));
    }
  }

  /** Three glyphs that rise and fade in turn. */
  private drawEffect(context: CanvasRenderingContext2D, placed: PlacedProp, effect: PropEffect) {
    const { glyph, color, speed, rise } = EFFECTS[effect.kind];
    const originX = placed.flip ? placed.x + placed.width - 1 - effect.x : placed.x + effect.x;
    for (let index = 0; index < 3; index += 1) {
      const progress = (this.elapsed * speed + index / 3) % 1;
      const sway = effect.kind === "zzz" ? Math.round(progress * 5) : Math.round(Math.sin(progress * 7 + index) * 2);
      const x = originX + sway * (placed.flip ? -1 : 1);
      const y = placed.y + effect.y - glyph.length - Math.round(progress * rise);
      context.globalAlpha = Math.max(0, 1 - progress * 1.1);
      context.fillStyle = color;
      glyph.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length; column += 1) if (row[column] === "#") context.fillRect(x + column, y + rowIndex, 1, 1);
      });
    }
    context.globalAlpha = 1;
  }

  private currentFrame(): SpriteFrame {
    const { character } = this.options;
    const frames = this.walker.mode === "walk" ? character.walk : character.idle;
    const fps = this.walker.mode === "walk" ? character.fps.walk : character.fps.idle;
    return frames[Math.floor(this.walker.frameTime * fps) % frames.length];
  }

  private draw() {
    if (!this.width) return;
    const context = this.bufferContext;
    const { character, landscape } = this.options;
    context.drawImage(this.backdrop, 0, 0);

    for (const star of this.stars) {
      const glow = 0.45 + 0.55 * Math.sin(this.elapsed * star.speed + star.phase);
      if (glow < 0.2) continue;
      context.globalAlpha = Math.min(1, glow);
      context.fillStyle = star.color;
      context.fillRect(star.x, star.y, 1, 1);
    }
    context.globalAlpha = 1;

    this.drawFireworks(context);
    this.drawSkyDragon(context);
    this.drawLakeShimmer(context);
    this.drawProps(context);
    this.drawSteam(context);

    const frame = this.currentFrame();
    const x = Math.round(this.walker.x);
    const y = this.groundY + 2 - this.spriteHeight + (frame.bob ?? 0);

    if (character.light) {
      const flicker = 0.85 + 0.15 * Math.sin(this.elapsed * 9) * Math.sin(this.elapsed * 3.3);
      const lightX = this.walker.dir === 1 ? x + character.light.x : x + this.spriteWidth - 1 - character.light.x;
      const lightY = y + character.light.y;
      const radius = character.light.radius * flicker;
      for (let ring = 3; ring >= 1; ring -= 1) {
        const size = Math.round((radius * ring) / 3);
        context.fillStyle = `rgba(${character.light.color}, ${0.05 * (4 - ring) * flicker})`;
        this.fillDisc(context, lightX, lightY, size);
      }
      context.fillStyle = `rgba(${character.light.color}, ${0.16 * flicker})`;
      context.fillRect(lightX - Math.round(radius * 0.8), this.groundY + 1, Math.round(radius * 1.6), 1);
    }

    context.fillStyle = "rgba(0, 0, 0, .35)";
    context.fillRect(x + 2, this.groundY + 2, this.spriteWidth - 4, 1);
    this.drawSprite(context, frame, character.palette, x, y, this.walker.dir === -1, this.spriteWidth);

    for (const firefly of this.fireflies) {
      const time = this.elapsed * firefly.speed + firefly.phase;
      const fx = Math.round((firefly.x + Math.sin(time) * 6 * firefly.drift + this.width) % this.width);
      const fy = Math.round(firefly.y + Math.sin(time * 1.7) * 2);
      const glow = 0.5 + 0.5 * Math.sin(time * 2.3);
      context.fillStyle = `rgba(${landscape.fireflies.color}, ${0.25 + glow * 0.75})`;
      context.fillRect(fx, fy, 1, 1);
    }

    this.drawRain(context);

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.imageSmoothingEnabled = false;
    this.context.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private fillDisc(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const span = Math.floor(Math.sqrt(radius * radius - dy * dy));
      context.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
    }
  }

  private drawSprite(context: CanvasRenderingContext2D, frame: SpriteFrame, palette: Record<string, string>, x: number, y: number, mirrored: boolean, spriteWidth: number) {
    frame.rows.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        const color = palette[row[column]];
        if (!color) continue;
        context.fillStyle = color;
        const drawX = mirrored ? x + spriteWidth - 1 - column : x + column;
        context.fillRect(drawX, y + rowIndex, 1, 1);
      }
    });
  }
}
