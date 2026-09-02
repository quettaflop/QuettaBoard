import { useEffect, useRef } from 'react';

/**
 * A soft light that trails the cursor through the background layer.
 *
 * It sits at negative z-index — beneath every panel — so the glass above it
 * blurs and refracts the light as it passes underneath, which is what sells it
 * as illumination rather than a decal stuck to the pointer. The trailing lerp
 * is the same idea in time: a light source drifts after the hand, it does not
 * snap.
 *
 * DOM is driven directly from a rAF loop (no React state), and the loop parks
 * itself whenever the glow has settled, so an idle page spends nothing.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A moving light is motion; a coarse pointer has no cursor to follow.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const pos = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
    const target = { ...pos };
    let opacity = 0;
    let targetOpacity = 0;
    let raf = 0;
    let running = false;

    const tick = () => {
      pos.x += (target.x - pos.x) * 0.09;
      pos.y += (target.y - pos.y) * 0.09;
      opacity += (targetOpacity - opacity) * 0.08;
      el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      el.style.opacity = opacity.toFixed(3);

      const settled =
        Math.abs(target.x - pos.x) < 0.5 &&
        Math.abs(target.y - pos.y) < 0.5 &&
        Math.abs(targetOpacity - opacity) < 0.004;
      if (settled) {
        running = false;
        return; // park; the next mousemove wakes the loop
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
