// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "square-plus" icon, exported as SquarePlusIcon through components/icons.ts. Like every icon
 *   here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still
 *   on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today, so it always shows still. It only affects appearance.
 *
 * Why it exists
 *   It marks "add new" tiles and buttons: a new folder and the new project tile. Copied from animate-ui
 *   rather than drawn from scratch: it only changes how the screen looks, and every DocStruct feature is
 *   still written by the team.
 *
 * Where it fits
 *   Used by: components/FolderTree.tsx ("New folder") and pages/ProjectsPage.tsx ("New project" tile).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type SquarePlusProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    rect: {},
    line1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.4, delay: 0.1 },
      },
      animate: {
        rotate: 90,
        transition: { ease: 'easeInOut', duration: 0.4, delay: 0.1 },
      },
    },
    line2: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.4 },
      },
      animate: {
        rotate: 90,
        transition: { ease: 'easeInOut', duration: 0.4 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: SquarePlusProps) {
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
        width={18}
        height={18}
        x={3}
        y={3}
        rx={2}
        ry={2}
        variants={variants.rect}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={8}
        y1={12}
        x2={16}
        y2={12}
        variants={variants.line1}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={12}
        y1={16}
        x2={12}
        y2={8}
        variants={variants.line2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function SquarePlus(props: SquarePlusProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SquarePlus,
  SquarePlus as SquarePlusIcon,
  type SquarePlusProps,
  type SquarePlusProps as SquarePlusIconProps,
};
