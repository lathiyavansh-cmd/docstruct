import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { DocumentSummaryDto } from '@docstruct/shared';
import { errorMessage, get } from '../lib/api';
import { ChevronDownIcon, CopyIcon, SparklesIcon } from './icons';
import { useToast } from './toast';
import { ErrorNote, IconButton, MachineLabel, Notice, Spinner, cx } from './ui';

type Level = 'short' | 'medium' | 'detailed';
const LEVELS: Array<[Level, string]> = [
  ['short', 'Short'],
  ['medium', 'Medium'],
  ['detailed', 'Detailed'],
];

/**
 * Summary of the version being viewed, produced by DocStruct's own summariser: the most important
 * sentences in reading order, key terms and, for longer documents, the gist of each section.
 */
export function SummaryCard({ versionId, versionNo }: { versionId: string; versionNo: number }) {
  const [level, setLevel] = useState<Level>('short');
  const [open, setOpen] = useState(true);
  const toast = useToast();
  const summary = useQuery({
    queryKey: ['summary', versionId],
    queryFn: () => get<DocumentSummaryDto>(`/versions/${versionId}/summary`),
    // Keep asking while the text of a just-uploaded version is still being read.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 1500 : false),
  });
  const s = summary.data;
  const chosen = s?.levels?.[level] ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chosen.map((x) => x.text).join(' '));
      toast('Copied the summary');
    } catch {
      toast('Could not copy the summary', 'error');
    }
  };

  return (
    <section aria-labelledby="summary-heading" className="mb-5 overflow-hidden rounded-2xl border border-rule bg-gradient-to-br from-primary-wash/60 via-surface to-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex min-w-0 items-center gap-2 text-left">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-[0_4px_12px_-4px_rgb(48_64_196/0.6)]">
            <SparklesIcon size={15} animateOnHover />
          </span>
          <h2 id="summary-heading" className="font-semibold">Summary</h2>
          <span className="text-[13px] text-ink-faint tabular">of version {versionNo}</span>
          <motion.span animate={{ rotate: open ? 0 : -90 }} className="inline-flex text-ink-faint group-hover:text-ink">
            <ChevronDownIcon size={15} />
          </motion.span>
        </button>
        <MachineLabel />
        {open && s?.status === 'READY' && (
          <div className="ml-auto flex items-center gap-1">
            <div className="flex rounded-lg bg-paper p-0.5 ring-1 ring-rule" role="group" aria-label="Summary length">
              {LEVELS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={level === id}
                  onClick={() => setLevel(id)}
                  className={cx('relative rounded-md px-2.5 py-1 text-[12.5px] transition-colors', level === id ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink')}
                >
                  {level === id && (
                    <motion.span layoutId="summary-level" className="absolute inset-0 rounded-md bg-surface shadow-card ring-1 ring-rule" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
                  )}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            <IconButton icon={CopyIcon} label="Copy the summary" onClick={copy} />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="border-t border-rule/70 px-4 pb-4 pt-3">
              {summary.isLoading && <Spinner label="Summarising" />}
              {summary.error && <ErrorNote>{errorMessage(summary.error)}</ErrorNote>}
              {s?.status === 'PENDING' && <Spinner label="Reading the text of this version" />}
              {s?.status === 'UNAVAILABLE' && <Notice>{s.reason}</Notice>}
              {s?.status === 'READY' && s.stats && (
                <>
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {chosen.map((x, i) => (
                        <motion.li
                          key={x.position}
                          layout
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ delay: Math.min(i, 8) * 0.03 }}
                          className="flex gap-2.5 font-serif text-[15px] leading-relaxed"
                        >
                          <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-violet" aria-hidden />
                          <span>
                            {x.text}
                            {x.section && <span className="ml-2 whitespace-nowrap font-sans text-[12px] text-ink-faint">{x.section}</span>}
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>

                  {level === 'detailed' && s.outline.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">Section by section</p>
                      <dl className="space-y-1.5 rounded-xl bg-paper/70 p-3 text-sm ring-1 ring-rule">
                        {s.outline.map((o) => (
                          <div key={o.heading} className="grid gap-x-3 sm:grid-cols-[10rem_1fr]">
                            <dt className="truncate font-medium">{o.heading}</dt>
                            <dd className="text-ink-soft">{o.sentence}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {s.keyTerms.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[12.5px] font-medium text-ink-soft">Key terms</span>
                      {s.keyTerms.map((t) => (
                        <span key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-[12.5px] text-primary ring-1 ring-primary/15 transition-colors hover:bg-primary-wash">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-3 text-[12.5px] text-ink-faint tabular">
                    {s.stats.words.toLocaleString()} words, about {s.stats.readingMinutes} min to read. This summary keeps {chosen.length} of {s.stats.sentences}{' '}
                    sentences, picked by DocStruct&apos;s summariser ({s.engine}).
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
