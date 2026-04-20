import type { ReactNode } from 'react';
import type { ChatMessage, UserSession } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';
import { formatDateTime, formatTime } from './admin-utils';

export function UserCard({
  user,
  actions
}: {
  user: UserSession;
  actions?: ReactNode;
}) {
  return (
    <li className="glass-card rounded-[1.25rem] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-100">{user.name}</p>
            <StatusPill status={user.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Created: {formatDateTime(user.createdAt)}</span>
            <span>Updated: {formatDateTime(user.updatedAt)}</span>
            <span>IP: {user.ip || 'n/a'}</span>
          </div>
        </div>
        {actions}
      </div>
    </li>
  );
}

export function MessageCard({ message }: { message: ChatMessage }) {
  return (
    <li className="glass-card rounded-[1.25rem] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
            <span>{formatTime(message.createdAt)}</span>
            <span>{message.chatName}</span>
            <span>{message.userName}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-100">{message.text}</p>
          {message.attachments?.length ? (
            <p className="surface-muted mt-2 text-xs">{message.attachments.length} attachment(s)</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
