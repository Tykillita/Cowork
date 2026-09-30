import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";
import gsap from "gsap";
import "./CardSwap.css";

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  skewAmount?: number;
  easing?: "linear" | "elastic";
  children: ReactNode;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div ref={ref} {...rest} className={`card ${customClass ?? ""} ${rest.className ?? ""}`.trim()} />
));
Card.displayName = "Card";

type CardRef = RefObject<HTMLDivElement | null>;
interface Slot { x: number; y: number; z: number; zIndex: number }

const makeSlot = (index: number, distanceX: number, distanceY: number, total: number): Slot => ({
  x: index * distanceX,
  y: -index * distanceY,
  z: -index * distanceX * 1.5,
  zIndex: total - index,
});

const placeNow = (element: HTMLElement, slot: Slot, skew: number) => gsap.set(element, {
  x: slot.x,
  y: slot.y,
  z: slot.z,
  xPercent: -50,
  yPercent: -50,
  skewY: skew,
  transformOrigin: "center center",
  zIndex: slot.zIndex,
  force3D: true,
});

const CardSwap: React.FC<CardSwapProps> = ({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = "elastic",
  children,
}) => {
  const config = easing === "elastic"
    ? { ease: "elastic.out(0.6,0.9)", durDrop: 2, durMove: 2, durReturn: 2, promoteOverlap: 0.9, returnDelay: 0.05 }
    : { ease: "power1.inOut", durDrop: 0.8, durMove: 0.8, durReturn: 0.8, promoteOverlap: 0.45, returnDelay: 0.2 };

  const childArray = useMemo(() => Children.toArray(children) as ReactElement<CardProps>[], [children]);
  const refs = useMemo<CardRef[]>(() => childArray.map(() => React.createRef<HTMLDivElement>()), [childArray.length]);
  const order = useRef<number[]>(Array.from({ length: childArray.length }, (_, index) => index));
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const total = refs.length;
    const elements = refs.map((reference) => reference.current).filter((element): element is HTMLDivElement => element !== null);
    if (!total || elements.length !== total) return;
    if (order.current.length !== total) order.current = Array.from({ length: total }, (_, index) => index);

    refs.forEach((reference, index) => {
      const element = reference.current;
      if (element) placeNow(element, makeSlot(index, cardDistance, verticalDistance, total), skewAmount);
    });

    if (total < 2) return () => { elements.forEach((element) => gsap.killTweensOf(element)); };

    const swap = () => {
      if (order.current.length < 2) return;
      const [front, ...rest] = order.current;
      const frontElement = refs[front]?.current;
      if (!frontElement) return;
      const backSlot = makeSlot(total - 1, cardDistance, verticalDistance, total);
      const timeline = gsap.timeline();
      timelineRef.current = timeline;

      timeline.to(frontElement, { y: "+=500", duration: config.durDrop, ease: config.ease });
      timeline.addLabel("promote", `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((index, slotIndex) => {
        const element = refs[index]?.current;
        if (!element) return;
        const slot = makeSlot(slotIndex, cardDistance, verticalDistance, total);
        timeline.set(element, { zIndex: slot.zIndex }, "promote");
        timeline.to(element, {
          x: slot.x, y: slot.y, z: slot.z,
          duration: config.durMove, ease: config.ease,
        }, `promote+=${slotIndex * 0.15}`);
      });

      timeline.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
      timeline.call(() => { gsap.set(frontElement, { zIndex: backSlot.zIndex }); }, undefined, "return");
      timeline.to(frontElement, {
        x: backSlot.x, y: backSlot.y, z: backSlot.z,
        duration: config.durReturn, ease: config.ease,
      }, "return");
      timeline.call(() => { order.current = [...rest, front]; });
    };

    const node = containerRef.current;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hovered = false;
    let onScreen = true;
    let paused = true;
    let reducedBefore = motionQuery.matches || document.documentElement.dataset.motion === "reduced";
    const sync = () => {
      const reduced = motionQuery.matches || document.documentElement.dataset.motion === "reduced";
      if (reduced && !reducedBefore) timelineRef.current?.progress(1).pause();
      reducedBefore = reduced;
      const stop = (pauseOnHover && hovered) || !onScreen || document.hidden || reduced;
      if (stop === paused) return;
      paused = stop;
      if (stop) {
        timelineRef.current?.pause();
        window.clearInterval(intervalRef.current);
      } else {
        if (timelineRef.current) timelineRef.current.play();
        else swap();
        intervalRef.current = window.setInterval(swap, delay);
      }
    };
    const pause = () => { hovered = true; sync(); };
    const resume = () => { hovered = false; sync(); };

    if (pauseOnHover && node) {
      node.addEventListener("mouseenter", pause);
      node.addEventListener("mouseleave", resume);
    }
    const intersectionObserver = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    if (node) intersectionObserver.observe(node);
    const motionObserver = new MutationObserver(sync);
    motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    document.addEventListener("visibilitychange", sync);
    motionQuery.addEventListener("change", sync);
    sync();

    return () => {
      if (node && pauseOnHover) {
        node.removeEventListener("mouseenter", pause);
        node.removeEventListener("mouseleave", resume);
      }
      intersectionObserver.disconnect();
      motionObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionQuery.removeEventListener("change", sync);
      window.clearInterval(intervalRef.current);
      timelineRef.current?.kill();
      elements.forEach((element) => gsap.killTweensOf(element));
      timelineRef.current = null;
    };
  }, [cardDistance, verticalDistance, delay, pauseOnHover, skewAmount, easing, refs, config.durDrop, config.durMove, config.durReturn, config.ease, config.promoteOverlap, config.returnDelay]);

  const rendered = childArray.map((child, index) => isValidElement<CardProps>(child)
    ? cloneElement(child, {
        key: index,
        ref: refs[index],
        style: { width, height, ...(child.props.style ?? {}) },
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          child.props.onClick?.(event);
          onCardClick?.(index);
        },
      } as CardProps & React.RefAttributes<HTMLDivElement>)
    : child);

  return <div ref={containerRef} className="card-swap-container" style={{ width, height }}>{rendered}</div>;
};

export default CardSwap;
