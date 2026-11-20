# Feature Specification: Kora — Kanban Project Management Platform (Master Spec)

**Feature Branch**: `001-kora-kanban-platform`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "I am building a kanban project management web app like Jira or Trello. This app called Kora. It must include all the MVPs and nice-to-have features that you have been researched and listed for me. Plan this project to analyze what it will have and what does it need. Ask me anything to clarify before any unclear decisions, do not decide by yourself."

## Overview

Kora is a web-based Kanban project management application. This is a **master, phased
specification** covering the full product. User stories are grouped into delivery phases:

| Phase | Priority | Scope |
|-------|----------|-------|
| MVP | P1 | Accounts, workspaces & roles, boards/columns/cards, card details, real-time collaboration, notifications |
| v1 | P2 | Kanban flow controls (WIP limits, swimlanes, aging, blocked), search, filters & views |
| v2 | P3 | Time tracking & estimates, reporting & flow metrics |
| Later | P4 | Jira-like structure (issue types, backlog, workflows), Scrum sprints, automation & templates, integrations & public API, export/import, offline, multi-language, themes |

Each phase MUST be shippable on its own; later phases build on earlier ones.

**Decisions confirmed with the product owner (2026-11-09)**:

- Spec scope: one master spec, phased P1→P4.
- Agile scope: full Jira-like, including Scrum sprints.
- Audience: anyone can sign up (open registration, free); treated as a personal learning project
  (no billing, modest scale).
- Integrations: public API + webhooks, Slack, GitHub/GitLab, Google Drive & Google Calendar.
- Sign-in: email + password, Google, GitHub.
- Board visibility: private (board members) or workspace-visible only; no public boards.
- Notifications: in-app, email, and browser push.
- Platform: offline support, multi-language UI, dark mode & board themes. No import from Trello/Jira.
- Launch languages: English, Spanish, French, German, Chinese (Simplified), Vietnamese.
- Data portability: export boards and re-import Kora export files.
- Attachment size limit: 10 MB per file.

## Clarifications

### Session 2026-11-20

- Q: In what form should the API send `boardVersion` (over WebSocket and REST)? → A: As a decimal string everywhere (e.g. `"1042"`), since it is a bigint; applied in contracts/realtime-events.md and contracts/rest-api.md.
- Q: Which error code does the API return for unexpected server errors (500 or unmapped status)? → A: `INTERNAL`, with a generic localized message and no internal details; added to the `ErrorCode` list (T014) and contracts/rest-api.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Account & Sign-in (Priority: P1 · MVP)

A visitor signs up with email + password or with a Google or GitHub account, verifies their
email (for password accounts), signs in, signs out, and resets a forgotten password. They can
edit their profile (name, avatar, language, theme, notification preferences).

**Why this priority**: Every other capability requires an identified user.

**Independent Test**: Register a new account by each method, sign out, sign back in, reset the
password, and update the profile.

**Acceptance Scenarios**:

1. **Given** a visitor with an unused email, **When** they sign up with email and password,
   **Then** an account is created and a verification email is sent.
2. **Given** a visitor, **When** they choose "Continue with Google" or "Continue with GitHub" and
   approve, **Then** they are signed in, and an account is created on first use.
3. **Given** an existing password account with email X, **When** the user signs in with a
   Google/GitHub account using the same verified email X, **Then** the sign-in method is linked
   to the existing account rather than creating a duplicate.
4. **Given** a user who forgot their password, **When** they request a reset, **Then** they
   receive a single-use, time-limited reset link.
5. **Given** repeated failed sign-in attempts, **When** the threshold is exceeded, **Then**
   further attempts are temporarily throttled.

---

### User Story 2 - Workspaces, Members & Roles (Priority: P1 · MVP)

A user creates a workspace for a team, invites others by email or invite link, and assigns
workspace roles (Owner, Admin, Member, Viewer). Each workspace contains boards.

**Why this priority**: Kora is a team tool; access control protects every board.

**Independent Test**: Create a workspace, invite a second user, change their role, verify what
each role can and cannot do, and remove them.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a workspace, **Then** they become its Owner.
2. **Given** an Admin, **When** they invite an email address, **Then** the invitee receives an
   invite and joins with the chosen role after accepting.
