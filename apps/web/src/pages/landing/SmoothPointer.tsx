/**
 * What this file does
 *   Two small pointer effects for the overview page: a soft ring that trails the cursor (CursorRing) and a
 *   wrapper that lets a button lean gently towards the pointer (Magnetic).
 *
 * How it works
 *   - CursorRing listens to pointer moves on the window and feeds them into springs, so the ring glides
 *     after the cursor instead of sticking to it. Over links, buttons and tabs it grows and fills softly.
 *     The normal cursor stays visible; the ring sits on top and ignores clicks.
 *   - Magnetic measures how far the pointer is from the centre of its child and moves the child a fraction
 *     of that distance with a spring, then lets it settle back when the pointer leaves.
 *   - Both switch themselves off on touch screens and for people who ask their system for less motion.
 *
 * Where it fits
 *   Used by pages/landing/LandingPage.tsx. Appearance only; no feature logic. Module: app shell / landing page (owner: Vansh).
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion, useSpring } from 'motion/react';
import { cx } from '../../components/ui';

const INTERACTIVE = 'a, button, [role="tab"], input, summary, label';

/** True when the device has a precise pointer (a mouse or trackpad) and motion is welcome. */
function useFinePointer() {
  const reduceMotion = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    setFine(query.matches);
    const update = () => setFine(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return fine && !reduceMotion;
}

export function CursorRing() {
  const enabled = useFinePointer();
  const spring = { stiffness: 380, damping: 32, mass: 0.5 };
  const x = useSpring(-100, spring);
  const y = useSpring(-100, spring);
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const move = (e: globalThis.PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      setHovering(!!(e.target as Element | null)?.closest?.(INTERACTIVE));
    };
    const leave = () => setVisible(false);
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <motion.div aria-hidden className="pointer-events-none fixed left-0 top-0 z-[60]" style={{ x, y }}>
      <motion.div
        // No backdrop blur here: blurring what is behind a moving element costs a repaint on every frame.
        className="rounded-full border border-violet/50"
        style={{ translateX: '-50%', translateY: '-50%' }}
        animate={{
          width: hovering ? 46 : 28,
          height: hovering ? 46 : 28,
          opacity: visible ? 1 : 0,
          scale: pressed ? 0.85 : 1,
          backgroundColor: hovering ? 'rgb(85 77 222 / 0.12)' : 'rgb(85 77 222 / 0.05)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.6 }}
      />
    </motion.div>
  );
}

export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const enabled = useFinePointer();
  const ref = useRef<HTMLDivElement>(null);
  const spring = { stiffness: 220, damping: 18, mass: 0.5 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);

  function move(e: PointerEvent) {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function leave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} style={{ x, y }} className={cx('inline-flex', className)}>
      {children}
    </motion.div>
  );
}
