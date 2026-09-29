import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import "./ScrambledText.css";

gsap.registerPlugin(SplitText, ScrambleTextPlugin);

export interface ScrambledTextProps {
  radius?: number;
  duration?: number;
  speed?: number;
  scrambleChars?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export default function ScrambledText({
  radius = 100,
  duration = 1.2,
  speed = 0.5,
  scrambleChars = ".:",
  className = "",
  style,
  children,
}: ScrambledTextProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const element = rootRef.current;
    if (!wrapper || !element || radius <= 0) return;

    let split: SplitText | undefined;
    let chars: HTMLElement[] = [];

    const rebuildSplit = () => {
      chars.forEach((char) => gsap.killTweensOf(char));
      split?.revert();
      split = SplitText.create(element, {
        // Let the browser lay out whole words at the current responsive width.
        // SplitText's line wrappers can freeze a single desktop line on Safari
        // after the viewport changes, causing the heading to overflow on phones.
        type: "words,chars",
        wordsClass: "scrambled-text-word",
        charsClass: "scrambled-text-char",
        tag: "span",
        aria: "none",
      });
      chars = split.chars as HTMLElement[];

      chars.forEach((char) => {
        char.dataset.content = char.textContent ?? "";
        const width = char.getBoundingClientRect().width;
        if (width > 0) char.style.width = `${width}px`;
      });
    };

    rebuildSplit();
    const resizeObserver = new ResizeObserver(rebuildSplit);
    resizeObserver.observe(wrapper);

    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      chars.forEach((char) => {
        const { left, top, width, height } = char.getBoundingClientRect();
        const dx = event.clientX - (left + width / 2);
        const dy = event.clientY - (top + height / 2);
        const distance = Math.hypot(dx, dy);

        if (distance < radius) {
          gsap.to(char, {
            overwrite: true,
            duration: duration * (1 - distance / radius),
            scrambleText: {
              text: char.dataset.content ?? "",
              chars: scrambleChars,
              speed,
            },
            ease: "none",
          });
        }
      });
    };

    wrapper.addEventListener("pointermove", handleMove);

    return () => {
      wrapper.removeEventListener("pointermove", handleMove);
      resizeObserver.disconnect();
      chars.forEach((char) => gsap.killTweensOf(char));
      split?.revert();
    };
  }, [duration, radius, scrambleChars, speed]);

  return (
    <span ref={wrapperRef} className={`scrambled-text${className ? ` ${className}` : ""}`} style={style}>
      <span className="scrambled-text-accessible">{children}</span>
      <span className="scrambled-text-layout" aria-hidden="true">{children}</span>
      <span ref={rootRef} className="scrambled-text-animated" aria-hidden="true">{children}</span>
    </span>
  );
}
