import type { BoardRole, WorkspaceRole } from './roles';

export type WorkspacePermission =
  | 'workspace.view' // View the workspace and its member list
  | 'workspace.boards.create' // Create boards
  | 'workspace.members.invite' // Invite members (as Member or Viewer)
  | 'workspace.members.inviteAdmin' // Invite or promote to Admin
  | 'workspace.members.manage' // Change roles and remove members (except Owners)
  | 'workspace.owners.manage' // Manage Owners (add, remove, transfer)
  | 'workspace.rename' // Rename the workspace
  | 'workspace.delete' // Delete the workspace
  | 'workspace.integrations.manage' // Manage integrations and webhooks (P4)
  | 'workspace.templates.manage' // Manage workspace templates (P4); Members: own only
  | 'workspace.boards.import'; // Import a board (P4)

export type BoardPermission =
  | 'board.view' // View the board, cards, comments, activity and reports
  | 'board.watch' // Watch cards and get notifications
  | 'board.cards.write' // Create, edit and move cards; manage checklists, attachments, assignees, labels on cards
  | 'board.comments.write' // Comment (edit and delete own comments only)
  | 'board.cards.archive' // Archive and restore cards
  | 'board.cards.delete' // Permanently delete cards
  | 'board.columns.write' // Create, rename and reorder columns
  | 'board.columns.archive' // Archive and restore columns
  | 'board.labels.manage' // Manage labels
  | 'board.settings' // Board settings (name, visibility, WIP limits, policies, swimlanes, aging, estimate unit, mode, background)
  | 'board.members.manage' // Manage board members
  | 'board.lifecycle' // Archive, restore and permanently delete the board
  | 'board.timeTracking' // Track time on cards (P3)
  | 'board.savedViews.createPersonal' // Saved views: create personal ones
  | 'board.savedViews.share' // Saved views: share with the board
  | 'board.backlog.manage' // Backlog, issue types, card links (P4)
  | 'board.customFields.manage' // Custom fields and workflow rules (P4)
  | 'board.sprints.manage' // Plan, start and complete sprints (P4)
  | 'board.automations.manage' // Automation rules (P4)
  | 'board.export'; // Export the board (P4)

export type Permission = WorkspacePermission | BoardPermission;

const viewerWorkspace: WorkspacePermission[] = ['workspace.view'];

const memberWorkspace: WorkspacePermission[] = [
  ...viewerWorkspace,
  'workspace.boards.create',
  'workspace.templates.manage',
  'workspace.boards.import',
];

const adminWorkspace: WorkspacePermission[] = [
  ...memberWorkspace,
  'workspace.members.invite',
  'workspace.members.inviteAdmin',
  'workspace.members.manage',
  'workspace.rename',
  'workspace.integrations.manage',
];

/** Freezes a role → permissions map and each of its lists, so no caller can widen a role at runtime. */
function freezeMatrix<R extends string, P extends string>(
  matrix: Record<R, P[]>,
): Readonly<Record<R, readonly P[]>> {
  for (const list of Object.values<P[]>(matrix)) Object.freeze(list);
  return Object.freeze(matrix);
}

export const workspacePermissions = freezeMatrix<WorkspaceRole, WorkspacePermission>({
  OWNER: [...adminWorkspace, 'workspace.owners.manage', 'workspace.delete'],
  ADMIN: [...adminWorkspace],
  MEMBER: [...memberWorkspace],
  VIEWER: [...viewerWorkspace],
});

const viewerBoard: BoardPermission[] = [
  'board.view',
  'board.watch',
  'board.savedViews.createPersonal',
];

const memberBoard: BoardPermission[] = [
  ...viewerBoard,
  'board.cards.write',
  'board.comments.write',
  'board.cards.archive',
  'board.columns.write',
  'board.labels.manage',
  'board.timeTracking',
  'board.savedViews.share',
  'board.backlog.manage',
  'board.sprints.manage',
];

export const boardPermissions = freezeMatrix<BoardRole, BoardPermission>({
  ADMIN: [
    ...memberBoard,
    'board.cards.delete',
    'board.columns.archive',
    'board.settings',
    'board.members.manage',
    'board.lifecycle',
    'board.customFields.manage',
    'board.automations.manage',
    'board.export',
  ],
  MEMBER: [...memberBoard],
  VIEWER: [...viewerBoard],
});

/** False (never a throw) for a role string outside the matrix, including prototype keys. */
export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  return (
    Object.hasOwn(workspacePermissions, role) && workspacePermissions[role].includes(permission)
  );
}

/** False (never a throw) for a role string outside the matrix, including prototype keys. */
export function hasBoardPermission(role: BoardRole, permission: BoardPermission): boolean {
  return Object.hasOwn(boardPermissions, role) && boardPermissions[role].includes(permission);
}
