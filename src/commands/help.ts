import pc from "picocolors";

export function help() {
  console.log(`
${pc.bgCyan(pc.black(" wkt "))} Interactive Git Worktree Manager

${pc.bold("Usage:")} wkt <command> [flags]

${pc.bold("Commands:")}
  ${pc.cyan("add")}      Clone a repo and register it as a project
  ${pc.cyan("remove")}   Remove a saved project
  ${pc.cyan("use")}      Select projects, configure branches, create worktrees
  ${pc.cyan("config")}   Update a project's label or start commands
  ${pc.cyan("list")}     View active worktrees for a project
  ${pc.cyan("clear")}    Remove a worktree
  ${pc.cyan("cleanup")}  Remove all worktrees in a workspace (and optionally the folder)
  ${pc.cyan("sync")}     Sync each worktree in a workspace against an origin base branch
  ${pc.cyan("link-claude")}    Bundle a worktree's .claude/ as a project-scoped Claude plugin
  ${pc.cyan("unlink-claude")}  Reverse of link-claude
  ${pc.cyan("help")}     Show this help message

${pc.bold("Getting started:")}
  1. Run ${pc.cyan("wkt add")} with a repo URL to clone and register it
  2. ${pc.dim("cd")} to your initiative directory and run ${pc.cyan("wkt use")}
  3. Use ${pc.cyan("wkt list")} to view worktrees, ${pc.cyan("wkt clear")} to remove them

${pc.bold("Non-interactive mode:")}
  Pass flags to skip interactive prompts (for scripts/agents).
  Add ${pc.cyan("--json")} for structured JSON output.

  ${pc.cyan("wkt add")}    --url <url> [--alias <name>] [--label <name>] [--start-cmds <cmds>]
  ${pc.cyan("wkt remove")} --alias <name>
  ${pc.cyan("wkt use")}    --project <name> --branch <name> [--base-branch <name>]
               [--fetch] [--run-start-cmds] [--link-claude]
  ${pc.cyan("wkt config")} --alias <name> [--label <name>] [--start-cmds <cmds>]
  ${pc.cyan("wkt list")}   --alias <name>
  ${pc.cyan("wkt clear")}  --alias <name> --path <worktree-path>
  ${pc.cyan("wkt cleanup")} --dir <path> [--force] [--delete-workspace]
  ${pc.cyan("wkt sync")}    [--dir <path>] --strategy rebase|merge --base-branch <name>
                [--new-branch <name>]
  ${pc.cyan("wkt link-claude")}    [--dir <path>] (--project <name> | --all)
  ${pc.cyan("wkt unlink-claude")}  [--dir <path>] (--project <name> | --all)
`);
}
