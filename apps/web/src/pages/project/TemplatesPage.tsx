/**
 * What this file does
 *   The project's "Templates" tab: the checklists of required section headings, and for each one which
 *   documents use it and whether they are complete.
 *
 * How it works
 *   - useQuery ['templates', projectId] loads GET /projects/:id/templates.
 *   - Owners create, edit and delete templates (POST / PATCH / DELETE). Headings are typed one per line.
 *   - Opening a template loads GET /projects/:id/templates/:tid/compliance: every document checked
 *     against it, incomplete ones first, each linking to the document.
 *
 * Where it fits
 *   Route /p/:projectId/templates in App.tsx, inside ProjectLayout. A document picks its template on the
 *   document page (TemplateCheckCard). Module: templates (owner: Vansh).
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { TemplateComplianceDto, TemplateDto } from '@docstruct/shared';
import { CheckIcon, ClipboardListIcon, PlusIcon, SettingsIcon, Trash2Icon, XIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { Button, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, Skeleton, StatusBadge, TextArea, cx } from '../../components/ui';
import { del, errorMessage, get, patch, post } from '../../lib/api';
import { useCan, useCurrentProject } from '../../lib/hooks';

export function TemplatesPage() {
  const project = useCurrentProject();
  const allowed = useCan(project);
  const queryClient = useQueryClient();
  const toast = useToast();
  const templates = useQuery({ queryKey: ['templates', project.projectId], queryFn: () => get<TemplateDto[]>(`/projects/${project.projectId}/templates`) });
  const [editing, setEditing] = useState<TemplateDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TemplateDto | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['templates', project.projectId] });
    queryClient.invalidateQueries({ queryKey: ['template-check'] });
  };
  const remove = useMutation({
    mutationFn: (t: TemplateDto) => del(`/projects/${project.projectId}/templates/${t.templateId}`),
    onSuccess: (_r, t) => {
      toast(`Deleted ${t.name}`);
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="px-5 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Document templates</h2>
          <p className="text-sm text-ink-soft">A template lists the sections a document must have. Pick one on a document's page and DocStruct checks every new version.</p>
        </div>
        {allowed('template.manage') && (
          <Button variant="primary" icon={PlusIcon} onClick={() => setEditing('new')}>
            New template
          </Button>
        )}
      </div>
      {templates.isLoading && <Skeleton rows={2} />}
      {templates.error && <ErrorNote>{errorMessage(templates.error)}</ErrorNote>}
      {templates.data?.length === 0 && (
        <EmptyState icon={ClipboardListIcon} title="No templates yet" action={allowed('template.manage') ? <Button variant="primary" icon={PlusIcon} onClick={() => setEditing('new')}>New template</Button> : undefined}>
          {allowed('template.manage') ? 'Create one, for example "SRS checklist" with Introduction, Functional Requirements and Acceptance Criteria.' : 'The project owner has not set up any templates.'}
        </EmptyState>
      )}
      <ul className="space-y-3">
        {templates.data?.map((t) => (
          <li key={t.templateId} className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setOpenId(openId === t.templateId ? null : t.templateId)} aria-expanded={openId === t.templateId} className="min-w-0 flex-1 text-left">
                <p className="font-medium">
                  {t.name} <span className="text-[13px] font-normal text-ink-faint tabular">{t.headings.length} sections · {t.documentCount} document{t.documentCount === 1 ? '' : 's'}</span>
                </p>
                {t.description && <p className="text-[13px] text-ink-soft">{t.description}</p>}
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {t.headings.map((h, i) => (
                    <span key={h} className="rounded-md bg-paper px-1.5 py-0.5 text-[12px] text-ink-soft ring-1 ring-rule">
                      {i + 1}. {h}
                    </span>
                  ))}
                </p>
              </button>
              {allowed('template.manage') && (
                <div className="flex gap-1">
                  <IconButton icon={SettingsIcon} label="Edit template" onClick={() => setEditing(t)} />
                  <IconButton icon={Trash2Icon} label="Delete template" onClick={() => setDeleting(t)} />
                </div>
              )}
            </div>
            <AnimatePresence initial={false}>
              {openId === t.templateId && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <Compliance projectId={project.projectId} template={t} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
      {editing && <TemplateDialog projectId={project.projectId} template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={refresh} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        >
          {deleting.documentCount > 0
            ? `${deleting.documentCount} document${deleting.documentCount === 1 ? ' uses' : 's use'} this template. They keep their files; only the check disappears.`
            : 'No document uses this template.'}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Every document using the template, incomplete ones first. */
