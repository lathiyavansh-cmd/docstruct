/**
 * What this file does
 *   This is the shared frame around the login, sign-up and password pages: one centred card with the form,
 *   on a quiet background. Everything else about DocStruct lives on the overview page at "/".
 *
 * How it works
 *   - Takes four props: title (the heading), children (the form), footer (links under the form) and
 *     below (an optional extra under the card, used by the login page for the demo accounts).
 *   - Makes no API calls. It only arranges the layout.
 *   - The DocStruct logo in the corner links back to the overview page.
 *   - A soft light follows the pointer (Spotlight) and the card fades in (BlurFade); both are for looks only.
 *
 * Where it fits
 *   Used by LoginPage, SignUpPage, ForgotPasswordPage and ResetPasswordPage (/login, /signup, /forgot-password, /reset-password). Module: M01 Authentication (owner: Vansh).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BlurFade } from '../../components/magicui/blur-fade';
import { Spotlight } from '../../components/motion-primitives/spotlight';

/** Shared frame of the login, sign-up and password screens (UI-2). */
export function AuthLayout({ title, children, footer, below }: { title: string; children: ReactNode; footer?: ReactNode; below?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      {/* A faint violet light drifts after the pointer across the whole page. */}
      <Spotlight size={520} className="from-[#c8c4f4]/70 via-[#edecfc]/50 to-transparent" />
      <div className="bg-dots pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary-wash blur-3xl" aria-hidden />

      <header className="relative px-5 py-5 sm:px-8">
        <Link to="/" className="group flex w-fit items-center gap-2 font-semibold text-ink" aria-label="DocStruct overview">
          <motion.img src="/favicon.svg" alt="" className="size-8" whileHover={{ rotate: -10, scale: 1.08 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} />
          DocStruct
        </Link>
      </header>

      <main className="relative flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <BlurFade delay={0.05}>
            <div className="rounded-2xl bg-surface/90 p-7 shadow-[0_1px_2px_rgb(21_23_43/0.04),0_24px_60px_-24px_rgb(48_64_196/0.25)] ring-1 ring-rule backdrop-blur-sm">
              <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
              {/* The form passed in by the page (login, sign-up or password) goes here. */}
              {children}
              {footer && <div className="mt-6 border-t border-rule pt-5 text-center text-sm text-ink-soft">{footer}</div>}
            </div>
          </BlurFade>
          {below && <BlurFade delay={0.15}>{below}</BlurFade>}
        </div>
      </main>
    </div>
  );
}
