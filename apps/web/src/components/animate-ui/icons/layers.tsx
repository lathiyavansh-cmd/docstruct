// Source: animate-ui animated icons (skyleen77), https://animate-ui.com, MIT. Published on 21st.dev by its author; adapted for DocStruct.
/**
 * What this file does
 *   The animated "layers" icon, exported as LayersIcon through components/icons.ts. Like every icon here it
 *   stays still on hover (hover motion is switched off in icon.tsx, see "DocStruct: icons stay still on
 *   hover") and plays its motion only when a component passes `animate`. It animates only on the selected
 *   project row of CommandPalette.tsx. It only affects appearance.
 *
 * Why it exists
 *   A stack of pages: it marks documents, versions and projects. Copied from animate-ui rather than drawn
 *   from scratch: it only changes how the screen looks, and every DocStruct feature is still written by the
 *   team.
 *
 * Where it fits
 *   Used by: components/AppLayout.tsx (sidebar project links), components/CommandPalette.tsx,
 *   components/VersionHistory.tsx (compare action), pages/DocumentPage.tsx ("Versions" tab, "Move to
 *   folder"), pages/ProjectsPage.tsx (project cards), pages/project/ProjectLayout.tsx ("Documents" tab) and
 *   pages/project/DashboardPage.tsx.
 */
import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type LayersProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: {
        y: 0,
      },
      animate: {
        y: 5,
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
      },
    },
    path2: {},
    path3: {
      initial: {
        y: 0,
      },
      animate: {
        y: -5,
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
  'default-loop': {
    path1: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, 5, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
    path2: {},
    path3: {
      initial: {
        y: 0,
      },
      animate: {
        y: [0, -5, 0],
        transition: {
          duration: 0.6,
          ease: 'easeInOut',
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: LayersProps) {
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
        d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
        variants={variants.path2}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
        variants={variants.path3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Layers(props: LayersProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Layers,
  Layers as LayersIcon,
  type LayersProps,
  type LayersProps as LayersIconProps,
};
