/**
 * What this file does
 *   The overview page a logged-out visitor sees at "/": what DocStruct is, what it does and how a document
 *   moves through it, with buttons to log in or create an account.
 *
 * How it works
 *   - Sections from top to bottom: navigation bar, hero (with the interactive VersionStack card), numbers,
 *     feature tabs (FeatureTabs), the scroll timeline, the "built in-house" grid, questions and a final call to action.
 *   - The navigation bar is see-through over the dark hero and turns solid once the page is scrolled.
 *   - Everything on the page is sample content; it makes no API calls. The buttons link to /login and /signup.
 *   - Animations come from 21st.dev components (Rolling Digits, Aceternity Timeline, Spotlight, BorderBeam,
 *     BlurFade, MagicCard) and motion; people who ask for less motion get still versions.
 *   - A soft ring trails the cursor and the main buttons lean towards it (SmoothPointer.tsx); the menu has a
 *     sliding hover pill, and each demo carries a "Try it" hint.
 *
 * Where it fits
 *   Shown by RequireAuth in App.tsx when nobody is logged in and the address is "/". Logged-in users go
 *   straight to their projects. Module: app shell / landing page (owner: Vansh).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { AnimatedBackground } from '../../components/motion-primitives/animated-background';
import { ArrowRight, Braces, FileSearch, FileText, GitCompareArrows, KeyRound, Plus, ScanSearch, Sparkles, TextSearch } from 'lucide-react';
import { BlurFade } from '../../components/magicui/blur-fade';
import { BorderBeam } from '../../components/magicui/border-beam';
import { Spotlight } from '../../components/motion-primitives/spotlight';
import { RollingDigits } from '../../components/iconiq-ui/rolling-digits';
import { Timeline, type TimelineEntry } from '../../components/aceternity/timeline';
import { GlowCard, StatusBadge, cx } from '../../components/ui';
import { FeatureTabs } from './FeatureTabs';
import { CursorRing, Magnetic } from './SmoothPointer';
import { VersionStack } from './VersionStack';

const NAV = [
  ['features', 'Features'],
  ['how', 'How it works'],
  ['built', 'Built in-house'],
  ['faq', 'Questions'],
] as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Navigation ────────────────────────────────────────────────────────────────── */

function NavBar() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  // Solid once the dark hero has scrolled out from under the bar (the hero is much taller on phones).
  useMotionValueEvent(scrollY, 'change', (y) => setSolid(y > (document.getElementById('top')?.offsetHeight ?? window.innerHeight) - 64));

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,color] duration-300',
        solid ? 'bg-surface/80 text-ink shadow-[0_1px_0_var(--color-rule)] backdrop-blur-xl' : 'text-white',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <a href="#top" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: 'smooth' }))} className="flex items-center gap-2 font-semibold">
          <motion.img src="/favicon.svg" alt="" className="size-8" whileHover={{ rotate: -10, scale: 1.08 }} />
          DocStruct
        </a>
        {/* A soft pill slides between the links as the pointer moves across them. */}
        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          <AnimatedBackground enableHover className={cx('rounded-full', solid ? 'bg-paper' : 'bg-white/10')} transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}>
            {NAV.map(([id, label]) => (
              <a
                key={id}
                data-id={id}
                href={`#${id}`}
                onClick={(e) => (e.preventDefault(), scrollToSection(id))}
                className={cx('rounded-full px-3.5 py-1.5 text-sm transition-colors', solid ? 'text-ink-soft hover:text-ink' : 'text-white/70 hover:text-white')}
              >
                {label}
              </a>
            ))}
          </AnimatedBackground>
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/login" className={cx('rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors', solid ? 'hover:bg-paper' : 'hover:bg-white/10')}>
            Log in
          </Link>
          <Magnetic strength={0.2}>
            <Link
              to="/signup"
              className={cx(
                'group flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow]',
                solid ? 'bg-ink text-white hover:bg-primary hover:shadow-lift' : 'bg-white text-ink hover:bg-primary-wash hover:shadow-[0_6px_24px_-6px_rgb(169_180_255/0.7)]',
              )}
            >
              Sign up
              <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Magnetic>
        </div>
      </nav>
    </header>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────────────── */

