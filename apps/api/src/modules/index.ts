import type { Router } from 'express';
import type { AppContext } from '../context.js';
import { authRoutes } from './auth/routes.js';
import { diffRoutes } from './diff/routes.js';
import { documentRoutes } from './documents/routes.js';
import { folderRoutes } from './folders/routes.js';
import { healthRoutes } from './health.js';
import { projectRoutes } from './projects/routes.js';
import { reviewRoutes } from './reviews/routes.js';
import { versionRoutes } from './versions/routes.js';

/**
 * Every feature module contributes one router. Each module lives in its own folder, is owned by one
 * team member (docs/TEAM.md) and is registered here when its feature branch is merged.
 */
export const modules: Array<(ctx: AppContext) => Router> = [
  healthRoutes,
  authRoutes, // M01
  projectRoutes, // M02
  folderRoutes, // M03
  documentRoutes, // M03
  versionRoutes, // M04
  reviewRoutes, // M05
  diffRoutes, // F3.6
];
