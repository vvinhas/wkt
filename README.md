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
# 1. Add repos by URL (clones to ~/.wkt/repos/)
wkt add   # prompts for URL, or:
wkt add --url https://github.com/you/my-api.git
wkt add --url git@github.com:you/my-frontend.git

# 2. Create worktrees for a feature
wkt use --dir ~/features/login-redesign
# or: cd into an existing dir first, then run `wkt use`

# 3. View and manage worktrees
wkt list    # view active worktrees
wkt clear   # remove a worktree
```

## Commands

Every command works in two modes: **interactive** (no flags, TUI prompts) and **non-interactive** (all options as flags, for scripts and AI agents).

For `wkt use`, flags other than `--project` (`--dir`, `--branch`, `--base-branch`, `--fetch`, `--run-start-cmds`) can also be mixed with interactive mode -- any flag you pass pre-fills and skips its matching prompt.

| Command | Description | Non-interactive flags |
|---------|-------------|----------------------|
| `add` | Clone a repo and register it as a project | `--url <url> [--alias <name>] [--label <name>] [--start-cmds <a,b>]` |
| `remove` | Remove a saved project | `--alias <name>` |
| `use` | Create worktrees for selected projects | `--project <name> --branch <name> [--base-branch <name>] [--fetch] [--run-start-cmds] [--dir <path>]` |
| `config` | Update a project's label or start commands | `--alias <name> [--label <name>] [--start-cmds <a,b>]` |
| `list` | View active worktrees for a project | `--alias <name>` |
| `clear` | Remove a worktree | `--alias <name> --path <worktree-path>` |
| `help` | Show help message | |

### Examples

```bash
# Non-interactive: clone and register a project
wkt add --url https://github.com/you/api.git --alias api --label "Backend API" --start-cmds "bun install"

# Non-interactive: create a worktree for a project
wkt use --project api --branch feat/login --base-branch main --fetch

# Non-interactive: place the worktree in a specific directory (created if missing)
wkt use --project api --branch feat/login --dir ~/features/login-redesign

# Non-interactive: list worktrees
wkt list --alias api

# Non-interactive: remove a worktree
wkt clear --alias api --path /path/to/worktree
```

## JSON Output

Add `--json` to any command for structured output, useful for scripting:

```bash
wkt use --project api --branch feat/login --json
```

```json
{"success": true, "data": {"created": "api", "worktreePath": "/path/to/worktree/api"}}
```

Error responses follow the same shape:

```json
{"success": false, "error": "Project alias \"api\" not found in config.", "code": 2}
```

## Configuration

Config is stored at `~/.wkt/config.json`. Cloned repos live in `~/.wkt/repos/`.

```json
{
  "projects": {
    "api": {
      "path": "/Users/you/.wkt/repos/api",
      "label": "Backend API",
      "startCommands": ["bun install"],
      "url": "https://github.com/you/api.git"
    }
  }
}
```

Each project has:

- **path** -- absolute path to the cloned repo
- **label** -- display name shown in prompts
- **alias** -- the key in the config (also used as the worktree folder name)
- **startCommands** -- commands to run after creating a worktree (e.g., install dependencies)
- **url** -- the original clone URL

## VS Code Workspace

In interactive mode, `wkt use` can generate a `.code-workspace` file that includes all created worktrees as folders and optionally open it in VS Code.

## Requirements

- [Bun](https://bun.sh) (runtime)
- [Git](https://git-scm.com)

## License

[MIT](LICENSE)
