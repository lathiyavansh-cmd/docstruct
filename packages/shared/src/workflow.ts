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
export const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'DRAFT'],
  CHANGES_REQUESTED: ['UNDER_REVIEW', 'ARCHIVED'],
  APPROVED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
