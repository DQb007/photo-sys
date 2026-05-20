# Task Plan: Redeem Code Credits Module

## Goal

Implement the approved redeem-code credits feature from `docs/superpowers/specs/2026-05-21-redeem-codes-design.md`.

Admins can manage credit packages, generate one-time redeem codes in batches, inspect batches/codes, and disable unused codes. Regular users can redeem a code to add credits. Successful redemptions must update the user credit balance, write `credit_transactions`, and record audit logs where appropriate.

## Current Phase

Phase 7

## Phases

### Phase 1: Context and Plan Setup

- [x] User approved the written redeem-code design.
- [x] Restore existing project context and git state.
- [x] Replace previous credits-module plan files with redeem-code implementation plan.
- [x] Re-read relevant backend/frontend code before editing.
- **Status:** complete

### Phase 2: Database and Backend Types

- [x] Add migration for `redeem_packages`, `redeem_code_batches`, `redeem_codes`, and `credit_transactions.type`.
- [x] Update full schema.
- [x] Extend backend DB row types.
- [x] Confirm migration is compatible with existing credits schema.
- **Status:** complete

### Phase 3: Backend Services and User APIs

- [x] Add redeem-code service for code normalization, hashing, generation, and redemption transaction.
- [x] Add user route `POST /api/redeem-codes/redeem`.
- [x] Mount user route in server.
- [x] Reuse existing credit transaction logic where possible.
- **Status:** complete

### Phase 4: Admin APIs

- [x] Add package list/create/update APIs.
- [x] Add batch generation and batch list/detail APIs.
- [x] Add batch code list API without plaintext codes.
- [x] Add active unused code disable API.
- [x] Add audit logs for batch creation, redemption, and disable operations.
- **Status:** complete

### Phase 5: Frontend API and User UI

- [x] Extend `apps/web/src/api.ts` types and API functions.
- [x] Add redeem-code input to the account settings page.
- [x] Refresh credit balance and transactions after successful redeem.
- [x] Show clear errors for invalid/used/expired/disabled codes.
- **Status:** complete

### Phase 6: Admin UI

- [x] Add route and sidebar/nav entry for redeem-code management.
- [x] Build package management controls.
- [x] Build batch generation form with optional expiry and note.
- [x] Show generated plaintext codes immediately with copy-all support.
- [x] Show batch list and codes/status details.
- **Status:** complete

### Phase 7: Verification and Commit

- [x] Run API typecheck.
- [x] Run web typecheck.
- [x] Run full build.
- [x] Run lint if practical.
- [x] Verify key API paths with scripts or documented manual checks.
- [x] Commit implementation.
- **Status:** complete

## Key Constraints

1. Store only code hashes in the database. Plaintext codes may appear only in the batch generation response.
2. Redemption must be transactional and lock the redeem code/user rows to prevent duplicate redemption.
3. Existing credit balance modifications should remain centralized in the credits service where practical.
4. Existing project has no dedicated test framework; use typecheck/build and targeted API verification.
5. Use `git -c safe.directory=D:/project/ai-code-project/photo-sys ...` for git commands in this repo.

## Decisions

| Decision | Reason |
| --- | --- |
| Package + batch + code model | Supports dynamic sellable packages and batch tracking. |
| Code format `PS-XXXX-XXXX-XXXX` | Human-readable and suitable for third-party sales. |
| SHA-256 hash storage | Avoids persisting usable plaintext codes. |
| Snapshot credits at batch generation | Later package edits do not alter already sold/generated codes. |
| First version has no payment/order integration | User confirmed codes are generated internally and sold externally. |

## Error Log

| Error | Attempt | Resolution |
| --- | --- | --- |
| Existing plan files are mojibake in PowerShell | 1 | Replaced active planning files with ASCII redeem-code plan. |
| PowerShell default output displayed UTF-8 Chinese as mojibake | 1 | Re-read key files with `Get-Content -Encoding UTF8`; file contents were valid. |
