import type { AdminIpAbuseFlag, ChatMessage, UserSession } from '@/types/chat';
import { UserCard, MessageCard } from './AdminCards';
import { EmptyState, MetricCard, PaginationControls, SectionCard } from './AdminPrimitives';
import { formatDateTime } from './admin-utils';
import type { PaginatedResult } from './admin-utils';

export default function AdminOverviewSection({
  pendingPage,
  recentMessagesPage,
  ipAbuseFlagsPage,
  blacklistedIpSet,
  approvedCount,
  rejectedCount,
  deactivatedChatsCount,
  blacklistCount,
  ipBlacklistCount,
  isUpdating,
  onApplyDecision,
  onPromoteAbuseFlag,
  onOpenUsers,
  onOpenContent,
  onOpenSecurity,
  onPageChange
}: {
  pendingPage: PaginatedResult<UserSession>;
  recentMessagesPage: PaginatedResult<ChatMessage>;
  ipAbuseFlagsPage: PaginatedResult<AdminIpAbuseFlag>;
  blacklistedIpSet: Set<string>;
  approvedCount: number;
  rejectedCount: number;
  deactivatedChatsCount: number;
  blacklistCount: number;
  ipBlacklistCount: number;
  isUpdating: boolean;
  onApplyDecision: (sessionId: string, action: 'approve' | 'reject' | 'kick') => void;
  onPromoteAbuseFlag: (ip: string, reason?: string | null) => void;
  onOpenUsers: () => void;
  onOpenContent: () => void;
  onOpenSecurity: () => void;
  onPageChange: (key: 'pending' | 'recentMessages' | 'ipAbuseFlags', page: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SectionCard
          eyebrow="Fast lane"
          title="Pending approvals"
          description="New join requests stay front and center here, with compact actions and proper paging."
          action={
            <button type="button" onClick={onOpenUsers} className="btn-soft text-sm">
              Open users workspace
            </button>
          }
        >
          {pendingPage.totalItems === 0 ? (
            <EmptyState
              title="No pending approvals"
              body="The review queue is clear. New registrations will appear here as soon as they arrive."
            />
          ) : (
            <>
              <ul className="space-y-3">
                {pendingPage.items.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    actions={
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onApplyDecision(user.id, 'approve')}
                          className="btn-soft btn-success px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onApplyDecision(user.id, 'reject')}
                          className="btn-soft btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    }
                  />
                ))}
              </ul>
              <PaginationControls
                pageData={pendingPage}
                label="requests"
                onChange={(page) => onPageChange('pending', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Signal board"
          title="Ops heartbeat"
          description="A cleaner snapshot of the platform without forcing every system surface into the same long scroll."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Approved users"
              value={approvedCount}
              helper="People currently cleared for access."
              accent="emerald"
            />
            <MetricCard
              label="Rejected users"
              value={rejectedCount}
              helper="Users held back after review."
              accent="rose"
            />
            <MetricCard
              label="Disabled chats"
              value={deactivatedChatsCount}
              helper="Rooms waiting for reactivation."
              accent="amber"
            />
            <MetricCard
              label="Security items"
              value={blacklistCount + ipBlacklistCount + ipAbuseFlagsPage.totalItems}
              helper="Blacklists, network rules, and flagged IPs."
              accent="cyan"
            />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          eyebrow="Live feed"
          title="Recent messages"
          description="A paginated moderation view of the most recent message traffic."
          action={
            <button type="button" onClick={onOpenContent} className="btn-soft text-sm">
              Open content workspace
            </button>
          }
        >
          {recentMessagesPage.totalItems === 0 ? (
            <EmptyState
              title="No recent messages"
              body="Once people start posting, the latest traffic will surface here."
            />
          ) : (
            <>
              <ul className="space-y-3">
                {recentMessagesPage.items.map((message) => (
                  <MessageCard key={message.id} message={message} />
                ))}
              </ul>
              <PaginationControls
                pageData={recentMessagesPage}
                label="messages"
                onChange={(page) => onPageChange('recentMessages', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Watchtower"
          title="Abuse watch"
          description="Flagged IPs stay separate from permanent rules, so escalations are deliberate instead of automatic."
          action={
            <button type="button" onClick={onOpenSecurity} className="btn-soft text-sm">
              Open security workspace
            </button>
          }
        >
          {ipAbuseFlagsPage.totalItems === 0 ? (
            <EmptyState
              title="No flagged IPs"
              body="Network abuse flags will appear here when the backend records suspicious behavior."
            />
          ) : (
            <>
              <ul className="space-y-3">
                {ipAbuseFlagsPage.items.map((flag) => {
                  const isAlreadyBlacklisted = blacklistedIpSet.has(flag.ip.trim().toLowerCase());

                  return (
                    <li key={flag.ip} className="glass-card rounded-[1.25rem] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{flag.ip}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>Strikes: {flag.strikes}</span>
                            <span>Blocked until: {formatDateTime(flag.blockedUntil)}</span>
                            <span>Updated: {formatDateTime(flag.updatedAt)}</span>
                          </div>
                          {flag.lastReason ? (
                            <p className="mt-3 text-sm text-slate-200">{flag.lastReason}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={isUpdating || isAlreadyBlacklisted}
                          onClick={() => onPromoteAbuseFlag(flag.ip, flag.lastReason)}
                          className="btn-soft btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAlreadyBlacklisted ? 'Already promoted' : 'Promote to blocklist'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <PaginationControls
                pageData={ipAbuseFlagsPage}
                label="flags"
                onChange={(page) => onPageChange('ipAbuseFlags', page)}
              />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