3. **Given** a Viewer, **When** they try to create or edit a card, **Then** the action is denied.
4. **Given** a user who is not a member of workspace W, **When** they try to access any board in
   W, **Then** access is denied and no board data is revealed.
5. **Given** the last Owner of a workspace, **When** they try to leave or downgrade themselves,
   **Then** they are prevented until another Owner exists.

---

### User Story 3 - Boards, Columns & Cards with Drag-and-Drop (Priority: P1 · MVP)

A member creates a board (from blank or a default "To Do / In Progress / Done" layout), adds,
renames, reorders, and archives columns, and creates cards. They move cards within and between
columns by dragging, or with the keyboard / a "Move to…" menu. Archived items can be restored.

**Why this priority**: This is the core Kanban experience.

**Independent Test**: Create a board, add columns and cards, drag cards across columns, reload
the page, and confirm order is preserved; archive and restore a column.

**Acceptance Scenarios**:

1. **Given** a board, **When** a member drags a card from "To Do" to "In Progress", **Then** the
   card appears in the new column at the dropped position and stays there after reload.
2. **Given** a user without a mouse, **When** they use the keyboard or "Move to…" menu, **Then**
   they can move a card to any column and position.
3. **Given** a column with cards, **When** an Admin archives the column, **Then** the column and
   its cards are archived (not deleted) and can be restored.
4. **Given** an archived card, **When** a user with permission permanently deletes it, **Then**
   an explicit confirmation is required first.
5. **Given** a board, **When** its creator sets visibility to "Private", **Then** only board
   members can see it; when set to "Workspace", all workspace members can see it.

---

### User Story 4 - Card Details & Collaboration (Priority: P1 · MVP)

A member opens a card and manages its title, rich-text description, assignees, start and due
dates, labels, priority, checklists, attachments, and comments with @mentions. Every change
appears in the card's activity history.

**Why this priority**: Cards without details are sticky notes; details make Kora a work tracker.

**Independent Test**: Open a card, fill every field, add a checklist and attachment, comment
with an @mention, and verify the activity history lists each change.

**Acceptance Scenarios**:

1. **Given** a card, **When** a member sets a due date in the past, **Then** the card shows an
   "overdue" indicator on the board.
2. **Given** a checklist with 5 items, **When** 3 are checked, **Then** the card shows 3/5
   progress on the board.
3. **Given** a file larger than 10 MB, **When** a member tries to attach it, **Then** the upload
   is rejected with a clear message.
4. **Given** a comment containing @alice, **When** it is posted, **Then** Alice is notified.
5. **Given** any change to a card, **When** a member views the activity history, **Then** they
   see who made the change, what changed, and when.

---

### User Story 5 - Real-time Collaboration (Priority: P1 · MVP)

Several members view the same board. Any change made by one (create, edit, move, archive,
comment) appears for the others without refreshing. Members can see who else is viewing.

**Why this priority**: A shared board that goes stale misleads the team (Constitution III).

**Independent Test**: Open the same board in two browsers as different users; make changes in
one and confirm they appear in the other within 2 seconds.

**Acceptance Scenarios**:

1. **Given** two users on the same board, **When** user A moves a card, **Then** user B sees the
   move within 2 seconds without reloading.
2. **Given** two users editing the same card field at the same time, **When** both save, **Then**
   all clients end up showing the same final value and the overwritten user is informed.
3. **Given** a user whose change is rejected (e.g., lost permission), **When** the rejection
   arrives, **Then** their screen reverts the change and shows an explanation.
4. **Given** a user who temporarily loses connection, **When** they reconnect, **Then** their
   board catches up to the current state automatically.

---

### User Story 6 - Notifications (Priority: P1 · MVP)

Users are notified when they are assigned, @mentioned, when a card they watch changes, and
when due dates approach or pass. Notifications are delivered in-app, by email, and by browser
push, each configurable per user.

**Why this priority**: Without notifications, collaborators miss work assigned to them.

**Independent Test**: Assign a card to user B and @mention them; confirm B receives in-app,
email, and push notifications per their settings; disable email and confirm none is sent.

