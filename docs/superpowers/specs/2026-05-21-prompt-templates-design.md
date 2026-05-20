# Prompt Templates Design

## Goal

Add a prompt template module to Photo Sys so users can browse administrator-maintained prompt templates, favorite templates they like, fill template variables, and use the final prompt for image generation.

The module is a first-class user page, at the same navigation level as Generate and History.

## Confirmed Scope

- Prompt templates are maintained only by administrators.
- Users cannot create, submit, or request public prompt templates in this version.
- Users can browse active templates, search/filter templates, favorite templates, remove favorites, copy a rendered prompt, and send a rendered prompt to the Generate page.
- Prompt variables are inferred from placeholders in the prompt body, such as `{subject}` or `{scene}`.
- No separate variable configuration UI is included in the first version.
- The existing generation flow remains unchanged. Prompt templates only prefill the existing prompt textarea.

## Non-Goals

- User-submitted template review workflows.
- User-created private prompt templates.
- Prompt marketplace, likes, ratings, comments, or public sharing.
- Variable defaults or nested variable syntax.
- Direct image generation from the prompt library page.

## Data Model

### `prompt_templates`

Stores administrator-maintained prompt templates.

Fields:

- `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- `title VARCHAR(160) NOT NULL`
- `description VARCHAR(500) NULL`
- `prompt_text TEXT NOT NULL`
- `category VARCHAR(80) NULL`
- `status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'`
- `sort_order INT NOT NULL DEFAULT 0`
- `usage_count BIGINT UNSIGNED NOT NULL DEFAULT 0`
- `created_by BIGINT UNSIGNED NULL`
- `updated_by BIGINT UNSIGNED NULL`
- `deleted_at TIMESTAMP NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

Indexes:

- `idx_prompt_templates_status_sort (status, sort_order, created_at)`
- `idx_prompt_templates_category (category)`
- `idx_prompt_templates_deleted_at (deleted_at)`
- `idx_prompt_templates_created_by (created_by)`
- `idx_prompt_templates_updated_by (updated_by)`

Foreign keys:

- `created_by -> users.id ON DELETE SET NULL`
- `updated_by -> users.id ON DELETE SET NULL`

### `prompt_template_favorites`

Stores user favorites.

Fields:

- `user_id BIGINT UNSIGNED NOT NULL`
- `template_id BIGINT UNSIGNED NOT NULL`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

Keys:

- Primary or unique key: `(user_id, template_id)`
- Index: `idx_prompt_template_favorites_template_id (template_id)`

Foreign keys:

- `user_id -> users.id ON DELETE CASCADE`
- `template_id -> prompt_templates.id ON DELETE CASCADE`

## Visibility Rules

- Administrators can list active and disabled templates, including templates that normal users cannot see.
- Normal users can only list templates where `status = 'active'` and `deleted_at IS NULL`.
- Favorites persist if an administrator disables a template.
- Disabled templates are hidden from the user library and from the user's favorites view in the first version.
- Deleted templates are soft-deleted from admin lists and hidden from users.

## Variable Parsing

Variables are parsed from `prompt_text` placeholders.

Rules:

- Placeholder format: `{variableName}`.
- Variable names support Chinese characters, ASCII letters, numbers, underscores, and hyphens.
- Whitespace inside braces is trimmed.
- Duplicate variable names produce one input field and replace every matching placeholder.
- All variables are required in the first version.
- Empty variable values block copy and "use in Generate".
- The UI shows a live preview after replacing all placeholders.
- Unsupported patterns, nested placeholders, and default values are treated as plain text or ignored by the parser.

Example:

```text
A cinematic portrait of {subject} in {scene}, high detail, {lighting} lighting.
```

Produces three fields: `subject`, `scene`, and `lighting`.

## User Experience

### Navigation

Add a user navigation item named "Prompt Library" or the localized equivalent. It sits beside Generate, History, and Account Settings.

### Prompt Library Page

The page uses the current Photo Sys layout style:

- Header with page title.
- Search input for title, category, description, and prompt text.
- Filter controls:
  - All templates.
  - My favorites.
  - Category filters.
- Template card grid.
- Mobile layout collapses to a single-column card list and compact filter controls.

Template card content:

- Title.
- Category.
- Description preview.
- Variable count.
- Favorite/unfavorite action.
- Use action.

The user's "own prompts" concept for this version means "my favorited templates".

### Use Template Modal

Clicking "Use" opens a modal:

- Shows template title and description.
- Shows one input per parsed variable.
- Shows a live rendered prompt preview.
- Provides two actions:
  - Copy prompt: copies the rendered prompt and stays on the prompt library page.
  - Use in Generate: stores the rendered prompt in `sessionStorage.reusePrompt` and navigates to `/generate`.

The existing `GeneratePage` already reads `sessionStorage.reusePrompt`, so this feature should reuse that path instead of adding a new generation workflow.

## Admin Experience

Add an admin navigation item named "Prompt Management" or the localized equivalent.

The admin page follows the existing admin page style used by settings and redeem code management:

- Header with title and refresh button.
- Create/edit form.
- Template list or table.
- Active/disabled status controls.

Admin fields:

- Title, required.
- Category, optional.
- Description, optional.
- Prompt body, required.
- Sort order, optional numeric field.
- Status: active or disabled.

Admin list content:

- ID.
- Title.
- Category.
- Status.
- Variable count.
- Usage count.
- Sort order.
- Created/updated timestamps.
- Actions: edit, enable/disable, delete.

Validation:

- Title must be non-empty and no longer than 160 characters.
- Description must be no longer than 500 characters.
- Prompt body must be non-empty and no longer than 8000 characters.
- Sort order must be an integer.

## API Design

### User Routes

`GET /api/prompt-templates`

Query:

- `scope=all|favorites`, default `all`.
- `category`, optional.
- `search`, optional.

Response:

- `items: PromptTemplate[]`
- Each item includes `isFavorite` and `variables`.

Normal users only receive active, non-deleted templates.

`POST /api/prompt-templates/:id/favorite`

Favorites a template. This route is idempotent: favoriting an already-favorited template succeeds.

`DELETE /api/prompt-templates/:id/favorite`

Removes a favorite. This route is idempotent: removing a missing favorite succeeds.

`POST /api/prompt-templates/:id/use`

Increments `usage_count` for an active template and returns the latest serialized template. This does not create a generation.

### Admin Routes

`GET /api/admin/prompt-templates`

Lists all non-deleted templates, including disabled templates.

`POST /api/admin/prompt-templates`

Creates a template.

`PATCH /api/admin/prompt-templates/:id`

Updates title, description, prompt text, category, status, or sort order.

`DELETE /api/admin/prompt-templates/:id`

Soft-deletes a template.

## Auditing

Write audit logs for administrator actions:

- `prompt_templates.created`
- `prompt_templates.updated`
- `prompt_templates.enabled`
- `prompt_templates.disabled`
- `prompt_templates.deleted`

Do not audit every user template use in the first version, because usage can become frequent. Use `usage_count` for aggregate tracking.

## Error Handling

- Unknown template ID returns 404.
- Normal users attempting to use or favorite a disabled template receive 404 or 409.
- Favorite and unfavorite routes are idempotent.
- Invalid admin payloads return validation errors through the existing Express error middleware.
- Soft-deleted templates cannot be updated, used, or favorited.

## Frontend Integration

Update `apps/web/src/api.ts` with prompt template types and API helpers.

Add a user page:

- `apps/web/src/pages/PromptLibraryPage.tsx`

Add an admin page:

- `apps/web/src/pages/AdminPromptTemplatesPage.tsx`

Update shell navigation and routes in `App.tsx`.

Add CSS to `styles.css`, reusing existing card, panel, table, modal, button, field, and mobile patterns where possible.

## Backend Integration

Add migration:

- `apps/api/db/migrations/2026-05-21-prompt-templates.sql`

Update base schema:

- `apps/api/db/schema.sql`

Add backend module:

- `apps/api/src/promptTemplates.ts`

Add routes:

- `apps/api/src/routes/promptTemplates.ts`
- `apps/api/src/routes/adminPromptTemplates.ts`

Mount routes in `server.ts`.

## Verification Plan

Run:

- `npm run typecheck -w apps/api`
- `npm run typecheck -w apps/web`
- `npm run build`
- `npm run lint -w apps/web`

Manual checks:

- Admin can create an active template.
- User can see the active template in Prompt Library.
- User can favorite and unfavorite the template.
- Favorites filter shows only favorited active templates.
- Variable modal requires all variables.
- Rendered preview replaces repeated placeholders consistently.
- Copy prompt copies the rendered prompt.
- Use in Generate navigates to `/generate` and fills the textarea.
- Admin can disable a template and it disappears from user lists.
- Admin can re-enable a template and it appears again.

## Implementation Notes

- Keep prompt template use separate from generation creation.
- Do not modify `generations` or credit behavior.
- Use existing auth middleware and admin middleware patterns.
- Prefer idempotent favorite/unfavorite behavior to avoid user-facing duplicate state errors.
- Keep this version intentionally small so later features such as user-created private templates, popular sorting, or review workflows can be added without changing the user-facing generation path.
