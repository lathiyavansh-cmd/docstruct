/**
 * What this file does
 *   The single list of all feature module routers that the API serves (see the comment below).
 *
 * How it works
 *   - Imports the routes function of each module.
 *   - Exports them in one array; the comments show the SRS module number.
 *
 * Where it fits
 *   app.ts loops over this array and mounts each router under /api. Module: server core (owner: Vansh).
 */
import type { Router } from 'express';
import type { AppContext } from '../context.js';
import { annotationRoutes } from './annotations/routes.js';
import { authRoutes } from './auth/routes.js';
import { dashboardRoutes } from './dashboard/routes.js';
import { diffRoutes } from './diff/routes.js';
import { documentRoutes } from './documents/routes.js';
import { folderRoutes } from './folders/routes.js';
import { demoRoutes } from './demo.js';
import { healthRoutes } from './health.js';
import { projectRoutes } from './projects/routes.js';
import { protectionRoutes } from './protection/routes.js';
import { recipientRoutes } from './recipients/routes.js';
import { reviewRoutes } from './reviews/routes.js';
import { searchRoutes } from './search/routes.js';
import { shareRoutes } from './shares/routes.js';
import { summaryRoutes } from './summary/routes.js';
import { templateRoutes } from './templates/routes.js';
import { versionRoutes } from './versions/routes.js';

/**
 * Every feature module contributes one router. Each module lives in its own folder, is owned by one
 * team member (docs/TEAM.md) and is registered here when its feature branch is merged.
 */
// Each entry is a function (ctx) => Router. Express tries the routers in this order for each request.
export const modules: Array<(ctx: AppContext) => Router> = [
  healthRoutes,
  demoRoutes, // demo accounts for the login page (demo mode only)
  authRoutes, // M01
  projectRoutes, // M02
  folderRoutes, // M03
  documentRoutes, // M03
  protectionRoutes, // M06: password-protected documents
  recipientRoutes, // M07: send a document to all members ("Shared with me")
  versionRoutes, // M04
  reviewRoutes, // M05
  diffRoutes, // F3.6
  summaryRoutes, // document summarisation (extends F3.6)
  templateRoutes, // document templates: checklists of required headings
  annotationRoutes, // M07
  shareRoutes, // M07
  searchRoutes, // M08
  dashboardRoutes, // M09
];
