import type { AdminChatSummary, ChatMessage } from '@/types/chat';
import { MessageCard } from './AdminCards';
import { EmptyState, PaginationControls, SectionCard } from './AdminPrimitives';
import { formatDateTime } from './admin-utils';
import type { PaginatedResult } from './admin-utils';

export default function AdminContentSection({
  activeChatsPage,
  deactivatedChatsPage,
  recentMessagesPage,
  isUpdating,
  onReactivateChat,
  onPageChange
}: {
  activeChatsPage: PaginatedResult<AdminChatSummary>;
  deactivatedChatsPage: PaginatedResult<AdminChatSummary>;
  recentMessagesPage: PaginatedResult<ChatMessage>;
  isUpdating: boolean;
  onReactivateChat: (chatId: string) => void;
  onPageChange: (
    key: 'activeChats' | 'deactivatedChats' | 'recentMessages',
    page: number
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          eyebrow="Rooms"
          title="Active chats"
          description="Current room inventory, separated from disabled spaces so the active list stays readable."
        >
          {activeChatsPage.totalItems === 0 ? (
            <EmptyState title="No active chats" body="Active chat rooms will appear here." />
          ) : (
            <>
              <ul className="space-y-3">
                {activeChatsPage.items.map((chat) => (
                  <li key={chat.id} className="glass-card rounded-[1.25rem] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{chat.name}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>{chat.isGlobal ? 'Global chat' : 'Custom room'}</span>
                          <span>Members: {chat.membersCount}</span>
                          <span>Updated: {formatDateTime(chat.updatedAt)}</span>
                        </div>
                        <p className="surface-muted mt-2 text-xs">
                          Created by: {chat.createdByName ?? chat.createdBy ?? 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <PaginationControls
                pageData={activeChatsPage}
                label="active chats"
                onChange={(page) => onPageChange('activeChats', page)}
              />
            </>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Recovery"
          title="Disabled chats"
          description="Suspended rooms get their own paginated recovery lane, with one-click reactivation."
        >
          {deactivatedChatsPage.totalItems === 0 ? (
            <EmptyState
              title="No disabled chats"
              body="Disabled rooms will show up here whenever moderation turns them off."
            />
          ) : (
            <>
              <ul className="space-y-3">
                {deactivatedChatsPage.items.map((chat) => (
                  <li key={chat.id} className="glass-card rounded-[1.25rem] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{chat.name}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>Members: {chat.membersCount}</span>
                          <span>Disabled: {formatDateTime(chat.deactivatedAt)}</span>
                        </div>
                        <p className="surface-muted mt-2 text-xs">
                          Disabled by: {chat.deactivatedByName ?? chat.deactivatedBy ?? 'Unknown'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => onReactivateChat(chat.id)}
                        className="btn-soft btn-success px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reactivate
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <PaginationControls
                pageData={deactivatedChatsPage}
                label="disabled chats"
                onChange={(page) => onPageChange('deactivatedChats', page)}
              />
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Message feed"
        title="Recent messages"
        description="A larger paginated traffic view for moderation and spot-checking conversations."
      >
        {recentMessagesPage.totalItems === 0 ? (
          <EmptyState
            title="No message activity"
            body="The latest messages will appear here when chats become active."
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
    </div>
  );
}
