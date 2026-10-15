/**
 * What this file does
 *   Provides cn(), a small helper that builds the CSS class string for an element.
 *
 * How it works
 *   - clsx() joins its inputs into one string and drops false, null or undefined values,
 *     so `cn('btn', isActive && 'btn-active')` works.
 *   - twMerge() then removes Tailwind classes that clash, keeping the last one
 *     (e.g. 'p-2 p-4' becomes 'p-4'), so a caller can override a component's default style.
 *
 * Where it fits
 *   Imported by components/ui.tsx and by every copied 21st.dev component (magicui, motion-primitives,
 *   animate-ui, unlumen-ui). Module: shared core, web interface (owner: Vansh).
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (used by the 21st.dev components). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
