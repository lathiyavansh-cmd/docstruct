/**
 * What this file does
 *   The Review section of a document page. It shows the open review, lets the assigned reviewer approve
 *   or request changes, lets members send the document for review, and lists past reviews.
 *
 * How it works
 *   - Loads all reviews of the document: query key ['reviews', documentId], GET /documents/:id/reviews.
 *     The one with status PENDING is the open review.
 *   - Decision buttons show only for the assigned reviewer. Cancel shows for the sender or anyone with 'review.cancel.any'.
 *   - One useMutation handles approve, request changes and cancel (POST /reviews/:id/approve, /request-changes, /cancel).
 *   - SubmitDialog picks a reviewer from members with a reviewer role and calls POST /documents/:id/reviews.
 *   - After any action, refresh() invalidates the reviews, document, review queue, dashboard and document list queries.
 *
 * Where it fits
 *   Used by DocumentPage. Shows PreReviewPanel from PreReview.tsx inside the open review. Module: M05 review workflow (owner: Vivan).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REVIEWER_ROLES, ROLE_LABEL, canTransition, type DocumentDetailDto, type ProjectDto, type ReviewDto, type TemplateCheckDto } from '@docstruct/shared';
import { errorMessage, get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dueLabel, formatDateTime, timeAgo } from '../lib/format';
import { useCan, useMembers } from '../lib/hooks';
import { PreReviewPanel } from './PreReview';
import { useToast } from './toast';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Notice, Select, StatusBadge, TextArea } from './ui';
import { BadgeCheckIcon, BellIcon, RotateCcwIcon, SendIcon, XIcon } from './icons';

/** M05 on the document page: the open review, the reviewer's decision, submission and the review history. */
export function ReviewPanel({ document: doc, project }: { document: DocumentDetailDto; project: ProjectDto }) {
  const { user } = useAuth();
  const allowed = useCan(project);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<'approve' | 'changes' | 'cancel' | null>(null);
  const [note, setNote] = useState('');

  const history = useQuery({ queryKey: ['reviews', doc.documentId], queryFn: () => get<ReviewDto[]>(`/documents/${doc.documentId}/reviews`) });
  // A document has at most one PENDING review at a time; that is the "open" one.
  const open = history.data?.find((r) => r.status === 'PENDING') ?? null;
  // Only the person picked as reviewer can decide. These checks only hide buttons; the API checks again.
  const isReviewer = !!open && open.reviewer.userId === user?.userId;
  const canCancel = !!open && (open.submittedBy.userId === user?.userId || allowed('review.cancel.any'));

  // A review changes the document status, so every screen that shows status or the queue must reload.
  const refresh = () => {
    for (const key of [['reviews', doc.documentId], ['document', doc.documentId], ['review-queue'], ['dashboard', project.projectId], ['documents', project.projectId]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // kind picks the endpoint. Approve and request changes send the decision note; cancel sends nothing.
  const act = useMutation({
    mutationFn: (kind: 'approve' | 'changes' | 'cancel') =>
      kind === 'approve'
        ? post<ReviewDto>(`/reviews/${open!.reviewId}/approve`, { note })
        : kind === 'changes'
          ? post<ReviewDto>(`/reviews/${open!.reviewId}/request-changes`, { note })
          : post<ReviewDto>(`/reviews/${open!.reviewId}/cancel`),
    onSuccess: (_r, kind) => {
      toast(kind === 'approve' ? 'Approved' : kind === 'changes' ? 'Changes requested' : 'Review cancelled');
      setConfirm(null);
      setNote('');
      refresh();
    },
    onError: () => setConfirm(null),
  });

  // Review.Nudge: the submitter or an owner reminds the reviewer (once a day; the server enforces the gap).
  const nudge = useMutation({
    mutationFn: () => post<ReviewDto>(`/reviews/${open!.reviewId}/nudge`),
    onSuccess: (r) => {
      toast(`Reminded ${r.reviewer.displayName}`);
      queryClient.invalidateQueries({ queryKey: ['reviews', doc.documentId] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const nudgedToday = !!open?.nudgedAt && Date.now() - new Date(open.nudgedAt).getTime() < 24 * 60 * 60 * 1000;

  // Can send for review if the role allows it, nothing is open, and the status rules allow moving to UNDER_REVIEW.
  const canSubmit = allowed('review.submit') && !open && canTransition(doc.status, 'UNDER_REVIEW');

  return (
    <section aria-labelledby="review-heading" className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 id="review-heading" className="font-semibold">Review</h2>
        {canSubmit && (
          <Button variant="primary" size="sm" icon={SendIcon} onClick={() => setSubmitting(true)}>
            Send for review
          </Button>
        )}
      </div>
      {act.error && <ErrorNote>{errorMessage(act.error)}</ErrorNote>}

      {open ? (
        <div className="space-y-4 rounded-xl border border-st-review/30 bg-st-review-wash/40 p-4">
          <div className="text-sm">
            <p>
              <strong className="font-medium">{open.reviewer.displayName}</strong> is reviewing version {open.versionNo}.
              {open.dueDate && (
                <span className={open.overdue ? 'ml-1.5 rounded-full bg-st-changes-wash px-2 py-0.5 text-[12.5px] font-medium text-st-changes' : 'ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[12.5px] text-ink-soft ring-1 ring-rule'}>
                  {dueLabel(open.dueDate, open.daysUntilDue)}
                </span>
              )}
            </p>
            {open.nudgedAt && (
              <p className="text-ink-soft">
                Reminded {timeAgo(open.nudgedAt)}{open.nudgeCount > 1 && ` (${open.nudgeCount} times)`}.
              </p>
            )}
            <p className="text-ink-soft">Sent by {open.submittedBy.displayName} on {formatDateTime(open.createdAt)}</p>
            {open.submissionNote && <p className="mt-2 font-serif text-ink-soft">“{open.submissionNote}”</p>}
          </div>

          {(isReviewer || allowed('diff.read')) && (
            <div className="rounded-md border border-rule bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold">What changed since the previous version</h3>
              <PreReviewPanel reviewId={open.reviewId} documentId={doc.documentId} />
            </div>
          )}

          {isReviewer && (
            <div className="space-y-3">
              <Field label="Decision note" hint="Shown with the document. Required when requesting changes.">
                {(id) => <TextArea id={id} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={BadgeCheckIcon} onClick={() => setConfirm('approve')}>
                  Approve version {open.versionNo}
                </Button>
                <Button icon={RotateCcwIcon} onClick={() => setConfirm('changes')} disabled={!note.trim()}>
                  Request changes
                </Button>
              </div>
            </div>
          )}
          {canCancel && !isReviewer && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={BellIcon} busy={nudge.isPending} disabled={nudgedToday} title={nudgedToday ? 'Reminded in the last 24 hours' : undefined} onClick={() => nudge.mutate()}>
                {nudgedToday ? 'Reminded today' : 'Remind reviewer'}
              </Button>
              <Button variant="quiet" size="sm" icon={XIcon} onClick={() => setConfirm('cancel')}>
                Cancel review
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          {doc.status === 'APPROVED'
            ? 'The current version is approved. Uploading a new version returns the document to Draft.'
            : doc.status === 'CHANGES_REQUESTED'
              ? 'Changes were requested. Upload a revised version, then send it for review again.'
              : doc.status === 'ARCHIVED'
                ? 'This document is archived.'
                : 'Not under review.'}
        </p>
      )}

      {!!history.data?.filter((r) => r.status !== 'PENDING').length && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          <ol className="space-y-3 border-l border-rule pl-4">
            {history.data
              .filter((r) => r.status !== 'PENDING')
              .map((r) => (
                <li key={r.reviewId} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-ink-soft">
                      Version {r.versionNo} by {r.reviewer.displayName}
                      {(r.decidedAt ?? r.cancelledAt) && <>, {formatDateTime((r.decidedAt ?? r.cancelledAt)!)}</>}
                    </span>
                  </div>
                  {r.decisionNote && <p className="mt-1 font-serif text-ink-soft">{r.decisionNote}</p>}
                </li>
              ))}
          </ol>
        </div>
      )}

      {submitting && <SubmitDialog document={doc} project={project} onClose={() => setSubmitting(false)} onDone={refresh} />}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'approve' ? `Approve version ${open?.versionNo}?` : confirm === 'changes' ? 'Request changes?' : 'Cancel this review?'}
          confirmLabel={confirm === 'approve' ? 'Approve' : confirm === 'changes' ? 'Request changes' : 'Cancel review'}
          danger={confirm !== 'approve'}
          busy={act.isPending}
          onConfirm={() => act.mutate(confirm)}
          onClose={() => setConfirm(null)}
        >
          {confirm === 'approve' && 'The decision is final and is recorded in the review history. The document becomes Approved.'}
          {confirm === 'changes' && 'The document returns to the author with your note. The decision is recorded in the review history.'}
          {confirm === 'cancel' && 'The reviewer will no longer see this document in their queue, and it returns to its previous status.'}
        </ConfirmDialog>
      )}
    </section>
  );
}

function SubmitDialog({ document: doc, project, onClose, onDone }: { document: DocumentDetailDto; project: ProjectDto; onClose: () => void; onDone: () => void }) {
  const members = useMembers(project.projectId);
  const toast = useToast();
  // If the document has a template, warn when sections are still missing (the submitter may still send it).
  const check = useQuery({ queryKey: ['template-check', doc.documentId], queryFn: () => get<TemplateCheckDto | null>(`/documents/${doc.documentId}/template-check`) });
  const missing = check.data?.status === 'DONE' ? check.data.items.filter((i) => !i.found).map((i) => i.heading) : [];
  // Only members whose role can review appear in the reviewer drop-down.
  const eligible = members.data?.filter((m) => REVIEWER_ROLES.includes(m.role)) ?? [];
  const [reviewerId, setReviewerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const submit = useMutation({
    mutationFn: () => post<ReviewDto>(`/documents/${doc.documentId}/reviews`, { reviewerId, dueDate: dueDate || null, note }),
    onSuccess: (r) => {
      toast(`Sent to ${r.reviewer.displayName} for review`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal
      title={`Send version ${doc.currentVersion.versionNo} for review`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={SendIcon} busy={submit.isPending} disabled={!reviewerId} onClick={() => submit.mutate()}>
            Send for review
          </Button>
        </>
      }
    >
      {submit.error && <ErrorNote>{errorMessage(submit.error)}</ErrorNote>}
      {missing.length > 0 && (
        <Notice className="mb-4">
          Against the {check.data!.template.name} template this version is missing {missing.length === 1 ? 'a section' : `${missing.length} sections`}: {missing.join(', ')}. You can still send it, but the reviewer will see the gap.
        </Notice>
      )}
      <Field label="Reviewer" hint="Members with the Reviewer or Owner role can review.">
        {(id) => (
          <Select id={id} value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
            <option value="">Choose a reviewer</option>
            {eligible.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName} ({ROLE_LABEL[m.role]}){m.isYou ? ', you' : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Due date" hint="Optional.">
        {(id) => <Input id={id} type="date" min={new Date().toISOString().slice(0, 10)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
      </Field>
      <Field label="Note to the reviewer" hint="Optional. What should they focus on?">
        {(id) => <TextArea id={id} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <p className="text-[13px] text-ink-faint">DocStruct will compare this version with the previous one and give the reviewer a summary of the changes.</p>
    </Modal>
  );
}
