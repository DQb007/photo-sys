# Findings: Redeem Code Credits Module

## Approved Scope

- Photo Sys generates redeem codes internally.
- Admins dynamically configure credit packages.
- Admins generate redeem-code batches from a package.
- Generated codes use the package name/credits snapshot from generation time.
- Optional batch expiry is supported. Empty expiry means long-term valid.
- Each code is one-time use.
- Regular users redeem codes in the account settings area.
- Successful redeem adds credits and writes credit transaction history.

## Design Document

- Spec: `docs/superpowers/specs/2026-05-21-redeem-codes-design.md`
- Spec commit: `91b151e Add redeem codes design`

## Current Project Structure

- Backend: `apps/api`, Express, MySQL, Redis, zod, TypeScript.
- Frontend: `apps/web`, Vite, React, React Router, lucide-react.
- Current credits service: `apps/api/src/credits.ts`.
- Current admin routes: `apps/api/src/routes/admin.ts`.
- Current user credits routes: `apps/api/src/routes/credits.ts`.
- Server route mounting: `apps/api/src/server.ts`.
- Frontend API layer: `apps/web/src/api.ts`.
- User settings page: `apps/web/src/pages/SettingsPage.tsx`.
- App routes/sidebar: `apps/web/src/App.tsx`.

## Implementation Notes To Validate

- Existing `credit_transactions.type` is likely an enum and must be extended safely.
- Need to inspect current `addCredits`/`debitCredits` helpers before deciding whether redeem service calls them or inserts credit transactions itself inside one wider transaction.
- Need to inspect existing admin route file size. If it is large, prefer a separate admin redeem route module and mount it under `/api/admin`.
- Need to inspect frontend admin navigation pattern before adding the new page.

## Risks

- Batch generation inserts up to 1000 codes; transaction should remain acceptable for first version.
- Copy-all plaintext codes are only available immediately after creation. UI must make that clear without storing plaintext.
- Redemption error messages for normal users should be useful but not leak excessive code-state details beyond the approved UX.
