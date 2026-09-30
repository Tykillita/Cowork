import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type MouseEvent,
  type TouchEvent,
} from "react";

export type MorphyButtonSize = "sm" | "default" | "lg";

export interface MorphyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: MorphyButtonSize;
  dotClassName?: string;
  animate?: "normal" | "reverse";
}

const MorphyButton = forwardRef<HTMLButtonElement, MorphyButtonProps>(
  (
    {
      animate = "normal",
      children,
      className = "",
      dotClassName = "",
      onBlur,
      onFocus,
      onMouseEnter,
      onMouseLeave,
      onTouchStart,
      size = "default",
      ...props
    },
    ref,
  ) => {
    const [isActive, setIsActive] = useState(false);
    const touchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const active = animate === "reverse" ? !isActive : isActive;

    useEffect(() => () => {
      if (touchTimeout.current) clearTimeout(touchTimeout.current);
    }, []);

    function handleTouchStart(event: TouchEvent<HTMLButtonElement>) {
      onTouchStart?.(event);
      setIsActive(true);
      if (touchTimeout.current) clearTimeout(touchTimeout.current);
      touchTimeout.current = setTimeout(() => setIsActive(false), 1500);
    }

    function handleMouseEnter(event: MouseEvent<HTMLButtonElement>) {
      onMouseEnter?.(event);
      setIsActive(true);
    }

    function handleMouseLeave(event: MouseEvent<HTMLButtonElement>) {
      onMouseLeave?.(event);
      setIsActive(false);
    }

    function handleFocus(event: FocusEvent<HTMLButtonElement>) {
      onFocus?.(event);
      setIsActive(true);
    }

    function handleBlur(event: FocusEvent<HTMLButtonElement>) {
      onBlur?.(event);
      setIsActive(false);
    }

    return (
      <button
        {...props}
        ref={ref}
        className={`morphyButton morphyButton--${size} ${className}`.trim()}
        data-active={active ? "true" : "false"}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
      >
        <span className="morphyButtonBackground" aria-hidden="true" />
        <span className={`morphyButtonDot ${dotClassName}`.trim()} aria-hidden="true" />
        <span className="morphyButtonLabel">{children}</span>
      </button>
    );
  },
);

MorphyButton.displayName = "MorphyButton";

export { MorphyButton };
