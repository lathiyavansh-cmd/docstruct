// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "x" icon, exported as XIcon through components/icons.ts. Like every icon here it stays still
 *   on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on hover") and plays
 *   its motion only when a component passes `animate`. Nothing passes `animate` to it today, so it always
 *   shows still. It only affects appearance.
 *
 * Why it exists
 *   It means "close / cancel / remove": closing dialogs and the menu, cancelling a review, revoking a link,
 *   removing a member, clearing filters, or a missing template item. Copied from animate-ui rather than drawn
 *   from scratch: it only changes how the screen looks, and every DocStruct feature is still written by the
 *   team.
 *
 * Where it fits
 *   Used by: components/ui.tsx (dialog close), components/AppLayout.tsx, components/ReviewPanel.tsx,
 *   components/SharePanel.tsx, components/TemplateCheckCard.tsx, pages/project/MembersPage.tsx,
 *   pages/project/TemplatesPage.tsx and pages/project/WorkspacePage.tsx.
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type XProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    line1: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.4 },
      },
      animate: {
        rotate: 90,
        transition: { ease: 'easeInOut', duration: 0.4 },
      },
    },
    line2: {
      initial: {
        rotate: 0,
        transition: { ease: 'easeInOut', duration: 0.4, delay: 0.1 },
      },
      animate: {
        rotate: 90,
        transition: { ease: 'easeInOut', duration: 0.4, delay: 0.1 },
      },
    },
  } satisfies Record<string, Variants>,
  plus: {
    line1: {
      initial: {
        rotate: 0,
        x1: 6,
        y1: 18,
        x2: 18,
        y2: 6,
        transition: { ease: 'easeInOut', duration: 0.3, delay: 0.1 },
      },
      animate: {
        rotate: 45,
        x1: 7.1,
        y1: 16.9,
        x2: 16.9,
        y2: 7.1,
        transition: { ease: 'easeInOut', duration: 0.3, delay: 0.1 },
      },
    },
    line2: {
      initial: {
        rotate: 0,
        x1: 6,
        y1: 6,
        x2: 18,
        y2: 18,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
      animate: {
        rotate: 45,
        x1: 7.1,
        y1: 7.1,
        x2: 16.9,
        y2: 16.9,
        transition: { ease: 'easeInOut', duration: 0.3 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: XProps) {
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
      <motion.line
        x1={6}
        y1={18}
        x2={18}
        y2={6}
        variants={variants.line1}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={6}
        y1={6}
        x2={18}
        y2={18}
        variants={variants.line2}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function X(props: XProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, X, X as XIcon, type XProps, type XProps as XIconProps };
