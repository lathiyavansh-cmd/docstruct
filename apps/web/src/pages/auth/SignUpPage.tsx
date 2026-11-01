/**
 * What this file does
 *   This is the sign-up screen. A new user enters a name, email and password to create an account.
 *
 * How it works
 *   - Keeps the three fields in one form state object.
 *   - On submit it calls post('/auth/signup') with the form and gets back a session (token and user).
 *   - signIn() from useAuth saves the token, so the user is logged in straight away, then it goes to "/".
 *   - The password must be at least PASSWORD_MIN_LENGTH characters (shared rule, also checked on the server).
 *
 * Where it fits
 *   Route /signup in App.tsx, wrapped in GuestOnly and drawn inside AuthLayout. Module: M01 Authentication (owner: Vansh).
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH, type SessionDto } from '@docstruct/shared';
import { Button, ErrorNote, Field, Input } from '../../components/ui';
import { errorMessage, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';
import { ArrowRightIcon } from '../../components/icons';

export function SignUpPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // set('email') returns an onChange handler that updates only that one field.
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Create the account; the server replies with a session, so we log the user in at once.
      signIn(await post<SessionDto>('/auth/signup', form));
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account? <Link to="/login" className="font-medium text-primary transition-colors hover:text-primary-hover">Log in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Your name" hint="Shown to project members next to your activity.">
          {(id) => <Input id={id} autoComplete="name" required maxLength={80} value={form.displayName} onChange={set('displayName')} />}
        </Field>
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={form.email} onChange={set('email')} />}</Field>
        <Field label="Password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} value={form.password} onChange={set('password')} />}
        </Field>
        <Button type="submit" variant="primary" icon={ArrowRightIcon} busy={busy} className="w-full flex-row-reverse">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
