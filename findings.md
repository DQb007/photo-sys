# Findings: Prompt Templates Module

## Approved Scope

- Prompt templates are maintained only by administrators.
- Users only browse active templates, favorite/unfavorite templates, copy rendered prompts, and send rendered prompts to Generate.
- Users do not create private templates and do not submit templates for approval in v1.
- Template variables are inferred from placeholders such as `{主体}` or `{scene}`.
- All variables are required in v1.
- "My prompts" means favorited templates.

## Current Code Findings

- Root `package.json` has workspaces `apps/api` and `apps/web`.
- API uses Express, route modules under `apps/api/src/routes`, auth middleware `requireUser`, `requireActiveUser`, and `requireAdmin`.
- Admin routes are mounted under `/api/admin`; existing redeem-code admin routes provide a useful CRUD-style pattern.
- User generation handoff already exists: `GeneratePage` reads `sessionStorage.reusePrompt` and fills the prompt textarea.
- Frontend routing and navigation live in `apps/web/src/App.tsx`.
- Frontend API helpers and shared types live in `apps/web/src/api.ts`.
- Existing CSS has reusable page, panel, table, modal, button, field, card, and mobile patterns in `apps/web/src/styles.css`.
- Current UI source text appears as mojibake when read in PowerShell, but the app has been building successfully; preserve existing encoding/style and avoid unnecessary text churn.

## Design Reference

- Chinese design spec committed at `docs/superpowers/specs/2026-05-21-prompt-templates-design.md`.
- Latest design commit: `5de358e Translate prompt templates design`.

## Risks

- UI text encoding display in PowerShell can be misleading; validate with typecheck/build rather than relying on terminal rendering.
- The admin route namespace already has several modules. Mount order should avoid route conflicts.
- Variable parsing should be shared or duplicated carefully between frontend and backend. Backend serialization should expose variables; frontend still needs rendering/replacement logic for the modal.
- MySQL migration enum/status names must match TypeScript union types.
