import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import { SquarePlusIcon } from './icons';
import type { FolderNodeDto } from '@docstruct/shared';
import { ApiError, del, errorMessage, patch, post } from '../lib/api';
import { useToast } from './toast';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Select, cx, IconButton } from './ui';

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
        <div className={cx('group relative flex items-center rounded-lg pr-1 transition-colors', selected === f.folderId ? 'text-primary' : 'hover:bg-primary-wash/50')} style={{ paddingLeft: depth * 14 }}>
          {/* The selection slides between folders. */}
          {selected === f.folderId && <motion.span layoutId="folder-selected" className="absolute inset-0 rounded-lg bg-primary-wash" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <button
            type="button"
            onClick={() => toggle(f.folderId)}
            className={cx('relative rounded p-1 text-ink-faint', !f.children.length && 'invisible')}
            aria-label={isOpen(f.folderId) ? `Collapse ${f.name}` : `Expand ${f.name}`}
            aria-expanded={isOpen(f.folderId)}
          >
            <ChevronRight className={cx('size-3.5 transition-transform', isOpen(f.folderId) && 'rotate-90')} />
          </button>
          <Link to={link(f.folderId)} className="relative flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm">
            {selected === f.folderId ? (
              <FolderOpen className="size-4 shrink-0" />
            ) : (
              <Folder className="size-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:-rotate-8 group-hover:text-primary" />
            )}
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
        <AnimatePresence initial={false}>
          {f.children.length > 0 && isOpen(f.folderId) && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="overflow-hidden">
              {render(f.children, depth + 1)}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    ));

  return (
    <nav aria-label="Folders">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-faint">Folders</span>
        {canEdit && (
          <IconButton icon={SquarePlusIcon} label="New folder" onClick={() => setDialog({ kind: 'create', folder: null })} className="size-7" />
        )}
      </div>
      <ul className="space-y-px">
        <li>
          <Link to={link(null)} className={cx('relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors', selected === null ? 'text-primary' : 'hover:bg-primary-wash/50')}>
            {selected === null && <motion.span layoutId="folder-selected" className="absolute inset-0 rounded-lg bg-primary-wash" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">All documents</span>
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
  const item = 'block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-primary-wash hover:text-primary';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="relative rounded p-1 text-ink-faint opacity-0 hover:bg-surface hover:text-primary focus:opacity-100 group-hover:opacity-100"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          style={{ transformOrigin: 'top right' }}
          className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-rule bg-surface p-1 shadow-lift"
        >
          {canEdit && (
            <>
              <button role="menuitem" className={item} onMouseDown={() => onPick('create')}>New subfolder</button>
              <button role="menuitem" className={item} onMouseDown={() => onPick('rename')}>Rename</button>
              <button role="menuitem" className={item} onMouseDown={() => onPick('move')}>Move</button>
            </>
          )}
          {canDelete && <button role="menuitem" className={cx(item, 'text-st-changes hover:bg-st-changes-wash hover:text-st-changes')} onMouseDown={() => onPick('delete')}>Delete</button>}
        </motion.div>
      )}
      </AnimatePresence>
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
