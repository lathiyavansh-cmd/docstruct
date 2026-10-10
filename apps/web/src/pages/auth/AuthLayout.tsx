import type { ReactNode } from 'react';

/** Shared frame of the login, sign-up and password screens (UI-2). */
export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <span className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" /> DocStruct
        </span>
        <div className="max-w-md">
          <p className="font-serif text-3xl leading-snug">One project, one folder tree, and one current version of every document.</p>
          <ol className="mt-10 space-y-4 text-sm text-white/75">
            {[
              ['v1', 'Upload a draft. It becomes version 1 and stays forever.'],
              ['v2', 'Revise it. The new upload is version 2; nothing is overwritten.'],
              ['v2', 'Send it to a reviewer, who sees exactly what changed since v1.'],
            ].map(([tag, text], i) => (
              <li key={i} className="flex gap-4">
                <span className="w-8 shrink-0 font-serif text-lg text-white tabular">{tag}</span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-white/50">Mini Project, Sardar Patel Institute of Technology, 2026-27</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
          {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
