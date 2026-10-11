import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (used by the 21st.dev components). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
