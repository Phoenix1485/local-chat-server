const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTranspiledTsModule(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  });

  const LoadedModule = module.constructor;
  const localModule = new LoadedModule(filePath, module);
  localModule.filename = filePath;
  localModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  localModule._compile(compiled.outputText, filePath);
  return localModule.exports;
}

const {
  PermissionDeniedError,
  assertGroupCapability,
  canManageRole,
  hasGroupCapability,
  isGroupMemberRole
} = loadTranspiledTsModule('lib/groupPermissions.ts');

test('isGroupMemberRole accepts supported roles including moderator', () => {
  assert.equal(isGroupMemberRole('owner'), true);
  assert.equal(isGroupMemberRole('admin'), true);
  assert.equal(isGroupMemberRole('moderator'), true);
  assert.equal(isGroupMemberRole('member'), true);
  assert.equal(isGroupMemberRole('guest'), false);
});

test('moderator gets moderation capabilities but no member management', () => {
  const context = {
    memberRole: 'moderator',
    globalRole: 'user',
    invitePolicy: 'admins',
    everyoneMentionPolicy: 'admins',
    hereMentionPolicy: 'admins'
  };

  assert.equal(hasGroupCapability(context, 'moderate_messages'), true);
  assert.equal(hasGroupCapability(context, 'view_moderation_logs'), true);
  assert.equal(hasGroupCapability(context, 'pin_messages'), true);
  assert.equal(hasGroupCapability(context, 'delete_message_for_all'), true);
  assert.equal(hasGroupCapability(context, 'manage_members'), false);
  assert.equal(hasGroupCapability(context, 'manage_settings'), false);
  assert.equal(hasGroupCapability(context, 'invite_members'), false);
});

test('admin can manage lower roles but not peer or owner roles', () => {
  assert.equal(canManageRole('admin', 'member'), true);
  assert.equal(canManageRole('admin', 'moderator'), true);
  assert.equal(canManageRole('admin', 'admin'), false);
  assert.equal(canManageRole('admin', 'owner'), false);
});

test('mention and invite policies are enforced by capability checks', () => {
  const memberContext = {
    memberRole: 'member',
    globalRole: 'user',
    invitePolicy: 'everyone',
    everyoneMentionPolicy: 'everyone',
    hereMentionPolicy: 'admins'
  };

  assert.equal(hasGroupCapability(memberContext, 'invite_members'), true);
  assert.equal(hasGroupCapability(memberContext, 'use_everyone_mention'), true);
  assert.equal(hasGroupCapability(memberContext, 'use_here_mention'), false);
});

test('superadmin bypasses group capability checks', () => {
  const context = {
    memberRole: null,
    globalRole: 'superadmin',
    invitePolicy: null,
    everyoneMentionPolicy: null,
    hereMentionPolicy: null
  };

  assert.equal(hasGroupCapability(context, 'manage_settings'), true);
  assert.equal(hasGroupCapability(context, 'view_moderation_logs'), true);
  assert.equal(hasGroupCapability(context, 'close_group'), true);
});

test('assertGroupCapability throws PermissionDeniedError with provided message', () => {
  assert.throws(
    () =>
      assertGroupCapability(
        {
          memberRole: 'member',
          globalRole: 'user',
          invitePolicy: 'admins',
          everyoneMentionPolicy: 'admins',
          hereMentionPolicy: 'admins'
        },
        'manage_settings',
        'Not allowed.'
      ),
    (error) => {
      assert.equal(error instanceof PermissionDeniedError, true);
      assert.equal(error.message, 'Not allowed.');
      return true;
    }
  );
});
