import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig } from "../lib/config.ts";
import { listWorktrees, removeWorktree } from "../lib/git.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface ClearInputs {
  alias: string;
  worktreePath: string;
}

interface ClearResult {
  removed: string;
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
  { name: "path", type: "string", required: true },
];

export function executeClear(inputs: ClearInputs): ClearResult {
  const config = loadConfig();
  const project = config.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }
  removeWorktree(project.path, inputs.worktreePath);
  return { removed: inputs.worktreePath };
}

export async function clear(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const result = executeClear({
        alias: flags.alias as string,
        worktreePath: flags.path as string,
      });
      console.log(formatSuccess(`Worktree removed: ${result.removed}`, result as unknown as Record<string, unknown>));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes("not found") ? 1 : 2;
      console.error(formatError(msg, code));
      process.exit(code);
    }
    return;
  }

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Clear Worktree`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = config.projects[alias];
  if (!project) {
    p.cancel("Project not found.");
    process.exit(1);
  }

  const worktrees = listWorktrees(project.path).filter((wt) => !wt.isMain);

  if (worktrees.length === 0) {
    p.outro(`No active worktrees for ${pc.bold(project.label)}.`);
    return;
  }

  const toRemove = await p.select({
    message: "Which worktree to remove?",
    options: worktrees.map((wt) => ({
      value: wt.path,
      label: `${wt.path} (${wt.branch})`,
    })),
  });
  if (p.isCancel(toRemove)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const confirmed = await p.confirm({
    message: `Remove worktree at ${toRemove}?`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Removing worktree...");
  try {
    removeWorktree(project.path, toRemove);
    s.stop(`${pc.green("✓")} Worktree removed`);
  } catch (e) {
    s.stop(`${pc.red("✗")} Failed to remove worktree`);
    p.log.error(e instanceof Error ? e.message : String(e));
  }

  p.outro("Done");
}
