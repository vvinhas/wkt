import pc from "picocolors";

export function help() {
  console.log(`
${pc.bgCyan(pc.black(" wkt "))} Interactive Git Worktree Manager

${pc.bold("Usage:")} wkt <command> [flags]

${pc.bold("Commands:")}
  ${pc.cyan("add")}      Register current repo as a project
  ${pc.cyan("remove")}   Remove a saved project
  ${pc.cyan("use")}      Select projects, configure branches, create worktrees
  ${pc.cyan("config")}   Update a project's label or start commands
  ${pc.cyan("list")}     View or destroy worktrees for a project
  ${pc.cyan("help")}     Show this help message

${pc.bold("Getting started:")}
  1. ${pc.dim("cd")} into a git repo and run ${pc.cyan("wkt add")} to register it
  2. ${pc.dim("cd")} to your initiative directory and run ${pc.cyan("wkt use")}
  3. Use ${pc.cyan("wkt list")} to manage existing worktrees

${pc.bold("Non-interactive mode:")}
  Pass flags to skip interactive prompts (for scripts/agents).
  Add ${pc.cyan("--json")} for structured JSON output.

  ${pc.cyan("wkt add")}    --alias <name> --label <name> [--path <dir>] [--start-cmds <cmds>]
  ${pc.cyan("wkt remove")} --alias <name>
  ${pc.cyan("wkt use")}    --projects <a,b> --branch <name> [--base-branch <name>]
               [--fetch] [--run-start-cmds] [--workspace] [--open]
  ${pc.cyan("wkt config")} --alias <name> [--label <name>] [--start-cmds <cmds>]
  ${pc.cyan("wkt list")}   --alias <name> [--remove <path>] [--yes]
`);
}