**Acceptance Scenarios**:

1. **Given** user B is assigned to a card, **When** the assignment is saved, **Then** B gets an
   in-app notification and, if enabled, email and push.
2. **Given** a card due in 24 hours, **When** the reminder time arrives, **Then** assignees are
   notified once.
3. **Given** a user who chose "daily email digest", **When** notifications accumulate, **Then**
   they receive one summary email per day instead of individual emails.
4. **Given** unread in-app notifications, **When** the user opens one, **Then** it is marked read
   and they are taken to the related card.

---

### User Story 7 - Kanban Flow Controls (Priority: P2 · v1)

Board admins set WIP (work-in-progress) limits per column, group cards into swimlanes (by
assignee, priority, epic, or custom lanes), mark cards as blocked with a reason, see cards that
have not moved for a while (aging), and write a "Definition of Done" / policy per column.

**Why this priority**: These features distinguish real Kanban from a to-do list.

**Independent Test**: Set a WIP limit of 3 on a column, add a 4th card, and confirm a warning;
switch swimlanes to "by assignee"; flag a card as blocked.

**Acceptance Scenarios**:

1. **Given** a column with WIP limit 3 holding 3 cards, **When** a 4th card is moved in, **Then**
   the column is visibly flagged as over limit (the move is allowed, but warned).
2. **Given** swimlanes grouped by assignee, **When** a card's assignee changes, **Then** the card
   moves to that assignee's lane.
3. **Given** a card marked blocked with a reason, **When** viewed on the board, **Then** it shows
   a blocked indicator and the reason on hover/focus.
4. **Given** a card with no movement for longer than the board's aging threshold, **When** the
   board is viewed, **Then** the card is visually marked as aging.

---

### User Story 8 - Search, Filters & Views (Priority: P2 · v1)

Users search across cards, comments, and boards they can access; filter a board by assignee,
label, due date, priority, or "my tasks"; save filters as named views; and switch a board
between Board, List/Table, Calendar, and Timeline views.

**Why this priority**: As boards grow, finding work becomes the bottleneck.

**Independent Test**: Search a keyword found only in a comment and confirm the card is found;
apply and save a filter; open the Calendar view and confirm cards appear on their due dates.

**Acceptance Scenarios**:

1. **Given** a keyword, **When** a user searches, **Then** only results from boards they can
   access are shown.
2. **Given** a saved filter, **When** the user reopens the board later, **Then** they can apply
   it in one action.
3. **Given** the Calendar view, **When** a user drags a card to another day, **Then** its due
   date changes.
4. **Given** the Timeline view, **When** cards have start and due dates, **Then** they appear as
   bars spanning those dates.

---

### User Story 9 - Time Tracking & Estimates (Priority: P3 · v2)

Members start/stop a timer on a card, log time manually, use a built-in Pomodoro timer, set
estimates (story points or hours, chosen per board), and create recurring cards that are
re-created on a schedule.

**Why this priority**: Valuable for productivity but not needed to manage work day one.

**Independent Test**: Start a timer, stop it after a few minutes, add a manual log, and verify
the card's total time; create a weekly recurring card and confirm the next copy is created.

**Acceptance Scenarios**:

1. **Given** a running timer on card A, **When** the user starts a timer on card B, **Then**
   card A's timer stops automatically (one active timer per user).
2. **Given** a Pomodoro session, **When** the work interval ends, **Then** the user is alerted
   and the time is logged to the card.
3. **Given** a recurring card set to "every Monday", **When** Monday arrives, **Then** a new card
   is created in the configured column.

---

### User Story 10 - Reporting & Flow Metrics (Priority: P3 · v2)

Board admins view a Cumulative Flow Diagram, cycle time and lead time, throughput, burndown /
burnup charts (for sprints), and workload per member, filtered by date range.

**Why this priority**: Metrics help teams improve, but require historical data first.

**Independent Test**: Move several cards through a board over time; open reports and confirm
the CFD and cycle-time figures match the recorded movements.

**Acceptance Scenarios**:

1. **Given** cards moved to Done during a period, **When** viewing throughput, **Then** the count
   per week matches the number of cards completed.
