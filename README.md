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
- `railwayapp-email`
- `railwayapp-gitlab`
- `railwayapp-grafana`
- `railwayapp-homeassistant`
- `railwayapp-influxdb`
- `railwayapp-mqtt`
- `railwayapp-nodered`
- `railwayapp-opensearch`
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
