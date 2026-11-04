/**
 * What this file does
 *   The entry point of the @docstruct/shared package. It re-exports everything from the other files here.
 *
 * Why it exists
 *   Callers get one import path and do not need to know which file defines what, so files in this package can
 *   be split or renamed without changing imports in apps/api or apps/web.
 *
 * How it works
 *   - Each line pulls in all exports of one file, so callers import from one place.
 *   - The '.js' endings are needed because the package is an ES module; TypeScript maps them to the .ts files.
 *
 * Where it fits
 *   Both apps/api and apps/web write `import { ... } from '@docstruct/shared'`, which lands here.
 *   Module: shared core (owner: Vansh).
 */
export * from './enums.js';
export * from './constants.js';
export * from './api.js';
export * from './permissions.js';
export * from './workflow.js';
