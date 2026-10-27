// Source: motion-primitives (ibelick), https://motion-primitives.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * In DocStruct
 *   A blurred circle of light that follows the mouse inside its parent element and hides when the mouse leaves.
 *   Used by: pages/auth/AuthLayout.tsx (the login and sign-up screens). It only affects appearance; no feature logic.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useSpring, useTransform, type SpringOptions } from 'motion/react';
import { cn } from '@/lib/utils';

export type SpotlightProps = {
  className?: string;
  size?: number;
  springOptions?: SpringOptions;
};

export function Spotlight({
  className,
  size = 200,
  // DocStruct: a soft spring so the light glides after the pointer instead of snapping to it.
  springOptions = { stiffness: 80, damping: 20, mass: 0.8 },
}: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [parentElement, setParentElement] = useState<HTMLElement | null>(null);

  const mouseX = useSpring(0, springOptions);
  const mouseY = useSpring(0, springOptions);

  const spotlightLeft = useTransform(mouseX, (x) => `${x - size / 2}px`);
  const spotlightTop = useTransform(mouseY, (y) => `${y - size / 2}px`);

  useEffect(() => {
    if (containerRef.current) {
      const parent = containerRef.current.parentElement;
      if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'hidden';
        setParentElement(parent);
      }
    }
  }, []);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!parentElement) return;
      const { left, top } = parentElement.getBoundingClientRect();
      mouseX.set(event.clientX - left);
      mouseY.set(event.clientY - top);
    },
    [mouseX, mouseY, parentElement]
  );

  useEffect(() => {
    if (!parentElement) return;

    const abortController = new AbortController();

    parentElement.addEventListener('mousemove', handleMouseMove, {
      signal: abortController.signal,
    });
    parentElement.addEventListener('mouseenter', () => setIsHovered(true), {
      signal: abortController.signal,
    });
    parentElement.addEventListener('mouseleave', () => setIsHovered(false), {
      signal: abortController.signal,
    });

    return () => {
      abortController.abort();
    };
  }, [parentElement, handleMouseMove]);

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        'pointer-events-none absolute rounded-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops),transparent_80%)] blur-xl transition-opacity duration-700',
        'from-zinc-100 via-zinc-200 to-zinc-400 dark:from-zinc-50 dark:via-zinc-100 dark:to-zinc-200',
        isHovered ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{
        width: size,
        height: size,
        left: spotlightLeft,
        top: spotlightTop,
      }}
    />
  );
}
