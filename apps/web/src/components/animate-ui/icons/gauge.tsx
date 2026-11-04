// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "gauge" icon, exported as GaugeIcon through components/icons.ts. Like every icon here it
 *   stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on
 *   hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today. It only affects appearance.
 *
 * Why it exists
 *   Part of the icon set copied with the others for a progress or score indicator. Copied from animate-ui
 *   rather than drawn from scratch: it only changes how the screen looks, and every DocStruct feature is
 *   still written by the team.
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

type GaugeProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: 70,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
    },
    path2: {},
  } satisfies Record<string, Variants>,
  'default-loop': {
    path1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
      animate: {
        transformOrigin: 'bottom left',
        rotate: [0, 70, 0],
        transition: { ease: 'easeInOut', duration: 0.6 },
      },
    },
    path2: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: GaugeProps) {
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
        d="m12 14 4-4"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M3.34 19a10 10 0 1 1 17.32 0"
        variants={variants.path2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Gauge(props: GaugeProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Gauge,
  Gauge as GaugeIcon,
  type GaugeProps,
  type GaugeProps as GaugeIconProps,
};
