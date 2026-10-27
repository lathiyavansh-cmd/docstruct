/**
 * What this file does
 *   Shows entries from a project's activity log as readable lines, such as
 *   "Asha uploaded version 2 of Report.pdf, 3 min ago".
 *
 * How it works
 *   - describe() maps each action code (like 'review.approved') to a short sentence.
 *   - kindOf() picks an icon and colour for each kind of action.
 *   - ActivityItem draws one entry: icon or avatar, actor name, sentence, a link to the document and the time.
 *   - ActivityFeed takes the entries as a prop (it loads nothing itself) and shows them in an AnimatedList.
 *
 * Where it fits
 *   ActivityFeed is used on DashboardPage (recent activity). ActivityItem is used on ActivityPage (full log).
 *   Module: M09 activity log (owner: Vivan).
 */
import { Link } from 'react-router-dom';
import type { ActivityEntryDto } from '@docstruct/shared';
import { ROLE_LABEL, type ProjectRole } from '@docstruct/shared';
import { formatDateTime, timeAgo } from '../lib/format';
import { ActivityIcon, AnimateIcon, BadgeCheckIcon, ClipboardCheckIcon, LinkIcon, MessageSquareIcon, RefreshCwIcon, RotateCcwIcon, Trash2Icon, UploadIcon, UsersIcon } from './icons';
import { AnimatedList } from './magicui/animated-list';
import { Avatar, cx, type AnimatedIcon } from './ui';

/** Readable sentence for one activity-log entry (Log.Record.Detail: actor, action, entity, time). */
export function describe(entry: ActivityEntryDto): string {
  // detail holds extra facts saved with the entry, such as the old and new role or the version number.
  const d = entry.detail as Record<string, string | number | null>;
  const role = (r: unknown) => (typeof r === 'string' && r in ROLE_LABEL ? ROLE_LABEL[r as ProjectRole].toLowerCase() : String(r));
  switch (entry.action) {
    case 'project.created': return 'created the project';
    case 'project.updated': return 'updated the project details';
    case 'project.archived': return 'archived the project';
    case 'member.added': return `added ${entry.entityLabel} as ${role(d.role)}`;
    case 'member.role_changed': return `changed ${entry.entityLabel}'s role from ${role(d.from)} to ${role(d.to)}`;
    case 'member.removed': return `removed ${entry.entityLabel} from the project`;
    case 'folder.created': return `created the folder ${entry.entityLabel}`;
    case 'folder.renamed': return `renamed the folder ${d.from} to ${entry.entityLabel}`;
    case 'folder.moved': return `moved the folder ${entry.entityLabel}`;
    case 'folder.deleted': return `deleted the folder ${entry.entityLabel}`;
    case 'document.uploaded': return 'uploaded';
    case 'document.updated': return 'edited the details of';
    case 'document.moved': return 'moved';
    case 'document.deleted': return 'deleted';
    case 'document.archived': return 'archived';
    case 'document.protected': return 'protected with a password';
    case 'document.password_changed': return 'changed the password of';
    case 'document.password_reset': return 'reset the forgotten password of';
    case 'document.unprotected': return 'removed the password from';
    case 'document.shared_members': return `sent to ${d.recipients} member${d.recipients === 1 ? '' : 's'}`;
    case 'version.uploaded': return `uploaded version ${d.versionNo} of`;
    case 'version.restored': return `restored version ${d.restoredFrom} as version ${d.versionNo} of`;
    case 'review.submitted': return 'sent for review';
    case 'review.approved': return 'approved';
    case 'review.changes_requested': return 'requested changes to';
    case 'review.cancelled': return 'cancelled the review of';
    case 'annotation.created': return 'commented on';
    case 'annotation.resolved': return 'resolved a comment on';
    case 'share.created': return 'created a share link for';
    case 'share.revoked': return 'revoked a share link for';
    default: return entry.action;
  }
}

// Entries about these entity types name a document, so the document title is shown after the sentence.
const DOCUMENT_ENTITIES = new Set(['document', 'version', 'review', 'annotation', 'share']);

/** Small icon per kind of entry, so the timeline can be scanned by eye. */
function kindOf(action: string): { icon: AnimatedIcon; tone: string } {
  if (action.startsWith('review.approved')) return { icon: BadgeCheckIcon, tone: 'bg-st-approved-wash text-st-approved' };
  if (action.startsWith('review.changes')) return { icon: RotateCcwIcon, tone: 'bg-st-changes-wash text-st-changes' };
  if (action.startsWith('review.')) return { icon: ClipboardCheckIcon, tone: 'bg-st-review-wash text-st-review' };
  if (action.startsWith('annotation.')) return { icon: MessageSquareIcon, tone: 'bg-primary-wash text-violet' };
  if (action.startsWith('share.')) return { icon: LinkIcon, tone: 'bg-primary-wash text-primary' };
  if (action.startsWith('member.')) return { icon: UsersIcon, tone: 'bg-paper text-ink-soft' };
  if (action.startsWith('version.restored')) return { icon: RefreshCwIcon, tone: 'bg-primary-wash text-primary' };
  if (action.startsWith('version.') || action === 'document.uploaded') return { icon: UploadIcon, tone: 'bg-primary-wash text-primary' };
  if (action.endsWith('.deleted')) return { icon: Trash2Icon, tone: 'bg-st-changes-wash text-st-changes' };
  return { icon: ActivityIcon, tone: 'bg-paper text-ink-soft' };
}

export function ActivityItem({ entry, as: Tag = 'li', className, showKind }: { entry: ActivityEntryDto; as?: 'li' | 'div'; className?: string; showKind?: boolean }) {
  const actor = entry.actor?.displayName ?? 'Someone';
  const onDocument = DOCUMENT_ENTITIES.has(entry.entityType) && entry.entityLabel;
  const kind = kindOf(entry.action);
  const KindIcon = kind.icon;
  // A deleted document has no page to open, so its title is shown as plain text instead of a link.
  return (
    <AnimateIcon animateOnHover asChild>
      <Tag className={cx('group flex gap-3 py-2.5', className)}>
        {showKind ? (
          <span className={cx('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-surface transition-transform group-hover:scale-110', kind.tone)}>
            <KindIcon size={14} />
          </span>
        ) : (
          <Avatar name={actor} size="sm" />
        )}
        <div className="min-w-0 text-sm leading-relaxed">
          <span className="font-medium">{actor}</span> {describe(entry)}{' '}
          {onDocument &&
            (entry.action === 'document.deleted' ? (
              <span className="font-medium">{entry.entityLabel}</span>
            ) : (
              <Link to={`/d/${entry.entityId}`} className="font-medium text-primary hover:underline">
                {entry.entityLabel}
              </Link>
            ))}
          <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)} className="ml-2 whitespace-nowrap text-[13px] text-ink-faint">
            {timeAgo(entry.createdAt)}
          </time>
        </div>
      </Tag>
    </AnimateIcon>
  );
}

/**
 * Recent entries replayed as they happened: Magic UI's AnimatedList drops each one in on top of the last,
 * so the newest ends up first.
 */
export function ActivityFeed({ entries }: { entries: ActivityEntryDto[] }) {
  // The list is reversed (oldest first) because AnimatedList puts each new item on top.
  return (
    <AnimatedList delay={260} className="mt-3 items-stretch gap-2">
      {[...entries].reverse().map((e) => (
        <ActivityItem key={e.logId} entry={e} as="div" showKind className="rounded-xl border border-rule bg-surface px-3 shadow-card transition-colors hover:border-primary/30" />
      ))}
    </AnimatedList>
  );
}
