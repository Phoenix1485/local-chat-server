import type { UserStatus } from '@/types/chat';

const classes: Record<UserStatus, string> = {
  pending: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/35 backdrop-blur',
  approved: 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/35 backdrop-blur',
  rejected: 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-300/35 backdrop-blur'
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
