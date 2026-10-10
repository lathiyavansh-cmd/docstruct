import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';
import { STATUS_LABEL, type DocumentStatus, type ReviewStatus } from '@docstruct/shared';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-primary/50',
  secondary: 'bg-surface text-ink border border-rule-strong hover:border-ink-faint hover:bg-paper disabled:text-ink-faint',
  quiet: 'text-ink-soft hover:text-ink hover:bg-ink/5 disabled:text-ink-faint',
  danger: 'bg-st-changes text-white hover:bg-st-changes/90 disabled:bg-st-changes/50',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[13px] text-ink-faint">{hint}</p>}
      {error && <p className="text-[13px] text-st-changes">{error}</p>}
    </div>
  );
}

const control =
  'w-full rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-paper';

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

/** SA-6 / Usability-2: status is always shown in words and colour, never colour alone. */
export function StatusBadge({ status, className }: { status: DocumentStatus | ReviewStatus; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-[12.5px] font-medium', STATUS_STYLE[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-faint" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cx('rounded-md border border-st-changes/30 bg-st-changes-wash px-3 py-2 text-sm text-st-changes', className)}>
      {children}
    </div>
  );
}

export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink-soft', className)}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
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
      className={cx('m-auto w-[calc(100%-2rem)] rounded-lg bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40', wide ? 'max-w-2xl' : 'max-w-md')}
    >
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
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
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white', size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs')}
      style={{ background: `hsl(${hash} 38% 42%)` }}
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
