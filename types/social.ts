export type GlobalRole = 'user' | 'admin' | 'superadmin';

export type GroupMemberRole = 'owner' | 'admin' | 'moderator' | 'member';

export type ChatBackgroundPreset = 'aurora' | 'sunset' | 'midnight' | 'forest' | 'paper';

export type ChatBackgroundMode = 'preset' | 'solid' | 'gradient' | 'image';

export type AppChatBackgroundStyle = {
  mode: ChatBackgroundMode;
  preset?: ChatBackgroundPreset;
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  imageUrl?: string;
  imageDim?: number;
};

export type NicknameScope = 'global' | 'chat';

export type ChatKind = 'global' | 'group' | 'direct';

export type AppDesktopNotificationMode = 'mentions' | 'none';

export type AppChatNotificationMode = 'mentions' | 'mute';

export type GroupInviteMode = 'direct' | 'invite_link';

export type GroupInvitePolicy = 'everyone' | 'admins' | 'owner';

export type GroupMentionPolicy = 'everyone' | 'admins' | 'owner';

export type AppUserProfile = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  legalName?: string;
  bio: string;
  email: string | null;
  avatarUpdatedAt: number | null;
  role: GlobalRole;
  accentColor?: string;
  chatBackground?: ChatBackgroundPreset;
  chatBackgroundStyle?: AppChatBackgroundStyle | null;
  nicknameSlots?: AppNicknameSlot[];
  isFriend?: boolean;
};

export type AppNicknameSlot = {
  id: string;
  nickname: string;
  scope: NicknameScope;
  chatId: string | null;
  chatName: string | null;
};

export type AppUserPreferences = {
  desktopNotifications: AppDesktopNotificationMode;
  playMentionSound: boolean;
  showTypingIndicators: boolean;
  showReadReceipts: boolean;
  expandArchivedChats: boolean;
};

export type AppChatPreferences = {
  archived: boolean;
  notificationMode: AppChatNotificationMode;
  chatBackground: ChatBackgroundPreset | null;
  chatBackgroundStyle: AppChatBackgroundStyle | null;
};

export type AppChatCategory = {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
  groupCount: number;
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
  categoryId: string | null;
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
  preferences: AppChatPreferences;
};

export type AppChatMember = {
  user: AppUserProfile;
  joinedAt: number;
  role: GroupMemberRole;
  isOnline: boolean;
  mutedUntil: number | null;
  banActive: boolean;
  moderationNote: string | null;
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

export type AppModerationReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type AppModerationReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'violence'
  | 'sexual'
  | 'impersonation'
  | 'privacy'
  | 'other';

export type AppModerationReport = {
  id: string;
  chatId: string;
  status: AppModerationReportStatus;
  reason: AppModerationReportReason;
  reporterUserId: string;
  reporterName: string;
  targetUserId: string | null;
  targetName: string | null;
  messageId: string | null;
  messagePreview: string | null;
  notes: string | null;
  decisionNotes: string | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
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
  canModerateMessages: boolean;
  canViewModerationLogs: boolean;
  canTransferOwnership: boolean;
  canCloseGroup: boolean;
  everyoneMentionPolicy: GroupMentionPolicy;
  hereMentionPolicy: GroupMentionPolicy;
  canUseEveryoneMention: boolean;
  canUseHereMention: boolean;
};

export type AppBootstrap = {
  me: AppUserProfile;
  preferences: AppUserPreferences;
  chatCategories: AppChatCategory[];
  chats: AppChatSummary[];
  activeChatId: string | null;
  friends: AppUserProfile[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
};
