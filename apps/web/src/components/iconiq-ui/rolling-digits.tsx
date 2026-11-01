// Source: Rolling Digits by edwinvakayil (iconiq ui), published on 21st.dev by its author; trimmed and adapted for DocStruct.
/**
 * In DocStruct
 *   A number whose digits roll into place like an odometer the first time it scrolls into view.
 *   Used by: pages/landing/LandingPage.tsx (the numbers under the hero). It only affects appearance; no feature logic.
 *
 * How it works
 *   - RollingDigits shows zeros until the number is 60% visible, then switches to the real value once.
 *   - The text is split into cells keyed by their position from the right, so "0" becoming "148" adds
 *     the new digits on the left and each existing cell rolls from its old digit to its new one.
 *   - DigitCell springs the new digit in (y, opacity, scale) and lets the old one fly out the other way.
 *   - Screen readers get the plain number from a visually hidden span.
 */
import { AnimatePresence, motion, useInView, useSpring } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DIGIT = /\d/;
const ENTER_Y = 32;
let exitId = 0;

interface Cell {
  key: string;
  char: string;
  isDigit: boolean;
}

/** Splits "1,148" into cells; digits are keyed from the right so they keep their place as the number grows. */
function buildCells(value: string): Cell[] {
  const chars = value.split('');
  let fromRight = 0;
  const rightIndex = new Array<number>(chars.length).fill(-1);
  for (let i = chars.length - 1; i >= 0; i--) if (DIGIT.test(chars[i])) rightIndex[i] = fromRight++;
  return chars.map((char, i) => {
    const isDigit = DIGIT.test(char);
    if (isDigit) return { key: `d${rightIndex[i]}`, char, isDigit };
    // A separator takes the key of the digit to its right, so "1,148" keeps its comma in place.
    const next = rightIndex.findIndex((r, j) => j > i && r >= 0);
    return { key: next >= 0 ? `s${rightIndex[next]}` : `s-l${i}`, char, isDigit };
  });
}

function DigitCell({ char, isDigit, className }: Omit<Cell, 'key'> & { className?: string }) {
  const [exits, setExits] = useState<Array<{ id: number; char: string; y: number }>>([]);
  const prev = useRef(char);
  const first = useRef(true);
  const spring = { stiffness: 170, damping: 12 };
  const y = useSpring(0, spring);
  const opacity = useSpring(1, spring);
  const scale = useSpring(1, spring);

  useEffect(() => {
    if (!isDigit) return;
    const before = prev.current;
    prev.current = char;
    if (first.current) {
      first.current = false;
      return;
    }
    if (char === before || !DIGIT.test(before)) return;
    // A bigger digit comes up from below; a smaller one drops in from above.
    const up = Number(char) > Number(before);
    setExits((q) => [...q, { id: exitId++, char: before, y: up ? -ENTER_Y : ENTER_Y }]);
    y.jump(up ? ENTER_Y : -ENTER_Y);
    opacity.jump(0);
    scale.jump(0.84);
    y.set(0);
    opacity.set(1);
    scale.set(1);
  }, [char, isDigit, opacity, scale, y]);

  if (!isDigit) return <span className={className}>{char}</span>;
  return (
    <span className={cn('relative isolate grid min-w-[1ch] place-items-center overflow-hidden leading-none [&>*]:col-start-1 [&>*]:row-start-1', className)}>
      <AnimatePresence>
        {exits.map((e) => (
          <motion.span
            key={e.id}
            aria-hidden
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={{ opacity: 0, scale: 0.84, y: e.y }}
            transition={{ type: 'spring', stiffness: 170, damping: 15 }}
            onAnimationComplete={() => setExits((q) => q.filter((x) => x.id !== e.id))}
          >
            {e.char}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span style={{ opacity, scale, y }}>{char}</motion.span>
    </span>
  );
}

export interface RollingDigitsProps {
  value: number;
  className?: string;
  digitClassName?: string;
  /** Wait until the number scrolls into view before rolling up from zero (default true). */
  startOnView?: boolean;
}

export function RollingDigits({ value, className, digitClassName, startOnView = true }: RollingDigitsProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const armed = !startOnView || inView;
  const text = (armed ? Math.round(value) : 0).toLocaleString('en-US');
  const cells = useMemo(() => buildCells(text), [text]);

  return (
    <span ref={ref} className={cn('inline-flex items-center tabular-nums', className)}>
      <span className="sr-only">{Math.round(value).toLocaleString('en-US')}</span>
      <span aria-hidden className="inline-flex items-center gap-[2px]">
        <AnimatePresence initial={false}>
          {cells.map((c) => (
            <motion.span
              key={c.key}
              className="inline-flex"
              // New digits on the left (0 becoming 148) rise in; existing ones roll inside DigitCell.
              initial={c.isDigit ? { opacity: 0, y: ENTER_Y } : { opacity: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={c.isDigit ? { opacity: 0, y: -ENTER_Y } : { opacity: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 15 }}
            >
              <DigitCell char={c.char} isDigit={c.isDigit} className={digitClassName} />
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}
