// Source: Timeline by Aceternity UI (manuarora700), published on 21st.dev by its author; adapted for DocStruct.
/**
 * In DocStruct
 *   A vertical timeline whose line fills with colour as the page scrolls past it; each step's title sticks
 *   beside its content while you read it.
 *   Used by: pages/landing/LandingPage.tsx ("How a document moves"). It only affects appearance; no feature logic.
 *
 * How it works
 *   - useScroll() tracks how far the list has scrolled through the viewport (0 to 1).
 *   - The coloured bar's height follows that progress; a ResizeObserver keeps the full height current.
 *   - A step's dot lights up once the bar has reached it.
 */
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineEntry {
  /** Small label above the title, e.g. "Step 1". */
  label: string;
  title: string;
  content: ReactNode;
}

export function Timeline({ data, className }: { data: TimelineEntry[]; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [reached, setReached] = useState(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 60%', 'end 60%'] });
  const barHeight = useTransform(scrollYProgress, [0, 1], [0, height]);
  const barOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);
  // How many steps the bar has passed, so their dots can light up.
  useMotionValueEvent(scrollYProgress, 'change', (p) => setReached(Math.floor(p * data.length + 0.35)));

  return (
    <div ref={listRef} className={cn('relative', className)}>
      {data.map((item, i) => (
        <div key={item.title} className="flex justify-start pt-10 md:gap-10 md:pt-24">
          <div className="sticky top-32 z-10 flex max-w-xs flex-col items-center self-start md:w-full md:flex-row lg:max-w-sm">
            <div className="absolute left-3 flex size-10 items-center justify-center rounded-full bg-paper">
              <motion.div
                animate={i < reached ? { scale: 1.15, backgroundColor: '#554dde' } : { scale: 1, backgroundColor: '#e3e5ec' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="size-4 rounded-full ring-4 ring-paper"
              />
            </div>
            <div className="hidden md:block md:pl-20">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-violet">{item.label}</p>
              <h3 className="mt-1 font-serif text-3xl text-ink lg:text-4xl">{item.title}</h3>
            </div>
          </div>
          <div className="relative w-full pl-20 pr-2 md:pl-4">
            <div className="mb-4 md:hidden">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-violet">{item.label}</p>
              <h3 className="mt-1 font-serif text-2xl text-ink">{item.title}</h3>
            </div>
            {item.content}
          </div>
        </div>
      ))}
      <div
        style={{ height }}
        className="absolute left-8 top-0 w-[2px] overflow-hidden bg-gradient-to-b from-transparent via-rule-strong to-transparent [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)]"
        aria-hidden
      >
        <motion.div
          style={{ height: barHeight, opacity: barOpacity }}
          className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-violet via-primary to-transparent"
        />
      </div>
    </div>
  );
}
