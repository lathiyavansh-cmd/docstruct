// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "search" icon, exported as SearchIcon through components/icons.ts. Like every icon here it
 *   stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on
 *   hover") and plays its motion only when a component passes `animate`. CommandPalette.tsx, SearchPage.tsx
 *   and WorkspacePage.tsx pass `animate` while something is typed in the box. It only affects appearance.
 *
 * Why it exists
 *   It marks search: the sidebar Search link, the "Search or jump to" button, the search boxes and their
 *   empty states. Copied from animate-ui rather than drawn from scratch: it only changes how the screen
 *   looks, and every DocStruct feature is still written by the team.
 *
 * Where it fits
 *   Used by: components/AppLayout.tsx, components/CommandPalette.tsx, pages/SearchPage.tsx and
 *   pages/project/WorkspacePage.tsx.
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type SearchProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        rotate: 0,
      },
      animate: {
        transformOrigin: 'bottom right',
        rotate: [0, 17, -10, 5, -1, 0],
        transition: { duration: 0.8, ease: 'easeInOut' },
      },
    },
    path: {},
    circle: {},
  } satisfies Record<string, Variants>,
  find: {
    group: {
      initial: {
        x: 0,
        y: 0,
      },
      animate: {
        x: [0, '-15%', 0, 0],
        y: [0, 0, '-15%', 0],
        transition: { duration: 1, ease: 'easeInOut' },
      },
    },
    path: {},
    circle: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: SearchProps) {
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
        d="m21 21-4.34-4.34"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx={11}
        cy={11}
        r={8}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Search(props: SearchProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Search,
  Search as SearchIcon,
  type SearchProps,
  type SearchProps as SearchIconProps,
};
