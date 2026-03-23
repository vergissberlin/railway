# Railway template draft publishing (`templatePublish`)

This repo includes `scripts/publish-railway-template-drafts.mjs`, which calls Railway’s GraphQL mutation `templatePublish` to publish **workspace template drafts** (the same action as **Publish** in the workspace templates UI).

## CLI

```bash
pnpm templates:publish                 # dry-run (no API mutations)
pnpm templates:publish:apply           # run templatePublish for each matched draft
pnpm run templates:publish -- --apply  # same as :apply (standalone `--` is ignored by the script)
pnpm run templates:publish -- --verbose # verbose errors (combine with --apply as needed)
```

## API constraints (observed)

| Field | Notes |
| --- | --- |
| `description` | Must be **25–75** characters (after trim). Shorter strings return a validation error from the API. |
| `readme` | Required; use the submodule `README.md` content when possible. |
| `category` | Required string; the script defaults to the category of the published `apache-airflow` template in the same workspace, or `developer-tools`. |
| `workspaceId` | Include the workspace id in `TemplatePublishInput` when publishing; omitting it can surface misleading error messages. |

## When publish fails in the UI **and** via API

Symptoms:

- Dashboard: **Publish** on `https://railway.com/workspace/templates` does nothing or errors.
- API: `Problem processing request` with a `traceId`, or `You have been blocked from publishing templates`.

What we verified:

- The GraphQL schema marks `workspaceId` on `TemplatePublishInput` as optional, but requests **without** `workspaceId` may return the “blocked” message even when the account is not blocked.
- Requests **with** the correct `workspaceId` can still fail with the generic `Problem processing request` — that usually indicates a **server-side** rejection or internal error, not a bug in this repository’s script.

### What to do

1. Copy the **`traceId`** from the error (use `--verbose` or inspect the Network tab on the dashboard).
2. Contact **Railway support** (Discord or ticket) and include: workspace id, template id / code, approximate time, and `traceId`.
3. Confirm you are using a token/session that can manage the workspace: set `RAILWAY_TOKEN` in a **`.env`** file at the repo root (loaded automatically by the scripts), export it in the shell, or use `railway login` (`~/.railway/config.json`). See `.env.example`.

## Related scripts

- `railwayapp-*/railway-template.json` — per-template metadata (display title, image, description, published slug); see [railway-template-metadata.md](./railway-template-metadata.md).
- `scripts/railway-template-targets.mjs` — loads those JSON files and exports `RAILWAY_TEMPLATE_TARGETS` (`workspaceAutomation: true`).
- `scripts/sync-railway-template-drafts.mjs` — regenerate drafts from projects (`templateGenerate`).
- `scripts/apply-railway-template-display-names.mjs` — rename Railway projects to the display title and recreate each template so the marketplace name matches (not the `railwayapp-*` repo prefix).
- `scripts/verify-railway-template-drafts.mjs` — CI checks for draft/repo/code consistency.
