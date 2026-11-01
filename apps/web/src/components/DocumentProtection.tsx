/**
 * What this file does
 *   The screens for password-protected documents: the password form shown instead of a locked document,
 *   and the dialogs to protect a document, change or remove its password, or reset a forgotten one.
 *
 * How it works
 *   - UnlockPanel posts the password to POST /documents/:id/unlock; on success the document stays open for
 *     this login for 12 hours, and onUnlocked() reloads the page data.
 *   - ProtectionDialog has four modes: 'protect' (POST /protection), 'change' (needs the current password),
 *     'remove' (needs the current password) and 'reset' (owners only, no current password).
 *   - Passwords are only sent to the server; they are never stored in the browser or shown again.
 *
 * Where it fits
 *   Used by pages/DocumentPage.tsx. Module: M06 Security, document protection (owner: Vansh).
 */
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { DOCUMENT_PASSWORD_MIN_LENGTH, DOCUMENT_UNLOCK_HOURS } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { LockIcon } from './icons';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Modal } from './ui';

/** Shown in place of the preview, summary and side panel while the document is locked for this login. */
export function UnlockPanel({ documentId, onUnlocked }: { documentId: string; onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const unlock = useMutation({
    mutationFn: () => post<{ unlockedUntil: string }>(`/documents/${documentId}/unlock`, { password }),
    onSuccess: onUnlocked,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) unlock.mutate();
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 max-w-md rounded-2xl border border-rule bg-gradient-to-b from-primary-wash/60 to-surface p-6 text-center shadow-card"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lift">
        <LockIcon size={22} animate />
      </span>
      <h2 className="mt-4 text-lg font-semibold">This document is password protected</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Ask the person who protected it for the password. Once entered, it stays open for you for {DOCUMENT_UNLOCK_HOURS} hours on this login.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3 text-left">
        {unlock.error && <ErrorNote>{errorMessage(unlock.error)}</ErrorNote>}
        <Field label="Document password">
          {(id) => <Input id={id} type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" icon={LockIcon} busy={unlock.isPending} disabled={!password} className="w-full">
          Unlock document
        </Button>
      </form>
    </motion.section>
  );
}

export type ProtectionMode = 'protect' | 'change' | 'remove' | 'reset';

const COPY: Record<ProtectionMode, { title: string; action: string; done: string; help: string }> = {
  protect: {
    title: 'Protect with a password',
    action: 'Protect document',
    done: 'Protected with a password',
    help: 'Everyone, including project owners, will need this password to open the document. Share it only with the people who should read it.',
  },
  change: {
    title: 'Change the password',
    action: 'Change password',
    done: 'Password changed',
    help: 'Everyone who unlocked the document with the old password will need the new one.',
  },
  remove: {
    title: 'Remove the password',
    action: 'Remove password',
    done: 'Password removed',
    help: 'Every project member will be able to open the document again without a password.',
  },
  reset: {
    title: 'Reset a forgotten password',
    action: 'Set new password',
    done: 'Password reset',
    help: 'As a project owner you can set a new password without the old one. This is recorded in the activity log, and everyone will need the new password.',
  },
};

export function ProtectionDialog({ documentId, mode, onClose, onDone }: { documentId: string; mode: ProtectionMode; onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const toast = useToast();
  const copy = COPY[mode];
  const needsCurrent = mode === 'change' || mode === 'remove';
  const needsNew = mode !== 'remove';
  const mismatch = needsNew && confirm.length > 0 && next !== confirm;
  const tooShort = needsNew && next.length > 0 && next.length < DOCUMENT_PASSWORD_MIN_LENGTH;
  const ready = (!needsCurrent || current) && (!needsNew || (next.length >= DOCUMENT_PASSWORD_MIN_LENGTH && next === confirm));

  const run = useMutation({
    mutationFn: () => {
      const base = `/documents/${documentId}/protection`;
      if (mode === 'protect') return post(base, { password: next });
      if (mode === 'change') return post(`${base}/change`, { currentPassword: current, newPassword: next });
      if (mode === 'remove') return post(`${base}/remove`, { currentPassword: current });
      return post(`${base}/reset`, { newPassword: next });
    },
    onSuccess: () => {
      toast(copy.done);
      onDone();
      onClose();
    },
  });

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={mode === 'remove' ? 'danger' : 'primary'} icon={LockIcon} busy={run.isPending} disabled={!ready} onClick={() => run.mutate()}>
            {copy.action}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) run.mutate();
        }}
        className="space-y-4"
      >
        <p className="text-sm leading-relaxed text-ink-soft">{copy.help}</p>
        {run.error && <ErrorNote>{errorMessage(run.error)}</ErrorNote>}
        {needsCurrent && (
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        )}
        {needsNew && (
          <>
            <Field label="New password" hint={`At least ${DOCUMENT_PASSWORD_MIN_LENGTH} characters.`} error={tooShort ? `Use at least ${DOCUMENT_PASSWORD_MIN_LENGTH} characters` : null}>
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
            </Field>
            <Field label="Repeat the new password" error={mismatch ? 'The two passwords are different' : null}>
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
