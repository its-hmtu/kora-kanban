import { describe, expect, it } from "vitest";
import {
  boardPermissions,
  effectiveBoardRole,
  hasBoardPermission,
  hasWorkspacePermission,
  workspacePermissions,
  type BoardRole,
  type BoardVisibility,
  type BoardPermission,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./index";

const visibilities: BoardVisibility[] = ["PRIVATE", "WORKSPACE"];
const boardRoles: (BoardRole | null)[] = ["ADMIN", "MEMBER", "VIEWER", null];

describe("effectiveBoardRole", () => {
  it.each(["OWNER", "ADMIN"] as const)(
    "workspace %s is board ADMIN on every board, with or without a BoardMember row",
    (workspaceRole) => {
      for (const boardVisibility of visibilities) {
        for (const boardMemberRole of boardRoles) {
          expect(effectiveBoardRole({ workspaceRole, boardVisibility, boardMemberRole })).toBe("ADMIN");
        }
      }
    },
  );

  it("workspace MEMBER on a PRIVATE board gets their BoardMember role", () => {
    for (const boardMemberRole of ["ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(
        effectiveBoardRole({ workspaceRole: "MEMBER", boardVisibility: "PRIVATE", boardMemberRole }),
      ).toBe(boardMemberRole);
    }
  });

  it("workspace MEMBER on a PRIVATE board who is not a board member has no access", () => {
    expect(
      effectiveBoardRole({ workspaceRole: "MEMBER", boardVisibility: "PRIVATE", boardMemberRole: null }),
    ).toBeNull();
  });

  it("workspace MEMBER on a WORKSPACE board gets their BoardMember role if they have one", () => {
    for (const boardMemberRole of ["ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(
        effectiveBoardRole({ workspaceRole: "MEMBER", boardVisibility: "WORKSPACE", boardMemberRole }),
      ).toBe(boardMemberRole);
    }
  });

  it("workspace MEMBER on a WORKSPACE board without a BoardMember row is board MEMBER", () => {
    expect(
      effectiveBoardRole({ workspaceRole: "MEMBER", boardVisibility: "WORKSPACE", boardMemberRole: null }),
    ).toBe("MEMBER");
  });

  it("workspace VIEWER is board VIEWER at most: any BoardMember role is capped", () => {
    for (const boardMemberRole of ["ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(
        effectiveBoardRole({ workspaceRole: "VIEWER", boardVisibility: "WORKSPACE", boardMemberRole }),
      ).toBe("VIEWER");
      expect(
        effectiveBoardRole({ workspaceRole: "VIEWER", boardVisibility: "PRIVATE", boardMemberRole }),
      ).toBe("VIEWER");
    }
  });

  it("workspace VIEWER without a BoardMember row is VIEWER on a WORKSPACE board, none on a PRIVATE board", () => {
    expect(
      effectiveBoardRole({ workspaceRole: "VIEWER", boardVisibility: "WORKSPACE", boardMemberRole: null }),
    ).toBe("VIEWER");
    expect(
      effectiveBoardRole({ workspaceRole: "VIEWER", boardVisibility: "PRIVATE", boardMemberRole: null }),
    ).toBeNull();
  });

  it("a non-workspace member has no access whatever the board says", () => {
    for (const boardVisibility of visibilities) {
      for (const boardMemberRole of boardRoles) {
        expect(effectiveBoardRole({ workspaceRole: null, boardVisibility, boardMemberRole })).toBeNull();
      }
    }
  });
});

const mutatingWorkspace: WorkspacePermission[] = [
  "workspace.boards.create",
  "workspace.members.invite",
  "workspace.members.inviteAdmin",
  "workspace.members.manage",
  "workspace.owners.manage",
  "workspace.rename",
  "workspace.delete",
  "workspace.integrations.manage",
  "workspace.templates.manage",
  "workspace.boards.import",
];

describe("workspace permission matrix", () => {
  const roles: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

  it("every role can view the workspace", () => {
    for (const r of roles) expect(hasWorkspacePermission(r, "workspace.view")).toBe(true);
  });

  it("OWNER has every workspace permission", () => {
    for (const p of [...mutatingWorkspace, "workspace.view" as const]) {
      expect(hasWorkspacePermission("OWNER", p)).toBe(true);
    }
    expect(workspacePermissions.OWNER).toHaveLength(mutatingWorkspace.length + 1);
  });

  it("only OWNER manages owners and deletes the workspace", () => {
    for (const p of ["workspace.owners.manage", "workspace.delete"] as const) {
      expect(workspacePermissions.OWNER).toContain(p);
      for (const r of ["ADMIN", "MEMBER", "VIEWER"] as const) {
        expect(hasWorkspacePermission(r, p)).toBe(false);
      }
    }
  });

  it("ADMIN has everything except owner management and workspace deletion", () => {
    const expected = [...mutatingWorkspace, "workspace.view" as const]
      .filter((p) => p !== "workspace.owners.manage" && p !== "workspace.delete")
      .sort();
    expect([...workspacePermissions.ADMIN].sort()).toEqual(expected);
  });

  it("MEMBER can view, create boards, manage templates (own) and import boards only", () => {
    expect([...workspacePermissions.MEMBER].sort()).toEqual(
      [
        "workspace.boards.create",
        "workspace.boards.import",
        "workspace.templates.manage",
        "workspace.view",
      ].sort(),
    );
  });

  it("VIEWER can only view and lacks every mutating permission", () => {
    expect(workspacePermissions.VIEWER).toEqual(["workspace.view"]);
    for (const p of mutatingWorkspace) expect(hasWorkspacePermission("VIEWER", p)).toBe(false);
  });
});

describe("board permission matrix", () => {
  const readOnly: BoardPermission[] = [
    "board.view",
    "board.watch",
    "board.savedViews.createPersonal",
  ];
  const memberLevel: BoardPermission[] = [
    "board.cards.write",
    "board.comments.write",
    "board.cards.archive",
    "board.columns.write",
    "board.labels.manage",
    "board.timeTracking",
    "board.savedViews.share",
    "board.backlog.manage",
    "board.sprints.manage",
  ];
  const adminOnly: BoardPermission[] = [
    "board.cards.delete",
    "board.columns.archive",
    "board.settings",
    "board.members.manage",
    "board.lifecycle",
    "board.customFields.manage",
    "board.automations.manage",
    "board.export",
  ];

  it("VIEWER has exactly the read-only permissions", () => {
    expect([...boardPermissions.VIEWER].sort()).toEqual([...readOnly].sort());
    for (const p of [...memberLevel, ...adminOnly]) expect(hasBoardPermission("VIEWER", p)).toBe(false);
  });

  it("MEMBER has read-only plus member-level permissions, none of the admin-only ones", () => {
    expect([...boardPermissions.MEMBER].sort()).toEqual([...readOnly, ...memberLevel].sort());
    for (const p of adminOnly) expect(hasBoardPermission("MEMBER", p)).toBe(false);
  });

  it("ADMIN has every board permission", () => {
    expect([...boardPermissions.ADMIN].sort()).toEqual([...readOnly, ...memberLevel, ...adminOnly].sort());
  });

  it("lists no duplicates", () => {
    for (const list of [...Object.values(boardPermissions), ...Object.values(workspacePermissions)]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
