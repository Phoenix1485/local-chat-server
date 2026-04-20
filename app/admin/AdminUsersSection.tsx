import type { UserSession } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';
import { UserCard } from './AdminCards';
import { EmptyState, PaginationControls, SectionCard } from './AdminPrimitives';
import type { PaginatedResult } from './admin-utils';
import { formatDateTime } from './admin-utils';

export default function AdminUsersSection({
  pendingPage,
  approvedPage,
  rejectedPage,
  userDirectoryPage,
  allUsers,
  selectedUserSet,
  selectedUserIds,
  passwordTargetUserId,
  passwordValue,
  revokePasswordSessions,
  isUpdating,
  onApplyDecision,
  onDeleteAccounts,
  onToggleUserSelection,
  onSelectVisibleUsers,
  onSelectAllUsers,
  onClearSelection,
  onPasswordTargetChange,
  onPasswordValueChange,
  onRevokePasswordSessionsChange,
  onAdminSetPassword,
  onPageChange
}: {
  pendingPage: PaginatedResult<UserSession>;
  approvedPage: PaginatedResult<UserSession>;
  rejectedPage: PaginatedResult<UserSession>;
  userDirectoryPage: PaginatedResult<UserSession>;
  allUsers: UserSession[];
  selectedUserSet: Set<string>;
  selectedUserIds: string[];
  passwordTargetUserId: string;
  passwordValue: string;
  revokePasswordSessions: boolean;
  isUpdating: boolean;
  onApplyDecision: (sessionId: string, action: 'approve' | 'reject' | 'kick') => void;
  onDeleteAccounts: (mode: 'selected' | 'all') => void;
  onToggleUserSelection: (userId: string) => void;
  onSelectVisibleUsers: () => void;
  onSelectAllUsers: () => void;
  onClearSelection: () => void;
  onPasswordTargetChange: (value: string) => void;
  onPasswordValueChange: (value: string) => void;
  onRevokePasswordSessionsChange: (value: boolean) => void;
  onAdminSetPassword: () => void;
  onPageChange: (key: 'pending' | 'approved' | 'rejected' | 'userDirectory', page: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          eyebrow="Queue"
          title="Pending users"
          description="Approve or reject registrations without hunting through unrelated moderation tools."
        >
          {pendingPage.totalItems === 0 ? (
            <EmptyState title="Queue is empty" body="There are no pending registrations right now." />
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
                label="pending users"
                onChange={(page) => onPageChange('pending', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Active access"
          title="Approved users"
          description="Review who has access and remove them from chat when needed."
        >
          {approvedPage.totalItems === 0 ? (
            <EmptyState title="No approved users" body="Approved accounts will appear here after review." />
          ) : (
            <>
              <ul className="space-y-3">
                {approvedPage.items.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    actions={
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => onApplyDecision(user.id, 'kick')}
                        className="btn-soft btn-warning px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove from chat
                      </button>
                    }
                  />
                ))}
              </ul>
              <PaginationControls
                pageData={approvedPage}
                label="approved users"
                onChange={(page) => onPageChange('approved', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Rejected"
          title="Declined users"
          description="A separate list keeps decision history visible without mixing it into the active queue."
        >
          {rejectedPage.totalItems === 0 ? (
            <EmptyState title="No declined users" body="Rejected registrations will appear here." />
          ) : (
            <>
              <ul className="space-y-3">
                {rejectedPage.items.map((user) => (
                  <UserCard key={user.id} user={user} />
                ))}
              </ul>
              <PaginationControls
                pageData={rejectedPage}
                label="declined users"
                onChange={(page) => onPageChange('rejected', page)}
              />
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SectionCard
          eyebrow="Directory"
          title="User directory"
          description="Paginated account management with direct selection, instead of a giant unstructured multi-select."
          action={
            <>
              <button
                type="button"
                disabled={isUpdating || userDirectoryPage.totalItems === 0}
                onClick={onSelectVisibleUsers}
                className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select visible
              </button>
              <button
                type="button"
                disabled={isUpdating || allUsers.length === 0}
                onClick={onSelectAllUsers}
                className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={isUpdating || selectedUserIds.length === 0}
                onClick={onClearSelection}
                className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </>
          }
        >
          {userDirectoryPage.totalItems === 0 ? (
            <EmptyState title="No users yet" body="Accounts will appear here once registrations are created." />
          ) : (
            <>
              <ul className="space-y-3">
                {userDirectoryPage.items.map((user) => (
                  <li key={user.id} className="glass-card rounded-[1.25rem] p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedUserSet.has(user.id)}
                        onChange={() => onToggleUserSelection(user.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
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
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isUpdating || selectedUserIds.length === 0}
                  onClick={() => onDeleteAccounts('selected')}
                  className="btn-soft btn-danger text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete selected ({selectedUserIds.length})
                </button>
                <button
                  type="button"
                  disabled={isUpdating || allUsers.length === 0}
                  onClick={() => onDeleteAccounts('all')}
                  className="btn-soft btn-danger-soft text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete all ({allUsers.length})
                </button>
              </div>

              <PaginationControls
                pageData={userDirectoryPage}
                label="users"
                onChange={(page) => onPageChange('userDirectory', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Password tools"
          title="Admin password reset"
          description="Select a user, issue a new password, and optionally revoke all active sessions."
        >
          <div className="space-y-3">
            <select
              value={passwordTargetUserId}
              onChange={(event) => onPasswordTargetChange(event.target.value)}
              className="glass-input text-sm"
            >
              <option value="">Select a user...</option>
              {allUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} [{user.status}]
                </option>
              ))}
            </select>

            <input
              type="password"
              value={passwordValue}
              onChange={(event) => onPasswordValueChange(event.target.value)}
              className="glass-input text-sm"
              placeholder="New password (min. 8 characters)"
            />

            <label className="glass-card flex items-center gap-3 rounded-[1.1rem] px-4 py-3 text-sm text-slate-100">
              <input
                type="checkbox"
                checked={revokePasswordSessions}
                onChange={(event) => onRevokePasswordSessionsChange(event.target.checked)}
              />
              <span>Revoke all active sessions for this user</span>
            </label>

            <button
              type="button"
              disabled={isUpdating || !passwordTargetUserId}
              onClick={onAdminSetPassword}
              className="btn-soft btn-warning w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Update password
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
