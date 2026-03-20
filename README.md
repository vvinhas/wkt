# wkt

Interactive Git Worktree Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it does

`wkt` manages git worktrees across multiple repositories from a single command. Register your repos once, then create worktrees for all of them in one step -- each checked out to the same branch, ready to work on in parallel.

Worktrees let you work on multiple branches simultaneously without stashing or cloning. `wkt` makes this practical across many repos at once.

## Installation

Requires [Bun](https://bun.sh).

```bash
# From npm (scoped package)
bun install -g @vvinhas/wkt

# Or directly from GitHub
bun install -g github:vvinhas/wkt

# Or clone and link locally
git clone https://github.com/vvinhas/wkt.git
cd wkt && bun install && bun link
```

## Quick Start

```bash
# 1. Register repos (run from inside each git repo)
cd ~/code/my-api
wkt add

cd ~/code/my-frontend
wkt add

# 2. Create worktrees for a feature
mkdir ~/features/login-redesign && cd ~/features/login-redesign
wkt use

# 3. Manage existing worktrees
wkt list
```

## Commands

Every command works in two modes: **interactive** (no flags, TUI prompts) and **non-interactive** (all options as flags, for scripts and AI agents).

| Command | Description | Non-interactive flags |
|---------|-------------|----------------------|
| `add` | Register current repo as a project | `--alias <name> --label <name> [--path <dir>] [--start-cmds <a,b>]` |
| `remove` | Remove a saved project | `--alias <name>` |
| `use` | Create worktrees for selected projects | `--projects <a,b> --branch <name> [--base-branch <name>] [--fetch] [--run-start-cmds] [--workspace] [--open]` |
| `config` | Update a project's label or start commands | `--alias <name> [--label <name>] [--start-cmds <a,b>]` |
| `list` | View or remove worktrees for a project | `--alias <name> [--remove <path>] [--yes]` |
| `help` | Show help message | |

### Examples

```bash
# Non-interactive: register a project
wkt add --alias api --label "Backend API" --start-cmds "bun install"

# Non-interactive: create worktrees for two projects
wkt use --projects api,web --branch feat/login --base-branch main --fetch --workspace --open

# Non-interactive: list worktrees
wkt list --alias api

# Non-interactive: remove a worktree
wkt list --alias api --remove /path/to/worktree --yes
```

## JSON Output

Add `--json` to any command for structured output, useful for scripting:

```bash
wkt use --projects api --branch feat/login --json
```

```json
{"success": true, "data": {"created": ["api"], "errors": []}}
```

Error responses follow the same shape:

```json
{"success": false, "error": "Project alias \"api\" not found in config.", "code": 2}
```

## Configuration

Config is stored at `~/.config/wkt/config.json`.

```json
{
  "projects": {
    "api": {
      "path": "/Users/you/code/my-api",
      "label": "Backend API",
      "startCommands": ["bun install"]
    }
  }
}
```

Each project has:

- **path** -- absolute path to the git repo root
- **label** -- display name shown in prompts
- **alias** -- the key in the config (also used as the worktree folder name)
- **startCommands** -- commands to run after creating a worktree (e.g., install dependencies)

## VS Code Workspace

When using `wkt use`, you can generate a `.code-workspace` file that includes all created worktrees as folders. Use `--workspace` to create/update the file, or `--open` to also open it in VS Code.

## Requirements

- [Bun](https://bun.sh) (runtime)
- [Git](https://git-scm.com)

## License

[MIT](LICENSE)
