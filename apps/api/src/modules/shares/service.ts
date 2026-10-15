/**
 * What this file does
 *   Holds the logic for share links: secret links that let someone outside the project view one
 *   document read-only. Links can expire and can be revoked.
 *
 * How it works
 *   - createShareToken() makes a random 32-byte token; only its SHA-256 hash is stored in the database.
 *   - create() saves the link and returns the raw token once, inside the URL.
 *   - revoke() sets revoked_at so the link stops working for everyone.
 *   - open() hashes the token from the URL, finds the link, rejects revoked, expired or deleted ones,
 *     counts the visit and returns signed file links.
 *
 * Where it fits
 *   Called by shares/routes.ts. Uses DocumentService.fileLink() for the file URLs. Module: M07 Sharing
 *   & Annotation (owner: Shrut).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CreatedShareLinkDto, ShareLinkDto, SharedDocumentDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { DocumentService } from '../documents/service.js';

interface ShareRow {
  share_id: string;
  document_id: string;
  label: string;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_accessed_at: Date | null;
  access_count: number;
}

const SELECT = `
  SELECT s.share_id, s.document_id, s.label, s.created_by, p.display_name AS created_by_name, s.created_at, s.expires_at,
         s.revoked_at, s.last_accessed_at, s.access_count
    FROM share_links s JOIN profiles p ON p.user_id = s.created_by`;

function toDto(r: ShareRow): ShareLinkDto {
  return {
    shareId: r.share_id,
    documentId: r.document_id,
    label: r.label,
    createdBy: { userId: r.created_by, displayName: r.created_by_name },
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at?.toISOString() ?? null,
    revokedAt: r.revoked_at?.toISOString() ?? null,
    lastAccessedAt: r.last_accessed_at?.toISOString() ?? null,
    accessCount: r.access_count,
    // A link is active when it is not revoked and either has no expiry or expires in the future.
    active: !r.revoked_at && (!r.expires_at || r.expires_at.getTime() > Date.now()),
  };
}

/** Algorithm K - share-link token generation. The raw token exists only in the link given to the user. */
export function createShareToken(): { token: string; tokenHash: string } {
  // 32 random bytes (256 bits) cannot be guessed; base64url makes it safe to put in a URL.
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** M07 - controlled share links (SRS 3.7). */
export class ShareService {
  private readonly documents: DocumentService;

  constructor(private readonly ctx: AppContext) {
    this.documents = new DocumentService(ctx);
  }

  async list(documentId: string): Promise<ShareLinkDto[]> {
    const { rows } = await this.ctx.db.query<ShareRow>(`${SELECT} WHERE s.document_id = $1 ORDER BY s.created_at DESC`, [documentId]);
    return rows.map(toDto);
  }

  /** Share.Create, Share.Create.Expiry */
  async create(documentId: string, userId: string, input: { expiresAt?: string | null; label?: string }): Promise<CreatedShareLinkDto> {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw badRequest('The expiry must be in the future');
    const { token, tokenHash } = createShareToken();
    const shareId = await this.ctx.db.tx(async (q) => {
      // Only the hash is stored, never the raw token. The sub-queries in RETURNING fetch the project and
      // title for the activity log in the same statement.
      const { rows } = await q.query<{ share_id: string; project_id: string; title: string }>(
        `INSERT INTO share_links (document_id, token_hash, label, created_by, expires_at)
         SELECT $1, $2, $3, $4, $5 FROM documents d WHERE d.document_id = $1
         RETURNING share_id, (SELECT project_id FROM documents WHERE document_id = $1) AS project_id,
                   (SELECT title FROM documents WHERE document_id = $1) AS title`,
        [documentId, tokenHash, input.label ?? '', userId, expiresAt],
      );
      await recordActivity(q, {
        projectId: rows[0].project_id,
        actorId: userId,
        action: 'share.created',
        entityType: 'share',
        entityId: documentId,
        entityLabel: rows[0].title,
        detail: { shareId: rows[0].share_id, expiresAt: expiresAt?.toISOString() ?? null },
      });
      return rows[0].share_id;
    });
    const { rows } = await this.ctx.db.query<ShareRow>(`${SELECT} WHERE s.share_id = $1`, [shareId]);
    return { ...toDto(rows[0]), token, url: `${this.ctx.config.appUrl}/s/${token}` };
  }

  /** Share.Revoke: takes effect immediately for every holder of the link. */
  async revoke(shareId: string, userId: string): Promise<ShareLinkDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ document_id: string; project_id: string; title: string }>(
        `UPDATE share_links s SET revoked_at = now(), revoked_by = $2
           FROM documents d WHERE s.share_id = $1 AND s.revoked_at IS NULL AND d.document_id = s.document_id
          RETURNING s.document_id, d.project_id, d.title`,
        [shareId, userId],
      );
      if (!rows[0]) throw conflict('This link is already revoked', 'ALREADY_REVOKED');
      await recordActivity(q, {
        projectId: rows[0].project_id,
        actorId: userId,
        action: 'share.revoked',
        entityType: 'share',
        entityId: rows[0].document_id,
        entityLabel: rows[0].title,
        detail: { shareId },
      });
    });
    const { rows } = await this.ctx.db.query<ShareRow>(`${SELECT} WHERE s.share_id = $1`, [shareId]);
    return toDto(rows[0]);
  }

  /**
   * Algorithm K - validation, for an unauthenticated recipient. The presented token is hashed and looked up
   * (the stored value is a hash, so the comparison never involves the raw secret). Revoked or expired links
   * and deleted documents grant nothing (Share.Revoke, Share.Create.Expiry). The link opens exactly one
   * document, read-only, at its current version (Share.Scope, Share.Create.ViewOnly).
   */
  async open(token: string): Promise<SharedDocumentDto> {
    // Quick shape check: anything that cannot be a real token gets 404 without touching the database.
    if (!/^[\w-]{20,100}$/.test(token)) throw notFound('Shared document');
    const { rows } = await this.ctx.db.query<{
      share_id: string;
      expires_at: Date | null;
      revoked_at: Date | null;
      document_id: string;
      title: string;
      description: string;
      deleted_at: Date | null;
      current_version_id: string;
      version_no: number;
      updated_at: Date;
    }>(
      `SELECT s.share_id, s.expires_at, s.revoked_at, d.document_id, d.title, d.description, d.deleted_at,
              d.current_version_id, v.version_no, d.updated_at
         FROM share_links s
         JOIN documents d ON d.document_id = s.document_id
         JOIN document_versions v ON v.version_id = d.current_version_id
        WHERE s.token_hash = $1`,
      [hashShareToken(token)],
    );
    const share = rows[0];
    if (!share || share.deleted_at) throw notFound('Shared document');
    // 410 Gone tells the visitor the link existed but no longer works (revoked or expired).
    if (share.revoked_at) throw new HttpError(410, 'LINK_REVOKED', 'This link has been revoked by the document owner');
    if (share.expires_at && share.expires_at.getTime() <= Date.now()) throw new HttpError(410, 'LINK_EXPIRED', 'This link has expired');

    await this.ctx.db.query('UPDATE share_links SET last_accessed_at = now(), access_count = access_count + 1 WHERE share_id = $1', [share.share_id]);
    return {
      title: share.title,
      description: share.description,
      versionNo: share.version_no,
      updatedAt: share.updated_at.toISOString(),
      file: await this.documents.fileLink(share.current_version_id, 'inline'),
      download: await this.documents.fileLink(share.current_version_id, 'attachment'),
      expiresAt: share.expires_at?.toISOString() ?? null,
    };
  }
}
