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
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
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
  buffer: Buffer;
};

export type AdminSnapshot = {
  pending: UserSession[];
  approved: UserSession[];
  rejected: UserSession[];
  recentMessages: ChatMessage[];
};