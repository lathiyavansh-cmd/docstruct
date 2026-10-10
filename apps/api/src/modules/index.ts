import type { Router } from 'express';
import type { AppContext } from '../context.js';
import { authRoutes } from './auth/routes.js';
import { healthRoutes } from './health.js';

/**
 * Every feature module contributes one router. Each module lives in its own folder, is owned by one
 * team member (docs/TEAM.md) and is registered here when its feature branch is merged.
 */
export const modules: Array<(ctx: AppContext) => Router> = [
  healthRoutes,
  authRoutes, // M01
];
