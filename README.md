# Railway Templates Monorepo (Submodule Meta Repo)

![Railway Templates Banner](./header-banner.png)

This repository is the root meta repository for the `vergissberlin` Railway templates.
Each `railwayapp-*` folder is an independent Git repository included here as a Git submodule.

## Why this repo exists

- Keep all Railway templates visible in one place
- Manage shared maintenance tasks across templates
- Track template repository pointers in a single root commit history

## Included template submodules

- `railwayapp-airbyte`
- `railwayapp-airflow`
- `railwayapp-codimd`
- `railwayapp-django`
- `railwayapp-email`
- `railwayapp-fastapi`
- `railwayapp-flask`
- `railwayapp-flowise`
- `railwayapp-gitlab`
- `railwayapp-grafana`
- `railwayapp-homeassistant`
- `railwayapp-influxdb`
- `railwayapp-mjml`
- `railwayapp-mongodb`
- `railwayapp-mqtt`
- `railwayapp-mysql`
- `railwayapp-n8n`
- `railwayapp-nodered`
- `railwayapp-nodejs`
- `railwayapp-opensearch`
- `railwayapp-postgresql`
- `railwayapp-redis`
- `railwayapp-typo3`

## Clone and initialize

Clone with submodules in one step:

```bash
git clone --recurse-submodules git@github.com:vergissberlin/railway.git
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Working with submodules

Enter a template repository, make changes, commit, and push in that submodule:

```bash
cd railwayapp-airflow
git checkout -b feat/example-change
# edit files
git add .
git commit -m "feat: add example change"
git push -u origin HEAD
```

Then return to root and commit the updated submodule pointer:

```bash
cd ..
git add railwayapp-airflow
git commit -m "chore: update railwayapp-airflow submodule pointer"
git push
```

## Updating all submodules to their latest remote state

```bash
git submodule update --remote --recursive
git add .
git commit -m "chore: update submodules"
git push
```

## Agent scope rule

Repository-level automation and instructions must only target Railway templates listed in `.gitmodules`.
If a repository is not listed there, it is considered out of scope unless explicitly requested.

## Adding a new template

`pnpm templates:create` scaffolds a complete `railwayapp-<slug>` repository — Dockerfile, `railway.toml`, `railway-template.json`, the generated header banner, release-please and renovate config. It is a dry run unless you pass `--apply`:

```bash
pnpm templates:create -- --help                                # all options
pnpm templates:create -- --spec /tmp/uptime-kuma.json          # review the file list
pnpm templates:create -- --spec /tmp/uptime-kuma.json --apply  # write it
```

After the repo exists and is registered as a submodule, refresh the generated presentation files:

```bash
pnpm templates:headers -- --only railwayapp-<slug>   # regenerate template-header.svg
pnpm templates:registry:sync:apply                   # cache the badge in docs/railway-templates-registry.json
pnpm templates:footers                               # regenerate footer.md and the README footers
pnpm templates:registry:check                        # CI guard: fails on a stale or incomplete cache
```

Banner titles, logos and footer badges come from each repo's `railway-template.json` — there is no hardcoded per-template list in the scripts. See **[docs/railway-template-metadata.md](./docs/railway-template-metadata.md)**.

The whole flow, including publishing, is driven end to end by the **`railway-template-anlegen`** skill in [`.agents/skills/`](./.agents/).

## Publishing template drafts (API / UI)

If **Publish** on the Railway workspace templates page fails, see **[docs/railway-template-publish.md](./docs/railway-template-publish.md)** for GraphQL limits (`description` length, `traceId`, support path).

### Railway API token (local)

Template scripts read **`RAILWAY_TOKEN`** from a **`.env`** file in this repo root (via `scripts/load-railway-dotenv.mjs`). Copy **`.env.example`** to `.env` and paste your token. `.env` is gitignored — do not commit it.

### Template titles and metadata (marketplace display names)

Friendly software titles, images, descriptions, and expected published slugs live in each template repo as **`railway-template.json`** (see **[docs/railway-template-metadata.md](./docs/railway-template-metadata.md)**). Root scripts aggregate these via **`scripts/railway-template-targets.mjs`** (subset: `workspaceAutomation: true`). To rename Railway projects and recreate + republish templates so the marketplace uses those titles, run:

```bash
pnpm templates:display-names           # dry-run
pnpm templates:display-names:apply     # apply (destructive: deletes/recreates each template)
```
