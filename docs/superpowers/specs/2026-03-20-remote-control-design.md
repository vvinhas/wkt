# Remote Control: Non-Interactive Flag-Driven CLI

**Date:** 2026-03-20
**Status:** Approved

## Problem

All `wkt` commands require interactive TUI prompts via `@clack/prompts`. AI agents and automation scripts cannot drive the tool without a human at the keyboard.

## Solution

Add CLI flag support to every command. When flags are present, skip interactive prompts entirely and execute directly. Fail fast with an error if required flags are missing. No hybrid/partial mode.

## Design Decisions

- **Primary consumer:** AI agents and automation scripts
- **Missing flags behavior:** Fail fast with usage error and non-zero exit (no fallback to interactive)
- **Multi-project config (`wkt use`):** Uniform config across all selected projects. Agents call `wkt use` multiple times if different configs are needed per project.
- **VS Code workspace:** Skipped in flag mode unless `--workspace` flag is explicitly passed
- **Output format:** Plain text by default; `--json` flag for structured JSON output
- **No new dependencies**

## Flag Detection

If any flag (other than `--help`) is present in `argv`, the command runs in flag-driven mode. Otherwise, the existing interactive flow runs unchanged.

## Architecture

```
src/commands/<cmd>.ts
    |
    +-- has flags? --> parseFlags() --> inputs object
    |
    +-- no flags? --> @clack/prompts --> inputs object
    |
    v
    shared execution logic (same code path)
    |
    v
    output via src/lib/output.ts
```

Each command collects inputs into a plain object, then passes it to the same execution logic regardless of how inputs were gathered. No duplication of command logic.

## New Files

### `src/lib/flags.ts`

A `parseFlags` utility (~50 lines, no dependencies) that:

- Takes `process.argv.slice(3)` (after `wkt <command>`)
- Parses `--flag value`, `--flag=value`, and `--boolean-flag` (presence = true)
- Returns a typed object based on a schema the command provides
- Schema defines each flag's name, type (`string | boolean | string[]`), and whether it's required
- For `string[]`, accepts comma-separated values: `--projects server,client`
- If any required flag is missing, prints usage error and exits non-zero

### `src/lib/output.ts`

Output helpers:

- `success(data)` and `error(message, details?)` functions
- When `--json`: prints `{"success": true, "data": ...}` or `{"success": false, "error": "...", "code": N}` to stdout
- When not `--json`: plain text to stdout for success, stderr for errors

## Command Flag Schemas

### `wkt add`

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--alias` | string | yes | - | Folder name alias |
| `--label` | string | yes | - | Human-readable project name |
| `--path` | string | no | cwd | Repo path |
| `--start-cmds` | string[] | no | [] | Comma-separated start commands |

### `wkt remove`

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--alias` | string | yes | - | Which project to remove |
| `--yes` | boolean | no | true (in flag mode) | Skip confirmation |

### `wkt use`

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--projects` | string[] | yes | - | Comma-separated project aliases |
| `--branch` | string | yes | - | Branch name for all worktrees |
| `--base-branch` | string | no | each repo's current branch | Base branch |
| `--fetch` | boolean | no | false | Fetch origin first |
| `--run-start-cmds` | boolean | no | false | Run start commands |
| `--workspace` | boolean | no | false | Create/update VS Code workspace |
| `--open` | boolean | no | false | Open workspace in VS Code (requires --workspace) |

### `wkt config`

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--alias` | string | yes | - | Which project to configure |
| `--label` | string | no* | - | New label |
| `--start-cmds` | string[] | no* | - | New start commands (comma-separated) |

*At least one of `--label` or `--start-cmds` is required.

### `wkt list`

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--alias` | string | yes | - | Which project to list worktrees for |
| `--remove` | string | no | - | Path of worktree to remove |
| `--yes` | boolean | no | false | Skip removal confirmation |

### `wkt help`

No changes to behavior. Flag documentation added to help output.

## Exit Codes

- **0** — success
- **1** — user/input error (missing required flag, project not found, repo path doesn't exist)
- **2** — operation error (worktree creation failed, git fetch failed, etc.)

In flag-driven mode, errors throw and are caught at the command's top level. No `process.exit` mid-flow.

## Modified Files

- `src/commands/add.ts` — add flag-driven input path
- `src/commands/remove.ts` — add flag-driven input path
- `src/commands/use.ts` — add flag-driven input path
- `src/commands/config.ts` — add flag-driven input path
- `src/commands/list.ts` — add flag-driven input path
- `src/commands/help.ts` — document flags in help output
- `src/index.ts` — pass `--json` detection downstream

## Unchanged Files

- `src/lib/config.ts` — core config logic stays as-is
- `src/lib/git.ts` — git operations stay as-is
- `src/lib/utils.ts` — utilities stay as-is
- `src/types.ts` — types stay as-is
