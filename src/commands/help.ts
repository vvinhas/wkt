import pc from "picocolors";

export function help() {
  console.log(`
${pc.bgCyan(pc.black(" wkt "))} Interactive Git Worktree Manager

${pc.bold("Usage:")} wkt <command>

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
`);
}
