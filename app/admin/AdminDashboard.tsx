'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AdminBlacklistEntry, AdminIpBlacklistEntry, AdminSnapshot } from '@/types/chat';
import AdminContentSection from './AdminContentSection';
import AdminOverviewSection from './AdminOverviewSection';
import { EmptyState, MetricCard, SectionCard } from './AdminPrimitives';
import AdminSecuritySection from './AdminSecuritySection';
import AdminUsersSection from './AdminUsersSection';
import {
  CATEGORY_DEFINITIONS,
  PAGE_SIZES,
  cx,
  fetchAdminSnapshot,
  paginate,
  readServerError
} from './admin-utils';
import type { CategoryId, PaginationKey } from './admin-utils';

export default function AdminDashboard() {
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('overview');
  const [pages, setPages] = useState<Partial<Record<PaginationKey, number>>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [blacklistKind, setBlacklistKind] = useState<'name' | 'email'>('name');
  const [blacklistValue, setBlacklistValue] = useState('');
  const [blacklistNote, setBlacklistNote] = useState('');
  const [networkMatchMode, setNetworkMatchMode] = useState<'ip' | 'mac' | 'both'>('ip');
  const [ipValue, setIpValue] = useState('');
  const [macValue, setMacValue] = useState('');
  const [ipNote, setIpNote] = useState('');
  const [ipScope, setIpScope] = useState({
    forbidRegister: true,
    forbidLogin: true,
    forbidReset: true,
    forbidChat: true,
    terminateSessions: true
  });
  const [passwordTargetUserId, setPasswordTargetUserId] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [revokePasswordSessions, setRevokePasswordSessions] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('chat_admin_token') ?? '';
    const normalized = stored.trim();
    setTokenInput(normalized);
    setActiveToken(normalized);
  }, []);

  useEffect(() => {
    if (!activeToken) {
      setSnapshot(null);
      setError(null);
      setIsConnecting(false);
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;

    const applySnapshot = (next: AdminSnapshot) => {
      setSnapshot(next);
      setError(null);
      setIsConnecting(false);
    };

    const loadSnapshot = async () => {
      try {
        const next = await fetchAdminSnapshot(activeToken);
        if (!closed) {
          applySnapshot(next);
        }
      } catch (requestError) {
        if (!closed) {
          setSnapshot(null);
          setError(requestError instanceof Error ? requestError.message : 'Admin state could not be loaded.');
          setIsConnecting(false);
        }
      }
    };

    const openStream = () => {
      if (closed) {
        return;
      }

      stream?.close();
      stream = new EventSource(`/api/admin/stream?adminToken=${encodeURIComponent(activeToken)}`);

      stream.addEventListener('snapshot', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as AdminSnapshot;
          applySnapshot(payload);
        } catch {
          setError('Admin stream payload could not be processed.');
        }
      });

      stream.onerror = () => {
        if (closed) {
          return;
        }

        setError('Live stream disconnected. Reconnecting...');
        stream?.close();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            openStream();
          }, 1500);
        }
      };
    };

    setIsConnecting(true);
    void loadSnapshot();
    openStream();

    const pollTimer = setInterval(() => {
      void loadSnapshot();
    }, 2500);

    return () => {
      closed = true;
      stream?.close();
      clearInterval(pollTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [activeToken]);

  useEffect(() => {
    if (!snapshot) {
      setSelectedUserIds([]);
      setPasswordTargetUserId('');
      return;
    }

    const validIds = new Set(snapshot.users.map((user) => user.id));
    setSelectedUserIds((prev) => prev.filter((id) => validIds.has(id)));
    setPasswordTargetUserId((prev) => (prev && validIds.has(prev) ? prev : ''));
  }, [snapshot]);

  const pendingUsers = snapshot?.pending ?? [];
  const approvedUsers = snapshot?.approved ?? [];
  const rejectedUsers = snapshot?.rejected ?? [];
  const recentMessages = snapshot?.recentMessages ?? [];
  const activeChats = snapshot?.activeChats ?? [];
  const deactivatedChats = snapshot?.deactivatedChats ?? [];
  const allUsers = snapshot?.users ?? [];
  const blacklist = snapshot?.blacklist ?? [];
  const ipBlacklist = snapshot?.ipBlacklist ?? [];
  const ipAbuseFlags = snapshot?.ipAbuseFlags ?? [];

  const blacklistedIpSet = useMemo(
    () =>
      new Set(
        ipBlacklist
          .map((entry) => entry.ip?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value))
      ),
    [ipBlacklist]
  );

  const selectedUserSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const pendingPage = paginate(pendingUsers, pages.pending, PAGE_SIZES.pending);
  const approvedPage = paginate(approvedUsers, pages.approved, PAGE_SIZES.approved);
  const rejectedPage = paginate(rejectedUsers, pages.rejected, PAGE_SIZES.rejected);
  const userDirectoryPage = paginate(allUsers, pages.userDirectory, PAGE_SIZES.userDirectory);
  const activeChatsPage = paginate(activeChats, pages.activeChats, PAGE_SIZES.activeChats);
  const deactivatedChatsPage = paginate(deactivatedChats, pages.deactivatedChats, PAGE_SIZES.deactivatedChats);
  const recentMessagesPage = paginate(recentMessages, pages.recentMessages, PAGE_SIZES.recentMessages);
  const blacklistPage = paginate(blacklist, pages.blacklist, PAGE_SIZES.blacklist);
  const ipBlacklistPage = paginate(ipBlacklist, pages.ipBlacklist, PAGE_SIZES.ipBlacklist);
  const ipAbuseFlagsPage = paginate(ipAbuseFlags, pages.ipAbuseFlags, PAGE_SIZES.ipAbuseFlags);

  const categoryCounts: Record<CategoryId, number> = {
    overview: pendingUsers.length + ipAbuseFlags.length + deactivatedChats.length,
    users: allUsers.length,
    content: activeChats.length + deactivatedChats.length + recentMessages.length,
    security: blacklist.length + ipBlacklist.length + ipAbuseFlags.length
  };

  const connectionState = !activeToken
    ? {
        label: 'Offline',
        helper: 'No admin token loaded',
        className: 'border-slate-500/20 bg-slate-900/70 text-slate-200'
      }
    : isConnecting
      ? {
          label: 'Syncing',
          helper: 'Connecting to live admin state',
          className: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
        }
      : error
        ? {
            label: 'Attention',
            helper: 'The stream needs a retry',
            className: 'border-rose-400/30 bg-rose-500/10 text-rose-100'
          }
        : {
            label: 'Live',
            helper: 'Streaming admin state',
            className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
          };

  const setPage = (key: PaginationKey, page: number) => {
    setPages((prev) => ({
      ...prev,
      [key]: page
    }));
  };

  const refreshSnapshot = async () => {
    if (!activeToken) {
      return;
    }

    const next = await fetchAdminSnapshot(activeToken);
    setSnapshot(next);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const selectVisibleUsers = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      userDirectoryPage.items.forEach((user) => next.add(user.id));
      return Array.from(next);
    });
  };

  const applyDecision = async (sessionId: string, action: 'approve' | 'reject' | 'kick') => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ sessionId, action })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'The action could not be completed.'));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The action could not be completed.');
    } finally {
      setIsUpdating(false);
    }
  };

  const reactivateChat = async (chatId: string) => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ action: 'reactivate', chatId })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Chat could not be reactivated.'));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat could not be reactivated.');
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteAccounts = async (mode: 'selected' | 'all') => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    const selected = mode === 'selected' ? selectedUserIds : [];
    if (mode === 'selected' && selected.length === 0) {
      setError('Select at least one account first.');
      return;
    }

    const confirmed =
      mode === 'all'
        ? window.confirm('Delete every account? This cannot be undone.')
        : window.confirm(`Delete ${selected.length} selected account(s)?`);

    if (!confirmed) {
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          mode,
          userIds: selected
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Accounts could not be deleted.'));
      }

      if (mode === 'all') {
        setSelectedUserIds([]);
      } else {
        const removed = new Set(selected);
        setSelectedUserIds((prev) => prev.filter((id) => !removed.has(id)));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Accounts could not be deleted.');
    } finally {
      setIsUpdating(false);
    }
  };

  const addBlacklistEntry = async () => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    const value = blacklistValue.trim();
    if (!value) {
      setError('Enter a name or email value first.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          kind: blacklistKind,
          value,
          note: blacklistNote.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Blacklist entry could not be saved.'));
      }

      setBlacklistValue('');
      setBlacklistNote('');
      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Blacklist entry could not be saved.');
    } finally {
      setIsUpdating(false);
    }
  };

  const removeBlacklistEntry = async (entry: AdminBlacklistEntry) => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/blacklist', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ id: entry.id })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Blacklist entry could not be removed.'));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Blacklist entry could not be removed.');
    } finally {
      setIsUpdating(false);
    }
  };

  const addIpBlacklistEntry = async () => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    const ip = networkMatchMode === 'mac' ? '' : ipValue.trim();
    const mac = networkMatchMode === 'ip' ? '' : macValue.trim();

    if (!ip && !mac) {
      setError('Enter at least one IP or MAC value.');
      return;
    }

    if (networkMatchMode === 'both' && (!ip || !mac)) {
      setError('Combined mode requires both an IP and a MAC value.');
      return;
    }

    if (!ipScope.forbidRegister && !ipScope.forbidLogin && !ipScope.forbidReset && !ipScope.forbidChat) {
      setError('Pick at least one blocking scope.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          ip: ip || null,
          mac: mac || null,
          note: ipNote.trim() || null,
          scope: ipScope
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Network rule could not be saved.'));
      }

      setIpValue('');
      setMacValue('');
      setIpNote('');
      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Network rule could not be saved.');
    } finally {
      setIsUpdating(false);
    }
  };

  const removeIpBlacklistEntry = async (entry: AdminIpBlacklistEntry) => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ id: entry.id })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Network rule could not be removed.'));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Network rule could not be removed.');
    } finally {
      setIsUpdating(false);
    }
  };

  const adminSetPassword = async () => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    const userId = passwordTargetUserId.trim();
    if (!userId) {
      setError('Select a user first.');
      return;
    }

    if (!passwordValue || passwordValue.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          userId,
          password: passwordValue,
          revokeSessions: revokePasswordSessions
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Password could not be updated.'));
      }

      setPasswordValue('');
      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Password could not be updated.');
    } finally {
      setIsUpdating(false);
    }
  };

  const promoteAbuseFlagToBlacklist = async (ip: string, reason?: string | null) => {
    if (!activeToken) {
      setError('Admin token is missing.');
      return;
    }

    const normalizedIp = ip.trim();
    if (!normalizedIp) {
      setError('The IP value is invalid.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          ip: normalizedIp,
          note: reason ? `Imported from abuse flag: ${reason}` : 'Imported from abuse flag',
          scope: {
            forbidRegister: true,
            forbidLogin: true,
            forbidReset: true,
            forbidChat: true,
            terminateSessions: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'The abuse flag could not be promoted.'));
      }

      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The abuse flag could not be promoted.');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderCategoryContent = () => {
    if (!snapshot) {
      return (
        <SectionCard
          eyebrow="Locked"
          title="Connect to unlock the admin workspaces"
          description="The page now groups tools by category, but it still needs a valid admin token before we can populate the data and actions."
        >
          <EmptyState
            title="Admin data is not loaded yet"
            body="Paste an admin token on the right, connect, and the overview, users, content, and security workspaces will light up."
          />
        </SectionCard>
      );
    }

    if (activeCategory === 'users') {
      return (
        <AdminUsersSection
          pendingPage={pendingPage}
          approvedPage={approvedPage}
          rejectedPage={rejectedPage}
          userDirectoryPage={userDirectoryPage}
          allUsers={allUsers}
          selectedUserSet={selectedUserSet}
          selectedUserIds={selectedUserIds}
          passwordTargetUserId={passwordTargetUserId}
          passwordValue={passwordValue}
          revokePasswordSessions={revokePasswordSessions}
          isUpdating={isUpdating}
          onApplyDecision={applyDecision}
          onDeleteAccounts={(mode) => void deleteAccounts(mode)}
          onToggleUserSelection={toggleUserSelection}
          onSelectVisibleUsers={selectVisibleUsers}
          onSelectAllUsers={() => setSelectedUserIds(allUsers.map((user) => user.id))}
          onClearSelection={() => setSelectedUserIds([])}
          onPasswordTargetChange={setPasswordTargetUserId}
          onPasswordValueChange={setPasswordValue}
          onRevokePasswordSessionsChange={setRevokePasswordSessions}
          onAdminSetPassword={() => void adminSetPassword()}
          onPageChange={(key, page) => setPage(key, page)}
        />
      );
    }

    if (activeCategory === 'content') {
      return (
        <AdminContentSection
          activeChatsPage={activeChatsPage}
          deactivatedChatsPage={deactivatedChatsPage}
          recentMessagesPage={recentMessagesPage}
          isUpdating={isUpdating}
          onReactivateChat={(chatId) => void reactivateChat(chatId)}
          onPageChange={(key, page) => setPage(key, page)}
        />
      );
    }

    if (activeCategory === 'security') {
      return (
        <AdminSecuritySection
          blacklistPage={blacklistPage}
          ipBlacklistPage={ipBlacklistPage}
          ipAbuseFlagsPage={ipAbuseFlagsPage}
          blacklistedIpSet={blacklistedIpSet}
          blacklistKind={blacklistKind}
          blacklistValue={blacklistValue}
          blacklistNote={blacklistNote}
          networkMatchMode={networkMatchMode}
          ipValue={ipValue}
          macValue={macValue}
          ipNote={ipNote}
          ipScope={ipScope}
          isUpdating={isUpdating}
          onBlacklistKindChange={setBlacklistKind}
          onBlacklistValueChange={setBlacklistValue}
          onBlacklistNoteChange={setBlacklistNote}
          onAddBlacklistEntry={() => void addBlacklistEntry()}
          onRemoveBlacklistEntry={(entry) => void removeBlacklistEntry(entry)}
          onNetworkMatchModeChange={setNetworkMatchMode}
          onIpValueChange={setIpValue}
          onMacValueChange={setMacValue}
          onIpNoteChange={setIpNote}
          onIpScopeChange={(key, value) =>
            setIpScope((prev) => ({
              ...prev,
              [key]: value
            }))
          }
          onAddIpBlacklistEntry={() => void addIpBlacklistEntry()}
          onRemoveIpBlacklistEntry={(entry) => void removeIpBlacklistEntry(entry)}
          onPromoteAbuseFlag={(ip, reason) => void promoteAbuseFlagToBlacklist(ip, reason)}
          onPageChange={(key, page) => setPage(key, page)}
        />
      );
    }

    return (
      <AdminOverviewSection
        pendingPage={pendingPage}
        recentMessagesPage={recentMessagesPage}
        ipAbuseFlagsPage={ipAbuseFlagsPage}
        blacklistedIpSet={blacklistedIpSet}
        approvedCount={approvedUsers.length}
        rejectedCount={rejectedUsers.length}
        deactivatedChatsCount={deactivatedChats.length}
        blacklistCount={blacklist.length}
        ipBlacklistCount={ipBlacklist.length}
        isUpdating={isUpdating}
        onApplyDecision={(sessionId, action) => void applyDecision(sessionId, action)}
        onPromoteAbuseFlag={(ip, reason) => void promoteAbuseFlagToBlacklist(ip, reason)}
        onOpenUsers={() => setActiveCategory('users')}
        onOpenContent={() => setActiveCategory('content')}
        onOpenSecurity={() => setActiveCategory('security')}
        onPageChange={(key, page) => setPage(key, page)}
      />
    );
  };

  return (
    <main className="space-y-6 pb-8" aria-busy={isConnecting || isUpdating}>
      <section className="glass-panel relative overflow-hidden rounded-[2rem] p-6 sm:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.16),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(2,6,23,0.5))]" />
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cx(
                  'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]',
                  connectionState.className
                )}
              >
                {connectionState.label}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-950/35 px-4 py-2 text-xs uppercase tracking-[0.16em] text-slate-300">
                {connectionState.helper}
              </span>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-cyan-200/85">Operations deck</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Admin control, rebuilt into categories with paginated workspaces.
              </h1>
              <p className="surface-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
                Instead of stacking every tool and every list into one giant scroll, this version separates the admin
                experience into focused lanes for overview, users, content, and security.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Pending reviews"
                value={pendingUsers.length}
                helper="Registration decisions waiting right now."
                accent="amber"
              />
              <MetricCard
                label="User accounts"
                value={allUsers.length}
                helper="All users in the system."
                accent="cyan"
              />
              <MetricCard
                label="Rooms tracked"
                value={activeChats.length + deactivatedChats.length}
                helper="Active and disabled chats combined."
                accent="emerald"
              />
              <MetricCard
                label="Security controls"
                value={blacklist.length + ipBlacklist.length}
                helper="Identity and network rules in force."
                accent="rose"
              />
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_56px_rgba(0,0,0,0.26)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Connect</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Admin session</h2>
              </div>
              <Link href="/admin/token" className="btn-soft px-3 py-2 text-xs">
                Token manager
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              <input
                aria-label="Admin token"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                className="glass-input text-sm"
                placeholder="Paste admin token"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1 text-sm"
                  onClick={() => {
                    const token = tokenInput.trim();
                    localStorage.setItem('chat_admin_token', token);
                    setActiveToken(token);
                    setSnapshot(null);
                    setError(null);
                  }}
                >
                  Connect
                </button>
                <button
                  type="button"
                  className="btn-soft text-sm"
                  onClick={() => {
                    localStorage.removeItem('chat_admin_token');
                    setTokenInput('');
                    setActiveToken('');
                    setSnapshot(null);
                    setError(null);
                    setIsConnecting(false);
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Why it is different now</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>Focused category rail instead of one endless page.</li>
                <li>Pagination on every long list to keep the interface fast and readable.</li>
                <li>Risky actions grouped into dedicated workspaces, not mixed into the live feed.</li>
              </ul>
            </div>

            {!activeToken ? <p className="alert-info mt-4 rounded-xl px-4 py-3 text-sm">No admin token connected yet.</p> : null}
            {isConnecting ? <p className="alert-info mt-4 rounded-xl px-4 py-3 text-sm">Connecting to live admin data...</p> : null}
            {error ? (
              <p role="alert" aria-live="assertive" className="alert-error mt-4 rounded-xl px-4 py-3 text-sm">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <section className="glass-panel rounded-[1.75rem] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Categories</p>
            <div className="mt-4 space-y-3">
              {CATEGORY_DEFINITIONS.map((category) => {
                const isActive = activeCategory === category.id;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cx(
                      'w-full rounded-[1.25rem] border p-4 text-left',
                      isActive
                        ? 'border-cyan-300/35 bg-cyan-500/10 shadow-[0_18px_40px_rgba(34,211,238,0.08)]'
                        : 'border-white/10 bg-slate-950/35 hover:border-white/20 hover:bg-slate-900/55'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          {category.eyebrow}
                        </p>
                        <p className="mt-2 text-base font-semibold text-white">{category.label}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 text-xs font-semibold text-slate-200">
                        {categoryCounts[category.id]}
                      </span>
                    </div>
                    <p className="surface-muted mt-3 text-sm leading-6">{category.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="glass-panel rounded-[1.75rem] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Live snapshot</p>
            <div className="mt-4 space-y-3">
              <div className="glass-card rounded-[1.15rem] p-4">
                <p className="surface-muted text-xs uppercase tracking-[0.16em]">Review pressure</p>
                <p className="mt-2 text-2xl font-semibold text-white">{pendingUsers.length}</p>
                <p className="surface-muted mt-2 text-sm">Pending approvals waiting in the queue.</p>
              </div>
              <div className="glass-card rounded-[1.15rem] p-4">
                <p className="surface-muted text-xs uppercase tracking-[0.16em]">Disabled rooms</p>
                <p className="mt-2 text-2xl font-semibold text-white">{deactivatedChats.length}</p>
                <p className="surface-muted mt-2 text-sm">Chats that can be restored from the content lane.</p>
              </div>
              <div className="glass-card rounded-[1.15rem] p-4">
                <p className="surface-muted text-xs uppercase tracking-[0.16em]">Flagged IPs</p>
                <p className="mt-2 text-2xl font-semibold text-white">{ipAbuseFlags.length}</p>
                <p className="surface-muted mt-2 text-sm">Abuse signals that still need a human decision.</p>
              </div>
            </div>
          </section>
        </aside>

        <section className="min-w-0">{renderCategoryContent()}</section>
      </div>
    </main>
  );
}
