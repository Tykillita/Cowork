import { useState, type CSSProperties, type ElementType, type ImgHTMLAttributes, type ReactNode } from "react";

type Size = number | string;
const toCss = (value?: Size) => typeof value === "number" ? `${value}px` : value;

/**
 * One shimmering block. By default it is a text line sized by the surrounding
 * font, so dropping it where the text goes keeps the same line height.
 */
export function Sk({ w, h, r, shape = "line", inline = false, className = "" }: {
  w?: Size;
  h?: Size;
  r?: Size;
  shape?: "line" | "block" | "circle" | "pill";
  inline?: boolean;
  className?: string;
}) {
  const style = { "--w": toCss(w), "--h": toCss(h), "--r": toCss(r) } as CSSProperties;
  const classes = ["sk", `sk-${shape}`, inline && "skInline", className].filter(Boolean).join(" ");
  return <span className={classes} style={style} aria-hidden="true" />;
}

/** A paragraph: full lines with a shorter last one. */
export function SkText({ lines = 2, widths = [], className = "" }: { lines?: number; widths?: Size[]; className?: string }) {
  return <span className={`skStack${className ? ` ${className}` : ""}`} aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => <Sk key={index} w={widths[index] ?? (index === lines - 1 && lines > 1 ? "62%" : "100%")} />)}
  </span>;
}

/**
 * The loading region. Give it the real layout classes of the content it stands
 * in for (`className`) and the element it replaces (`as`).
 */
export function SkGroup({ label, as: Tag = "div", className = "", children }: { label: string; as?: ElementType; className?: string; children?: ReactNode }) {
  return <Tag className={`skGroup${className ? ` ${className}` : ""}`} role="status" aria-busy="true" aria-label={label}>{children}</Tag>;
}

/** An image that shimmers in its own box until it has loaded (or failed). */
export function SkImg({ src, className = "", onLoad, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [settled, setSettled] = useState("");
  const classes = [className, settled === src ? "" : "skImg"].filter(Boolean).join(" ");
  return <img {...rest} src={src} className={classes || undefined}
    onLoad={(event) => { setSettled(src); onLoad?.(event); }}
    onError={(event) => { setSettled(src); onError?.(event); }} />;
}

/** `count` copies of a skeleton row. */
export function repeat(count: number, render: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => render(index));
}
