import type { AdminBlacklistEntry, AdminIpAbuseFlag, AdminIpBlacklistEntry } from '@/types/chat';
import { EmptyState, PaginationControls, SectionCard } from './AdminPrimitives';
import { cx, formatDateTime } from './admin-utils';
import type { PaginatedResult } from './admin-utils';

type NetworkScopeKey =
  | 'forbidRegister'
  | 'forbidLogin'
  | 'forbidReset'
  | 'forbidChat'
  | 'terminateSessions';

export default function AdminSecuritySection({
  blacklistPage,
  ipBlacklistPage,
  ipAbuseFlagsPage,
  blacklistedIpSet,
  blacklistKind,
  blacklistValue,
  blacklistNote,
  networkMatchMode,
  ipValue,
  macValue,
  ipNote,
  ipScope,
  isUpdating,
  onBlacklistKindChange,
  onBlacklistValueChange,
  onBlacklistNoteChange,
  onAddBlacklistEntry,
  onRemoveBlacklistEntry,
  onNetworkMatchModeChange,
  onIpValueChange,
  onMacValueChange,
  onIpNoteChange,
  onIpScopeChange,
  onAddIpBlacklistEntry,
  onRemoveIpBlacklistEntry,
  onPromoteAbuseFlag,
  onPageChange
}: {
  blacklistPage: PaginatedResult<AdminBlacklistEntry>;
  ipBlacklistPage: PaginatedResult<AdminIpBlacklistEntry>;
  ipAbuseFlagsPage: PaginatedResult<AdminIpAbuseFlag>;
  blacklistedIpSet: Set<string>;
  blacklistKind: 'name' | 'email';
  blacklistValue: string;
  blacklistNote: string;
  networkMatchMode: 'ip' | 'mac' | 'both';
  ipValue: string;
  macValue: string;
  ipNote: string;
  ipScope: {
    forbidRegister: boolean;
    forbidLogin: boolean;
    forbidReset: boolean;
    forbidChat: boolean;
    terminateSessions: boolean;
  };
  isUpdating: boolean;
  onBlacklistKindChange: (value: 'name' | 'email') => void;
  onBlacklistValueChange: (value: string) => void;
  onBlacklistNoteChange: (value: string) => void;
  onAddBlacklistEntry: () => void;
  onRemoveBlacklistEntry: (entry: AdminBlacklistEntry) => void;
  onNetworkMatchModeChange: (value: 'ip' | 'mac' | 'both') => void;
  onIpValueChange: (value: string) => void;
  onMacValueChange: (value: string) => void;
  onIpNoteChange: (value: string) => void;
  onIpScopeChange: (key: NetworkScopeKey, value: boolean) => void;
  onAddIpBlacklistEntry: () => void;
  onRemoveIpBlacklistEntry: (entry: AdminIpBlacklistEntry) => void;
  onPromoteAbuseFlag: (ip: string, reason?: string | null) => void;
  onPageChange: (key: 'blacklist' | 'ipBlacklist' | 'ipAbuseFlags', page: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <SectionCard
          eyebrow="Identity blocks"
          title="Name and email blacklist"
          description="Soft identity rules stay separate from network restrictions, which makes auditing simpler."
        >
          <div className="inline-flex rounded-full border border-white/10 bg-slate-950/40 p-1">
            <button
              type="button"
              className={cx(
                'rounded-full px-4 py-2 text-sm',
                blacklistKind === 'name' ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-300'
              )}
              onClick={() => onBlacklistKindChange('name')}
            >
              Name
            </button>
            <button
              type="button"
              className={cx(
                'rounded-full px-4 py-2 text-sm',
                blacklistKind === 'email' ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-300'
              )}
              onClick={() => onBlacklistKindChange('email')}
            >
              Email
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={blacklistValue}
              onChange={(event) => onBlacklistValueChange(event.target.value)}
              className="glass-input text-sm"
              placeholder={blacklistKind === 'email' ? 'blocked@example.com' : 'Blocked display name'}
            />
            <textarea
              value={blacklistNote}
              onChange={(event) => onBlacklistNoteChange(event.target.value)}
              className="glass-input min-h-[96px] text-sm"
              placeholder="Optional note"
            />
            <button
              type="button"
              disabled={isUpdating}
              onClick={onAddBlacklistEntry}
              className="btn-soft btn-danger w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save blacklist rule
            </button>
          </div>

          <div className="mt-5">
            {blacklistPage.totalItems === 0 ? (
              <EmptyState
                title="No identity blacklist entries"
                body="Blocked names and emails will appear here."
              />
            ) : (
              <>
                <ul className="space-y-3">
                  {blacklistPage.items.map((entry) => (
                    <li key={entry.id} className="glass-card rounded-[1.25rem] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{entry.value}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>Type: {entry.kind === 'email' ? 'Email' : 'Name'}</span>
                            <span>Updated: {formatDateTime(entry.updatedAt)}</span>
                          </div>
                          {entry.note ? <p className="mt-3 text-sm text-slate-200">{entry.note}</p> : null}
                        </div>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onRemoveBlacklistEntry(entry)}
                          className="btn-soft btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <PaginationControls
                  pageData={blacklistPage}
                  label="blacklist entries"
                  onChange={(page) => onPageChange('blacklist', page)}
                />
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Abuse watch"
          title="Flagged IP activity"
          description="Escalate suspicious IPs into full network blocks only when they cross the line."
        >
          {ipAbuseFlagsPage.totalItems === 0 ? (
            <EmptyState
              title="No flagged IPs"
              body="Suspicious traffic will appear here when the abuse tracker records it."
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
                          {flag.lastReason ? <p className="mt-3 text-sm text-slate-200">{flag.lastReason}</p> : null}
                        </div>
                        <button
                          type="button"
                          disabled={isUpdating || isAlreadyBlacklisted}
                          onClick={() => onPromoteAbuseFlag(flag.ip, flag.lastReason)}
                          className="btn-soft btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAlreadyBlacklisted ? 'Already blocked' : 'Promote to blocklist'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <PaginationControls
                pageData={ipAbuseFlagsPage}
                label="abuse flags"
                onChange={(page) => onPageChange('ipAbuseFlags', page)}
              />
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Network rules"
        title="IP and MAC controls"
        description="A full network control surface with scoped rules, clearer form grouping, and a paginated history list."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="inline-flex rounded-[1rem] border border-white/10 bg-slate-950/40 p-1">
              {[
                ['ip', 'IP only'],
                ['mac', 'MAC only'],
                ['both', 'IP + MAC']
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={cx(
                    'rounded-[0.8rem] px-4 py-2 text-sm',
                    networkMatchMode === mode ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-300'
                  )}
                  onClick={() => onNetworkMatchModeChange(mode as 'ip' | 'mac' | 'both')}
                >
                  {label}
                </button>
              ))}
            </div>

            {networkMatchMode !== 'mac' ? (
              <input
                value={ipValue}
                onChange={(event) => onIpValueChange(event.target.value)}
                className="glass-input text-sm"
                placeholder="IP address, for example 203.0.113.5"
              />
            ) : null}

            {networkMatchMode !== 'ip' ? (
              <input
                value={macValue}
                onChange={(event) => onMacValueChange(event.target.value)}
                className="glass-input text-sm"
                placeholder="MAC address, for example 00:11:22:33:44:55"
              />
            ) : null}

            <textarea
              value={ipNote}
              onChange={(event) => onIpNoteChange(event.target.value)}
              className="glass-input min-h-[96px] text-sm"
              placeholder="Optional rule note"
            />

            <div className="grid gap-2">
              {[
                ['forbidRegister', 'Block registration'],
                ['forbidLogin', 'Block login'],
                ['forbidReset', 'Block password reset'],
                ['forbidChat', 'Block chat activity'],
                ['terminateSessions', 'Terminate active sessions']
              ].map(([key, label]) => (
                <label key={key} className="glass-card flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={Boolean(ipScope[key as NetworkScopeKey])}
                    onChange={(event) => onIpScopeChange(key as NetworkScopeKey, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              disabled={isUpdating}
              onClick={onAddIpBlacklistEntry}
              className="btn-soft btn-danger w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save network rule
            </button>
          </div>

          <div>
            {ipBlacklistPage.totalItems === 0 ? (
              <EmptyState title="No network rules" body="Saved IP and MAC restrictions will appear here." />
            ) : (
              <>
                <ul className="space-y-3">
                  {ipBlacklistPage.items.map((entry) => (
                    <li key={entry.id} className="glass-card rounded-[1.25rem] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">
                            {entry.matchMode === 'ip_mac'
                              ? `${entry.ip} + ${entry.mac}`
                              : entry.ip ?? entry.mac ?? 'Unknown'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>
                              Mode:{' '}
                              {entry.matchMode === 'ip'
                                ? 'IP only'
                                : entry.matchMode === 'mac'
                                  ? 'MAC only'
                                  : 'IP + MAC'}
                            </span>
                            <span>Updated: {formatDateTime(entry.updatedAt)}</span>
                          </div>
                          <p className="surface-muted mt-2 text-xs">
                            Scope:{' '}
                            {[
                              entry.scope.forbidRegister ? 'register' : null,
                              entry.scope.forbidLogin ? 'login' : null,
                              entry.scope.forbidReset ? 'reset' : null,
                              entry.scope.forbidChat ? 'chat' : null
                            ]
                              .filter(Boolean)
                              .join(', ') || 'none'}
                            {entry.scope.terminateSessions ? ' + terminate sessions' : ''}
                          </p>
                          {entry.note ? <p className="mt-3 text-sm text-slate-200">{entry.note}</p> : null}
                        </div>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onRemoveIpBlacklistEntry(entry)}
                          className="btn-soft btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <PaginationControls
                  pageData={ipBlacklistPage}
                  label="network rules"
                  onChange={(page) => onPageChange('ipBlacklist', page)}
                />
              </>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
