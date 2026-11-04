// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "chevron-down" icon, exported as ChevronDownIcon through components/icons.ts. Like every
 *   icon here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay
 *   still on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to
 *   it; the rotation comes from the parent's own motion.span. It only affects appearance.
 *
 * Why it exists
 *   It shows that a section or menu can be opened and closed; the parent rotates it to show the current
 *   state. Copied from animate-ui rather than drawn from scratch: it only changes how the screen looks, and
 *   every DocStruct feature is still written by the team.
 *
 * Where it fits
 *   Used by: components/SummaryCard.tsx and components/TemplateCheckCard.tsx (collapsible cards),
 *   pages/auth/DemoAccounts.tsx (demo account list) and pages/DocumentPage.tsx ("More" menu).
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type ChevronDownProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: {
        y: 0,
        transition: { duration: 0.3, ease: 'easeInOut' },
      },
      animate: {
        y: 4,
        transition: { duration: 0.3, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    path: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, 4, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ChevronDownProps) {
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
        d="m6 9 6 6 6-6"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function ChevronDown(props: ChevronDownProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  type ChevronDownProps,
  type ChevronDownProps as ChevronDownIconProps,
};