// Kept short so the first line of the headline never wraps when the word changes.
const WORDS = ['document', 'report', 'contract', 'proposal'];

function RotatingWord() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, [reduceMotion]);
  return (
    // All words share one grid cell; the current one sits in place while the previous one lifts away and the
    // next waits below, so the change is a single continuous slide with no empty moment.
    <span className="relative inline-grid overflow-hidden pb-[0.12em] align-bottom" aria-live="off">
      {WORDS.map((word, n) => {
        const offset = (n - i + WORDS.length) % WORDS.length;
        const state = offset === 0 ? 'current' : offset === WORDS.length - 1 ? 'previous' : 'next';
        return (
          <motion.span
            key={word}
            aria-hidden={state !== 'current'}
            initial={false}
            animate={{
              y: state === 'current' ? '0%' : state === 'previous' ? '-70%' : '70%',
              opacity: state === 'current' ? 1 : 0,
              filter: state === 'current' ? 'blur(0px)' : 'blur(6px)',
            }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="col-start-1 row-start-1 whitespace-nowrap"
          >
            {word},
          </motion.span>
        );
      })}
    </span>
  );
}

const STATS = [
  { value: 13, label: 'pre-review rules', note: 'Wording, numbers, dates, placeholders and sections; each finding names its rule' },
  { value: 178, label: 'automated tests', note: '171 on the server and 7 in the browser, run on every change' },
  { value: 4, label: 'project roles', note: 'Owner, editor, reviewer and viewer, checked on every request' },
  { value: 12, label: 'hours per unlock', note: 'A protected document asks for its password again after that' },
];

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-ink text-white">
      <Spotlight size={520} className="from-[#554dde]/40 via-[#3040c4]/20 to-transparent" />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-violet/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-32 top-1/3 size-[28rem] rounded-full bg-primary/25 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(rgb(255_255_255/0.11)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-32 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-40">
        <div>
          <BlurFade delay={0.05}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 text-xs text-white/75 ring-1 ring-white/15 backdrop-blur">
              <span className="rounded-full bg-gradient-to-r from-primary to-violet px-2 py-0.5 font-medium text-white">New</span>
              Review reminders and document templates
            </span>
          </BlurFade>
          <BlurFade delay={0.12}>
            <h1 className="mt-6 font-serif text-[40px] leading-[1.05] tracking-tight sm:text-6xl lg:text-[64px]">
              <span className="whitespace-nowrap">
                Every <RotatingWord />
              </span>
              <br />
              <span className="bg-gradient-to-r from-[#a9b4ff] via-[#c8c4f4] to-white bg-clip-text text-transparent">one current version.</span>
            </h1>
          </BlurFade>
          <BlurFade delay={0.2}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              DocStruct keeps every version of your project's documents, shows reviewers exactly what changed and checks each revision
              before anyone starts reading.
            </p>
          </BlurFade>
          <BlurFade delay={0.28}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Magnetic>
                <Link
                  to="/signup"
                  className="group relative flex h-12 items-center gap-2 overflow-hidden rounded-full bg-white px-6 font-medium text-ink shadow-[0_8px_30px_-6px_rgb(169_180_255/0.55)] transition-[box-shadow,scale] duration-500 hover:shadow-[0_14px_44px_-8px_rgb(169_180_255/0.85)] active:scale-[0.97]"
                >
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-wash to-transparent transition-transform duration-1000 group-hover:translate-x-full" aria-hidden />
                  <span className="relative">Create an account</span>
                  <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </Link>
              </Magnetic>
              <Magnetic>
                <Link to="/login" className="flex h-12 items-center rounded-full px-6 font-medium text-white ring-1 ring-white/25 transition-[background-color,box-shadow] duration-500 hover:bg-white/10 hover:ring-white/40">
                  Log in
                </Link>
              </Magnetic>
            </div>
            <p className="mt-5 text-sm text-white/50">
              Ten demo accounts are ready on the login page · password <span className="font-mono text-white/75">demo1234</span>
            </p>
          </BlurFade>
        </div>

        <BlurFade delay={0.3} className="lg:pl-4">
          <VersionStack />
          <p className="mt-8 text-center text-xs text-white/45">
            <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-[#a9b4ff] align-middle" aria-hidden />
            Click v1 to v4 to step through the history yourself
          </p>
        </BlurFade>
      </div>

      <div className="relative border-t border-white/10 bg-white/[0.02]">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={cx('py-8 pr-4 lg:py-10', i > 0 && 'lg:border-l lg:border-white/10 lg:pl-8', i % 2 === 1 && 'border-l border-white/10 pl-4 lg:pl-8')}>
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <RollingDigits value={s.value} className="font-serif text-4xl text-white sm:text-5xl" />
                <p className="mt-2 text-sm font-medium text-white/85">{s.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/45">{s.note}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ── Shared section heading ────────────────────────────────────────────────────── */

function SectionHeading({ eyebrow, title, children, center }: { eyebrow: string; title: string; children?: ReactNode; center?: boolean }) {
  return (
    <BlurFade inView className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl leading-tight text-ink sm:text-[42px]">{title}</h2>
      {children && <p className="mt-4 text-lg text-ink-soft">{children}</p>}
    </BlurFade>
  );
}

/* ── How it works ──────────────────────────────────────────────────────────────── */

function StepOutput({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-rule">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Result</p>
      {children}
    </div>
  );
}

function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'insert' | 'delete' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[13px]',
        tone === 'insert' && 'bg-mark-insert text-ink',
        tone === 'delete' && 'bg-mark-delete text-ink line-through decoration-mark-delete-rule',
        tone === 'plain' && 'bg-paper text-ink-soft ring-1 ring-rule',
      )}
    >
      {children}
    </span>
  );
}

