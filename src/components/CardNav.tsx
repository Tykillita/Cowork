import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const GoArrowUpRight = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M7 17 17 7M8 7h9v9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export type CardNavLink = {
  label: string;
  href: string;
  ariaLabel: string;
};

export type CardNavItem = {
  label: string;
  bgColor: string;
  textColor: string;
  links: CardNavLink[];
};

export interface CardNavProps {
  logo: string;
  logoAlt?: string;
  items: CardNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  menuColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  buttonLabel?: string;
  mobileButtonLabel?: string;
  activeHref?: string;
  onNavigate?: (href: string) => void;
  /** Open and close instantly (personal preference or system setting). */
  reducedMotion?: boolean;
}

const CLOSED_HEIGHT = 60;

const CardNav: React.FC<CardNavProps> = ({
  logo,
  logoAlt = 'Logo',
  items,
  className = '',
  ease = 'power3.out',
  baseColor = '#fff',
  menuColor,
  buttonBgColor,
  buttonTextColor,
  buttonLabel = 'Resumen',
  mobileButtonLabel,
  activeHref,
  onNavigate,
  reducedMotion = false,
}) => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);
  const hamburgerRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  // The open/closed intent, readable from GSAP callbacks and listeners without stale closures.
  const openRef = useRef(false);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const visibleCards = (items || []).slice(0, 3);

  const calculateHeight = useCallback(() => {
    const navEl = navRef.current;
    if (!navEl) return 260;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      const contentEl = navEl.querySelector('.card-nav-content') as HTMLElement;
      if (contentEl) {
        const wasVisible = contentEl.style.visibility;
        const wasPointerEvents = contentEl.style.pointerEvents;
        const wasPosition = contentEl.style.position;
        const wasHeight = contentEl.style.height;

        contentEl.style.visibility = 'visible';
        contentEl.style.pointerEvents = 'auto';
        contentEl.style.position = 'static';
        contentEl.style.height = 'auto';
        void contentEl.offsetHeight;

        const topBar = 60;
        const padding = 16;
        const contentHeight = contentEl.scrollHeight;

        contentEl.style.visibility = wasVisible;
        contentEl.style.pointerEvents = wasPointerEvents;
        contentEl.style.position = wasPosition;
        contentEl.style.height = wasHeight;

        return topBar + contentHeight + padding;
      }
    }
    return 260;
  }, []);

  const createTimeline = useCallback(() => {
    const navEl = navRef.current;
    if (!navEl) return null;
    const cards = cardsRef.current.filter(Boolean);

    gsap.set(navEl, { height: CLOSED_HEIGHT, overflow: 'hidden' });
    gsap.set(cards, { y: 50, opacity: 0 });

    const timeline = gsap.timeline({
      paused: true,
      onReverseComplete: () => {
        // Only settle as closed if nobody reopened the menu during the reverse.
        if (!openRef.current) setIsExpanded(false);
      },
    });
    timeline.to(navEl, { height: calculateHeight, duration: 0.4, ease });
    timeline.to(cards, { y: 0, opacity: 1, duration: 0.4, ease, stagger: 0.08 }, '-=0.1');
    return timeline;
  }, [calculateHeight, ease]);

  /** Rebuilds the timeline (new measurements) keeping the current open or closed state. */
  const rebuildTimeline = useCallback(() => {
    tlRef.current?.kill();
    const timeline = createTimeline();
    if (timeline && openRef.current) timeline.progress(1);
    tlRef.current = timeline;
  }, [createTimeline]);

  const cardsKey = visibleCards.map(item => `${item.label}:${item.links.map(link => link.href).join(',')}`).join('|');

  useLayoutEffect(() => {
    rebuildTimeline();
    return () => {
      tlRef.current?.kill();
      tlRef.current = null;
    };
  }, [rebuildTimeline, cardsKey]);

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(rebuildTimeline);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, [rebuildTimeline]);

  // If the preference changes during an opening or closing tween, settle the
  // menu in its requested state instead of leaving the cards half revealed.
  useEffect(() => {
    if (!reducedMotion) return;
    tlRef.current?.progress(openRef.current ? 1 : 0).pause();
    if (!openRef.current) setIsExpanded(false);
  }, [reducedMotion]);

  const openMenu = useCallback(() => {
    const timeline = tlRef.current;
    if (!timeline || openRef.current) return;
    openRef.current = true;
    setIsHamburgerOpen(true);
    setIsExpanded(true);
    // Measure again when starting from closed so late layout changes are respected.
    if (timeline.progress() === 0) timeline.invalidate();
    if (reducedRef.current) timeline.progress(1).pause();
    else timeline.play();
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    const timeline = tlRef.current;
    if (!timeline || !openRef.current) return;
    openRef.current = false;
    setIsHamburgerOpen(false);
    if (reducedRef.current || timeline.progress() === 0) {
      timeline.progress(0).pause();
      setIsExpanded(false);
    } else timeline.reverse();
    if (restoreFocus) hamburgerRef.current?.focus();
  }, []);

  const toggleMenu = () => {
    if (openRef.current) closeMenu();
    else openMenu();
  };

  useEffect(() => {
    if (!isHamburgerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeMenu, isHamburgerOpen]);

  const setCardRef = (index: number) => (element: HTMLDivElement | null) => {
    if (element) cardsRef.current[index] = element;
    else delete cardsRef.current[index];
  };

  const navigate = (href: string, event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    closeMenu();
    onNavigate?.(href);
  };

  return (
    <div className={`card-nav-container ${className}`}>
      <nav ref={navRef} aria-label="Navegación principal" className={`card-nav ${isExpanded ? 'open' : ''}`} style={{ backgroundColor: baseColor }}>
        <div className="card-nav-top">
          <div
            ref={hamburgerRef}
            className={`hamburger-menu ${isHamburgerOpen ? 'open' : ''}`}
            onClick={toggleMenu}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleMenu();
              }
            }}
            role="button"
            aria-label={isHamburgerOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isHamburgerOpen}
            aria-controls="card-nav-content"
            tabIndex={0}
            style={{ color: menuColor || '#000' }}
          >
            <div className="hamburger-line" />
            <div className="hamburger-line" />
          </div>

          <div className="logo-container">
            <img src={logo} alt={logoAlt} className="logo" />
          </div>

          <button
            type="button"
            className="card-nav-cta-button"
            style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
            onClick={event => navigate('/resumen', event)}
            aria-current={activeHref === '/resumen' ? 'page' : undefined}
          >
            {mobileButtonLabel ? (
              <>
                <span className="card-nav-cta-desktop-label">{buttonLabel}</span>
                <span className="card-nav-cta-mobile-label">{mobileButtonLabel}</span>
              </>
            ) : buttonLabel}
          </button>
        </div>

        {/* Closed or closing links stay out of the tab order and the accessibility tree. */}
        <div className="card-nav-content" id="card-nav-content" aria-hidden={!isHamburgerOpen} inert={!isHamburgerOpen}>
          {visibleCards.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="nav-card"
              ref={setCardRef(index)}
              style={{ backgroundColor: item.bgColor, color: item.textColor }}
            >
              <div className="nav-card-label">{item.label}</div>
              <div className="nav-card-links">
                {item.links?.map((link, linkIndex) => (
                  <a
                    key={`${link.label}-${linkIndex}`}
                    className="nav-card-link"
                    href={link.href}
                    aria-label={link.ariaLabel}
                    aria-current={activeHref === link.href ? 'page' : undefined}
                    onClick={event => navigate(link.href, event)}
                  >
                    <GoArrowUpRight className="nav-card-link-icon" aria-hidden="true" />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default CardNav;
