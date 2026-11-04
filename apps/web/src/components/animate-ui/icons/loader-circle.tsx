// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "loader-circle" icon, exported as LoaderCircleIcon through components/icons.ts. Like every
 *   icon here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay
 *   still on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to
 *   it today. It only affects appearance.
 *
 * Why it exists
 *   Part of the icon set copied with the others for a loading spinner. Copied from animate-ui rather than
 *   drawn from scratch: it only changes how the screen looks, and every DocStruct feature is still written by
 *   the team.
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

type LoaderCircleProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0 },
      animate: {
        rotate: 360,
        transition: {
          duration: 1,
          ease: 'linear',
          repeat: Infinity,
          repeatType: 'loop',
        },
      },
    },
    path: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: LoaderCircleProps) {
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
      variants={variants.group}
      initial="initial"
      animate={controls}
      {...props}
    >
      <motion.path
        d="M21 12a9 9 0 1 1-6.219-8.56"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function LoaderCircle(props: LoaderCircleProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  LoaderCircle,
  LoaderCircle as LoaderCircleIcon,
  type LoaderCircleProps,
  type LoaderCircleProps as LoaderCircleIconProps,
};