const STEPS: TimelineEntry[] = [
  {
    label: 'Step 1',
    title: 'Upload',
    content: (
      <div>
        <p className="text-ink-soft">Drop in a PDF, Word file, Markdown or plain text. DocStruct reads the text so it can be searched, compared and summarised.</p>
        <StepOutput>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <FileText className="size-5 text-primary" aria-hidden />
            <span className="font-medium">Canteen_SRS.md</span>
            <span className="text-ink-faint">→</span>
            <span className="rounded-md bg-primary-wash px-2 py-0.5 font-serif text-primary">v1</span>
            <span className="whitespace-nowrap text-xs text-ink-faint sm:ml-auto">text read · 4 sections</span>
          </div>
        </StepOutput>
      </div>
    ),
  },
  {
    label: 'Step 2',
    title: 'Revise',
    content: (
      <div>
        <p className="text-ink-soft">Upload again with a short note. The new file becomes the next version, and the old one stays exactly as it was.</p>
        <StepOutput>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-paper px-2 py-0.5 font-serif text-ink-faint line-through decoration-ink-faint/50">v1</span>
            <ArrowRight className="size-3.5 text-ink-faint" aria-hidden />
            <span className="rounded-md bg-gradient-to-r from-primary to-violet px-2 py-0.5 font-serif text-white">v2</span>
            <span className="text-ink-soft">by Priya Nair · "Tightened the ordering rule"</span>
          </div>
        </StepOutput>
      </div>
    ),
  },
  {
    label: 'Step 3',
    title: 'Compare',
    content: (
      <div>
        <p className="text-ink-soft">Pick any two versions. Paragraphs are lined up first, then words, so moved and reworded text is easy to follow.</p>
        <StepOutput>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="delete">should</Chip>
            <Chip tone="insert">shall</Chip>
            <Chip tone="delete">10</Chip>
            <Chip tone="insert">15</Chip>
            <Chip>3 paragraphs changed</Chip>
          </div>
        </StepOutput>
      </div>
    ),
  },
  {
    label: 'Step 4',
    title: 'Pre-review',
    content: (
      <div>
        <p className="text-ink-soft">The rules run on what changed and give the reviewer a short list of things worth a second look.</p>
        <StepOutput>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="rounded-md bg-st-changes-wash px-2 py-0.5 font-medium text-st-changes">1 high</span>
            <span className="rounded-md bg-st-review-wash px-2 py-0.5 font-medium text-st-review">2 medium</span>
            <span className="rounded-md bg-primary-wash px-2 py-0.5 font-medium text-primary">1 info</span>
            <span className="text-ink-faint">Top: "TBD" left in 3.3</span>
          </div>
        </StepOutput>
      </div>
    ),
  },
  {
    label: 'Step 5',
    title: 'Review',
    content: (
      <div>
        <p className="text-ink-soft">The reviewer reads with the changes marked, comments on the text, then approves it or asks for changes.</p>
        <StepOutput>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status="APPROVED" />
            <span className="text-ink-soft">by Isha Patel · "Clear findings and good recommendations."</span>
          </div>
        </StepOutput>
      </div>
    ),
  },
  {
    label: 'Step 6',
    title: 'Share',
    content: (
      <div>
        <p className="text-ink-soft">Send it to every member at once, lock it with a password, or create a link for people outside the project.</p>
        <StepOutput>
          <div className="flex flex-wrap gap-2">
            <Chip>Sent to 5 members</Chip>
            <Chip>Password protected</Chip>
            <Chip>Link expires in 7 days</Chip>
          </div>
        </StepOutput>
      </div>
    ),
  },
];

