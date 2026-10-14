import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentType, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { STATUS_LABEL, type DocumentStatus, type ReviewStatus } from '@docstruct/shared';
import { cn } from '@/lib/utils';
import { AnimateIcon } from './animate-ui/icons/icon';
import { LoaderCircle } from './animate-ui/icons/loader-circle';
import { X as XIcon } from './animate-ui/icons/x';
import { MagicCard } from './magicui/magic-card';

/** Joins class names; later Tailwind classes win over earlier conflicting ones. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return cn(parts);
}

/** An animate-ui icon: animates when its AnimateIcon parent is hovered. */
export type AnimatedIcon = ComponentType<{ size?: number; className?: string }>;

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(21_23_43/0.15)] hover:bg-primary-hover hover:shadow-lift disabled:bg-primary/50 disabled:shadow-none',
  secondary: 'bg-surface text-ink border border-rule-strong shadow-[0_1px_2px_rgb(21_23_43/0.04)] hover:border-primary/40 hover:bg-primary-wash/50 disabled:text-ink-faint',
  quiet: 'text-ink-soft hover:text-ink hover:bg-primary-wash/70 disabled:text-ink-faint',
  danger: 'bg-st-changes text-white hover:bg-st-changes/90 disabled:bg-st-changes/50',
};

/**
 * Buttons press in slightly when clicked; with `icon` (an animated icon) the icon plays when the button is
 * hovered. Passing icons as children still works for plain lucide icons.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean; icon?: AnimatedIcon }) {
  const button = (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,border-color,box-shadow,transform,color] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon size={16} className="shrink-0" />}
      {children}
    </button>
  );
  return Icon ? (
    <AnimateIcon animateOnHover asChild>
      {button}
    </AnimateIcon>
  ) : (
    button
  );
}

/** A small square button holding only an animated icon; `label` is its accessible name and tooltip. */
export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: AnimatedIcon; label: string }) {
  return (
    <AnimateIcon animateOnHover asChild>
      <button
        type="button"
        aria-label={label}
        title={label}
        {...rest}
        className={cx(
          'inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-[background-color,color,transform] duration-150 hover:bg-primary-wash hover:text-primary active:scale-90 disabled:opacity-40',
          className,
        )}
      >
        <Icon size={16} />
      </button>
    </AnimateIcon>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[13px] text-ink-faint">{hint}</p>}
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[13px] text-st-changes">
          {error}
        </motion.p>
      )}
    </div>
  );
}

const control =
  'w-full rounded-lg border border-rule-strong bg-surface px-3 text-sm text-ink shadow-[0_1px_2px_rgb(21_23_43/0.03)] transition-[border-color,box-shadow] placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12 disabled:bg-paper';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, 'h-9', props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(control, 'min-h-20 py-2 leading-relaxed', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, 'h-9 pr-8', props.className)} />;
}

const STATUS_STYLE: Record<DocumentStatus | ReviewStatus, string> = {
  DRAFT: 'bg-st-draft-wash text-st-draft',
  UNDER_REVIEW: 'bg-st-review-wash text-st-review',
  PENDING: 'bg-st-review-wash text-st-review',
  CHANGES_REQUESTED: 'bg-st-changes-wash text-st-changes',
  APPROVED: 'bg-st-approved-wash text-st-approved',
  ARCHIVED: 'bg-st-archived-wash text-st-archived',
  CANCELLED: 'bg-st-archived-wash text-st-archived',
};

/** Solid colour per status, for dots and bars. */
export const STATUS_DOT: Record<DocumentStatus, string> = {
  DRAFT: 'bg-st-draft',
  UNDER_REVIEW: 'bg-st-review',
  CHANGES_REQUESTED: 'bg-st-changes',
  APPROVED: 'bg-st-approved',
  ARCHIVED: 'bg-st-archived/50',
};

/** SA-6 / Usability-2: status is always shown in words and colour, never colour alone. */
export function StatusBadge({ status, className }: { status: DocumentStatus | ReviewStatus; className?: string }) {
  const live = status === 'UNDER_REVIEW' || status === 'PENDING';
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium', STATUS_STYLE[status], className)}>
      <span className="relative flex size-1.5" aria-hidden>
        {/* A review in progress pulses softly; settled states sit still. */}
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-8 text-sm text-ink-faint" role="status">
      <LoaderCircle size={18} animate loop className="text-primary" />
      <motion.span animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 1.6, repeat: Infinity }}>
        {label}…
      </motion.span>
    </div>
  );
}

/** Grey shimmering bars that hold a list's shape while it loads. */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }}
      transition={{ duration: 0.35 }}
      className={cx('rounded-lg border border-st-changes/30 bg-st-changes-wash px-3 py-2 text-sm text-st-changes', className)}
    >
      {children}
    </motion.div>
  );
}

export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink-soft', className)}>{children}</div>;
}

export function EmptyState({ title, children, action, icon: Icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: AnimatedIcon }) {
  return (
    <AnimateIcon animateOnHover asChild>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group rounded-xl border border-dashed border-rule-strong bg-[radial-gradient(ellipse_at_top,var(--color-primary-wash),transparent_70%)] px-6 py-10 text-center transition-colors hover:border-primary/40"
      >
        {Icon && (
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-card ring-1 ring-rule transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
            <Icon size={22} />
          </span>
        )}
        <p className="font-medium text-ink">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{children}</p>}
        {action && <div className="mt-4">{action}</div>}
      </motion.div>
    </AnimateIcon>
  );
}

/**
 * A card that lights up around the cursor (Magic UI's MagicCard) in the DocStruct colours. Use it for
 * anything clickable that sits in a grid.
 */
export function GlowCard({ children, className, strong }: { children: ReactNode; className?: string; strong?: boolean }) {
  return (
    <MagicCard
      className={cx('rounded-xl shadow-card transition-shadow duration-300 hover:shadow-lift', className)}
      gradientSize={strong ? 260 : 200}
      gradientColor="#edecfc"
      gradientOpacity={strong ? 0.9 : 0.7}
      gradientFrom="#3040c4"
      gradientTo="#554dde"
    >
      {children}
    </MagicCard>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    // Focus the first field so typing starts in the form, not on the close button.
    dialog?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx('m-auto w-[calc(100%-2rem)] overflow-visible bg-transparent p-0 text-ink backdrop:bg-ink/35 backdrop:backdrop-blur-[3px]', wide ? 'max-w-2xl' : 'max-w-md')}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="overflow-hidden rounded-2xl bg-surface shadow-[0_24px_64px_-12px_rgb(21_23_43/0.35)] ring-1 ring-rule"
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <IconButton icon={XIcon} label="Close" onClick={onClose} className="-mr-1.5" />
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-rule bg-paper/60 px-5 py-3">{footer}</div>}
      </motion.div>
    </dialog>
  );
}

/** UI-12 / SA-3: irreversible actions always pass through an explicit confirmation. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
    </Modal>
  );
}

export function PageHeader({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.35 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  // A stable hue per name so the same person always looks the same.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-surface transition-transform duration-200 hover:scale-110',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs',
      )}
      style={{ background: `linear-gradient(135deg, hsl(${hash} 45% 50%), hsl(${(hash + 40) % 360} 42% 38%))` }}
    >
      {initials}
    </span>
  );
}

/** Marks AI/machine output wherever it appears (Diff.PreReview.Attribution, SA-5). */
export function MachineLabel() {
  return (
    <span className="inline-flex items-center rounded border border-dashed border-ink-faint px-1.5 py-px text-[11.5px] text-ink-soft">
      Machine-generated, advisory only
    </span>
  );
}
