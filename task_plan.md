# Task Plan: Generation Pending Cancellation

## Goal

Implement pending-only generation cancellation.

When a generation is still `pending`, the user can cancel it. A successful cancellation removes the job from Redis before it reaches the worker, marks the generation as `cancelled`, refunds the deducted credits, and prevents any third-party image request. Once a generation is `processing`, the first version does not allow cancellation.

## Current Phase

Phase 4

## Phases

### Phase 1: Context and Data Model

- [x] Confirm scope: only `pending` can be cancelled.
- [x] Inspect generation route, worker, Redis queue, serializer, and frontend generation/history pages.
- [x] Replace previous plan with cancellation implementation plan.
- [x] Add `cancelled` generation status to migrations, schema, and types.
- **Status:** complete

### Phase 2: Queue and Backend Cancellation

- [x] Add Redis queue removal helper.
- [x] Add worker preflight check so non-pending jobs are skipped before third-party request.
- [x] Add credit refund helper for cancellation.
- [x] Add `POST /api/generations/:id/cancel` API.
- [x] Audit successful cancellations.
- **Status:** complete

### Phase 3: Frontend User Flow

- [x] Extend frontend `GenerationStatus`.
- [x] Add `cancelGeneration` API helper.
- [x] Add cancel button on generate page for pending jobs only.
- [x] Refresh credit balance after cancellation.
- [x] Include cancelled status in history filters and labels.
- **Status:** complete

### Phase 4: Verification and Commit

- [x] Run API typecheck.
- [x] Run web typecheck.
- [x] Run full build.
- [x] Run lint if practical.
- [x] Run API smoke check for pending cancellation if practical.
- [x] Commit implementation.
- **Status:** complete

## Key Constraints

1. Cancellation must not claim to stop jobs already in `processing`.
2. Cancellation success means third-party request has not been sent.
3. Worker must check DB status before calling `generateImages`.
4. Cancellation must refund generation credits exactly once.
5. Existing project has no dedicated test framework; use typecheck/build and targeted API verification.

## Decisions

| Decision | Reason |
| --- | --- |
| Add `cancelled` status | Keeps user cancellation distinct from system failure. |
| Allow cancellation only from `pending` | This is the only phase where we can guarantee no third-party request. |
| Refund through credit transaction service | Keeps credit ledger consistent. |
| Remove matching Redis queue payloads | Prevents queued jobs from reaching worker after cancellation. |
| Worker preflight checks status | Handles races where queue removal misses a job already popped or duplicated. |

## Error Log

| Error | Attempt | Resolution |
| --- | --- | --- |
| Existing plan files are mojibake in PowerShell | 1 | Replaced active planning files with ASCII redeem-code plan. |
| PowerShell default output displayed UTF-8 Chinese as mojibake | 1 | Re-read key files with `Get-Content -Encoding UTF8`; file contents were valid. |
