# Contract: Roles & Permissions

**Feature**: [../spec.md](../spec.md) FR-012 to FR-016 · Constitution Principle II

The permission names and the role → permission mapping live in `packages/shared/src/permissions/`.
The NestJS guards and the web UI both use them. The UI only hides controls; the server always
enforces the permission.

## Effective board role

```
workspace role OWNER or ADMIN           → board ADMIN on every board in the workspace
workspace MEMBER, board PRIVATE         → their BoardMember role; not a board member → no access
workspace MEMBER, board WORKSPACE       → their BoardMember role if they have one, else MEMBER
workspace VIEWER                        → board VIEWER at most (any BoardMember role is capped)
not a workspace member                  → no access, and the API returns 404
```

The board creator is always added as board ADMIN (a `BoardMember` row created with the board).

## Role ceiling

The highest board role a user can be given, based on their workspace role (FR-014):

| Workspace role | Highest board role |
|---|---|
| Owner / Admin | ADMIN (always, implicitly) |
| Member | ADMIN |
| Viewer | VIEWER |

Assigning a board role above the ceiling is rejected with `422`.

## Workspace permissions

| Permission | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| View the workspace and its member list | ✅ | ✅ | ✅ | ✅ |
| Create boards | ✅ | ✅ | ✅ | ❌ |
| Invite members (as Member or Viewer) | ✅ | ✅ | ❌ | ❌ |
| Invite or promote to Admin | ✅ | ✅ | ❌ | ❌ |
| Change roles and remove members (except Owners) | ✅ | ✅ | ❌ | ❌ |
| Manage Owners (add, remove, transfer) | ✅ | ❌ | ❌ | ❌ |
| Rename the workspace | ✅ | ✅ | ❌ | ❌ |
| Delete the workspace | ✅ | ❌ | ❌ | ❌ |
| Manage integrations and webhooks (P4) | ✅ | ✅ | ❌ | ❌ |
| Manage workspace templates (P4) | ✅ | ✅ | ✅ (own) | ❌ |
| Import a board (P4) | ✅ | ✅ | ✅ | ❌ |

## Board permissions (by effective board role)

| Permission | Admin | Member | Viewer |
|---|:-:|:-:|:-:|
| View the board, cards, comments, activity and reports | ✅ | ✅ | ✅ |
| Watch cards and get notifications | ✅ | ✅ | ✅ |
| Create, edit and move cards; manage checklists, attachments, assignees, labels on cards | ✅ | ✅ | ❌ |
| Comment (edit and delete own comments only) | ✅ | ✅ | ❌ |
| Archive and restore cards | ✅ | ✅ | ❌ |
| Permanently delete cards | ✅ | ❌ | ❌ |
| Create, rename and reorder columns | ✅ | ✅ | ❌ |
| Archive and restore columns | ✅ | ❌ | ❌ |
| Manage labels | ✅ | ✅ | ❌ |
| Board settings (name, visibility, WIP limits, policies, swimlanes, aging, estimate unit, mode, background) | ✅ | ❌ | ❌ |
| Manage board members | ✅ | ❌ | ❌ |
| Archive, restore and permanently delete the board | ✅ | ❌ | ❌ |
| Track time on cards (P3) | ✅ | ✅ | ❌ |
| Saved views: create personal ones | ✅ | ✅ | ✅ |
| Saved views: share with the board | ✅ | ✅ | ❌ |
| Backlog, issue types, card links (P4) | ✅ | ✅ | ❌ |
| Custom fields and workflow rules (P4) | ✅ | ❌ | ❌ |
| Plan, start and complete sprints (P4) | ✅ | ✅ | ❌ |
| Automation rules (P4) | ✅ | ❌ | ❌ |
| Export the board (P4) | ✅ | ❌ | ❌ |

## Public API tokens (P4)

The operations a token can perform are the intersection of its scopes and the user's own
permissions:

- `read`: GET endpoints only.
- `write`: `read` plus create, update, move and archive.
- `admin`: `write` plus board and workspace settings, members and webhooks.

## Required tests (Constitution IV)

Each permission test names the row it covers with `describePermission('<row text>')`, and
`permissions-coverage.spec.ts` fails if any row in this file has no matching test.

For every permission row above, there must be at least one test where the action is **allowed**
and one where it is **denied**. Denied cases include non-members getting a `404` with no data
leaked (SC-005).
