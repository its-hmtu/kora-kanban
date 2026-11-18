import type { BoardRole, BoardVisibility, WorkspaceRole } from "./roles";

export interface EffectiveBoardRoleInput {
  /** The user's role in the board's workspace; null when not a workspace member. */
  workspaceRole: WorkspaceRole | null;
  boardVisibility: BoardVisibility;
  /** The user's BoardMember role; null when they have no BoardMember row. */
  boardMemberRole: BoardRole | null;
}

/** Returns the user's effective role on a board, or null for no access (the API answers 404). */
export function effectiveBoardRole({
  workspaceRole,
  boardVisibility,
  boardMemberRole,
}: EffectiveBoardRoleInput): BoardRole | null {
  if (workspaceRole === null) return null;
  if (workspaceRole === "OWNER" || workspaceRole === "ADMIN") return "ADMIN";

  const role = boardMemberRole ?? (boardVisibility === "WORKSPACE" ? "MEMBER" : null);
  if (role === null) return null;
  return workspaceRole === "VIEWER" ? "VIEWER" : role;
}
