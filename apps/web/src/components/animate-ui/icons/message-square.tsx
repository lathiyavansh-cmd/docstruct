// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "message-square" icon, exported as MessageSquareIcon through components/icons.ts. Like every
 *   icon here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay
 *   still on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to
 *   it today, so it always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks comments (annotations) on a document. Copied from animate-ui rather than drawn from scratch: it
 *   only changes how the screen looks, and every DocStruct feature is still written by the team.
 *
 * Where it fits
 *   Used by: pages/DocumentPage.tsx ("Comments" tab), components/AnnotationsPanel.tsx (add comment),
 *   pages/project/DashboardPage.tsx ("Open comments" card) and components/ActivityFeed.tsx (comment events).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type MessageSquareProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        rotate: 0,
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: [0, 8, -8, 2, 0],
        transition: {
          ease: 'easeInOut',
          duration: 0.8,
          times: [0, 0.4, 0.6, 0.8, 1],
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: MessageSquareProps) {
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
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function MessageSquare(props: MessageSquareProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  MessageSquare,
  MessageSquare as MessageSquareIcon,
  type MessageSquareProps,
  type MessageSquareProps as MessageSquareIconProps,
};
