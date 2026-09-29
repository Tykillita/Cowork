/** Pieces shared by several themes of scene figures. */

import type { SpriteFrame } from "../types";

export const LAKE_WATER = { v: "#4f86a8", V: "#a8d8ec" };
export const frames = (...rows: string[][]): SpriteFrame[] => rows.map((entry) => ({ rows: entry }));
