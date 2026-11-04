// Source: animate-ui (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   A small React hook that reports whether an element is currently visible on screen, so an animation can
 *   start only when the user scrolls to it.
 *
 * Why it exists
 *   icon.tsx calls it for its scroll-into-view trigger (`animateOnView`) and uses the ref it returns on every
 *   AnimateIcon, so icon.tsx cannot work without it, even though no DocStruct page turns that trigger on
 *   today. The team writes every feature itself (the professor's no-external-API rule); this open-source
 *   piece only affects looks, so it was copied in rather than built from scratch.
 *
 * Where it fits
 *   Used by: components/animate-ui/icons/icon.tsx. It only affects appearance; no feature logic.
 */
import * as React from 'react';
import { useInView, type UseInViewOptions } from 'motion/react';

interface UseIsInViewOptions {
  inView?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: UseInViewOptions['margin'];
}

function useIsInView<T extends HTMLElement = HTMLElement>(
  ref: React.Ref<T>,
  options: UseIsInViewOptions = {},
) {
  const { inView, inViewOnce = false, inViewMargin = '0px' } = options;
  const localRef = React.useRef<T>(null);
  React.useImperativeHandle(ref, () => localRef.current as T);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;
  return { ref: localRef, isInView };
}

export { useIsInView, type UseIsInViewOptions };
