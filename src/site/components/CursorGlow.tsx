import { useEffect, useRef } from 'react';

/**
 * Hex reticle that trails the pointer under the glass.
 *
 * Same parked-rAF loop as before. Snappier lerp, smaller, one brass channel —
 * a scope probe rather than a teal wash.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const pos = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
    const target = { ...pos };
    let opacity = 0;
    let targetOpacity = 0;
    let raf = 0;
    let running = false;

    const tick = () => {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      opacity += (targetOpacity - opacity) * 0.14;
      el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      el.style.opacity = opacity.toFixed(3);

      const settled =
        Math.abs(target.x - pos.x) < 0.5 &&
        Math.abs(target.y - pos.y) < 0.5 &&
        Math.abs(targetOpacity - opacity) < 0.004;
      if (settled) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      targetOpacity = 1;
      wake();
    };
    const onLeave = () => {
      targetOpacity = 0;
      wake();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="cursor-glow" />;
}
