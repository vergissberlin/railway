# Per-repository Railway template metadata (`railway-template.json`)

Each template submodule stores **`railway-template.json`** at its repository root. The root repo loads these files via `scripts/railway-template-targets.mjs` (no duplicated lists in code).

## Fields

| Field | Description |
| --- | --- |
| `schemaVersion` | Must be `1` for the current format. |
| `project` | Railway project folder name (usually `railwayapp-*`). Defaults to the parent directory name if omitted. |
| `railwayProjectName` | Optional. Exact name of the project in the Railway workspace when it differs from `project`. If omitted, automation scripts also try matching `project`, then `displayName` (exact and case-insensitive). |
| `repo` | GitHub repository as `owner/name`. |
| `displayName` | Public template title (software name only, e.g. **Home Assistant**). |
| `publishedCode` | Expected slug after `templatePublish` (Railway marketplace URL segment). |
| `image` | HTTPS URL to the template image (SVG recommended). |
| `description` | **25–75 characters** (trimmed). Railway’s `templatePublish` rejects shorter/longer text. |
| `workspaceAutomation` | If `true`, the root scripts `templates:publish`, `templates:verify`, `templates:display-names`, and `templates:sync` include this template. Others stay documented but are not driven by the current workspace automation. |

JSON Schema: [`railway-template.schema.json`](./railway-template.schema.json) (also referenced via `$schema` in each file).

## Local development

After cloning the monorepo, initialize submodules so the JSON files exist on disk:

```bash
git submodule update --init --recursive
```

## Related

- [`railway-template-publish.md`](./railway-template-publish.md) — `templatePublish` troubleshooting and CLI usage.
