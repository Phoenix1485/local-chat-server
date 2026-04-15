export type GlobalRole = 'user' | 'admin' | 'superadmin';

export type GroupMemberRole = 'owner' | 'admin' | 'member';

export type ChatKind = 'global' | 'group' | 'direct';

export type GroupInviteMode = 'direct' | 'invite_link';

export type GroupInvitePolicy = 'everyone' | 'admins' | 'owner';

export type GroupMentionPolicy = 'everyone' | 'admins' | 'owner';

export type AppUserProfile = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  bio: string;
  email: string | null;
  avatarUpdatedAt: number | null;
  role: GlobalRole;
  isFriend?: boolean;
};

export type FriendRequestState = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type FriendRequestItem = {
  id: string;
  sender: AppUserProfile;
  receiver: AppUserProfile;
  status: FriendRequestState;
  createdAt: number;
  updatedAt: number;
  isIncoming: boolean;
};

export type AppChatSummary = {
  id: string;
  name: string;
  kind: ChatKind;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  membersCount: number;
  memberRole: GroupMemberRole | null;
  lastMessageAt: number | null;
  lastMessageText: string | null;
  unreadCount: number;
  mentionCount: number;
  canManageMembers: boolean;
  groupInviteMode: GroupInviteMode | null;
  groupInvitePolicy: GroupInvitePolicy | null;
  groupAutoHideAfter24h: boolean;
};

export type AppChatMember = {
  user: AppUserProfile;
  joinedAt: number;
  role: GroupMemberRole;
  isOnline: boolean;
};

export type AppChatMessage = {
  id: string;
  chatId: string;
  user: AppUserProfile;
  text: string;
  createdAt: number;
  editedAt: number | null;
  deletedForAll: boolean;
  replyTo: AppChatReply | null;
  attachments: AppChatAttachment[];
  gif: AppChatGif | null;
  poll: AppChatPoll | null;
  reactions: AppChatReaction[];
  isPinned: boolean;
  pinnedAt: number | null;
  pinnedBy: string | null;
  mentionedMe: boolean;
  readBy: AppChatReadReceipt[];
};

export type AppChatReadReceipt = {
  userId: string;
  fullName: string;
  username: string;
  avatarUpdatedAt: number | null;
  readAt: number;
};

export type AppChatReply = {
  messageId: string;
  authorName: string;
  textSnippet: string;
};

export type AppChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
};

export type AppChatGif = {
  url: string;
  previewUrl: string | null;
  tenorId: string | null;
  title: string | null;
};

export type AppChatPollOption = {
  id: string;
  text: string;
  votes: number;
  votedByMe: boolean;
};

export type AppChatPoll = {
  question: string;
  options: AppChatPollOption[];
  closed: boolean;
};

export type AppChatReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type AppChatContext = {
  chat: AppChatSummary;
  members: AppChatMember[];
  messages: AppChatMessage[];
  unreadCountAtOpen: number;
  firstUnreadMessageId: string | null;
  groupSettings: AppGroupSettings | null;
};

export type AppModerationLog = {
  id: string;
  chatId: string;
  action: string;
  actorUserId: string;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  messageId: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
};

export type AppGroupSettings = {
  inviteMode: GroupInviteMode;
  invitePolicy: GroupInvitePolicy;
  inviteCode: string | null;
  inviteLink: string | null;
  autoHideAfter24h: boolean;
  messageCooldownMs: number;
  canInviteDirectly: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canTransferOwnership: boolean;
  canCloseGroup: boolean;
  everyoneMentionPolicy: GroupMentionPolicy;
  hereMentionPolicy: GroupMentionPolicy;
  canUseEveryoneMention: boolean;
  canUseHereMention: boolean;
};

export type AppBootstrap = {
  me: AppUserProfile;
  chats: AppChatSummary[];
  activeChatId: string | null;
  friends: AppUserProfile[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
};
