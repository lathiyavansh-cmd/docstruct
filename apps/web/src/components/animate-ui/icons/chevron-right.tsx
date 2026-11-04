// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "chevron-right" icon, exported as ChevronRightIcon through components/icons.ts. Like every
 *   icon here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay
 *   still on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to
 *   it today. It only affects appearance.
 *
 * Why it exists
 *   Part of the icon set copied with the others for a "next / expand" arrow. Copied from animate-ui rather
 *   than drawn from scratch: it only changes how the screen looks, and every DocStruct feature is still
 *   written by the team.
 *
 * Where it fits
 *   Not used by any page at the moment; it is only re-exported from components/icons.ts so it is ready if a
 *   screen needs it.
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ChevronRightProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        x: 0,
        transition: { duration: 0.3, ease: 'easeInOut' },
      },
      animate: {
        x: 4,
        transition: { duration: 0.3, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    path: {
      initial: {
        x: 0,
      },
      animate: {
        x: [0, 4, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ChevronRightProps) {
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
        d="m9 18 6-6-6-6"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function ChevronRight(props: ChevronRightProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  type ChevronRightProps,
  type ChevronRightProps as ChevronRightIconProps,
};
