import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH } from '@docstruct/shared';
import { Button, ErrorNote, Field, Input, Notice } from '../../components/ui';
import { errorMessage, post } from '../../lib/api';
import { AuthLayout } from './AuthLayout';

/** Account.PasswordReset, step 1. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/password/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password" footer={<Link to="/login" className="text-primary hover:underline">Back to log in</Link>}>
      {sent ? (
        <Notice>
          If an account exists for {email}, we have sent a link to reset the password. The link works once and expires after 30 minutes.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label="Email" hint="We will send a reset link to this address.">
            {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Account.PasswordReset, step 2 (opened from the e-mailed link). */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = params.get('token') ?? '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/password/reset', { token, password });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {!token && <ErrorNote>This page needs the link from your reset e-mail.</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters. You will be logged out everywhere else.`}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={!token} className="w-full">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
