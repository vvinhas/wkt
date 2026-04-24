import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  getWorktreeStatus,
  pruneWorktrees,
  removeWorktree,
} from "../lib/git.ts";
import {
  discoverWorkspaces,
  findWorkspace,
  type WorkspaceEntry,
  type WorkspaceWorktree,
} from "../lib/cleanup.ts";
import {
  extractGlobalFlags,
  hasFlags,
  parseFlags,
  type FlagSchema,
  type GlobalFlagSchema,
} from "../lib/flags.ts";
import { formatError, formatSuccess } from "../lib/output.ts";

export interface CleanupInputs {
  dir: string;
  force: boolean;
  deleteWorkspace: boolean;
}

export interface RemovedWorktreeRecord {
  alias: string;
  path: string;
  branch: string;
  forced: boolean;
}

export interface CleanupResult {
  workspaceDir: string;
  removedWorktrees: RemovedWorktreeRecord[];
  workspaceDeleted: boolean;
}

type Classification = "clean" | "dirty" | "locked" | "missing";

interface ClassifiedWorktree {
  worktree: WorkspaceWorktree;
  classification: Classification;
  dirtyCount: number;
}

function classifyWorktrees(worktrees: WorkspaceWorktree[]): ClassifiedWorktree[] {
  return worktrees.map((wt) => {
    if (!existsSync(wt.path)) {
      return { worktree: wt, classification: "missing" as const, dirtyCount: 0 };
    }
    if (wt.locked) {
      return { worktree: wt, classification: "locked" as const, dirtyCount: 0 };
    }
    const status = getWorktreeStatus(wt.path);
    if (status.dirty) {
      return { worktree: wt, classification: "dirty" as const, dirtyCount: status.dirtyCount };
    }
    return { worktree: wt, classification: "clean" as const, dirtyCount: 0 };
  });
}

/**
 * Non-interactive core.
 * Throws for user/config errors (no match, dirty-without-force).
 * Throws for operation errors (git remove failures, fs failures).
 */
export function executeCleanup(inputs: CleanupInputs): CleanupResult {
  const absDir = resolve(inputs.dir);
  const matches = findWorkspace({ dir: absDir });

  if (matches.length === 0) {
    throw new Error(`No worktrees found in directory "${absDir}"`);
  }

  const workspace = matches[0]!;
  const classified = classifyWorktrees(workspace.worktrees);

  const unclean = classified.filter(
    (c) => c.classification === "dirty" || c.classification === "locked",
  );
  if (unclean.length > 0 && !inputs.force) {
    const list = unclean
      .map((c) => `${c.worktree.alias} (${c.classification})`)
      .join(", ");
    throw new Error(
      `Cannot remove dirty/locked worktrees: ${list}. Re-run with --force.`,
    );
  }

  const removed: RemovedWorktreeRecord[] = [];
  const projectsWithMissing = new Set<string>();

  for (const c of classified) {
    if (c.classification === "missing") {
      projectsWithMissing.add(c.worktree.projectPath);
      continue;
    }
    const forced = c.classification === "dirty" || c.classification === "locked";
    removeWorktree(c.worktree.projectPath, c.worktree.path, { force: forced });
    removed.push({
      alias: c.worktree.alias,
      path: c.worktree.path,
      branch: c.worktree.branch,
      forced,
    });
  }

  for (const projectPath of projectsWithMissing) {
    pruneWorktrees(projectPath);
  }

  let workspaceDeleted = false;
  if (inputs.deleteWorkspace) {
    if (existsSync(workspace.workspaceDir)) {
      rmSync(workspace.workspaceDir, { recursive: true, force: true });
    }
    workspaceDeleted = true;
  }

  return { workspaceDir: workspace.workspaceDir, removedWorktrees: removed, workspaceDeleted };
}

const globalSchema: GlobalFlagSchema[] = [
  { name: "dir", type: "string" },
  { name: "force", type: "boolean" },
  { name: "delete-workspace", type: "boolean" },
];

const flagSchema: FlagSchema[] = [
  { name: "dir", type: "string", required: true },
  { name: "force", type: "boolean", required: false },
  { name: "delete-workspace", type: "boolean", required: false },
];

function formatWorktreeLine(wt: WorkspaceWorktree): string {
  return `  - ${pc.bold(wt.alias)}  (${pc.dim(wt.branch)})  ${pc.dim(wt.path)}`;
}

