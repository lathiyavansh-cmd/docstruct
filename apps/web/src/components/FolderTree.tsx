import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderOpen, FolderPlus, MoreHorizontal } from 'lucide-react';
import type { FolderNodeDto } from '@docstruct/shared';
import { ApiError, del, errorMessage, patch, post } from '../lib/api';
import { useToast } from './toast';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Select, cx } from './ui';

function flatten(nodes: FolderNodeDto[], depth = 0): Array<FolderNodeDto & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/** Folder.Tree.View with create, rename, move and delete (UI-4). */
export function FolderTree({
  projectId,
  tree,
  selected,
  canEdit,
  canDelete,
}: {
  projectId: string;
  tree: FolderNodeDto[];
  selected: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: 'create' | 'rename' | 'move' | 'delete'; folder: FolderNodeDto | null } | null>(null);
  const isOpen = (id: string) => expanded.has(id) || flatten(tree).some((f) => f.folderId === selected && f.depth > 0 && isAncestor(tree, id, selected!));
  const toggle = (id: string) => setExpanded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const link = (folderId: string | null) => `/p/${projectId}/documents${folderId ? `?folder=${folderId}` : ''}`;

  const render = (nodes: FolderNodeDto[], depth: number) =>
    nodes.map((f) => (
      <li key={f.folderId}>
        <div className={cx('group flex items-center rounded-md pr-1', selected === f.folderId ? 'bg-primary-wash text-primary' : 'hover:bg-ink/5')} style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            onClick={() => toggle(f.folderId)}
            className={cx('rounded p-1 text-ink-faint', !f.children.length && 'invisible')}
            aria-label={isOpen(f.folderId) ? `Collapse ${f.name}` : `Expand ${f.name}`}
            aria-expanded={isOpen(f.folderId)}
          >
            <ChevronRight className={cx('size-3.5 transition-transform', isOpen(f.folderId) && 'rotate-90')} />
          </button>
          <Link to={link(f.folderId)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm">
            {selected === f.folderId ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0 text-ink-faint" />}
            <span className="truncate">{f.name}</span>
            {f.documentCount > 0 && <span className="ml-auto pl-2 text-xs text-ink-faint tabular">{f.documentCount}</span>}
          </Link>
          {(canEdit || canDelete) && (
            <FolderMenu
              name={f.name}
              canEdit={canEdit}
              canDelete={canDelete}
              onPick={(kind) => setDialog({ kind, folder: f })}
            />
          )}
        </div>
        {f.children.length > 0 && isOpen(f.folderId) && <ul>{render(f.children, depth + 1)}</ul>}
      </li>
    ));

  return (
    <nav aria-label="Folders">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-faint">Folders</span>
        {canEdit && (
          <button type="button" onClick={() => setDialog({ kind: 'create', folder: null })} className="rounded p-1 text-ink-soft hover:bg-ink/5 hover:text-ink" aria-label="New folder">
            <FolderPlus className="size-4" />
          </button>
        )}
      </div>
      <ul className="space-y-px">
        <li>
          <Link to={link(null)} className={cx('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm', selected === null ? 'bg-primary-wash text-primary' : 'hover:bg-ink/5')}>
            All documents
          </Link>
        </li>
        {render(tree, 0)}
      </ul>
      {dialog && <FolderDialog projectId={projectId} tree={tree} {...dialog} onClose={() => setDialog(null)} />}
    </nav>
  );
}

function isAncestor(tree: FolderNodeDto[], ancestorId: string, id: string): boolean {
  const find = (nodes: FolderNodeDto[]): FolderNodeDto | undefined => {
    for (const n of nodes) {
      if (n.folderId === ancestorId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
  };
  const node = find(tree);
  return !!node && flatten(node.children).some((c) => c.folderId === id);
}

function FolderMenu({ name, canEdit, canDelete, onPick }: { name: string; canEdit: boolean; canDelete: boolean; onPick: (kind: 'create' | 'rename' | 'move' | 'delete') => void }) {
  const [open, setOpen] = useState(false);
  const item = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-paper';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded p-1 text-ink-faint opacity-0 hover:bg-ink/5 focus:opacity-100 group-hover:opacity-100"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-rule bg-surface py-1 shadow-lg">
          {canEdit && (
            <>
              <button role="menuitem" className={item} onMouseDown={() => onPick('create')}>New subfolder</button>
              <button role="menuitem" className={item} onMouseDown={() => onPick('rename')}>Rename</button>
              <button role="menuitem" className={item} onMouseDown={() => onPick('move')}>Move</button>
            </>
          )}
          {canDelete && <button role="menuitem" className={cx(item, 'text-st-changes')} onMouseDown={() => onPick('delete')}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function FolderDialog({
  projectId,
  tree,
  kind,
  folder,
  onClose,
}: {
  projectId: string;
  tree: FolderNodeDto[];
  kind: 'create' | 'rename' | 'move' | 'delete';
  folder: FolderNodeDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(kind === 'rename' ? folder!.name : '');
  const [parentId, setParentId] = useState<string>(folder?.parentId ?? '');
  const [notEmpty, setNotEmpty] = useState<{ documents: number; subfolders: number } | null>(null);

  const run = useMutation({
    mutationFn: async (confirmed: boolean) => {
      if (kind === 'create') return post<FolderNodeDto[]>(`/projects/${projectId}/folders`, { name, parentId: folder?.folderId ?? null });
      if (kind === 'rename') return patch<FolderNodeDto[]>(`/folders/${folder!.folderId}`, { name });
      if (kind === 'move') return post<FolderNodeDto[]>(`/folders/${folder!.folderId}/move`, { parentId: parentId || null });
      return del<FolderNodeDto[]>(`/folders/${folder!.folderId}`, confirmed ? { confirm: 'true' } : undefined);
    },
    onSuccess: (newTree) => {
      queryClient.setQueryData(['folders', projectId], newTree);
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      toast(kind === 'create' ? `Created ${name}` : kind === 'rename' ? `Renamed to ${name}` : kind === 'move' ? `Moved ${folder!.name}` : `Deleted ${folder!.name}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'FOLDER_NOT_EMPTY') setNotEmpty(err.details as { documents: number; subfolders: number });
    },
  });

  if (kind === 'delete') {
    return (
      <ConfirmDialog
        title={`Delete ${folder!.name}?`}
        confirmLabel={notEmpty ? 'Delete folder and contents' : 'Delete folder'}
        danger
        busy={run.isPending}
        onConfirm={() => run.mutate(!!notEmpty)}
        onClose={onClose}
      >
        {run.error && !notEmpty && <ErrorNote className="mb-3">{errorMessage(run.error)}</ErrorNote>}
        {notEmpty ? (
          <>
            This folder contains {notEmpty.documents} document(s) and {notEmpty.subfolders} subfolder(s). They will be removed from view. Their
            versions and history are kept for the audit log.
          </>
        ) : (
          'The folder will be removed.'
        )}
      </ConfirmDialog>
    );
  }

  // Move targets: every folder except this one and its descendants (Folder.Move.Cycle, also enforced by the API).
  const all = flatten(tree);
  const blocked = folder ? new Set([folder.folderId, ...flatten(folder.children).map((f) => f.folderId)]) : new Set<string>();
  const title = kind === 'create' ? (folder ? `New folder in ${folder.name}` : 'New folder') : kind === 'rename' ? `Rename ${folder!.name}` : `Move ${folder!.name}`;
  const action = kind === 'create' ? 'Create folder' : kind === 'rename' ? 'Rename' : 'Move';

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={run.isPending} disabled={kind !== 'move' && !name.trim()} onClick={() => run.mutate(false)}>
            {action}
          </Button>
        </>
      }
    >
      {run.error && <ErrorNote>{errorMessage(run.error)}</ErrorNote>}
      {kind === 'move' ? (
        <Field label="Move into">
          {(id) => (
            <Select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Project root</option>
              {all.filter((f) => !blocked.has(f.folderId)).map((f) => (
                <option key={f.folderId} value={f.folderId}>
                  {' '.repeat(f.depth)}
                  {f.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <Field label="Folder name">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && run.mutate(false)}
            />
          )}
        </Field>
      )}
    </Modal>
  );
}
