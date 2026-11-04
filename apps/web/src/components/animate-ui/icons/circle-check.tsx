// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "circle-check" icon, exported as CircleCheckIcon through components/icons.ts. Like every
 *   icon here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay
 *   still on hover") and plays its motion only when a component passes `animate`. UploadDialog.tsx passes
 *   `animate`, so it draws itself once when the file is chosen. It only affects appearance.
 *
 * Why it exists
 *   It tells the user that a file has been picked and is ready to upload. Copied from animate-ui rather than
 *   drawn from scratch: it only changes how the screen looks, and every DocStruct feature is still written by
 *   the team.
 *
 * Where it fits
 *   Used by: components/UploadDialog.tsx (shown in the drop zone once a file is chosen).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type CircleCheckProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    circle: {},
    path: {
      initial: {
        pathLength: 1,
        opacity: 1,
        scale: 1,
      },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        scale: [1, 1.1, 1],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: CircleCheckProps) {
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
        cx="12"
        cy="12"
        r="10"
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="m9 12 2 2 4-4"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function CircleCheck(props: CircleCheckProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  CircleCheck,
  CircleCheck as CircleCheckIcon,
  type CircleCheckProps,
  type CircleCheckProps as CircleCheckIconProps,
};
