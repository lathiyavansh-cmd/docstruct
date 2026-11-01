/**
 * What this file does
 *   Password protection for single documents: locking, unlocking, changing, removing and resetting the
 *   password, and the check every content route uses to refuse a locked document.
 *
 * How it works
 *   - The password is hashed with scrypt (the same code as login passwords) and only the hash is stored.
 *   - unlock() checks the password and records an unlock for this login session that lasts 12 hours.
 *     Nobody, not even a project owner, sees the contents without typing the password.
 *   - Changing or resetting the password raises password_version, so every earlier unlock stops working.
 *   - Five wrong passwords for one document within 15 minutes block further tries for a while.
 *   - The password never appears in the activity log, in responses or in error messages.
 *
 * Where it fits
 *   Used by protection/routes.ts, protection/guard.ts (content routes), documents/routes.ts (the unlocked
 *   flag) and shares/service.ts (public links). Module: M06 Security, document protection (owner: Vansh).
 */
import { DOCUMENT_PASSWORD_MIN_LENGTH, DOCUMENT_UNLOCK_HOURS } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity, type ActivityAction } from '../../lib/activity.js';
import { HttpError, badRequest, conflict, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

interface ProtectionRow {
  project_id: string;
  title: string;
  password_hash: string | null;
  password_version: number;
}

/** Thrown when a protected document is opened without a valid unlock. The web client shows the password form. */
export const documentLocked = () =>
  new HttpError(423, 'DOCUMENT_LOCKED', 'This document is protected with a password. Enter the password to open it.');

const wrongPassword = () => new HttpError(403, 'WRONG_PASSWORD', 'That password is not correct');

function checkNewPassword(password: string): void {
  if (password.length < DOCUMENT_PASSWORD_MIN_LENGTH) {
    throw badRequest(`The document password must be at least ${DOCUMENT_PASSWORD_MIN_LENGTH} characters`);
  }
}

export class ProtectionService {
  /** Recent wrong attempts per "who:document", kept in memory like the login throttle. */
  private static readonly failures = new Map<string, number[]>();

  constructor(private readonly ctx: AppContext) {}

  private async load(q: Queryable, documentId: string, lock = false): Promise<ProtectionRow> {
    const { rows } = await q.query<ProtectionRow>(
      `SELECT project_id, title, password_hash, password_version FROM documents
        WHERE document_id = $1 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [documentId],
    );
    if (!rows[0]) throw notFound('Document');
    return rows[0];
  }

  /**
   * Throws after too many wrong passwords, and checks the password against the stored hash otherwise.
   * `who` identifies the person (user id) or, for public links, the link.
   */
  async checkPassword(who: string, documentId: string, hash: string, password: string): Promise<void> {
    const key = `${who}:${documentId}`;
    const now = Date.now();
    const recent = (ProtectionService.failures.get(key) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= FAILURE_LIMIT) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong passwords. Try again in a few minutes.');
    }
    if (!(await verifyPassword(password, hash))) {
      ProtectionService.failures.set(key, [...recent, now]);
      throw wrongPassword();
    }
    ProtectionService.failures.delete(key);
  }

  /** Until when this login may see the document, or null if it is locked for them. Not protected: far future. */
  async unlockedUntil(documentId: string, auth: AuthContext): Promise<Date | null | 'open'> {
    const { rows } = await this.ctx.db.query<{ protected: boolean; expires_at: Date | null }>(
      `SELECT (d.protected_at IS NOT NULL) AS protected, u.expires_at
         FROM documents d
         LEFT JOIN document_unlocks u
           ON u.document_id = d.document_id AND u.session_id = $2
          AND u.password_version = d.password_version AND u.expires_at > now()
        WHERE d.document_id = $1`,
      [documentId, auth.sessionId],
    );
    const row = rows[0];
    if (!row) throw notFound('Document');
    if (!row.protected) return 'open';
    return row.expires_at;
  }

  /** The check every content route runs: a protected document needs a current unlock for this login. */
  async assertUnlocked(documentId: string, auth: AuthContext): Promise<void> {
    if ((await this.unlockedUntil(documentId, auth)) === null) throw documentLocked();
  }

  /** Correct password: the document stays open for this login session for DOCUMENT_UNLOCK_HOURS. */
  async unlock(documentId: string, auth: AuthContext, password: string): Promise<Date> {
    const doc = await this.load(this.ctx.db, documentId);
    if (!doc.password_hash) throw conflict('This document is not protected', 'NOT_PROTECTED');
    await this.checkPassword(auth.userId, documentId, doc.password_hash, password);
    const expires = new Date(Date.now() + DOCUMENT_UNLOCK_HOURS * 3600 * 1000);
    // One row per document and session; unlocking again simply extends it.
    await this.ctx.db.query(
      `INSERT INTO document_unlocks (document_id, session_id, user_id, password_version, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (document_id, session_id)
       DO UPDATE SET password_version = EXCLUDED.password_version, expires_at = EXCLUDED.expires_at`,
      [documentId, auth.sessionId, auth.userId, doc.password_version, expires],
    );
    return expires;
  }

  /** Locks an unprotected document. The person who locks it is unlocked straight away for this session. */
  async protect(documentId: string, auth: AuthContext, password: string): Promise<void> {
    checkNewPassword(password);
    await this.ctx.db.tx(async (q) => {
      const doc = await this.load(q, documentId, true);
      if (doc.password_hash) throw conflict('This document already has a password. Use "Change password" instead.', 'ALREADY_PROTECTED');
      await this.setPassword(q, documentId, auth, doc, password, 'document.protected');
    });
  }

  /** Changes the password. The current password is required, so knowing the old one is the only way in. */
  async change(documentId: string, auth: AuthContext, currentPassword: string, newPassword: string): Promise<void> {
    checkNewPassword(newPassword);
    await this.ctx.db.tx(async (q) => {
      const doc = await this.load(q, documentId, true);
      if (!doc.password_hash) throw conflict('This document is not protected', 'NOT_PROTECTED');
      await this.checkPassword(auth.userId, documentId, doc.password_hash, currentPassword);
      await this.setPassword(q, documentId, auth, doc, newPassword, 'document.password_changed');
    });
  }

  /** A project owner sets a new password without the old one, for a forgotten password. It is logged. */
  async reset(documentId: string, auth: AuthContext, newPassword: string): Promise<void> {
    checkNewPassword(newPassword);
    await this.ctx.db.tx(async (q) => {
      const doc = await this.load(q, documentId, true);
      if (!doc.password_hash) throw conflict('This document is not protected', 'NOT_PROTECTED');
      await this.setPassword(q, documentId, auth, doc, newPassword, 'document.password_reset');
    });
  }

  /** Removes protection; requires the current password. */
  async remove(documentId: string, auth: AuthContext, currentPassword: string): Promise<void> {
    await this.ctx.db.tx(async (q) => {
      const doc = await this.load(q, documentId, true);
      if (!doc.password_hash) throw conflict('This document is not protected', 'NOT_PROTECTED');
      await this.checkPassword(auth.userId, documentId, doc.password_hash, currentPassword);
      await q.query(
        `UPDATE documents SET password_hash = NULL, protected_at = NULL, protected_by = NULL,
                password_version = password_version + 1, updated_at = now()
          WHERE document_id = $1`,
        [documentId],
      );
      await q.query('DELETE FROM document_unlocks WHERE document_id = $1', [documentId]);
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: auth.userId,
        action: 'document.unprotected',
        entityType: 'document',
        entityId: documentId,
        entityLabel: doc.title,
      });
    });
  }

  /**
   * Stores the new hash and raises password_version, which invalidates every earlier unlock, then unlocks
   * the document for the person who set it (they just typed the password).
   */
  private async setPassword(q: Queryable, documentId: string, auth: AuthContext, doc: ProtectionRow, password: string, action: ActivityAction) {
    const version = doc.password_version + 1;
    await q.query(
      `UPDATE documents SET password_hash = $2, protected_at = now(), protected_by = $3, password_version = $4, updated_at = now()
        WHERE document_id = $1`,
      [documentId, await hashPassword(password), auth.userId, version],
    );
    await q.query('DELETE FROM document_unlocks WHERE document_id = $1', [documentId]);
    await q.query(
      `INSERT INTO document_unlocks (document_id, session_id, user_id, password_version, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
      [documentId, auth.sessionId, auth.userId, version, DOCUMENT_UNLOCK_HOURS],
    );
    // Only that the password was set or changed is logged, never the password itself.
    await recordActivity(q, {
      projectId: doc.project_id,
      actorId: auth.userId,
      action,
      entityType: 'document',
      entityId: documentId,
      entityLabel: doc.title,
    });
  }
}
