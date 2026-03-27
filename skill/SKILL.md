---
name: wkt
description: Use when creating git worktrees for multi-repo development, setting up isolated workspaces for features or initiatives, or managing worktree lifecycle (create, list, remove). Triggers include "create worktree", "set up workspace", "wkt", or when working across multiple repositories simultaneously.
allowed-tools: Bash
---

# wkt - Git Worktree Manager

Non-interactive CLI for creating and managing git worktrees across multiple repositories.

## Quick Reference

All commands support `--json` for structured JSON output. Pass flags to skip interactive prompts.

| Command | Purpose | Required Flags |
|---------|---------|----------------|
| `wkt add` | Register a repo as a project | `--alias`, `--label` |
| `wkt remove` | Unregister a project | `--alias` |
| `wkt use` | Create a worktree | `--project`, `--branch` |
| `wkt config` | Update project settings | `--alias` + `--label` or `--start-cmds` |
| `wkt list` | List active worktrees | `--alias` |
| `wkt clear` | Remove a worktree | `--alias`, `--path` |

## Commands

### Register a project

```bash
wkt add --url <url> [--alias <name>] [--label <name>] [--start-cmds <cmds>] [--json]
```

- `--url`: Git repository URL to clone (clones to `~/.wkt/repos/`)
- `--alias`: Folder name (letters, numbers, hyphens, underscores only; default: derived from URL)
- `--label`: Human-readable name (default: derived from URL)
- `--start-cmds`: Comma-separated setup commands (e.g. `"npm install,npm run build"`)

### Create a worktree

```bash
wkt use --project <name> --branch <name> [--base-branch <name>] [--fetch] [--run-start-cmds] [--json]
```

- `--project`: Single project alias
- `--branch`: Branch name for the worktree
- `--base-branch`: Base branch (default: repo's current branch)
- `--fetch`: Fetch origin before creating
- `--run-start-cmds`: Run project's start commands after creation

Run from the initiative directory. The worktree is created as a subdirectory named by alias.

Note: Interactive mode (`wkt use` without flags) still supports selecting multiple projects and offers VS Code workspace creation.

### List worktrees

```bash
wkt list --alias <name> [--json]
```

Lists active worktrees for a project.

### Remove a worktree

```bash
wkt clear --alias <name> --path <worktree-path> [--json]
```

Removes a specific worktree.

### Remove a project

```bash
wkt remove --alias <name> [--json]
```

Removes project registration. Does not delete repos or worktrees.

### Update project config

```bash
wkt config --alias <name> [--label <name>] [--start-cmds <cmds>] [--json]
```

At least one of `--label` or `--start-cmds` required.

## JSON Output

Add `--json` to any command for structured output:

```json
// Success
{"success": true, "data": {...}}

// Error
{"success": false, "error": "message", "code": 1}
```

Exit codes: `0` success, `1` input error, `2` operation error.

## Typical Agent Workflow

```bash
# 1. Register repos (one-time, clones to ~/.wkt/repos/)
wkt add --url https://github.com/you/backend.git --alias backend --label "Backend API" --start-cmds "npm install" --json
wkt add --url https://github.com/you/frontend.git --alias frontend --label "Frontend App" --start-cmds "npm install" --json

# 2. Create worktrees for a feature (from initiative directory)
mkdir ~/work/feature-x && cd ~/work/feature-x
wkt use --project backend --branch feat/feature-x --fetch --run-start-cmds --json
wkt use --project frontend --branch feat/feature-x --fetch --run-start-cmds --json

# 3. Work in the worktrees
# ~/work/feature-x/backend/  and  ~/work/feature-x/frontend/

# 4. Clean up
wkt clear --alias backend --path ~/work/feature-x/backend --json
wkt clear --alias frontend --path ~/work/feature-x/frontend --json
```

## Config Location

Projects are stored in `~/.wkt/config.json`. Cloned repos live in `~/.wkt/repos/`.