2. **Given** a card that entered "In Progress" on day 1 and "Done" on day 4, **When** viewing
   cycle time, **Then** it counts as 3 days.
3. **Given** an active sprint, **When** viewing burndown, **Then** remaining estimate is plotted
   per day against the ideal line.

---

### User Story 11 - Project Structure: Issue Types, Backlog & Workflows (Priority: P4 · Later)

Users classify cards by issue type (Epic, Story, Task, Bug, Subtask), keep a prioritized
backlog of work not yet on the board, link cards with dependencies ("blocks" / "is blocked
by"), add custom fields, and define custom workflows (allowed column transitions).

**Why this priority**: Jira-level structure for larger projects; Kanban works without it.

**Independent Test**: Create an Epic with child Stories, add a dependency between two cards,
add a custom field, and define a workflow that forbids moving from "To Do" straight to "Done".

**Acceptance Scenarios**:

1. **Given** an Epic, **When** its child Stories are completed, **Then** the Epic shows progress.
2. **Given** card A blocks card B, **When** B is viewed, **Then** it shows it is blocked by A.
3. **Given** a workflow forbidding "To Do → Done", **When** a user tries that move, **Then** it is
   rejected with an explanation.
4. **Given** a backlog item, **When** a user moves it onto the board, **Then** it appears in the
   board's first column.

---

### User Story 12 - Scrum Sprints (Priority: P4 · Later)

On a board in Scrum mode, users plan sprints from the backlog (name, goal, start/end dates),
start and complete sprints, and carry unfinished work to the backlog or next sprint.

**Why this priority**: Supports Scrum teams; large scope, so it comes after core Kanban.

**Independent Test**: Create a sprint with 5 backlog items, start it, finish 3, complete the
sprint, and confirm 2 items are moved where the user chose.

**Acceptance Scenarios**:

1. **Given** a board in Scrum mode, **When** a sprint is started, **Then** the board shows only
   that sprint's cards.
2. **Given** a sprint with incomplete cards, **When** it is completed, **Then** the user chooses
   to send them to the backlog or the next sprint.
3. **Given** a board, **When** only one sprint can be active at a time, **Then** starting a
   second sprint is prevented until the first is completed.

---

### User Story 13 - Automation & Templates (Priority: P4 · Later)

Board admins create rules of the form "When [trigger] and [condition], then [actions]" (e.g.,
"When a card moves to Done, check all checklist items and notify the creator"), and save boards
and cards as templates for reuse.

**Why this priority**: Saves repetitive work once core usage is established.

**Independent Test**: Create a rule "When card moves to Done → add label 'Shipped'"; move a card
to Done and confirm the label is added and the run is logged.

**Acceptance Scenarios**:

1. **Given** an active rule, **When** its trigger occurs and conditions match, **Then** its actions
   run and the run is recorded in the rule's history.
2. **Given** a rule whose action triggers itself, **When** it runs, **Then** the loop is detected
   and stopped.
3. **Given** a board template, **When** a user creates a board from it, **Then** columns, labels,
   and template cards are copied.

---

### User Story 14 - Integrations & Public API (Priority: P4 · Later)

Workspace admins connect Slack (post board events to channels), GitHub/GitLab (link commits
and pull/merge requests to cards; optionally move a card when a linked request merges),
Google Drive (attach Drive files), and Google Calendar (sync due dates). Developers use a
public API with personal access tokens and subscribe to webhooks for board events.

**Why this priority**: Connects Kora to the team's other tools; builds on a stable core.

**Independent Test**: Create an access token, create a card through the API, and confirm it
appears on the board; register a webhook and confirm it receives the "card created" event.

**Acceptance Scenarios**:

1. **Given** a Slack channel connected to a board, **When** a card is moved to Done, **Then** a
   message is posted to that channel.
2. **Given** a commit message that references a card, **When** it is pushed, **Then** the card
   shows the linked commit.
3. **Given** a revoked access token, **When** it is used, **Then** the request is denied.
4. **Given** a webhook endpoint that fails, **When** delivery fails, **Then** it is retried with
   increasing delays and failures are visible to the admin.

---

### User Story 15 - Export & Re-import (Priority: P4 · Later)

Board admins export a board (cards, columns, labels, checklists, comments) as CSV or as a full
Kora export file, and import a Kora export file to restore a board or copy it to another
workspace.

**Why this priority**: Gives users ownership of their data and a backup path.

**Independent Test**: Export a board, import it into another workspace, and confirm columns,
cards, and details match.

**Acceptance Scenarios**:

1. **Given** a board, **When** exported and re-imported, **Then** the new board has identical
   columns, cards, labels, checklists, and comments.
2. **Given** an export referencing users not in the target workspace, **When** imported, **Then**
   those assignments are dropped or mapped, and the user is told which.
3. **Given** a corrupted or non-Kora file, **When** imported, **Then** it is rejected with a
   clear error and nothing is partially created.

---

### User Story 16 - Platform Experience: Offline, Languages, Themes (Priority: P4 · Later)

Users install Kora to their device and keep viewing and editing boards while offline; changes
sync when back online. The interface is available in multiple languages. Users choose
light/dark mode and boards can have custom backgrounds. Keyboard shortcuts speed up common
actions. Kora works on desktop and mobile screen sizes.

**Why this priority**: Polishes the experience; offline editing is high-complexity.

**Independent Test**: Load a board, go offline, move and edit cards, reconnect, and confirm
changes sync; switch language and theme and confirm the UI updates.

**Acceptance Scenarios**:

1. **Given** an offline user who moved 3 cards, **When** they reconnect, **Then** the moves are
   sent and the board reflects them for everyone.
2. **Given** an offline change that conflicts with a newer server change, **When** syncing,
   **Then** conflicts resolve deterministically and the user is told what was overridden.
3. **Given** a user who selects another language, **When** the UI reloads, **Then** all
   interface text appears in that language.
4. **Given** dark mode, **When** enabled, **Then** all screens use the dark theme with readable
   contrast.

---

### Edge Cases

- A user is removed from a workspace while viewing one of its boards → access ends immediately
  and the board view closes with an explanation.
- Two users drag the same card to different columns at the same moment → one final position
  wins and both screens converge on it; no duplicate card appears.
- A column is archived while another user is dragging a card into it → the drop fails safely and
  the card returns to its original position.
- A card is deleted while another user has it open → that user is told it was removed.
- An invite is sent to an email that already has an account → the invite attaches to that account.
- An OAuth provider returns an email that is unverified → the account is not auto-linked.
- Upload interrupted or file over 10 MB → no partial attachment is saved.
- A due date reminder for a card that is already Done → no reminder is sent.
- WIP limit lowered below current card count → column immediately shows over-limit.
- A recurring card's target column was archived → creation pauses and the owner is notified.
- An automation rule references a deleted label or column → the rule is disabled and the admin
  is notified.
- An external integration (Slack, GitHub, Google) is disconnected or its access revoked → Kora
  marks it as disconnected and stops sending, without affecting the board.
- Offline edits made after the user lost access to the board → rejected on sync with a notice.
- A board contains 500 cards → it still loads and drag-and-drop stays responsive.
- Missing translation for a string → falls back to English.

## Requirements *(mandatory)*

### Functional Requirements

#### Accounts & Authentication (P1)

- **FR-001**: System MUST allow open registration with email + password, with email verification.
- **FR-002**: System MUST allow sign-in with Google and GitHub accounts.
- **FR-003**: System MUST link a social sign-in to an existing account only when the provider
  confirms the same verified email.
- **FR-004**: System MUST provide password reset via single-use, time-limited links.
- **FR-005**: System MUST throttle repeated failed sign-in attempts.
- **FR-006**: Users MUST be able to edit their profile (name, avatar, language, theme,
  notification preferences) and delete their account.
- **FR-007**: Users MUST be able to sign out, including from all devices.

#### Workspaces, Membership & Permissions (P1)

- **FR-010**: Users MUST be able to create workspaces; the creator becomes Owner.
- **FR-011**: Owners/Admins MUST be able to invite members by email or shareable invite link,
  and revoke invites.
- **FR-012**: System MUST support workspace roles Owner, Admin, Member, Viewer with these
  capabilities: Owner — everything incl. deleting the workspace and managing Owners; Admin —
  manage members, boards, settings, integrations; Member — create/edit boards and cards they can
  access; Viewer — read-only.
- **FR-013**: Boards MUST have visibility "Private" (board members only) or "Workspace" (all
  workspace members). Public boards are NOT supported.
- **FR-014**: Board-level roles (Admin, Member, Viewer) MUST be assignable per board and MUST NOT
  exceed the user's workspace role: workspace Members can be at most board Admin, and workspace
  Viewers at most board Viewer. The creator of a board is always its board Admin.
- **FR-015**: Every action MUST be authorized server-side; users MUST NOT access data in
  workspaces or private boards they don't belong to.
- **FR-016**: A workspace MUST always have at least one Owner.

#### Boards, Columns & Cards (P1)

- **FR-020**: Members MUST be able to create, rename, archive, restore, and delete boards; new
  boards can start blank or with default columns (To Do, In Progress, Done).
- **FR-021**: Members MUST be able to create, rename, reorder, archive, and restore columns.
- **FR-022**: Members MUST be able to create, edit, archive, restore, and permanently delete
  cards; permanent deletion requires confirmation.
- **FR-023**: Users MUST be able to move cards within and between columns by drag-and-drop and
  by a keyboard-accessible alternative.
- **FR-024**: Card and column order MUST persist and survive reload; a move MUST never lose or
  duplicate a card.
- **FR-025**: Archived items MUST be viewable in an archive list per board.

#### Card Details (P1)

- **FR-030**: Cards MUST support title, rich-text description, multiple assignees, start date,
  due date, labels (board-defined, colored), and priority (Low, Medium, High, Urgent).
- **FR-031**: Cards MUST support one or more checklists with progress shown on the card face.
- **FR-032**: Cards MUST support file attachments up to 10 MB each and link attachments.
- **FR-033**: Cards MUST support comments with @mentions; authors can edit/delete their comments.
- **FR-034**: Each card MUST have an activity history recording actor, change, and timestamp.
- **FR-035**: Overdue and due-soon cards MUST be visually indicated on the board.
- **FR-036**: Users MUST be able to "watch" a card to get notified of its changes.

#### Real-time Collaboration (P1)

- **FR-040**: Changes to a board MUST be visible to all other viewers within 2 seconds without
  manual refresh.
- **FR-041**: The UI MAY show changes immediately but MUST revert and explain when the server
  rejects them.
- **FR-042**: Concurrent edits MUST resolve deterministically so all clients converge.
- **FR-043**: Users MUST see who else is currently viewing a board.
- **FR-044**: After reconnecting, clients MUST automatically catch up to the current state.

#### Notifications (P1)

- **FR-050**: System MUST notify users on: assignment, @mention, changes to watched cards, due
  soon (default 24 h before), overdue, and invitations.
- **FR-051**: Notifications MUST be delivered in-app, by email, and by browser push.
- **FR-052**: Users MUST be able to configure each channel per notification type, and choose
  instant email or daily digest.
- **FR-053**: In-app notifications MUST support read/unread and link to the related item.

#### Kanban Flow Controls (P2)

- **FR-060**: Board admins MUST be able to set an optional WIP limit per column; exceeding it
  shows a warning but does not block the move.
- **FR-061**: Boards MUST support swimlanes grouped by assignee, priority, epic, or custom lanes.
- **FR-062**: Members MUST be able to flag a card as blocked with a reason.
- **FR-063**: Cards not moved within a board-configurable threshold (default 7 days) MUST be
  marked as aging.
- **FR-064**: Columns MUST support a written policy / Definition of Done shown to users.

#### Search, Filters & Views (P2)

- **FR-070**: Users MUST be able to search card titles, descriptions, and comments across all
  boards they can access.
- **FR-071**: Users MUST be able to filter boards by assignee, label, due date, priority, and
  "assigned to me", and save filters as named views.
- **FR-072**: Boards MUST be viewable as Board, List/Table, Calendar, and Timeline.
- **FR-073**: Users MUST have a "My tasks" page listing cards assigned to them across boards.

#### Time Tracking & Estimates (P3)

- **FR-080**: Members MUST be able to start/stop a timer on a card (one active timer per user)
  and log time manually.
- **FR-081**: System MUST provide a Pomodoro timer with configurable work/break intervals that
  logs work time to the selected card.
- **FR-082**: Board admins MUST be able to choose an estimation unit per board (story points or
  hours); members set estimates on cards.
- **FR-083**: Members MUST be able to make cards recurring (daily, weekly, monthly, custom).

#### Reporting (P3)

- **FR-090**: System MUST provide per-board reports: Cumulative Flow Diagram, cycle time, lead
  time, throughput, workload per member, and (for sprints) burndown and burnup.
- **FR-091**: Reports MUST be filterable by date range and computed from recorded card history.

#### Project Structure (P4)

- **FR-100**: Cards MUST support issue types: Epic, Story, Task, Bug, Subtask, with parent/child
  relationships (Epic → Story/Task/Bug → Subtask).
- **FR-101**: Each board MUST have a prioritized backlog of items not yet on the board.
- **FR-102**: Cards MUST support dependency links ("blocks" / "is blocked by", "relates to").
- **FR-103**: Board admins MUST be able to define custom fields (text, number, date, single/
  multi-select, user).
- **FR-104**: Board admins MUST be able to define allowed column transitions (workflows); moves
  violating them MUST be rejected with an explanation.

#### Scrum Sprints (P4)

- **FR-110**: Boards MUST be configurable as Kanban mode or Scrum mode.
- **FR-111**: In Scrum mode, users MUST be able to create sprints (name, goal, dates), plan them
  from the backlog, start, and complete them; only one sprint is active per board at a time.
- **FR-112**: On completion, unfinished cards MUST be moved to the backlog or the next sprint as
  the user chooses.

#### Automation & Templates (P4)

- **FR-120**: Board admins MUST be able to create automation rules (trigger, conditions,
  actions), enable/disable them, and view their run history.
- **FR-121**: System MUST detect and stop automation loops.
- **FR-122**: Users MUST be able to save and create from board templates and card templates.

#### Integrations & Public API (P4)

- **FR-130**: System MUST provide a documented public API covering boards, columns, cards,
  comments, and members, authenticated by revocable personal access tokens with scopes.
- **FR-131**: Admins MUST be able to register webhooks for board events, with retry on failure
  and a delivery log.
- **FR-132**: Workspaces MUST be able to connect Slack and route selected board events to
  chosen channels.
- **FR-133**: Workspaces MUST be able to connect GitHub and GitLab to link commits and pull/merge
  requests to cards, and optionally move a card when a linked request is merged.
- **FR-134**: Users MUST be able to attach Google Drive files to cards.
- **FR-135**: Users MUST be able to sync their cards' due dates to their Google Calendar.
- **FR-136**: The public API MUST be rate-limited per token.

#### Export & Import (P4)

- **FR-140**: Board admins MUST be able to export a board as CSV (cards) or as a full Kora export
  file (all board content).
- **FR-141**: Users MUST be able to import a Kora export file into a workspace they can create
  boards in; import is all-or-nothing.
- **FR-142**: Importing from other products (Trello, Jira) is OUT OF SCOPE.

#### Platform Experience (P4)

- **FR-150**: Kora MUST be installable on devices and allow viewing and editing previously
  loaded boards while offline, syncing changes when reconnected.
- **FR-151**: The UI MUST support multiple languages, selectable per user, falling back to
  English for missing text. Languages at launch (6): English, Spanish, French, German,
  Chinese (Simplified), and Vietnamese.
- **FR-152**: Users MUST be able to choose light, dark, or system theme; boards MUST support
  custom background colors or images.
- **FR-153**: System MUST provide keyboard shortcuts for common actions and a shortcut help panel.
- **FR-154**: Core flows (view board, open/edit card, move card) MUST be usable on mobile screen
  widths.

### Key Entities

- **User**: A person with an account; profile, preferences (language, theme, notifications),
  linked sign-in methods.
- **Workspace**: A team container; has members with workspace roles and holds boards,
  integrations, and templates.
- **Membership**: Links a user to a workspace or board with a role.
- **Invitation**: A pending invite (email or link) to a workspace, with role and expiry.
- **Board**: A Kanban board with mode (Kanban/Scrum), visibility, settings (aging threshold,
  estimate unit, theme), columns, labels, swimlane config, custom fields, workflow, backlog.
- **Column**: An ordered list on a board with name, position, optional WIP limit, and policy.
- **Swimlane**: A horizontal grouping of cards on a board.
- **Card**: A unit of work with title, description, issue type, parent, column, position,
  assignees, dates, labels, priority, estimate, blocked flag/reason, custom field values,
  recurrence, and archive state.
- **Label**: A colored, named tag defined per board.
- **Checklist / Checklist Item**: An ordered set of items with done state belonging to a card.
- **Attachment**: A file (≤10 MB) or link (incl. Google Drive) attached to a card.
- **Comment**: Text on a card by a user, with mentions.
- **Activity Event**: Immutable record of who changed what and when; source for history and
  reports.
- **Card Link**: A dependency or relation between two cards.
- **Sprint**: A time-boxed set of cards on a Scrum board with goal, dates, and state.
- **Time Entry**: A timer session or manual log of time spent by a user on a card.
- **Notification**: A message to a user about an event, with channel delivery and read state.
- **Saved View / Filter**: A named filter configuration on a board.
- **Automation Rule**: Trigger, conditions, actions, enabled state, run history.
- **Template**: A reusable board or card blueprint.
- **Integration Connection**: A workspace's link to Slack, GitHub, GitLab, or Google, with status.
- **Access Token**: A revocable, scoped credential for the public API.
- **Webhook**: An endpoint subscribed to board events, with delivery log.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can sign up, create a workspace and board, and add their first card in
  under 3 minutes.
- **SC-002**: Board changes appear for other viewers within 2 seconds in 95% of cases.
- **SC-003**: A board with 500 cards loads in under 3 seconds and drag-and-drop feels immediate
  (card follows the pointer with no visible lag) on a typical laptop.
- **SC-004**: Zero cases of cards lost or duplicated by moves across all automated and manual
  testing of concurrent moves.
- **SC-005**: 100% of permission test cases deny access to data outside the user's workspaces
  and private boards.
- **SC-006**: Search returns results in under 1 second for workspaces with up to 10,000 cards.
- **SC-007**: The system supports at least 100 concurrent users without noticeable slowdown
  (sized for a personal learning project with open sign-up).
- **SC-008**: Every board action that can be done by dragging can also be completed using only
  the keyboard.
- **SC-009**: Offline edits sync successfully within 10 seconds of reconnecting, with conflicts
  reported to the user.
- **SC-010**: An exported board re-imports with 100% of its columns, cards, labels, checklists,
  and comments intact.
- **SC-011**: Flow metrics (cycle time, throughput) match hand-calculated values from card
  history in test scenarios.

## Assumptions

- Kora is a free, open-sign-up product built as a personal learning project: no billing, plans,
  or usage tiers; scale targets are modest (see SC-007).
- Users have a modern browser (latest two versions of Chrome, Firefox, Safari, Edge) per the
  constitution. Native mobile apps are out of scope; mobile is supported via responsive web.
- A workspace member can belong to many workspaces; a board belongs to exactly one workspace.
- Board-level roles narrow but never broaden workspace roles. Workspace Admins/Owners can see
  and manage all boards in their workspace, including private ones.
- WIP limits warn but do not block (soft limits), matching common Kanban tooling.
- Concurrent edits use "last write wins per field", consistent with the constitution.
- Each board is either Kanban mode or Scrum mode; sprints exist only on Scrum boards. Both modes
  share columns, cards, and backlog.
- Archived items are kept until permanently deleted; deleted accounts' content remains, shown
  as "Deleted user".
- Due-soon reminders default to 24 hours before due date; aging threshold defaults to 7 days.
- Email, browser push, and third-party services (Google, GitHub, GitLab, Slack) are available
  to the system; their outages degrade only the related feature.
- Import from Trello/Jira and public (unauthenticated) board links are out of scope by decision.
- **Governance note**: Per Constitution v1.1.0 Principle V, this phased master spec is the
  approved spec for all phases (P1→P4); delivery proceeds in phase order.
