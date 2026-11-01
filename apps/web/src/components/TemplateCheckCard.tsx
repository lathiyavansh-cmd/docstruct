/**
 * What this file does
 *   The "Template check" card on the document page: which template the document is checked against and
 *   which required sections its current version has or is missing.
 *
 * How it works
 *   - useQuery ['template-check', documentId] loads GET /documents/:id/template-check (null = no template).
 *   - useQuery ['templates', projectId] loads the project's templates for the chooser (editors only).
 *   - Choosing a template calls PUT /documents/:id/template and replaces the check from the response.
 *   - While the version's text is still being read (status PENDING) the query polls every 1.5 seconds.
 *
 * Where it fits
 *   Used by pages/DocumentPage.tsx under the summary. Templates are managed on the project's Templates tab.
 *   Module: templates (owner: Vansh).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { TemplateCheckDto, TemplateDto } from '@docstruct/shared';
import { errorMessage, get, put } from '../lib/api';
import { CheckIcon, ChevronDownIcon, ClipboardListIcon, XIcon } from './icons';
import { useToast } from './toast';
import { ErrorNote, Select, cx } from './ui';

export function TemplateCheckCard({ documentId, projectId, canEdit }: { documentId: string; projectId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(true);
  const queryClient = useQueryClient();
  const toast = useToast();
  const check = useQuery({
    queryKey: ['template-check', documentId],
    queryFn: () => get<TemplateCheckDto | null>(`/documents/${documentId}/template-check`),
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 1500 : false),
  });
  const templates = useQuery({ queryKey: ['templates', projectId], queryFn: () => get<TemplateDto[]>(`/projects/${projectId}/templates`), enabled: canEdit });
  const choose = useMutation({
    mutationFn: (templateId: string | null) => put<TemplateCheckDto | null>(`/documents/${documentId}/template`, { templateId }),
    // The response is the fresh check (or null when the template was removed), so it goes straight into the cache.
    onSuccess: (result: TemplateCheckDto | null) => {
      queryClient.setQueryData(['template-check', documentId], result);
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
      toast(result ? `Checked against ${result.template.name}` : 'Template removed');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const c = check.data ?? null;
  // Nothing to show for a viewer when no template is chosen and there is nothing to choose from.
  if (!c && (!canEdit || !templates.data?.length)) return null;

  const chooser = canEdit && templates.data && (
    <Select aria-label="Template" value={c?.template.templateId ?? ''} onChange={(e) => choose.mutate(e.target.value || null)} disabled={choose.isPending} className="h-8 w-auto text-[13px]">
      <option value="">No template</option>
      {templates.data.map((t) => (
        <option key={t.templateId} value={t.templateId}>
          {t.name}
        </option>
      ))}
    </Select>
  );

  return (
    <section aria-labelledby="template-heading" className="mb-5 overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex min-w-0 items-center gap-2 text-left">
          <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-lg text-white', !c ? 'bg-ink-faint' : c.status !== 'DONE' ? 'bg-ink-faint' : c.complete ? 'bg-st-approved' : 'bg-st-review')}>
            <ClipboardListIcon size={15} animateOnHover />
          </span>
          <h2 id="template-heading" className="font-semibold">Template check</h2>
          {c && (
            <span className={cx('rounded-full px-2 py-0.5 text-[12.5px] font-medium', c.status !== 'DONE' ? 'bg-paper text-ink-soft' : c.complete ? 'bg-st-approved-wash text-st-approved' : 'bg-st-review-wash text-st-review')}>
              {c.status === 'PENDING' ? 'Reading the text…' : c.status === 'UNAVAILABLE' ? 'Text unavailable' : c.complete ? 'All sections present' : `${c.missing} missing`}
            </span>
          )}
          <motion.span animate={{ rotate: open ? 0 : -90 }} className="inline-flex text-ink-faint group-hover:text-ink">
            <ChevronDownIcon size={15} />
          </motion.span>
        </button>
        <div className="ml-auto">{chooser}</div>
      </div>
      {check.error && <ErrorNote className="mx-4 mb-4">{errorMessage(check.error)}</ErrorNote>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            {!c ? (
              <p className="border-t border-rule px-4 py-3 text-[13px] text-ink-soft">Choose a template to check that this document has every required section.</p>
            ) : (
              <div className="border-t border-rule px-4 py-3">
                <p className="mb-2 text-[12.5px] text-ink-faint">
                  {c.template.name} · version {c.versionNo}
                  {c.status === 'UNAVAILABLE' && ' · the text of this version could not be read, so it cannot be checked'}
                </p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {c.items.map((item) => (
                    <li key={item.heading} className={cx('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', item.found ? 'text-ink' : 'bg-st-review-wash/60 text-st-review')}>
                      <span className={cx('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full', item.found ? 'bg-st-approved text-white' : 'bg-st-review text-white')}>
                        {item.found ? <CheckIcon size={11} /> : <XIcon size={11} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{item.heading}</span>
                        {item.found && item.matchedHeading && item.matchedHeading.toLowerCase() !== item.heading.toLowerCase() && (
                          <span className="block truncate text-[12px] text-ink-faint">found as “{item.matchedHeading}”</span>
                        )}
                        {!item.found && c.status === 'DONE' && <span className="block text-[12px]">not found in this version</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {c.extraHeadings.length > 0 && (
                  <p className="mt-2 text-[12.5px] text-ink-faint">Also in the document: {c.extraHeadings.join(', ')}</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
