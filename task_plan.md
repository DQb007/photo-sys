# Task Plan: AI Chat Module

## Goal

Implement the AI chat module defined in:

`docs/superpowers/specs/2026-05-21-ai-chat-design.md`

Users and administrators should be able to use an independent general-purpose chat page with streamed AI replies, personal conversation history, selectable admin-configured chat models, and fixed per-message credit charging that can be configured to `0` for free use.

## Current Phase

Complete

## Phases

### Phase 1: Context and Implementation Planning

- [x] Confirm final scope through brainstorming.
- [x] Write and commit Chinese design spec.
- [x] Replace prior root planning files with AI chat implementation plan.
- [x] Inspect current backend settings, encryption, credits, admin routes, and frontend navigation/page conventions before editing.
- **Status:** complete

### Phase 2: Database and Backend Foundation

- [x] Add AI chat migration.
- [x] Update base schema.
- [x] Extend credit transaction type handling for chat debit/refund.
- [x] Add DB row types for chat models, conversations, and messages.
- [x] Add chat settings defaults and service helpers.
- [x] Add model encryption/decryption handling using existing settings encryption patterns.
- **Status:** complete

### Phase 3: Backend Chat and Admin APIs

- [x] Add chat model service/module.
- [x] Add conversation/message service/module.
- [x] Add OpenAI-compatible streaming chat relay.
- [x] Add user chat routes including streamed POST endpoint.
- [x] Add admin chat settings routes.
- [x] Add admin chat model routes.
- [x] Mount routes in API server.
- [x] Add audit logging for admin chat settings/model actions.
- **Status:** complete

### Phase 4: Frontend API and User Chat Page

- [x] Add frontend chat types and API helpers.
- [x] Implement streamed fetch/SSE parser with abort support.
- [x] Add user Chat page with conversation list, message list, model selector, input, streaming state, stop button, rename, and delete.
- [x] Add responsive mobile history drawer behavior.
- [x] Add user/admin navigation and route for `/chat`.
- **Status:** complete

### Phase 5: Admin Chat Management UI

- [x] Add admin chat settings UI.
- [x] Add admin chat model management UI.
- [x] Support create/edit/enable/disable/default/test model workflows.
- [x] Ensure API keys are masked and only updated when provided.
- [x] Add admin navigation/routes.
- **Status:** complete

### Phase 6: Styling, Verification, and Commit

- [x] Add CSS using existing operational admin and app page patterns.
- [x] Run API typecheck.
- [x] Run web typecheck.
- [x] Run full build.
- [x] Run web lint.
- [x] Run targeted smoke checks where practical.
- [x] Commit implementation.
- **Status:** complete

## Key Constraints

1. AI chat is independent from image generation in v1.
2. Do not add prompt-library or generation-page handoff behavior.
3. Global navigation gets only one AI Chat entry; conversation history stays inside the Chat page.
4. Users and admins can only see their own conversations.
5. Admins cannot inspect all user conversations in v1.
6. Chat models are configured separately from image generation settings.
7. Users can switch enabled models per message.
8. Per-message credit cost must be dynamically configurable and may be `0`.
9. Streaming must use POST with auth, so frontend should use `fetch` + `ReadableStream`, not `EventSource`.
10. Preserve existing user changes and avoid unrelated refactors.

## Decisions

| Decision | Reason |
| --- | --- |
| Use an internal conversation list inside `/chat` | Avoids overlap with global nav and existing image generation history. |
| Persist conversations and messages | General chat is weak without history. |
| Stream replies through SSE-style events over fetch | Supports POST body and Authorization header. |
| Model applies per message, not per conversation | Lets users switch models within an ongoing conversation while retaining accurate snapshots. |
| Store model snapshots on messages | Historical replies should remain understandable if admins rename or disable models. |
| Fixed per-user-message credit cost | User requested configurable fixed cost, with `0` meaning free. |
| Refund on failed, interrupted, or stopped generation | Keeps first-version billing user-friendly and simple. |
| Admin model management is in v1 | User confirmed multiple chat models and user-side switching are required. |

## Error Log

| Error | Attempt | Resolution |
| --- | --- | --- |
| Visual companion server could not start via Bash/WSL or Node process setup | Brainstorming | Continued text-first; visual mockups can be static HTML if needed. |
| Git dubious ownership blocked `git status` during spec review | Spec self-review | Added this repository to Git safe.directory in the current environment. |
