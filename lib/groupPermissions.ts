import type { GlobalRole, GroupInvitePolicy, GroupMentionPolicy, GroupMemberRole } from '@/types/social';

export class PermissionDeniedError extends Error {
  readonly code: string;

  constructor(message: string, code = 'permission_denied') {
    super(message);
    this.name = 'PermissionDeniedError';
    this.code = code;
  }
}

export type GroupCapability =
  | 'view_chat'
  | 'send_message'
  | 'invite_members'
  | 'manage_members'
  | 'manage_settings'
  | 'moderate_messages'
  | 'view_moderation_logs'
  | 'pin_messages'
  | 'delete_message_for_all'
  | 'transfer_ownership'
  | 'close_group'
  | 'use_everyone_mention'
  | 'use_here_mention';

export type GroupPermissionContext = {
  memberRole: GroupMemberRole | null;
  globalRole: GlobalRole | null;
  invitePolicy?: GroupInvitePolicy | null;
  everyoneMentionPolicy?: GroupMentionPolicy | null;
  hereMentionPolicy?: GroupMentionPolicy | null;
};

const ROLE_RANK: Record<GroupMemberRole, number> = {
  member: 10,
  moderator: 20,
  admin: 30,
  owner: 40
};

function canRoleUsePolicy(role: GroupMemberRole, policy: GroupInvitePolicy | GroupMentionPolicy): boolean {
  if (policy === 'everyone') {
    return true;
  }
  if (policy === 'owner') {
    return role === 'owner';
  }
  return role === 'owner' || role === 'admin';
}

export function isGroupMemberRole(value: unknown): value is GroupMemberRole {
  return value === 'owner' || value === 'admin' || value === 'moderator' || value === 'member';
}

export function canManageRole(actorRole: GroupMemberRole, targetRole: GroupMemberRole): boolean {
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

export function hasGroupCapability(context: GroupPermissionContext, capability: GroupCapability): boolean {
  if (context.globalRole === 'superadmin') {
    return true;
  }

  const role = context.memberRole;
  if (!role) {
    return false;
  }

  switch (capability) {
    case 'view_chat':
    case 'send_message':
      return true;
    case 'invite_members':
      return context.invitePolicy ? canRoleUsePolicy(role, context.invitePolicy) : false;
    case 'manage_members':
      return role === 'owner' || role === 'admin';
    case 'manage_settings':
    case 'transfer_ownership':
    case 'close_group':
      return role === 'owner';
    case 'moderate_messages':
    case 'view_moderation_logs':
    case 'pin_messages':
    case 'delete_message_for_all':
      return role === 'owner' || role === 'admin' || role === 'moderator';
    case 'use_everyone_mention':
      return context.everyoneMentionPolicy ? canRoleUsePolicy(role, context.everyoneMentionPolicy) : false;
    case 'use_here_mention':
      return context.hereMentionPolicy ? canRoleUsePolicy(role, context.hereMentionPolicy) : false;
    default:
      return false;
  }
}

export function assertGroupCapability(
  context: GroupPermissionContext,
  capability: GroupCapability,
  message: string,
  code?: string
): void {
  if (!hasGroupCapability(context, capability)) {
    throw new PermissionDeniedError(message, code);
  }
}
