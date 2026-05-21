# Findings: AI Chat Module

## Approved Scope

- First version is a general-purpose chat assistant.
- Replies must stream.
- Chat uses separate model configuration from image generation.
- Admins can manage multiple chat models.
- Users can switch enabled chat models before sending each message.
- Chat is independent from image generation, prompt templates, and generation history.
- Conversations and messages are persisted.
- Users can create, continue, rename, and delete conversations.
- Regular users and admins can use chat, but only see their own history.
- Chat costs a configurable fixed number of credits per user message.
- A cost of `0` means chat is free.

## Current Code Findings

- Root `package.json` uses workspaces `apps/api` and `apps/web`.
- API is Express with route modules under `apps/api/src/routes`.
- Auth middleware provides `requireUser`, `requireActiveUser`, and `requireAdmin`.
- Frontend routing and navigation live in `apps/web/src/App.tsx`.
- Frontend API helpers and shared types live in `apps/web/src/api.ts`.
- Existing credit logic lives in `apps/api/src/credits.ts`.
- Existing global settings logic lives in `apps/api/src/settingsService.ts`.
- Existing encrypted settings helper is in `apps/api/src/cryptoSettings.ts`.
- Existing relay image generation uses `config.OPENAI_BASE_URL`, `config.OPENAI_API_KEY`, and `fetch` in `apps/api/src/relay.ts`; chat should not reuse those env vars directly.
- `settingsService.ts` validates the full settings object with zod and redacts secrets for non-secret reads; adding chat settings requires updating defaults, schema, definitions, patch type, flattening, and frontend `AppSettings`.
- `credits.ts` already has transactional helpers that can be reused for chat debit/refund if `CreditTransactionType` and DB enum are extended.
- Admin feature routes use separate modules mounted under `/api/admin`, with `requireUser, requireAdmin` at router level and audit logging per operation.
- API key encryption for chat models can directly reuse `encryptSettingSecret` and `decryptSettingSecret`; list responses should expose only a boolean or masked state.
- Existing UI source text can appear as mojibake in PowerShell output, but builds have succeeded. Preserve file encoding and avoid unnecessary text churn.

## Design Reference

- Chinese design spec committed at `docs/superpowers/specs/2026-05-21-ai-chat-design.md`.
- Latest design commit: `53b0cb8 Add AI chat module design`.

## Risks

- Streaming over fetch requires careful SSE framing and parsing on both backend and frontend.
- Request abort handling may not reliably complete all cleanup if the HTTP connection closes abruptly.
- Credit refund must be idempotent enough to avoid double refunds.
- Extending MySQL enum `credit_transactions.type` must preserve existing values.
- Model API keys need secure storage and masked admin display.
- Admin default model changes should avoid leaving the system with no selectable model unless chat is disabled.
- Large assistant replies should not be written to the database on every token; accumulate and write final state.
