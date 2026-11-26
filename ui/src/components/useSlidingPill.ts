import { useLayoutEffect, useRef } from 'react';

/**
 * Moves one shared white pill under whichever child is selected, so switching tabs
 * glides instead of jumping. Writes --pill-x/y/w/h on the container; CSS draws it.
 */
export function useSlidingPill<T extends HTMLElement>(selector: string, key: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>(selector);
      if (!on) {
        el.style.setProperty('--pill-w', '0px');
        return;
      }
      el.style.setProperty('--pill-x', `${on.offsetLeft}px`);
      el.style.setProperty('--pill-y', `${on.offsetTop}px`);
      el.style.setProperty('--pill-w', `${on.offsetWidth}px`);
      el.style.setProperty('--pill-h', `${on.offsetHeight}px`);
      // First placement should not animate in from the left edge.
      requestAnimationFrame(() => el.classList.add('pill-ready'));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selector, key]);
  return ref;
}
