import type { UserStatus } from '@/types/chat';

const classes: Record<UserStatus, string> = {
  pending: 'bg-warn/20 text-orange-200 ring-1 ring-orange-500/40',
  approved: 'bg-ok/20 text-emerald-200 ring-1 ring-emerald-500/40',
  rejected: 'bg-danger/20 text-rose-200 ring-1 ring-rose-500/40'
};

const labels: Record<UserStatus, string> = {
  pending: 'wartend',
  approved: 'freigegeben',
  rejected: 'abgelehnt'
};

export function StatusPill({ status }: { status: UserStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}
