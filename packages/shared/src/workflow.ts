/**
 * What this file does
 *   Holds the review state machine: the list of status changes a document is allowed to make.
 *   For example a Draft can go Under Review, but an Archived document can never change again.
 *
 * How it works
 *   - ALLOWED_TRANSITIONS maps each status to the statuses it may move to next.
 *   - canTransition(from, to) looks up that table and returns true or false.
 *   - Callers check it before changing a status, so an illegal jump is refused.
 *
 * Where it fits
 *   The server checks it when a document is submitted, decided or archived (apps/api/src/modules/reviews/service.ts).
 *   The website uses it to show or hide the submit button (apps/web/src/components/ReviewPanel.tsx).
 *   Module: M05 review workflow (owner: Vivan).
 */
import type { DocumentStatus } from './enums.js';

/**
 * Algorithm D - the document review state machine (SRS Appendix B, Figure 3).
 *
 *   DRAFT ──submit──▶ UNDER_REVIEW ──approve──▶ APPROVED ──new version──▶ DRAFT
 *                        │   ▲  └──cancel──▶ (previous status)
 *          request changes   └──resubmit (new version)── CHANGES_REQUESTED
 *
 * Any non-review state can be archived by an owner; ARCHIVED is terminal.
 */
// State-machine table. Key = current status, value = statuses it may move to next.
export const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'ARCHIVED'],
  // No ARCHIVED here: a document under review must be decided or cancelled before it can be archived.
  UNDER_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'DRAFT'],
  CHANGES_REQUESTED: ['UNDER_REVIEW', 'ARCHIVED'],
  APPROVED: ['DRAFT', 'ARCHIVED'],
  // Empty list: ARCHIVED is the end state, nothing can follow it.
  ARCHIVED: [],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
