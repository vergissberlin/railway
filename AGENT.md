# AGENT.md

## Purpose
This file defines project conventions for coding agents working in this repository.

## Scope
These rules apply to the whole workspace unless a deeper `AGENT.md` or `agent.md` in a subdirectory defines more specific rules for that scope.

## Core Conventions
- Use `pnpm` as the default package manager.
- Store credentials and local secrets in `.env` files (never hardcode secrets).
- Use Conventional Commits in English (for example: `feat:`, `fix:`, `docs:`, `chore:`).
- Write documentation in English.
- When adding new props, always update:
  - the related Type definitions
  - the corresponding documentation

## Railway Template Workflow
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

