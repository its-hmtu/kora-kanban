<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR: Principle V materially expanded)
- Modified principles:
  - V. Simplicity & MVP Focus → V. Simplicity & Phased Delivery
    (phased master specs now count as approved specs; phase-order delivery rule added;
    notifications added to MVP list to match spec 001)
- Added sections: none
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read the constitution at runtime)
- Deferred TODOs: none
-->

# Kora Constitution

## Core Principles

### I. Kanban Domain Integrity

The core model is fixed: **Workspace → Board → Column → Card**.

- Every card MUST belong to exactly one column, and every column to exactly one board.
- Card and column order MUST be persisted server-side and survive reloads.
- Moving or reordering a card (drag & drop) MUST be atomic: a card is never lost, duplicated,
  or left in two columns.
- Deleting a board or column MUST NOT silently destroy cards; archive (soft delete) is the
  default, and permanent deletion requires explicit confirmation.

**Rationale**: Board, column, and card state is the product. If it cannot be trusted, nothing
else matters.

### II. Secure by Default

- All app data and actions MUST require an authenticated user.
- Authorization MUST be enforced on the server for every request, never only in the UI.
- Access is role-based per workspace (minimum: Owner, Admin, Member, Viewer); users MUST NOT
  read or modify data in workspaces they do not belong to.
- Passwords MUST be hashed with a modern algorithm; secrets MUST NOT be committed to the repo.
- All user input MUST be validated server-side and rendered safely (no XSS/injection).

**Rationale**: A multi-user project tool holds private team data; one leak breaks trust.

### III. Real-Time Consistency

- The server is the single source of truth.
- Changes to a board MUST reach all other connected viewers of that board without a manual
  refresh (target: under 2 seconds on a normal connection).
- The UI MAY apply changes optimistically but MUST roll back and inform the user when the
  server rejects them.
- Concurrent edits MUST resolve deterministically (e.g., last write wins per field) so all
  clients converge on the same state.

**Rationale**: Kanban is a shared, live view of work; a stale board misleads the team.

### IV. Tested Critical Paths

Automated tests are REQUIRED for, at minimum:

- Authentication and permission checks (including denied-access cases).
- Board/column/card create, update, archive, and move/reorder logic.
- Real-time event delivery for board changes.

All tests MUST pass before a change is merged. Bugs in these areas MUST get a regression test.

**Rationale**: Full TDD is not mandated, but the paths that protect data and access cannot
regress.

### V. Simplicity & Phased Delivery

- Build only what an approved spec requires (YAGNI); no speculative abstractions or
  configuration.
- Every feature MUST be covered by an approved spec before implementation. A phased master
  spec (user stories prioritized P1→P4) counts as approval for all phases it describes.
- Delivery MUST follow phase order: the MVP (P1 — boards, columns, cards, drag & drop, card
  details, authentication, workspace members/roles, real-time sync, notifications) ships first;
  later phases (P2–P4) start only after the previous phase is working and tested.
- Each phase MUST be shippable on its own; work from a later phase MUST NOT block or
  destabilize an earlier one.
- Features not described in any approved spec MUST get a spec (or a spec amendment) first.
- Added complexity (new service, dependency, or pattern) MUST be justified in the plan.

**Rationale**: A small, solid core ships sooner and is easier to extend correctly; phasing
keeps a large roadmap from diluting the MVP.

## Technical Constraints

- **Platform**: Web application supporting the latest two versions of major evergreen browsers
  (Chrome, Firefox, Safari, Edge).
- **Responsiveness**: Desktop-first, but core flows (view board, open/edit card, move card)
  MUST be usable on mobile screen widths.
- **Persistence**: All board data MUST be stored in a durable server-side database; no
  critical state lives only in the browser.
- **Auditability**: Every board, column, and card MUST record created/updated timestamps and
  the acting user.
- **Performance**: A board with 500 cards MUST load and remain interactive (drag & drop
  without noticeable lag) on a typical laptop.
- **Accessibility**: Every drag & drop action MUST also be achievable without a mouse
  (e.g., keyboard or a "Move to…" menu).

## Development Workflow

- Every feature follows the Spec Kit flow: `spec.md` → `plan.md` → `tasks.md` → implementation.
- Each `plan.md` MUST pass the Constitution Check; any violation MUST be listed and justified
  in its Complexity Tracking section.
- Changes are merged through a reviewed pull request with all automated tests passing.
- Database schema changes MUST be delivered as versioned migrations.

## Governance

- This constitution supersedes other project practices. Where they conflict, this document wins.
- **Amendments**: Proposed via pull request that edits this file, states the reason, and
  describes the impact on existing specs/plans. Amendments take effect once merged.
- **Versioning** (semantic):
  - MAJOR: a principle is removed or redefined in a backward-incompatible way.
  - MINOR: a principle or section is added or materially expanded.
  - PATCH: wording, clarification, or typo fixes.
- **Compliance**: Plan reviews and code reviews MUST check changes against these principles;
  `/speckit-analyze` treats constitution conflicts as critical.

**Version**: 1.1.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
