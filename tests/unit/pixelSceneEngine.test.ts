import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PixelSceneEngine } from "../../src/features/ambient/pixelSceneEngine";
import { CHARACTERS, LANDSCAPES } from "../../src/features/ambient/sceneCatalog";

// A canvas double: the engine only needs fillRect/drawImage/clearRect and a few setters.
const context = { fillRect() {}, drawImage() { draws += 1; }, clearRect() {}, fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: false };
const makeCanvas = () => ({ width: 0, height: 0, getContext: () => context }) as unknown as HTMLCanvasElement;
let draws = 0;
let pending = new Map<number, FrameRequestCallback>();
let nextId = 0;
const keys = ["document", "performance", "requestAnimationFrame", "cancelAnimationFrame"] as const;
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

beforeEach(() => {
  draws = 0;
  pending = new Map();
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: { createElement: makeCanvas } },
    performance: { configurable: true, value: { now: () => 100 } },
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => { pending.set(++nextId, callback); return nextId; } },
    cancelAnimationFrame: { configurable: true, value: (frame: number) => pending.delete(frame) },
  });
});

afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
});

function step(timestamp: number) {
  expect(pending.size, "exactly one animation frame is scheduled").toBe(1);
  const [frame, callback] = pending.entries().next().value!;
  pending.delete(frame);
  callback(timestamp);
}

describe("pixel scene engine", () => {
  test("an early first RAF timestamp does not stop the scene, including after a pause", () => {
    const engine = new PixelSceneEngine(makeCanvas(), { character: CHARACTERS[0], landscape: LANDSCAPES[0] });
    engine.resize(320, 150, 1);
    engine.start();
    engine.start();
    const initialDraws = draws;
    expect(() => step(90)).not.toThrow();
    expect(draws).toBeGreaterThan(initialDraws);
    for (let time = 106; time < 3100; time += 16) step(time);
    engine.stop();
    expect(pending.size, "pausing cancels the scheduled frame").toBe(0);
    engine.start();
    expect(() => step(95)).not.toThrow();
    step(112);
    engine.stop();
    expect(pending.size).toBe(0);
  });

  test("every landscape renders and animates with every kind of character, wide and narrow", () => {
    for (const landscape of LANDSCAPES) {
      for (const character of [CHARACTERS[0], CHARACTERS[CHARACTERS.length - 1]]) {
        for (const width of [170, 900]) {
          const engine = new PixelSceneEngine(makeCanvas(), { character, landscape });
          expect(() => {
            engine.resize(width, 150, 1);
            engine.start();
            for (let time = 100; time < 2200; time += 50) step(time);
            engine.stop();
            engine.renderStill();
          }, `${landscape.id} with ${character.id} at ${width}px`).not.toThrow();
        }
      }
    }
  });
});
