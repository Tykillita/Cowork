import { useEffect, useState, type CSSProperties } from "react";

/** Original pixel art, drawn with whole-pixel cells and no external assets. */
const rows = [
  "0000001000000000","0000011100000000","0000012110000000","0000112210000000",
  "0001122210010000","0001222210110000","0011222221110000","0112222222111000",
  "0122222222221100","1122223222222100","1222233322222110","1222333332222210",
  "1223333333222210","1223334333322210","1223344433322210","1122344433222110",
  "0112233332221100","0011222222211000","0001111111110000","0000011111000000",
];
const patch = (changes: Record<number, string>) => rows.map((row, y) => changes[y] ?? row);
/**
 * Flicker frames share the body so the silhouette never jumps: the tip sways one
 * pixel to each side, the side lick grows/shrinks and the hot core shifts a row.
 */
const FRAMES = [
  rows,
  patch({ 0: "0000000100000000", 1: "0000001110000000", 2: "0000001211000000", 3: "0000011221000000", 4: "0001122210000000", 12: "1223333333222210", 13: "1223333433322210" }),
  patch({ 0: "0000010000000000", 1: "0000111000000000", 2: "0000121100000000", 3: "0001122100010000", 5: "0001222211110000", 13: "1223344433322210", 14: "1223344433322210" }),
];
const PALETTES = {
  lit: ["none", "#cc7136", "#f4a943", "#f6cf86", "#fff1bd"],
  frozen: ["none", "#358dbb", "#69d9f3", "#b8f1f9", "#e9fbff"],
  dim: ["none", "#3f444a", "#5d636a", "#7d838b", "#9ea4ab"],
};
/** Burst directions in flame cells; sparks fly out from the flame's belly. */
const SPARKS = [[-5, -7], [5, -8], [-7, -2], [7, -3], [-3, -10], [3, -11], [-6, 3], [6, 2]];

export type FlameState = keyof typeof PALETTES;
/** Looping motion: `idle` flickers (lit/frozen), `breathe` is the slow grey pulse while today is pending. */
export type FlameMotion = "idle" | "breathe" | "none";
/** One-shot bursts: `ignite` for the daily celebration, `pop` when the streak goes up. */
export type FlameBurst = "ignite" | "pop";

export function PixelFlame({ state, frozen = false, small = false, motion = "none", burst, burstKey = 0, igniteFrom = "dim" }: {
  state?: FlameState;
  /** Legacy alias for `state="frozen"`. */
  frozen?: boolean;
  small?: boolean;
  motion?: FlameMotion;
  burst?: FlameBurst;
  /** Change it to replay the same burst. */
  burstKey?: number;
  /** Where an ignite starts from: grey (first spark of the day) or ice (streak resumed). */
  igniteFrom?: "dim" | "frozen";
}) {
  const tone: FlameState = state ?? (frozen ? "frozen" : "lit");
  const colors = PALETTES[tone];
  const [bursting, setBursting] = useState(!!burst);
  // Reduced motion: no burst at all (CSS also stops every animation there).
  useEffect(() => { setBursting(!!burst && document.documentElement.dataset.motion !== "reduced"); }, [burst, burstKey]);
  const active = bursting && burst ? burst : motion;
  const sparks = bursting ? (burst === "ignite" ? SPARKS : SPARKS.slice(0, 4)) : [];
  return <span className={`pixelFlame${small ? " isSmall" : ""}${tone === "frozen" ? " isFrozen" : ""}`} data-motion={active} data-tone={tone} data-ignite-from={igniteFrom} aria-hidden="true"
    onAnimationEnd={(event) => { if (event.animationName === "flameIgnite" || event.animationName === "flamePop") setBursting(false); }}>
    <svg viewBox="0 0 16 20" shapeRendering="crispEdges">
      {FRAMES.map((frame, index) => <g key={index} className="pixelFlameFrame" style={{ "--frame": index } as CSSProperties}>
        {/* Cells overlap the next filled row/column slightly: at fractional zoom crispEdges
            rounding otherwise leaves hairline seams that show the background through. */}
        {frame.flatMap((row, y) => [...row].map((color, x) => color === "0" ? null : <rect key={`${x}-${y}`} x={x} y={y} width={row[x + 1] > "0" ? 1.1 : 1} height={frame[y + 1]?.[x] > "0" ? 1.1 : 1} fill={colors[Number(color)]} />))}
      </g>)}
      {tone === "frozen" && <path d="M5 3h1v4H5zM4 7h2v1H4zM10 10h1v5h-1zM9 15h2v1H9z" fill="#eefaff" />}
    </svg>
    {sparks.map(([dx, dy], index) => <i key={`${burstKey}-${index}`} className="pixelFlameSpark" style={{ "--dx": dx, "--dy": dy, "--n": index } as CSSProperties} />)}
  </span>;
}