function Compliance({ projectId, template }: { projectId: string; template: TemplateDto }) {
  const rows = useQuery({ queryKey: ['template-compliance', template.templateId], queryFn: () => get<TemplateComplianceDto[]>(`/projects/${projectId}/templates/${template.templateId}/compliance`) });
  return (
    <div className="border-t border-rule bg-paper/50 px-4 py-3">
      {rows.isLoading && <Skeleton rows={2} />}
      {rows.error && <ErrorNote>{errorMessage(rows.error)}</ErrorNote>}
      {rows.data?.length === 0 && <p className="text-[13px] text-ink-soft">No document uses this template yet. Open a document and choose it under "Template check".</p>}
      <ul className="divide-y divide-rule">
        {rows.data?.map(({ document: d, check }) => (
          <li key={d.documentId} className="flex flex-wrap items-center gap-3 py-2.5">
            <Link to={`/d/${d.documentId}`} className="min-w-0 flex-1 font-medium transition-colors hover:text-primary">
              {d.title} <span className="text-[13px] font-normal text-ink-faint tabular">v{d.currentVersion.versionNo}</span>
            </Link>
            <StatusBadge status={d.status} />
            <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', check.status !== 'DONE' ? 'bg-paper text-ink-soft ring-1 ring-rule' : check.complete ? 'bg-st-approved-wash text-st-approved' : 'bg-st-review-wash text-st-review')}>
              {check.status !== 'DONE' ? <ClipboardListIcon size={12} /> : check.complete ? <CheckIcon size={12} /> : <XIcon size={12} />}
              {check.status === 'PENDING' ? 'Reading…' : check.status === 'UNAVAILABLE' ? 'Text unavailable' : check.complete ? 'Complete' : `Missing: ${check.items.filter((i) => !i.found).map((i) => i.heading).join(', ')}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateDialog({ projectId, template, onClose, onDone }: { projectId: string; template: TemplateDto | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [headings, setHeadings] = useState(template?.headings.join('\n') ?? '');
  const list = headings.split('\n').map((h) => h.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, headings: list };
      return template ? patch<TemplateDto>(`/projects/${projectId}/templates/${template.templateId}`, body) : post<TemplateDto>(`/projects/${projectId}/templates`, body);
    },
    onSuccess: (t) => {
      toast(template ? `Saved ${t.name}` : `Created ${t.name}`);
      onDone();
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && list.length) save.mutate();
  }
  return (
    <Modal
      title={template ? 'Edit template' : 'New template'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={CheckIcon} busy={save.isPending} disabled={!name.trim() || !list.length} onClick={() => save.mutate()}>
            {template ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {save.error && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
        <Field label="Name">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="SRS checklist" autoFocus />}</Field>
        <Field label="Description" hint="Optional.">
          {(id) => <Input id={id} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Required sections" hint="One heading per line, in the order they should appear. Numbering and small wording differences are ignored when checking.">
          {(id) => <TextArea id={id} value={headings} rows={8} onChange={(e) => setHeadings(e.target.value)} placeholder={'Introduction\nFunctional Requirements\nNon-functional Requirements\nAcceptance Criteria'} className="font-mono text-[13px]" />}
        </Field>
        <p className="text-[13px] text-ink-faint">{list.length} section{list.length === 1 ? '' : 's'}</p>
      </form>
    </Modal>
  );
}