export async function cleanup(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const result = executeCleanup({
        dir: flags.dir as string,
        force: (flags.force as boolean) ?? false,
        deleteWorkspace: (flags["delete-workspace"] as boolean) ?? false,
      });
      console.log(
        formatSuccess(`Cleaned up workspace: ${result.workspaceDir}`, {
          workspaceDir: result.workspaceDir,
          removed: result.removedWorktrees,
          workspaceDeleted: result.workspaceDeleted,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes("No worktrees found") ? 1 : 2;
      console.error(formatError(msg, code));
      process.exit(code);
    }
    return;
  }

  // Interactive: positional name, no flags.
  const { rest } = extractGlobalFlags(argv, globalSchema);
  const name = rest.find((a) => !a.startsWith("--"));

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Cleanup Workspace`);

  if (!name) {
    p.cancel("Usage: wkt cleanup <name>");
    process.exit(2);
  }

  const workspaces = discoverWorkspaces();
  const matches = findWorkspace({ name }, workspaces);

  if (matches.length === 0) {
    p.outro(`No workspace named "${name}" found.`);
    return;
  }

  let workspace: WorkspaceEntry;
  if (matches.length === 1) {
    workspace = matches[0]!;
  } else {
    const picked = await p.select({
      message: `Multiple workspaces named "${name}" found. Pick one:`,
      options: matches.map((m) => ({ value: m.workspaceDir, label: m.workspaceDir })),
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    workspace = matches.find((m) => m.workspaceDir === picked)!;
  }

  p.log.info(`${pc.dim("workspace")}  ${pc.dim(workspace.workspaceDir)}`);
  p.log.message(
    `${workspace.worktrees.length} worktree${workspace.worktrees.length !== 1 ? "s" : ""} will be removed:\n` +
      workspace.worktrees.map(formatWorktreeLine).join("\n"),
  );

  const proceed = await p.confirm({ message: "Proceed?", initialValue: false });
  if (p.isCancel(proceed) || !proceed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const classified = classifyWorktrees(workspace.worktrees);
  const unclean = classified.filter(
    (c) => c.classification === "dirty" || c.classification === "locked",
  );

  let useForce = false;
  if (unclean.length > 0) {
    const uncleanLines = unclean
      .map((c) => {
        if (c.classification === "dirty") {
          return `  - ${pc.bold(c.worktree.alias)}  ${pc.yellow("dirty")}  (${c.dirtyCount} change${c.dirtyCount !== 1 ? "s" : ""})`;
        }
        return `  - ${pc.bold(c.worktree.alias)}  ${pc.yellow("locked")}`;
      })
      .join("\n");
    p.log.warning("These worktrees can't be removed cleanly:\n" + uncleanLines);
    const force = await p.confirm({ message: "Force remove?", initialValue: false });
    if (p.isCancel(force) || !force) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    useForce = true;
  }

  const s = p.spinner();
  s.start("Removing worktrees...");
  const projectsWithMissing = new Set<string>();
  const removed: RemovedWorktreeRecord[] = [];
  try {
    for (const c of classified) {
      if (c.classification === "missing") {
        projectsWithMissing.add(c.worktree.projectPath);
        continue;
      }
      const forced = useForce && (c.classification === "dirty" || c.classification === "locked");
      removeWorktree(c.worktree.projectPath, c.worktree.path, { force: forced });
      removed.push({
        alias: c.worktree.alias,
        path: c.worktree.path,
        branch: c.worktree.branch,
        forced,
      });
    }
    for (const projectPath of projectsWithMissing) {
      pruneWorktrees(projectPath);
    }
    s.stop(`${pc.green("✓")} Removed ${removed.length} worktree${removed.length !== 1 ? "s" : ""}`);
  } catch (e) {
    s.stop(`${pc.red("✗")} Failed removing worktrees`);
    p.log.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const deleteFolder = await p.confirm({
    message: `Also delete the workspace folder? ${pc.dim(workspace.workspaceDir)}`,
    initialValue: false,
  });
  if (p.isCancel(deleteFolder) || !deleteFolder) {
    p.outro("Done");
    return;
  }

  if (process.cwd().startsWith(workspace.workspaceDir)) {
    p.log.warning(
      `Your shell is inside ${workspace.workspaceDir}. After deletion, cd somewhere else.`,
    );
  }

  try {
    if (existsSync(workspace.workspaceDir)) {
      rmSync(workspace.workspaceDir, { recursive: true, force: true });
    }
    p.outro(`${pc.green("✓")} Deleted ${workspace.workspaceDir}`);
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
