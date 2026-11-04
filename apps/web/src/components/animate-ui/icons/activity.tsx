// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "activity" icon, exported as ActivityIcon through components/icons.ts. Like every icon here
 *   it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on
 *   hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today, so it always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks the project activity log (who did what, and when), so the audit trail is easy to spot from the
 *   project tabs and the dashboard. Copied from animate-ui rather than drawn from scratch: it only changes
 *   how the screen looks, and every DocStruct feature is still written by the team.
 *
 * Where it fits
 *   Used by: pages/project/ProjectLayout.tsx ("Activity" tab), pages/project/ActivityPage.tsx and
 *   pages/project/DashboardPage.tsx (activity heading and empty states), and components/ActivityFeed.tsx
 *   (fallback icon for other events).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ActivityProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        opacity: 1,
        pathLength: 1,
        pathOffset: 0,
      },
      animate: {
        opacity: [0, 1],
        pathLength: [0, 1],
        pathOffset: [1, 0],
        transition: {
          duration: 0.8,
          ease: 'easeInOut',
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
  'default-return': {
    path: {
      initial: {
        opacity: 1,
        pathLength: 1,
        pathOffset: 0,
      },
      animate: {
        opacity: [0, 1, 1, 1],
        pathLength: [0, 1, 0, 1],
        pathOffset: [1, 0, 0.01, 0],
        transition: {
          duration: 2.5,
          ease: 'easeInOut',
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    path: {
      initial: {
        opacity: 1,
        pathLength: 1,
        pathOffset: 0,
      },
      animate: {
        opacity: [0, 1, 1, 1, 1],
        pathLength: [0, 1, 0, 1, 0],
        pathOffset: [1, 0, 0.01, 0, 0.999],
        transition: {
          duration: 3,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
          opacity: { duration: 0.01 },
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ActivityProps) {
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
        d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Activity(props: ActivityProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Activity,
  Activity as ActivityIcon,
  type ActivityProps,
  type ActivityProps as ActivityIconProps,
};
