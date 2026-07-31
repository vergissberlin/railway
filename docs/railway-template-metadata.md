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

### Presentation fields

These drive the generated README header banner and the shared cross-repo badge footer. They live here rather than in a hardcoded map inside a script, so adding a template never means editing generator code.

| Field | Description |
| --- | --- |
| `logoFile` | Repo-root logo named **`logo-<slug>.png`** (an `.svg` is equally fine), inlined as base64 into `template-header.svg` by `pnpm templates:headers`. Keep it small — an SVG or a PNG of at most 256px. A 1024px PNG inflates the banner to ~93 KB where a 170px logo lands around 4 KB, and the same file is served as the marketplace `image`. |
| `customIcon` | Optional. Name of a built-in fallback mark drawn when there is no `logoFile` (see `scripts/lib/template-banner.mjs` for the known names). Ignored when `logoFile` resolves. |
| `badge` | Optional object `{ label, color, logo }` for the shields.io badge in the shared README footer. `color` is a 6-digit hex value without a leading `#`; `logo` is a [simple-icons](https://simpleicons.org/) slug. An incomplete badge is an error rather than a silent fallback, because a half-filled badge would quietly drop the repo from the footer. |

JSON Schema: [`railway-template.schema.json`](./railway-template.schema.json) (also referenced via `$schema` in each file).

### Logo files

Every template ships the logo of the software it deploys. It is not an optional nicety: the banner doubles as the Railway marketplace image, and a template that shows initials instead of a recognizable mark looks unfinished next to the rest of the catalogue.

- **Name it `logo-<slug>.png`** at the repository root (`logo-grafana.png`, `logo-uptime-kuma.png`). `.svg` is allowed and produces a far smaller banner. The schema enforces the pattern, and `pnpm templates:headers` warns about a name that deviates or a template that declares neither `logoFile` nor `customIcon`.
- **Source it from the internet** if the repo does not have one yet — the upstream project's own repository or brand page, at most 256px. `.agents/skills/railway-template-anlegen/references/logo-beschaffung.md` documents where to look and what to check before committing.
- **`customIcon` is the fallback**, for software that genuinely has no distributable mark — not a shortcut around the search.

## Badge registry (`railway-templates-registry.json`)

The footer cross-links **every** template repo, but a working copy usually has only one or two submodules checked out. Reading badge data straight from the submodules would therefore make the footer impossible to regenerate without a full `git submodule update --init`.

So [`railway-templates-registry.json`](./railway-templates-registry.json) is a **generated cache**, and behaves like a lockfile:

- `pnpm templates:registry:sync` shows what would change; `:apply` writes it.
- Only entries for submodules that are on disk are refreshed. An absent submodule means *unknown*, never *deleted*.
- `pnpm templates:registry:check` fails when the cache is stale or a submodule has no badge data anywhere. Run it with a recursive submodule checkout so drift cannot sit unnoticed.

Never hand-edit the cache — change the `badge` block in the template repo and re-sync.

## Local development

After cloning the monorepo, initialize submodules so the JSON files exist on disk:

```bash
git submodule update --init --recursive
```

## Creating a new template

`pnpm templates:create` scaffolds a complete `railwayapp-<slug>` repository from a spec, including the header banner and a filled-in `railway-template.json`. It is a dry run unless you pass `--apply`:

```bash
pnpm templates:create -- --spec /tmp/uptime-kuma.json          # review the file list
pnpm templates:create -- --spec /tmp/uptime-kuma.json --apply  # write it
```

Run `pnpm templates:create -- --help` for the full option list. The generated README carries a `REPLACE_WITH_RAILWAY_TEMPLATE_CODE` placeholder in its deploy button — Railway only assigns that code once the template is published, so it has to be pasted back afterwards.

## Related

- [`railway-template-publish.md`](./railway-template-publish.md) — `templatePublish` troubleshooting and CLI usage.
- `.agents/skills/railway-template-anlegen/` — end-to-end skill that drives this whole flow.
