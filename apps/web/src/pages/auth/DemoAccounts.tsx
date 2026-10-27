/**
 * What this file does
 *   The "Demo accounts" list under the login form: one click fills in a demo account's email and password.
 *
 * How it works
 *   - useQuery ['demo-accounts'] loads GET /demo-accounts. The server answers only in demo mode, so on a
 *     real installation the request fails quietly and nothing is shown.
 *   - Each row shows the person's name, role and email; clicking it calls onPick(email, password).
 *   - The list folds open and closed, and remembers nothing.
 *
 * Where it fits
 *   Rendered by pages/auth/LoginPage.tsx. Accounts come from apps/api/src/db/demo-data.ts. Module: M01 Authentication (owner: Vansh).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { DemoAccountsDto } from '@docstruct/shared';
import { get } from '../../lib/api';
import { ChevronDownIcon } from '../../components/icons';
import { Avatar } from '../../components/ui';

export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const [open, setOpen] = useState(true);
  // retry: false because outside demo mode the answer is always 404.
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: () => get<DemoAccountsDto>('/demo-accounts'), retry: false, staleTime: Infinity });
  if (!demo.data) return null;
  const { accounts, password, documentPassword } = demo.data;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="font-medium">Demo accounts</span>
          <span className="ml-2 text-[13px] text-ink-faint">password {password}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-flex text-ink-faint">
          <ChevronDownIcon size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <ul className="divide-y divide-rule border-t border-rule">
              {accounts.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    title={a.tryThis}
                    onClick={() => onPick(a.email, password)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary-wash/60"
                  >
                    <Avatar name={a.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {a.name} <span className="font-normal text-ink-soft">· {a.role}</span>
                      </span>
                    </span>
                    <span className="hidden truncate text-[12.5px] text-ink-faint sm:block">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-rule bg-paper/60 px-4 py-2 text-[12.5px] text-ink-faint">
              Click a person to fill in the form. The protected contract in Campus Canteen App opens with {documentPassword}.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
