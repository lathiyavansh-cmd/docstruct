import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import type { CreatedShareLinkDto, ShareLinkDto } from '@docstruct/shared';
import { errorMessage, get, post } from '../lib/api';
import { formatDate, formatDateTime, timeAgo } from '../lib/format';
import { useToast } from './toast';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Notice, cx } from './ui';

/** M07 share links for owners: create (with optional expiry), copy once, revoke (Share.*). */
export function SharePanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const links = useQuery({ queryKey: ['shares', documentId], queryFn: () => get<ShareLinkDto[]>(`/documents/${documentId}/shares`) });
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [created, setCreated] = useState<CreatedShareLinkDto | null>(null);
  const [revoking, setRevoking] = useState<ShareLinkDto | null>(null);

  const create = useMutation({
    mutationFn: () =>
      post<CreatedShareLinkDto>(`/documents/${documentId}/shares`, {
        label,
        // The chosen day is inclusive: the link works until the end of that day, local time.
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      }),
    onSuccess: (link) => {
      setCreated(link);
      setLabel('');
      setExpires('');
      queryClient.invalidateQueries({ queryKey: ['shares', documentId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => post<ShareLinkDto>(`/shares/${shareId}/revoke`),
    onSuccess: () => {
      toast('Link revoked');
      setRevoking(null);
      queryClient.invalidateQueries({ queryKey: ['shares', documentId] });
    },
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Select the link and copy it manually', 'error');
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-semibold">Share links</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A link lets someone without an account view and download the current version of this document only. They cannot comment or change
          anything.
        </p>
      </div>

      {created && (
        <Notice className="space-y-2 border-st-approved/40 bg-st-approved-wash/50">
          <p className="font-medium text-ink">Link created. Copy it now: it will not be shown again.</p>
          <div className="flex gap-2">
            <Input readOnly value={created.url} onFocus={(e) => e.target.select()} aria-label="Share link" />
            <Button onClick={() => copy(created.url)}>
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </Notice>
      )}

      <div className="space-y-3 rounded-lg border border-rule p-4">
        {create.error && <ErrorNote>{errorMessage(create.error)}</ErrorNote>}
        <Field label="Label" hint="Optional, for your own reference, such as who received it.">
          {(id) => <Input id={id} maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <Field label="Expires after" hint="Optional. Leave empty for a link that works until you revoke it.">
          {(id) => <Input id={id} type="date" min={new Date().toISOString().slice(0, 10)} value={expires} onChange={(e) => setExpires(e.target.value)} />}
        </Field>
        <Button variant="primary" busy={create.isPending} onClick={() => create.mutate()}>
          Create share link
        </Button>
      </div>

      {links.error && <ErrorNote>{errorMessage(links.error)}</ErrorNote>}
      {!!links.data?.length && (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {links.data.map((l) => (
            <li key={l.shareId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className={cx('font-medium', !l.active && 'text-ink-faint line-through')}>{l.label || 'Untitled link'}</p>
                <p className="text-[13px] text-ink-soft">
                  Created by {l.createdBy.displayName} {timeAgo(l.createdAt)}
                  {l.revokedAt ? `, revoked ${formatDateTime(l.revokedAt)}` : l.expiresAt ? `, ${l.active ? 'expires' : 'expired'} ${formatDate(l.expiresAt)}` : ''}
                  {`, opened ${l.accessCount} ${l.accessCount === 1 ? 'time' : 'times'}`}
                </p>
              </div>
              {l.active && (
                <Button size="sm" variant="quiet" onClick={() => setRevoking(l)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {revoking && (
        <ConfirmDialog
          title="Revoke this link?"
          confirmLabel="Revoke link"
          danger
          busy={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.shareId)}
          onClose={() => setRevoking(null)}
        >
          Anyone holding the link loses access immediately. This cannot be undone; you can create a new link later.
        </ConfirmDialog>
      )}
    </section>
  );
}
