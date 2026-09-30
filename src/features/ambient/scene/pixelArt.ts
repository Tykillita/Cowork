/** Helpers to build pixel sprites from rows of palette keys, rectangles and outlines. */

import type { SpriteFrame } from "./types";

export const withLegs = (body: string[], legs: string[], bob = 0): SpriteFrame => ({ rows: [...body, ...legs], bob });
export const blinkRow = (body: string[], row: number, from: string, to: string) => body.map((line, index) => index === row ? line.split(from).join(to) : line);
export const replaceRow = (rows: string[], row: number, line: string) => rows.map((entry, index) => index === row ? line : entry);
export const mirror = (rows: string[]) => rows.map((row) => [...row].reverse().join(""));
/** Closes an eye drawn as a glint `w` next to a pupil `e`. */
export const closeEyes = (rows: string[], row: number) => blinkRow(blinkRow(rows, row, "e", "c"), row, "w", "c");

export type SpriteLayer = { rows: string[]; x?: number; y?: number };

export type Fill = [key: string, x: number, y: number, width?: number, height?: number];

/** Paints rectangles on a blank canvas; later fills cover earlier ones. Used for buildings and big props. */
export function paint(width: number, height: number, fills: Fill[]) {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  for (const [key, x, y, w = 1, h = 1] of fills) {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) if (grid[row] && column >= 0 && column < width) grid[row][column] = key;
    }
  }
  return grid.map((line) => line.join(""));
}

/** Adds a 1px outline around every painted pixel; paint with a 1px margin. */
export function outline(rows: string[], key = "o") {
  return rows.map((row, y) => [...row].map((cell, x) => {
    if (cell !== ".") return cell;
    const touches = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => (rows[y + dy]?.[x + dx] ?? ".") !== ".");
    return touches ? key : ".";
  }).join(""));
}

/** A filled disc (odd width) centred on (cx, cy). */
export const disc = (key: string, cx: number, cy: number, radius: number): Fill[] =>
  Array.from({ length: radius * 2 + 1 }, (_, index): Fill => {
    const dy = index - radius;
    const span = Math.round(Math.sqrt(radius * radius - dy * dy));
    return [key, cx - span, cy + dy, span * 2 + 1, 1];
  });

/** A triangle growing downward from a point, `grow` pixels per row on each side. */
export const cone = (key: string, cx: number, top: number, rows: number, grow = 1): Fill[] =>
  Array.from({ length: rows }, (_, row): Fill => [key, cx - Math.floor(row * grow), top + row, Math.floor(row * grow) * 2 + 1, 1]);

/** One centred row per half-width, from `top` down: roofs, domes, towers. */
export const centred = (key: string, center: number, top: number, halves: number[]): Fill[] =>
  halves.map((half, row) => [key, center - half, top + row, half * 2, 1]);

/** Stacks sprites on a fixed canvas; later layers cover earlier ones and `.` stays transparent. */
/** A one-pixel line between two points (inclusive), for braces, ropes and spars. */
export function line(key: string, x0: number, y0: number, x1: number, y1: number): Fill[] {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  return Array.from({ length: steps + 1 }, (_, step): Fill => [key, Math.round(x0 + ((x1 - x0) * step) / steps), Math.round(y0 + ((y1 - y0) * step) / steps)]);
}

/** Rows of a shape given its left and right edge per row, from `top` down. */
export const rowsBetween = (key: string, top: number, edges: [left: number, right: number][]): Fill[] =>
  edges.map(([left, right], row): Fill => [key, left, top + row, right - left + 1, 1]);

export function compose(width: number, height: number, layers: SpriteLayer[]) {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  for (const { rows, x = 0, y = 0 } of layers) {
    rows.forEach((row, rowIndex) => {
      const line = grid[y + rowIndex];
      if (!line) return;
      [...row].forEach((key, column) => {
        if (key !== "." && x + column >= 0 && x + column < width) line[x + column] = key;
      });
    });
  }
  return grid.map((line) => line.join(""));
}
