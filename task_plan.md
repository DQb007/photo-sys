# Task Plan: Prompt Templates Module

## Goal

Implement the administrator-maintained prompt templates module defined in:

`docs/superpowers/specs/2026-05-21-prompt-templates-design.md`

Users should be able to browse active prompt templates, favorite templates, fill `{variable}` placeholders, copy the rendered prompt, and send the rendered prompt to the existing Generate page. Administrators should be able to create, edit, enable, disable, and soft-delete templates.

## Current Phase

Phase 1

## Phases

### Phase 1: Context and Planning

- [x] Confirm final scope: admin-maintained templates only; users can favorite and use templates.
- [x] Write and commit Chinese design spec.
- [x] Replace old root planning files with prompt templates implementation plan.
- [ ] Inspect current backend admin/user route patterns, frontend navigation, and admin page conventions before editing.
- **Status:** in_progress

### Phase 2: Database and Backend Foundation

- [ ] Add prompt template migration.
- [ ] Update base schema.
- [ ] Add prompt template service/module with serializers and variable parser.
- [ ] Add user prompt template routes.
- [ ] Add admin prompt template routes.
- [ ] Mount routes in API server.
- [ ] Add audit logging for admin actions.
- **Status:** pending

### Phase 3: Frontend API and User Prompt Library

- [ ] Add frontend prompt template types and API helpers.
- [ ] Add user Prompt Library page.
- [ ] Implement search, scope/category filtering, cards, favorite/unfavorite, and use modal.
- [ ] Reuse `sessionStorage.reusePrompt` for Generate page handoff.
- [ ] Add user navigation and route.
- **Status:** pending

### Phase 4: Admin Prompt Management UI

- [ ] Add admin Prompt Management page.
- [ ] Implement create/edit form.
- [ ] Implement template list/table with status, variables, usage count, sort order, and actions.
- [ ] Add admin navigation and route.
- **Status:** pending

### Phase 5: Styling, Mobile, and Verification

- [ ] Add CSS using existing panel/card/table/modal/mobile patterns.
- [ ] Run API typecheck.
- [ ] Run web typecheck.
- [ ] Run full build.
- [ ] Run web lint.
- [ ] Run targeted manual or API smoke checks where practical.
- [ ] Commit implementation.
- **Status:** pending

## Key Constraints

1. Users cannot create, submit, or request public prompt templates in this version.
2. Prompt templates must not create generations directly.
3. The Generate page handoff must reuse `sessionStorage.reusePrompt`.
4. Do not modify `generations` or credit behavior.
5. Favorite and unfavorite should be idempotent.
6. Disabled templates are hidden from user lists, including favorites.
7. Existing project has no dedicated test framework; use typecheck/build/lint and targeted smoke checks.

## Decisions

| Decision | Reason |
| --- | --- |
| Admin-maintained templates only | User explicitly removed user submission/request flow. |
| Favorites represent "my prompts" in v1 | Keeps user scope small while still letting users save preferred prompts. |
| Parse variables from `{name}` in prompt text | Avoids variable configuration UI in v1. |
| Reuse `sessionStorage.reusePrompt` | Generate page already supports this path from History reuse. |
| No audit log for user use events | Usage may be frequent; aggregate `usage_count` is enough for v1. |

## Error Log

| Error | Attempt | Resolution |
| --- | --- | --- |
| Git dubious ownership blocked normal add/commit | Design phase | Used per-command `git -c safe.directory=D:/project/ai-code-project/photo-sys ...` without changing global config. |
