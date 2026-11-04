// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "user" icon, exported as UserIcon through components/icons.ts. Like every icon here it stays
 *   still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on hover") and
 *   plays its motion only when a component passes `animate`. It animates only on the selected row of
 *   CommandPalette.tsx. It only affects appearance.
 *
 * Why it exists
 *   It marks the user's Profile page. Copied from animate-ui rather than drawn from scratch: it only changes
 *   how the screen looks, and every DocStruct feature is still written by the team.
 *
 * Where it fits
 *   Used by: components/AppLayout.tsx (sidebar footer "Profile") and components/CommandPalette.tsx.
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type UserProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, 2, -2, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
    circle: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, 4, -2, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: UserProps) {
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
        d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx={12}
        cy={7}
        r={4}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function User(props: UserProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  User,
  User as UserIcon,
  type UserProps,
  type UserProps as UserIconProps,
};
