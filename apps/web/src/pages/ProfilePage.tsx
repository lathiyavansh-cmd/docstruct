/**
 * What this file does
 *   This is the profile screen. The logged-in user can change their display name and their password.
 *
 * How it works
 *   - Reads the current user from useAuth() (no useQuery here; the user is already loaded at login).
 *   - Save name calls patch('/auth/me') and puts the updated profile back into useAuth with setUser, so the new name shows everywhere.
 *   - Change password calls post('/auth/password/change') with the current and new password. The server logs out the user's other sessions.
 *   - Each form has its own error message, and a toast confirms success.
 *
 * Where it fits
 *   Route /profile in App.tsx, inside AppLayout (login required). Module: M01 Authentication (owner: Vansh).
 */
import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, type ProfileDto } from '@docstruct/shared';
import { useToast } from '../components/toast';
import { Button, ErrorNote, Field, Input, PageHeader } from '../components/ui';
import { errorMessage, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { CheckIcon, LockIcon } from '../components/icons';

/** Account.Profile.Edit: your own name and password. */
export function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  // Which form is saving right now, so only that button shows a spinner.
  const [busy, setBusy] = useState<'name' | 'pw' | null>(null);
  if (!user) return null;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy('name');
    setError(null);
    try {
      // Save the new name on the server, then update the user kept in useAuth.
      setUser(await patch<ProfileDto>('/auth/me', { displayName: name }));
      toast('Name saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy('pw');
    setPwError(null);
    try {
      // The server checks the current password before saving the new one.
      await post('/auth/password/change', pw);
      // Clear both password boxes after success.
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other sessions were logged out.');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <PageHeader title="Profile">
        {user.email}, member since {formatDate(user.createdAt)}
      </PageHeader>
      <form onSubmit={saveName} className="space-y-4 border-b border-rule pb-8">
        {error && <ErrorNote>{error}</ErrorNote>}
        {/* The Save button stays disabled until the name is different from the saved one. */}
        <Field label="Display name" hint="Other members see this name next to your uploads, reviews and comments.">
          {(id) => <Input id={id} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" icon={CheckIcon} busy={busy === 'name'} disabled={name.trim() === user.displayName}>
          Save name
        </Button>
      </form>
      <form onSubmit={changePassword} className="space-y-4 pt-8">
        <h2 className="font-semibold">Change password</h2>
        {pwError && <ErrorNote>{pwError}</ErrorNote>}
        <Field label="Current password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
        </Field>
        <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          )}
        </Field>
        <Button type="submit" icon={LockIcon} busy={busy === 'pw'}>
          Change password
        </Button>
      </form>
    </div>
  );
}