/* ── Built in-house ────────────────────────────────────────────────────────────── */

const BUILT = [
  { icon: KeyRound, title: 'Sign-in', how: 'scrypt password hashes, signed session tokens', body: 'Accounts, sessions and password resets are our own code; no login provider.' },
  { icon: GitCompareArrows, title: 'Compare', how: 'sequence matcher: paragraphs, then words', body: 'A diff engine written for documents, so reworded sentences stay readable.' },
  { icon: ScanSearch, title: 'Pre-review', how: '13 rules over the changed text', body: 'Explainable checks instead of a black box: every finding names the rule behind it.' },
  { icon: Sparkles, title: 'Summaries', how: 'TextRank over TF-IDF sentence vectors', body: 'Picks the most central sentences from the document; it never invents text.' },
  { icon: TextSearch, title: 'Search', how: 'trigram titles + full-text, one SQL query', body: 'Finds documents by title or by the words inside them, ranked by relevance.' },
  { icon: FileSearch, title: 'Text extraction', how: "Python's standard library only", body: 'Reads PDF and Word files without any third-party parser or cloud service.' },
];

/* ── Questions ─────────────────────────────────────────────────────────────────── */

const FAQ = [
  ['Is the summary written by AI?', 'No. DocStruct ranks the sentences of the document itself (TextRank) and shows the most central ones, so a summary only ever contains sentences that are in the document. It is always labelled machine-generated and advisory.'],
  ['What happens to old versions?', 'They are kept forever and are read-only. Everyone sees the current version by default, and any two versions can be compared side by side.'],
  ['Who can open a password-protected document?', 'Only people who know the password, including project members; nobody can skip it. An unlock lasts 12 hours on that device, five wrong tries lock the document for 15 minutes, and the owner can set a new password if it is forgotten.'],
  ['Can I share a document with someone outside the project?', 'Yes. Create a share link that opens the document read-only. Links can have an expiry date and can be revoked at any time.'],
  ['Can I try it without signing up?', 'Yes. The login page lists ten demo accounts (an owner, editors, reviewers, a viewer and a new user), all with the password demo1234. Click one to fill in the form.'],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-rule rounded-3xl bg-surface px-2 shadow-card ring-1 ring-rule sm:px-4">
      {FAQ.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                className="group flex w-full items-center gap-4 px-3 py-5 text-left font-medium text-ink"
              >
                <span className="flex-1 transition-[translate,color] duration-300 group-hover:translate-x-1 group-hover:text-primary">{q}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                    isOpen ? 'bg-ink text-white' : 'bg-paper text-ink-soft group-hover:bg-primary-wash group-hover:text-primary',
                  )}
                >
                  <Plus className="size-4" aria-hidden />
                </motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-3 pb-5 pr-14 leading-relaxed text-ink-soft">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────────── */

