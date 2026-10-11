import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin } from 'lucide-react';
import type { AnnotationDto, RegionDto } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { useToast } from './toast';
import { Avatar, Button, ErrorNote, TextArea, cx } from './ui';
import { CheckIcon, MessageSquareIcon, SendIcon } from './icons';

/**
 * M07 feedback in context: comment threads on the version being viewed (Annot.List), new comments optionally
 * pinned to a PDF region (Annot.Create.Anchor), replies (Annot.Reply) and resolution (Annot.Resolve).
 */
export function AnnotationsPanel({
  documentId,
  versionId,
  versionNo,
  isCurrent,
  isPdf,
  threads,
  canCreate,
  canReply,
  canResolve,
  placing,
  anchor,
  onStartPlacing,
  onClearAnchor,
  activeId,
  onSelect,
}: {
  documentId: string;
  versionId: string;
  versionNo: number;
  isCurrent: boolean;
  isPdf: boolean;
  threads: AnnotationDto[];
  canCreate: boolean;
  canReply: boolean;
  canResolve: boolean;
  placing: boolean;
  anchor: { page: number; region: RegionDto } | null;
  onStartPlacing: () => void;
  onClearAnchor: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['annotations', versionId] });
  };

  const create = useMutation({
    mutationFn: () => post<AnnotationDto>(`/documents/${documentId}/annotations`, { body, pageNumber: anchor?.page ?? null, region: anchor?.region ?? null }),
    onSuccess: () => {
      setBody('');
      onClearAnchor();
      refresh();
      toast('Comment added');
    },
  });

  const open = threads.filter((t) => !t.resolvedAt);
  const resolved = threads.filter((t) => t.resolvedAt);
  const pinNumber = (id: string) => threads.filter((t) => t.region).findIndex((t) => t.annotationId === id) + 1;

  return (
    <section aria-labelledby="comments-heading" className="space-y-4">
      <h2 id="comments-heading" className="font-semibold">
        Comments on version {versionNo} <span className="font-normal text-ink-faint tabular">({open.length} open)</span>
      </h2>

      {canCreate && isCurrent && (
        <div className="space-y-2">
          {create.error && <ErrorNote>{errorMessage(create.error)}</ErrorNote>}
          <TextArea aria-label="New comment" placeholder="Add a comment on this version" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" icon={MessageSquareIcon} busy={create.isPending} disabled={!body.trim()} onClick={() => create.mutate()}>
              Add comment
            </Button>
            {isPdf &&
              (anchor ? (
                <span className="flex items-center gap-1 text-[13px] text-ink-soft">
                  <MapPin className="size-3.5" /> Pinned to page {anchor.page}
                  <button type="button" className="ml-1 text-primary hover:underline" onClick={onClearAnchor}>Remove pin</button>
                </span>
              ) : (
                <Button variant="quiet" size="sm" onClick={onStartPlacing} disabled={placing}>
                  <MapPin className="size-3.5" /> {placing ? 'Drag a box on the page' : 'Pin to the page'}
                </Button>
              ))}
          </div>
        </div>
      )}
      {!isCurrent && <p className="text-[13px] text-ink-faint">Comments are added to the current version. These belong to version {versionNo}.</p>}

      {open.length === 0 && <p className="text-sm text-ink-soft">No open comments.</p>}
      <ul className="space-y-3">
        {open.map((t) => (
          <Thread key={t.annotationId} thread={t} pin={pinNumber(t.annotationId)} active={activeId === t.annotationId} onSelect={onSelect} canReply={canReply} canResolve={canResolve} onChange={refresh} />
        ))}
      </ul>
      {resolved.length > 0 && (
        <div>
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="mt-3 space-y-3">
              {resolved.map((t) => (
                <Thread key={t.annotationId} thread={t} pin={pinNumber(t.annotationId)} active={activeId === t.annotationId} onSelect={onSelect} canReply={false} canResolve={false} onChange={refresh} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Thread({
  thread: t,
  pin,
  active,
  onSelect,
  canReply,
  canResolve,
  onChange,
}: {
  thread: AnnotationDto;
  pin: number;
  active: boolean;
  onSelect: (id: string) => void;
  canReply: boolean;
  canResolve: boolean;
  onChange: () => void;
}) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const send = useMutation({
    mutationFn: () => post<AnnotationDto>(`/annotations/${t.annotationId}/replies`, { body: reply }),
    onSuccess: () => {
      setReply('');
      setReplying(false);
      onChange();
    },
  });
  const resolve = useMutation({
    mutationFn: () => post<AnnotationDto>(`/annotations/${t.annotationId}/resolve`),
    onSuccess: () => {
      toast('Comment resolved');
      onChange();
    },
  });

  return (
    <li
      className={cx('rounded-lg border p-3 text-sm', active ? 'border-primary' : 'border-rule', t.resolvedAt && 'bg-paper/70')}
      onClick={() => onSelect(t.annotationId)}
    >
      <div className="flex items-start gap-2">
        <Avatar name={t.author.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p>
            <span className="font-medium">{t.author.displayName}</span>{' '}
            <time className="text-[12.5px] text-ink-faint" title={formatDateTime(t.createdAt)}>{timeAgo(t.createdAt)}</time>
            {t.pageNumber && (
              <span className="ml-2 rounded bg-st-review-wash px-1.5 text-[12px] text-st-review">
                {pin > 0 ? `${pin}, ` : ''}page {t.pageNumber}
              </span>
            )}
            {t.reviewId && <span className="ml-2 text-[12px] text-ink-faint">review comment</span>}
          </p>
          <p className="mt-1 whitespace-pre-wrap font-serif leading-relaxed">{t.body}</p>
          {t.replies.map((r) => (
            <div key={r.annotationId} className="mt-2 border-l-2 border-rule pl-3">
              <p>
                <span className="font-medium">{r.author.displayName}</span>{' '}
                <time className="text-[12.5px] text-ink-faint">{timeAgo(r.createdAt)}</time>
              </p>
              <p className="whitespace-pre-wrap font-serif leading-relaxed">{r.body}</p>
            </div>
          ))}
          {t.resolvedAt && t.resolvedBy && (
            <p className="mt-2 flex items-center gap-1 text-[12.5px] text-st-approved">
              <Check className="size-3.5" /> Resolved by {t.resolvedBy.displayName}, {timeAgo(t.resolvedAt)}
            </p>
          )}
          {(send.error || resolve.error) && <ErrorNote className="mt-2">{errorMessage(send.error ?? resolve.error)}</ErrorNote>}
          {!t.resolvedAt && (canReply || canResolve) && (
            <div className="mt-2">
              {replying ? (
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  <TextArea aria-label="Reply" value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} className="min-h-14" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" icon={SendIcon} busy={send.isPending} disabled={!reply.trim()} onClick={() => send.mutate()}>Reply</Button>
                    <Button size="sm" variant="quiet" onClick={() => setReplying(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {canReply && <Button size="sm" variant="quiet" onClick={() => setReplying(true)}>Reply</Button>}
                  {canResolve && <Button size="sm" variant="quiet" icon={CheckIcon} busy={resolve.isPending} onClick={() => resolve.mutate()}>Resolve</Button>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
