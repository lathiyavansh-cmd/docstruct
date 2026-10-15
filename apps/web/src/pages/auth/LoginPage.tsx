/**
 * What this file does
 *   This is the login screen. The user types an email and password to start a session.
 *
 * How it works
 *   - On submit it calls post('/auth/login') with the email and password and gets back a session (token and user).
 *   - signIn() from useAuth saves the token, so every later API call is sent with it.
 *   - After login it goes back to the page the user first asked for (location.state.from), or to "/".
 *   - Shows a notice when the old session expired, and shows the server's error message if login fails.
 *
 * Where it fits
 *   Route /login in App.tsx, wrapped in GuestOnly and drawn inside AuthLayout. Module: M01 Authentication (owner: Vansh).
 */
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SessionDto } from '@docstruct/shared';
import { ArrowRightIcon } from '../../components/icons';
import { Button, ErrorNote, Field, Input, Notice } from '../../components/ui';
import { errorMessage, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { signIn, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // busy is true while the request runs; it shows a spinner on the button and stops double clicks.
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    // Stop the browser from reloading the page on form submit.
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Ask the server to check the email and password, then store the returned session.
      signIn(await post<SessionDto>('/auth/login', { email, password }));
      // RequireAuth in App.tsx saved the page the user wanted in location.state.from.
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      footer={
        <>
          New to DocStruct? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* expired is set by useAuth when the server rejected an old token. */}
        {expired && <Notice>Your session ended. Log in again to continue.</Notice>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" icon={ArrowRightIcon} busy={busy} className="w-full flex-row-reverse">
          Log in
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-ink-soft hover:text-ink hover:underline">Forgot your password?</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
