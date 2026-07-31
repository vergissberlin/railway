# AGENTS.md

## Purpose

This file defines project conventions for coding agents working in this repository.

## Scope

These rules apply to the whole workspace unless a deeper `AGENTS.md` in a subdirectory defines more specific rules for that scope.

Former tool-specific configuration (Cursor rules under `.cursor/rules` / `.agents/rules`) has been merged into this file below and removed. Claude Code skills remain available under `.agents/skills/`.

## Repository Scope Rule

- Apply repository-level instructions only to Railway templates that are listed as submodules in `.gitmodules`.
- Treat those listed `railwayapp-*` submodules as the single source of truth for in-scope template operations.
- Ignore non-listed repositories/templates unless explicitly requested by the user.

## Core Conventions

- Use `pnpm` as the default package manager.
- Store credentials and local secrets in `.env` files (never hardcode secrets).
- Use Conventional Commits in English (for example: `feat:`, `fix:`, `docs:`, `chore:`).
- Write documentation in English.
- When adding new props, always update:
  - the related Type definitions
  - the corresponding documentation

## Railway Template Workflow

- Maintain **`railway-template.json`** at the root of each in-scope template repo (metadata for display name, image, `templatePublish` description, published slug). See `docs/railway-template-metadata.md` in the root monorepo.
- Keep each `railwayapp-*` template deployable as a standalone project.
- Validate `railway.toml` changes carefully, especially:
  - `startCommand`
  - `healthcheckPath`
  - `healthcheckTimeout`
- Prefer explicit, reproducible Docker entrypoints for runtime boot logic.

## Quality Checks

- Run relevant checks/tests after changes when available.
- Keep changes minimal and focused on the requested task.
- Do not introduce breaking changes without documenting migration steps.

## Railway Template Metadata (`railway-template.json`)

Applies to: `railwayapp-**/railway-template.json`

### Source of truth

- Each in-scope template repo (`railwayapp-*` submodule) owns **one** `railway-template.json` at its **repository root**.
- Do **not** duplicate the same fields as a hardcoded list in `scripts/railway-template-targets.mjs` — that file **loads** these JSON files. Update the JSON instead.

### Required shape (`schemaVersion: 1`)

| Field | Rules |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `project` | Usually `railwayapp-*`; may be omitted if it matches the folder name. |
| `repo` | `owner/name` on GitHub. |
| `displayName` | Software title only (e.g. **Home Assistant**), no `railwayapp-` prefix. |
| `publishedCode` | Expected public slug after publish (marketplace URL segment). |
| `image` | HTTPS URL (SVG preferred). |
| `description` | **25–75 characters** after trim — Railway `templatePublish` rejects anything else. |
| `workspaceAutomation` | `true` only for templates included in root automation (`templates:publish`, `templates:verify`, `templates:display-names`, `templates:sync`). |

### Optional

- `$schema` may point to `docs/railway-template.schema.json` in the monorepo (see `docs/railway-template-metadata.md`).

### Optional presentation fields

| Field | Rules |
| --- | --- |
| `logoFile` | Repo-relative `.svg`/`.png` inlined into `template-header.svg`. Keep it to an SVG or a PNG of at most 256px — the banner is also the marketplace image. |
| `customIcon` | Built-in fallback mark used only when there is no `logoFile`. Valid names live in `scripts/lib/template-banner.mjs`. |
| `badge` | `{ label, color, logo }` for the shared footer. `color` is 6 hex digits without `#`, `logo` is a simple-icons slug. |

- These replace the former hardcoded maps in `scripts/generate-template-headers.mjs` and `scripts/update-template-footers.mjs`. Do **not** reintroduce a per-template list in either script.
- `docs/railway-templates-registry.json` is a **generated cache** of the badge data, needed because the footer spans all templates while a checkout usually has only a few. Never hand-edit it: change `badge` here, then run `pnpm templates:registry:sync:apply`.

### When editing

- After changing metadata, run `pnpm test` (root) if loader logic or validation changed.
- If you add a **new** submodule template, add `railway-template.json` before relying on automation. `pnpm templates:create` writes it for you.
- After changing `badge`, run `pnpm templates:registry:sync:apply` and commit the regenerated cache and `footer.md`.

## Release Please for Template Submodules

Applies to: `railwayapp-*/**`

All template repositories (`railwayapp-*` git submodules) must use `release-please` for automated releases.

### Required Files Per Submodule

- `.github/workflows/release-please.yml`
- `release-please-config.json`
- `.release-please-manifest.json`

### Workflow Standard

- Use the official action: `googleapis/release-please-action`
- Trigger on `push` to `main`
- Use `release-type: simple`
- Use `include-component-in-tag: true`
- Use `skip-github-pull-request: false` and `skip-github-release: false`

### Config and Manifest Rules

- Keep one package path: `"."`
- Keep package name aligned with repo name (for example `railwayapp-mjml`)
- Start manifest version at `0.1.0` unless submodule already has releases

### Commit and PR Rules

- Commits must follow Conventional Commits in English (`feat:`, `fix:`, `docs:`, `chore:`)
- Do not use manual version bumps in source files; release-please owns version/tag progression
- Do not create manual GitHub releases when release-please is active

### Example

```yaml
on:
  push:
    branches: [main]
jobs:
  release-please:
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: simple
          include-component-in-tag: true
```

## Script CLI Utils Standard

Applies to: `scripts/**/*.mjs`

When creating or updating files in `scripts/`, always use shared helpers from `scripts/misc-cli-utils.mjs` for user-facing output.

### Required

- Import and use `info`, `warn`, `error`, `success`, `progress`, and `summaryBox` where relevant.
- Keep output consistent with existing script style (status labels, summary, and clear error reporting).
- Prefer shared helper functions over direct `console.log` for operational messages.

### Allowed

- `console.log` is acceptable for help text blocks and raw machine-readable output only.

### Example

```javascript
import { info, error, success } from "./misc-cli-utils.mjs";

info("Starting template sync");
try {
  // run logic
  success("Template sync completed");
} catch (err) {
  error(err.message);
  process.exit(1);
}
```

## Script Test Coverage Minimum

For any change in script logic, maintain at least 90% automated test coverage for the affected script module(s).

### Required

- Add or update tests whenever script behavior changes.
- Cover happy path, error path, and argument parsing where relevant.
- Keep coverage at or above 90% for touched script modules before finalizing changes.
- If coverage drops, add targeted tests in the same change.

### Verification

- Run the project test command and verify coverage requirements are met.
- If exact coverage tooling is unavailable, add explicit tests for all changed branches and note the limitation.

### Example

```javascript
// For changed CLI argument parsing:
// - tests valid args
// - tests unknown args
// - tests default values
// - tests forwarded "--" args
```
