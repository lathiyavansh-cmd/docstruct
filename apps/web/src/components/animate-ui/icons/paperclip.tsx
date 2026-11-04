// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "paperclip" icon, exported as PaperclipIcon through components/icons.ts. Like every icon
 *   here it stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still
 *   on hover") and plays its motion only when a component passes `animate`. Nothing passes `animate` to it
 *   today. It only affects appearance.
 *
 * Why it exists
 *   Part of the icon set copied with the others for attachments. Copied from animate-ui rather than drawn
 *   from scratch: it only changes how the screen looks, and every DocStruct feature is still written by the
 *   team.
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

type PaperclipProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: { pathLength: 1 },
      animate: {
        pathLength: [0.02, 1],
        transition: {
          duration: 1.2,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    path: {
      initial: { pathLength: 1 },
      animate: {
        pathLength: [1, 0.02, 1],
        transition: {
          duration: 2.4,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: PaperclipProps) {
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
        d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Paperclip(props: PaperclipProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Paperclip,
  Paperclip as PaperclipIcon,
  type PaperclipProps,
  type PaperclipProps as PaperclipIconProps,
};
