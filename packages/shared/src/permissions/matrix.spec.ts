import { describe, expect, it } from 'vitest';
import {
  boardPermissions,
  hasBoardPermission,
  hasWorkspacePermission,
  workspacePermissions,
  type BoardRole,
  type WorkspaceRole,
} from './index';

describe('permission matrix immutability', () => {
  it("freezes the role maps and every role's permission list", () => {
    expect(Object.isFrozen(workspacePermissions)).toBe(true);
    expect(Object.isFrozen(boardPermissions)).toBe(true);
    for (const list of [
      ...Object.values(workspacePermissions),
      ...Object.values(boardPermissions),
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it('a caller cannot grant a role extra permissions by mutating the shared lists', () => {
    expect(() =>
      (workspacePermissions.VIEWER as unknown as string[]).push('workspace.delete'),
    ).toThrow(TypeError);
    expect(() => (boardPermissions.VIEWER as unknown as string[]).push('board.settings')).toThrow(
      TypeError,
    );
    expect(() => {
      (workspacePermissions as Record<string, unknown>).VIEWER = ['workspace.delete'];
    }).toThrow(TypeError);
    expect(hasWorkspacePermission('VIEWER', 'workspace.delete')).toBe(false);
    expect(hasBoardPermission('VIEWER', 'board.settings')).toBe(false);
  });
});

describe('unknown role strings', () => {
  it.each(['GUEST', '', 'owner', 'constructor', '__proto__', 'toString'])(
    '%j has no permissions (returns false, does not throw)',
    (role) => {
      expect(hasWorkspacePermission(role as WorkspaceRole, 'workspace.view')).toBe(false);
      expect(hasBoardPermission(role as BoardRole, 'board.view')).toBe(false);
    },
  );
});
