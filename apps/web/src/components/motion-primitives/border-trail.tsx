// Source: motion-primitives (ibelick), https://motion-primitives.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   Draws a glowing dot that runs around the border of a box in a loop.
 *
 * Why it exists
 *   While a file is dragged over the upload drop zone, the moving border tells the user that letting go here
 *   will drop the file. The team writes every feature itself (the professor's no-external-API rule); this
 *   open-source piece only affects looks, so it was copied in rather than built from scratch.
 *
 * Where it fits
 *   Used by: components/UploadDialog.tsx (shown while a file is dragged over the drop zone). It only affects
 *   appearance; no feature logic.
 */
import { cn } from '@/lib/utils';
import { motion, type Transition } from 'motion/react';

export type BorderTrailProps = {
  className?: string;
  size?: number;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
};

export function BorderTrail({
  className,
  size = 60,
  transition,
  onAnimationComplete,
  style,
}: BorderTrailProps) {
  const defaultTransition: Transition = {
    repeat: Infinity,
    duration: 5,
    ease: 'linear',
  };

  return (
    <div className='pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]'>
      <motion.div
        className={cn('absolute aspect-square bg-zinc-500', className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          ...style,
        }}
        animate={{
          offsetDistance: ['0%', '100%'],
        }}
        transition={transition || defaultTransition}
        onAnimationComplete={onAnimationComplete}
      />
    </div>
  );
}
