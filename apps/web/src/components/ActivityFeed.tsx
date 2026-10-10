import { Link } from 'react-router-dom';
import type { ActivityEntryDto } from '@docstruct/shared';
import { ROLE_LABEL, type ProjectRole } from '@docstruct/shared';
import { formatDateTime, timeAgo } from '../lib/format';
import { Avatar } from './ui';

/** Readable sentence for one activity-log entry (Log.Record.Detail: actor, action, entity, time). */
export function describe(entry: ActivityEntryDto): string {
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

const DOCUMENT_ENTITIES = new Set(['document', 'version', 'review', 'annotation', 'share']);

export function ActivityItem({ entry }: { entry: ActivityEntryDto }) {
  const actor = entry.actor?.displayName ?? 'Someone';
  const onDocument = DOCUMENT_ENTITIES.has(entry.entityType) && entry.entityLabel;
  return (
    <li className="flex gap-3 py-2.5">
      <Avatar name={actor} size="sm" />
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
    </li>
  );
}

export function ActivityFeed({ entries }: { entries: ActivityEntryDto[] }) {
  return (
    <ul className="divide-y divide-rule">
      {entries.map((e) => (
        <ActivityItem key={e.logId} entry={e} />
      ))}
    </ul>
  );
}
