# `.agents` — shared instructions for coding agents

Everything an AI coding agent needs in this repository lives here, in one place, regardless of
which tool reads it.

```
.agents/
├── rules/    Repository rules (Cursor `.mdc` format: description / globs / alwaysApply)
└── skills/   Claude Code skills (one directory per skill, each with a SKILL.md)
```

## Why the tool directories are symlinks

Both editors discover their configuration at a fixed path — Claude Code at
`.claude/skills/<name>/SKILL.md`, Cursor at `.cursor/rules/*.mdc`. Simply moving the files here
would leave both tools with nothing to read.

So the content lives in `.agents/` and the tool paths are symlinks into it:

| Path | Points at |
| --- | --- |
| `.claude/skills` | `../.agents/skills` |
| `.cursor/rules` | `../.agents/rules` |

Git stores these as real symlinks (mode `120000`), so a clone reproduces them. There is exactly one
copy of every file — edit it under `.agents/`, or through either symlink; it is the same file.

On Windows, symlinks in a checkout require either Developer Mode or
`git config --global core.symlinks true`. Without that, git materialises them as plain text files
containing the target path and the tools stop finding their config. That is the one cost of this
layout; the alternative — duplicated copies per tool — guarantees drift instead.

## Scope

`.agents/` holds instructions that are *specific to this repository and to agents*. It deliberately
does not absorb:

- **`AGENT.md`** (repo root, and one per template repo) — the conventions humans read too. Agents
  are told to read it first; it stays where it is discoverable without knowing about `.agents/`.
- **`docs/`** — product documentation that happens to be useful to agents. If a human would look
  for it there, it belongs there.

## Adding to this directory

- **A rule** → `rules/<topic>.mdc` with Cursor frontmatter (`description`, `globs`, `alwaysApply`).
  Keep rules narrow and give the reasoning, so an agent can tell when a rule does not apply.
- **A skill** → `skills/<kebab-name>/SKILL.md`. The directory name must equal the `name` in the
  frontmatter, and the frontmatter carries only `name` and `description`. Put a deliberately
  trigger-rich `description` there: it is the only part always in context, so it decides whether
  the skill fires at all. Supporting material goes in `references/` next to the `SKILL.md`.
