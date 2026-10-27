/**
 * What this file does
 *   The dialog a project owner uses to send a document to every member of the project at once.
 *
 * How it works
 *   - Shows how many members will receive it and an optional note.
 *   - Posts to POST /documents/:id/share-members; the server adds the document to each member's
 *     "Shared with me" list in one step, however many members there are.
 *   - A password-protected document stays protected: members still need the password to open it.
 *
 * Where it fits
 *   Opened from the More menu on pages/DocumentPage.tsx. Module: M07 Sharing (owner: Shrut).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage, post } from '../lib/api';
import { plural } from '../lib/format';
import { SendIcon } from './icons';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Modal, Notice, TextArea } from './ui';

export function ShareWithMembersDialog({
  documentId,
  title,
  otherMembers,
  isProtected,
  onClose,
}: {
  documentId: string;
  title: string;
  /** Project members other than the sender. */
  otherMembers: number;
  isProtected: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => post<{ recipients: number }>(`/documents/${documentId}/share-members`, { note }),
    onSuccess: (r) => {
      toast(`Sent to ${plural(r.recipients, 'member')}`);
      // The activity log and dashboard show the new "sent to members" entry.
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
  return (
    <Modal
      title="Send to all members"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={SendIcon} busy={send.isPending} disabled={otherMembers === 0} onClick={() => send.mutate()}>
            Send to {plural(otherMembers, 'member')}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        <strong className="font-medium text-ink">{title}</strong> will appear in the <strong className="font-medium text-ink">Shared with me</strong> list of every
        member of this project ({plural(otherMembers, 'person', 'people')}), marked as new until they open it.
      </p>
      {isProtected && <Notice>This document is password protected. Members will still need the password to open it, so share it with those who should read it.</Notice>}
      {send.error && <ErrorNote>{errorMessage(send.error)}</ErrorNote>}
      <Field label="Note to members" hint="Optional. For example, what to look at or by when.">
        {(id) => <TextArea id={id} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />}
      </Field>
    </Modal>
  );
}
