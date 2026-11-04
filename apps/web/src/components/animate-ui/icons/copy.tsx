// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "copy" icon, exported as CopyIcon through components/icons.ts. Like every icon here it stays
 *   still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on hover") and
 *   plays its motion only when a component passes `animate`. Nothing passes `animate` to it today, so it
 *   always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks "copy to clipboard" for a share link and for the version summary. Copied from animate-ui rather
 *   than drawn from scratch: it only changes how the screen looks, and every DocStruct feature is still
 *   written by the team.
 *
 * Where it fits
 *   Used by: components/SharePanel.tsx (copy link) and components/SummaryCard.tsx (copy summary).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type CopyProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    rect: {
      initial: {
        y: 0,
        x: 0,
      },
      animate: {
        y: -3,
        x: -3,
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
      },
    },
    path: {
      initial: {
        y: 0,
        x: 0,
      },
      animate: {
        y: 3,
        x: 3,
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    rect: {
      initial: {
        y: 0,
        x: 0,
      },
      animate: {
        y: [0, -3, 0],
        x: [0, -3, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
    path: {
      initial: {
        y: 0,
        x: 0,
      },
      animate: {
        y: [0, 3, 0],
        x: [0, 3, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: CopyProps) {
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
      <motion.rect
        width={14}
        height={14}
        x={8}
        y={8}
        rx={2}
        ry={2}
        variants={variants.rect}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Copy(props: CopyProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Copy,
  Copy as CopyIcon,
  type CopyProps,
  type CopyProps as CopyIconProps,
};
