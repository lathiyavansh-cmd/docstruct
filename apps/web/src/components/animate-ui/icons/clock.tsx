// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "clock" icon, exported as ClockIcon through components/icons.ts. Like every icon here it
 *   stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on
 *   hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today, so it always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks time: review due dates, overdue reminders and loading older activity. Copied from animate-ui
 *   rather than drawn from scratch: it only changes how the screen looks, and every DocStruct feature is
 *   still written by the team.
 *
 * Where it fits
 *   Used by: pages/RemindersPage.tsx (overdue reminders), pages/ReviewQueuePage.tsx (due dates),
 *   pages/project/DashboardPage.tsx (section heading) and pages/project/ActivityPage.tsx (load older
 *   entries).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ClockProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    circle: {},
    line1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
      animate: {
        transformOrigin: 'top left',
        rotate: [0, 20, 0],
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
    },
    line2: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: 360,
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ClockProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.circle
        cx={12}
        cy={12}
        r={10}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={12}
        y1={12}
        x2={16}
        y2={14}
        variants={variants.line1}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={12}
        y1={6}
        x2={12}
        y2={12}
        variants={variants.line2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Clock(props: ClockProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Clock,
  Clock as ClockIcon,
  type ClockProps,
  type ClockProps as ClockIconProps,
};
