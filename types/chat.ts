export type UserStatus = 'pending' | 'approved' | 'rejected';

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  chatName: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
};

export type ChatRoom = {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  isGlobal: boolean;
  deactivatedAt: number | null;
  deactivatedBy: string | null;
};

export type ChatRoomSummary = {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  isGlobal: boolean;
  membersCount: number;
  lastMessageAt: number | null;
  canLeave: boolean;
  canDelete: boolean;
};

export type ChatMember = {
  id: string;
  name: string;
  status: UserStatus;
  joinedAt: number;
  isOnline: boolean;
};

export type InviteCandidate = {
  id: string;
  name: string;
  status: UserStatus;
  isOnline: boolean;
};

export type ChatContext = {
  globalChatId: string;
  chats: ChatRoomSummary[];
  activeChat: ChatRoomSummary;
  members: ChatMember[];
  inviteCandidates: InviteCandidate[];
};

export type UserSession = {
  id: string;
  name: string;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  ip: string;
};

export type StoredUpload = ChatAttachment & {
  chatId: string;
  buffer: Buffer;
};

export type AdminSnapshot = {
  users: UserSession[];
  pending: UserSession[];
  approved: UserSession[];
  rejected: UserSession[];
  recentMessages: ChatMessage[];
  activeChats: AdminChatSummary[];
  deactivatedChats: AdminChatSummary[];
  blacklist: AdminBlacklistEntry[];
};

export type AdminChatSummary = {
  id: string;
  name: string;
  isGlobal: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
  deactivatedAt: number | null;
  deactivatedBy: string | null;
  deactivatedByName: string | null;
  membersCount: number;
};

export type AdminBlacklistEntry = {
  id: string;
  kind: 'name' | 'email';
  value: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
};
