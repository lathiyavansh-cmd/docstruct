/**
 * What this file does
 *   The "Use a demo account" strip under the login card: open it, click a person, and their email and
 *   password are filled in.
 *
 * How it works
 *   - useQuery ['demo-accounts'] loads GET /demo-accounts. The server answers only in demo mode, so on a
 *     real installation the request fails quietly and nothing is shown.
 *   - It starts folded shut so the page reads as a plain login. Opening it slides the list down.
 *   - Clicking a person calls onPick(email, password), folds the list away and names who was filled in.
 *
 * Where it fits
 *   Passed as `below` to AuthLayout by pages/auth/LoginPage.tsx. Accounts come from apps/api/src/db/demo-data.ts. Module: M01 Authentication (owner: Vansh).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { DemoAccountsDto } from '@docstruct/shared';
import { get } from '../../lib/api';
import { ChevronDownIcon } from '../../components/icons';
import { Avatar } from '../../components/ui';

const EASE = [0.22, 1, 0.36, 1] as const;

export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // retry: false because outside demo mode the answer is always 404.
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => get<DemoAccountsDto>('/demo-accounts'), retry: false, staleTime: Infinity });
  if (!demo.data) return null;
  const { accounts, password, documentPassword } = demo.data;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-surface/80 shadow-card ring-1 ring-rule backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-wash/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">Use a demo account</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={picked ?? 'hint'}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="block truncate text-[12.5px] text-ink-faint"
            >
              {picked ? `Filled in as ${picked}. Press Log in.` : `${accounts.length} ready-made people · password ${password}`}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="inline-flex shrink-0 text-ink-faint">
          <ChevronDownIcon size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <ul className="border-t border-rule py-1">
              {accounts.map((a, i) => (
                <motion.li key={a.email} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i, duration: 0.25, ease: EASE }}>
                  <button
                    type="button"
                    title={a.tryThis}
                    onClick={() => {
                      onPick(a.email, password);
                      setPicked(a.name);
                      setOpen(false);
                    }}
                    className="group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-primary-wash/60"
                  >
                    <Avatar name={a.name} size="sm" />
                    <span className="min-w-0 flex-1 transition-transform duration-300 group-hover:translate-x-0.5">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-ink-faint">{a.role}</span>
                    </span>
                    <span className="text-xs font-medium text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">Use</span>
                  </button>
                </motion.li>
              ))}
            </ul>
            <p className="border-t border-rule bg-paper/60 px-4 py-2 text-[12px] text-ink-faint">
              The protected contract in Campus Canteen App opens with {documentPassword}.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
