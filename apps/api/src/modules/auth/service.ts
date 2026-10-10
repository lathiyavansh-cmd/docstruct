import type { ProfileDto, SessionDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { HttpError, conflict, unauthorized } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { decoyHash, hashPassword, verifyPassword } from './password.js';
import { hashToken, newToken } from './tokens.js';

interface ProfileRow {
  user_id: string;
  email: string;
  display_name: string;
  created_at: Date;
}

export function toProfileDto(row: ProfileRow): ProfileDto {
  return { userId: row.user_id, email: row.email, displayName: row.display_name, createdAt: row.created_at.toISOString() };
}

const GENERIC_LOGIN_FAILURE = 'Invalid email or password';

/** Login throttling: after 5 failures for one e-mail within 15 minutes, further attempts wait. */
const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export class AuthService {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly ctx: AppContext) {}

  private async createSession(q: Queryable, profile: ProfileRow): Promise<SessionDto> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + this.ctx.config.sessionMaxHours * 3600_000);
    await q.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
      profile.user_id,
      hashToken(token),
      expiresAt,
    ]);
    return { token, expiresAt: expiresAt.toISOString(), idleMinutes: this.ctx.config.sessionIdleMinutes, user: toProfileDto(profile) };
  }

  /** Account.SignUp, Account.SignUp.Profile, Account.SignUp.Duplicate */
  async signUp(email: string, password: string, displayName: string): Promise<SessionDto> {
    const passwordHash = await hashPassword(password);
    return this.ctx.db.tx(async (q) => {
      const existing = await q.query('SELECT 1 FROM profiles WHERE lower(email) = lower($1)', [email]);
      if (existing.rows.length) throw conflict('An account with this email address already exists', 'ACCOUNT_EXISTS');
      const { rows } = await q.query<ProfileRow>(
        'INSERT INTO profiles (email, display_name) VALUES ($1, $2) RETURNING user_id, email, display_name, created_at',
        [email.trim(), displayName.trim()],
      );
      const profile = rows[0];
      await q.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [profile.user_id, passwordHash]);
      return this.createSession(q, profile);
    });
  }

  /** Account.Login, Account.Login.Failure: one generic message whether or not the e-mail exists. */
  async login(email: string, password: string): Promise<SessionDto> {
    const key = email.trim().toLowerCase();
    const now = Date.now();
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= FAILURE_LIMIT) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in a few minutes.');
    }

    const { rows } = await this.ctx.db.query<ProfileRow & { password_hash: string }>(
      `SELECT p.user_id, p.email, p.display_name, p.created_at, c.password_hash
         FROM profiles p JOIN user_credentials c ON c.user_id = p.user_id
        WHERE lower(p.email) = $1`,
      [key],
    );
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? (await decoyHash()));
    if (!row || !ok) {
      this.failures.set(key, [...recent, now]);
      throw unauthorized(GENERIC_LOGIN_FAILURE);
    }
    this.failures.delete(key);
    return this.createSession(this.ctx.db, row);
  }

  /**
   * Resolves a bearer token to its user. A session is valid while it is not revoked, not past its absolute
   * expiry and has been used within the idle period (Account.Session.Expiry).
   */
  async authenticate(token: string): Promise<AuthContext> {
    const idle = this.ctx.config.sessionIdleMinutes;
    const { rows } = await this.ctx.db.query<{
      session_id: string;
      user_id: string;
      email: string;
      display_name: string;
      stale: boolean;
    }>(
      `SELECT s.session_id, s.user_id, p.email, p.display_name,
              s.last_seen_at < now() - interval '1 minute' AS stale
         FROM sessions s JOIN profiles p ON p.user_id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(mins => $2)`,
      [hashToken(token), idle],
    );
    const row = rows[0];
    if (!row) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
    // Sliding idle window; written at most once a minute to keep reads cheap.
    if (row.stale) await this.ctx.db.query('UPDATE sessions SET last_seen_at = now() WHERE session_id = $1', [row.session_id]);
    return { userId: row.user_id, sessionId: row.session_id, email: row.email, displayName: row.display_name };
  }

  /** Account.Session: logging out invalidates the session immediately. */
  async logout(sessionId: string): Promise<void> {
    await this.ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL', [sessionId]);
  }

  async profile(userId: string): Promise<ProfileDto> {
    const { rows } = await this.ctx.db.query<ProfileRow>(
      'SELECT user_id, email, display_name, created_at FROM profiles WHERE user_id = $1',
      [userId],
    );
    return toProfileDto(rows[0]);
  }

  /** Account.Profile.Edit (own profile only - the route never takes a user id). */
  async updateProfile(userId: string, displayName: string): Promise<ProfileDto> {
    const { rows } = await this.ctx.db.query<ProfileRow>(
      `UPDATE profiles SET display_name = $2, updated_at = now() WHERE user_id = $1
       RETURNING user_id, email, display_name, created_at`,
      [userId, displayName.trim()],
    );
    return toProfileDto(rows[0]);
  }

  async changePassword(auth: AuthContext, current: string, next: string): Promise<void> {
    const { rows } = await this.ctx.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM user_credentials WHERE user_id = $1',
      [auth.userId],
    );
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
      throw new HttpError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
    }
    const hash = await hashPassword(next);
    await this.ctx.db.tx(async (q) => {
      await q.query('UPDATE user_credentials SET password_hash = $2, updated_at = now() WHERE user_id = $1', [auth.userId, hash]);
      // Every other session of this user ends; the current one stays.
      await q.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND session_id <> $2 AND revoked_at IS NULL', [
        auth.userId,
        auth.sessionId,
      ]);
    });
  }

  /**
   * Account.PasswordReset, step 1. Always succeeds from the caller's point of view, so the endpoint cannot
   * be used to discover which e-mail addresses are registered.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { rows } = await this.ctx.db.query<ProfileRow>(
      'SELECT user_id, email, display_name, created_at FROM profiles WHERE lower(email) = lower($1)',
      [email.trim()],
    );
    const profile = rows[0];
    if (!profile) return;

    const token = newToken();
    const minutes = this.ctx.config.resetTokenMinutes;
    const link = `${this.ctx.config.appUrl}/reset-password?token=${token}`;
    await this.ctx.db.tx(async (q) => {
      await q.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
        [hashToken(token), profile.user_id, minutes],
      );
      await q.query('INSERT INTO mail_outbox (to_email, subject, body) VALUES ($1, $2, $3)', [
        profile.email,
        'Reset your DocStruct password',
        `Hello ${profile.display_name},\n\nOpen this link within ${minutes} minutes to choose a new password:\n${link}\n\n` +
          'If you did not ask for this, ignore this message.',
      ]);
    });
    this.ctx.log(`password reset link for ${profile.email}: ${link}`);
  }

  /** Account.PasswordReset, step 2: the link works once and only before it expires. */
  async resetPassword(token: string, password: string): Promise<void> {
    const hash = await hashPassword(password);
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ user_id: string }>(
        `UPDATE password_reset_tokens SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING user_id`,
        [hashToken(token)],
      );
      if (!rows[0]) throw new HttpError(400, 'INVALID_RESET_LINK', 'This reset link is invalid, already used or expired');
      await q.query('UPDATE user_credentials SET password_hash = $2, updated_at = now() WHERE user_id = $1', [rows[0].user_id, hash]);
      await q.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [rows[0].user_id]);
    });
  }
}
