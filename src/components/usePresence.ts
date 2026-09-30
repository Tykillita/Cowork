import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a popover mounted while its exit animation plays. `closing` is true from
 * the moment `open` turns false until every animation on `ref` has finished (the
 * CSS keys the exit keyframes off it); with no animation, e.g. reduced motion,
 * it unmounts on the next frame. Reopening mid-exit simply cancels the unmount.
 */
export function usePresence<T extends HTMLElement>(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const ref = useRef<T>(null);

  useLayoutEffect(() => { if (open) setMounted(true); }, [open]);

  useEffect(() => {
    if (open || !mounted) return;
    const element = ref.current;
    if (!element) { setMounted(false); return; }
    // Flush styles so the exit animation exists before collecting it.
    void window.getComputedStyle(element).opacity;
    let active = true;
    void Promise.allSettled(element.getAnimations().map((animation) => animation.finished)).then(() => {
      if (active) setMounted(false);
    });
    return () => { active = false; };
  }, [open, mounted]);

  return { mounted, closing: mounted && !open, ref };
}
