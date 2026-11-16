# Quickstart & Validation Guide: Kora

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

This guide covers how to run Kora locally and how to check that each phase works end to end.
For API shapes see [contracts/](./contracts/), and for entities see [data-model.md](./data-model.md).

## Prerequisites

- Node.js 22 LTS, with pnpm 10 enabled through `corepack enable`
- Docker and Docker Compose v2
- A Cloudflare R2 bucket and an S3 API token. For local development you can point the S3
  settings at an optional MinIO container instead.
- A Resend API key. Without one, local development logs emails to the console.
- Google and GitHub OAuth apps with these callback URLs:
  - `http://localhost:5173/api/v1/auth/oauth/google/callback`
  - `http://localhost:5173/api/v1/auth/oauth/github/callback`
- VAPID keys for browser push: `pnpm --filter api exec web-push generate-vapid-keys`

## Setup

```bash
pnpm install
cp .env.example .env                 # fill in DB, Redis, R2, Resend, OAuth, VAPID, ENCRYPTION_KEY
docker compose -f infra/docker-compose.dev.yml up -d postgres redis
pnpm --filter api prisma migrate dev
pnpm --filter api db:seed            # demo user demo@kora.local / demo-password-123, sample board
pnpm dev                             # Turborepo: web on :5173 (proxies /api and /rt to :3000), api on :3000, worker
```

Open http://localhost:5173.

## Automated checks

```bash
pnpm lint && pnpm typecheck
pnpm test                            # Vitest unit + integration (Testcontainers starts Postgres/Redis)
pnpm --filter web exec playwright install --with-deps   # once
pnpm e2e                             # Playwright end-to-end, incl. two-browser real-time specs
pnpm i18n:check                      # every UI string has a translation in all 6 languages
```

**Expected result:** everything passes. Constitution IV requires the auth/permission,
card-move and real-time suites to pass before any merge.

## Manual validation by phase

Each scenario maps to an acceptance scenario in the spec.

### P1 — MVP

1. **Sign-up and sign-in (US1):**
   - Register with email and password.
   - Open the verification link from the console or email.
   - Sign out, then sign in with GitHub using the same verified email.
   - ✅ No duplicate account is created, and the settings page shows both sign-in methods.
2. **Throttling (US1-5):** enter a wrong password 11 times.
   - ✅ The 11th attempt returns "Too many attempts".
3. **Workspace roles (US2):**
   - Create a workspace and invite a second user (in a separate browser profile) as Viewer.
   - ✅ The Viewer sees no "Add card" controls.
   - ✅ Calling `POST /columns/:id/cards` as the Viewer returns `403`.
   - ✅ A user outside the workspace gets `404` for the board.
4. **Board basics (US3):**
   - Create a board with default columns and add 5 cards.
   - Drag a card from To Do to In Progress, then reload.
   - ✅ The card position is preserved.
   - Move a card using only the keyboard: Tab to the card, press Space, use the arrow keys,
     press Space.
5. **Card details (US4):**
   - Set a past due date. ✅ The card shows an overdue badge.
   - Check 3 of 5 checklist items. ✅ The card shows 3/5.
   - Attach an 11 MB file. ✅ It's rejected.
   - Mention `@user2` in a comment. ✅ user2 gets a notification.
   - Open the activity tab. ✅ Every change above is listed.
6. **Real-time (US5):**
   - Open the same board as user1 and user2 side by side.
   - Move a card as user1. ✅ user2 sees it within 2 s.
   - Turn off user2's network for 30 s while user1 makes changes, then reconnect.
     ✅ user2 catches up without reloading.
7. **Notifications (US6):**
   - Allow browser push for user2, then assign user2 to a card.
   - ✅ An in-app notification appears, the email arrives (or is logged), and a push notification
     shows.
   - Switch email to "Daily digest". ✅ No instant email is sent.

### P2 — v1

8. **WIP limits (US7):** set a WIP limit of 3 and move a 4th card into the column.
   - ✅ The column is highlighted as over the limit, and the move still succeeds.
9. **Swimlanes:** switch swimlanes to "By assignee" and reassign a card.
   - ✅ The card moves to the new lane.
10. **Blocked:** flag a card as blocked and give a reason.
    - ✅ The blocked indicator and the reason are visible.
11. **Search and views (US8):**
    - Search for a word that only appears in a comment. ✅ The card is found.
    - Save the filter "My high priority".
    - In the Calendar view, drag a card to another day. ✅ Its due date changes.

### P3 — v2

12. **Time tracking (US9):**
    - Start a timer on card A, then start one on card B. ✅ Card A's timer stops.
    - Finish a Pomodoro session. ✅ The time is logged to the card.
13. **Reports (US10):** run `pnpm --filter api db:seed:history`, which seeds card movements
    with known dates.
    - ✅ The cycle time and throughput reports match the expected values printed by the seed
      script (SC-011).

### P4 — Later

14. **Structure and sprints (US11, US12):**
    - Create an Epic with 2 Stories.
    - Add a workflow rule that forbids To Do → Done, then try that move. ✅ It's rejected with
      an explanation.
    - Switch the board to Scrum mode, start a sprint, and complete it with unfinished cards.
      ✅ You're asked where to move them.
15. **Automation (US13):** create the rule "When moved to Done → add label Shipped" and move a card.
    - ✅ The label is added and the rule's run log shows SUCCESS.
16. **API and webhooks (US14):**
    - Create a personal access token and run
      `curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/v1/workspaces`. ✅ It returns 200.
    - Register a webhook pointing at a request-bin URL and create a card.
      ✅ A signed `card.created` request arrives.
17. **Integrations:** connect Slack to a test workspace and move a card to Done.
    - ✅ A message is posted to the channel.
    - Push a commit with the message "KORA-1 fix". ✅ Card #1 shows the commit.
18. **Export and import (US15):** export a board as a Kora file and import it into another
    workspace.
    - ✅ Columns, cards, labels, checklists and comments all match (SC-010).
19. **Offline and platform (US16):**
    - Open a board, set DevTools to Offline, and move 3 cards. ✅ A "pending sync" badge appears.
    - Go back online. ✅ The badge clears within 10 s and user2 sees the moves.
    - Switch the language to Tiếng Việt and the theme to Dark. ✅ The whole UI updates.

## Performance check (SC-003, SC-006)

```bash
pnpm --filter api db:seed:large      # board with 500 cards, workspace with 10k cards
```

- ✅ The 500-card board loads in under 3 s (check the Performance panel), and dragging stays
  smooth.
- ✅ Search returns in under 1 s.
