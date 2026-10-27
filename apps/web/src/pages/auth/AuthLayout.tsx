/**
 * What this file does
 *   This is the shared frame around the login, sign-up and password pages. It shows a dark side panel that explains versioning, and a form area on the right.
 *
 * How it works
 *   - Takes three props: title (the heading), children (the form) and footer (links under the form).
 *   - Makes no API calls. It only arranges the layout.
 *   - The left panel is hidden on small screens (hidden ... lg:flex), so phones only see the form.
 *   - Spotlight, BlurFade, BorderBeam and motion are animations for looks only.
 *   - The DocStruct logo links back to the overview page at "/".
 *
 * Where it fits
 *   Used by LoginPage, SignUpPage, ForgotPasswordPage and ResetPasswordPage (/login, /signup, /forgot-password, /reset-password). Module: M01 Authentication (owner: Vansh).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BlurFade } from '../../components/magicui/blur-fade';
import { BorderBeam } from '../../components/magicui/border-beam';
import { Spotlight } from '../../components/motion-primitives/spotlight';

// The three steps listed on the left panel. Each item is [badge text, sentence].
const STEPS = [
  ['v1', 'Upload a draft. It becomes version 1 and stays forever.'],
  ['v2', 'Revise it. The new upload is version 2; nothing is overwritten.'],
  ['v2', 'Send it to a reviewer, who sees exactly what changed since v1.'],
] as const;

/** Shared frame of the login, sign-up and password screens (UI-2). */
export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        {/* A soft light follows the pointer across the panel (motion-primitives Spotlight). */}
        <Spotlight size={420} className="from-[#554dde]/50 via-[#3040c4]/25 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-violet/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary/30 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          aria-hidden
        />

        <motion.span initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <Link to="/" className="flex w-fit items-center gap-2 font-semibold" aria-label="DocStruct overview">
            <motion.img src="/favicon.svg" alt="" className="size-8" whileHover={{ rotate: -10, scale: 1.1 }} /> DocStruct
          </Link>
        </motion.span>
        <div className="relative max-w-md">
          <BlurFade delay={0.1}>
            <p className="font-serif text-3xl leading-snug">
              One project, one folder tree, and{' '}
              <span className="bg-gradient-to-r from-[#a9b4ff] to-[#c8c4f4] bg-clip-text text-transparent">one current version</span> of every document.
            </p>
          </BlurFade>
          <ol className="relative mt-10 space-y-3 text-sm text-white/75">
            {STEPS.map(([tag, text], i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.15, type: 'spring', stiffness: 300, damping: 26 }}
                whileHover={{ x: 6 }}
                className="relative flex items-center gap-4 overflow-hidden rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-white/[0.08]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet font-serif text-base text-white tabular shadow-lg">{tag}</span>
                <span>{text}</span>
                {i === 2 && <BorderBeam size={60} duration={6} colorFrom="#a9b4ff" colorTo="#554dde" />}
              </motion.li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-white/50">Mini Project, Sardar Patel Institute of Technology, 2026-27</p>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden px-5 py-12">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]" aria-hidden />
        <BlurFade delay={0.05} className="relative w-full max-w-sm">
          <Link to="/" className="mb-6 flex w-fit items-center gap-2 font-semibold lg:hidden" aria-label="DocStruct overview">
            <img src="/favicon.svg" alt="" className="size-7" /> DocStruct
          </Link>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {/* The form passed in by the page (login, sign-up or password) goes here. */}
          {children}
          {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}
        </BlurFade>
      </section>
    </div>
  );
}
