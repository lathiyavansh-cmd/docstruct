import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SessionDto } from '@docstruct/shared';
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
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await post<SessionDto>('/auth/login', { email, password }));
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
        {expired && <Notice>Your session ended. Log in again to continue.</Notice>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Log in
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-ink-soft hover:text-ink hover:underline">Forgot your password?</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
