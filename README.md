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
