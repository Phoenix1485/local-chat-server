import type { ReactNode } from 'react';
import { cx } from './admin-utils';
import type { PaginatedResult } from './admin-utils';

export function SectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('glass-panel overflow-hidden rounded-[1.75rem] p-5 sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          <p className="surface-muted mt-2 text-sm leading-6">{description}</p>
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  accent
}: {
  label: string;
  value: ReactNode;
  helper: string;
  accent: 'cyan' | 'amber' | 'emerald' | 'rose';
}) {
  const accentClass =
    accent === 'amber'
      ? 'from-amber-400/18 to-orange-500/10 border-amber-300/20'
      : accent === 'emerald'
        ? 'from-emerald-400/18 to-emerald-600/10 border-emerald-300/20'
        : accent === 'rose'
          ? 'from-rose-400/18 to-rose-600/10 border-rose-300/20'
          : 'from-cyan-400/18 to-blue-600/10 border-cyan-300/20';

  return (
    <div
      className={cx(
        'rounded-[1.35rem] border bg-gradient-to-br p-4 shadow-[0_20px_40px_rgba(0,0,0,0.22)]',
        accentClass
      )}
    >
      <p className="surface-muted text-[11px] uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="surface-muted mt-2 text-sm">{helper}</p>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-[1.25rem] border-dashed p-5 text-center">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <p className="surface-muted mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

export function PaginationControls({
  pageData,
  label,
  onChange
}: {
  pageData: PaginatedResult<unknown>;
  label: string;
  onChange: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
      <p className="surface-muted text-xs uppercase tracking-[0.16em]">
        {pageData.totalItems === 0
          ? `No ${label}`
          : `Showing ${pageData.rangeStart}-${pageData.rangeEnd} of ${pageData.totalItems} ${label}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pageData.page <= 1}
          onClick={() => onChange(pageData.page - 1)}
          className="btn-soft px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
          Page {pageData.page} / {pageData.totalPages}
        </span>
        <button
          type="button"
          disabled={pageData.page >= pageData.totalPages}
          onClick={() => onChange(pageData.page + 1)}
          className="btn-soft px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
