// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "badge-check" icon, exported as BadgeCheckIcon through components/icons.ts. Like every icon
 *   here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still
 *   on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today, so it always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks an approval, so the reviewer's Approve button and every approved outcome look the same. Copied
 *   from animate-ui rather than drawn from scratch: it only changes how the screen looks, and every DocStruct
 *   feature is still written by the team.
 *
 * Where it fits
 *   Used by: components/ReviewPanel.tsx (Approve button), components/ActivityFeed.tsx (review approved
 *   events) and pages/RemindersPage.tsx (decision reminders).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type BadgeCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.9, 1],
        transition: {
          duration: 1.2,
          ease: 'easeInOut',
        },
      },
    },
    path2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [1, 0, 1],
        transition: {
          duration: 1.2,
          ease: 'easeInOut',
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
  check: {
    path2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: BadgeCheckProps) {
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
      <motion.path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m9 12 2 2 4-4"
        variants={variants.path2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function BadgeCheck(props: BadgeCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  BadgeCheck,
  BadgeCheck as BadgeCheckIcon,
  type BadgeCheckProps,
  type BadgeCheckProps as BadgeCheckIconProps,
};