export function LandingPage() {
  useEffect(() => {
    document.title = 'DocStruct: every document, one current version';
    return () => {
      document.title = 'DocStruct';
    };
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <CursorRing />
      <NavBar />
      <main>
        <Hero />

        <section id="features" className="scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="What it does" title="Six things a project team does with every document." center>
              Try them here. Every panel below is a small working demo.
            </SectionHeading>
            <div className="mt-12">
              <FeatureTabs />
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-y border-rule bg-surface/60 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="How it works" title="How a document moves through DocStruct.">
              Six steps from first draft to an approved, shared document. Scroll to follow one through.
            </SectionHeading>
            <Timeline data={STEPS} className="mt-6 pb-8" />
          </div>
        </section>

        <section id="built" className="scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <SectionHeading eyebrow="Built in-house" title="No outside APIs. Every feature is our own code.">
                Supabase only stores the data. Sign-in, comparison, pre-review, summaries, search and text extraction were all written for DocStruct.
              </SectionHeading>
              <BlurFade inView delay={0.1}>
                <div className="flex items-center gap-3 rounded-2xl bg-surface px-5 py-4 shadow-card ring-1 ring-rule">
                  <Braces className="size-5 text-violet" aria-hidden />
                  <div>
                    <RollingDigits value={0} className="font-serif text-3xl text-ink" />
                    <p className="text-xs text-ink-soft">third-party AI or search services</p>
                  </div>
                </div>
              </BlurFade>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BUILT.map((b, i) => (
                <BlurFade key={b.title} inView delay={0.05 * i}>
                  <GlowCard className="h-full transition-[translate,box-shadow] duration-500 hover:-translate-y-1">
                    <div className="flex h-full flex-col p-6">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary-wash text-primary">
                        <b.icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-soft">{b.body}</p>
                      <p className="mt-4 rounded-lg bg-paper px-3 py-2 font-mono text-[11.5px] text-ink-soft ring-1 ring-rule">{b.how}</p>
                    </div>
                  </GlowCard>
                </BlurFade>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 px-4 pb-24 sm:px-6 lg:pb-32">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionHeading eyebrow="Questions" title="Things people ask first." />
              <BlurFade inView delay={0.1}>
                <p className="mt-4 text-ink-soft">
                  Anything else is quickest to answer by trying it:{' '}
                  <Link to="/login" className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary">
                    open a demo account
                  </Link>
                  .
                </p>
              </BlurFade>
            </div>
            <BlurFade inView delay={0.1}>
              <Faq />
            </BlurFade>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <BlurFade inView>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center text-white sm:px-12 lg:py-20">
              <Spotlight size={460} className="from-[#554dde]/45 via-[#3040c4]/20 to-transparent" />
              <div className="pointer-events-none absolute -bottom-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-violet/25 blur-3xl" aria-hidden />
              <div
                className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
                aria-hidden
              />
              <BorderBeam size={160} duration={10} colorFrom="#a9b4ff" colorTo="#554dde" />
              <h2 className="relative mx-auto max-w-2xl font-serif text-3xl leading-tight sm:text-5xl">See it with real documents.</h2>
              <p className="relative mx-auto mt-4 max-w-xl text-white/65">
                Ten demo accounts are ready: an owner, editors, reviewers, a viewer and a brand-new user, across two projects with documents under review.
              </p>
              <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                <Magnetic>
                  <Link
                    to="/login"
                    className="group flex h-12 items-center gap-2 rounded-full bg-white px-6 font-medium text-ink shadow-[0_8px_30px_-6px_rgb(169_180_255/0.45)] transition-[box-shadow,scale] duration-500 hover:shadow-[0_14px_44px_-8px_rgb(169_180_255/0.8)] active:scale-[0.97]"
                  >
                    Try a demo account
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </Link>
                </Magnetic>
                <Magnetic>
                  <Link to="/signup" className="flex h-12 items-center rounded-full px-6 font-medium ring-1 ring-white/25 transition-[background-color,box-shadow] duration-500 hover:bg-white/10 hover:ring-white/40">
                    Create an account
                  </Link>
                </Magnetic>
              </div>
            </div>
          </BlurFade>
        </section>
      </main>

      <footer className="border-t border-rule px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-ink-soft md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <img src="/favicon.svg" alt="" className="size-7" /> DocStruct
          </div>
          <p className="md:text-center">
            Mini Project, Sardar Patel Institute of Technology, 2026-27
            <br />
            Vansh Lathiya · Vivan Dhoka · Shrut Diwakar · guided by Dr. Sudhir Dhage
          </p>
          <div className="flex gap-4">
            <Link to="/login" className="transition-colors hover:text-ink">
              Log in
            </Link>
            <Link to="/signup" className="transition-colors hover:text-ink">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
