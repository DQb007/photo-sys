# Findings: Generation Pending Cancellation

## Approved Scope

- User wants a way to cancel image generation before the third-party request is sent.
- Only `pending` tasks can safely be cancelled in the first version.
- `processing` tasks should not be force-cancelled because the third-party request may already have been sent.

## Current Code Findings

- Generation statuses are currently `pending`, `processing`, `succeeded`, and `failed`.
- `POST /api/generations` creates a pending DB row, debits credits, then pushes `{ generationId }` to Redis list `photo-sys:image-generations`.
- Worker uses `BLPOP` and calls `processGeneration(generationId)`.
- `processGeneration()` immediately updates the row to `processing`, then calls `generateImages()`.
- Existing failure refund uses `generations.credit_refunded_at` as idempotency guard.
- Frontend generate page already persists active generation id in `sessionStorage` and polls while status is pending/processing.
- History page filters only existing statuses and retries only `failed`.

## Implementation Notes

- Add migration to modify `generations.status` enum and `credit_transactions.type`.
- Add `generation_cancel_refund` credit transaction type to distinguish user cancellation refund from system failure refund.
- Add `removeGenerationFromQueue(generationId)` helper using Redis list inspection/removal.
- Add `isGenerationPending(generationId)` or direct DB status check in worker before external request.
- Add `POST /api/generations/:id/cancel`.
- In cancellation API, lock generation row, require owner/admin access and `status = pending`, update status to `cancelled`, set completed/duration/message, remove queue item, refund credits in same transaction where possible.

## Risks

- Race: worker may pop the job between status check and queue removal. DB status update to `cancelled` plus worker preflight prevents request if worker has not started processing yet.
- Race: if worker has already set status to `processing`, cancellation must fail with conflict.
