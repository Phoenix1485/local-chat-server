import type { UserStatus } from '@/types/chat';

const labels: Record<UserStatus, string> = {
  pending: 'wartend',
  approved: 'freigegeben',
  rejected: 'abgelehnt'
};

export function StatusPill({ status }: { status: UserStatus }) {
  return <span className={`status-pill ${status}`}>{labels[status]}</span>;
}
