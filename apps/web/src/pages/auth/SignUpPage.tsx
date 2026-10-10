import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH, type SessionDto } from '@docstruct/shared';
import { Button, ErrorNote, Field, Input } from '../../components/ui';
import { errorMessage, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';

export function SignUpPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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
          Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link>
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
        <Button type="submit" variant="primary" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
